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
    port: [], air: null, stock: CFG.drugs.map(() => 0), club: null, bro: null, stk: CFG.stocks.list.map(() => ({ n: 0, cost: 0, gen: 0 })),
    weapon: -1, armor: -1, guard: -1, hmT: [], hmSafe: 0,
    luxuries: 0,
    gang: null, gb: null, gangLeft: 0, gh: [], gbz: gbzNew(),
    detoxT: [],
    xp: { F: 0, I: 0, C: 0 },
    wk: CFG.crimes.map(() => 0),   // sucessos por golpe (mestria)
    c: { crimes: 0, wins: 0, trains: 0, refills: 0, collects: 0, pvpWins: 0, ports: 0 },
    mi: 0,                         // objetivos já recebidos
    mq: CFG.missions.map((_, i) => i), mrT: 0,   // os que faltam, pela ordem em que vão aparecer; e quando se trocou pela última vez
    cls: '', clsAt: 0, av: 0, fx: {}, sick: false, hkN: CFG.hookers.list.map(() => 0), hkAt: CFG.hookers.list.map(() => 0), house: 0, hu: CFG.house.ups.map(() => 0), bj: null,        // profissão, avatar e efeitos temporários (kind -> { bp, until })
  };
}

// jogadores gravados antes de uma regra nova ganham os campos que faltam
function migrate(p) {
  if (!Array.isArray(p.detoxT)) p.detoxT = [];
  if (!p.xp) p.xp = { F: 0, I: 0, C: 0 };
  if (!Array.isArray(p.wk)) p.wk = CFG.crimes.map(() => 0);
  if (!p.c) p.c = { crimes: 0, wins: 0, trains: 0, refills: 0, collects: 0, pvpWins: 0, ports: 0 };
  if (!Number.isSafeInteger(p.mi)) p.mi = 0;
  if (!Array.isArray(p.mq)) p.mq = CFG.missions.map((_, i) => i).slice(Math.min(Math.max(p.mi, 0), CFG.missions.length));
  if (!Number.isSafeInteger(p.mrT)) p.mrT = 0;
  if (typeof p.cls !== 'string') p.cls = '';
  if (!Number.isSafeInteger(p.clsAt)) p.clsAt = 0;
  if (p.air === undefined) p.air = null;
  if (!Array.isArray(p.stock) || p.stock.length !== CFG.drugs.length) p.stock = CFG.drugs.map((_, i) => (Array.isArray(p.stock) && Number.isSafeInteger(p.stock[i]) && p.stock[i] > 0 ? p.stock[i] : 0));
  if (p.club === undefined) p.club = null;
  if (!Array.isArray(p.stk) || p.stk.length !== CFG.stocks.list.length) p.stk = CFG.stocks.list.map((_, k) => (Array.isArray(p.stk) && p.stk[k] && Number.isSafeInteger(p.stk[k].n) ? p.stk[k] : { n: 0, cost: 0, gen: 0 }));
  if (p.bro === undefined) p.bro = null;
  if (!Number.isSafeInteger(p.av)) p.av = 0;
  if (!p.fx || typeof p.fx !== 'object') p.fx = {};
  if (typeof p.sick !== 'boolean') p.sick = false;
  // putas: cada uma tem os seus degraus de preço (hkN) e a hora da última visita (hkAt). Estado antigo (listas de visitas) é convertido.
  if (!Array.isArray(p.hkN) || p.hkN.length !== CFG.hookers.list.length) {
    const n = CFG.hookers.list.map((_, i) => (Array.isArray(p.hkN) && Number.isSafeInteger(p.hkN[i]) && p.hkN[i] > 0 ? Math.min(p.hkN[i], CFG.hookers.maxSteps) : 0));
    const at = CFG.hookers.list.map((_, i) => (Array.isArray(p.hkAt) && Number.isSafeInteger(p.hkAt[i]) ? p.hkAt[i] : 0));
    if (Array.isArray(p.hkT) && Array.isArray(p.hkI)) for (let k = 0; k < p.hkT.length; k++) { const i = p.hkI[k]; if (n[i] !== undefined && Number.isSafeInteger(p.hkT[k])) { n[i] = Math.min(n[i] + 1, CFG.hookers.maxSteps); at[i] = Math.max(at[i], p.hkT[k]); } }
    p.hkN = n; p.hkAt = at;
  }
  if (!Array.isArray(p.hkAt) || p.hkAt.length !== p.hkN.length) p.hkAt = p.hkN.map(() => 0);
  delete p.hkT; delete p.hkI;
  if (!Number.isSafeInteger(p.house)) p.house = 0;
  if (!Array.isArray(p.hu)) p.hu = CFG.house.ups.map(() => 0);
  if (p.bj === undefined) p.bj = null;
  if (typeof p.gang !== 'string') p.gang = null;
  if (!p.gang || !p.gb || typeof p.gb !== 'object') p.gb = null;
  if (!Number.isSafeInteger(p.gangLeft)) p.gangLeft = 0;
  if (!Number.isInteger(p.guard)) p.guard = -1;
  if (!Array.isArray(p.hmT)) p.hmT = [];
  if (!Number.isSafeInteger(p.hmSafe)) p.hmSafe = 0;
  if (!Array.isArray(p.gbz) || p.gbz.length !== CFG.gang.biz.length) p.gbz = gbzNew();
  if (!Array.isArray(p.gh)) p.gh = [];
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
  settleClub(p, now); settleBro(p, now);   // os clientes da discoteca e do bordel até agora
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

export function addictionCap(p) { return CFG.addiction.base + (klass(p).capPlus || 0) + Math.floor(p.stats.T / CFG.addiction.perT); }

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

// ---------- gangues ----------
// O motor só trata do que mexe no jogador: pagar para criar, dar ao cofre e os bónus que a gangue lhe dá.
// Quem é de que gangue, o cofre e os níveis vivem no servidor, que escreve aqui o bónus de cada membro.
const gbp = (p, k) => (p.gb && Number.isSafeInteger(p.gb[k]) ? p.gb[k] : 0);
export function gangBonus(sede, armaria) { const G = CFG.gang; return { loot: G.lootBpPer * sede, atk: G.fightBpPer * armaria, def: G.fightBpPer * armaria }; }
export function gangSlots(sede) { return CFG.gang.baseMembers + CFG.gang.perSede * sede; }
export function gangCanJoin(p, now) {
  if (p.gang) fail('IN_GANG');
  if (level(p) < CFG.gang.minLevel) fail('LOW_LEVEL', { need: CFG.gang.minLevel });
  if (p.gangLeft && now - p.gangLeft < CFG.gang.rejoinMs) fail('GANG_WAIT', { until: p.gangLeft + CFG.gang.rejoinMs });
}
export function gangCreate(p, now, world) {
  begin(p, now, world);
  gangCanJoin(p, now);
  pay(p, CFG.gang.createCost);
  return { ok: true, cost: CFG.gang.createCost };
}
export function gangSet(p, id, sede, armaria) { p.gang = id; p.gb = gangBonus(sede, armaria); }
// sair (ou ser expulso): os negócios da gangue devolvem metade do investido e tudo o que estava por receber
export function gangLeave(p, now) {
  let stored = 0, inv = 0;
  if (!Array.isArray(p.gbz) || p.gbz.length !== CFG.gang.biz.length) p.gbz = gbzNew();
  for (let k = 0; k < p.gbz.length; k++) { settleGbz(p, k, Math.max(now, p.gbz[k].t)); stored += p.gbz[k].stored; inv += p.gbz[k].inv; }
  const refund = Math.floor((inv * CFG.gang.bizRefundBp) / 10000);
  p.cash += stored + refund; p.gbz = gbzNew();
  p.gang = null; p.gb = null; p.gangLeft = now;
  return { refund, stored, invested: inv };
}
// a gangue deixou de existir no registo (não devia acontecer): o jogador fica sem gangue e recebe de volta tudo o que lá tinha
export function gangOrphan(p) {
  let back = 0;
  if (Array.isArray(p.gbz)) for (const x of p.gbz) back += (x.inv || 0) + (x.stored || 0);
  p.cash += back; p.gbz = gbzNew(); p.gang = null; p.gb = null;
  return back;
}
// ---- negócios da gangue ----
// p.gbz[k] = { inv: o que este membro lá pôs, coop: bónus de grupo em pontos (quem o escreve é gangBizSync), stored/rem/t: rendimento por receber }
function gbzNew() { return CFG.gang.biz.map(() => ({ inv: 0, coop: 0, stored: 0, rem: 0, t: 0 })); }
export function gangBizCap(p, k) { return casinoMax(p) * CFG.gang.biz[k].capMult; }
export function gangBizRate(p, k) { const s = p.gbz[k]; return up(Math.floor((s.inv * CFG.gang.biz[k].rateBp) / 10000), s.coop); }   // por hora
function settleGbz(p, k, now) {
  const s = p.gbz[k];
  if (s.inv === 0 || now <= s.t) { s.t = Math.max(s.t, now); return; }
  const perH = gangBizRate(p, k), capM = perH * (CFG.storageMs / T.HOUR), dt = Math.min(now - s.t, CFG.storageMs);
  if (s.stored < capM) {
    const tot = s.rem + perH * dt, add = Math.floor(tot / T.HOUR);
    s.rem = tot - add * T.HOUR;
    s.stored = Math.min(capM, s.stored + add);
    if (s.stored === capM) s.rem = 0;
  } else s.rem = 0;
  s.t = now;
}
// leitura para o ecrã, sem mexer no jogador
export function gangBizView(p, now) {
  const ghost = { ...p, gbz: (Array.isArray(p.gbz) && p.gbz.length === CFG.gang.biz.length ? p.gbz : gbzNew()).map((s) => ({ ...s })) };
  return ghost.gbz.map((s, k) => { settleGbz(ghost, k, Math.max(now, s.t)); return { inv: s.inv, coop: s.coop, perH: gangBizRate(ghost, k), stored: s.stored, cap: gangBizCap(p, k) }; });
}
export function gangBizInvest(p, now, world, k, amount, sede) {
  const B = Number.isInteger(k) ? CFG.gang.biz[k] : undefined;
  if (!B) fail('NO_BIZ');
  begin(p, now, world);
  if (!p.gang) fail('NO_GANG');
  if (!Number.isSafeInteger(sede) || sede < B.sede) fail('GBIZ_SEDE', { need: B.sede });
  if (!Number.isSafeInteger(amount) || amount < CFG.gang.bizMin) fail('BAD_AMOUNT');
  const cap = gangBizCap(p, k);
  if (p.gbz[k].inv + amount > cap) fail('GBIZ_CAP', { cap, have: p.gbz[k].inv });
  pay(p, amount);
  settleGbz(p, k, now);          // o que rendeu até agora conta com o que lá estava
  p.gbz[k].inv += amount;
  return { ok: true, k, biz: B.id, amount, inv: p.gbz[k].inv };
}
export function gangBizCollect(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  if (!p.gang) fail('NO_GANG');
  let money = 0;
  for (let k = 0; k < p.gbz.length; k++) { settleGbz(p, k, now); money += p.gbz[k].stored; p.gbz[k].stored = 0; }
  p.cash += money;
  return { ok: true, money };
}
// Acerta o bónus de grupo de todos os membros de uma gangue (chamar sempre que alguém investe, entra ou sai). Devolve quem mudou.
// Antes de mudar o bónus de alguém, fecha-se a conta do que rendeu até agora com o bónus antigo.
export function gangBizSync(players, now) {
  const G = CFG.gang, changed = [];
  for (const p of players) touch(p, now);
  for (let k = 0; k < G.biz.length; k++) {
    for (const p of players) {
      const s = p.gbz[k]; let coop = 0;
      if (s.inv > 0) { let sum = 0; for (const o of players) if (o !== p) sum += Math.min(o.gbz[k].inv, s.inv); coop = Math.min(G.bizCoopMax, Math.floor((G.bizCoopBp * sum) / s.inv)); }
      if (coop !== s.coop) { settleGbz(p, k, now); s.coop = coop; if (!changed.includes(p)) changed.push(p); }
    }
  }
  return changed;
}
export function gangDonate(p, now, world, amount) {
  begin(p, now, world, { allowBusy: true });
  if (!p.gang) fail('NO_GANG');
  if (!Number.isSafeInteger(amount) || amount < CFG.gang.donateMin) fail('BAD_AMOUNT');
  pay(p, amount);
  return { ok: true, amount };
}

// ---------- profissão e efeitos temporários ----------
const klass = (p) => CFG.classes.find((c) => c.id === p.cls) || {};
const up = (x, bp) => Math.floor((x * (10000 + bp)) / 10000);
const cut = (x, bp) => Math.floor((x * (10000 - bp)) / 10000);
export function buffBp(p, k, now) { const f = p.fx && p.fx[k]; return f && now !== undefined && f.until > now ? f.bp : 0; }
export function effStat(p, s, now) { const v = up(p.stats[s], buffBp(p, s, now)); return p.sick && now !== undefined ? cut(v, CFG.hookers.sickCutBp) : v; }
export function activeFx(p, now) { return CFG.fxKinds.filter((k) => buffBp(p, k, now) > 0).map((k) => ({ k, bp: p.fx[k].bp, until: p.fx[k].until })); }
function applyFx(p, g, now) {
  const out = [];
  for (const f of g.fx || []) {
    const until = now + up(f.ms, klass(p).fxMoreBp || 0), cur = p.fx[f.k];
    if (!cur || cur.until <= now || f.bp >= cur.bp) { p.fx[f.k] = { bp: f.bp, until }; out.push({ k: f.k, bp: f.bp, until }); }
  }
  return out;
}
export function setClass(p, now, world, id) {
  begin(p, now, world, { allowBusy: true });
  if (p.cls) fail('CLASS_SET');
  const c = CFG.classes.find((x) => x.id === id);
  if (!c) fail('NO_CLASS');
  if ((c.need || 0) > p.peakRespect) fail('CLASS_LOCKED', { need: c.need });
  settleAllBiz(p, now);
  p.cls = id;
  return { ok: true, cls: id };
}
export function classChangeCost(p) {
  const C = CFG.classChange;
  return Math.max(C.min, Math.floor((Math.floor(valuePerEnergy(p) * 100) * C.energy) / 100));
}
// mudar de profissão: paga-se e só de 24 em 24 h. O que os negócios renderam até aqui conta com a profissão antiga.
export function changeClass(p, now, world, id) {
  begin(p, now, world, { allowBusy: true });
  if (!p.cls) fail('NO_CLASS');
  const c = CFG.classes.find((x) => x.id === id);
  if (!c) fail('NO_CLASS');
  if (id === p.cls) fail('CLASS_SET');
  if ((c.need || 0) > p.peakRespect) fail('CLASS_LOCKED', { need: c.need });
  if (p.clsAt && now < p.clsAt + CFG.classChange.coolMs) fail('CLASS_WAIT', { until: p.clsAt + CFG.classChange.coolMs });
  const capNovo = CFG.addiction.base + (c.capPlus || 0) + Math.floor(p.stats.T / CFG.addiction.perT);
  if (p.addiction > capNovo) fail('ADDICTION_LIMIT', { cap: capNovo });   // com vício acima do limite da profissão nova, primeiro desintoxica (senão mudar apagava vício de graça)
  const cost = classChangeCost(p);
  if (p.cash + p.bank < cost) fail('NO_MONEY', { need: cost, have: p.cash + p.bank });
  settleAllBiz(p, now);
  pay(p, cost);
  const from = p.cls;
  p.cls = id; p.clsAt = now;
  return { ok: true, cls: id, from, cost };
}
export function setAvatar(p, now, world, i) {
  begin(p, now, world, { allowBusy: true });
  if (!Number.isInteger(i) || i < 0 || i >= CFG.avatars) fail('NO_AVATAR');
  p.av = i;
  return { ok: true, av: i };
}
const huBp = (p, i) => (p.hu ? p.hu[i] * CFG.house.ups[i].bp : 0);
export function bustChanceBp(p, now) { return cut(cut(cut(CFG.bustBp, klass(p).bustCutBp || 0), buffBp(p, 'bust', now)), huBp(p, 2)); }
// ---------- casa ----------
export function housePrice(p) { const n = CFG.house.tiers[p.house + 1]; return n ? n.price : null; }
export function buyHouse(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  const n = CFG.house.tiers[p.house + 1];
  if (!n) fail('HOUSE_MAX');
  pay(p, n.price);
  p.house += 1;
  return { ok: true, price: n.price, respect: n.resp, levelUp: addRespect(p, n.resp, now) };
}
export function upgradePrice(p, u) {
  const g = CFG.house.ups[u], n = CFG.house.tiers[p.hu[u] + 1];
  return g && n ? Math.floor((n.price * g.costBp) / 10000) : null;
}
export function buyUpgrade(p, now, world, u) {
  if (!Number.isInteger(u) || !CFG.house.ups[u]) fail('NO_UPGRADE');
  begin(p, now, world, { allowBusy: true });
  if (p.hu[u] >= p.house) fail('NEED_HOUSE');
  const price = upgradePrice(p, u);
  pay(p, price);
  settleAllBiz(p, now); // o rendimento até aqui conta sem a melhoria nova
  p.hu[u] += 1;
  return { ok: true, price, level: p.hu[u] };
}
export function drugPrice(p, d) { return Math.max(1, cut(CFG.drugs[d].price, klass(p).drugCutBp || 0)); }

export function chanceBp(S, D) {
  const { minBp, maxBp } = CFG.chance;
  if (S <= 0) return minBp;
  const s2 = S * S, d2 = D * D;
  return clamp(Math.floor((10000 * s2) / (s2 + d2)), minBp, maxBp);
}

export function crimeScore(p, k, now) {
  const { w } = CFG.crimes[k];
  return Math.floor((w.I * effStat(p, 'I', now) + w.F * effStat(p, 'F', now) + w.C * effStat(p, 'C', now)) / 100);
}

// com «now» conta os efeitos temporários; sem ele, só as stats (é o que desbloqueia golpes)
export function crimeChanceBp(p, k, now) { return chanceBp(crimeScore(p, k, now), CFG.crimes[k].D); }

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
  const bp = crimeChanceBp(p, k, now);
  settleAllBiz(p, now); // a prática pode subir stats: o rendimento até aqui conta com as antigas
  p.energy -= c.e;
  // o primeiro carteirista de quem ainda não tem respeito nenhum corre sempre bem: a primeira jogada não pode ser a prisão
  const first = k === 0 && p.peakRespect === 0;
  if (first || rng.chance(bp)) {
    const starsBefore = masteryStars(p, k);
    let money = Math.floor((rng.int(c.min, c.max) * (10000 + CFG.mastery.bonusBp * starsBefore + (klass(p).lootBp || 0) + buffBp(p, 'loot', now) + gbp(p, 'loot'))) / 10000);
    const crit = rng.chance(CFG.crit.chanceBp);
    if (crit) money *= CFG.crit.mult;
    p.cash += money;
    p.c.crimes += 1; p.c.wins += 1; p.wk[k] += 1;
    const stars = masteryStars(p, k);
    const resp = c.r + Math.floor((c.r * (klass(p).respBp || 0)) / 10000);   // profissões de elite: mais respeito nos golpes grandes (arredonda para baixo)
    const lvl = addRespect(p, resp, now);
    const gained = practice(p, c, true);
    return { ok: true, success: true, money, crit, respect: resp, levelUp: lvl, chanceBp: bp, gained, newChanceBp: crimeChanceBp(p, k, now), star: stars > starsBefore ? stars : 0 };
  }
  p.c.crimes += 1;
  // falhar não é sempre prisão: só uma parte das falhas acaba com a polícia
  const busted = rng.chance(bustChanceBp(p, now));
  if (busted) { p.jailUntil = now + c.jailMin * T.MIN; p.jailTier = k + 1; }
  const gained = practice(p, c, false);
  return { ok: true, success: false, busted, jailUntil: p.jailUntil, chanceBp: bp, gained, newChanceBp: crimeChanceBp(p, k, now) };
}

// «usar a stamina toda»: repete o mesmo golpe tantas vezes quantas a stamina de agora dá (no máximo 25).
// Para se fores preso. Se subires de nível a meio, a stamina que isso enche fica para ti.
// Cada golpe é exatamente igual a um toque no botão; isto só poupa toques.
export function doCrimeAll(p, now, world, k, rng) {
  const c = Number.isInteger(k) ? CFG.crimes[k] : undefined;
  if (!c) fail('NO_CRIME');
  begin(p, now, world);
  if (!crimeUnlocked(p, k)) fail('LOCKED');
  if (p.energy < c.e) fail('NO_ENERGY', { need: c.e });
  const out = { ok: true, all: true, n: 0, wins: 0, crits: 0, money: 0, best: 0, bestCrit: false, respect: 0,
    busted: false, jailUntil: 0, levelUp: null, gained: {}, star: 0, chanceBp: crimeChanceBp(p, k, now), newChanceBp: 0 };
  const budget = Math.min(CFG.crimeAllMax, Math.floor(p.energy / c.e));
  while (out.n < budget && p.energy >= c.e) {
    const r = doCrime(p, now, world, k, rng);
    out.n += 1;
    for (const [s, g] of Object.entries(r.gained)) out.gained[s] = (out.gained[s] || 0) + g;
    if (r.success) {
      out.wins += 1; out.money += r.money; out.respect += r.respect;
      if (r.crit) out.crits += 1;
      if (r.money > out.best) { out.best = r.money; out.bestCrit = r.crit; }
      if (r.star) out.star = r.star;
      if (r.levelUp) out.levelUp = { from: out.levelUp ? out.levelUp.from : r.levelUp.from, to: r.levelUp.to };
    } else if (r.busted) { out.busted = true; out.jailUntil = r.jailUntil; break; }
  }
  out.newChanceBp = crimeChanceBp(p, k, now);
  return out;
}

export function bailCost(p, now) {
  if (!(p.jailUntil > now)) return 0;
  const c = CFG.crimes[p.jailTier - 1];
  const left = p.jailUntil - now, total = c.jailMin * T.MIN;
  const full = cut(Math.floor(((c.min + c.max) / 2) * CFG.bailBp / 10000), klass(p).bailCutBp || 0);
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

// safar um membro da mesma gangue: paga-se a fiança ou o hospital dele (o preço é o dele, quem paga é outro)
export function bailFor(payer, target, now, world) {
  begin(payer, now, world, { allowBusy: true });
  if (payer === target || payer.id === target.id) fail('SELF');
  if (!payer.gang || payer.gang !== target.gang) fail('NO_GANG');
  touch(target, now);
  if (!(target.jailUntil > now)) fail('NOT_IN_JAIL');
  const cost = bailCost(target, now);
  pay(payer, cost);
  target.jailUntil = 0; target.jailTier = 0;
  return { ok: true, cost };
}
export function medicFor(payer, target, now, world) {
  begin(payer, now, world, { allowBusy: true });
  if (payer === target || payer.id === target.id) fail('SELF');
  if (!payer.gang || payer.gang !== target.gang) fail('NO_GANG');
  touch(target, now);
  if (!(target.hospUntil > now)) fail('NOT_IN_HOSPITAL');
  const cost = medicCost(target, now);
  pay(payer, cost);
  target.hospUntil = 0;
  return { ok: true, cost };
}
export function medicCost(p, now) {
  if (!(p.hospUntil > now)) return 0;
  const mins = Math.ceil((p.hospUntil - now) / T.MIN);
  const porNivel = mins * CFG.medicPerMin * level(p), porValor = Math.floor((mins * Math.floor(valuePerEnergy(p) * 100) * CFG.medicValueBp) / 1000000);
  return Math.max(1, Math.min(porNivel, porValor));
}

export function payMedic(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  if (!(p.hospUntil > now)) fail('NOT_IN_HOSPITAL');
  const cost = medicCost(p, now);
  pay(p, cost);
  p.hospUntil = 0;
  return { ok: true, cost };
}

// ---------- putas ----------
const recent = (arr, now, win) => (now === undefined ? arr.length : arr.reduce((c, t) => c + (t > now - win ? 1 : 0), 0));
// degraus de preço desta puta agora: cada visita sobe um; por cada hora inteira sem lá ir, desce um
export function hookerSteps(p, i, now) {
  const n = p.hkN[i] || 0; if (n <= 0) return 0;
  return Math.max(0, n - Math.max(0, Math.floor((now - p.hkAt[i]) / CFG.hookers.coolMs)));
}
export const hookerUses = (p, now) => p.hkN.reduce((s, _, i) => s + hookerSteps(p, i, now), 0);
export const detoxUses = (p, now) => recent(p.detoxT, now, CFG.detox.windowMs);
export function hookerPrice(p, i, now) {
  const H = CFG.hookers, g = H.list[i];
  let price = Math.max(g.min, Math.floor((Math.floor(valuePerEnergy(p) * 100) * g.e * g.valueBp) / 1000000));
  const n = Math.min(hookerSteps(p, i, now), H.maxSteps); // só conta, não mexe: uma visita recusada não muda nada
  for (let k = 0; k < n; k++) price = Math.ceil((price * H.stepNum) / H.stepDen);
  return Math.max(1, cut(price, klass(p).hkCutBp || 0));
}
export function visitHooker(p, now, world, i, rng) {
  const g = Number.isInteger(i) ? CFG.hookers.list[i] : undefined;
  if (!g) fail('NO_HOOKER');
  begin(p, now, world);
  if (p.sick) fail('SICK');
  if (p.energy >= CFG.energy.max) fail('ENERGY_FULL');
  const price = hookerPrice(p, i, now);
  pay(p, price);
  return { ok: true, price, ...doVisit(p, i, now, rng) };
}
function doVisit(p, i, now, rng) {
  const g = CFG.hookers.list[i];
  const got = Math.min(g.e, CFG.energy.max - p.energy);
  p.energy += got;
  p.hkN[i] = Math.min(CFG.hookers.maxSteps, hookerSteps(p, i, now) + 1); p.hkAt[i] = now;   // a hora conta a partir da última visita a ela
  const sick = rng.chance(cut(g.sickBp, klass(p).sickCutBp || 0));
  if (sick) p.sick = true;
  return { energy: got, sick };
}
export function cureCost(p) {
  return p.sick ? Math.max(CFG.hookers.cureMin, Math.floor((Math.floor(valuePerEnergy(p) * 100) * CFG.hookers.cureValueBp) / 10000)) : 0;
}
export function cure(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  if (!p.sick) fail('NOT_SICK');
  const price = cureCost(p);
  pay(p, price);
  p.sick = false;
  return { ok: true, price };
}

// ---------- discoteca ----------

export function canBuyDrug(p, d) {
  const g = CFG.drugs[d];
  return (g.fx || p.energy + g.e <= CFG.energy.max) && p.addiction + g.a <= addictionCap(p) && p.cash + p.bank >= drugPrice(p, d);
}

export function buyDrug(p, now, world, d) {
  const g = Number.isInteger(d) ? CFG.drugs[d] : undefined;
  if (!g) fail('NO_DRUG');
  begin(p, now, world);
  canTake(p, g);
  const price = drugPrice(p, d);
  pay(p, price);
  return { ok: true, price, ...take(p, g, now) };
}
// quem está cheio só pode tomar o que tem efeito (a stamina a mais perde-se)
function canTake(p, g) {
  if (!g.fx && p.energy + g.e > CFG.energy.max) fail('ENERGY_FULL');
  if (p.addiction + g.a > addictionCap(p)) fail('ADDICTION_LIMIT', { cap: addictionCap(p) });
}
function take(p, g, now) {
  const got = Math.min(g.e, CFG.energy.max - p.energy);
  p.energy += got;
  if (p.addiction === 0) p.addictionT = now;
  p.addiction += g.a;
  p.c.refills += 1;
  return { energy: got, addiction: g.a, fx: applyFx(p, g, now) };
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
        const nc = c + drugPrice(p, d), k = ne * W + nv;
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
  plan.counts.forEach((n, d) => { if (n) applyFx(p, CFG.drugs[d], now); });
  if (p.addiction === 0) p.addictionT = now;
  p.addiction += plan.vice;
  p.c.refills += 1;
  return { ok: true, energy: plan.energy, addiction: plan.vice, price: plan.cost, counts: plan.counts };
}

function pruneDetox(p, now) {
  const lim = now - CFG.detox.windowMs;
  while (p.detoxT.length && p.detoxT[0] <= lim) p.detoxT.shift();
}
// preço = (valor de 100 de energia para ti) × vício / 200, +25% por cada uso nas últimas 24 h
export function detoxCost(p, now) {
  const D = CFG.detox;
  const v100 = Math.floor(valuePerEnergy(p) * 100);
  let price = Math.max(D.min, Math.floor((v100 * p.addiction) / D.valueDiv));
  const n = Math.min(recent(p.detoxT, now, D.windowMs), D.maxSteps);
  for (let i = 0; i < n; i++) price = Math.ceil((price * D.stepNum) / D.stepDen);
  return price;
}
export function detox(p, now, world) {
  begin(p, now, world);
  if (p.addiction === 0) fail('NO_VICE');
  const price = detoxCost(p, now);
  pay(p, price);
  p.addiction = 0; p.addictionT = now;
  pruneDetox(p, now);
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
  const perH = up(Math.floor((b.perH * n * (CFG.statMultDiv + st)) / CFG.statMultDiv), (klass(p).bizBp || 0) + huBp(p, 3));
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
    money = up(money, buffBp(p, 'biz', now));   // sob efeito, a recolha rende mais
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

export function sendPort(p, now, world, amount, goods = false) {
  begin(p, now, world);
  if (!Number.isSafeInteger(amount) || amount < CFG.port.minAmount) fail('BAD_AMOUNT');
  if (amount > portCap(p)) fail('OVER_CAP', { cap: portCap(p) });
  if (p.port.length >= portSlots(p)) fail('NO_SLOT');
  const readyAt = now + CFG.port.ms;
  if (readyAt > world.playEnd) fail('ROUND_ENDING');
  pay(p, amount);
  p.port.push(goods ? { amount, readyAt, d: portDrug(p) } : { amount, readyAt });
  p.c.ports += 1;
  return { ok: true, readyAt };
}

export function collectPort(p, now, world, rng) {
  begin(p, now, world, { allowBusy: true });
  const out = [];
  p.port = p.port.filter((c) => {
    if (c.readyAt > now) return true;
    if (rng.chance(portSeizeBp(p))) { out.push({ amount: c.amount, got: 0, seized: true }); return false; }
    const got = c.amount + Math.floor((c.amount * CFG.port.gainBp) / 10000);
    if (c.d !== undefined) out.push({ amount: c.amount, got, seized: false, ...toGoods(p, c.d, got) });   // veio em droga: entra no armazém
    else { p.cash += got; out.push({ amount: c.amount, got, seized: false }); }
    return false;
  });
  return { ok: true, items: out };
}

// ---------- aeroporto ----------
// Um avião de cada vez. O resultado (chega ou é apreendido) só se sorteia quando o jogador vai buscar a carga, como no porto.
export function airCap(p) { return portCap(p); }
export function airBribe(amount) { return Math.ceil((amount * CFG.air.bribeBp) / 10000); }
export function airSeizeBp(p, r, bribe) {
  const bp = cut(CFG.air.routes[r].seizeBp, klass(p).seizeCutBp || 0);
  return bribe ? cut(bp, CFG.air.bribeCutBp) : bp;
}
export function airSend(p, now, world, r, amount, bribe) {
  const R = Number.isInteger(r) ? CFG.air.routes[r] : undefined;
  if (!R) fail('NO_ROUTE');
  begin(p, now, world);
  if (level(p) < R.level) fail('LOW_LEVEL', { need: R.level });
  if (p.air) fail('AIR_BUSY', { until: p.air.readyAt });
  if (!Number.isSafeInteger(amount) || amount < CFG.air.minAmount) fail('BAD_AMOUNT');
  if (amount > airCap(p)) fail('OVER_CAP', { cap: airCap(p) });
  const readyAt = now + R.ms;
  if (readyAt > world.playEnd) fail('ROUND_ENDING');
  const extra = bribe ? airBribe(amount) : 0;
  pay(p, amount + extra);
  p.air = { r, amount, bribe: !!bribe, t0: now, readyAt };
  return { ok: true, r, readyAt, paid: amount + extra, bribe: extra };
}
export function airCollect(p, now, world, rng, keep = false) {
  begin(p, now, world, { allowBusy: true });
  const f = p.air;
  if (!f) fail('NO_FLIGHT');
  if (f.readyAt > now) fail('AIR_FLYING', { until: f.readyAt });
  const R = CFG.air.routes[f.r];
  p.air = null;
  if (rng.chance(airSeizeBp(p, f.r, f.bribe))) return { ok: true, r: f.r, amount: f.amount, got: 0, seized: true, respect: 0 };
  const got = f.amount + Math.floor((f.amount * R.gainBp) / 10000);
  const goods = keep ? toGoods(p, CFG.drugs.findIndex((x) => x.id === R.drug), got) : null;
  if (!goods) p.cash += got;
  return { ok: true, r: f.r, amount: f.amount, got, seized: false, respect: R.r, levelUp: addRespect(p, R.r, now), ...(goods || {}) };
}

// ---------- mercadoria e casas do jogador (discoteca e bordel) ----------
export function wholesale(d) { return Math.max(1, Math.floor((CFG.drugs[d].price * CFG.goods.wholesaleBp) / 10000)); }
export function dumpValue(d, n) { return Math.floor((n * wholesale(d) * CFG.goods.dumpBp) / 10000); }
export function portDrug(p) { const L = level(p); for (const [lv, id] of CFG.goods.portDrug) if (L >= lv) return CFG.drugs.findIndex((x) => x.id === id); return 0; }
// troca dinheiro por unidades ao preço de grosso; o troco fica em dinheiro
function toGoods(p, d, cash) { const w = wholesale(d), units = Math.floor(cash / w), rest = cash - units * w; p.stock[d] += units; p.cash += rest; return { d, units, rest }; }
const venueFloor = (kind) => (kind === 'club' ? CFG.goods.wholesaleBp : CFG.venue.girlBp);
// quanto sai por hora na discoteca (em dinheiro ao preço da cidade) e quanto cabe no caixa
export function clubRate(p) { const c = p.club, V = CFG.venue; return c ? Math.floor((V.club.perH[c.lvl - 1] * V.volBp[c.pi]) / 10000) : 0; }
const clubCap = (c) => CFG.venue.club.perH[c.lvl - 1] * (CFG.venue.tillMs / T.HOUR);
// Discoteca: os clientes da casa gastam por hora o que a casa aguenta e levam primeiro o mais barato que houver.
// A conta dá o mesmo quer se faça de uma vez ou aos bocados: o que não chegou para mais uma unidade fica guardado (rem).
const DRUGS_BY_PRICE = CFG.drugs.map((_, d) => d).sort((a, b) => CFG.drugs[a].price - CFG.drugs[b].price || a - b);
function settleClub(p, now) {
  const c = p.club; if (!c) return;
  if (now <= c.t) return;
  const V = CFG.venue, perH = clubRate(p), cap = clubCap(c);
  const tot = c.rem + perH * Math.min(now - c.t, 14 * T.DAY);   // em dinheiro × ms, ao preço da cidade
  const budget = Math.floor(tot / T.HOUR);
  let used = 0, left = false;
  for (const d of DRUGS_BY_PRICE) {
    if (!p.stock[d]) continue;
    const price = CFG.drugs[d].price, unit = Math.max(1, Math.floor((price * V.prices[c.pi]) / 10000));
    const n = c.till >= cap ? 0 : Math.min(p.stock[d], Math.floor((budget - used) / price), Math.ceil((cap - c.till) / unit));
    if (n > 0) { p.stock[d] -= n; used += n * price; c.till += n * unit; }
    if (p.stock[d] > 0) { left = true; break; }   // enquanto houver da mais barata, as outras esperam
  }
  // o tempo sem mercadoria (ou com o caixa cheio) não se acumula
  c.rem = left && c.till < cap ? tot - used * T.HOUR : 0;
  c.t = now;
}
// Bordel: o que as putas rendem por hora ao dono, depois da parte delas. Ao preço da cidade é o perH da tabela.
export function broRate(p) {
  const b = p.bro, V = CFG.venue; if (!b) return 0;
  let base = 0; for (const i of b.girls) base += V.bro.perH[CFG.hookers.list[i].tier];
  return Math.floor((Math.floor((base * V.volBp[b.pi]) / 10000) * (V.prices[b.pi] - V.girlBp)) / (10000 - V.girlBp));
}
function settleBro(p, now) {
  const b = p.bro; if (!b) return;
  if (now <= b.t) return;
  const perH = broRate(p), cap = perH * (CFG.venue.tillMs / T.HOUR);
  if (perH > 0 && b.till < cap) {
    const tot = b.rem + perH * Math.min(now - b.t, CFG.venue.tillMs), add = Math.floor(tot / T.HOUR);
    b.rem = tot - add * T.HOUR; b.till = Math.min(cap, b.till + add);
    if (b.till >= cap) b.rem = 0;
  } else b.rem = 0;
  b.t = now;
}
// leitura sem alterar o estado (para os ecrãs e para a lista de casas)
export function venueView(p, now) {
  const ghost = { stock: p.stock.slice(), club: p.club ? { ...p.club } : null, bro: p.bro ? { ...p.bro, girls: p.bro.girls.slice() } : null };
  settleClub(ghost, now); settleBro(ghost, now);
  return ghost;
}
// preço numa casa de outro jogador, em pontos sobre o preço da cidade: o do dono, com o desconto da gangue se forem da mesma.
// Nunca abaixo do custo.
export function venuePriceBp(owner, kind, buyer) {
  const v = owner[kind], V = CFG.venue;
  const bp = buyer && buyer.gang && buyer.gang === owner.gang ? cut(V.prices[v.pi], V.gdisc[v.gd]) : V.prices[v.pi];
  return Math.max(venueFloor(kind), bp);
}
export function clubPriceAt(owner, buyer, d) { return Math.max(1, Math.floor((CFG.drugs[d].price * venuePriceBp(owner, 'club', buyer)) / 10000)); }
export function broPriceAt(owner, buyer, i, now) { return Math.max(1, Math.floor((hookerPrice(buyer, i, now) * venuePriceBp(owner, 'bro', buyer)) / 10000)); }
const isVenue = (kind) => kind === 'club' || kind === 'bro';
export function venueBuy(p, now, world, kind) {
  if (!isVenue(kind)) fail('NO_VENUE');
  begin(p, now, world);
  const C = CFG.venue[kind], v = p[kind], next = v ? v.lvl : 0;
  if (next >= C.cost.length) fail('VENUE_MAX');
  pay(p, C.cost[next]);
  if (v) v.lvl += 1;
  else p[kind] = kind === 'club' ? { lvl: 1, till: 0, t: now, rem: 0, pi: 2, gd: 0 } : { lvl: 1, till: 0, t: now, rem: 0, pi: 2, gd: 0, girls: [] };
  return { ok: true, kind, lvl: p[kind].lvl, cost: C.cost[next], respect: C.resp[next], levelUp: addRespect(p, C.resp[next], now) };
}
export function venueSet(p, now, world, kind, pi, gd) {
  if (!isVenue(kind)) fail('NO_VENUE');
  begin(p, now, world, { allowBusy: true });
  const v = p[kind]; if (!v) fail('NO_VENUE');
  if (!Number.isInteger(pi) || pi < 0 || pi >= CFG.venue.prices.length || !Number.isInteger(gd) || gd < 0 || gd >= CFG.venue.gdisc.length) fail('BAD_AMOUNT');
  v.pi = pi; v.gd = gd;
  return { ok: true, kind, pi, gd };
}
export function venueCollect(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  const club = p.club ? p.club.till : 0, bro = p.bro ? p.bro.till : 0;
  if (p.club) p.club.till = 0;
  if (p.bro) p.bro.till = 0;
  p.cash += club + bro;
  return { ok: true, club, bro };
}
// tomar do próprio armazém: já está paga, o resto é como na discoteca
export function stockUse(p, now, world, d) {
  const g = Number.isInteger(d) ? CFG.drugs[d] : undefined;
  if (!g) fail('NO_DRUG');
  begin(p, now, world);
  if (!(p.stock[d] > 0)) fail('NO_STOCK');
  canTake(p, g);
  p.stock[d] -= 1;
  return { ok: true, d, price: 0, ...take(p, g, now) };
}
// despachar o que está no armazém: paga um pouco menos do que custou
export function stockDump(p, now, world, d, n) {
  const g = Number.isInteger(d) ? CFG.drugs[d] : undefined;
  if (!g) fail('NO_DRUG');
  begin(p, now, world, { allowBusy: true });
  if (!Number.isSafeInteger(n) || n < 1 || n > p.stock[d]) fail('NO_STOCK');
  const got = dumpValue(d, n);
  p.stock[d] -= n; p.cash += got;
  return { ok: true, d, n, got };
}
export function broHire(p, now, world, i) {
  const g = Number.isInteger(i) ? CFG.hookers.list[i] : undefined;
  if (!g) fail('NO_HOOKER');
  begin(p, now, world);
  const b = p.bro; if (!b) fail('NO_VENUE');
  if (b.girls.length >= CFG.venue.bro.rooms[b.lvl - 1]) fail('NO_ROOM');
  const cost = CFG.venue.bro.hire[g.tier];
  pay(p, cost);
  b.girls.push(i);
  return { ok: true, i, cost };
}
export function broFire(p, now, world, slot) {
  begin(p, now, world, { allowBusy: true });
  const b = p.bro; if (!b) fail('NO_VENUE');
  if (!Number.isInteger(slot) || slot < 0 || slot >= b.girls.length) fail('NO_HOOKER');
  const [i] = b.girls.splice(slot, 1);
  return { ok: true, i };
}
// comprar na discoteca de outro jogador: paga-se ao dono, a droga sai do armazém dele e toma-se logo.
// price é o preço que o comprador viu: se o dono mudou entretanto, a compra não se faz.
export function clubBuyAt(buyer, owner, now, world, d, seen) {
  const g = Number.isInteger(d) ? CFG.drugs[d] : undefined;
  if (!g) fail('NO_DRUG');
  begin(buyer, now, world);
  if (buyer === owner || buyer.id === owner.id) fail('SELF');
  touch(owner, now);
  if (!owner.club) fail('NO_VENUE');
  if (!(owner.stock[d] > 0)) fail('NO_STOCK');
  canTake(buyer, g);
  const price = clubPriceAt(owner, buyer, d);
  if (seen !== undefined && price > seen) fail('PRICE_CHANGED', { price });
  pay(buyer, price);
  owner.stock[d] -= 1; owner.club.till += price;
  return { ok: true, d, price, ...take(buyer, g, now) };
}
// ir ao bordel de outro jogador: o teu preço da cidade para essa puta, vezes o preço do dono. A parte dela (80% do preço da cidade) não vai para o dono.
export function broVisitAt(buyer, owner, now, world, slot, rng, seen) {
  begin(buyer, now, world);
  if (buyer === owner || buyer.id === owner.id) fail('SELF');
  touch(owner, now);
  const b = owner.bro; if (!b) fail('NO_VENUE');
  const i = Number.isInteger(slot) ? b.girls[slot] : undefined;
  if (i === undefined) fail('NO_HOOKER');
  if (buyer.sick) fail('SICK');
  if (buyer.energy >= CFG.energy.max) fail('ENERGY_FULL');
  const base = hookerPrice(buyer, i, now), price = broPriceAt(owner, buyer, i, now);
  if (seen !== undefined && price > seen) fail('PRICE_CHANGED', { price });
  pay(buyer, price);
  const house = Math.max(0, price - Math.floor((base * CFG.venue.girlBp) / 10000));
  b.till += house;
  return { ok: true, i, price, house, ...doVisit(buyer, i, now, rng) };
}

// ---------- bolsa ----------
// O mercado (preços em cêntimos e a «geração» de cada empresa, que sobe quando vai à falência) vive no servidor e é igual para todos.
// Um passo do preço: sobe ou desce o mesmo com a mesma hipótese, por isso a média do preço seguinte é exatamente o preço de agora.
export function stockStep(price, volBp, rng) {
  const mag = pickW(rng, CFG.stocks.steps), delta = Math.floor((price * mag * volBp) / 10000 + 0.5);
  return rng.int(0, 1) ? price + delta : price - delta;
}
export function stockBustAt(k) { return Math.floor((CFG.stocks.list[k].base * CFG.stocks.bustBp) / 10000); }
export function newMarket() { return { tick: 0, prices: CFG.stocks.list.map((x) => x.base), gen: CFG.stocks.list.map(() => 0), busts: [] }; }
// avança um passo todas as empresas; devolve as que foram à falência neste passo (voltam ao preço de estreia com outra geração)
export function marketTick(m, rng) {
  const bust = [];
  for (let k = 0; k < CFG.stocks.list.length; k++) {
    const next = stockStep(m.prices[k], CFG.stocks.list[k].vol, rng);
    if (next < stockBustAt(k)) { m.prices[k] = CFG.stocks.list[k].base; m.gen[k] += 1; bust.push(k); } else m.prices[k] = next;
  }
  m.tick += 1;
  return bust;
}
export function stockCap(p) { return casinoMax(p) * CFG.stocks.capMult; }
// o que o jogador tem de uma empresa: se ela faliu desde a compra, não tem nada
function holding(p, m, k) { const h = p.stk[k]; return h.gen === m.gen[k] ? h : { n: 0, cost: 0, gen: m.gen[k] }; }
export function stockView(p, m) { return CFG.stocks.list.map((_, k) => { const h = holding(p, m, k); return { n: h.n, cost: h.cost, value: Math.floor((h.n * m.prices[k]) / 100) }; }); }
const stockFee = (gross) => Math.ceil((gross * CFG.stocks.feeBp) / 10000);
export function stockQuote(m, k, n) { const gross = Math.ceil((n * m.prices[k]) / 100); return gross + stockFee(gross); }   // o que custa comprar n ações agora
function stockArgs(m, k, n, seen) {
  if (!Number.isInteger(k) || !CFG.stocks.list[k]) fail('NO_STOCK_CO');
  if (!Number.isSafeInteger(n) || n < 1 || n > 1e9) fail('BAD_AMOUNT');
  if (!m || !Array.isArray(m.prices) || !Number.isSafeInteger(m.prices[k]) || m.prices[k] < 1) fail('NO_MARKET');
  if (seen !== undefined && seen !== m.prices[k]) fail('PRICE_CHANGED', { price: m.prices[k] });   // compra-se e vende-se só ao preço que se viu
}
export function stockBuy(p, now, world, m, k, n, seen) {
  stockArgs(m, k, n, seen);
  begin(p, now, world, { allowBusy: true });
  const total = stockQuote(m, k, n);
  const invested = CFG.stocks.list.reduce((s, _, j) => s + holding(p, m, j).cost, 0);
  if (invested + total > stockCap(p)) fail('STOCK_CAP', { cap: stockCap(p) });
  pay(p, total);
  const h = holding(p, m, k);
  p.stk[k] = { n: h.n + n, cost: h.cost + total, gen: m.gen[k] };
  return { ok: true, k, n, price: m.prices[k], paid: total, fee: stockFee(Math.ceil((n * m.prices[k]) / 100)) };
}
export function stockSell(p, now, world, m, k, n, seen) {
  stockArgs(m, k, n, seen);
  begin(p, now, world, { allowBusy: true });
  const h = holding(p, m, k);
  if (n > h.n) fail('NO_SHARES');
  const gross = Math.floor((n * m.prices[k]) / 100), fee = Math.min(gross, stockFee(gross)), got = gross - fee;
  const part = n === h.n ? h.cost : Math.floor((h.cost * n) / h.n);   // parte do que se pagou que corresponde ao que se vende
  p.stk[k] = { n: h.n - n, cost: h.cost - part, gen: m.gen[k] };
  p.cash += got;
  return { ok: true, k, n, price: m.prices[k], got, fee, profit: got - part };
}

// ---------- banco ----------

export function bankFeeBp(p) { return cut(CFG.bank.feeBp, klass(p).feeCutBp || 0); }
export function portSeizeBp(p) { return cut(CFG.port.seizeBp, klass(p).seizeCutBp || 0); }
export function deposit(p, now, world, amount) {
  begin(p, now, world, { allowBusy: true });
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > p.cash) fail('BAD_AMOUNT');
  const fee = Math.ceil((amount * bankFeeBp(p)) / 10000);
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
  if (kind !== 'weapon' && kind !== 'armor' && kind !== 'guard') fail('NO_GEAR');
  const list = kind === 'weapon' ? CFG.weapons : kind === 'armor' ? CFG.armors : CFG.guards;
  if (!Number.isInteger(idx) || !list[idx]) fail('NO_GEAR');
  begin(p, now, world);
  if (idx <= p[kind]) fail('ALREADY_BETTER');
  pay(p, list[idx].price);
  p[kind] = idx;
  return { ok: true, price: list[idx].price };
}

const gearBp = (list, idx) => (idx >= 0 ? list[idx].bp : 0);
export function attackPower(p, now) { return up(Math.floor((effStat(p, 'F', now) * (10000 + gearBp(CFG.weapons, p.weapon))) / 10000), (klass(p).atkBp || 0) + gbp(p, 'atk')); }
export function defensePower(p, now) { return up(Math.floor((effStat(p, 'T', now) * (10000 + gearBp(CFG.armors, p.armor))) / 10000), (klass(p).defBp || 0) + huBp(p, 1) + gbp(p, 'def') + gearBp(CFG.guards, p.guard)); }

// ---------- ataques ----------

function prune(arr, now) { const lim = now - CFG.pvp.windowMs; while (arr.length && arr[0] <= lim) arr.shift(); }

// asVictim: foi mandado para o hospital por outro (conta para o limite de 4 em 24 h)
function hospitalize(p, now, ms, asVictim) {
  const P = CFG.pvp;
  p.hospUntil = now + cut(ms, klass(p).hospCutBp || 0);
  p.protectUntil = p.hospUntil + P.protectMs;          // proteção normal: cai se ele atacar
  if (!asVictim) return;
  prune(p.hospTimes, now);
  p.hospTimes.push(now);
  if (p.hospTimes.length >= P.maxHospPerWindow) {      // limite fixo: não cai
    const oldest = p.hospTimes[p.hospTimes.length - P.maxHospPerWindow];
    p.capUntil = Math.max(p.capUntil, oldest + P.windowMs);
  }
}

// drop: quem ataca aceitou perder o escudo de jogador novo
export function canAttack(a, d, now, world, drop = false) {
  const P = CFG.pvp;
  if (a === d || a.id === d.id) return 'SELF';
  if (a.gang && a.gang === d.gang) return 'SAME_GANG';   // ninguém ataca a própria gangue
  if (now - world.start < CFG.round.noPvpMs) return 'NO_PVP_YET';
  if (a.jailUntil > now) return 'IN_JAIL';
  if (a.hospUntil > now) return 'IN_HOSPITAL';
  if (a.energy < P.energy) return 'NO_ENERGY';
  if (a.shieldUntil > now && !drop) return 'YOU_ARE_NEW';
  if (d.shieldUntil > now) return 'TARGET_NEW';
  if (d.hospUntil > now) return 'TARGET_HOSPITAL';
  if (d.jailUntil > now) return 'TARGET_JAIL';
  if (d.protectUntil > now || d.capUntil > now) return 'TARGET_PROTECTED';
  if (d.respect * 10000 < a.respect * P.minTargetBp) return 'TARGET_TOO_WEAK';
  return null;
}

export function attackChanceBp(a, d, now) { return chanceBp(attackPower(a, now), defensePower(d, now)); }

// ---------- assassino a soldo ----------
export function hitmanPrice(d) { const H = CFG.hitman; return Math.max(H.priceMin, d.respect * H.pricePerRespect); }
export function hitmanChanceBp(d) { const H = CFG.hitman; return Math.max(H.minBp, H.baseBp - (d.guard >= 0 ? CFG.guards[d.guard].block : 0)); }
export function hitmanLeft(a, now) { return Math.max(0, CFG.hitman.perDay - a.hmT.filter((t) => t > now - CFG.pvp.windowMs).length); }
// porque não se pode encomendar (ou null). Quem encomenda pode estar preso ou no hospital, e não gasta stamina.
export function canHitman(a, d, now, world, drop = false) {
  const P = CFG.pvp, H = CFG.hitman;
  if (a === d || a.id === d.id) return 'SELF';
  if (a.gang && a.gang === d.gang) return 'SAME_GANG';
  if (now - world.start < CFG.round.noPvpMs) return 'NO_PVP_YET';
  if (level(a) < H.minLevel) return 'LOW_LEVEL';
  if (a.shieldUntil > now && !drop) return 'YOU_ARE_NEW';
  if (hitmanLeft(a, now) <= 0) return 'HITMAN_LIMIT';
  if (d.shieldUntil > now) return 'TARGET_NEW';
  if (d.hospUntil > now) return 'TARGET_HOSPITAL';
  if (d.jailUntil > now) return 'TARGET_JAIL';
  if (d.protectUntil > now || d.capUntil > now) return 'TARGET_PROTECTED';
  if (d.hmSafe > now) return 'HITMAN_SAFE';
  if (d.respect * 10000 < a.respect * P.minTargetBp) return 'TARGET_TOO_WEAK';
  return null;
}
export function hitman(a, d, now, world, rng, drop = false) {
  begin(a, now, world, { allowBusy: true });
  touch(d, now);
  const why = canHitman(a, d, now, world, drop);
  if (why) fail(why, why === 'LOW_LEVEL' ? { need: CFG.hitman.minLevel } : undefined);
  const H = CFG.hitman, price = hitmanPrice(d), bp = hitmanChanceBp(d);
  pay(a, price);                                   // paga-se adiantado: se falhar, o dinheiro não volta
  if (a.shieldUntil > now) a.shieldUntil = 0;      // só chega aqui com escudo quem aceitou perdê-lo
  a.protectUntil = 0;                              // quem manda bater perde a proteção, como quem ataca
  pruneT(a.hmT, now, CFG.pvp.windowMs); a.hmT.push(now);
  if (!rng.chance(bp)) return { ok: true, success: false, price, chanceBp: bp };
  const respLoss = Math.min(d.respect, Math.floor((d.respect * H.respBp) / 10000)), cashLoss = Math.floor((d.cash * H.cashBp) / 10000);
  addRespect(d, -respLoss, now);
  d.cash -= cashLoss;
  hospitalize(d, now, H.hospMs, true);
  d.hmSafe = now + H.immuneMs;
  return { ok: true, success: true, price, chanceBp: bp, respLoss, cashLoss, hospUntil: d.hospUntil };
}

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
  let v = take(cut(d.cash, huBp(d, 0)));
  for (let i = 0; i < st.length; i++) if (CFG.biz[i].raid) v += take(st[i].money);
  const vv = venueView(d, Math.max(now, d.t));
  for (const k of ['club', 'bro']) if (vv[k]) v += take(vv[k].till);
  return v;
}

// ganho por vitória (antes do desconto por repetir o alvo)
export function pvpBaseGain(a, d) {
  const P = CFG.pvp;
  const ratioBp = clamp(Math.floor((10000 * d.respect) / Math.max(1, a.respect)), P.ratioMinBp, P.ratioMaxBp);
  const sqrtBp = Math.floor(Math.sqrt(ratioBp * 10000)); // 5000..20000
  return up(Math.floor(((P.gainBase + level(a)) * sqrtBp) / 10000), klass(a).pvpBp || 0);
}

export function expectedGain(a, d, now) {
  const div = 2 ** Math.min(priorWins(a, d, now), 10);
  return Math.floor(pvpBaseGain(a, d) / div);
}

export function attack(a, d, now, world, mode, rng, drop = false) {
  begin(a, now, world);
  touch(d, now);
  if (mode !== 'beat' && mode !== 'mug') fail('BAD_MODE');
  const why = canAttack(a, d, now, world, drop);
  if (why) fail(why);
  const P = CFG.pvp;
  const shieldLost = a.shieldUntil > now; if (shieldLost) a.shieldUntil = 0;   // só chega aqui com escudo quem aceitou perdê-lo; não volta
  a.energy -= P.energy;
  a.protectUntil = 0; // quem ataca perde a proteção
  const bp = attackChanceBp(a, d, now);
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
      let stolen = take(cut(d.cash, huBp(d, 0)));   // o cofre de casa guarda uma parte
      d.cash -= stolen;
      for (let i = 0; i < d.biz.length; i++) {
        if (!CFG.biz[i].raid) continue;
        const s = take(d.biz[i].stored);
        d.biz[i].stored -= s; stolen += s;
      }
      for (const k of ['club', 'bro']) if (d[k]) { const s = take(d[k].till); d[k].till -= s; stolen += s; }   // e o caixa da discoteca e do bordel
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

// ---------- golpes e tareias em grupo (gangues) ----------
// Quem alinha paga a stamina logo. O servidor junta quem alinhou e chama a resolução quando o tempo acaba;
// se não houver gente que chegue, a stamina volta.
const pruneT = (arr, now, ms) => { while (arr.length && arr[0] <= now - ms) arr.shift(); };
const heistOf = (k) => (Number.isInteger(k) ? CFG.gang.heists[k] : undefined) || fail('NO_CRIME');
export function heistJoin(p, now, world, k) {
  const H = heistOf(k);
  begin(p, now, world);
  if (!p.gang) fail('NO_GANG');
  const feitos = p.gh.filter((x) => x > now - T.DAY);   // só conta: um pedido recusado não mexe em nada
  if (feitos.length >= CFG.gang.heistPerDay) fail('HEIST_LIMIT', { until: feitos[0] + T.DAY });
  if (p.energy < H.e) fail('NO_ENERGY', { need: H.e });
  pruneT(p.gh, now, T.DAY);
  p.energy -= H.e; p.gh.push(now);
  return { ok: true, e: H.e };
}
export function heistRefund(p, now, k) { touch(p, now); p.energy = Math.min(CFG.energy.max, p.energy + heistOf(k).e); p.gh.pop(); }
export function heistChanceBp(ps, k, now) {
  const { w, D } = heistOf(k); let s = 0;
  for (const p of ps) s += Math.floor((w.I * effStat(p, 'I', now) + w.F * effStat(p, 'F', now) + w.C * effStat(p, 'C', now)) / 100);
  return chanceBp(s, D);
}
export function heistResolve(ps, now, k, rng) {
  const H = heistOf(k);
  for (const p of ps) touch(p, now);
  const bp = heistChanceBp(ps, k, now);
  if (rng.chance(bp)) {
    const each = rng.int(H.min, H.max);   // o mesmo para todos, antes do bónus de saque da gangue
    return { ok: true, success: true, chanceBp: bp, parts: ps.map((p) => {
      const money = Math.floor((each * (10000 + gbp(p, 'loot'))) / 10000);
      p.cash += money;
      return { id: p.id, money, respect: H.r, levelUp: addRespect(p, H.r, now) };
    }) };
  }
  return { ok: true, success: false, chanceBp: bp, parts: ps.map((p) => {
    const busted = !(p.jailUntil > now) && !(p.hospUntil > now) && rng.chance(bustChanceBp(p, now));
    if (busted) { p.jailUntil = now + H.jailMin * T.MIN; p.jailTier = H.bailAs + 1; }
    return { id: p.id, money: 0, respect: 0, busted };
  }) };
}
export function hitJoin(a, d, now, world, drop = false) {
  begin(a, now, world);
  touch(d, now);
  if (!a.gang) fail('NO_GANG');
  if (a.gang === d.gang) fail('SAME_GANG');
  const why = canAttack(a, d, now, world, drop);
  if (why) fail(why);
  if (a.shieldUntil > now) a.shieldUntil = 0;
  a.energy -= CFG.pvp.energy;
  return { ok: true, e: CFG.pvp.energy };
}
export function hitRefund(a, now) { touch(a, now); a.energy = Math.min(CFG.energy.max, a.energy + CFG.pvp.energy); }
export function hitChanceBp(as, d, now) {
  let s = 0; for (const a of as) s += attackPower(a, now);
  return chanceBp(Math.floor((s * CFG.gang.hitTeamBp) / 10000), defensePower(d, now));
}
// o alvo tem de continuar à mão quando o tempo acaba (não pode ter ido entretanto para o hospital ou para a prisão)
export function hitCanResolve(d, now, gang) { touch(d, now); return !(d.hospUntil > now || d.jailUntil > now || d.protectUntil > now || d.capUntil > now || d.shieldUntil > now || (gang && d.gang === gang)); }
// quem alinhou e entretanto foi preso ou parar ao hospital fica de fora (e recebe a stamina de volta)
export function opReady(p, now) { touch(p, now); return !(p.jailUntil > now || p.hospUntil > now); }
export function hitResolve(as, d, now, rng) {
  const P = CFG.pvp, G = CFG.gang;
  for (const a of as) touch(a, now);
  touch(d, now);
  const bp = hitChanceBp(as, d, now);
  if (rng.chance(bp)) {
    let loss = 0;
    const parts = as.map((a) => {
      const gain = Math.floor((Math.floor(pvpBaseGain(a, d) / 2 ** Math.min(priorWins(a, d, now), 10)) * G.hitShareBp) / 10000);
      loss = Math.max(loss, Math.floor(gain / P.lossDiv));
      a.protectUntil = 0; a.c.pvpWins += 1;
      if (!a.hits.has(d.id)) a.hits.set(d.id, []);
      a.hits.get(d.id).push(now);
      return { id: a.id, respect: gain, levelUp: addRespect(a, gain, now) };
    });
    addRespect(d, -loss, now);
    hospitalize(d, now, Math.floor((P.beatHospMs * G.hitHospBp) / 10000), true);
    return { ok: true, win: true, chanceBp: bp, targetLoss: loss, parts };
  }
  let defGain = 0;
  const parts = as.map((a) => {
    const loss = Math.floor(pvpBaseGain(a, d) / P.lossDiv);
    if (a.respect * 10000 >= d.respect * P.minTargetBp) defGain = P.defendGain;
    addRespect(a, -loss, now); a.protectUntil = 0;
    if (!(a.hospUntil > now)) hospitalize(a, now, P.beatHospMs, false);
    return { id: a.id, respect: -loss };
  });
  addRespect(d, defGain, now);
  return { ok: true, win: false, chanceBp: bp, defenderGain: defGain, parts };
}

// ---------- casino ----------
// Tudo decidido aqui, no servidor, com o gerador aleatório do servidor. Aposta-se só o dinheiro que tens na mão.
export function casinoMax(p) {
  const C = CFG.casino; let m = C.maxBase;
  for (let i = 1; i < level(p); i++) m = Math.floor((m * C.maxNum) / C.maxDen);
  return m;
}
// k: quantas vezes o máximo por jogada se pode apostar (as compras de bónus das slots têm um teto mais alto)
function stakeOf(p, amounts, k = 1) {
  const C = CFG.casino;
  if (!Array.isArray(amounts) || !amounts.length || amounts.length > C.maxBets) fail('BAD_BET');
  let tot = 0;
  for (const a of amounts) { if (!Number.isSafeInteger(a) || a < C.minBet) fail('BAD_BET'); tot += a; }
  if (tot > casinoMax(p) * k) fail('BET_TOO_BIG', { max: casinoMax(p) * k });
  if (tot > p.cash) fail('NO_CASH');
  return tot;
}
const RED = new Set(CFG.casino.red);
const RL_TYPES = ['red', 'black', 'even', 'odd', 'low', 'high', 'dozen', 'num'];
// quanto volta (contando com a aposta) por cada ficha, se sair o número n
export function rouletteReturn(b, n) {
  switch (b.t) {
    case 'red': return n > 0 && RED.has(n) ? 2 : 0;
    case 'black': return n > 0 && !RED.has(n) ? 2 : 0;
    case 'even': return n > 0 && n % 2 === 0 ? 2 : 0;
    case 'odd': return n % 2 === 1 ? 2 : 0;
    case 'low': return n >= 1 && n <= 18 ? 2 : 0;
    case 'high': return n >= 19 ? 2 : 0;
    case 'dozen': return n > 0 && Math.floor((n - 1) / 12) === b.n ? 3 : 0;
    case 'num': return n === b.n ? 36 : 0;
    default: return 0;
  }
}
function roulette(p, a, rng) {
  const bets = Array.isArray(a.bets) ? a.bets : [];
  for (const b of bets) {
    if (!b || !RL_TYPES.includes(b.t)) fail('BAD_BET');
    if (b.t === 'dozen' && !(Number.isInteger(b.n) && b.n >= 0 && b.n <= 2)) fail('BAD_BET');
    if (b.t === 'num' && !(Number.isInteger(b.n) && b.n >= 0 && b.n <= 36)) fail('BAD_BET');
  }
  const bet = stakeOf(p, bets.map((b) => b && b.amt));
  p.cash -= bet;
  const n = rng.int(0, 36);
  let win = 0;
  const out = bets.map((b) => { const r = b.amt * rouletteReturn(b, n); win += r; return { t: b.t, n: b.n ?? null, amt: b.amt, ret: r }; });
  p.cash += win;
  return { ok: true, g: 'roulette', bet, win, n, bets: out };
}
function dice(p, a, rng) {
  const mult = CFG.casino.dice[a.pick];
  if (!Object.hasOwn(CFG.casino.dice, a.pick)) fail('BAD_BET');
  const bet = stakeOf(p, [a.amt]);
  p.cash -= bet;
  const d = [rng.int(1, 6), rng.int(1, 6)], s = d[0] + d[1];
  const hit = a.pick === 'low' ? s < 7 : a.pick === 'seven' ? s === 7 : s > 7;
  const win = hit ? Math.floor((bet * mult) / 10) : 0;
  p.cash += win;
  return { ok: true, g: 'dice', bet, win, d, pick: a.pick };
}
// blackjack: cartas 0..51 (valor = c % 13: 0 ás, 1..8 = 2..9, 9..12 = 10, valete, dama, rei).
// As cartas que ainda vão sair ficam só no servidor; o jogador só vê as suas e a primeira do dealer.
export function bjValue(cards) {
  let tot = 0, aces = 0;
  for (const c of cards) { const r = c % 13; if (r === 0) { aces++; tot += 11; } else tot += r >= 9 ? 10 : r + 1; }
  while (tot > 21 && aces) { tot -= 10; aces--; }
  return { tot, soft: aces > 0 };
}
const isBJ = (cards) => cards.length === 2 && bjValue(cards).tot === 21;
function bjShoe(rng) {
  const { decks, draw } = CFG.casino.bj, left = new Array(52).fill(decks), out = [];
  let total = 52 * decks;
  for (let k = 0; k < draw; k++) {
    let x = rng.int(0, total - 1), c = 0;
    while (x >= left[c]) { x -= left[c]; c++; }
    left[c]--; total--; out.push(c);
  }
  return out;
}
// Dividir: com duas cartas do mesmo valor, o jogador pode separá-las em duas mãos (uma vez por jogada), pondo outra aposta igual.
// h.pl/h.bet/h.dbl são sempre da mão que está a ser jogada; h.fin guarda as mãos já jogadas e h.q a que ainda espera.
// Depois de dividir, 21 com duas cartas vale como 21 normal (paga 1 para 1) e dois ases recebem uma carta cada e ficam por aí.
const bjRank = (c) => { const r = c % 13; return r >= 9 ? 10 : r + 1; };
const bjCanSplit = (h) => h.pl.length === 2 && !h.sp && bjRank(h.pl[0]) === bjRank(h.pl[1]);
const bjHands = (h) => [...(h.fin || []), { pl: h.pl, bet: h.bet, dbl: h.dbl }, ...(h.q || [])];
// A jogada que perde menos a longo prazo (estratégia básica para estas regras: 6 baralhos, dealer pára em todos os 17, dobra-se com
// quaisquer 2 cartas, também depois de dividir, e só se divide uma vez). Devolve [melhor, alternativa]: a alternativa é pedir ou ficar,
// para quando a melhor é dobrar ou dividir e não há dinheiro na mão para isso. Só usa o que o jogador vê: as suas cartas e a 1.ª do dealer.
export function bjTip(pl, up0, canSplit) {
  const up = up0 % 13 === 0 ? 11 : bjRank(up0), { tot, soft } = bjValue(pl), two = pl.length === 2, btw = (a, b) => up >= a && up <= b;
  let alt;
  if (soft) alt = tot >= 19 || (tot === 18 && up <= 8) ? 'stand' : 'hit';
  else alt = tot >= 17 || (tot >= 13 && up <= 6) || (tot === 12 && btw(4, 6)) ? 'stand' : 'hit';
  if (canSplit && two) {
    const v = pl[0] % 13 === 0 ? 11 : bjRank(pl[0]);
    if (v === 11 || v === 8 || ((v === 2 || v === 3 || v === 7) && up <= 7) || (v === 4 && btw(5, 6)) || (v === 6 && up <= 6) || (v === 9 && up <= 9 && up !== 7)) return ['split', alt];
  }
  if (two) {
    const d = soft ? (tot >= 17 && tot <= 18 ? btw(3, 6) : tot >= 15 && tot <= 16 ? btw(4, 6) : tot >= 13 && tot <= 14 ? btw(5, 6) : false)
      : tot === 11 ? up <= 10 : tot === 10 ? up <= 9 : tot === 9 ? btw(3, 6) : false;
    if (d) return ['double', alt];
  }
  return [alt, alt];
}
function bjView(h, done) {
  const v = { bet: h.bet, dbl: h.dbl, pl: h.pl.slice(), tot: bjValue(h.pl).tot };
  if (done) { v.dl = h.dl.slice(); v.dtot = bjValue(h.dl).tot; } else { v.dl = [h.dl[0]]; if (bjCanSplit(h)) v.split = true; v.tip = bjTip(h.pl, h.dl[0], !!v.split); }
  if (h.sp) { v.cur = (h.fin || []).length; v.hands = bjHands(h).map((x) => ({ pl: x.pl.slice(), tot: bjValue(x.pl).tot, bet: x.bet, dbl: !!x.dbl })); }
  return v;
}
// a mão que estava a ser jogada acabou (ficou, dobrou, fez 21 ou rebentou): passa à seguinte, se houver, ou fecha as contas
function bjNext(p, h, bet) {
  while (h.q && h.q.length) {
    (h.fin ||= []).push({ pl: h.pl, bet: h.bet, dbl: h.dbl });
    const nx = h.q.shift(); h.pl = nx.pl; h.bet = nx.bet; h.dbl = false;
    if (!h.aces && bjValue(h.pl).tot < 21) return { ok: true, g: 'bj', bet, win: 0, done: false, hand: bjView(h, false) };
  }
  return bjFinish(p, h, bet);
}
function bjFinish(p, h, bet) {
  const hands = bjHands(h), natural = !h.sp && isBJ(h.pl);
  if (!natural && hands.some((x) => bjValue(x.pl).tot <= 21)) while (bjValue(h.dl).tot < 17) h.dl.push(h.next.shift()); // o dealer pára em 17 (também no 17 com ás)
  const dv = bjValue(h.dl).tot, dbj = isBJ(h.dl);
  let win = 0, staked = 0;
  const outs = hands.map((x) => {
    const pv = bjValue(x.pl).tot;
    const res = pv > 21 ? 'bust' : natural && !dbj ? 'bj' : dbj && !natural ? 'lose' : dv > 21 || pv > dv ? 'win' : pv === dv ? 'push' : 'lose';
    const w = res === 'bj' ? x.bet + Math.floor((x.bet * 3) / 2) : res === 'win' ? x.bet * 2 : res === 'push' ? x.bet : 0;
    win += w; staked += x.bet;
    return { pl: x.pl.slice(), tot: pv, bet: x.bet, dbl: !!x.dbl, res, win: w };
  });
  p.cash += win; p.bj = null;
  const hand = bjView(h, true); hand.bet = staked;   // no fim, «bet» é tudo o que esteve na mesa nesta jogada
  let res = outs[0].res;
  if (h.sp) { hand.hands = outs; hand.cur = -1; res = win > staked ? 'win' : win === staked ? 'push' : outs.every((o) => o.res === 'bust') ? 'bust' : 'lose'; }
  return { ok: true, g: 'bj', bet, win, done: true, res, hand };
}
function bjDeal(p, a, rng) {
  if (p.bj) fail('BJ_OPEN');
  const bet = stakeOf(p, [a.amt]);
  p.cash -= bet;
  const n = bjShoe(rng);
  const h = { bet, dbl: false, pl: [n[0], n[2]], dl: [n[1], n[3]], next: n.slice(4) };
  p.bj = h;
  if (isBJ(h.pl) || isBJ(h.dl)) return bjFinish(p, h, bet);  // o dealer espreita: com blackjack de alguém, a mão acaba já
  return { ok: true, g: 'bj', bet, win: 0, done: false, hand: bjView(h, false) };
}
function bjMove(p, op, rng) {
  const h = p.bj;
  if (!h) fail('NO_HAND');
  if (op === 'double' && (h.pl.length !== 2 || h.dbl)) fail('NO_DOUBLE');
  if (op === 'split' && !bjCanSplit(h)) fail('NO_SPLIT');
  if ((op === 'double' || op === 'split') && p.cash < h.bet) fail('NO_CASH');
  while (h.next.length < 16) h.next.push(rng.int(0, 51));   // nunca falta carta (com 6 baralhos isto quase nunca acontece)
  if (op === 'hit') {
    h.pl.push(h.next.shift());
    if (bjValue(h.pl).tot >= 21) return bjNext(p, h, 0);
    return { ok: true, g: 'bj', bet: 0, win: 0, done: false, hand: bjView(h, false) };
  }
  if (op === 'stand') return bjNext(p, h, 0);
  if (op === 'double') {
    p.cash -= h.bet;
    const extra = h.bet; h.bet *= 2; h.dbl = true;
    h.pl.push(h.next.shift());
    return bjNext(p, h, extra);
  }
  if (op === 'split') {
    p.cash -= h.bet;
    const [c0, c1] = h.pl;
    h.sp = true; h.aces = c0 % 13 === 0; h.fin = [];
    h.pl = [c0, h.next.shift()]; h.q = [{ pl: [c1, h.next.shift()], bet: h.bet }];
    if (h.aces || bjValue(h.pl).tot === 21) return bjNext(p, h, h.bet);
    return { ok: true, g: 'bj', bet: h.bet, win: 0, done: false, hand: bjView(h, false) };
  }
  fail('BAD_BET');
}
// ---- Roda da Fortuna ----
function pickW(rng, list) {
  let tot = 0; for (const [, w] of list) tot += w;
  let x = rng.int(0, tot - 1);
  for (const [v, w] of list) { if (x < w) return v; x -= w; }
  return list[list.length - 1][0];
}
export function wheelSpin(rng) {
  const W = CFG.casino.wheel;
  // multiplicador do topo: uma casa (ou nenhuma) com ×2 a ×50 nesta volta
  let x = rng.int(0, 9999), top = null;
  for (const s of W.spots) { if (x < W.top[s]) { top = { s, m: pickW(rng, W.topMult) }; break; } x -= W.top[s]; }
  const idx = rng.int(0, W.segs.length - 1), s = W.segs[idx];
  let bonus = null, B = W.num[s] ?? 0;
  if (s === 'moeda') { const sides = [pickW(rng, W.moeda), pickW(rng, W.moeda)], side = rng.int(0, 1); B = sides[side]; bonus = { sides, side }; }
  else if (s === 'caixas') { const boxes = Array.from({ length: W.caixasN }, () => pickW(rng, W.caixas)), pick = rng.int(0, W.caixasN - 1); B = boxes[pick]; bonus = { boxes, pick }; }
  else if (s === 'bola' || s === 'louca') {
    const slots = Array.from({ length: s === 'bola' ? W.bolaSlots : W.loucaSlots }, () => pickW(rng, W[s])), at = rng.int(0, slots.length - 1);
    B = slots[at]; bonus = { slots, at };
  }
  const m = top && top.s === s ? top.m : 1;
  return { idx, s, top, bonus, mult: B * m };   // quem apostou em s recebe aposta × (mult + 1)
}
function wheel(p, a, rng) {
  const W = CFG.casino.wheel, bets = Array.isArray(a.bets) ? a.bets : [];
  for (const b of bets) if (!b || !W.spots.includes(b.s)) fail('BAD_BET');
  const bet = stakeOf(p, bets.map((b) => b && b.amt));
  p.cash -= bet;
  const sp = wheelSpin(rng);
  let win = 0;
  for (const b of bets) if (b.s === sp.s) win += b.amt * (sp.mult + 1);
  win = Math.min(win, bet * CFG.casino.maxWinMult);
  p.cash += win;
  return { ok: true, g: 'wheel', bet, win, ...sp };
}
// ---- mesas ao vivo (roleta e roda) ----
// A ronda é de todos: cada um aposta enquanto a mesa está aberta (o dinheiro sai logo da mão),
// o servidor tira um só resultado e paga a toda a gente. As contas são as mesmas da jogada a solo.
const tableKey = (g, b) => (g === 'roulette' ? b.t + ':' + (b.n ?? '') : b.s);
function tableClean(g, bets) {
  if (!Array.isArray(bets) || !bets.length || bets.length > CFG.casino.maxBets) fail('BAD_BET');
  return bets.map((b) => {
    if (!b || !Number.isSafeInteger(b.amt) || b.amt < CFG.casino.minBet) fail('BAD_BET');
    if (g === 'roulette') {
      if (!RL_TYPES.includes(b.t)) fail('BAD_BET');
      if (b.t === 'dozen' && !(Number.isInteger(b.n) && b.n >= 0 && b.n <= 2)) fail('BAD_BET');
      if (b.t === 'num' && !(Number.isInteger(b.n) && b.n >= 0 && b.n <= 36)) fail('BAD_BET');
      return b.t === 'dozen' || b.t === 'num' ? { t: b.t, n: b.n, amt: b.amt } : { t: b.t, amt: b.amt };
    }
    if (!CFG.casino.wheel.spots.includes(b.s)) fail('BAD_BET');
    return { s: b.s, amt: b.amt };
  });
}
export const tableTotal = (bets) => bets.reduce((x, b) => x + b.amt, 0);
// junta apostas novas às que o jogador já tem nesta ronda; devolve a lista completa
export function tableBet(p, now, world, g, add, mine = []) {
  if (g !== 'roulette' && g !== 'wheel') fail('NO_GAME');
  begin(p, now, world);
  const novo = tableClean(g, add), all = new Map(mine.map((b) => [tableKey(g, b), { ...b }]));
  let bet = 0;
  for (const b of novo) { const k = tableKey(g, b), cur = all.get(k); if (cur) cur.amt += b.amt; else all.set(k, b); bet += b.amt; }
  if (all.size > CFG.casino.maxBets) fail('BAD_BET');
  const bets = [...all.values()], total = tableTotal(bets);
  if (!Number.isSafeInteger(total) || total > casinoMax(p)) fail('BET_TOO_BIG', { max: casinoMax(p) });
  if (bet > p.cash) fail('NO_CASH');
  p.cash -= bet;
  return { ok: true, g, bet, bets, total };
}
// tirar as apostas da mesa enquanto ela está aberta: o dinheiro volta todo
export function tableClear(p, mine) {
  const back = tableTotal(mine);
  p.cash += back;
  return { ok: true, back, bets: [], total: 0 };
}
export function tableDraw(g, rng) { return g === 'roulette' ? { n: rng.int(0, 36) } : wheelSpin(rng); }
// quanto volta ao jogador (aposta incluída) com este resultado
export function tablePay(g, bets, res) {
  let win = 0;
  if (g === 'roulette') for (const b of bets) win += b.amt * rouletteReturn(b, res.n);
  else { for (const b of bets) if (b.s === res.s) win += b.amt * (res.mult + 1); win = Math.min(win, tableTotal(bets) * CFG.casino.maxWinMult); }
  return win;
}
export function tableCredit(p, win) { if (!Number.isSafeInteger(win) || win < 0) fail('BAD_BET'); p.cash += win; }

// ---- slots ----
const cellW = (rng, w) => { let tot = 0; for (const x of w) tot += x; let r = rng.int(0, tot - 1); for (let i = 0; i < w.length; i++) { if (r < w[i]) return i; r -= w[i]; } return w.length - 1; };
// garante pelo menos «need» scatters na grelha inicial (compra de bónus)
function forceScat(g, need, SC, rng) {
  let have = g.filter((s) => s === SC).length;
  while (have < need) { const i = rng.int(0, g.length - 1); if (g[i] !== SC) { g[i] = SC; have++; } }
}
// cair: cada coluna desce o que sobra e enche por cima (linha 0 em cima; índice = linha × colunas + coluna)
function gravity(G, g, extra, rm, fill) {
  const C = G.cols, R = G.rows, n = C * R, rmS = new Set(rm), ng = new Array(n), ne = {};
  for (let c = 0; c < C; c++) {
    const keep = [];
    for (let r = R - 1; r >= 0; r--) { const i = r * C + c; if (!rmS.has(i)) keep.push([g[i], extra[i]]); }
    for (let r = R - 1, k = 0; r >= 0; r--, k++) {
      const i = r * C + c;
      if (k < keep.length) { ng[i] = keep[k][0]; if (keep[k][1] !== undefined) ne[i] = keep[k][1]; } else { const [s, x] = fill(); ng[i] = s; if (x !== undefined) ne[i] = x; }
    }
  }
  return [ng, ne];
}
function scatterRound(G, rng, free, force) {
  const n = G.cols * G.rows, SC = G.nsym, ORB = G.nsym + 1, w = free ? G.wFree : G.w;
  const fill = () => { const s = cellW(rng, w); return [s, s === ORB ? pickW(rng, G.orb) : undefined]; };
  let g = [], orbs = {};
  for (let i = 0; i < n; i++) { const [s, x] = fill(); g.push(s); if (x !== undefined) orbs[i] = x; }
  if (force) { forceScat(g, G.trig, SC, rng); for (const k of Object.keys(orbs)) if (g[k] !== ORB) delete orbs[k]; }
  const steps = [{ g: g.slice(), o: { ...orbs } }];
  let win = 0;
  for (let t = 0; t < 40; t++) {
    const cnt = new Array(G.nsym).fill(0);
    for (const s of g) if (s < SC) cnt[s]++;
    const wins = [];
    for (let s = 0; s < G.nsym; s++) if (cnt[s] >= G.min) wins.push({ s, n: cnt[s], pay: G.pay[s][cnt[s] >= G.min + 4 ? 2 : cnt[s] >= G.min + 2 ? 1 : 0] });
    if (!wins.length) break;
    const rm = [];
    for (let i = 0; i < n; i++) if (wins.some((x) => x.s === g[i])) rm.push(i);
    win += wins.reduce((x, y) => x + y.pay, 0);
    Object.assign(steps[steps.length - 1], { w: wins, rm });
    [g, orbs] = gravity(G, g, orbs, rm, fill);
    steps.push({ g: g.slice(), o: { ...orbs } });
  }
  return { steps, win, orbSum: Object.values(orbs).reduce((x, y) => x + y, 0), scat: g.filter((s) => s === SC).length };
}
// grupos 7×7: casas encostadas (cima, baixo, lados) com o mesmo símbolo
function clusters(G, g) {
  const C = G.cols, n = g.length, seen = new Uint8Array(n), out = [];
  for (let i = 0; i < n; i++) {
    if (seen[i] || g[i] >= G.nsym) continue;
    const s = g[i], stack = [i], cells = []; seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(); cells.push(j);
      const r = Math.floor(j / C), c = j % C;
      for (const k of [c > 0 ? j - 1 : -1, c < C - 1 ? j + 1 : -1, r > 0 ? j - C : -1, j + C < n ? j + C : -1]) if (k >= 0 && !seen[k] && g[k] === s) { seen[k] = 1; stack.push(k); }
    }
    if (cells.length >= G.min) out.push({ s, cells });
  }
  return out;
}
function clusterRound(G, rng, free, spots, force) {
  const n = G.cols * G.rows, SC = G.nsym, w = free ? G.wFree : G.w, fill = () => [cellW(rng, w)];
  let g = Array.from({ length: n }, () => cellW(rng, w));
  if (force) forceScat(g, G.trig, SC, rng);
  const steps = [{ g: g.slice(), sp: spots.slice() }];
  let win = 0;
  for (let t = 0; t < 60; t++) {
    const cl = clusters(G, g);
    if (!cl.length) break;
    const wins = [], rm = [];
    for (const k of cl) {
      // as casas com multiplicador por baixo do grupo somam-se; depois cada casa fica marcada ou duplica
      let m = 0; for (const i of k.cells) if (spots[i] >= 2) m += spots[i];
      const pay = G.pay[k.s][Math.min(k.cells.length, G.min + 10) - G.min] * (m || 1);
      wins.push({ s: k.s, n: k.cells.length, pay, m, cells: k.cells }); win += pay; rm.push(...k.cells);
    }
    for (const i of rm) spots[i] = spots[i] === 0 ? 1 : Math.min(G.spotMax, spots[i] === 1 ? 2 : spots[i] * 2);
    Object.assign(steps[steps.length - 1], { w: wins, rm });
    [g] = gravity(G, g, {}, rm, fill);
    steps.push({ g: g.slice(), sp: spots.slice() });
  }
  return { steps, win, scat: g.filter((s) => s === SC).length };
}
// uma jogada completa (com as rodadas grátis, se as houver). buy: 0 normal, 1 compra, 2 compra super. total em centésimos da aposta.
export function slotSpin(gid, rng, buy = 0) {
  const G = CFG.casino.slots[gid], cap = G.max * 100, out = { game: gid, free: [], scatPay: 0, buy };
  let total = 0;
  if (G.kind === 'cluster') {
    const base = clusterRound(G, rng, false, new Array(G.cols * G.rows).fill(0), buy > 0);
    out.base = base; total = base.win;
    if (base.scat >= G.trig) {
      // compra super: cada casa do tabuleiro começa já com um multiplicador, sorteado casa a casa
      const spots = buy === 2 ? Array.from({ length: G.cols * G.rows }, () => pickW(rng, G.superSpots)) : new Array(G.cols * G.rows).fill(0);
      out.spots0 = spots.slice();
      let left = G.fs[Math.min(7, base.scat)], played = 0;
      out.free0 = left;
      while (left > 0 && played < G.maxFree && total < cap) {
        left--; played++;
        const r = clusterRound(G, rng, true, spots, false);
        const add = r.scat >= G.trig ? G.fs[Math.min(7, r.scat)] : 0;
        left += add; total += r.win;
        // add: rodadas ganhas nesta rodada; left: as que ficam por jogar (o limite de rodadas e o prémio máximo acabam o bónus)
        out.free.push({ ...r, w: r.win, add, left: total < cap ? Math.min(left, G.maxFree - played) : 0 });
      }
    }
  } else {
    const base = scatterRound(G, rng, false, buy > 0);
    out.base = base;
    total = base.win * (base.win > 0 && base.orbSum ? base.orbSum : 1);
    if (base.scat >= G.trig) {
      out.scatPay = G.scatPay[Math.min(6, base.scat)]; total += out.scatPay;
      let left = G.free, played = 0, acc = 0;
      out.free0 = left;
      while (left > 0 && played < G.maxFree && total < cap) {
        left--; played++;
        const r = scatterRound(G, rng, true, false);
        // accAll: nas rodadas grátis todas as esferas que caem ficam no multiplicador acumulado, mesmo que essa rodada não tenha prémio
        let m = r.orbSum && (r.win > 0 || G.accAll) ? r.orbSum : 0;
        if (G.accFree) { acc += m; m = acc; }
        const w2 = r.win * (r.win > 0 && m ? m : 1);
        const add = r.scat >= G.retrig[0] ? G.retrig[1] : 0;
        left += add; total += w2;
        out.free.push({ ...r, acc: m, w: w2, add, left: total < cap ? Math.min(left, G.maxFree - played) : 0 });
      }
    }
  }
  out.total = Math.min(total, cap);
  return out;
}
function slot(p, a, rng) {
  const gid = Object.hasOwn(CFG.casino.slots, a.game) ? a.game : null;
  if (!gid) fail('BAD_BET');
  if (![0, 1, 2].includes(a.buy ?? 0)) fail('BAD_BET');
  const G = CFG.casino.slots[gid], buy = a.buy ?? 0;
  const mult = buy === 2 ? G.superBuy : buy === 1 ? G.buy : 1;
  if (!mult || !Number.isSafeInteger(a.amt)) fail('BAD_BET');
  if (a.amt < CFG.casino.minBet) fail('BAD_BET');
  const bet = stakeOf(p, [a.amt * mult], buy ? CFG.casino.buyMaxMult : 1);
  p.cash -= bet;
  const sp = slotSpin(gid, rng, buy);
  const win = Math.floor((a.amt * sp.total) / 100);
  p.cash += win;
  return { ok: true, g: 'slot', game: gid, bet, base: a.amt, buy, win, spin: sp };
}
export function bjPublic(p) { return p.bj ? bjView(p.bj, false) : null; }
export function casinoPlay(p, now, world, g, a, rng) {
  if (!a || typeof a !== 'object') fail('BAD_BET');
  if (g === 'bj' && a.op !== 'deal') {
    if (!['hit', 'stand', 'double', 'split'].includes(a.op)) fail('BAD_BET');
    begin(p, now, world, { allowBusy: true });       // uma mão começada pode acabar-se mesmo no hospital
    return bjMove(p, a.op, rng);
  }
  if (!['roulette', 'dice', 'bj', 'wheel', 'slot'].includes(g)) fail('NO_GAME');
  begin(p, now, world);
  if (g === 'roulette') return roulette(p, a, rng);
  if (g === 'wheel') return wheel(p, a, rng);
  if (g === 'slot') return slot(p, a, rng);
  if (g === 'dice') return dice(p, a, rng);
  return bjDeal(p, a, rng);
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
    case 'gear': return (p.weapon >= 0 ? 1 : 0) + (p.armor >= 0 ? 1 : 0);   // os guardas não contam para este objetivo (pede 2: arma e proteção)
    case 'biz': return p.biz.reduce((s, b) => s + b.n, 0);
    case 'lux': return p.luxuries;
    default: return 0;
  }
}

// o objetivo atual, ou null quando a cadeia acabou
export function mission(p) {
  const m = CFG.missions[p.mq[0]];
  if (!m) return null;
  const have = Math.min(m.need, missionHave(p, m.type));
  // swapAt: a partir de quando se pode trocar por outro (0 = não há outro para pôr no lugar)
  return { i: CFG.missions.length - p.mq.length, id: m.id, type: m.type, need: m.need, have, cash: m.cash, done: have >= m.need, total: CFG.missions.length, swapAt: p.mq.length > 1 ? p.mrT + CFG.missionSwapMs : 0 };
}

export function claimMission(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  const m = mission(p);
  if (!m) fail('NO_MISSION');
  if (!m.done) fail('MISSION_NOT_DONE');
  p.cash += m.cash;
  p.mq.shift(); p.mi += 1;
  return { ok: true, id: m.id, cash: m.cash, next: mission(p) };
}
// trocar o objetivo: o que está à vista vai para o fim da fila e aparece o seguinte. Uma vez por hora; não dá nem tira dinheiro.
export function swapMission(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  const m = mission(p);
  if (!m) fail('NO_MISSION');
  if (m.done) fail('MISSION_READY');
  if (p.mq.length < 2) fail('NO_OTHER');
  if (now < p.mrT + CFG.missionSwapMs) fail('SWAP_WAIT', { at: p.mrT + CFG.missionSwapMs });
  p.mq.push(p.mq.shift()); p.mrT = now;
  return { ok: true, skipped: m.id, next: mission(p) };
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
  if (!Number.isInteger(p.guard) || p.guard < -1 || p.guard >= CFG.guards.length) bad.push('guard');
  if (!Array.isArray(p.hmT) || p.hmT.length > CFG.hitman.perDay || p.hmT.some((t) => !Number.isSafeInteger(t)) || !Number.isSafeInteger(p.hmSafe) || p.hmSafe < 0) bad.push('hitman');
  if ((p.gang === null) !== (p.gb === null)) bad.push('gang/gb');
  if (!Array.isArray(p.gbz) || p.gbz.length !== CFG.gang.biz.length) bad.push('gang biz');
  else p.gbz.forEach((s, k) => {
    for (const f of ['inv', 'coop', 'stored', 'rem', 't']) if (!Number.isSafeInteger(s[f]) || s[f] < 0) bad.push(`gbz.${f}=${s[f]}`);
    if (s.coop > CFG.gang.bizCoopMax || s.inv > gangBizCap(p, k) || (!p.gang && (s.inv || s.stored || s.coop))) bad.push('gang biz ' + k);
  });
  if (!Array.isArray(p.gh) || p.gh.length > CFG.gang.heistPerDay) bad.push('heists');
  if (p.gb) { const G = CFG.gang; for (const k of ['loot', 'atk', 'def']) if (!Number.isSafeInteger(p.gb[k]) || p.gb[k] < 0 || p.gb[k] > (k === 'loot' ? G.lootBpPer : G.fightBpPer) * G.maxLevel) bad.push('gb.' + k); }
  if (!Array.isArray(p.detoxT) || p.detoxT.length > CFG.detox.maxSteps) bad.push('detox list');
  if (!Number.isSafeInteger(p.mi) || p.mi < 0 || p.mi > CFG.missions.length) bad.push('mission index');
  if (!Array.isArray(p.mq) || p.mq.length + p.mi !== CFG.missions.length || new Set(p.mq).size !== p.mq.length || p.mq.some((i) => !CFG.missions[i])) bad.push('mission queue');
  for (const k of Object.keys(p.c)) if (!Number.isSafeInteger(p.c[k]) || p.c[k] < 0) bad.push(`counter ${k}`);
  if (p.wk.length !== CFG.crimes.length || p.wk.some((n) => !Number.isSafeInteger(n) || n < 0)) bad.push('mastery');
  if (p.c.wins !== p.wk.reduce((s, n) => s + n, 0)) bad.push('wins!=mastery');
  for (const s of ['F', 'I', 'C']) if (!Number.isSafeInteger(p.xp?.[s]) || p.xp[s] < 0 || p.xp[s] >= practiceNeed(p, s)) bad.push(`xp ${s}=${p.xp?.[s]}`);
  if (p.energyT > p.t || p.addictionT > p.t) bad.push('timer in future');
  if (p.cls !== '' && !CFG.classes.some((c) => c.id === p.cls)) bad.push('class');
  if (!Array.isArray(p.stock) || p.stock.length !== CFG.drugs.length || p.stock.some((x) => !Number.isSafeInteger(x) || x < 0)) bad.push('stock');
  if (!Array.isArray(p.stk) || p.stk.length !== CFG.stocks.list.length || p.stk.some((h) => !h || !Number.isSafeInteger(h.n) || h.n < 0 || !Number.isSafeInteger(h.cost) || h.cost < 0 || !Number.isSafeInteger(h.gen) || (h.n === 0 && h.cost !== 0))) bad.push('shares');
  for (const k of ['club', 'bro']) { const v = p[k]; if (v === null) continue;
    if (!(v && Number.isInteger(v.lvl) && v.lvl >= 1 && v.lvl <= CFG.venue[k].cost.length && Number.isSafeInteger(v.till) && v.till >= 0 && Number.isSafeInteger(v.rem) && v.rem >= 0 && Number.isSafeInteger(v.t) && CFG.venue.prices[v.pi] !== undefined && CFG.venue.gdisc[v.gd] !== undefined)) bad.push(k);
    else if (k === 'bro' && !(Array.isArray(v.girls) && v.girls.length <= CFG.venue.bro.rooms[v.lvl - 1] && v.girls.every((i) => CFG.hookers.list[i]))) bad.push('bro girls'); }
  if (p.air !== null && !(p.air && CFG.air.routes[p.air.r] && Number.isSafeInteger(p.air.amount) && p.air.amount >= CFG.air.minAmount && Number.isSafeInteger(p.air.readyAt) && p.air.readyAt === p.air.t0 + CFG.air.routes[p.air.r].ms && typeof p.air.bribe === 'boolean')) bad.push('air');
  if (typeof p.sick !== 'boolean') bad.push('sick');
  if (!Number.isSafeInteger(p.house) || p.house < 0 || p.house >= CFG.house.tiers.length) bad.push('house');
  if (!Array.isArray(p.hu) || p.hu.length !== CFG.house.ups.length || p.hu.some((n) => !Number.isSafeInteger(n) || n < 0 || n > p.house)) bad.push('house upgrades');
  if (!Array.isArray(p.hkN) || p.hkN.length !== CFG.hookers.list.length || p.hkN.some((x) => !Number.isSafeInteger(x) || x < 0 || x > CFG.hookers.maxSteps) || !Array.isArray(p.hkAt) || p.hkAt.length !== p.hkN.length) bad.push('hooker list');
  if (!Number.isSafeInteger(p.av) || p.av < 0 || p.av >= CFG.avatars) bad.push('avatar');
  if (p.bj !== null && (typeof p.bj !== 'object' || !Number.isSafeInteger(p.bj.bet) || p.bj.bet < CFG.casino.minBet || !Array.isArray(p.bj.pl) || bjValue(p.bj.pl).tot > 21 || !Array.isArray(p.bj.next)
    || [...(p.bj.fin || []), ...(p.bj.q || [])].some((x) => !x || !Array.isArray(x.pl) || x.bet !== (x.dbl ? 2 : 1) * (p.bj.bet / (p.bj.dbl ? 2 : 1))) || (p.bj.fin || []).length + (p.bj.q || []).length > 1)) bad.push('blackjack');
  for (const k of Object.keys(p.fx)) { const f = p.fx[k]; if (!CFG.fxKinds.includes(k) || !Number.isSafeInteger(f.bp) || f.bp <= 0 || !Number.isSafeInteger(f.until)) bad.push('fx ' + k); }
  for (const s of p.biz) {
    for (const k of ['n', 'stored', 'rem', 't']) if (!Number.isSafeInteger(s[k]) || s[k] < 0) bad.push(`biz.${k}=${s[k]}`);
    if (s.rem >= T.HOUR) bad.push('biz remainder overflow');
    if (s.n > CFG.bizMax) bad.push('biz over max');
  }
  return bad;
}
