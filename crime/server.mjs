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
import { phaseAt } from './engine/time.js';

const PORT = +(process.env.PORT || 3170);
const DATA = process.env.DATA || process.env.STATE_DIRECTORY || './dados';
const STATIC = process.env.STATIC || '';           // só para testes locais
const SECURE = process.env.COOKIE_INSEGURO ? '' : '; Secure';
// 1.ª ronda: sexta 13/11/2026, 21:00 de Lisboa (PRIMEIRA_RONDA=AAAA-MM-DD muda-a, para testes)
const [fy, fm, fd] = (process.env.PRIMEIRA_RONDA || '2026-11-13').split('-').map(Number);
const FIRST = { y: fy, m: fm, d: fd };
const rng = cryptoRng();

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
`);
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
};

// ---------- estado do jogador (Map <-> JSON) ----------
const toJson = (p) => JSON.stringify(p, (k, v) => (v instanceof Map ? { __map: [...v] } : v));
const fromJson = (s) => JSON.parse(s, (k, v) => (v && v.__map ? new Map(v.__map) : v));

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
  jogadores.clear();
  for (const r of q.daRonda.all(n)) jogadores.set(r.conta, fromJson(r.estado));
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
  if (!Array.isArray(p.detoxT)) p.detoxT = [];
  if (!p.xp) p.xp = { F: 0, I: 0, C: 0 };
  const stored = E.bizStored(p, now);
  return {
    name: nomeDe(p.id),
    stats: p.stats, energy: p.energy, energyT: p.energyT,
    addiction: p.addiction, addictionT: p.addictionT, addictionCap: E.addictionCap(p),
    refill: E.refillPlan(p), detox: p.addiction > 0 ? E.detoxCost(p, now) : 0, detoxReadyAt: E.detoxReadyAt(p, now),
    detoxLeft: CFG.detox.max - p.detoxT.length,
    xp: p.xp, xpNeed: { F: E.practiceNeed(p, 'F'), I: E.practiceNeed(p, 'I'), C: E.practiceNeed(p, 'C') },
    cash: p.cash, bank: p.bank, respect: p.respect, peakRespect: p.peakRespect,
    level: L, levelFrom: CFG.levels[L - 1], levelTo: CFG.levels[L] ?? null,
    jailUntil: p.jailUntil, jailTier: p.jailTier, bail: E.bailCost(p, now),
    hospUntil: p.hospUntil, medic: E.medicCost(p, now),
    protectUntil: p.protectUntil, capUntil: p.capUntil, shieldUntil: p.shieldUntil,
    weapon: p.weapon, armor: p.armor, luxuries: p.luxuries, luxuryPrice: E.luxuryPrice(p),
    attack: E.attackPower(p), defense: E.defensePower(p),
    crimes: CFG.crimes.map((c, k) => ({ chance: E.crimeChanceBp(p, k), unlocked: E.crimeUnlocked(p, k) })),
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
setInterval(() => { const now = clock(); for (const [k, b] of baldes) if (b.ate < now) baldes.delete(k); }, 60_000).unref();

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
    req.on('end', () => { try { resolve(n ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}); } catch { reject(new Error('JSON')); } });
    req.on('error', reject);
  });
}

// o Caddy põe o IP real em X-Real-IP (e no fim do X-Forwarded-For); o que vem antes pode ser inventado pelo cliente.
// O servidor só escuta em 127.0.0.1, por isso estes cabeçalhos só podem vir do Caddy.
const ip = (req) => String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',').pop() || req.socket.remoteAddress || '').trim();
const int = (x) => (Number.isSafeInteger(x) ? x : NaN);

// ---------- ações ----------
const recentes = new Map(); // conta -> Map(rid -> resposta), para toques repetidos

function evento(conta, now, dados) { q.novoEvento.run(conta, now, JSON.stringify(dados)); }

function agir(conta, corpo, now) {
  const w = mundo(now);
  if (w.phase !== 'play') throw new E.GameError('ROUND_CLOSED');
  const p = jogadorDe(conta, now, w);
  const world = { start: w.start, playEnd: w.playEnd };
  const a = corpo || {};
  let r, alvo = null;
  switch (a.type) {
    case 'crime': r = E.doCrime(p, now, world, int(a.k), rng); break;
    case 'train': r = E.train(p, now, world, String(a.stat)); break;
    case 'drug': r = E.buyDrug(p, now, world, int(a.d)); break;
    case 'refill': r = E.refill(p, now, world); break;
    case 'detox': r = E.detox(p, now, world); break;
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
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    // o que ficou em memória deixa de ser de confiança: volta a ler da base de dados
    ronda = -1; carregarRonda(w.n);
    throw e;
  }
  return { result: r, me: vista(p, now), target: alvo ? { name: nomeDe(alvo.id), respect: alvo.respect } : undefined };
}

// ---------- listas ----------
let cacheRank = { t: 0, n: -1, size: 0, lista: [] };
function rankingAtual(now, w) {
  carregarRonda(w.n);
  if (cacheRank.n === w.n && cacheRank.size === jogadores.size && now - cacheRank.t < 5000) return cacheRank.lista;
  const lista = E.ranking([...jogadores.values()]).map((p, i) => ({ pos: i + 1, id: p.id, name: nomeDe(p.id), respect: p.respect, level: E.level(p) }));
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
      name: nomeDe(d.id), level: E.level(d), respect: d.respect,
      chance: E.attackChanceBp(me, d), gain: E.expectedGain(me, d, now), loot: E.mugValue(me, d, now),
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
    return enviar(res, 200, { now, round: w0, account: null, me: null, rank: null, players: rankingAtual(now, w0).length });
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
    return enviar(res, 200, { now, round: w, account: { name: c?.nome, lang: c?.lingua }, me: p ? vista(p, now) : null, rank: pos, players: rk.length });
  }
  if (req.method === 'POST' && path === '/api/lang') {
    let b; try { b = await lerCorpo(req); } catch { return enviar(res, 400, { error: 'BAD_REQUEST' }); }
    q.lingua.run(b.lang === 'pt' ? 'pt' : 'en', conta);
    return enviar(res, 200, { ok: true });
  }
  if (req.method === 'POST' && path === '/api/act') {
    if (!limite('act:' + conta, 15, 3000, now) || !limite('actm:' + conta, 400, 60_000, now)) return enviar(res, 429, { error: 'SLOW_DOWN' });
    let b; try { b = await lerCorpo(req); } catch { return enviar(res, 400, { error: 'BAD_REQUEST' }); }
    const rid = typeof b.rid === 'string' && b.rid.length <= 40 ? b.rid : null;
    let mem = recentes.get(conta);
    if (!mem) { mem = new Map(); recentes.set(conta, mem); }
    if (rid && mem.has(rid)) return enviar(res, 200, mem.get(rid));
    try {
      const out = { now, ...agir(conta, b, now) };
      if (rid) { mem.set(rid, out); if (mem.size > 30) mem.delete(mem.keys().next().value); }
      return enviar(res, 200, out);
    } catch (e) {
      if (e instanceof E.GameError) {
        const { code, ...extra } = e; delete extra.message;
        const p = w.phase === 'play' ? jogadorDe(conta, now, w) : null;
        return enviar(res, 400, { error: code, ...extra, now, me: p ? vista(p, now) : null });
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
    const nome = join(dir, `jogo-${new Date(now).toISOString().slice(0, 13)}.db`);
    if (!existsSync(nome)) db.exec(`VACUUM INTO '${nome.replace(/'/g, "''")}'`);
    const fs = readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
    while (fs.length > 24) unlinkSync(join(dir, fs.shift()));
  } catch (e) { console.error('copia', e.message); }
}, T.HOUR).unref();
