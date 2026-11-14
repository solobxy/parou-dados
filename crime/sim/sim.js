// Simulação de uma ronda completa com jogadores virtuais.
// Uso: node sim/sim.js [semente] [jogadores] [saida.json]

import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import { writeFileSync } from 'node:fs';

const SEED = +(process.argv[2] ?? 1);
const N = +(process.argv[3] ?? 800);
const OUT = process.argv[4] ?? null;
const rng = seededRng(SEED);         // sorte do jogo
const brain = seededRng(SEED * 7919 + 13); // decisões dos jogadores

const START = Date.UTC(2026, 10, 20, 21, 0); // sexta, 21:00 (Lisboa = UTC no inverno)
const world = { start: START, playEnd: START + CFG.round.playDays * T.DAY };
const TOTAL_MS = world.playEnd - world.start;

const ARCH = {
  hardcore: { share: 0.06, perDay: 10, wake: [8, 26], sess: [12, 20], pvp: 0.9, deposit: 1.0, train: 0.45, launch: 1.0 },
  active:   { share: 0.24, perDay: 5,  wake: [9, 24],  sess: [6, 12],  pvp: 0.5, deposit: 0.9, train: 0.40, launch: 0.9 },
  casual:   { share: 0.45, perDay: 2,  wake: [10, 23], sess: [4, 8],   pvp: 0.15, deposit: 0.6, train: 0.35, launch: 0.6 },
  sporadic: { share: 0.15, perDay: 1,  wake: [12, 23], sess: [3, 6],   pvp: 0.0, deposit: 0.4, train: 0.30, launch: 0.4, dayProb: 0.6 },
  late:     { share: 0.10, perDay: 5,  wake: [9, 24],  sess: [6, 12],  pvp: 0.5, deposit: 0.9, train: 0.40, launch: 0, joinDay: [2, 10] },
};
// teste de limite: contas que jogam 24 h por dia, sem parar (bots/viciados extremos)
if (process.env.BOTS) ARCH.bot24 = { share: +process.env.BOTS / N, perDay: 48, wake: [0, 24], sess: [28, 30], pvp: 0.9, deposit: 1.0, train: 0.40, launch: 1.0 };

const DUR = { crime: 3000, train: 2000, drug: 3000, attack: 8000, buy: 4000, collect: 3000, pay: 3000 };

// ---------- métricas ----------
const M = {
  errors: {}, invariant: [], energyBound: [], hosp: [],
  flows: { crime: 0, crit: 0, biz: 0, portGain: 0, mug: 0, raidLost: 0, drugs: 0, detox: 0, missions: 0, train: 0, bizBuy: 0, gear: 0, bail: 0, medic: 0, fee: 0, portSeized: 0, portOut: 0 },
  respectFrom: {}, attacks: 0, attackWins: 0, crimes: 0, crimeWins: 0, crits: 0,
  levelUps: [], paybacks: [], daily: [],
};
const err = (code) => { M.errors[code] = (M.errors[code] || 0) + 1; };

// ---------- jogadores ----------
const agents = [];
const kinds = Object.keys(ARCH);
let idx = 0;
for (const k of kinds) {
  const n = Math.round(ARCH[k].share * N);
  for (let i = 0; i < n; i++) agents.push({ id: `p${idx++}`, kind: k, A: ARCH[k] });
}

function hourMs(day, h) { // dia 0 = sexta da abertura (00:00 local desse dia)
  const day0 = START - 21 * T.HOUR;
  return day0 + day * T.DAY + Math.floor(h * T.HOUR);
}

for (const ag of agents) {
  const A = ag.A;
  ag.joinAt = A.joinDay ? START + brain.int(A.joinDay[0] * 24, A.joinDay[1] * 24) * T.HOUR + brain.int(0, 3599) * 1000 : START;
  const times = [];
  if (!A.joinDay && brain.float() < A.launch) times.push(START + brain.int(0, 3 * 3600) * 1000);
  if (A.joinDay) times.push(ag.joinAt);
  for (let d = 0; d <= CFG.round.playDays + 1; d++) {
    if (A.dayProb && brain.float() > A.dayProb) continue;
    for (let s = 0; s < A.perDay; s++) {
      const h = A.wake[0] + brain.float() * (A.wake[1] - A.wake[0]);
      times.push(hourMs(d, h));
    }
  }
  times.sort((a, b) => a - b);
  const kept = [];
  for (const t of times) {
    if (t < ag.joinAt || t >= world.playEnd) continue;
    if (kept.length && t - kept[kept.length - 1] < 20 * T.MIN) continue;
    kept.push(t);
  }
  ag.sessions = kept;
  ag.si = 0;
  ag.inSession = false;
  ag.eTrain = 0; ag.eCrime = 0; ag.ePvp = 0; ag.detox = 0;
  ag.playMs = 0;
  ag.respSrc = { crime: 0, pvp: 0, biz: 0, lost: 0 };
  ag.energyDay = new Map();
  ag.hospDay = new Map();
  ag.firstSuccessMs = null;
  ag.maxTier = 0;
  ag.levels = [];
}

// ---------- fila de eventos (heap) ----------
const heap = [];
function push(t, ag) { heap.push({ t, ag }); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].t <= heap[i].t) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } }
function pop() { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].t < heap[m].t) m = l; if (r < heap.length && heap[r].t < heap[m].t) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; }

for (const ag of agents) if (ag.sessions.length) push(ag.sessions[0], ag);

// ---------- ajudas ----------
const liquid = (p) => p.cash + p.bank;
const dayOf = (t) => Math.floor((t - START) / T.DAY);
const live = []; // jogadores já entrados

function medianStats(t) {
  const act = live.filter((a) => a.lastSeen && a.lastSeen >= t - T.DAY && a.p);
  if (!act.length) return null;
  const res = {};
  for (const s of E.STATS) {
    const v = act.map((a) => a.p.stats[s]).sort((x, y) => x - y);
    res[s] = v[v.length >> 1];
  }
  return res;
}

function spendEnergy(ag, t, e) { const d = dayOf(t); ag.energyDay.set(d, (ag.energyDay.get(d) || 0) + e); }

function track(ag, t, lv) {
  if (lv && lv.to > lv.from) {
    for (let L = lv.from + 1; L <= lv.to; L++) ag.levels.push({ L, sinceJoin: t - ag.joinAt, play: ag.playMs + (t - ag.sessStart) });
  }
}

function check(ag, t) {
  const bad = E.checkInvariants(ag.p);
  if (bad.length && M.invariant.length < 20) M.invariant.push({ id: ag.id, t, bad });
}

function call(ag, t, fn) {
  try { return fn(); } catch (e) { if (e instanceof E.GameError) { err(e.code); return null; } throw e; }
}

function bestCrime(p, t, energyAvail) {
  const late = world.playEnd - t < 2 * T.DAY;
  let best = -1, bestV = -Infinity;
  for (let k = 0; k < CFG.crimes.length; k++) {
    const c = CFG.crimes[k];
    if (c.e > energyAvail || !E.crimeUnlocked(p, k)) continue;
    const pr = E.crimeChanceBp(p, k) / 10000;
    const avg = (c.min + c.max) / 2 * (1 + (CFG.crit.mult - 1) * CFG.crit.chanceBp / 10000);
    const jailCost = (1 - pr) * (CFG.bustBp / 10000) * ((c.min + c.max) / 2) * CFG.bailBp / 10000;
    const v = late ? (pr * c.r) / c.e : (pr * avg - jailCost) / c.e + (pr * c.r * 2) / c.e;
    if (v > bestV) { bestV = v; best = k; }
  }
  return best;
}

function moneyPerEnergy(p) {
  const k = bestCrime(p, world.start, CFG.energy.max);
  if (k < 0) return 1;
  const c = CFG.crimes[k];
  return (E.crimeChanceBp(p, k) / 10000) * ((c.min + c.max) / 2) / c.e;
}

function crimeRespPerEnergy(p) {
  let best = 0;
  for (let k = 0; k < CFG.crimes.length; k++) {
    if (!E.crimeUnlocked(p, k)) continue;
    const c = CFG.crimes[k];
    best = Math.max(best, (E.crimeChanceBp(p, k) / 10000) * c.r / c.e);
  }
  return best;
}

function pickStat(ag) {
  const p = ag.p;
  const W = ag.A.pvp >= 0.5 ? { F: 0.3, T: 0.25, I: 0.25, C: 0.2 } : { I: 0.32, F: 0.3, C: 0.28, T: 0.1 };
  let best = 'I', bv = Infinity;
  for (const s of E.STATS) { const v = p.stats[s] / W[s]; if (v < bv) { bv = v; best = s; } }
  return best;
}

function tryInvest(ag, t) {
  const p = ag.p;
  const remH = (world.playEnd - t) / T.HOUR;
  const budget = liquid(p) * 0.6;
  let bi = -1, bpb = Infinity;
  for (let i = 0; i < CFG.biz.length; i++) {
    const b = CFG.biz[i];
    if (p.biz[i].n >= CFG.bizMax) continue;
    const price = E.bizPrice(i, p.biz[i].n);
    if (price > budget) continue;
    const rate = Math.floor(b.perH * (CFG.statMultDiv + Math.min(p.stats[b.stat], CFG.statMultCap)) / CFG.statMultDiv) * (b.raid ? 1 - CFG.raid.chanceBp * CFG.raid.lossBp / 1e8 : 1);
    const pb = price / rate;
    if (pb < bpb) { bpb = pb; bi = i; }
  }
  if (bi >= 0 && bpb <= remH * 0.33) {
    const r = call(ag, t, () => E.buyBiz(p, t, world, bi));
    if (r) {
      M.flows.bizBuy += r.price;
      ag.respSrc.biz += r.respect; track(ag, t, r.levelUp);
      M.paybacks.push({ biz: CFG.biz[bi].id, n: r.n, paybackH: bpb, day: dayOf(t) });
      return true;
    }
  }
  if (p.luxuries < CFG.luxury.max && E.luxuryPrice(p) <= liquid(p) * 0.4 && bpbAll(p, remH) ) {
    const r = call(ag, t, () => E.buyLuxury(p, t, world));
    if (r) { M.flows.luxury = (M.flows.luxury || 0) + r.price; ag.respSrc.lux = (ag.respSrc.lux || 0) + r.respect; track(ag, t, r.levelUp); return true; }
  }
  if (p.port.length < E.portSlots(p) && t + CFG.port.ms <= world.playEnd) {
    const amt = Math.min(E.portCap(p), Math.floor(liquid(p) * 0.2));
    if (amt >= 1000) {
      const r = call(ag, t, () => E.sendPort(p, t, world, amt));
      if (r) { M.flows.portOut += amt; return true; }
    }
  }
  return false;
}

// só compra luxos quando nenhum negócio compensa
function bpbAll(p, remH) {
  for (let i = 0; i < CFG.biz.length; i++) {
    if (p.biz[i].n >= CFG.bizMax) continue;
    const b = CFG.biz[i];
    const rate = Math.floor(b.perH * (CFG.statMultDiv + Math.min(p.stats[b.stat], CFG.statMultCap)) / CFG.statMultDiv);
    if (E.bizPrice(i, p.biz[i].n) / rate <= remH * 0.33) return false;
  }
  return true;
}

function tryGear(ag, t) {
  if (ag.A.pvp < 0.4) return false;
  const p = ag.p;
  for (const kind of ['weapon', 'armor']) {
    const list = kind === 'weapon' ? CFG.weapons : CFG.armors;
    const nx = p[kind] + 1;
    if (nx < list.length && list[nx].price <= liquid(p) * 0.15) {
      const r = call(ag, t, () => E.buyGear(p, t, world, kind, nx));
      if (r) { M.flows.gear += r.price; return true; }
    }
  }
  return false;
}

function tryAttack(ag, t) {
  const p = ag.p;
  if (brain.float() > ag.A.pvp) return false;
  if (p.energy < CFG.pvp.energy || t - START < CFG.round.noPvpMs) return false;
  let best = null, bv = 0;
  for (let i = 0; i < 25 && live.length > 1; i++) {
    const d = live[brain.int(0, live.length - 1)];
    if (d === ag) continue;
    if (d.p.t > t) continue; // nunca acontece com a fila por ordem de tempo
    E.touch(d.p, t);
    if (E.canAttack(p, d.p, t, world)) continue;
    const pr = E.attackChanceBp(p, d.p) / 10000;
    if (pr < 0.6) continue;
    const gain = E.expectedGain(p, d.p, t);
    const loss = Math.floor(E.pvpBaseGain(p, d.p) / CFG.pvp.lossDiv);
    const mugVal = E.mugValue(p, d.p, t);
    // vale a pena? compara com o que a mesma energia daria em crimes
    const v = (pr * gain - (1 - pr) * loss) / CFG.pvp.energy;
    const mug = pr * mugVal > moneyPerEnergy(p) * CFG.pvp.energy * 2;
    const score = mug ? Math.max(v, 0) + (pr * mugVal) / (moneyPerEnergy(p) * CFG.pvp.energy) : v / Math.max(0.05, crimeRespPerEnergy(p));
    if (score > 1.2 && score > bv) { bv = score; best = { d, mug }; }
  }
  if (!best) return false;
  const before = p.respect;
  const dBefore = best.d.p.respect;
  const r = call(ag, t, () => E.attack(p, best.d.p, t, world, best.mug ? 'mug' : 'beat', rng));
  if (!r) return false;
  M.attacks++; spendEnergy(ag, t, CFG.pvp.energy); ag.ePvp += CFG.pvp.energy;
  if (r.win) { M.attackWins++; M.flows.mug += r.money || 0; ag.respSrc.pvp += p.respect - before; track(ag, t, r.levelUp); }
  else ag.respSrc.lost += before - p.respect;
  const dd = best.d;
  if (dd.p.respect < dBefore) dd.respSrc.lost += dBefore - dd.p.respect;
  else dd.respSrc.pvp += dd.p.respect - dBefore;
  const hd = dayOf(t);
  if (r.win) dd.hospDay.set(hd, (dd.hospDay.get(hd) || 0) + (r.mode === 'mug' ? 10 : 20));
  check(dd, t);
  return true;
}

function tryDrug(ag, t) {
  const p = ag.p;
  if (p.energy >= 25) return false;
  const mpe = moneyPerEnergy(p);
  const endGame = world.playEnd - t < 1 * T.DAY;
  let plan = E.refillPlan(p);
  // sem margem de vício: desintoxicar enquanto compensar (o preço sobe 50% a cada uso em 24 h)
  if ((!plan || plan.energy < 20) && p.addiction > 0) {
    const c = E.detoxCost(p, t);
    if (c <= liquid(p) * 0.3 && c < mpe * E.addictionCap(p) * 2.5) {
      const r = call(ag, t, () => E.detox(p, t, world));
      if (r) { M.flows.detox += r.price; ag.detox++; plan = E.refillPlan(p); }
    }
  }
  if (!plan) return false;
  const maxSpend = endGame ? liquid(p) : liquid(p) * 0.25;
  if (plan.cost > maxSpend) return false;
  if (!endGame && plan.cost / plan.energy > mpe * 1.5) return false;
  const r = call(ag, t, () => E.refill(p, t, world));
  if (!r) return false;
  M.flows.drugs += r.price;
  return true;
}

function endSession(ag, t) {
  const p = ag.p;
  if (p.cash >= 100 && brain.float() < ag.A.deposit) {
    const r = call(ag, t, () => E.deposit(p, t, world, p.cash));
    if (r) M.flows.fee += r.fee;
  }
  ag.playMs += t - ag.sessStart;
  ag.inSession = false;
  ag.lastSeen = t;
  check(ag, t);
  ag.si++;
  while (ag.si < ag.sessions.length && ag.sessions[ag.si] <= t) ag.si++;
  if (ag.si < ag.sessions.length) push(ag.sessions[ag.si], ag);
}

function startSession(ag, t) {
  if (!ag.p) {
    const med = t - START >= CFG.round.lateJoinAfterMs ? medianStats(t) : null;
    const stats = {};
    if (med) for (const s of E.STATS) stats[s] = Math.max(CFG.start.stat, Math.floor(med[s] * CFG.round.lateStatsBp / 10000));
    ag.p = E.newPlayer(ag.id, t, world, { stats });
    ag.startStats = { ...ag.p.stats };
    live.push(ag);
  }
  ag.inSession = true;
  ag.sessStart = t;
  if (ag.firstSessionAt === undefined) ag.firstSessionAt = t;
  ag.sessEnd = t + brain.int(ag.A.sess[0] * 60, ag.A.sess[1] * 60) * 1000;
  const p = ag.p;
  E.touch(p, t);
  const rb = call(ag, t, () => E.collectBiz(p, t, world, rng));
  if (rb) for (const it of rb.items) { M.flows.biz += it.money; M.flows.raidLost += it.lost; }
  const rp = call(ag, t, () => E.collectPort(p, t, world, rng));
  if (rp) for (const it of rp.items) { if (it.seized) M.flows.portSeized += it.amount; else M.flows.portGain += it.got - it.amount; }
  push(t + DUR.collect, ag);
}

function step(ag, t) {
  const p = ag.p;
  E.touch(p, t);
  if (t >= ag.sessEnd) return endSession(ag, t);
  { const m = E.mission(p); if (m && m.done) { const r = call(ag, t, () => E.claimMission(p, t, world)); if (r) M.flows.missions += r.cash; } }
  if (p.hospUntil > t) {
    const c = E.medicCost(p, t);
    if (c <= liquid(p) * 0.05 && ag.A.pvp >= 0.5) { const r = call(ag, t, () => E.payMedic(p, t, world)); if (r) { M.flows.medic += r.cost; return push(t + DUR.pay, ag); } }
    if (p.hospUntil < ag.sessEnd) return push(p.hospUntil, ag);
    return endSession(ag, t);
  }
  if (p.jailUntil > t) {
    const c = E.bailCost(p, t);
    if (c <= liquid(p) * 0.05) { const r = call(ag, t, () => E.payBail(p, t, world)); if (r) { M.flows.bail += r.cost; return push(t + DUR.pay, ag); } }
    if (p.jailUntil < ag.sessEnd) return push(p.jailUntil, ag);
    return endSession(ag, t);
  }
  if (tryGear(ag, t)) return push(t + DUR.buy, ag);
  if (tryInvest(ag, t)) return push(t + DUR.buy, ag);
  if (tryAttack(ag, t)) { check(ag, t); return push(t + DUR.attack, ag); }

  const remFrac = (world.playEnd - t) / TOTAL_MS;
  const share = remFrac > 2 / CFG.round.playDays ? ag.A.train : 0; // treina até aos 2 últimos dias
  const wantTrain = ag.eTrain < share * (ag.eTrain + ag.eCrime + 1);
  if (wantTrain && p.energy >= CFG.train.energy) {
    const s = pickStat(ag);
    const cost = E.trainCost(p, s);
    if (cost <= liquid(p) * 0.3) {
      const r = call(ag, t, () => E.train(p, t, world, s));
      if (r) { M.flows.train += r.cost; ag.eTrain += CFG.train.energy; spendEnergy(ag, t, CFG.train.energy); check(ag, t); return push(t + DUR.train, ag); }
    }
  }
  const k = bestCrime(p, t, p.energy);
  if (k >= 0) {
    const r = call(ag, t, () => E.doCrime(p, t, world, k, rng));
    if (r) {
      const c = CFG.crimes[k];
      M.crimes++; ag.eCrime += c.e; spendEnergy(ag, t, c.e);
      ag.maxTier = Math.max(ag.maxTier, k + 1);
      if (r.success) {
        M.crimeWins++; M.flows.crime += r.money; if (r.crit) M.crits++;
        ag.respSrc.crime += c.r;
        if (ag.firstSuccessMs === null) ag.firstSuccessMs = t - ag.firstSessionAt;
        track(ag, t, r.levelUp);
      }
      check(ag, t);
      return push(t + DUR.crime, ag);
    }
  }
  if (tryDrug(ag, t)) { check(ag, t); return push(t + DUR.drug, ag); }
  return endSession(ag, t);
}

// ---------- ciclo principal ----------
let nextSnap = START + T.DAY;
const snaps = [];
function snapshot(t) {
  const byKind = {};
  for (const k of kinds) byKind[k] = [];
  for (const a of live) byKind[a.kind].push(a.p.respect);
  const row = { day: Math.round((t - START) / T.DAY) };
  for (const k of kinds) {
    const v = byKind[k].sort((x, y) => x - y);
    row[k] = v.length ? v[v.length >> 1] : 0;
  }
  const all = live.map((a) => a.p.respect).sort((x, y) => y - x);
  row.top1 = all[0] || 0; row.top10 = all[9] || 0;
  row.money = live.reduce((s, a) => s + a.p.cash + a.p.bank, 0);
  snaps.push(row);
}

const t0 = Date.now();
while (heap.length) {
  const { t, ag } = pop();
  while (t >= nextSnap && nextSnap <= world.playEnd) { snapshot(nextSnap); nextSnap += T.DAY; }
  if (t >= world.playEnd) { if (ag.inSession) { ag.playMs += world.playEnd - ag.sessStart; ag.inSession = false; } continue; }
  if (!ag.inSession) startSession(ag, t); else step(ag, t);
}
while (nextSnap <= world.playEnd) { snapshot(nextSnap); nextSnap += T.DAY; }

// ---------- verificações finais ----------
const regenDay = T.DAY / CFG.energy.regenMs;
const decayDay = T.DAY / CFG.addiction.decayMs;
const bestRatio = Math.max(...CFG.drugs.map((g) => g.e / g.a));
for (const a of live) {
  const cap = E.addictionCap(a.p);
  const bound = CFG.energy.max * (1 + CFG.levels.length) + regenDay + (decayDay + cap * (1 + 2 * CFG.detox.maxSteps)) * bestRatio;
  for (const [d, e] of a.energyDay) if (e > bound) M.energyBound.push({ id: a.id, d, e, bound });
  for (const [d, m] of a.hospDay) M.hosp.push(m);
}

const rank = E.ranking(live.map((a) => a.p));
const pos = new Map(rank.map((p, i) => [p.id, i + 1]));
const byId = new Map(live.map((a) => [a.id, a]));
const pct = (arr, q) => { if (!arr.length) return 0; const v = [...arr].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.floor(q * (v.length - 1)))]; };

const summary = {};
for (const k of kinds) {
  const g = live.filter((a) => a.kind === k);
  const resp = g.map((a) => a.p.respect);
  summary[k] = {
    n: g.length,
    respectP25: pct(resp, 0.25), respectP50: pct(resp, 0.5), respectP90: pct(resp, 0.9),
    levelP50: pct(g.map((a) => E.level(a.p)), 0.5),
    maxTierP50: pct(g.map((a) => a.maxTier), 0.5),
    statsP50: pct(g.map((a) => a.p.stats.F + a.p.stats.T + a.p.stats.I + a.p.stats.C), 0.5),
    playHoursP50: +(pct(g.map((a) => a.playMs), 0.5) / T.HOUR).toFixed(1),
    bestRankP50: pct(g.map((a) => pos.get(a.id)), 0.5),
    inTop10: g.filter((a) => pos.get(a.id) <= 10).length,
    inTop100: g.filter((a) => pos.get(a.id) <= 100).length,
    respFromCrime: Math.round(g.reduce((s, a) => s + a.respSrc.crime, 0) / Math.max(1, g.length)),
    respFromPvp: Math.round(g.reduce((s, a) => s + a.respSrc.pvp, 0) / Math.max(1, g.length)),
    respFromBiz: Math.round(g.reduce((s, a) => s + a.respSrc.biz, 0) / Math.max(1, g.length)),
    respFromLux: Math.round(g.reduce((s, a) => s + (a.respSrc.lux || 0), 0) / Math.max(1, g.length)),
    respLost: Math.round(g.reduce((s, a) => s + a.respSrc.lost, 0) / Math.max(1, g.length)),
    moneyP50: pct(g.map((a) => a.p.cash + a.p.bank), 0.5),
    energyPerDayP50: Math.round(pct(g.map((a) => a.eTrain + a.eCrime + a.ePvp), 0.5) / CFG.round.playDays),
    trainSharePct: Math.round(100 * g.reduce((s, a) => s + a.eTrain, 0) / Math.max(1, g.reduce((s, a) => s + a.eTrain + a.eCrime + a.ePvp, 0))),
    pvpSharePct: Math.round(100 * g.reduce((s, a) => s + a.ePvp, 0) / Math.max(1, g.reduce((s, a) => s + a.eTrain + a.eCrime + a.ePvp, 0))),
    bizUnitsP50: pct(g.map((a) => a.p.biz.reduce((s, b) => s + b.n, 0)), 0.5),
    detoxPerDay: +(g.reduce((s, a) => s + a.detox, 0) / Math.max(1, g.length) / CFG.round.playDays).toFixed(2),
  };
}

// tempos de subida de nível (em minutos de jogo) para o perfil "active"
const lvlTimes = {};
for (const a of live.filter((x) => x.kind === 'active' || x.kind === 'casual')) {
  for (const l of a.levels) { (lvlTimes[a.kind + ':' + l.L] ||= []).push(l.play / T.MIN); }
}
const lvlTable = [];
for (let L = 2; L <= CFG.levels.length; L++) {
  const act = lvlTimes['active:' + L] || [], cas = lvlTimes['casual:' + L] || [];
  lvlTable.push({ L, activeReached: act.length, activeMinP50: Math.round(pct(act, 0.5)), casualReached: cas.length, casualMinP50: Math.round(pct(cas, 0.5)) });
}

const firstSucc = live.map((a) => a.firstSuccessMs).filter((x) => x !== null);
const lateVsActive = summary.late.respectP50 / Math.max(1, summary.active.respectP50);

const report = {
  seed: SEED, players: live.length, simSeconds: +((Date.now() - t0) / 1000).toFixed(1),
  invariantViolations: M.invariant, energyBoundViolations: M.energyBound.length,
  errors: M.errors,
  flows: M.flows,
  crimes: M.crimes, crimeSuccessRate: +(M.crimeWins / M.crimes).toFixed(3), crits: M.crits,
  attacks: M.attacks, attackWinRate: +(M.attackWins / Math.max(1, M.attacks)).toFixed(3),
  hospMinutesPerDayMax: Math.max(0, ...M.hosp), hospMinutesPerDayP99: pct(M.hosp, 0.99),
  firstSuccessSecP50: pct(firstSucc, 0.5) / 1000,
  top: rank.slice(0, 10).map((p) => ({ id: p.id, kind: byId.get(p.id).kind, respect: p.respect, level: E.level(p) })),
  summary, lateVsActive: +lateVsActive.toFixed(2),
  hardcoreVsCasual: +(summary.hardcore.respectP50 / Math.max(1, summary.casual.respectP50)).toFixed(2),
  daily: snaps, levels: lvlTable,
  paybackFirstUnits: M.paybacks.filter((x) => x.n === 1).reduce((o, x) => { (o[x.biz] ||= []).push(+x.paybackH.toFixed(1)); return o; }, {}),
  bizBought: M.paybacks.reduce((o, x) => { o[x.biz] = (o[x.biz] || 0) + 1; return o; }, {}),
};
for (const k of Object.keys(report.paybackFirstUnits)) { const v = report.paybackFirstUnits[k]; report.paybackFirstUnits[k] = { n: v.length, min: Math.min(...v), max: Math.max(...v) }; }

if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, (k, v) => (k === 'daily' || k === 'levels' ? undefined : v), 1));
