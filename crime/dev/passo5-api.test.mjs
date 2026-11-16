// Passo 5 da base nova (golpes grandes, polícia, rasto e prisão), por API:
// 1) quem jogou na versão 59 com ferramentas compradas fica com elas como material no inventário (as que não são material voltam em dinheiro);
// 2) preparar um golpe grande, pagar os passos, esperar, comprar o material e avançar; a lavagem e a avença ficam no caixa;
// 3) preso, há que fazer: oficina, cartas, favores e fuga.
// Corre com: node --test dev/passo5-api.test.mjs   (dentro de crime/; precisa do git para tirar o servidor da versão 59)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CFG } from '../engine/config.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CRIME = join(AQUI, '..');
const V59 = 'ce44edf';   // passo 4 (versão 59): inventário e equipamento, ainda com as ferramentas compradas por ordem
const PORT = 4700 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let dir, velho, srv;

function sextaRecente() {
  const d = new Date(Date.now() - 2 * 3600e3);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const SEXTA = sextaRecente();
const T0 = Date.UTC(...SEXTA.split('-').map((x, i) => (i === 1 ? +x - 1 : +x)), 21);
const OFF = T0 - Date.now();
const desvio = (depois) => String(OFF + depois);

async function arrancar(servidor, env) {
  const p = spawn(process.execPath, ['--import', join(dirname(servidor), 'test', 'relogio.mjs'), servidor], {
    env: { ...process.env, PORT: String(PORT), DATA: dir, COOKIE_INSEGURO: '1', ATOS_3S: '1000', ATOS_MIN: '100000', PRIMEIRA_EPOCA: SEXTA, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stderr.on('data', (d) => { const s = String(d); if (!s.includes('ExperimentalWarning') && !s.includes('trace-warnings')) process.stderr.write(s); });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(BASE + '/api/saude'); if (r.ok) return p; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('servidor não arrancou');
}
const parar = async (p) => { if (!p || p.exitCode !== null) return; p.kill(); await new Promise((r) => p.once('exit', r)); };
function cliente(ip) {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json() };
  };
}
function mexer(nome, fn) {
  const db = new DatabaseSync(join(dir, 'jogo.db'));
  const id = db.prepare('SELECT id FROM contas WHERE nome = ?').get(nome).id, row = db.prepare('SELECT ronda, estado FROM jogadores WHERE conta = ?').get(id);
  const e = JSON.parse(row.estado); fn(e);
  db.prepare('UPDATE jogadores SET estado = ? WHERE conta = ? AND ronda = ?').run(JSON.stringify(e), id, row.ronda);
  db.close();
}
const caixa = () => { const db = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true }); const rows = db.prepare('SELECT fonte, SUM(entra) e, SUM(sai) s, SUM(n) n FROM caixa GROUP BY fonte').all(); db.close(); return Object.fromEntries(rows.map((r) => [r.fonte, { e: r.e, s: r.s, n: r.n }])); };
const novo = (depois) => arrancar(join(CRIME, 'server.mjs'), { TESTE_DESVIO_MS: desvio(depois) });

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'crime-p5-'));
  velho = mkdtempSync(join(tmpdir(), 'crime-v59-'));
  execSync(`git -C "${join(CRIME, '..')}" archive ${V59} crime | tar -x -C "${velho}"`);
});
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); rmSync(velho, { recursive: true, force: true }); });

const A = cliente('10.5.0.1'), B = cliente('10.5.0.2');
const H = 3600e3;
const O = (id) => CFG.ops.findIndex((o) => o.id === id);
const G = (id) => CFG.gear.find((x) => x.id === id);

test('versão 59 → passo 5: as ferramentas compradas passam a material no inventário; taser, revólver e serrada voltam em dinheiro', async () => {
  srv = await arrancar(join(velho, 'crime', 'server.mjs'), { TESTE_DESVIO_MS: desvio(3 * H) });
  assert.equal((await A('POST', '/api/register', { name: 'Ladrao', password: 'segredo123', email: 'ladrao@t.pt' })).status, 200);
  await A('POST', '/api/act', { type: 'class', id: 'ladrao' });
  assert.equal((await B('POST', '/api/register', { name: 'Preso', password: 'segredo123', email: 'preso@t.pt' })).status, 200);
  await B('POST', '/api/act', { type: 'class', id: 'ladrao' });
  await parar(srv);
  mexer('Ladrao', (e) => { e.tool = 5; e.cash = 1_000; e.bank = 0; e.jailUntil = 0; });
  srv = await novo(3 * H + 60e3);
  const me = (await A('GET', '/api/state')).body.me;
  assert.deepEqual(me.inv.map((x) => x.id), ['pedecabra', 'gazuas', 'macarico']);
  assert.equal(me.cash, 1_000 + 60 + 900 + 1_500);
  assert.equal(me.tool, -1); assert.equal(me.op, null); assert.equal(me.avenca, false); assert.equal(me.ilegal, 0);
  assert.equal(me.opsPrev.length, CFG.ops.length);
  const cfg = await (await fetch(BASE + '/api/config')).json();
  assert.equal(cfg.ops.length, 8); assert.equal(cfg.launder.freeUpTo, 100_000); assert.equal(cfg.retainer.day, 3_000); assert.equal(cfg.jail.favors, 2);
  // o pedido antigo de ferramenta (índice) compra o material
  const r = await A('POST', '/api/act', { type: 'gear', kind: 'tool', idx: 1 });
  assert.equal(r.body.error, 'HAVE_IT');
});

test('golpe grande por API: preparar, passos, esperar, material e avançar; lavagem e avença no caixa', async () => {
  const k = O('ourivesaria'), o = CFG.ops[k];
  await parar(srv);
  // (a conta ainda não foi gravada depois da passagem: os campos novos vão já postos, para a passagem não correr outra vez)
  const novos = { op: null, opPause: 0, contacts: 0, avenca: false, avD: null, avN: 0, jailT0: 0, jf: 0, ilegal: 0, tool: -1 };
  mexer('Ladrao', (e) => { Object.assign(e, novos); e.respect = e.peakRespect = CFG.levels[39]; e.cash = 200_000; e.bank = 0; e.ilegal = 90_000; e.energy = 100;
    e.eq.mao = { id: 'pistola', u: 20 }; e.inv = [{ id: 'balas', n: 20 }]; });
  srv = await novo(4 * H);
  let r = await A('POST', '/api/act', { type: 'opStart', i: O('contentor') }); assert.equal(r.body.error, 'LOW_LEVEL');
  r = await A('POST', '/api/act', { type: 'opStart', i: k }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.cash, 200_000 - o.cost); assert.equal(r.body.me.op.i, k);
  r = await A('POST', '/api/act', { type: 'opStart', i: k }); assert.equal(r.body.error, 'OP_BUSY');
  r = await A('POST', '/api/act', { type: 'opStep', kind: 'recon' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.rasto, r.body.me.op.rasto); assert.ok(r.body.me.op.recon);
  r = await A('POST', '/api/act', { type: 'opStep', kind: 'recon' }); assert.equal(r.body.error, 'STEP_DONE');
  r = await A('POST', '/api/act', { type: 'opStep', kind: 'crew' }); assert.equal(r.body.me.op.chanceBp, o.p + CFG.opSteps.crew);
  r = await A('POST', '/api/act', { type: 'opStep', kind: 'bribe' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const paid = r.body.me.op.paid;
  assert.equal(paid, o.cost + Math.ceil(o.gain / 100) + Math.ceil(o.gain / 20) + Math.ceil((o.gain * 6) / 100));
  r = await A('POST', '/api/act', { type: 'opGo' }); assert.equal(r.body.error, 'PREP_LEFT');
  // passa a preparação (48 h): falta o pé-de-cabra e balas
  await parar(srv);
  srv = await novo(4 * H + o.prepH * H + 60e3);
  r = await A('POST', '/api/act', { type: 'opGo' }); assert.equal(r.body.error, 'OP_MISSING');
  assert.deepEqual(r.body.me.op.miss, ['pedecabra', 'balas']);
  r = await A('POST', '/api/act', { type: 'buy', id: 'pedecabra' }); assert.equal(r.body.result.slot, 'mat');
  r = await A('POST', '/api/act', { type: 'buy', id: 'pedecabra' }); assert.equal(r.body.error, 'HAVE_IT');
  r = await A('POST', '/api/act', { type: 'equip', i: r.body.me.inv.findIndex((x) => x.id === 'pedecabra') }); assert.equal(r.body.error, 'NOT_WEARABLE');
  r = await A('POST', '/api/act', { type: 'buy', id: 'balas', n: 1 }); assert.equal(r.status, 200);
  const antes = r.body.me;
  r = await A('POST', '/api/act', { type: 'opGo' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const res = r.body.result, me = r.body.me;
  assert.equal(me.op, null); assert.ok(me.opPause > Date.now() + OFF); assert.equal(me.eq.mao.u, 19);
  assert.equal(me.inv.find((x) => x.id === 'balas').n, antes.inv.find((x) => x.id === 'balas').n - CFG.opSteps.bullets);
  assert.ok(me.inv.some((x) => x.id === 'pedecabra'), 'o pé-de-cabra fica');
  assert.ok(!res.busted && !res.linked, 'com suborno não há prisão');
  const cx = caixa();
  if (res.success) {
    // 90 000 já feitos: os primeiros 10 000 entram limpos, o resto paga 20%
    assert.equal(res.lav, Math.floor(((o.gain - 10_000) * CFG.launder.bp) / 10_000)); assert.equal(res.money, o.gain - res.lav);
    assert.equal(me.cash, antes.cash + res.money); assert.equal(me.ilegal, 90_000 + o.gain);
    assert.equal(cx.lavagem.s, res.lav); assert.equal(cx.opGo.e, o.gain);
  } else {
    assert.equal(res.lawyer, 0, 'com suborno não há advogado'); assert.equal(me.cash, antes.cash); assert.equal(res.lost, paid);
  }
  r = await A('POST', '/api/act', { type: 'opStart', i: O('carros') }); assert.equal(r.body.error, 'OP_PAUSE');
  // advogado em avença: paga-se o dia ao contratar
  r = await A('POST', '/api/act', { type: 'retainer', on: true }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.avenca, true); assert.equal(r.body.me.cash, me.cash - CFG.retainer.day);
  r = await A('POST', '/api/act', { type: 'retainer', on: true }); assert.equal(r.body.error, 'HAVE_IT');
  assert.equal(caixa().avenca.s, CFG.retainer.day);
  r = await A('POST', '/api/act', { type: 'opDrop' }); assert.equal(r.body.error, 'NO_OP');
});

test('prisão por API: oficina, cartas, favores e fuga; cá fora não há nada disto', async () => {
  let r = await B('POST', '/api/act', { type: 'jailWork' }); assert.equal(r.body.error, 'NOT_IN_JAIL');
  await parar(srv);
  const now = Date.now() + OFF + 4 * H + 60 * H;
  mexer('Preso', (e) => { if (e.op === undefined) Object.assign(e, { op: null, opPause: 0, contacts: 0, avenca: false, avD: null, avN: 0, ilegal: 0, tool: -1 }); e.respect = e.peakRespect = CFG.levels[19]; e.cash = 500; e.bank = 0; e.energy = 100; e.vigor = 100; e.jailUntil = now + H; e.jailTier = 101; e.jailT0 = now - 600e3; e.jf = 0; });
  srv = await novo(4 * H + 60 * H);
  r = await B('POST', '/api/act', { type: 'jailWork' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.money, CFG.jail.work); assert.equal(r.body.me.cash, 500 + CFG.jail.work);
  r = await B('POST', '/api/act', { type: 'jailCards', bet: 51 }); assert.equal(r.body.error, 'BAD_AMOUNT');
  r = await B('POST', '/api/act', { type: 'jailCards', bet: 10 }); assert.equal(r.status, 200); assert.equal(Math.abs(r.body.result.money), 10);
  const ate = r.body.me.jailUntil;
  r = await B('POST', '/api/act', { type: 'jailFavor', kind: 'time' }); assert.equal(r.status, 200);
  assert.ok(r.body.me.jailUntil < ate); assert.equal(r.body.me.jf, 1);
  r = await B('POST', '/api/act', { type: 'jailFavor', kind: 'contact' }); assert.equal(r.body.me.contacts, 1);
  r = await B('POST', '/api/act', { type: 'jailFavor', kind: 'time' }); assert.equal(r.body.error, 'NO_FAVORS');
  r = await B('POST', '/api/act', { type: 'jailEscape' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  if (r.body.result.free) assert.equal(r.body.me.jailUntil, 0); else assert.ok(r.body.me.jailUntil > r.body.result.jailUntil - 1);
  assert.equal(caixa().jailWork.e, CFG.jail.work);
});
