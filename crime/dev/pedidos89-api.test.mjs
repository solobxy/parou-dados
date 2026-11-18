// v89 pela API: pedidos de compra na Feira da Ladra (quem precisa pede, quem tem vende). O dinheiro sai do banco ao
// pedir, quem vende recebe no banco menos a taxa, o comprado fica à espera de quem pediu, cancelar e acabar devolvem ao banco.
// Corre com: node --test dev/pedidos89-api.test.mjs   (dentro de crime/)
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
const PORT = 5100 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let dir, srv;

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

before(() => { dir = mkdtempSync(join(tmpdir(), 'crime-pedidos-')); });
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); });

const F = CFG.feira, fee = (v) => Math.ceil((v * F.feeBp) / 10000);
const NIVEL5 = { respect: 200, peakRespect: 200 };
const A = cliente('10.9.2.1'), B = cliente('10.9.2.2'), C = cliente('10.9.2.3');
const act = (c, x) => c('POST', '/api/act', x);
const feira = async (c, item) => (await c('GET', '/api/feira' + (item ? '?item=' + item : ''))).body;
let t = 1000;
const avanca = async (ms) => { await parar(srv); t += ms; srv = await novo(t); };
const estado = async (c) => (await c('GET', '/api/state')).body.me;

test('preparar: um comprador com dinheiro no banco e um vendedor com sucata', async () => {
  srv = await novo(0);
  for (const [c, nome] of [[A, 'Pede'], [B, 'Vende'], [C, 'Outro']]) {
    const r = await c('POST', '/api/register', { name: nome, password: 'segredo123', email: nome.toLowerCase() + '@t.pt' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await act(c, { type: 'class', id: CFG.classes[0].id });
  }
  await parar(srv);
  mexer('Pede', (e) => { Object.assign(e, NIVEL5); e.bank = 10_000; e.cash = 500; });
  mexer('Vende', (e) => { Object.assign(e, NIVEL5); e.mt = { sucata: 30 }; e.bank = 0; e.cash = 0; });
  mexer('Outro', (e) => { Object.assign(e, NIVEL5); e.mt = { sucata: 5 }; });
  srv = await novo(t);
});

test('pedir: o dinheiro sai do banco (não da mão), dentro da banda; aparece na procura e nos meus', async () => {
  const B0 = F.ref.sucata, lo = Math.ceil((B0 * F.loBp) / 10000), hi = Math.floor((B0 * F.hiBp) / 10000);
  let r = await act(A, { type: 'feiraOrder', kind: 'mt', id: 'sucata', n: 20, preco: hi + 1 });
  assert.equal(r.body.error, 'BAD_PRICE');
  r = await act(A, { type: 'feiraOrder', kind: 'inv', id: 'pistola', n: 1, preco: 1000 });
  assert.equal(r.body.error, 'NO_ITEM', 'armas não se pedem');
  r = await act(A, { type: 'feiraOrder', kind: 'mt', id: 'sucata', n: 999, preco: hi });
  assert.equal(r.body.error, 'NO_BANK', 'mais do que tem no banco');
  r = await act(A, { type: 'feiraOrder', kind: 'mt', id: 'sucata', n: 20, preco: 50 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const me = await estado(A);
  assert.equal(me.bank, 10_000 - 1000); assert.equal(me.cash, 500, 'a mão não mexe');
  const f = await feira(B, 'sucata');
  assert.deepEqual(f.procura.find((x) => x.id === 'sucata'), { kind: 'mt', id: 'sucata', preco: 50, n: 20, c: 1 });
  assert.equal(f.item.pedidos.length, 1); assert.equal(f.item.pedidos[0].preco, 50);
  assert.ok((await feira(A)).meus.some((L) => L.tipo === 'pedido' && L.n === 20));
  assert.ok(lo >= 1);
});

test('vender ao pedido: o vendedor recebe no banco menos a taxa; o comprado fica à espera de quem pediu, junto', async () => {
  const L = (await feira(B, 'sucata')).item.pedidos[0];
  let r = await act(A, { type: 'feiraFill', lid: L.lid, n: 1 });
  assert.equal(r.body.error, 'OWN_LISTING');
  r = await act(B, { type: 'feiraFill', lid: L.lid, n: 21 });
  assert.equal(r.body.error, 'BAD_AMOUNT');
  r = await act(B, { type: 'feiraFill', lid: L.lid, n: 8 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.money, 400 - fee(400));
  let v = await estado(B);
  assert.equal(v.mt.sucata, 22); assert.equal(v.bank, 400 - fee(400));
  r = await act(C, { type: 'feiraFill', lid: L.lid, n: 5 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const fa = await feira(A);
  const parado = fa.levantar.filter((x) => x.id === 'sucata');
  assert.equal(parado.length, 1, 'uma linha só'); assert.equal(parado[0].n, 13); assert.equal(parado[0].bought, true);
  assert.equal(fa.meus.find((x) => x.tipo === 'pedido').n, 7);
  r = await act(A, { type: 'feiraTake', lid: parado[0].lid });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await estado(A)).mt.sucata, 13);
});

test('cancelar devolve ao banco o que falta; um pedido que acaba também', async () => {
  const meu = (await feira(A)).meus.find((x) => x.tipo === 'pedido');
  const b0 = (await estado(A)).bank;
  let r = await act(A, { type: 'feiraCancel', lid: meu.lid });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.result.refund, 7 * 50);
  assert.equal((await estado(A)).bank, b0 + 350);
  r = await act(A, { type: 'feiraOrder', kind: 'mt', id: 'sucata', n: 4, preco: 60 });
  assert.equal(r.status, 200);
  const b1 = (await estado(A)).bank;
  await avanca(F.orderMs + 60_000);
  await feira(A);   // a feira resolve o que acabou ao abrir
  assert.equal((await estado(A)).bank, b1 + 240);
  assert.equal((await feira(A)).meus.length, 0);
});

test('as contas: o dinheiro só sai do jogo pela taxa', async () => {
  const cx = caixa();
  const pedido = cx['feira:pedido']?.s || 0, venda = cx['feira:venda']?.e || 0, devolve = cx['feira:devolve']?.e || 0;
  // pagou-se 1000 + 240; voltaram 350 + 240; venderam-se 13 a 50 = 650, menos as taxas
  assert.equal(pedido, 1240); assert.equal(devolve, 590);
  assert.equal(venda, 650 - fee(400) - fee(250));
});
