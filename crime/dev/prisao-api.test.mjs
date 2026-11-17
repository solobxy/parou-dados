// Preso, só se faz o que se faz na prisão (pedido de 17/11, 04:10), e as cartas da prisão mostram as duas cartas.
// Corre com: node --test dev/prisao-api.test.mjs   (dentro de crime/)
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

before(() => { dir = mkdtempSync(join(tmpdir(), 'crime-prisao-')); });
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); });

const A = cliente('10.7.0.9');

test('preso: só a prisão, a fiança, o advogado e a cara; o resto é recusado sem mexer em nada', async () => {
  srv = await novo(0);
  let r = await A('POST', '/api/register', { name: 'Preso', password: 'segredo123', email: 'preso@t.pt' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await A('POST', '/api/act', { type: 'class', id: CFG.classes[0].id });
  await parar(srv);
  mexer('Preso', (e) => { e.cash = 5000; e.bank = 0; e.jailUntil = T0 + 3600e3; e.energy = 100; e.vigor = 100; });
  srv = await novo(1000);
  for (const a of [{ type: 'deposit', amount: 100 }, { type: 'workStart', id: 'camiao' }, { type: 'casino', g: 'roulette', amt: 10, bet: 'red' }, { type: 'refill' }, { type: 'hooker', i: 0 }, { type: 'train', stat: 'F' }]) {
    r = await A('POST', '/api/act', a);
    assert.equal(r.body.error, 'IN_JAIL', JSON.stringify(a) + ' → ' + JSON.stringify(r.body));
  }
  assert.equal((await A('GET', '/api/state')).body.me.cash, 5000, 'nada mexeu');
  r = await A('POST', '/api/act', { type: 'jailCards', bet: 10 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const c = r.body.result.cards; assert.equal(c.length, 2); assert.notEqual(c[0] >> 2, c[1] >> 2);
  assert.equal(r.body.result.win, (c[0] >> 2) > (c[1] >> 2), 'ganha a carta mais alta');
  assert.deepEqual(r.body.me.jc, { n: 1, w: r.body.result.win ? 1 : 0 });
  r = await A('POST', '/api/act', { type: 'jailWork' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await A('POST', '/api/act', { type: 'bail' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await A('POST', '/api/act', { type: 'deposit', amount: 100 });
  assert.equal(r.status, 200, 'cá fora, o banco volta: ' + JSON.stringify(r.body));
});
