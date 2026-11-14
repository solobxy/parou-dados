// Motor do jogo: regras puras, sem rede nem base de dados.
// Cada ação recebe o jogador, o instante (ms, hora do servidor), o "mundo" (ronda)
// e, quando há sorte envolvida, um gerador aleatório. Tudo em inteiros.

import { CFG, T } from './config.js';

export class GameError extends Error {
  constructor(code, extra = {}) { super(code); this.code = code; Object.assign(this, extra); }
}
const fail = (code, extra) => { throw new GameError(code, extra); };
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const STATS = ['F', 'T', 'I', 'C'];

// ---------- criação ----------

export function newPlayer(id, now, world, opts = {}) {
  const st = CFG.start.stat;
  const stats = { F: st, T: st, I: st, C: st, ...(opts.stats || {}) };
  const late = now - world.start >= CFG.round.lateJoinAfterMs;
  return {
    id, joinedAt: now, t: now,
    stats,
    energy: CFG.energy.max, energyT: now,
    addiction: 0, addictionT: now,
    cash: CFG.start.cash, bank: 0,
    respect: 0, respectAt: now, peakRespect: 0,
    jailUntil: 0, jailTier: 0,
    hospUntil: 0, protectUntil: 0, capUntil: 0,
    shieldUntil: late ? now + CFG.round.newbieShieldMs : 0,
    hospTimes: [],
    hits: new Map(),
    biz: CFG.biz.map(() => ({ n: 0, stored: 0, rem: 0, t: now })),
    port: [],
    weapon: -1, armor: -1,
    luxuries: 0,
    detoxT: [],
    xp: { F: 0, I: 0, C: 0 },
    wk: CFG.crimes.map(() => 0),   // sucessos por golpe (mestria)
    c: { crimes: 0, wins: 0, trains: 0, refills: 0, collects: 0, pvpWins: 0, ports: 0 },
    mi: 0,                         // próximo objetivo por receber
  };
}

// jogadores gravados antes de uma regra nova ganham os campos que faltam
function migrate(p) {
  if (!Array.isArray(p.detoxT)) p.detoxT = [];
  if (!p.xp) p.xp = { F: 0, I: 0, C: 0 };
  if (!Array.isArray(p.wk)) p.wk = CFG.crimes.map(() => 0);
  if (!p.c) p.c = { crimes: 0, wins: 0, trains: 0, refills: 0, collects: 0, pvpWins: 0, ports: 0 };
  if (!Number.isSafeInteger(p.mi)) p.mi = 0;
}

// ---------- tempo ----------

function syncEnergy(p, now) {
  const { max, regenMs } = CFG.energy;
  if (p.energy >= max) { p.energyT = now; return; }
  const ticks = Math.floor((now - p.energyT) / regenMs);
  if (ticks <= 0) return;
  const gain = Math.min(ticks, max - p.energy);
  p.energy += gain;
  p.energyT = p.energy >= max ? now : p.energyT + gain * regenMs;
}

function syncAddiction(p, now) {
  const { decayMs } = CFG.addiction;
  if (p.addiction <= 0) { p.addiction = 0; p.addictionT = now; return; }
  const ticks = Math.floor((now - p.addictionT) / decayMs);
  if (ticks <= 0) return;
  const dec = Math.min(ticks, p.addiction);
  p.addiction -= dec;
  p.addictionT = p.addiction === 0 ? now : p.addictionT + dec * decayMs;
}

// põe o jogador em dia até "now" (nunca anda para trás no tempo)
export function touch(p, now) {
  if (!Number.isSafeInteger(now)) fail('BAD_TIME');
  if (now < p.t) fail('TIME_BACKWARDS');
  migrate(p);
  syncEnergy(p, now);
  syncAddiction(p, now);
  if (p.addiction > addictionCap(p)) p.addiction = addictionCap(p); // limite mudou nas regras
  if (p.jailUntil && p.jailUntil <= now) { p.jailUntil = 0; p.jailTier = 0; }
  if (p.hospUntil && p.hospUntil <= now) p.hospUntil = 0;
  p.t = now;
}

function inRound(world, now) {
  if (now < world.start || now >= world.playEnd) fail('ROUND_CLOSED');
}

function begin(p, now, world, { allowBusy = false } = {}) {
  inRound(world, now);
  touch(p, now);
  if (!allowBusy) {
    if (p.jailUntil > now) fail('IN_JAIL', { until: p.jailUntil });
    if (p.hospUntil > now) fail('IN_HOSPITAL', { until: p.hospUntil });
  }
}

// ---------- utilidades ----------

export function level(p) {
  const L = CFG.levels;
  let lo = 0, hi = L.length - 1;
  const r = p.peakRespect ?? p.respect;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (L[mid] <= r) lo = mid; else hi = mid - 1; }
  return lo + 1;
}

export function addictionCap(p) { return CFG.addiction.base + Math.floor(p.stats.T / CFG.addiction.perT); }

function addRespect(p, delta, now) {
  if (delta === 0) return null;
  const before = level(p);
  p.respect = Math.max(0, p.respect + delta);
  if (p.respect > p.peakRespect) p.peakRespect = p.respect;
  p.respectAt = now;
  const after = level(p);
  if (after > before && p.energy < CFG.energy.max) { p.energy = CFG.energy.max; p.energyT = now; } // subir de nível enche a energia
  return after !== before ? { from: before, to: after } : null;
}

function pay(p, amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) fail('BAD_AMOUNT');
  if (p.cash + p.bank < amount) fail('NO_MONEY', { need: amount, have: p.cash + p.bank });
  const fromCash = Math.min(p.cash, amount);
  p.cash -= fromCash;
  p.bank -= amount - fromCash;
}

export function chanceBp(S, D) {
  const { minBp, maxBp } = CFG.chance;
  if (S <= 0) return minBp;
  const s2 = S * S, d2 = D * D;
  return clamp(Math.floor((10000 * s2) / (s2 + d2)), minBp, maxBp);
}

export function crimeScore(p, k) {
  const { w } = CFG.crimes[k];
  const s = p.stats;
  return Math.floor((w.I * s.I + w.F * s.F + w.C * s.C) / 100);
}

export function crimeChanceBp(p, k) { return chanceBp(crimeScore(p, k), CFG.crimes[k].D); }

export function crimeUnlocked(p, k) { return k === 0 || crimeChanceBp(p, k) >= CFG.unlockBp; }

// ---------- crimes ----------

// ---------- prática ----------

export function practiceNeed(p, s) { return CFG.practice.base + CFG.practice.perStat * p.stats[s]; }

// devolve as stats que subiram, ex.: { C: 1 }
function practice(p, c, success) {
  const gained = {};
  for (const s of ['F', 'I', 'C']) {
    if (!c.w[s]) continue;
    let xp = c.e * c.w[s];
    if (!success) xp = Math.floor((xp * CFG.practice.failBp) / 10000);
    p.xp[s] += xp;
    let need = practiceNeed(p, s);
    while (p.xp[s] >= need) {
      p.xp[s] -= need; p.stats[s] += 1; gained[s] = (gained[s] || 0) + 1;
      need = practiceNeed(p, s);
    }
  }
  return gained;
}

export function masteryStars(p, k) {
  const n = p.wk[k]; let s = 0;
  for (const at of CFG.mastery.at) if (n >= at) s++;
  return s;
}

export function doCrime(p, now, world, k, rng) {
  const c = Number.isInteger(k) ? CFG.crimes[k] : undefined;
  if (!c) fail('NO_CRIME');
  begin(p, now, world);
  if (!crimeUnlocked(p, k)) fail('LOCKED');
  if (p.energy < c.e) fail('NO_ENERGY', { need: c.e });
  const bp = crimeChanceBp(p, k);
  p.energy -= c.e;
  // o primeiro carteirista de quem ainda não tem respeito nenhum corre sempre bem: a primeira jogada não pode ser a prisão
  const first = k === 0 && p.peakRespect === 0;
  if (first || rng.chance(bp)) {
    const starsBefore = masteryStars(p, k);
    let money = Math.floor((rng.int(c.min, c.max) * (10000 + CFG.mastery.bonusBp * starsBefore)) / 10000);
    const crit = rng.chance(CFG.crit.chanceBp);
    if (crit) money *= CFG.crit.mult;
    p.cash += money;
    p.c.crimes += 1; p.c.wins += 1; p.wk[k] += 1;
    const stars = masteryStars(p, k);
    const lvl = addRespect(p, c.r, now);
    const gained = practice(p, c, true);
    return { ok: true, success: true, money, crit, respect: c.r, levelUp: lvl, chanceBp: bp, gained, newChanceBp: crimeChanceBp(p, k), star: stars > starsBefore ? stars : 0 };
  }
  p.c.crimes += 1;
  // falhar não é sempre prisão: só uma parte das falhas acaba com a polícia
  const busted = rng.chance(CFG.bustBp);
  if (busted) { p.jailUntil = now + c.jailMin * T.MIN; p.jailTier = k + 1; }
  const gained = practice(p, c, false);
  return { ok: true, success: false, busted, jailUntil: p.jailUntil, chanceBp: bp, gained, newChanceBp: crimeChanceBp(p, k) };
}

export function bailCost(p, now) {
  if (!(p.jailUntil > now)) return 0;
  const c = CFG.crimes[p.jailTier - 1];
  const left = p.jailUntil - now, total = c.jailMin * T.MIN;
  const full = Math.floor(((c.min + c.max) / 2) * CFG.bailBp / 10000);
  return Math.max(1, Math.ceil((full * Math.min(left, total)) / total));
}

export function payBail(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  if (!(p.jailUntil > now)) fail('NOT_IN_JAIL');
  const cost = bailCost(p, now);
  pay(p, cost);
  p.jailUntil = 0; p.jailTier = 0;
  return { ok: true, cost };
}

export function medicCost(p, now) {
  if (!(p.hospUntil > now)) return 0;
  const mins = Math.ceil((p.hospUntil - now) / T.MIN);
  return mins * CFG.medicPerMin * level(p);
}

export function payMedic(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  if (!(p.hospUntil > now)) fail('NOT_IN_HOSPITAL');
  const cost = medicCost(p, now);
  pay(p, cost);
  p.hospUntil = 0;
  return { ok: true, cost };
}

// ---------- discoteca ----------

export function canBuyDrug(p, d) {
  const g = CFG.drugs[d];
  return p.energy + g.e <= CFG.energy.max && p.addiction + g.a <= addictionCap(p) && p.cash + p.bank >= g.price;
}

export function buyDrug(p, now, world, d) {
  const g = Number.isInteger(d) ? CFG.drugs[d] : undefined;
  if (!g) fail('NO_DRUG');
  begin(p, now, world);
  if (p.energy + g.e > CFG.energy.max) fail('ENERGY_FULL');
  if (p.addiction + g.a > addictionCap(p)) fail('ADDICTION_LIMIT', { cap: addictionCap(p) });
  pay(p, g.price);
  p.energy += g.e;
  if (p.addiction === 0) p.addictionT = now;
  p.addiction += g.a;
  p.c.refills += 1;
  return { ok: true, energy: g.e, addiction: g.a, price: g.price };
}

// Quanto vale 1 ponto de energia para este jogador: o melhor golpe desbloqueado, em dinheiro esperado.
export function valuePerEnergy(p) {
  let best = 0;
  for (let k = 0; k < CFG.crimes.length; k++) {
    if (!crimeUnlocked(p, k)) continue;
    const c = CFG.crimes[k];
    const v = (crimeChanceBp(p, k) * ((c.min + c.max) / 2)) / 10000 / c.e;
    if (v > best) best = v;
  }
  return best;
}

// Recarga num toque: a combinação que mais compensa (energia × valor − preço), sem passar o limite de vício nem o dinheiro.
// Programação dinâmica pequena: energia em falta (≤ 100) × vício que essa energia pode gastar.
export function refillPlan(p) {
  const room = CFG.energy.max - p.energy;
  const D = CFG.drugs;
  const minE = Math.min(...D.map((g) => g.e));
  if (room < minE) return null;
  const worst = Math.max(...D.map((g) => Math.ceil((g.a * room) / g.e)));
  const vroom = Math.min(addictionCap(p) - p.addiction, worst + Math.max(...D.map((g) => g.a)));
  if (vroom <= 0) return null;
  const money = p.cash + p.bank;
  const W = vroom + 1;
  const cost = new Float64Array((room + 1) * W).fill(Infinity);
  const from = new Int8Array((room + 1) * W).fill(-1);
  cost[0] = 0;
  for (let e = 0; e <= room; e++) {
    for (let v = 0; v <= vroom; v++) {
      const c = cost[e * W + v];
      if (c === Infinity) continue;
      for (let d = 0; d < D.length; d++) {
        const ne = e + D[d].e, nv = v + D[d].a;
        if (ne > room || nv > vroom) continue;
        const nc = c + D[d].price, k = ne * W + nv;
        if (nc < cost[k]) { cost[k] = nc; from[k] = d; }
      }
    }
  }
  // o que mais compensa ao preço de hoje; empate: mais energia, depois menos vício
  const V = valuePerEnergy(p);
  let best = null, bestGain = -Infinity;
  for (let e = minE; e <= room; e++) {
    for (let v = 0; v <= vroom; v++) {
      const c = cost[e * W + v];
      if (c > money) continue;
      const gain = e * V - c;
      if (gain > bestGain || (gain === bestGain && best && (e > best.energy || (e === best.energy && v < best.vice)))) {
        bestGain = gain; best = { energy: e, vice: v, cost: c };
      }
    }
  }
  // se nada compensa (golpes ainda fracos), enche na mesma da forma mais barata possível
  if (best && bestGain < 0) {
    best = null;
    for (let e = room; e >= minE && !best; e--) for (let v = 0; v <= vroom; v++) {
      const c = cost[e * W + v];
      if (c <= money && (!best || c < best.cost)) best = { energy: e, vice: v, cost: c };
    }
  }
  if (!best) return null;
  const counts = D.map(() => 0);
  for (let e = best.energy, v = best.vice; e > 0;) {
    const d = from[e * W + v];
    counts[d]++; e -= D[d].e; v -= D[d].a;
  }
  return { energy: best.energy, vice: best.vice, cost: best.cost, counts };
}

export function refill(p, now, world) {
  begin(p, now, world);
  const plan = refillPlan(p);
  if (!plan) {
    if (CFG.energy.max - p.energy < Math.min(...CFG.drugs.map((g) => g.e))) fail('ENERGY_FULL');
    if (addictionCap(p) - p.addiction < Math.min(...CFG.drugs.map((g) => g.a))) fail('ADDICTION_LIMIT', { cap: addictionCap(p) });
    fail('NO_MONEY');
  }
  pay(p, plan.cost);
  p.energy += plan.energy;
  if (p.addiction === 0) p.addictionT = now;
  p.addiction += plan.vice;
  p.c.refills += 1;
  return { ok: true, energy: plan.energy, addiction: plan.vice, price: plan.cost, counts: plan.counts };
}

function pruneDetox(p, now) {
  const lim = now - CFG.detox.windowMs;
  while (p.detoxT.length && p.detoxT[0] <= lim) p.detoxT.shift();
}
// preço = (valor de 100 de energia para ti) × vício / 200, +50% por cada uso nas últimas 24 h
export function detoxCost(p, now) {
  if (now !== undefined) pruneDetox(p, now);
  const D = CFG.detox;
  const v100 = Math.floor(valuePerEnergy(p) * 100);
  let price = Math.max(D.min, Math.floor((v100 * p.addiction) / D.valueDiv));
  const n = Math.min(p.detoxT.length, D.maxSteps);
  for (let i = 0; i < n; i++) price = Math.ceil((price * D.stepNum) / D.stepDen);
  return price;
}
export function detox(p, now, world) {
  begin(p, now, world);
  if (p.addiction === 0) fail('NO_VICE');
  const price = detoxCost(p, now);
  pay(p, price);
  p.addiction = 0; p.addictionT = now;
  if (p.detoxT.length >= CFG.detox.maxSteps) p.detoxT.shift();
  p.detoxT.push(now);
  return { ok: true, price };
}

// ---------- treino ----------

export function trainCost(p, stat) { return CFG.train.costBase + p.stats[stat] * CFG.train.costPerStat; }

export function train(p, now, world, stat) {
  if (!STATS.includes(stat)) fail('NO_STAT');
  begin(p, now, world);
  if (p.energy < CFG.train.energy) fail('NO_ENERGY', { need: CFG.train.energy });
  const cost = trainCost(p, stat);
  pay(p, cost);
  settleAllBiz(p, now); // o rendimento até agora conta com a stat antiga
  p.energy -= CFG.train.energy;
  p.stats[stat] += 1;
  p.c.trains += 1;
  return { ok: true, stat, value: p.stats[stat], cost };
}

// ---------- negócios ----------

export function bizPrice(i, n) {
  let price = CFG.biz[i].price;
  for (let k = 0; k < n; k++) price += Math.floor(price / CFG.priceStepDiv);
  return price;
}

export function bizRates(p, i) {
  const b = CFG.biz[i];
  const n = p.biz[i].n;
  const st = Math.min(p.stats[b.stat], CFG.statMultCap);
  const perH = Math.floor((b.perH * n * (CFG.statMultDiv + st)) / CFG.statMultDiv);
  return { perH };
}

function settleBiz(p, i, now) {
  const s = p.biz[i];
  if (s.n === 0 || now <= s.t) { s.t = Math.max(s.t, now); return; }
  const { perH } = bizRates(p, i);
  const capM = perH * (CFG.storageMs / T.HOUR);
  const dt = Math.min(now - s.t, CFG.storageMs);
  if (s.stored < capM) {
    const tot = s.rem + perH * dt;
    const add = Math.floor(tot / T.HOUR);
    s.rem = tot - add * T.HOUR;
    s.stored = Math.min(capM, s.stored + add);
    if (s.stored === capM) s.rem = 0;
  } else s.rem = 0;
  s.t = now;
}

function settleAllBiz(p, now) { for (let i = 0; i < p.biz.length; i++) settleBiz(p, i, now); }

export function bizStored(p, now) {
  // leitura sem alterar o estado (para o ecrã)
  const copy = p.biz.map((s) => ({ ...s }));
  const ghost = { ...p, biz: copy };
  for (let i = 0; i < copy.length; i++) settleBiz(ghost, i, Math.max(now, copy[i].t));
  return copy.map((s) => ({ money: s.stored }));
}

export function buyBiz(p, now, world, i) {
  if (!Number.isInteger(i) || !CFG.biz[i]) fail('NO_BIZ');
  begin(p, now, world);
  if (p.biz[i].n >= CFG.bizMax) fail('BIZ_MAX');
  const price = bizPrice(i, p.biz[i].n);
  pay(p, price);
  settleBiz(p, i, now);
  p.biz[i].n += 1;
  const lvl = addRespect(p, CFG.biz[i].resp, now);
  return { ok: true, price, n: p.biz[i].n, respect: CFG.biz[i].resp, levelUp: lvl };
}

export function collectBiz(p, now, world, rng) {
  begin(p, now, world, { allowBusy: true });
  settleAllBiz(p, now);
  const out = [];
  for (let i = 0; i < p.biz.length; i++) {
    const s = p.biz[i], b = CFG.biz[i];
    if (s.stored === 0) continue;
    let money = s.stored, lost = 0;
    if (b.raid && money > 0 && rng.chance(CFG.raid.chanceBp)) {
      lost = Math.floor((money * CFG.raid.lossBp) / 10000);
      money -= lost;
    }
    if (b.toBank) p.bank += money; else p.cash += money;
    out.push({ biz: b.id, money, lost });
    s.stored = 0;
  }
  if (out.length) p.c.collects += 1;
  return { ok: true, items: out };
}

// ---------- porto ----------

export function portCap(p) {
  let cap = CFG.port.capBase;
  for (let i = 1; i < level(p); i++) cap = Math.floor((cap * CFG.port.capNum) / CFG.port.capDen);
  return cap;
}
export function portSlots(p) { return 1 + Math.floor(level(p) / CFG.port.slotsEveryLevels); }

export function sendPort(p, now, world, amount) {
  begin(p, now, world);
  if (!Number.isSafeInteger(amount) || amount < CFG.port.minAmount) fail('BAD_AMOUNT');
  if (amount > portCap(p)) fail('OVER_CAP', { cap: portCap(p) });
  if (p.port.length >= portSlots(p)) fail('NO_SLOT');
  const readyAt = now + CFG.port.ms;
  if (readyAt > world.playEnd) fail('ROUND_ENDING');
  pay(p, amount);
  p.port.push({ amount, readyAt });
  p.c.ports += 1;
  return { ok: true, readyAt };
}

export function collectPort(p, now, world, rng) {
  begin(p, now, world, { allowBusy: true });
  const out = [];
  p.port = p.port.filter((c) => {
    if (c.readyAt > now) return true;
    if (rng.chance(CFG.port.seizeBp)) { out.push({ amount: c.amount, got: 0, seized: true }); return false; }
    const got = c.amount + Math.floor((c.amount * CFG.port.gainBp) / 10000);
    p.cash += got;
    out.push({ amount: c.amount, got, seized: false });
    return false;
  });
  return { ok: true, items: out };
}

// ---------- banco ----------

export function deposit(p, now, world, amount) {
  begin(p, now, world, { allowBusy: true });
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > p.cash) fail('BAD_AMOUNT');
  const fee = Math.ceil((amount * CFG.bank.feeBp) / 10000);
  p.cash -= amount;
  p.bank += amount - fee;
  return { ok: true, fee };
}

export function withdraw(p, now, world, amount) {
  begin(p, now, world, { allowBusy: true });
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > p.bank) fail('BAD_AMOUNT');
  p.bank -= amount;
  p.cash += amount;
  return { ok: true };
}

// ---------- luxos ----------

export function luxuryPrice(p) { return CFG.luxury.firstPrice * 2 ** p.luxuries; }

export function buyLuxury(p, now, world) {
  begin(p, now, world);
  if (p.luxuries >= CFG.luxury.max) fail('LUXURY_MAX');
  const price = luxuryPrice(p);
  pay(p, price);
  p.luxuries += 1;
  const lvl = addRespect(p, CFG.luxury.respect, now);
  return { ok: true, price, respect: CFG.luxury.respect, levelUp: lvl };
}

// ---------- armas e proteções ----------

export function buyGear(p, now, world, kind, idx) {
  const list = kind === 'weapon' ? CFG.weapons : CFG.armors;
  if (!Number.isInteger(idx) || !list[idx]) fail('NO_GEAR');
  begin(p, now, world);
  if (idx <= p[kind]) fail('ALREADY_BETTER');
  pay(p, list[idx].price);
  p[kind] = idx;
  return { ok: true, price: list[idx].price };
}

const gearBp = (list, idx) => (idx >= 0 ? list[idx].bp : 0);
export function attackPower(p) { return Math.floor((p.stats.F * (10000 + gearBp(CFG.weapons, p.weapon))) / 10000); }
export function defensePower(p) { return Math.floor((p.stats.T * (10000 + gearBp(CFG.armors, p.armor))) / 10000); }

// ---------- ataques ----------

function prune(arr, now) { const lim = now - CFG.pvp.windowMs; while (arr.length && arr[0] <= lim) arr.shift(); }

// asVictim: foi mandado para o hospital por outro (conta para o limite de 4 em 24 h)
function hospitalize(p, now, ms, asVictim) {
  const P = CFG.pvp;
  p.hospUntil = now + ms;
  p.protectUntil = p.hospUntil + P.protectMs;          // proteção normal: cai se ele atacar
  if (!asVictim) return;
  prune(p.hospTimes, now);
  p.hospTimes.push(now);
  if (p.hospTimes.length >= P.maxHospPerWindow) {      // limite fixo: não cai
    const oldest = p.hospTimes[p.hospTimes.length - P.maxHospPerWindow];
    p.capUntil = Math.max(p.capUntil, oldest + P.windowMs);
  }
}

export function canAttack(a, d, now, world) {
  const P = CFG.pvp;
  if (a === d || a.id === d.id) return 'SELF';
  if (now - world.start < CFG.round.noPvpMs) return 'NO_PVP_YET';
  if (a.jailUntil > now) return 'IN_JAIL';
  if (a.hospUntil > now) return 'IN_HOSPITAL';
  if (a.energy < P.energy) return 'NO_ENERGY';
  if (a.shieldUntil > now) return 'YOU_ARE_NEW';
  if (d.shieldUntil > now) return 'TARGET_NEW';
  if (d.hospUntil > now) return 'TARGET_HOSPITAL';
  if (d.jailUntil > now) return 'TARGET_JAIL';
  if (d.protectUntil > now || d.capUntil > now) return 'TARGET_PROTECTED';
  if (d.respect * 10000 < a.respect * P.minTargetBp) return 'TARGET_TOO_WEAK';
  return null;
}

export function attackChanceBp(a, d) { return chanceBp(attackPower(a), defensePower(d)); }

function priorWins(a, d, now) {
  const arr = a.hits.get(d.id);
  if (!arr) return 0;
  prune(arr, now);
  return arr.length;
}

export function mugValue(a, d, now) {
  const div = 2 ** Math.min(priorWins(a, d, now), 10);
  const st = bizStored(d, now);
  const take = (x) => Math.floor(Math.floor((x * CFG.pvp.mugBp) / 10000) / div);
  let v = take(d.cash);
  for (let i = 0; i < st.length; i++) if (CFG.biz[i].raid) v += take(st[i].money);
  return v;
}

// ganho por vitória (antes do desconto por repetir o alvo)
export function pvpBaseGain(a, d) {
  const P = CFG.pvp;
  const ratioBp = clamp(Math.floor((10000 * d.respect) / Math.max(1, a.respect)), P.ratioMinBp, P.ratioMaxBp);
  const sqrtBp = Math.floor(Math.sqrt(ratioBp * 10000)); // 5000..20000
  return Math.floor(((P.gainBase + level(a)) * sqrtBp) / 10000);
}

export function expectedGain(a, d, now) {
  const div = 2 ** Math.min(priorWins(a, d, now), 10);
  return Math.floor(pvpBaseGain(a, d) / div);
}

export function attack(a, d, now, world, mode, rng) {
  begin(a, now, world);
  touch(d, now);
  if (mode !== 'beat' && mode !== 'mug') fail('BAD_MODE');
  const why = canAttack(a, d, now, world);
  if (why) fail(why);
  const P = CFG.pvp;
  a.energy -= P.energy;
  a.protectUntil = 0; // quem ataca perde a proteção
  const bp = attackChanceBp(a, d);
  const n = priorWins(a, d, now);
  const div = 2 ** Math.min(n, 10);
  const base = pvpBaseGain(a, d);
  if (rng.chance(bp)) {
    const gain = Math.floor(base / div);
    let res;
    if (mode === 'beat') {
      const loss = Math.floor(gain / P.lossDiv);
      const lvA = addRespect(a, gain, now);
      addRespect(d, -loss, now);
      hospitalize(d, now, P.beatHospMs, true);
      res = { win: true, mode, respect: gain, targetLoss: loss, money: 0, levelUp: lvA };
    } else {
      settleAllBiz(d, now);
      const take = (x) => Math.floor(Math.floor((x * P.mugBp) / 10000) / div);
      let stolen = take(d.cash);
      d.cash -= stolen;
      for (let i = 0; i < d.biz.length; i++) {
        if (!CFG.biz[i].raid) continue;
        const s = take(d.biz[i].stored);
        d.biz[i].stored -= s; stolen += s;
      }
      a.cash += stolen;
      const g = Math.floor(gain / 4);
      const lvA = addRespect(a, g, now);
      hospitalize(d, now, P.mugHospMs, true);
      res = { win: true, mode, respect: g, targetLoss: 0, money: stolen, levelUp: lvA };
    }
    a.c.pvpWins += 1;
    if (!a.hits.has(d.id)) a.hits.set(d.id, []);
    a.hits.get(d.id).push(now);
    return { ok: true, chanceBp: bp, ...res };
  }
  const loss = Math.floor(base / P.lossDiv);
  addRespect(a, -loss, now);
  // quem se defende só ganha se o atacante tiver >= 25% do seu respeito (contra farm com contas falsas)
  const defGain = a.respect * 10000 >= d.respect * P.minTargetBp ? P.defendGain : 0;
  addRespect(d, defGain, now);
  hospitalize(a, now, P.beatHospMs, false);
  return { ok: true, chanceBp: bp, win: false, mode, respect: -loss, defenderGain: defGain };
}

// ---------- objetivos ----------

function missionHave(p, type) {
  switch (type) {
    case 'wins': return p.c.wins;
    case 'trains': return p.c.trains;
    case 'refills': return p.c.refills;
    case 'collects': return p.c.collects;
    case 'pvpWins': return p.c.pvpWins;
    case 'ports': return p.c.ports;
    case 'level': return level(p);
    case 'tier': { let t = 0; for (let k = 0; k < p.wk.length; k++) if (p.wk[k] > 0) t = k + 1; return t; }
    case 'stars': { let s = 0; for (let k = 0; k < p.wk.length; k++) s += masteryStars(p, k); return s; }
    case 'gear': return (p.weapon >= 0 ? 1 : 0) + (p.armor >= 0 ? 1 : 0);
    case 'biz': return p.biz.reduce((s, b) => s + b.n, 0);
    case 'lux': return p.luxuries;
    default: return 0;
  }
}

// o objetivo atual, ou null quando a cadeia acabou
export function mission(p) {
  const m = CFG.missions[p.mi];
  if (!m) return null;
  const have = Math.min(m.need, missionHave(p, m.type));
  return { i: p.mi, id: m.id, type: m.type, need: m.need, have, cash: m.cash, done: have >= m.need, total: CFG.missions.length };
}

export function claimMission(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  const m = mission(p);
  if (!m) fail('NO_MISSION');
  if (!m.done) fail('MISSION_NOT_DONE');
  p.cash += m.cash;
  p.mi += 1;
  return { ok: true, id: m.id, cash: m.cash, next: mission(p) };
}

// ---------- ranking ----------

export function ranking(players) {
  return [...players].sort((x, y) => (y.respect - x.respect) || (x.respectAt - y.respectAt) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

// ---------- verificação de invariantes (testes e simulação) ----------

export function checkInvariants(p) {
  const bad = [];
  const ints = ['energy', 'energyT', 'addiction', 'addictionT', 'cash', 'bank', 'respect', 'respectAt', 'peakRespect', 'jailUntil', 'hospUntil', 'protectUntil', 'capUntil', 'luxuries', 't'];
  for (const k of ints) if (!Number.isSafeInteger(p[k]) || p[k] < 0) bad.push(`${k}=${p[k]}`);
  for (const s of STATS) if (!Number.isSafeInteger(p.stats[s]) || p.stats[s] < CFG.start.stat) bad.push(`stat ${s}=${p.stats[s]}`);
  if (p.energy > CFG.energy.max) bad.push(`energy>${CFG.energy.max}`);
  if (p.addiction > addictionCap(p)) bad.push('addiction>cap');
  if (p.peakRespect < p.respect) bad.push('peak<respect');
  if (!Array.isArray(p.detoxT) || p.detoxT.length > CFG.detox.maxSteps) bad.push('detox list');
  if (!Number.isSafeInteger(p.mi) || p.mi < 0 || p.mi > CFG.missions.length) bad.push('mission index');
  for (const k of Object.keys(p.c)) if (!Number.isSafeInteger(p.c[k]) || p.c[k] < 0) bad.push(`counter ${k}`);
  if (p.wk.length !== CFG.crimes.length || p.wk.some((n) => !Number.isSafeInteger(n) || n < 0)) bad.push('mastery');
  if (p.c.wins !== p.wk.reduce((s, n) => s + n, 0)) bad.push('wins!=mastery');
  for (const s of ['F', 'I', 'C']) if (!Number.isSafeInteger(p.xp?.[s]) || p.xp[s] < 0 || p.xp[s] >= practiceNeed(p, s)) bad.push(`xp ${s}=${p.xp?.[s]}`);
  if (p.energyT > p.t || p.addictionT > p.t) bad.push('timer in future');
  for (const s of p.biz) {
    for (const k of ['n', 'stored', 'rem', 't']) if (!Number.isSafeInteger(s[k]) || s[k] < 0) bad.push(`biz.${k}=${s[k]}`);
    if (s.rem >= T.HOUR) bad.push('biz remainder overflow');
    if (s.n > CFG.bizMax) bad.push('biz over max');
  }
  return bad;
}
