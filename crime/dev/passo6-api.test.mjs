// Passo 6 (mundo ligado), parte 1, por API:
// 1) quem tinha ações na versão 60 (preços ao acaso) fica com elas ao mesmo preço, agora numa bolsa com empresas;
// 2) as edições do jornal: a criminalidade de Lisboa, a pressão e a hipótese de ser apanhado; as notícias das empresas;
// 3) o que os jogadores gastam entra nas contas da edição (e não se perde se o servidor desligar); dividendos a quem tem ações.
// Corre com: node --test dev/passo6-api.test.mjs   (dentro de crime/; precisa do git para tirar o servidor da versão 60)
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
const V60 = '0c84d1f';   // passo 5 (versão 60): bolsa com preços ao acaso
const PORT = 4800 + Math.floor(Math.random() * 90);
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
  dir = mkdtempSync(join(tmpdir(), 'crime-p6-'));
  velho = mkdtempSync(join(tmpdir(), 'crime-v60-'));
  execSync(`git -C "${join(CRIME, '..')}" archive ${V60} crime | tar -x -C "${velho}"`);
});
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); rmSync(velho, { recursive: true, force: true }); });

import * as MW from '../engine/mundo.js';
import * as E from '../engine/engine.js';
const A = cliente('10.6.0.1');
const H = 3600e3, K = (id) => CFG.stocks.list.findIndex((s) => s.id === id);
// mexe no mundo guardado (como se os jogadores tivessem feito isto desde a última edição)
function mexerMundo(fn) {
  const db = new DatabaseSync(join(dir, 'jogo.db'));
  const row = db.prepare('SELECT ronda, dados FROM bolsa').get(), b = JSON.parse(row.dados); fn(b);
  db.prepare('UPDATE bolsa SET dados = ? WHERE ronda = ?').run(JSON.stringify(b), row.ronda); db.close();
}
const lerMundo = () => { const db = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true }); const b = JSON.parse(db.prepare('SELECT dados FROM bolsa').get().dados); db.close(); return b; };
// a próxima edição a contar de um desvio (ms depois de T0)
const proxEd = (depois) => MW.edStart(MW.edAt(T0 + depois) + 1) - T0;

test('versão 60 → passo 6: as ações ficam, ao mesmo preço, numa bolsa com empresas; a configuração e o jornal trazem o mundo', async () => {
  srv = await arrancar(join(velho, 'crime', 'server.mjs'), { TESTE_DESVIO_MS: desvio(3 * H) });
  assert.equal((await A('POST', '/api/register', { name: 'Bolsista', password: 'segredo123', email: 'bolsista@t.pt' })).status, 200);
  await A('POST', '/api/act', { type: 'class', id: 'ladrao' });
  await parar(srv);
  mexer('Bolsista', (e) => { e.cash = 500_000; e.bank = 0; e.respect = e.peakRespect = CFG.levels[59]; e.energy = 100; e.jailUntil = 0; });
  srv = await arrancar(join(velho, 'crime', 'server.mjs'), { TESTE_DESVIO_MS: desvio(3 * H + 60e3) });
  const k = K('farma'), m0 = (await A('GET', '/api/stocks')).body;
  let r = await A('POST', '/api/act', { type: 'stockBuy', k, n: 1000, price: m0.prices[k] }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const preco = (await A('GET', '/api/stocks')).body.prices;
  await parar(srv);
  srv = await novo(3 * H + 120e3);
  const m = (await A('GET', '/api/stocks')).body;
  assert.deepEqual(m.prices, preco, 'os preços ficam onde estavam');
  assert.equal(m.co.length, CFG.stocks.list.length); assert.ok(m.edNext > Date.now() + OFF);
  const me = (await A('GET', '/api/state')).body.me;
  assert.equal(me.stk[k].n, 1000);
  assert.equal(me.bustBp, E.bustChanceBp(E.newPlayer('x', 0, { start: 0, playEnd: 1 }), 0, CFG.world.lx.start));
  const cfg = await (await fetch(BASE + '/api/config')).json();
  assert.deepEqual(cfg.world.edHours, [3, 9, 15, 21]);
  const n = (await A('GET', '/api/news')).body;
  assert.equal(n.mundo.lx.crime, CFG.world.lx.start); assert.ok(Array.isArray(n.mundo.arts));
});

test('edição: criminalidade e pressão de Lisboa, dividendo a quem tem ações, e as compras empurram o preço', async () => {
  const k = K('farma');
  // o que os jogadores fizeram desde a última edição: muitos golpes em Lisboa e muitas desintoxicações
  await parar(srv);
  mexerMundo((b) => { b.w.acc.lx = 15000; b.w.acc.rev[k] = 200000; });
  const t1 = proxEd(3 * H + 120e3) + 60e3;
  srv = await novo(t1);
  const n = (await A('GET', '/api/news')).body.mundo;
  assert.ok(n.lx.crime > CFG.world.lx.start + 10, 'a criminalidade subiu'); assert.equal(n.lx.press, CFG.world.lx.start, 'a pressão vai uma edição atrás');
  const ed = n.arts[n.arts.length - 1];
  assert.ok(ed.a.some((a) => a.k === 'lx') && ed.a.some((a) => a.k === 'coRes' && a.c === 'farma' && a.mine === 200000));
  // dividendo: 1 000 ações × o que a Farma pagou por ação
  const div = Math.floor((200000 * CFG.world.divBp * 100) / (10000 * CFG.world.co.farma.float));
  const ev = (await A('GET', '/api/events')).body.list.find((e) => e.k === 'stDiv');
  assert.ok(ev, 'há aviso do dividendo'); assert.equal(ev.money, Math.floor((1000 * div) / 100)); assert.deepEqual(ev.cs, ['farma']);
  assert.equal(caixa().dividendos.e, ev.money);
  // na edição seguinte a pressão apanha a criminalidade e a hipótese de ser apanhado sobe
  await parar(srv);
  srv = await novo(proxEd(t1) + 60e3);
  const me = (await A('GET', '/api/state')).body.me;
  assert.equal(me.lx.press, n.lx.crime);
  assert.ok(me.bustBp > E.bustChanceBp(E.newPlayer('x', 0, { start: 0, playEnd: 1 }), 0, CFG.world.lx.start));
  // comprar empurra o preço; o preço que se viu tem de ser o de agora
  const p0 = (await A('GET', '/api/stocks')).body.prices[k];
  let r = await A('POST', '/api/act', { type: 'stockBuy', k, n: 2000, price: p0 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.result.price > p0);
  r = await A('POST', '/api/act', { type: 'stockBuy', k, n: 10, price: p0 }); assert.equal(r.body.error, 'PRICE_CHANGED');
});

test('o que os jogadores gastam entra nas contas da edição e não se perde ao desligar o servidor', async () => {
  const antes = lerMundo().w.acc;
  let r = await A('POST', '/api/act', { type: 'buy', id: 'balas', n: 2 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await A('POST', '/api/act', { type: 'crime', k: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  await parar(srv);   // desliga: grava as contas a meio
  const depois = lerMundo().w.acc;
  assert.equal(depois.rev[K('armas')] - antes.rev[K('armas')], 2 * CFG.bullets.price);
  assert.equal(depois.lx - antes.lx, CFG.crimes[0].e);
  srv = await novo(proxEd(3 * H) + 13 * H);
});
