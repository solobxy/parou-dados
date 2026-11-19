// v118: a classificação de cada evento n'A Sirene: primeiro quem fechou a última meta (pela ordem), depois quem tem mais fichas.
// Corre com: node --test dev/ranking118.test.mjs   (dentro de crime/)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { T } from '../engine/config.js';

// ---------- na API ----------
const AQUI = dirname(fileURLToPath(import.meta.url)), TESTE = join(AQUI, '..', 'test');
const PORT = 5000 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
const RONDA = '2026-12-04', DESVIO = Date.UTC(2026, 11, 4, 21) + 5 * 3600e3 - Date.now();   // uma sexta de dezembro: o relógio cai no Natal
let dir, srv;
async function arrancar() {
  srv = spawn(process.execPath, ['--import', join(TESTE, 'relogio.mjs'), join(AQUI, '..', 'server.mjs')], {
    env: { ...process.env, PORT: String(PORT), DATA: dir, COOKIE_INSEGURO: '1', PRIMEIRA_RONDA: RONDA, TESTE_DESVIO_MS: String(DESVIO), ATOS_3S: '100000', ATOS_MIN: '1000000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => { const s = String(d); if (!s.includes('ExperimentalWarning') && !s.includes('trace-warnings')) process.stderr.write(s); });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/api/saude')).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('servidor não arrancou');
}
async function parar() { srv.kill(); await new Promise((r) => srv.once('exit', r)); }
async function mexer(jog = {}) {
  await parar();
  const db = new DatabaseSync(join(dir, 'jogo.db'));
  for (const [nome, fn] of Object.entries(jog)) {
    const id = db.prepare('SELECT id FROM contas WHERE nome = ?').get(nome).id, row = db.prepare('SELECT ronda, estado FROM jogadores WHERE conta = ?').get(id);
    const e = JSON.parse(row.estado); fn(e); db.prepare('UPDATE jogadores SET estado = ? WHERE conta = ? AND ronda = ?').run(JSON.stringify(e), id, row.ronda);
  }
  db.close(); await arrancar();
}
let ipN = 0;
async function conta(nome) {
  const ip = '10.15.0.' + ++ipN;
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@teste.pt' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const get = async (p) => (await fetch(BASE + p, { headers: { cookie, 'X-Forwarded-For': ip } })).json();
  const ag = async (body) => { const x = await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: JSON.stringify(body) }); return { status: x.status, body: await x.json() }; };
  await get('/api/state');
  return { ag, get, me: async () => (await get('/api/state')).me };
}
before(async () => { dir = mkdtempSync(join(tmpdir(), 'ranking-')); await arrancar(); });
after(async () => { await parar(); rmSync(dir, { recursive: true, force: true }); });

test('o jornal traz a classificação do evento a decorrer', async () => {
  await Promise.all(['Ana', 'Bruno', 'Carla'].map(conta));
  const t0 = Date.now() + DESVIO, R = (n, t3) => ({ 'natal-2026': { n, got: t3 ? 7 : 0, d: '', dn: 0, g: '', gv: 0, eg: 0, ...(t3 ? { t3 } : {}) } });
  await mexer({ Ana: (e) => { e.evs = R(40); }, Bruno: (e) => { e.evs = R(160, t0 - 2 * T.HOUR); }, Carla: (e) => { e.evs = R(170, t0 - T.HOUR); } });
  const A = await conta('Dora');
  const N = await A.get('/api/news'), ev = N.evRank.find((x) => x.key === 'natal-2026');
  assert.ok(ev && ev.on); assert.equal(ev.n, 3);
  assert.deepEqual(ev.rows.map((r) => r.name), ['Bruno', 'Carla', 'Ana'], 'quem fechou primeiro, depois quem tem mais');
});
