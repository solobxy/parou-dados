// v85 pela API: as escavações. A grelha nunca sai do servidor (nem os achados por abrir); pazadas, sair guarda na vitrine,
// o sítio fica vigiado, e valores hostis dão 400.
// Corre com: node --test dev/escavacoes85-api.test.mjs   (dentro de crime/)
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
const PORT = 4900 + Math.floor(Math.random() * 90);
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
const _caixa = () => { const db = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true }); const rows = db.prepare('SELECT fonte, SUM(entra) e, SUM(sai) s, SUM(n) n FROM caixa GROUP BY fonte').all(); db.close(); return Object.fromEntries(rows.map((r) => [r.fonte, { e: r.e, s: r.s, n: r.n }])); };

before(() => { dir = mkdtempSync(join(tmpdir(), 'crime-dig-')); });
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); });
const A = cliente('10.9.2.1');
const act = (c, x) => c('POST', '/api/act', x);
const novo = (depois) => arrancar(join(CRIME, 'server.mjs'), { TESTE_DESVIO_MS: desvio(depois) });

test('escavações pela API: a grelha nunca sai, pazadas, sair guarda na vitrine, valores hostis dão 400', async () => {
  srv = await novo(0);
  let r = await A('POST', '/api/register', { name: 'Arqueologo', password: 'segredo123', email: 'arq@t.pt' });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  await act(A, { type: 'class', id: CFG.classes[0].id });
  r = await act(A, { type: 'digStart', site: 'briteiros' }); assert.equal(r.body.error, 'NEED_STUDY');
  await parar(srv);
  mexer('Arqueologo', (e) => { e.cash = 50_000; e.respect = e.peakRespect = 200; e.done = [...(e.done || []), 'arqueologia1']; });
  srv = await novo(1000);
  const c = (await A('GET', '/api/config')).body;
  assert.equal(c.dig.size, CFG.dig.size); assert.equal(c.col.sets.castrejo.dig, 'briteiros');
  r = await act(A, { type: 'digStart', site: 'briteiros' });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.me.arq, 1); assert.equal(r.body.me.dg.site, 'briteiros'); assert.equal(r.body.me.dg.taps, CFG.dig.taps); assert.equal(r.body.me.dg.safe, CFG.dig.safe + 1);
  const txt = JSON.stringify(r.body);
  assert.ok(!txt.includes('"cells"'), 'a grelha não sai do servidor');
  for (const id of CFG.col.sets.castrejo.items) assert.ok(!txt.includes('"' + id + '"'), 'nenhum achado por abrir aparece: ' + id);
  r = await act(A, { type: 'digTap', i: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.me.dg.used, 1); assert.equal(r.body.me.dg.open.length, 1);
  r = await act(A, { type: 'digTap', i: 0 }); assert.equal(r.body.error, 'CELL_OPEN');
  for (const v of [-1, CFG.dig.size ** 2, 0.5, 'x', null, [], {}, '__proto__']) { r = await act(A, { type: 'digTap', i: v }); assert.equal(r.status, 400, JSON.stringify(v)); }
  for (const v of [null, 5, 'atlantida', '__proto__', 'constructor', {}]) { r = await act(A, { type: 'digStart', site: v }); assert.equal(r.status, 400, JSON.stringify(v)); }
  // abre casas até achar alguma coisa (ou acabar as seguras), e sai
  let got = 0;
  const safe = r.body.me.dg.safe;
  for (let i = 1; i < safe && !got; i++) { r = await act(A, { type: 'digTap', i }); assert.equal(r.status, 200); if (r.body.result.v) got++; }
  r = await act(A, { type: 'digStop' }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const raro = r.body.result.grid.filter((v) => CFG.mat.rare.includes(v)).length;   // v86: às vezes há o raro do sítio
  assert.equal(r.body.result.grid.filter(Boolean).length, CFG.dig.finds + raro, 'no fim mostra-se a grelha'); assert.ok(raro <= 1);
  const G = r.body.result.got, achados = G.filter((v) => !CFG.mat.rare.includes(v));
  assert.equal(r.body.me.dg, null); assert.ok(G.length >= got);
  assert.equal(Object.values(r.body.me.col).reduce((a, b) => a + b, 0), achados.length, 'os achados na vitrine');
  for (const m of G.filter((v) => CFG.mat.rare.includes(v))) assert.equal(r.body.me.mt[m], 1, 'o raro no depósito');
  assert.ok(r.body.me.dgc.briteiros > r.body.now);
  r = await act(A, { type: 'digStart', site: 'briteiros' }); assert.equal(r.body.error, 'DIG_WAIT');
  r = await act(A, { type: 'digStop' }); assert.equal(r.body.error, 'NO_DIG');
});
