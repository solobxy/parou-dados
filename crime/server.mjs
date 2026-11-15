// Servidor do jogo de crime (ronda de teste).
// API JSON em 127.0.0.1:PORT; o Caddy serve o site e envia /api/* para aqui.
// Estado em SQLite (node:sqlite). O Node trata um pedido de cada vez, por isso cada ação é atómica.

import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { CFG, T } from './engine/config.js';
import * as E from './engine/engine.js';
import { cryptoRng } from './engine/rng.js';
import { phaseAt, localParts } from './engine/time.js';

const PORT = +(process.env.PORT || 3170);
const DATA = process.env.DATA || process.env.STATE_DIRECTORY || './dados';
const STATIC = process.env.STATIC || '';           // só para testes locais
const SECURE = process.env.COOKIE_INSEGURO ? '' : '; Secure';
// 1.ª ronda: sexta 13/11/2026, 21:00 de Lisboa (PRIMEIRA_RONDA=AAAA-MM-DD muda-a, para testes)
const [fy, fm, fd] = (process.env.PRIMEIRA_RONDA || '2026-11-13').split('-').map(Number);
const FIRST = { y: fy, m: fm, d: fd };
const rng = cryptoRng();
const VERSAO = 41;   // sobe quando o servidor muda, para se confirmar de fora que a versão nova já está a correr
const ATOS_3S = +(process.env.ATOS_3S || 15), ATOS_MIN = +(process.env.ATOS_MIN || 400); // ações por conta: 15 em 3 s, 400 por minuto

// ---------- relógio que nunca anda para trás ----------
let lastNow = 0;
const clock = () => { const t = Date.now(); lastNow = Math.max(lastNow, t); return lastNow; };

// ---------- base de dados ----------
mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(join(DATA, 'jogo.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
CREATE TABLE IF NOT EXISTS contas (id TEXT PRIMARY KEY, nome TEXT NOT NULL, nome_lc TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL, criada INTEGER NOT NULL, lingua TEXT NOT NULL DEFAULT 'en');
CREATE TABLE IF NOT EXISTS sessoes (hash TEXT PRIMARY KEY, conta TEXT NOT NULL, expira INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS jogadores (ronda INTEGER NOT NULL, conta TEXT NOT NULL, estado TEXT NOT NULL,
  atualizado INTEGER NOT NULL, PRIMARY KEY (ronda, conta));
CREATE TABLE IF NOT EXISTS eventos (id INTEGER PRIMARY KEY AUTOINCREMENT, conta TEXT NOT NULL, t INTEGER NOT NULL, dados TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS eventos_conta ON eventos (conta, id);
CREATE TABLE IF NOT EXISTS noticias (id INTEGER PRIMARY KEY AUTOINCREMENT, ronda INTEGER NOT NULL, t INTEGER NOT NULL, dados TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS noticias_ronda ON noticias (ronda, id);
CREATE TABLE IF NOT EXISTS diario (ronda INTEGER NOT NULL, dia TEXT NOT NULL, conta TEXT NOT NULL,
  resp INTEGER NOT NULL DEFAULT 0, crimes INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, busts INTEGER NOT NULL DEFAULT 0,
  money INTEGER NOT NULL DEFAULT 0, best INTEGER NOT NULL DEFAULT 0, beaten INTEGER NOT NULL DEFAULT 0, mugged INTEGER NOT NULL DEFAULT 0,
  mugloss INTEGER NOT NULL DEFAULT 0, fights INTEGER NOT NULL DEFAULT 0, sick INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (ronda, dia, conta));
`);
// colunas novas em bases de dados que já existiam
for (const col of ['cwin', 'cnet']) { try { db.exec(`ALTER TABLE diario ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`); } catch { /* já existe */ } }
const q = {
  contaPorNome: db.prepare('SELECT * FROM contas WHERE nome_lc = ?'),
  contaPorId: db.prepare('SELECT id, nome, lingua, criada FROM contas WHERE id = ?'),
  novaConta: db.prepare('INSERT INTO contas (id, nome, nome_lc, hash, criada, lingua) VALUES (?, ?, ?, ?, ?, ?)'),
  lingua: db.prepare('UPDATE contas SET lingua = ? WHERE id = ?'),
  novaSessao: db.prepare('INSERT INTO sessoes (hash, conta, expira) VALUES (?, ?, ?)'),
  sessao: db.prepare('SELECT conta, expira FROM sessoes WHERE hash = ?'),
  apagarSessao: db.prepare('DELETE FROM sessoes WHERE hash = ?'),
  limparSessoes: db.prepare('DELETE FROM sessoes WHERE expira < ?'),
  guardar: db.prepare('INSERT OR REPLACE INTO jogadores (ronda, conta, estado, atualizado) VALUES (?, ?, ?, ?)'),
  daRonda: db.prepare('SELECT conta, estado FROM jogadores WHERE ronda = ?'),
  novoEvento: db.prepare('INSERT INTO eventos (conta, t, dados) VALUES (?, ?, ?)'),
  eventos: db.prepare('SELECT id, t, dados FROM eventos WHERE conta = ? ORDER BY id DESC LIMIT 30'),
  limparEventos: db.prepare('DELETE FROM eventos WHERE t < ?'),
  novaNoticia: db.prepare('INSERT INTO noticias (ronda, t, dados) VALUES (?, ?, ?)'),
  noticias: db.prepare('SELECT t, dados FROM noticias WHERE ronda = ? ORDER BY id DESC LIMIT 40'),
  diario: db.prepare(`INSERT INTO diario (ronda, dia, conta, resp, crimes, wins, busts, money, best, beaten, mugged, mugloss, fights, sick, cwin, cnet)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (ronda, dia, conta) DO UPDATE SET cwin = max(cwin, excluded.cwin), cnet = cnet + excluded.cnet,
    resp = resp + excluded.resp, crimes = crimes + excluded.crimes, wins = wins + excluded.wins, busts = busts + excluded.busts,
    money = money + excluded.money, best = max(best, excluded.best), beaten = beaten + excluded.beaten, mugged = mugged + excluded.mugged,
    mugloss = mugloss + excluded.mugloss, fights = fights + excluded.fights, sick = sick + excluded.sick`),
  doDia: db.prepare('SELECT * FROM diario WHERE ronda = ? AND dia = ?'),
  limparNoticias: db.prepare('DELETE FROM noticias WHERE t < ?'),
};

// ---------- estado do jogador (Map <-> JSON) ----------
const toJson = (p) => JSON.stringify(p, (k, v) => (v instanceof Map ? { __map: [...v] } : v));
const fromJson = (s) => JSON.parse(s, (k, v) => (v && v.__map ? new Map(v.__map) : v));

// ---------- jornal da cidade ----------
// última hora: o que os jogadores fazem, guardado na base de dados (sobrevive a reinícios)
const jornal = [];
function noticia(now, o) {
  const e = { t: now, ...o };
  jornal.push(e); if (jornal.length > 40) jornal.shift();
  q.novaNoticia.run(ronda, now, JSON.stringify(o));
}
const ultimas = () => jornal.slice(-20).reverse();
const casinoNet = (r) => r.win - (r.g === 'bj' ? r.hand.bet : r.bet);
function noticiar(now, a, r, p, alvo) {
  const name = nomeDe(p.id), k = int(a.k);
  if (a.type === 'casino' && (r.g !== 'bj' || r.done)) {
    const net = casinoNet(r);
    if (net >= CFG.casino.newsMin) noticia(now, { k: 'casino', name, g: r.g, money: net });
    else if (-net >= CFG.casino.newsMin) noticia(now, { k: 'casinoLoss', name, g: r.g, money: -net });
  }
  if (a.type === 'crimeAll' && r.wins >= 10 && r.money >= 1000) noticia(now, { k: 'spree', name, c: k, n: r.n, money: r.money });
  else {
    const job = a.type === 'crimeAll' ? { ok: r.wins > 0, money: r.best, crit: r.bestCrit } : { ok: r.success, money: r.money, crit: r.crit };
    const isJob = a.type === 'crime' || a.type === 'crimeAll';
    if (isJob && job.ok && (k >= 5 || (job.crit && k >= 2))) noticia(now, { k: job.crit ? 'crit' : 'job', name, c: k, money: job.money });
  }
  if ((a.type === 'crime' || a.type === 'crimeAll') && r.busted && k >= 2) noticia(now, { k: 'jail', name, c: k });
  if (a.type === 'classChange') noticia(now, { k: 'cls', name, from: r.from, to: r.cls });
  if (a.type === 'stockSell' && Math.abs(r.profit) >= CFG.casino.newsMin) noticia(now, { k: r.profit > 0 ? 'stockWin' : 'stockLoss', name, c: CFG.stocks.list[r.k].id, money: Math.abs(r.profit) });
  if (a.type === 'airCollect' && r.amount >= CFG.casino.newsMin) noticia(now, r.seized ? { k: 'airLost', name, to: CFG.air.routes[r.r].id, money: r.amount } : { k: 'air', name, to: CFG.air.routes[r.r].id, money: r.got - r.amount });
  if (a.type === 'house') noticia(now, { k: 'house', name, h: p.house });
  else if (a.type === 'luxury') noticia(now, { k: 'lux', name, i: p.luxuries - 1 });
  else if ((a.type === 'hooker' || a.type === 'broVisit') && r.sick) noticia(now, { k: 'sick', name });
  else if (a.type === 'venueBuy' && r.lvl === 1) noticia(now, { k: 'venue', name, v: r.kind });
  else if (a.type === 'attack') {
    const b = nomeDe(alvo.id);
    if (r.win && r.mode === 'mug') noticia(now, { k: 'mug', name, target: b, money: r.money });
    else if (r.win) noticia(now, { k: 'beat', name, target: b });
    else noticia(now, { k: 'fail', name, target: b });
  }
  if (r.levelUp && r.levelUp.to >= 4) noticia(now, { k: 'lvl', name, n: r.levelUp.to });
}

// manchetes: contas do dia de cada jogador (dia de Lisboa), para «o mais procurado», «saco de pancada», etc.
const diaDe = (t) => { const d = localParts(t); return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`; };
const ontemDe = (t) => { const d = localParts(t); const x = new Date(Date.UTC(d.y, d.m - 1, d.d - 1)); return x.toISOString().slice(0, 10); };
function contarDia(now, conta, v) {
  q.diario.run(ronda, diaDe(now), conta, v.resp || 0, v.crimes || 0, v.wins || 0, v.busts || 0, v.money || 0, v.best || 0,
    v.beaten || 0, v.mugged || 0, v.mugloss || 0, v.fights || 0, v.sick || 0, v.cwin || 0, v.cnet || 0);
}
function contarAcao(now, a, r, p, alvo, resp0, alvoResp0) {
  const v = { resp: p.respect - resp0 };
  if (a.type === 'crime') Object.assign(v, { crimes: 1, wins: r.success ? 1 : 0, busts: r.busted ? 1 : 0, money: r.success ? r.money : 0, best: r.success ? r.money : 0 });
  else if (a.type === 'crimeAll') Object.assign(v, { crimes: r.n, wins: r.wins, busts: r.busted ? 1 : 0, money: r.money, best: r.best });
  else if ((a.type === 'hooker' || a.type === 'broVisit') && r.sick) v.sick = 1;
  else if (a.type === 'casino' && (r.g !== 'bj' || r.done)) { const net = casinoNet(r); v.cnet = net; v.cwin = Math.max(0, net); }
  else if (a.type === 'attack') {
    if (r.win) v.fights = 1; else v.beaten = 1;
    const w = { resp: alvo.respect - alvoResp0 };
    if (r.win && r.mode === 'mug') Object.assign(w, { mugged: 1, mugloss: r.money }); else if (r.win) w.beaten = 1;
    contarDia(now, alvo.id, w);
  }
  if (Object.values(v).some((x) => x)) contarDia(now, p.id, v);
}
// regras das manchetes: [tipo, valor, mínimo para aparecer, dinheiro a mostrar]
const MANCHETES = [['wanted', (r) => r.resp, 10], ['bigjob', (r) => r.best, 500, (r) => r.best], ['lucky', (r) => r.cwin, 5000, (r) => r.cwin], ['fighter', (r) => r.fights, 2],
  ['mugged', (r) => r.mugged, 1, (r) => r.mugloss], ['broke', (r) => -r.cnet, 5000, (r) => -r.cnet], ['beaten', (r) => r.beaten, 2], ['hustler', (r) => r.crimes, 30], ['unlucky', (r) => r.busts, 2], ['sick', (r) => r.sick, 1]];
const cacheManchetes = new Map();
function manchetes(dia, now) {
  const c = cacheManchetes.get(dia);
  if (c && c.ronda === ronda && now - c.t < 30_000) return c.lista;
  const rows = q.doDia.all(ronda, dia), usados = new Set(), lista = [];
  for (const [k, val, min, din] of MANCHETES) {
    let best = null;
    for (const r of rows) if (val(r) >= min && !usados.has(r.conta) && (!best || val(r) > val(best))) best = r;
    if (!best) continue;
    usados.add(best.conta);                       // cada jogador aparece numa manchete só, para haver mais nomes
    const p = jogadores.get(best.conta);
    lista.push({ k, name: nomeDe(best.conta), av: p?.av || 0, cls: p?.cls || '', level: p ? E.level(p) : 1, respect: p?.respect || 0,
      n: val(best), m: din ? din(best) : 0 });
  }
  cacheManchetes.set(dia, { t: now, ronda, lista });
  return lista;
}

// jogadores da ronda em curso, em memória
let ronda = -1;
const jogadores = new Map(); // conta -> estado
const nomes = new Map();     // conta -> nome

function mundo(now) {
  const ph = phaseAt(FIRST, now);
  return { phase: ph.phase, n: ph.round.n, start: ph.round.start, playEnd: ph.round.playEnd, nextStart: ph.round.nextStart };
}

function carregarRonda(n) {
  if (n === ronda) return;
  ronda = n;
  jogadores.clear(); jornal.length = 0;
  for (const r of q.daRonda.all(n)) jogadores.set(r.conta, fromJson(r.estado));
  for (const r of q.noticias.all(n).reverse()) jornal.push({ t: r.t, ...JSON.parse(r.dados) });
  carregarGangues();
}

function nomeDe(id) {
  if (!nomes.has(id)) { const c = q.contaPorId.get(id); nomes.set(id, c ? c.nome : '?'); }
  return nomes.get(id);
}

function guardar(p, now) { q.guardar.run(ronda, p.id, toJson(p), now); }

function medianStats(now) {
  const act = [...jogadores.values()].filter((p) => p.t >= now - T.DAY);
  if (act.length < 3) return null;
  const res = {};
  for (const s of E.STATS) {
    const v = act.map((p) => p.stats[s]).sort((a, b) => a - b);
    res[s] = v[v.length >> 1];
  }
  return res;
}

function jogadorDe(conta, now, w) {
  carregarRonda(w.n);
  let p = jogadores.get(conta);
  if (!p) {
    if (w.phase !== 'play') return null;
    const world = { start: w.start, playEnd: w.playEnd };
    let stats = {};
    if (now - w.start >= CFG.round.lateJoinAfterMs) {
      const med = medianStats(now);
      if (med) for (const s of E.STATS) stats[s] = Math.max(CFG.start.stat, Math.floor((med[s] * CFG.round.lateStatsBp) / 10000));
    }
    p = E.newPlayer(conta, now, world, { stats });
    jogadores.set(conta, p);
    guardar(p, now);
  }
  return p;
}

// ---------- bolsa: um mercado por ronda, igual para todos ----------
// Os preços avançam um passo de 10 em 10 minutos, contados desde o início da ronda. Se o servidor esteve parado, faz os passos em falta.
db.exec('CREATE TABLE IF NOT EXISTS bolsa (ronda INTEGER PRIMARY KEY, dados TEXT NOT NULL)');
const qb = { ler: db.prepare('SELECT dados FROM bolsa WHERE ronda = ?'), gravar: db.prepare('INSERT INTO bolsa (ronda, dados) VALUES (?, ?) ON CONFLICT(ronda) DO UPDATE SET dados = excluded.dados') };
let bolsa = null, bolsaRonda = null;
function bolsaDe(w, now) {
  if (bolsaRonda !== w.n) {
    const row = qb.ler.get(w.n);
    bolsa = row ? JSON.parse(row.dados) : { ...E.newMarket(), hist: [] };
    if (!Array.isArray(bolsa.hist) || !bolsa.hist.length) bolsa.hist = [bolsa.prices.slice()];
    bolsaRonda = w.n;
  }
  const S = CFG.stocks, alvo = Math.max(0, Math.floor((Math.min(now, w.playEnd) - w.start) / S.tickMs));
  if (bolsa.tick >= alvo) return bolsa;
  while (bolsa.tick < alvo) {
    const faliu = E.marketTick(bolsa, rng), t = w.start + bolsa.tick * S.tickMs;
    if (w.n === ronda) limitesDaBolsa(t, now);
    bolsa.hist.push(bolsa.prices.slice()); if (bolsa.hist.length > S.histMax + 1) bolsa.hist.shift();
    if (w.n === ronda && now - t < T.HOUR) for (const k of faliu) noticia(t, { k: 'stockBust', c: S.list[k].id });   // só as falências recentes vão para o jornal
  }
  qb.gravar.run(w.n, JSON.stringify(bolsa));
  return bolsa;
}
// limites de venda (alvo de lucro e travão de perda): a seguir a cada passo vendem-se as posições que os tocaram, ao preço desse passo,
// também de quem está fora do jogo. Grava-se logo e fica um aviso nos eventos do jogador.
function limitesDaBolsa(t, now) {
  for (const [conta, p] of jogadores) {
    if (!p.stk.some((h) => h.tp || h.sl)) continue;
    let vendas = [];
    try { vendas = E.stockAuto(p, bolsa); } catch (e) { console.error('limites da bolsa', conta, e.message); continue; }
    if (!vendas.length) continue;
    for (const v of vendas) evento(conta, t, { k: 'stAuto', c: CFG.stocks.list[v.k].id, why: v.why, n: v.n, money: v.got, profit: v.profit });
    guardar(p, now);
  }
}
function vistaBolsa(w, now) {
  const m = bolsaDe(w, now), S = CFG.stocks;
  return { now, tick: m.tick, nextAt: w.start + (m.tick + 1) * S.tickMs, prices: m.prices, gen: m.gen, hist: S.list.map((_, k) => m.hist.map((row) => row[k])) };
}

// ---------- vista do jogador para o browser ----------
function vista(p, now) {
  const L = E.level(p);
  const stored = E.bizStored(p, now), vv = E.venueView(p, Math.max(now, p.t));
  const wm = mundo(now), mk = wm.phase === 'play' ? bolsaDe(wm, now) : null;
  return {
    stk: mk ? E.stockView(p, mk) : CFG.stocks.list.map(() => ({ n: 0, cost: 0, value: 0, tp: 0, sl: 0 })), stockCap: E.stockCap(p),
    name: nomeDe(p.id),
    stats: p.stats, energy: p.energy, energyT: p.energyT,
    addiction: p.addiction, addictionT: p.addictionT, addictionCap: E.addictionCap(p),
    refill: E.refillPlan(p), detox: p.addiction > 0 ? E.detoxCost(p, now) : 0, detoxUses: E.detoxUses(p, now),
    mission: E.mission(p), wk: p.wk, stars: p.wk.map((_, k) => E.masteryStars(p, k)), counters: p.c,
    xp: p.xp, xpNeed: { F: E.practiceNeed(p, 'F'), I: E.practiceNeed(p, 'I'), C: E.practiceNeed(p, 'C') },
    cash: p.cash, bank: p.bank, bankFeeBp: E.bankFeeBp(p), bj: E.bjPublic(p), casinoMax: E.casinoMax(p), gang: p.gang && gangues.get(p.gang) ? { id: p.gang, name: gangues.get(p.gang).nome, tag: gangues.get(p.gang).tag, bot: p.gang === BOT.id } : null, gb: p.gb || null, gangWait: p.gangLeft ? p.gangLeft + CFG.gang.rejoinMs : 0, clsCost: E.classChangeCost(p), clsWait: p.clsAt ? p.clsAt + CFG.classChange.coolMs : 0, portSeizeBp: E.portSeizeBp(p), respect: p.respect, peakRespect: p.peakRespect,
    level: L, levelFrom: CFG.levels[L - 1], levelTo: CFG.levels[L] ?? null,
    jailUntil: p.jailUntil, jailTier: p.jailTier, bail: E.bailCost(p, now),
    hospUntil: p.hospUntil, medic: E.medicCost(p, now),
    protectUntil: p.protectUntil, capUntil: p.capUntil, shieldUntil: p.shieldUntil,
    weapon: p.weapon, armor: p.armor, guard: p.guard, hitmanLeft: E.hitmanLeft(p, now), hmSafe: p.hmSafe, luxuries: p.luxuries, luxuryPrice: E.luxuryPrice(p),
    attack: E.attackPower(p, now), defense: E.defensePower(p, now),
    crimes: CFG.crimes.map((c, k) => ({ chance: E.crimeChanceBp(p, k, now), unlocked: E.crimeUnlocked(p, k) })),
    sick: p.sick, cure: E.cureCost(p), hookers: CFG.hookers.list.map((_, i) => E.hookerPrice(p, i, now)), hkUses: E.hookerUses(p, now), hkSteps: CFG.hookers.list.map((_, i) => E.hookerSteps(p, i, now)),
    house: p.house, hu: p.hu, housePrice: E.housePrice(p), huPrices: CFG.house.ups.map((_, u) => E.upgradePrice(p, u)),
    cls: p.cls, av: p.av, fx: E.activeFx(p, now), drugPrices: CFG.drugs.map((_, d) => E.drugPrice(p, d)),
    acct: p.acct,
    biz: p.biz.map((s, i) => ({ n: s.n, stored: stored[i].money, fee: stored[i].fee, g: s.g === true, perH: E.bizRates(p, i).perH, price: s.n < CFG.bizMax ? E.bizPrice(i, s.n) : null, t: s.t })),
    stock: vv.stock, portDrug: E.portDrug(p),
    club: vv.club ? { lvl: vv.club.lvl, till: vv.club.till, pi: vv.club.pi, gd: vv.club.gd, perH: E.clubRate(p), cap: CFG.venue.club.perH[vv.club.lvl - 1] * (CFG.venue.tillMs / T.HOUR), next: CFG.venue.club.cost[vv.club.lvl] ?? null } : null,
    bro: vv.bro ? { lvl: vv.bro.lvl, till: vv.bro.till, pi: vv.bro.pi, gd: vv.bro.gd, girls: vv.bro.girls, perH: E.broRate(p), cap: E.broRate(p) * (CFG.venue.tillMs / T.HOUR), rooms: CFG.venue.bro.rooms[vv.bro.lvl - 1], next: CFG.venue.bro.cost[vv.bro.lvl] ?? null } : null,
    port: p.port, portCap: E.portCap(p), portSlots: E.portSlots(p), air: p.air, airCap: E.airCap(p), airSeize: CFG.air.routes.map((_, i) => E.airSeizeBp(p, i, false)),
  };
}

function cfgPublica() {
  return {
    energy: CFG.energy, addiction: CFG.addiction, train: CFG.train, crimes: CFG.crimes, drugs: CFG.drugs,
    biz: CFG.biz.map(({ id, price, perH, resp, stat, raid, toBank, drug }) => ({ id, price, perH, resp, stat, raid, toBank, drug: drug ? CFG.drugs.findIndex((x) => x.id === drug) : -1 })), accountant: CFG.accountant,
    bizMax: CFG.bizMax, storageMs: CFG.storageMs, port: CFG.port, air: CFG.air, goods: CFG.goods, venue: CFG.venue, detox: CFG.detox, stocks: CFG.stocks, weapons: CFG.weapons, armors: CFG.armors, guards: CFG.guards, hitman: CFG.hitman,
    pvp: CFG.pvp, bank: CFG.bank, luxury: CFG.luxury, levels: CFG.levels, crit: CFG.crit, unlockBp: CFG.unlockBp,
    bustBp: CFG.bustBp, crimeAllMax: CFG.crimeAllMax, casino: { minBet: CFG.casino.minBet, buyMaxMult: CFG.casino.buyMaxMult, red: CFG.casino.red, dice: CFG.casino.dice, wheel: { segs: CFG.casino.wheel.segs, spots: CFG.casino.wheel.spots }, slots: Object.fromEntries(Object.entries(CFG.casino.slots).map(([k, g]) => [k, { kind: g.kind, cols: g.cols, rows: g.rows, min: g.min, nsym: g.nsym, trig: g.trig, pay: g.pay, scatPay: g.scatPay, free: g.free, fs: g.fs, retrig: g.retrig, buy: g.buy, superBuy: g.superBuy, max: g.max, accFree: g.accFree, accAll: g.accAll, orbBase: g.orbBase }])) }, gang: CFG.gang, classes: CFG.classes, classChange: CFG.classChange, avatars: CFG.avatars, hookers: CFG.hookers, house: CFG.house, mastery: CFG.mastery, missions: CFG.missions.length, start: CFG.start,
    round: { playDays: CFG.round.playDays, noPvpMs: CFG.round.noPvpMs },
  };
}

// ---------- contas e sessões ----------
const NOME_RE = /^[A-Za-z0-9_]{3,16}$/;
function hashSenha(senha) {
  const sal = randomBytes(16);
  const h = scryptSync(senha, sal, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `s1$${sal.toString('base64')}$${h.toString('base64')}`;
}
function confereSenha(senha, guardado) {
  const [v, s, h] = guardado.split('$');
  if (v !== 's1') return false;
  const calc = scryptSync(senha, Buffer.from(s, 'base64'), 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const esperado = Buffer.from(h, 'base64');
  return esperado.length === calc.length && timingSafeEqual(esperado, calc);
}
const sha = (x) => createHash('sha256').update(x).digest('hex');
const SESSAO_MS = 30 * T.DAY;

function criarSessao(res, conta, now) {
  const token = randomBytes(32).toString('base64url');
  q.novaSessao.run(sha(token), conta, now + SESSAO_MS);
  res.setHeader('Set-Cookie', `cr_s=${token}; HttpOnly${SECURE}; SameSite=Lax; Path=/; Max-Age=${SESSAO_MS / 1000}`);
}

function lerCookie(req) {
  const c = req.headers.cookie || '';
  const m = c.match(/(?:^|;\s*)cr_s=([A-Za-z0-9_-]{20,100})/);
  return m ? m[1] : null;
}

function contaDoPedido(req, now) {
  const t = lerCookie(req);
  if (!t) return null;
  const s = q.sessao.get(sha(t));
  if (!s || s.expira < now) return null;
  return s.conta;
}

// ---------- limites de pedidos ----------
const baldes = new Map();
function limite(chave, max, janelaMs, now) {
  let b = baldes.get(chave);
  if (!b || b.ate < now) { b = { n: 0, ate: now + janelaMs }; baldes.set(chave, b); }
  b.n += 1;
  return b.n <= max;
}
setInterval(() => {
  const now = clock();
  for (const [k, b] of baldes) if (b.ate < now) baldes.delete(k);
  // respostas guardadas para toques repetidos: só de quem jogou na última hora
  for (const k of recentes.keys()) { const p = jogadores.get(k); if (!p || p.t < now - T.HOUR) recentes.delete(k); }
}, 60_000).unref();

// ---------- respostas ----------
function enviar(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const partes = [];
    req.on('data', (c) => { n += c.length; if (n > 8192) { reject(new Error('GRANDE')); req.destroy(); } else partes.push(c); });
    req.on('end', () => { try { const o = n ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}; resolve(o && typeof o === 'object' && !Array.isArray(o) ? o : {}); } catch { reject(new Error('JSON')); } });
    req.on('error', reject);
  });
}

// o Caddy põe o IP real em X-Real-IP (e no fim do X-Forwarded-For); o que vem antes pode ser inventado pelo cliente.
// O servidor só escuta em 127.0.0.1, por isso estes cabeçalhos só podem vir do Caddy.
const ip = (req) => String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',').pop() || req.socket.remoteAddress || '').trim();
const int = (x) => (Number.isSafeInteger(x) ? x : NaN);
// só os campos que cada jogo usa, com os tipos certos (o resto do pedido não chega ao motor)
function limpaAposta(a) {
  const bets = Array.isArray(a.bets) ? a.bets.slice(0, 13).map((b) => ({ t: String(b && b.t), s: String(b && b.s), n: b && b.n !== undefined ? int(b.n) : undefined, amt: int(b && b.amt) })) : undefined;
  return { bets, amt: int(a.amt), pick: String(a.pick), op: String(a.op || 'deal'), game: String(a.game || 'chefao'), buy: int(a.buy ?? 0) };
}

// ---------- gangues ----------
// O registo das gangues (quem é de qual, o cofre e os níveis) vive aqui; o bónus de cada membro é escrito no jogador.
db.exec(`CREATE TABLE IF NOT EXISTS gangues (ronda INTEGER NOT NULL, id TEXT NOT NULL, nome TEXT NOT NULL, nome_lc TEXT NOT NULL, tag TEXT NOT NULL, lider TEXT NOT NULL,
  cofre INTEGER NOT NULL DEFAULT 0, sede INTEGER NOT NULL DEFAULT 1, armaria INTEGER NOT NULL DEFAULT 0, aberta INTEGER NOT NULL DEFAULT 1, criada INTEGER NOT NULL, PRIMARY KEY (ronda, id));
CREATE TABLE IF NOT EXISTS gangue_membros (ronda INTEGER NOT NULL, conta TEXT NOT NULL, gangue TEXT NOT NULL, entrou INTEGER NOT NULL, dado INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (ronda, conta));
CREATE TABLE IF NOT EXISTS gangue_pedidos (ronda INTEGER NOT NULL, gangue TEXT NOT NULL, conta TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (ronda, gangue, conta));
CREATE TABLE IF NOT EXISTS gangue_chat (id INTEGER PRIMARY KEY AUTOINCREMENT, ronda INTEGER NOT NULL, gangue TEXT NOT NULL, conta TEXT NOT NULL, t INTEGER NOT NULL, txt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS gangue_chat_g ON gangue_chat (ronda, gangue, id);`);
const qg = {
  todas: db.prepare('SELECT * FROM gangues WHERE ronda = ?'),
  membros: db.prepare('SELECT * FROM gangue_membros WHERE ronda = ?'),
  pedidos: db.prepare('SELECT * FROM gangue_pedidos WHERE ronda = ?'),
  nova: db.prepare('INSERT INTO gangues (ronda, id, nome, nome_lc, tag, lider, cofre, sede, armaria, aberta, criada) VALUES (?, ?, ?, ?, ?, ?, 0, 1, 0, 1, ?)'),
  grava: db.prepare('UPDATE gangues SET lider = ?, cofre = ?, sede = ?, armaria = ?, aberta = ? WHERE ronda = ? AND id = ?'),
  apaga: db.prepare('DELETE FROM gangues WHERE ronda = ? AND id = ?'),
  entra: db.prepare('INSERT OR REPLACE INTO gangue_membros (ronda, conta, gangue, entrou, dado) VALUES (?, ?, ?, ?, ?)'),
  sai: db.prepare('DELETE FROM gangue_membros WHERE ronda = ? AND conta = ?'),
  pede: db.prepare('INSERT OR REPLACE INTO gangue_pedidos (ronda, gangue, conta, t) VALUES (?, ?, ?, ?)'),
  despede: db.prepare('DELETE FROM gangue_pedidos WHERE ronda = ? AND conta = ?'),
  despedeUm: db.prepare('DELETE FROM gangue_pedidos WHERE ronda = ? AND gangue = ? AND conta = ?'),
  apagaPedidos: db.prepare('DELETE FROM gangue_pedidos WHERE ronda = ? AND gangue = ?'),
  fala: db.prepare('INSERT INTO gangue_chat (ronda, gangue, conta, t, txt) VALUES (?, ?, ?, ?, ?)'),
  chat: db.prepare('SELECT id, conta, t, txt FROM gangue_chat WHERE ronda = ? AND gangue = ? ORDER BY id DESC LIMIT 40'),
  apagaChat: db.prepare('DELETE FROM gangue_chat WHERE ronda = ? AND gangue = ?'),
  limpaChat: db.prepare('DELETE FROM gangue_chat WHERE t < ?'),
};
const BOT = CFG.gang.bot, eBot = (g) => !!g && g.id === BOT.id;
const gangues = new Map();   // id -> { id, nome, tag, lider, cofre, sede, armaria, aberta, criada, membros: Map(conta -> { entrou, dado }), pedidos: Map(conta -> t) }
function carregarGangues() {
  gangues.clear();
  for (const g of qg.todas.all(ronda)) gangues.set(g.id, { id: g.id, nome: g.nome, tag: g.tag, lider: g.lider, cofre: g.cofre, sede: g.sede, armaria: g.armaria, aberta: !!g.aberta, criada: g.criada, membros: new Map(), pedidos: new Map(), op: null, opCool: 0, last: null });
  for (const m of qg.membros.all(ronda)) gangues.get(m.gangue)?.membros.set(m.conta, { entrou: m.entrou, dado: m.dado });
  for (const r of qg.pedidos.all(ronda)) gangues.get(r.gangue)?.pedidos.set(r.conta, r.t);
  for (const r of qo.todas.all(ronda)) { const g = gangues.get(r.gangue); if (g) g.op = JSON.parse(r.dados); }
  // a gangue da rua (chefiada por um bot) existe em todas as rondas, mesmo vazia
  if (!gangues.has(BOT.id)) {
    qg.nova.run(ronda, BOT.id, BOT.name, BOT.name.toLowerCase(), BOT.tag, '', Date.now());
    gangues.set(BOT.id, { id: BOT.id, nome: BOT.name, tag: BOT.tag, lider: '', cofre: 0, sede: 1, armaria: 0, aberta: true, criada: Date.now(), membros: new Map(), pedidos: new Map(), op: null, opCool: 0, last: null });
  }
  // manda o registo das gangues: o bónus escrito em cada jogador acerta-se por ele
  const de = new Map(); for (const g of gangues.values()) for (const c of g.membros.keys()) de.set(c, g);
  for (const p of jogadores.values()) { const g = de.get(p.id); if (g) E.gangSet(p, g.id, g.sede, g.armaria); else if (p.gang) E.gangOrphan(p); }
}
const gangueDe = (conta) => { const p = jogadores.get(conta); return p && p.gang ? gangues.get(p.gang) || null : null; };
const tagDe = (conta) => gangueDe(conta)?.tag || '';
const NOME_G = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{1,18}[\p{L}\p{N}]$/u, TAG_G = /^[A-Z0-9]{2,4}$/;
const gravaG = (g) => qg.grava.run(g.lider, g.cofre, g.sede, g.armaria, g.aberta ? 1 : 0, ronda, g.id);
// ---- golpes e tareias em grupo: uma operação aberta por gangue; quem alinha fica gravado, para um reinício não perder a stamina de ninguém ----
db.exec('CREATE TABLE IF NOT EXISTS gangue_ops (ronda INTEGER NOT NULL, gangue TEXT NOT NULL, dados TEXT NOT NULL, PRIMARY KEY (ronda, gangue))');
const qo = {
  todas: db.prepare('SELECT * FROM gangue_ops WHERE ronda = ?'),
  grava: db.prepare('INSERT OR REPLACE INTO gangue_ops (ronda, gangue, dados) VALUES (?, ?, ?)'),
  apaga: db.prepare('DELETE FROM gangue_ops WHERE ronda = ? AND gangue = ?'),
};
const OP_MS = (kind) => (process.env.GANG_OP_MS ? +process.env.GANG_OP_MS : kind === 'hit' ? CFG.gang.hitMs : CFG.gang.opMs);
const gravaOp = (g) => qo.grava.run(ronda, g.id, JSON.stringify(g.op));
function resolverOp(g, now) {
  const op = g.op;
  if (!op || now < op.fecha) return;
  const w = mundo(now);
  if (w.n !== ronda || w.phase !== 'play') {   // a ronda fechou com a operação aberta: fica sem efeito
    g.op = null; qo.apaga.run(ronda, g.id); return;
  }
  const todos = op.parts.map((c) => jogadores.get(c)).filter(Boolean), antes = new Map(todos.map((p) => [p.id, p.respect]));
  const ps = todos.filter((p) => E.opReady(p, now)), fora = todos.filter((p) => !ps.includes(p));
  const d = op.kind === 'hit' ? jogadores.get(op.alvo) : null, dAntes = d ? d.respect : 0;
  const devolve = (p) => (op.kind === 'hit' ? E.hitRefund(p, now) : E.heistRefund(p, now, op.k));
  for (const p of fora) devolve(p);
  let res;
  if (op.kind === 'heist') {
    const H = CFG.gang.heists[op.k];
    if (ps.length < H.need) { for (const p of ps) devolve(p); res = { kind: 'heist', k: op.k, cancelled: true, n: ps.length, need: H.need }; }
    else { const r = E.heistResolve(ps, now, op.k, rng); res = { kind: 'heist', k: op.k, success: r.success, chanceBp: r.chanceBp, parts: r.parts.map((x) => ({ name: nomeDe(x.id), money: x.money, respect: x.respect, share: x.share, busted: !!x.busted })) }; }
  } else if (ps.length < CFG.gang.hitNeed || !d || !E.hitCanResolve(d, now, g.id)) {
    for (const p of ps) devolve(p);
    res = { kind: 'hit', target: nomeDe(op.alvo), cancelled: true, n: ps.length, need: CFG.gang.hitNeed, gone: ps.length >= CFG.gang.hitNeed };
  } else {
    const r = E.hitResolve(ps, d, now, rng);
    res = { kind: 'hit', target: nomeDe(op.alvo), win: r.win, chanceBp: r.chanceBp, targetLoss: r.targetLoss || 0, parts: r.parts.map((x) => ({ name: nomeDe(x.id), money: 0, respect: x.respect, busted: false })) };
  }
  g.op = null; g.last = { t: now, ...res };
  if (!res.cancelled) g.opCool = now + CFG.gang.opCoolMs;
  db.exec('BEGIN');
  try {
    for (const p of todos) {
      guardar(p, now);
      const dentro = ps.includes(p), eu = dentro ? (res.parts || []).find((x) => x.name === nomeDe(p.id)) : null;
      if (dentro && !res.cancelled) contarDia(now, p.id, { resp: p.respect - antes.get(p.id), money: eu?.money || 0, best: eu?.money || 0, fights: res.kind === 'hit' && res.win ? 1 : 0, beaten: res.kind === 'hit' && !res.win ? 1 : 0, busts: eu?.busted ? 1 : 0 });
      evento(p.id, now, { k: 'gop', gang: g.nome, kind: res.kind, c: res.kind === 'heist' ? CFG.gang.heists[res.k].id : null, target: res.target || null, cancelled: !!res.cancelled, gone: !!res.gone, out: !dentro, need: res.need || 0,
        ok: res.kind === 'heist' ? !!res.success : !!res.win, n: ps.length, money: eu?.money || 0, respect: eu?.respect || 0, busted: !!eu?.busted });
    }
    if (d && !res.cancelled) {
      guardar(d, now); contarDia(now, d.id, { resp: d.respect - dAntes, beaten: res.win ? 1 : 0 });
      evento(d.id, now, { k: 'attacked', by: `[${g.tag}] ${g.nome}`, mode: 'beat', win: res.win, respect: d.respect - dAntes, money: 0, crew: ps.length });
    }
    qo.apaga.run(ronda, g.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); const n = ronda; ronda = -1; carregarRonda(n); console.error('op', e.message); return; }   // volta ao que estava gravado; tenta outra vez no segundo seguinte
  if (!res.cancelled) {
    if (res.kind === 'heist') noticia(now, { k: res.success ? 'gangHeist' : 'gangHeistFail', gang: g.nome, tag: g.tag, c: CFG.gang.heists[res.k].id, n: ps.length, money: res.parts.reduce((x, y) => x + y.money, 0) });
    else noticia(now, { k: res.win ? 'gangHit' : 'gangHitFail', gang: g.nome, tag: g.tag, target: res.target, n: ps.length });
  }
}
// as operações que já fecharam resolvem-se antes de qualquer ação ou vista
function resolverOps(now) { for (const g of [...gangues.values()]) if (g.op && now >= g.op.fecha) resolverOp(g, now); }
setInterval(() => {
  const now = clock();
  if (ronda < 0) return;
  try { resolverOps(now); } catch (e) { console.error('op', e.message); }
}, 1000).unref();
// abrir, alinhar ou cancelar uma operação da gangue
function agirOp(a, p, conta, now, world, ctx, g) {
  const err = (c, x) => { throw new E.GameError(c, x); };
  if (a.type === 'gangOp') {
    if (g.op) err('OP_OPEN');
    if (g.opCool > now) err('OP_WAIT', { until: g.opCool });
    let op, r;
    if (a.kind === 'hit') {
      const c = q.contaPorNome.get(String(a.target || '').toLowerCase()), d = c && jogadores.get(c.id);
      if (!d) err('NO_TARGET');
      r = E.hitJoin(p, d, now, world, a.drop === true);
      op = { kind: 'hit', alvo: d.id, by: conta, abre: now, fecha: now + OP_MS('hit'), parts: [conta] };
    } else {
      const k = int(a.k), H = CFG.gang.heists[k];
      if (!H) err('NO_CRIME');
      if (g.sede < H.sede) err('NEED_SEDE', { need: H.sede });
      r = E.heistJoin(p, now, world, k);
      op = { kind: 'heist', k, by: conta, abre: now, fecha: now + OP_MS('heist'), parts: [conta] };
    }
    g.op = op; ctx.ops.push(() => gravaOp(g));
    return { ...r, opened: true };
  }
  const op = g.op || err('NO_OP');
  if (a.type === 'gangOpJoin') {
    if (now >= op.fecha) err('NO_OP');
    if (op.parts.includes(conta)) err('IN_OP');
    if (op.parts.length >= CFG.gang.opMax) err('GANG_FULL');
    const r = op.kind === 'hit' ? E.hitJoin(p, jogadores.get(op.alvo) || err('NO_TARGET'), now, world, a.drop === true) : E.heistJoin(p, now, world, op.k);
    op.parts.push(conta); ctx.ops.push(() => gravaOp(g));
    return { ...r, joined: true };
  }
  if (a.type === 'gangOpCancel') {
    if (op.by !== conta && g.lider !== conta) err('NOT_LEADER');
    if (now >= op.fecha) err('NO_OP');
    for (const c of op.parts) { const o = jogadores.get(c); if (!o) continue; if (op.kind === 'hit') E.hitRefund(o, now); else E.heistRefund(o, now, op.k); if (o !== p) ctx.outros.push(o); }
    g.op = null; ctx.ops.push(() => qo.apaga.run(ronda, g.id));
    return { ok: true, cancelled: true };
  }
  err('BAD_ACTION');
}
function vistaOp(g, conta, now) {
  const op = g.op; if (!op) return null;
  const ps = op.parts.map((c) => jogadores.get(c)).filter(Boolean), d = op.kind === 'hit' ? jogadores.get(op.alvo) : null;
  return { kind: op.kind, k: op.k ?? null, target: d ? nomeDe(d.id) : null, by: nomeDe(op.by), mineToCancel: op.by === conta || g.lider === conta, closesAt: op.fecha, parts: op.parts.map(nomeDe), joined: op.parts.includes(conta),
    need: op.kind === 'hit' ? CFG.gang.hitNeed : CFG.gang.heists[op.k].need, e: op.kind === 'hit' ? CFG.pvp.energy : CFG.gang.heists[op.k].e,
    chance: !ps.length ? 0 : op.kind === 'hit' ? (d ? E.hitChanceBp(ps, d, now) : 0) : E.heistChanceBp(ps, op.k, now),
    // a parte do saque de quem está a ver, com o grupo como está agora (muda quando entra mais gente)
    share: op.kind === 'heist' && op.parts.includes(conta) && ps.length === op.parts.length ? E.heistShares(ps, op.k, now)[op.parts.indexOf(conta)] : null };
}

// todas as ações de gangue. ctx junta o que tem de ser gravado no mesmo passo: outros jogadores, escritas na base de dados e o que se faz depois
function agirGangue(a, p, conta, now, world, ctx) {
  const err = (c, x) => { throw new E.GameError(c, x); };
  const minha = () => gangueDe(conta) || err('NO_GANG');
  const chefe = () => { const g = minha(); if (g.lider !== conta) err('NOT_LEADER'); return g; };
  const outro = (g, nome) => { const c = q.contaPorNome.get(String(nome || '').toLowerCase()); const o = c && jogadores.get(c.id); if (!o) err('NO_TARGET'); return o; };
  const entrar = (g, o) => {
    E.gangSet(o, g.id, g.sede, g.armaria); g.membros.set(o.id, { entrou: now, dado: 0 });
    for (const x of gangues.values()) x.pedidos.delete(o.id);
    ctx.ops.push(() => { qg.entra.run(ronda, o.id, g.id, now, 0); qg.despede.run(ronda, o.id); });
  };
  // negócios da gangue: o bónus de grupo de cada membro depende do que os outros lá têm; acerta-se sempre que alguém investe ou sai
  const acertaNegocios = (g) => { const ms = [...g.membros.keys()].map((c) => jogadores.get(c)).filter(Boolean); for (const o of E.gangBizSync(ms, now)) if (o !== p && !ctx.outros.includes(o)) ctx.outros.push(o); };
  const sair = (g, o) => {
    if (g.op && g.op.parts.includes(o.id)) err('IN_OP');   // quem alinhou numa operação fica até ela acabar
    const back = E.gangLeave(o, now); g.membros.delete(o.id);
    if (back.invested > 0 && g.membros.size) acertaNegocios(g);
    ctx.ops.push(() => qg.sai.run(ronda, o.id));
    if (eBot(g)) { /* fica sempre aberta, com ou sem gente */ }
    else if (!g.membros.size) { gangues.delete(g.id); ctx.ops.push(() => { qo.apaga.run(ronda, g.id); qg.apaga.run(ronda, g.id); qg.apagaPedidos.run(ronda, g.id); qg.apagaChat.run(ronda, g.id); }); }
    else if (g.lider === o.id) { g.lider = [...g.membros].sort((x, y) => x[1].entrou - y[1].entrou)[0][0]; ctx.ops.push(() => gravaG(g)); }   // a chefia passa para o membro mais antigo
    return back;
  };
  if (a.type === 'gangOp' || a.type === 'gangOpJoin' || a.type === 'gangOpCancel') return agirOp(a, p, conta, now, world, ctx, minha());
  if (a.type !== 'gangCreate' && a.type !== 'gangDonate') E.touch(p, now);
  switch (a.type) {
    case 'gangCreate': {
      const nome = String(a.name || '').trim().replace(/\s+/g, ' '), tag = String(a.tag || '').trim().toUpperCase();
      if (!NOME_G.test(nome)) err('BAD_GANG_NAME');
      if (!TAG_G.test(tag)) err('BAD_GANG_TAG');
      for (const g of gangues.values()) { if (g.nome.toLowerCase() === nome.toLowerCase()) err('GANG_NAME_TAKEN'); if (g.tag === tag) err('GANG_TAG_TAKEN'); }
      const r = E.gangCreate(p, now, world), id = randomBytes(6).toString('base64url');
      E.gangSet(p, id, 1, 0);
      gangues.set(id, { id, nome, tag, lider: conta, cofre: 0, sede: 1, armaria: 0, aberta: true, criada: now, membros: new Map([[conta, { entrou: now, dado: 0 }]]), pedidos: new Map(), op: null, opCool: 0, last: null });
      for (const x of gangues.values()) x.pedidos.delete(conta);
      ctx.ops.push(() => { qg.nova.run(ronda, id, nome, nome.toLowerCase(), tag, conta, now); qg.entra.run(ronda, conta, id, now, 0); qg.despede.run(ronda, conta); });
      ctx.depois.push(() => noticia(now, { k: 'gangNew', name: nomeDe(conta), gang: nome, tag }));
      return { ...r, id, name: nome, tag };
    }
    case 'gangJoin': {
      const g = gangues.get(String(a.id)) || err('NO_GANG');
      if (eBot(g)) { E.gangBotCanJoin(p, now); entrar(g, p); return { ok: true, joined: true, name: g.nome, bot: true }; }   // entra quem quiser, sem limite de lugares
      E.gangCanJoin(p, now);
      if (g.membros.size >= E.gangSlots(g.sede)) err('GANG_FULL');
      if (g.aberta) { entrar(g, p); return { ok: true, joined: true, name: g.nome }; }
      if (g.pedidos.size >= 20) err('GANG_FULL');
      let meus = 0; for (const x of gangues.values()) if (x.pedidos.has(conta)) meus++;
      if (!g.pedidos.has(conta) && meus >= 3) err('TOO_MANY_ASKS');
      g.pedidos.set(conta, now); ctx.ops.push(() => qg.pede.run(ronda, g.id, conta, now));
      return { ok: true, asked: true, name: g.nome };
    }
    case 'gangAccept': case 'gangReject': {
      const g = chefe(), o = outro(g, a.name);
      if (!g.pedidos.has(o.id)) err('NO_ASK');
      if (a.type === 'gangAccept') { E.gangCanJoin(o, now); if (g.membros.size >= E.gangSlots(g.sede)) err('GANG_FULL'); }   // primeiro confirma-se tudo, só depois se mexe
      g.pedidos.delete(o.id); ctx.ops.push(() => qg.despedeUm.run(ronda, g.id, o.id));
      if (a.type === 'gangReject') return { ok: true };
      entrar(g, o); ctx.outros.push(o);
      ctx.depois.push(() => evento(o.id, now, { k: 'gangIn', gang: g.nome }));
      return { ok: true, joined: true };
    }
    case 'gangLeave': { const g = minha(), back = sair(g, p); return { ok: true, left: g.nome, back: back.refund + back.stored }; }
    case 'gangBail': case 'gangMedic': {
      const g = minha(), o = outro(g, a.name);
      if (o.id === conta || !g.membros.has(o.id)) err('NO_TARGET');
      const r = a.type === 'gangBail' ? E.bailFor(p, o, now, world) : E.medicFor(p, o, now, world);
      ctx.outros.push(o);
      ctx.depois.push(() => evento(o.id, now, { k: a.type === 'gangBail' ? 'gangBail' : 'gangMedic', by: nomeDe(conta), money: r.cost }));
      return r;
    }
    case 'gangKick': {
      const g = chefe(), o = outro(g, a.name);
      if (o.id === conta || !g.membros.has(o.id)) err('NO_TARGET');
      const back = sair(g, o); if (!ctx.outros.includes(o)) ctx.outros.push(o);
      ctx.depois.push(() => evento(o.id, now, { k: 'gangOut', gang: g.nome, money: back.refund + back.stored }));
      return { ok: true };
    }
    case 'gangLeader': {
      const g = chefe(), o = outro(g, a.name);
      if (o.id === conta || !g.membros.has(o.id)) err('NO_TARGET');
      g.lider = o.id; ctx.ops.push(() => gravaG(g));
      return { ok: true };
    }
    case 'gangOpen': { const g = chefe(); g.aberta = a.open === true; ctx.ops.push(() => gravaG(g)); return { ok: true, open: g.aberta }; }
    case 'gangDonate': {
      const g = minha(); if (eBot(g)) err('BOT_GANG_NO');   // a gangue da rua não tem cofre nem melhorias
      const r = E.gangDonate(p, now, world, int(a.amount)), m = g.membros.get(conta);
      g.cofre += r.amount; m.dado += r.amount;
      ctx.ops.push(() => { gravaG(g); qg.entra.run(ronda, conta, g.id, m.entrou, m.dado); });
      return { ...r, fund: g.cofre };
    }
    case 'gangUp': {
      const g = chefe(), what = a.what === 'armaria' ? 'armaria' : a.what === 'sede' ? 'sede' : err('BAD_ACTION');
      if (g[what] >= CFG.gang.maxLevel) err('GANG_MAX');
      const cost = what === 'sede' ? CFG.gang.sede[g.sede - 1] : CFG.gang.armaria[g.armaria];
      if (!Number.isSafeInteger(cost) || g.cofre < cost) err('NO_GANG_MONEY', { need: cost, have: g.cofre });
      g.cofre -= cost; g[what] += 1;
      for (const c of g.membros.keys()) { const o = jogadores.get(c); if (o) { E.gangSet(o, g.id, g.sede, g.armaria); if (o !== p) ctx.outros.push(o); } }
      ctx.ops.push(() => gravaG(g));
      ctx.depois.push(() => noticia(now, { k: 'gangUp', gang: g.nome, tag: g.tag, what, n: g[what] }));
      return { ok: true, what, level: g[what], cost, fund: g.cofre };
    }
    case 'gangBiz': {
      const g = minha(), r = E.gangBizInvest(p, now, world, int(a.k), int(a.amount), g.sede);
      acertaNegocios(g);
      return { ...r, coop: p.gbz[r.k].coop };
    }
    case 'gangBizCollect': { minha(); return E.gangBizCollect(p, now, world); }
    case 'gangChat': {
      const g = minha(), txt = String(a.txt || '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').trim().slice(0, CFG.gang.chatMax);
      if (!txt) err('BAD_ACTION');
      if (!limite('gchat:' + conta, 8, 20_000, now)) err('SLOW_DOWN');
      ctx.ops.push(() => qg.fala.run(ronda, g.id, conta, now, txt));
      return { ok: true };
    }
  }
  err('BAD_ACTION');
}
function vistaGangue(conta, now) {
  resolverOps(now);
  const resumo = (g) => { let resp = 0; for (const c of g.membros.keys()) resp += jogadores.get(c)?.respect || 0;
    return { id: g.id, name: g.nome, tag: g.tag, members: g.membros.size, slots: eBot(g) ? Math.max(g.membros.size + 1, E.gangSlots(g.sede)) : E.gangSlots(g.sede), sede: g.sede, armaria: g.armaria, open: g.aberta, respect: resp, leader: eBot(g) ? 'Bot' : nomeDe(g.lider), bot: eBot(g) }; };
  const list = [...gangues.values()].filter((g) => !eBot(g)).map(resumo).sort((a, b) => b.respect - a.respect || a.name.localeCompare(b.name)).slice(0, 50).map((x, i) => ({ ...x, pos: i + 1, asked: gangues.get(x.id).pedidos.has(conta) }));
  const mine = gangueDe(conta), eu0 = jogadores.get(conta), gb = gangues.get(BOT.id);
  const out = { now, list, mine: null, bot: gb ? { id: gb.id, members: gb.membros.size, wait: eu0 && eu0.gbotLeft ? eu0.gbotLeft + BOT.rejoinMs : 0 } : null };
  if (mine) {
    const quem = (c) => { const o = jogadores.get(c); if (o) E.touch(o, now); return { name: nomeDe(c), av: o?.av || 0, level: o ? E.level(o) : 1, respect: o?.respect || 0,
      jail: o && o.jailUntil > now ? o.jailUntil : 0, bail: o ? E.bailCost(o, now) : 0, hosp: o && o.hospUntil > now ? o.hospUntil : 0, medic: o ? E.medicCost(o, now) : 0 }; };
    out.mine = { ...resumo(mine), pos: list.find((x) => x.id === mine.id)?.pos || null, fund: mine.cofre, leaderMe: mine.lider === conta,
      roster: (() => { const r = [...mine.membros].map(([c, m]) => ({ ...quem(c), given: m.dado, stake: (jogadores.get(c)?.gbz || []).reduce((x, y) => x + (y.inv || 0), 0), leader: c === mine.lider, me: c === conta })).sort((a, b) => b.respect - a.respect);
        return eBot(mine) && r.length > BOT.roster ? [...r.slice(0, BOT.roster), ...r.slice(BOT.roster).filter((x) => x.me)] : r; })(),   // na gangue da rua pode haver muita gente: mostram-se os 40 com mais respeito (e tu)
      biz: (() => { const eu = jogadores.get(conta), meu = E.gangBizView(eu, now);
        return CFG.gang.biz.map((b, k) => { let total = 0, n = 0, full = 0;
          for (const c of mine.membros.keys()) { const v = jogadores.get(c)?.gbz?.[k]?.inv || 0; total += v; if (v > 0) n++; if (c !== conta && meu[k].inv > 0 && v >= meu[k].inv) full++; }
          return { id: b.id, open: mine.sede >= b.sede, total, investors: n, full, ...meu[k] }; }); })(),
      asks: mine.lider === conta ? [...mine.pedidos.keys()].map(quem) : [],
      op: vistaOp(mine, conta, now), last: mine.last, opCool: mine.opCool,
      chat: qg.chat.all(ronda, mine.id).reverse().map((m) => ({ id: m.id, t: m.t, name: nomeDe(m.conta), me: m.conta === conta, txt: m.txt })) };
  }
  return out;
}

// ---------- mesas ao vivo (roleta e roda) ----------
// Uma ronda de cada vez por mesa, igual para todos: apostas abertas, fecha, sai um resultado, paga-se a toda a gente
// e abre a seguinte. As apostas ficam na base de dados no mesmo passo em que o dinheiro sai da mão do jogador.
db.exec(`CREATE TABLE IF NOT EXISTS mesa_apostas (mesa TEXT NOT NULL, id INTEGER NOT NULL, conta TEXT NOT NULL, ronda INTEGER NOT NULL,
  bets TEXT NOT NULL, total INTEGER NOT NULL, win INTEGER, PRIMARY KEY (mesa, id, conta))`);
// os resultados de cada mesa ficam gravados: o histórico é o mesmo para toda a gente e sobrevive a um reinício
db.exec('CREATE TABLE IF NOT EXISTS mesa_hist (mesa TEXT NOT NULL, id INTEGER NOT NULL, t INTEGER NOT NULL, res TEXT NOT NULL, PRIMARY KEY (mesa, id))');
const qm = {
  aposta: db.prepare('INSERT OR REPLACE INTO mesa_apostas (mesa, id, conta, ronda, bets, total, win) VALUES (?, ?, ?, ?, ?, ?, NULL)'),
  tirar: db.prepare('DELETE FROM mesa_apostas WHERE mesa = ? AND id = ? AND conta = ?'),
  paga: db.prepare('UPDATE mesa_apostas SET win = ? WHERE mesa = ? AND id = ? AND conta = ?'),
  porPagar: db.prepare('SELECT * FROM mesa_apostas WHERE win IS NULL'),
  limpar: db.prepare('DELETE FROM mesa_apostas WHERE win IS NOT NULL AND id < ?'),
  hist: db.prepare('INSERT OR REPLACE INTO mesa_hist (mesa, id, t, res) VALUES (?, ?, ?, ?)'),
  histUlt: db.prepare('SELECT res FROM mesa_hist WHERE mesa = ? ORDER BY id DESC LIMIT 24'),
  histLimpa: db.prepare('DELETE FROM mesa_hist WHERE mesa = ? AND t < ?'),
};
const MESA_BET = (g) => (process.env.MESA_BET_MS ? +process.env.MESA_BET_MS : g === 'wheel' ? 8_000 : 12_000);   // tempo para apostar (roleta: 12 s; eram 20)
const MESA_SPIN = process.env.MESA_SPIN_MS ? () => +process.env.MESA_SPIN_MS
  : (g, r) => (g === 'roulette' ? 10_500 : !r.bonus ? 17_000 : { moeda: 26_500, caixas: 42_000, bola: 24_500, louca: 31_500 }[r.s]);   // tempo da jogada que todos veem
const mesas = { roulette: { cur: null, hist: [], last: new Map() }, wheel: { cur: null, hist: [], last: new Map() } };
const resCurto = (g, r) => (g === 'roulette' ? r.n : { s: r.s, m: r.mult, i: r.idx });
for (const g of Object.keys(mesas)) mesas[g].hist = qm.histUlt.all(g).map((r) => JSON.parse(r.res));

// ao arrancar: apostas que ficaram por pagar (o servidor parou a meio de uma ronda) voltam para quem as fez
function devolverMesas(now) {
  const rows = qm.porPagar.all(); if (!rows.length) return;
  const w = mundo(now); carregarRonda(w.n);
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const p = r.ronda === ronda ? jogadores.get(r.conta) : null;
      if (p) { E.tableCredit(p, r.total); guardar(p, now); }
      qm.paga.run(r.total, r.mesa, r.id, r.conta);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); ronda = -1; carregarRonda(w.n); console.error('mesas', e.message); }
}
function pagarMesa(g, c, now) {
  const w = mundo(now); carregarRonda(w.n);
  const feitos = [];
  db.exec('BEGIN');
  try {
    for (const [conta, b] of c.bets) {
      if (b.win !== undefined) continue;
      const win = E.tablePay(g, b.bets, c.res), p = b.ronda === ronda && w.phase === 'play' ? jogadores.get(conta) : null;
      if (p) { E.tableCredit(p, win); guardar(p, now); contarDia(now, conta, { cnet: win - b.total, cwin: Math.max(0, win - b.total) }); }
      qm.paga.run(win, g, c.id, conta);
      feitos.push([conta, b, win]);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); ronda = -1; carregarRonda(w.n); console.error('mesa', g, e.message); return; }   // fica por pagar: tenta outra vez no segundo seguinte
  const m = mesas[g];
  for (const [conta, b, win] of feitos) {
    b.win = win; m.last.set(conta, { id: c.id, bets: b.bets, total: b.total, win });
    const net = win - b.total;
    if (net >= CFG.casino.newsMin) noticia(now, { k: 'casino', name: nomeDe(conta), g, money: net });
    else if (-net >= CFG.casino.newsMin) noticia(now, { k: 'casinoLoss', name: nomeDe(conta), g, money: -net });
  }
  if (m.last.size > 500) for (const k of m.last.keys()) { m.last.delete(k); if (m.last.size <= 400) break; }
}
function fecharMesa(g, now) {
  const m = mesas[g], c = m.cur;
  if (c.res === null) {
    c.res = E.tableDraw(g, rng); c.prox = c.fecha + MESA_SPIN(g, c.res);
    const curto = resCurto(g, c.res); m.hist.unshift(curto); if (m.hist.length > 24) m.hist.pop();
    try { qm.hist.run(g, c.id, now, JSON.stringify(curto)); m.n = (m.n || 0) + 1; if (m.n % 200 === 0) qm.histLimpa.run(g, now - 2 * T.DAY); } catch (e) { console.error('hist', e.message); }
  }
  if ([...c.bets.values()].some((b) => b.win === undefined)) pagarMesa(g, c, now);
}
// a ronda em curso, avançando o que for preciso (fechar, pagar, abrir a seguinte)
function mesaDe(g, now) {
  const m = mesas[g];
  if (!m) throw new E.GameError('NO_GAME');
  if (m.cur && now >= m.cur.fecha && (m.cur.res === null || [...m.cur.bets.values()].some((b) => b.win === undefined))) fecharMesa(g, now);
  if (!m.cur || (m.cur.res !== null && now >= m.cur.prox)) {
    const abre = m.cur && now - m.cur.prox < 4000 ? m.cur.prox : now;   // com gente à mesa as rondas seguem-se sem intervalo
    m.cur = { id: Math.max(Math.floor(abre / 100), (m.cur?.id || 0) + 1), abre, fecha: abre + MESA_BET(g), prox: null, res: null, bets: new Map() };
  }
  return m;
}
function mesaAberta(g, now) {
  const m = mesaDe(g, now);
  if (m.cur.res !== null || now >= m.cur.fecha) throw new E.GameError('BETS_CLOSED');
  return m;
}
function vistaMesa(g, conta, now) {
  const m = mesaDe(g, now), c = m.cur, mine = c.bets.get(conta);
  let pot = 0; for (const b of c.bets.values()) pot += b.total;
  const out = { now, g, id: c.id, phase: c.res === null ? 'bets' : 'spin', opensAt: c.abre, closesAt: c.fecha, nextAt: c.prox, players: c.bets.size, pot,
    mine: mine ? { bets: mine.bets, total: mine.total, win: mine.win } : null, hist: m.hist, last: m.last.get(conta) || null,
    prev: g === 'wheel' ? m.hist[c.res === null ? 0 : 1]?.i ?? null : null };   // onde a roda estava parada: todos partem do mesmo sítio
  if (c.res !== null) {
    out.res = c.res;
    out.wins = [...c.bets].filter(([, b]) => b.win > b.total).sort((a, b) => (b[1].win - b[1].total) - (a[1].win - a[1].total)).slice(0, 3).map(([id, b]) => ({ name: nomeDe(id), win: b.win - b.total }));
  }
  return out;
}
// as mesas nunca param: mesmo sem ninguém a ver, as rondas seguem-se à hora certa, como numa mesa ao vivo
setInterval(() => {
  const now = clock();
  for (const g of Object.keys(mesas)) { try { mesaDe(g, now); } catch (e) { console.error('mesa', e.message); } }
}, 500).unref();
devolverMesas(clock());

// ---------- ações ----------
const recentes = new Map(); // conta -> Map(rid -> resposta), para toques repetidos

function evento(conta, now, dados) { q.novoEvento.run(conta, now, JSON.stringify(dados)); }

function agir(conta, corpo, now) {
  const w = mundo(now);
  if (w.phase !== 'play') throw new E.GameError('ROUND_CLOSED');
  carregarRonda(w.n); resolverOps(now);
  const p = jogadorDe(conta, now, w);
  const world = { start: w.start, playEnd: w.playEnd };
  const a = corpo || {};
  let r, alvo = null, alvoResp0 = 0, mesa = null;
  const ctx = { outros: [], ops: [], depois: [] };   // o que as gangues têm de gravar no mesmo passo
  const resp0 = p.respect;
  switch (a.type) {
    case 'crime': r = E.doCrime(p, now, world, int(a.k), rng); break;
    case 'crimeAll': r = E.doCrimeAll(p, now, world, int(a.k), rng); break;
    case 'casino': r = E.casinoPlay(p, now, world, String(a.g), limpaAposta(a), rng); break;
    case 'tableBet': {
      const g = String(a.g), m = mesaAberta(g, now), mine = m.cur.bets.get(conta);
      r = E.tableBet(p, now, world, g, limpaAposta(a).bets, mine ? mine.bets : []);
      mesa = { g, c: m.cur, bets: r.bets, total: r.total }; r.round = m.cur.id;
      break;
    }
    case 'tableClear': {
      const g = String(a.g), m = mesaAberta(g, now), mine = m.cur.bets.get(conta);
      if (!mine) throw new E.GameError('NO_BET');
      r = E.tableClear(p, mine.bets); r.g = g;
      mesa = { g, c: m.cur, bets: null }; r.round = m.cur.id;
      break;
    }
    case 'train': r = E.train(p, now, world, String(a.stat)); break;
    case 'drug': r = E.buyDrug(p, now, world, int(a.d)); break;
    case 'refill': r = E.refill(p, now, world); break;
    case 'hooker': r = E.visitHooker(p, now, world, int(a.i), rng); if (r.rob) evento(p.id, now, { k: 'hkRob', kind: r.rob.kind, money: r.rob.loss }); break;
    case 'cure': r = E.cure(p, now, world); break;
    case 'house': r = E.buyHouse(p, now, world); break;
    case 'houseUp': r = E.buyUpgrade(p, now, world, int(a.u)); break;
    case 'class': r = E.setClass(p, now, world, String(a.id)); break;
    case 'classChange': r = E.changeClass(p, now, world, String(a.id)); break;
    case 'avatar': r = E.setAvatar(p, now, world, int(a.i)); break;
    case 'detox': r = E.detox(p, now, world); break;
    case 'claim': r = E.claimMission(p, now, world); break;
    case 'missionSwap': r = E.swapMission(p, now, world); break;
    case 'stockBuy': r = E.stockBuy(p, now, world, bolsaDe(w, now), int(a.k), int(a.n), Number.isSafeInteger(a.price) ? a.price : undefined); break;
    case 'stockSell': r = E.stockSell(p, now, world, bolsaDe(w, now), int(a.k), int(a.n), Number.isSafeInteger(a.price) ? a.price : undefined); break;
    case 'bail': r = E.payBail(p, now, world); break;
    case 'medic': r = E.payMedic(p, now, world); break;
    case 'buyBiz': r = E.buyBiz(p, now, world, int(a.i)); break;
    case 'bizGoods': r = E.bizGoods(p, now, world, int(a.i), a.on === true); break;
    case 'acct': r = E.hireAccountant(p, now, world); break;
    case 'stockLimit': r = E.stockLimit(p, now, world, bolsaDe(w, now), int(a.k), int(a.tp), int(a.sl)); break;
    case 'collect': {
      const b = E.collectBiz(p, now, world, rng);
      const c = E.collectPort(p, now, world, rng);
      const v = E.venueCollect(p, now, world);
      r = { ok: true, items: b.items, port: c.items, club: v.club, bro: v.bro };
      break;
    }
    case 'venueCollect': r = E.venueCollect(p, now, world); break;
    case 'venueBuy': r = E.venueBuy(p, now, world, String(a.kind)); break;
    case 'venueSet': r = E.venueSet(p, now, world, String(a.kind), int(a.pi), int(a.gd)); break;
    case 'stockUse': r = E.stockUse(p, now, world, int(a.d)); break;
    case 'stockDump': r = E.stockDump(p, now, world, int(a.d), int(a.n)); break;
    case 'broHire': r = E.broHire(p, now, world, int(a.i)); break;
    case 'broFire': r = E.broFire(p, now, world, int(a.slot)); break;
    case 'clubBuy': case 'broVisit': {
      // casa de outro jogador: o dinheiro vai para o caixa dele e grava-se no mesmo passo
      const c = q.contaPorNome.get(String(a.owner || '').toLowerCase());
      if (!c || !jogadores.has(c.id)) throw new E.GameError('NO_VENUE');
      const o = jogadores.get(c.id), seen = Number.isSafeInteger(a.price) ? a.price : undefined;
      r = a.type === 'clubBuy' ? E.clubBuyAt(p, o, now, world, int(a.d), seen) : E.broVisitAt(p, o, now, world, int(a.slot), rng, seen);
      r.owner = nomeDe(o.id);
      if (r.rob) evento(p.id, now, { k: 'hkRob', kind: r.rob.kind, money: r.rob.loss });
      ctx.outros.push(o);
      break;
    }
    case 'port': r = E.sendPort(p, now, world, int(a.amount), a.goods === true); break;
    case 'air': r = E.airSend(p, now, world, int(a.r), int(a.amount), a.bribe === true); break;
    case 'airCollect': r = E.airCollect(p, now, world, rng, a.keep === true); break;
    case 'deposit': r = E.deposit(p, now, world, int(a.amount)); break;
    case 'withdraw': r = E.withdraw(p, now, world, int(a.amount)); break;
    case 'gear': r = E.buyGear(p, now, world, a.kind === 'armor' ? 'armor' : a.kind === 'guard' ? 'guard' : 'weapon', int(a.idx)); break;
    case 'luxury': r = E.buyLuxury(p, now, world); break;
    case 'attack': {
      const nome = String(a.target || '').toLowerCase();
      const c = q.contaPorNome.get(nome);
      if (!c || !jogadores.has(c.id)) throw new E.GameError('NO_TARGET');
      alvo = jogadores.get(c.id);
      alvoResp0 = alvo.respect;
      r = E.attack(p, alvo, now, world, a.mode === 'mug' ? 'mug' : 'beat', rng, a.drop === true);
      break;
    }
    case 'hitman': {
      // assassino a soldo: o alvo fica a saber que foi um assassino; quem pagou só se sabe quando falha
      const c = q.contaPorNome.get(String(a.target || '').toLowerCase());
      if (!c || !jogadores.has(c.id)) throw new E.GameError('NO_TARGET');
      const o = jogadores.get(c.id), r0 = o.respect, quem = nomeDe(p.id), b = nomeDe(o.id);
      r = E.hitman(p, o, now, world, rng, a.drop === true);
      ctx.outros.push(o);
      ctx.ops.push(() => {
        evento(o.id, now, r.success ? { k: 'hitman', win: true, respect: -r.respLoss, money: r.cashLoss } : { k: 'hitman', win: false, by: quem });
        if (r.success) contarDia(now, o.id, { resp: o.respect - r0, beaten: 1 });
      });
      ctx.depois.push(() => noticia(now, r.success ? { k: 'hitman', name: '', target: b } : { k: 'hitmanFail', name: quem, target: b }));
      r = { ...r, target: b };
      break;
    }
    default:
      if (typeof a.type === 'string' && a.type.startsWith('gang')) { r = agirGangue(a, p, conta, now, world, ctx); break; }
      throw new E.GameError('BAD_ACTION');
  }
  db.exec('BEGIN');
  try {
    guardar(p, now);
    if (alvo) {
      guardar(alvo, now);
      evento(alvo.id, now, { k: 'attacked', by: nomeDe(p.id), mode: r.mode, win: r.win, respect: r.win ? -r.targetLoss : (r.defenderGain || 0), money: r.money || 0 });
    }
    for (const o of ctx.outros) guardar(o, now);
    for (const f of ctx.ops) f();
    if (mesa) { if (mesa.bets) qm.aposta.run(mesa.g, mesa.c.id, conta, ronda, JSON.stringify(mesa.bets), mesa.total); else qm.tirar.run(mesa.g, mesa.c.id, conta); }
    contarAcao(now, a, r, p, alvo, resp0, alvoResp0);
    db.exec('COMMIT');
    if (mesa) { if (mesa.bets) mesa.c.bets.set(conta, { bets: mesa.bets, total: mesa.total, ronda }); else mesa.c.bets.delete(conta); }
    noticiar(now, a, r, p, alvo);
    for (const f of ctx.depois) f();
  } catch (e) {
    db.exec('ROLLBACK');
    // o que ficou em memória deixa de ser de confiança: volta a ler da base de dados
    ronda = -1; carregarRonda(w.n);
    throw e;
  }
  return { result: r, me: vista(p, now), feed: ultimas(), target: alvo ? { name: nomeDe(alvo.id), respect: alvo.respect } : undefined };
}

// ---------- listas ----------
let cacheRank = { t: 0, n: -1, size: 0, lista: [] };
function rankingAtual(now, w) {
  carregarRonda(w.n);
  if (cacheRank.n === w.n && cacheRank.size === jogadores.size && now - cacheRank.t < 5000) return cacheRank.lista;
  const lista = E.ranking([...jogadores.values()]).map((p, i) => ({ pos: i + 1, id: p.id, name: nomeDe(p.id), respect: p.respect, level: E.level(p), av: p.av || 0, cls: p.cls || '', tag: tagDe(p.id) }));
  cacheRank = { t: now, n: w.n, size: jogadores.size, lista };
  return lista;
}

// discotecas e bordéis dos outros jogadores, com o preço que ESTE jogador lá paga (o desconto da gangue já vem feito)
function casas(conta, now, w) {
  const me = jogadorDe(conta, now, w);
  if (!me) return { clubs: [], bros: [] };
  E.touch(me, now);
  const clubs = [], bros = [];
  for (const o of jogadores.values()) {
    if (o.id === me.id || (!o.club && !o.bro)) continue;
    const v = E.venueView(o, Math.max(now, o.t)), mine = E.sameCrew(me, o);
    const base = { name: nomeDe(o.id), tag: tagDe(o.id), av: o.av || 0, gang: mine };
    if (v.club && v.stock.some((n) => n > 0)) clubs.push({ ...base, lvl: v.club.lvl, bp: E.venuePriceBp(o, 'club', me), pub: CFG.venue.prices[v.club.pi], items: v.stock.map((n, d) => (n > 0 ? { d, n, price: E.clubPriceAt(o, me, d) } : null)).filter(Boolean) });
    if (v.bro && v.bro.girls.length) bros.push({ ...base, lvl: v.bro.lvl, bp: E.venuePriceBp(o, 'bro', me), pub: CFG.venue.prices[v.bro.pi], girls: v.bro.girls.map((i, slot) => ({ slot, i, price: E.broPriceAt(o, me, i, now) })) });
  }
  // primeiro as da tua gangue, depois as mais baratas para ti
  const ord = (x, y) => (y.gang - x.gang) || (x.bp - y.bp) || (y.lvl - x.lvl) || (x.name < y.name ? -1 : 1);
  return { clubs: clubs.sort(ord).slice(0, 20), bros: bros.sort(ord).slice(0, 20) };
}
function alvos(conta, now, w) {
  const me = jogadorDe(conta, now, w);
  if (!me) return [];
  E.touch(me, now);
  const lista = [];
  for (const d of jogadores.values()) {
    if (d.id === me.id) continue;
    // a lista mostra quem dá para atacar quando estiveres livre: as razões do teu lado (prisão, hospital, escudo, energia) não escondem ninguém
    const livre = { ...me, energy: CFG.pvp.energy, jailUntil: 0, hospUntil: 0, shieldUntil: 0 };
    const motivo = E.canAttack(livre, d, now, { start: w.start, playEnd: w.playEnd });
    if (motivo && motivo !== 'NO_PVP_YET') continue;
    lista.push({
      name: nomeDe(d.id), level: E.level(d), respect: d.respect, av: d.av || 0, cls: d.cls || '', tag: tagDe(d.id),
      chance: E.attackChanceBp(me, d, now), gain: E.expectedGain(me, d, now), loot: E.mugValue(me, d, now),
      hp: E.hitmanPrice(d), hc: E.hitmanChanceBp(d), hw: E.canHitman({ ...me, shieldUntil: 0 }, d, now, { start: w.start, playEnd: w.playEnd }),
    });
  }
  // os mais interessantes primeiro: mais respeito esperado
  lista.sort((x, y) => (y.chance * y.gain) - (x.chance * x.gain));
  return lista.slice(0, 25);
}

// ---------- ficheiros estáticos (só em testes locais) ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
function estatico(req, res) {
  let u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u.endsWith('/')) u += 'index.html';
  const f = normalize(join(STATIC, u));
  if (!f.startsWith(normalize(STATIC)) || !existsSync(f) || statSync(f).isDirectory()) {
    const idx = join(STATIC, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(readFileSync(idx)); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
}

// ---------- router ----------
async function tratar(req, res) {
  const now = clock();
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  if (!path.startsWith('/api/')) { if (STATIC) return estatico(req, res); return enviar(res, 404, { error: 'NOT_FOUND' }); }
  const quem = ip(req);
  if (!limite('ip:' + quem, 600, 60_000, now)) return enviar(res, 429, { error: 'SLOW_DOWN' });

  if (req.method === 'GET' && path === '/api/saude') {
    const w = mundo(now); carregarRonda(w.n);
    return enviar(res, 200, { ok: true, ronda: w.n, fase: w.phase, jogadores: jogadores.size, v: VERSAO });
  }
  if (req.method === 'GET' && path === '/api/config') return enviar(res, 200, cfgPublica());
  if (req.method === 'GET' && path === '/api/news') {
    const w = mundo(now); carregarRonda(w.n);
    return enviar(res, 200, { now, feed: ultimas(), today: { dia: diaDe(now), items: manchetes(diaDe(now), now) }, yesterday: { dia: ontemDe(now), items: manchetes(ontemDe(now), now) } });
  }

  if (req.method === 'POST' && (path === '/api/register' || path === '/api/login')) {
    let b; try { b = await lerCorpo(req); } catch { return enviar(res, 400, { error: 'BAD_REQUEST' }); }
    const nome = String(b.name || '').trim(), senha = String(b.password || '');
    if (path === '/api/register') {
      if (b.website) return enviar(res, 400, { error: 'BAD_REQUEST' }); // isco para bots
      if (!limite('reg:' + quem, 5, T.HOUR, now)) return enviar(res, 429, { error: 'SLOW_DOWN' });
      if (!NOME_RE.test(nome)) return enviar(res, 400, { error: 'BAD_NAME' });
      if (senha.length < 8 || senha.length > 200) return enviar(res, 400, { error: 'BAD_PASSWORD' });
      if (q.contaPorNome.get(nome.toLowerCase())) return enviar(res, 409, { error: 'NAME_TAKEN' });
      const id = randomBytes(9).toString('base64url');
      const lingua = b.lang === 'pt' ? 'pt' : 'en';
      q.novaConta.run(id, nome, nome.toLowerCase(), hashSenha(senha), now, lingua);
      criarSessao(res, id, now);
      return enviar(res, 200, { ok: true, name: nome });
    }
    if (!limite('login:' + quem, 10, 5 * T.MIN, now) || !limite('login:' + nome.toLowerCase(), 10, 5 * T.MIN, now)) return enviar(res, 429, { error: 'SLOW_DOWN' });
    const c = NOME_RE.test(nome) ? q.contaPorNome.get(nome.toLowerCase()) : null;
    if (!c || !confereSenha(senha, c.hash)) return enviar(res, 401, { error: 'BAD_LOGIN' });
    criarSessao(res, c.id, now);
    return enviar(res, 200, { ok: true, name: c.nome, lang: c.lingua });
  }

  const conta = contaDoPedido(req, now);
  // sem sessão, o estado responde na mesma (sem jogador) para a página de entrada não dar erro
  if (!conta && req.method === 'GET' && path === '/api/state') {
    const w0 = mundo(now);
    return enviar(res, 200, { now, round: w0, account: null, me: null, rank: null, players: rankingAtual(now, w0).length, feed: ultimas() });
  }
  if (!conta) return enviar(res, 401, { error: 'LOGIN_REQUIRED' });

  if (req.method === 'POST' && path === '/api/logout') {
    const t = lerCookie(req); if (t) q.apagarSessao.run(sha(t));
    res.setHeader('Set-Cookie', `cr_s=; HttpOnly${SECURE}; SameSite=Lax; Path=/; Max-Age=0`);
    return enviar(res, 200, { ok: true });
  }

  const w = mundo(now);
  if (req.method === 'GET' && path === '/api/state') {
    const c = q.contaPorId.get(conta);
    const p = jogadorDe(conta, now, w);
    if (p) E.touch(p, now);
    const rk = rankingAtual(now, w);
    const pos = rk.find((x) => x.id === conta)?.pos ?? null;
    return enviar(res, 200, { now, round: w, account: { name: c?.nome, lang: c?.lingua }, me: p ? vista(p, now) : null, rank: pos, players: rk.length, feed: ultimas() });
  }
  if (req.method === 'POST' && path === '/api/lang') {
    let b; try { b = await lerCorpo(req); } catch { return enviar(res, 400, { error: 'BAD_REQUEST' }); }
    q.lingua.run(b.lang === 'pt' ? 'pt' : 'en', conta);
    return enviar(res, 200, { ok: true });
  }
  if (req.method === 'POST' && path === '/api/act') {
    if (!limite('act:' + conta, ATOS_3S, 3000, now) || !limite('actm:' + conta, ATOS_MIN, 60_000, now)) return enviar(res, 429, { error: 'SLOW_DOWN' });
    let b; try { b = await lerCorpo(req); } catch { return enviar(res, 400, { error: 'BAD_REQUEST' }); }
    const agora = clock(), wa = mundo(agora);
    const rid = typeof b.rid === 'string' && b.rid.length <= 40 ? b.rid : null;
    let mem = recentes.get(conta);
    if (!mem) { mem = new Map(); recentes.set(conta, mem); }
    if (rid && mem.has(rid)) return enviar(res, 200, mem.get(rid));
    try {
      const out = { now: agora, ...agir(conta, b, agora) };
      if (rid) { mem.set(rid, out); if (mem.size > 30) mem.delete(mem.keys().next().value); }
      return enviar(res, 200, out);
    } catch (e) {
      if (e instanceof E.GameError) {
        const { code, ...extra } = e; delete extra.message;
        const p = wa.phase === 'play' ? jogadorDe(conta, agora, wa) : null;
        if (p) { try { E.touch(p, agora); } catch { /* fica como está */ } }
        return enviar(res, 400, { error: code, ...extra, now: agora, me: p ? vista(p, agora) : null });
      }
      throw e;
    }
  }
  if (req.method === 'GET' && path === '/api/gang') { carregarRonda(w.n); return enviar(res, 200, vistaGangue(conta, now)); }
  if (req.method === 'GET' && path === '/api/table') {
    const g = url.searchParams.get('g');
    if (!Object.hasOwn(mesas, g)) return enviar(res, 400, { error: 'NO_GAME' });
    if (!limite('mesa:' + conta, 40, 10_000, now)) return enviar(res, 429, { error: 'SLOW_DOWN' });
    return enviar(res, 200, vistaMesa(g, conta, clock()));
  }
  if (req.method === 'GET' && path === '/api/stocks') return enviar(res, 200, w.phase === 'play' ? vistaBolsa(w, now) : { now, tick: 0, nextAt: 0, prices: [], gen: [], hist: [] });
  if (req.method === 'GET' && path === '/api/venues') return enviar(res, 200, { now, ...(w.phase === 'play' ? casas(conta, now, w) : { clubs: [], bros: [] }) });
  if (req.method === 'GET' && path === '/api/targets') return enviar(res, 200, { now, list: w.phase === 'play' ? alvos(conta, now, w) : [] });
  if (req.method === 'GET' && path === '/api/ranking') {
    const rk = rankingAtual(now, w);
    const minha = rk.find((x) => x.id === conta);
    const top = rk.slice(0, 100).map(({ id, ...r }) => ({ ...r, me: id === conta }));
    return enviar(res, 200, { now, top, me: minha ? { pos: minha.pos, respect: minha.respect, level: minha.level, name: minha.name } : null, total: rk.length });
  }
  if (req.method === 'GET' && path === '/api/events') {
    return enviar(res, 200, { now, list: q.eventos.all(conta).map((r) => ({ id: r.id, t: r.t, ...JSON.parse(r.dados) })) });
  }
  return enviar(res, 404, { error: 'NOT_FOUND' });
}

const server = http.createServer((req, res) => {
  tratar(req, res).catch((e) => {
    console.error('erro', e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
    if (!res.headersSent) enviar(res, 500, { error: 'SERVER' });
  });
});
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log(`crime-api em ${PORT}, dados em ${DATA}`));

// limpezas e cópias de segurança de hora a hora (guarda as últimas 24)
setInterval(() => {
  const now = clock();
  try {
    q.limparSessoes.run(now);
    q.limparEventos.run(now - 15 * T.DAY);
    const dir = join(DATA, 'copias'); mkdirSync(dir, { recursive: true });
    q.limparNoticias.run(now - 15 * T.DAY);
    qm.limpar.run(Math.floor((now - 2 * T.DAY) / 100));
    qg.limpaChat.run(now - 20 * T.DAY);
    const nome = join(dir, `jogo-${new Date(now).toISOString().slice(0, 13)}.db`);
    if (!existsSync(nome)) db.exec(`VACUUM INTO '${nome.replace(/'/g, "''")}'`);
    const fs = readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
    while (fs.length > 24) unlinkSync(join(dir, fs.shift()));
  } catch (e) { console.error('copia', e.message); }
}, T.HOUR).unref();
