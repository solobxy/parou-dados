// Trabalho à mão pela API: começar uma tarefa, entregar depressa demais (recusado), entregar bem (pago) e o caixa por biscate.
// Corre com: node --test dev/trabalho-api.test.mjs   (dentro de crime/)
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
const PORT = 4700 + Math.floor(Math.random() * 90);
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

before(() => { dir = mkdtempSync(join(tmpdir(), 'crime-trab-')); });
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); });

const A = cliente('10.7.0.1');
const perfeita = (L) => {
  const ord = L.boxes.map((b, i) => [b.kg, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const slots = []; ord.forEach(([, i], k) => { slots[i] = k; });
  return { slots, drops: 0 };
};

test('biscate do camião: começar, entregar cedo demais, entregar bem e aparecer no caixa', async () => {
  srv = await novo(0);
  let r = await A('POST', '/api/register', { name: 'Trabalhador', password: 'segredo123', email: 'trab@t.pt' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await A('POST', '/api/act', { type: 'class', id: CFG.classes[0].id });
  const cfg = (await A('GET', '/api/config')).body;
  assert.deepEqual(cfg.work.list.filter((x) => !x.shift).map((x) => x.id), ['camiao', 'entregas', 'laboratorio']);
  r = await A('POST', '/api/act', { type: 'workStart', id: 'camiao' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const L = r.body.result.task.layout;
  assert.equal(L.boxes.length, 6); assert.equal(r.body.me.work.tk.id, 'camiao');
  r = await A('POST', '/api/act', { type: 'workDone', ans: perfeita(L) });
  assert.equal(r.body.error, 'TOO_FAST');
  r = await A('POST', '/api/act', { type: 'workDone', ans: { slots: [1, 1, 1, 1, 1, 1], drops: 0 } });
  assert.equal(r.body.error, 'TOO_FAST', 'o tempo confere-se primeiro');
  await parar(srv); srv = await novo(60_000);
  const st = (await A('GET', '/api/state')).body.me;
  assert.deepEqual(st.work.tk.layout, L, 'a tarefa a meio volta igual depois de recarregar');
  r = await A('POST', '/api/act', { type: 'workDone', ans: { slots: 'x' } });
  assert.equal(r.body.error, 'BAD_ANSWER');
  const c0 = st.cash;
  r = await A('POST', '/api/act', { type: 'workDone', ans: perfeita(L) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.q, 10000); assert.equal(r.body.result.money, 114);   // 95 € × 120%
  assert.equal(r.body.me.cash - c0, 114); assert.equal(r.body.me.work.tk, null);
  assert.ok(r.body.me.work.tired > 0.99 && r.body.me.work.tired <= 1);
  r = await A('POST', '/api/act', { type: 'workDone', ans: perfeita(L) });
  assert.equal(r.body.error, 'NO_TASK', 'a mesma tarefa não se entrega duas vezes');
  await parar(srv); srv = null;
  assert.equal(caixa()['trabalho:camiao'].e, 114);
});
