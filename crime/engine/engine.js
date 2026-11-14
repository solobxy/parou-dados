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
  };
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
  syncEnergy(p, now);
  syncAddiction(p, now);
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

export function addictionCap(p) { return CFG.addiction.base + p.stats.T; }

function addRespect(p, delta, now) {
  if (delta === 0) return null;
  const before = level(p);
  p.respect = Math.max(0, p.respect + delta);
  if (p.respect > p.peakRespect) p.peakRespect = p.respect;
  p.respectAt = now;
  const after = level(p);
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
    let money = rng.int(c.min, c.max);
    const crit = rng.chance(CFG.crit.chanceBp);
    if (crit) money *= CFG.crit.mult;
    p.cash += money;
    const lvl = addRespect(p, c.r, now);
    return { ok: true, success: true, money, crit, respect: c.r, levelUp: lvl, chanceBp: bp };
  }
  p.jailUntil = now + c.jailMin * T.MIN;
  p.jailTier = k + 1;
  return { ok: true, success: false, jailUntil: p.jailUntil, chanceBp: bp };
}

export function bailCost(p, now) {
  if (!(p.jailUntil > now)) return 0;
  const mins = Math.ceil((p.jailUntil - now) / T.MIN);
  return mins * CFG.bailPerMinPerTier * p.jailTier;
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
  return { ok: true, energy: g.e, addiction: g.a, price: g.price };
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
  return { ok: true, items: out };
}

// ---------- porto ----------

export function portCap(p) { return CFG.port.capBase * 2 ** Math.floor(level(p) / CFG.port.capEveryLevels); }
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
  if (p.energyT > p.t || p.addictionT > p.t) bad.push('timer in future');
  for (const s of p.biz) {
    for (const k of ['n', 'stored', 'rem', 't']) if (!Number.isSafeInteger(s[k]) || s[k] < 0) bad.push(`biz.${k}=${s[k]}`);
    if (s.rem >= T.HOUR) bad.push('biz remainder overflow');
    if (s.n > CFG.bizMax) bad.push('biz over max');
  }
  return bad;
}
