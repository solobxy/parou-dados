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
  if (a.type === 'house') noticia(now, { k: 'house', name, h: p.house });
  else if (a.type === 'luxury') noticia(now, { k: 'lux', name, i: p.luxuries - 1 });
  else if (a.type === 'hooker' && r.sick) noticia(now, { k: 'sick', name });
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
  else if (a.type === 'hooker' && r.sick) v.sick = 1;
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

// ---------- vista do jogador para o browser ----------
function vista(p, now) {
  const L = E.level(p);
  const stored = E.bizStored(p, now);
  return {
    name: nomeDe(p.id),
    stats: p.stats, energy: p.energy, energyT: p.energyT,
    addiction: p.addiction, addictionT: p.addictionT, addictionCap: E.addictionCap(p),
    refill: E.refillPlan(p), detox: p.addiction > 0 ? E.detoxCost(p, now) : 0, detoxUses: E.detoxUses(p, now),
    mission: E.mission(p), wk: p.wk, stars: p.wk.map((_, k) => E.masteryStars(p, k)), counters: p.c,
    xp: p.xp, xpNeed: { F: E.practiceNeed(p, 'F'), I: E.practiceNeed(p, 'I'), C: E.practiceNeed(p, 'C') },
    cash: p.cash, bank: p.bank, bankFeeBp: E.bankFeeBp(p), bj: E.bjPublic(p), casinoMax: E.casinoMax(p), respect: p.respect, peakRespect: p.peakRespect,
    level: L, levelFrom: CFG.levels[L - 1], levelTo: CFG.levels[L] ?? null,
    jailUntil: p.jailUntil, jailTier: p.jailTier, bail: E.bailCost(p, now),
    hospUntil: p.hospUntil, medic: E.medicCost(p, now),
    protectUntil: p.protectUntil, capUntil: p.capUntil, shieldUntil: p.shieldUntil,
    weapon: p.weapon, armor: p.armor, luxuries: p.luxuries, luxuryPrice: E.luxuryPrice(p),
    attack: E.attackPower(p, now), defense: E.defensePower(p, now),
    crimes: CFG.crimes.map((c, k) => ({ chance: E.crimeChanceBp(p, k, now), unlocked: E.crimeUnlocked(p, k) })),
    sick: p.sick, cure: E.cureCost(p), hookers: CFG.hookers.list.map((_, i) => E.hookerPrice(p, i, now)), hkUses: E.hookerUses(p, now),
    house: p.house, hu: p.hu, housePrice: E.housePrice(p), huPrices: CFG.house.ups.map((_, u) => E.upgradePrice(p, u)),
    cls: p.cls, av: p.av, fx: E.activeFx(p, now), drugPrices: CFG.drugs.map((_, d) => E.drugPrice(p, d)),
    biz: p.biz.map((s, i) => ({ n: s.n, stored: stored[i].money, perH: E.bizRates(p, i).perH, price: s.n < CFG.bizMax ? E.bizPrice(i, s.n) : null, t: s.t })),
    port: p.port, portCap: E.portCap(p), portSlots: E.portSlots(p),
  };
}

function cfgPublica() {
  return {
    energy: CFG.energy, addiction: CFG.addiction, train: CFG.train, crimes: CFG.crimes, drugs: CFG.drugs,
    biz: CFG.biz.map(({ id, price, perH, resp, stat, raid, toBank }) => ({ id, price, perH, resp, stat, raid, toBank })),
    bizMax: CFG.bizMax, storageMs: CFG.storageMs, port: CFG.port, weapons: CFG.weapons, armors: CFG.armors,
    pvp: CFG.pvp, bank: CFG.bank, luxury: CFG.luxury, levels: CFG.levels, crit: CFG.crit, unlockBp: CFG.unlockBp,
    bustBp: CFG.bustBp, crimeAllMax: CFG.crimeAllMax, casino: { minBet: CFG.casino.minBet, red: CFG.casino.red, dice: CFG.casino.dice, wheel: { segs: CFG.casino.wheel.segs, spots: CFG.casino.wheel.spots }, slot: { pay: CFG.casino.slot.pay, cols: CFG.casino.slot.cols, rows: CFG.casino.slot.rows, scatterPay: CFG.casino.slot.scatterPay, free: CFG.casino.slot.free } }, classes: CFG.classes, avatars: CFG.avatars, hookers: CFG.hookers, house: CFG.house, mastery: CFG.mastery, missions: CFG.missions.length, start: CFG.start,
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
  return { bets, amt: int(a.amt), pick: String(a.pick), op: String(a.op || 'deal') };
}

// ---------- ações ----------
const recentes = new Map(); // conta -> Map(rid -> resposta), para toques repetidos

function evento(conta, now, dados) { q.novoEvento.run(conta, now, JSON.stringify(dados)); }

function agir(conta, corpo, now) {
  const w = mundo(now);
  if (w.phase !== 'play') throw new E.GameError('ROUND_CLOSED');
  const p = jogadorDe(conta, now, w);
  const world = { start: w.start, playEnd: w.playEnd };
  const a = corpo || {};
  let r, alvo = null, alvoResp0 = 0;
  const resp0 = p.respect;
  switch (a.type) {
    case 'crime': r = E.doCrime(p, now, world, int(a.k), rng); break;
    case 'crimeAll': r = E.doCrimeAll(p, now, world, int(a.k), rng); break;
    case 'casino': r = E.casinoPlay(p, now, world, String(a.g), limpaAposta(a), rng); break;
    case 'train': r = E.train(p, now, world, String(a.stat)); break;
    case 'drug': r = E.buyDrug(p, now, world, int(a.d)); break;
    case 'refill': r = E.refill(p, now, world); break;
    case 'hooker': r = E.visitHooker(p, now, world, int(a.i), rng); break;
    case 'cure': r = E.cure(p, now, world); break;
    case 'house': r = E.buyHouse(p, now, world); break;
    case 'houseUp': r = E.buyUpgrade(p, now, world, int(a.u)); break;
    case 'class': r = E.setClass(p, now, world, String(a.id)); break;
    case 'avatar': r = E.setAvatar(p, now, world, int(a.i)); break;
    case 'detox': r = E.detox(p, now, world); break;
    case 'claim': r = E.claimMission(p, now, world); break;
    case 'bail': r = E.payBail(p, now, world); break;
    case 'medic': r = E.payMedic(p, now, world); break;
    case 'buyBiz': r = E.buyBiz(p, now, world, int(a.i)); break;
    case 'collect': {
      const b = E.collectBiz(p, now, world, rng);
      const c = E.collectPort(p, now, world, rng);
      r = { ok: true, items: b.items, port: c.items };
      break;
    }
    case 'port': r = E.sendPort(p, now, world, int(a.amount)); break;
    case 'deposit': r = E.deposit(p, now, world, int(a.amount)); break;
    case 'withdraw': r = E.withdraw(p, now, world, int(a.amount)); break;
    case 'gear': r = E.buyGear(p, now, world, a.kind === 'armor' ? 'armor' : 'weapon', int(a.idx)); break;
    case 'luxury': r = E.buyLuxury(p, now, world); break;
    case 'attack': {
      const nome = String(a.target || '').toLowerCase();
      const c = q.contaPorNome.get(nome);
      if (!c || !jogadores.has(c.id)) throw new E.GameError('NO_TARGET');
      alvo = jogadores.get(c.id);
      alvoResp0 = alvo.respect;
      r = E.attack(p, alvo, now, world, a.mode === 'mug' ? 'mug' : 'beat', rng);
      break;
    }
    default: throw new E.GameError('BAD_ACTION');
  }
  db.exec('BEGIN');
  try {
    guardar(p, now);
    if (alvo) {
      guardar(alvo, now);
      evento(alvo.id, now, { k: 'attacked', by: nomeDe(p.id), mode: r.mode, win: r.win, respect: r.win ? -r.targetLoss : (r.defenderGain || 0), money: r.money || 0 });
    }
    contarAcao(now, a, r, p, alvo, resp0, alvoResp0);
    db.exec('COMMIT');
    noticiar(now, a, r, p, alvo);
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
  const lista = E.ranking([...jogadores.values()]).map((p, i) => ({ pos: i + 1, id: p.id, name: nomeDe(p.id), respect: p.respect, level: E.level(p), av: p.av || 0, cls: p.cls || '' }));
  cacheRank = { t: now, n: w.n, size: jogadores.size, lista };
  return lista;
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
      name: nomeDe(d.id), level: E.level(d), respect: d.respect, av: d.av || 0, cls: d.cls || '',
      chance: E.attackChanceBp(me, d, now), gain: E.expectedGain(me, d, now), loot: E.mugValue(me, d, now),
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
    return enviar(res, 200, { ok: true, ronda: w.n, fase: w.phase, jogadores: jogadores.size });
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
    const nome = join(dir, `jogo-${new Date(now).toISOString().slice(0, 13)}.db`);
    if (!existsSync(nome)) db.exec(`VACUUM INTO '${nome.replace(/'/g, "''")}'`);
    const fs = readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
    while (fs.length > 24) unlinkSync(join(dir, fs.shift()));
  } catch (e) { console.error('copia', e.message); }
}, T.HOUR).unref();
