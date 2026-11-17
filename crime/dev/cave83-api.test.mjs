// v83 pela API: o biscate deixa material, a cave faz e recolhe, a broca já não se compra, e a configuração traz as receitas.
// Corre com: node --test dev/cave83-api.test.mjs   (dentro de crime/)
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
const PORT = 4800 + Math.floor(Math.random() * 90);
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

before(() => { dir = mkdtempSync(join(tmpdir(), 'crime-cave-')); });
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); });

const A = cliente('10.8.3.1');
const R = (id) => CFG.craft.list.find((r) => r.id === id);

test('a configuração traz os materiais e as receitas', async () => {
  srv = await novo(0);
  const c = (await A('GET', '/api/config')).body;
  assert.equal(c.mat.cap, CFG.mat.cap); assert.deepEqual(c.mat.drop, CFG.mat.drop);
  assert.equal(c.craft.list.length, CFG.craft.list.length); assert.equal(c.craft.maqBp, CFG.craft.maqBp);
  assert.ok(c.gear.find((g) => g.id === 'broca').craft);
});

test('fazer na cave pela API: componentes na hora; a ferramenta ocupa a bancada, espera o tempo e recolhe-se', async () => {
  let r = await A('POST', '/api/register', { name: 'Cave', password: 'segredo123', email: 'cave@t.pt' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await A('POST', '/api/act', { type: 'class', id: CFG.classes[0].id });
  r = await A('GET', '/api/state');
  assert.deepEqual(r.body.me.mt, {}); assert.equal(r.body.me.cf, null); assert.deepEqual(r.body.me.maq, {});
  await parar(srv);
  mexer('Cave', (e) => { e.cash = 5000; e.bank = 0; e.mt = { sucata: 9, cano: 1, reagente: 1 }; });
  srv = await novo(1000);
  r = await A('POST', '/api/act', { type: 'craftTake' }); assert.equal(r.body.error, 'NO_CRAFT');
  r = await A('POST', '/api/act', { type: 'craftStart', id: 'chapa', n: 9 }); assert.equal(r.body.error, 'BAD_AMOUNT');
  r = await A('POST', '/api/act', { type: 'craftStart', id: 'motor' }); assert.equal(r.body.error, 'NO_MAT');
  r = await A('POST', '/api/act', { type: 'craftStart', id: 'chapa', n: 2 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.price, 2 * R('chapa').price); assert.equal(r.body.me.cash, 5000 - 2 * R('chapa').price);
  assert.equal(r.body.me.mt.sucata, 3); assert.equal(r.body.me.mt.chapa, 2); assert.equal(r.body.me.cf, null);
  r = await A('POST', '/api/act', { type: 'craftStart', id: 'pedecabra' }); assert.equal(r.body.error, 'NO_RECIPE');
  r = await A('POST', '/api/act', { type: 'craftStart', id: 'macarico' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.cf.id, 'macarico'); assert.equal(r.body.me.cf.end - r.body.me.cf.t0, R('macarico').ms); assert.equal(r.body.result.end, r.body.me.cf.end);
  r = await A('POST', '/api/act', { type: 'craftTake' }); assert.equal(r.body.error, 'CRAFT_WAIT');
  r = await A('POST', '/api/act', { type: 'craftStart', id: 'broca' }); assert.equal(r.body.error, 'BENCH_BUSY');
  r = await A('POST', '/api/act', { type: 'buy', id: 'macarico' }); assert.equal(r.body.error, 'ON_BENCH');
  r = await A('POST', '/api/act', { type: 'maqService', id: 'cafe' }); assert.equal(r.body.error, 'NO_MACHINE');
  r = await A('POST', '/api/act', { type: 'buy', id: 'broca' }); assert.equal(r.body.error, 'CRAFT_ONLY');
  r = await A('POST', '/api/act', { type: 'buy', id: 'explosivos' }); assert.equal(r.body.error, 'CRAFT_ONLY');
  await parar(srv);
  srv = await novo(1000 + R('macarico').ms + 5000);   // o tempo da receita passou
  r = await A('POST', '/api/act', { type: 'craftTake' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.kind, 'tool'); assert.ok(r.body.me.inv.some((x) => x.id === 'macarico')); assert.equal(r.body.me.cf, null);
  assert.equal(caixa().craftStart.s, 2 * R('chapa').price + R('macarico').price, 'o que se gastou na cave fica no caixa do jogo');
});

test('o biscate entregue pela API diz o material que deixou', async () => {
  let r = await A('POST', '/api/act', { type: 'workStart', id: 'camiao' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await parar(srv);
  srv = await novo(1000 + R('macarico').ms + 5000 + 30000);   // passou o tempo mínimo do biscate
  r = await A('POST', '/api/act', { type: 'workDone', ans: { slots: [0, 1, 2, 3, 4, 5], drops: 0 } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const m = r.body.result.mat;
  assert.equal(m.id, 'madeira'); assert.equal(m.n, r.body.result.q >= CFG.mat.good ? 2 : 1); assert.equal(r.body.me.mt.madeira, m.n);
});
