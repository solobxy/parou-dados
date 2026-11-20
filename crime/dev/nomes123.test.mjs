// v123: sugestões de nomes para o herdeiro (GET /api/names): pelo início do nome, sem a própria conta, só quem joga nesta ronda;
// sem texto, os da mesma gangue; nada sem sessão. Corre com: node --test dev/nomes123.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CFG } from '../engine/config.js';

// ---------- na API ----------
const AQUI = dirname(fileURLToPath(import.meta.url)), TESTE = join(AQUI, '..', 'test');
const PORT = 5300 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
let dir, srv;
function sextaRecente() {
  const d = new Date(Date.now() - 2 * 3600e3);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  if (Date.now() - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 21) < 2 * 3600e3) d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}
const RONDA = sextaRecente(), DESVIO = Date.UTC(...RONDA.split('-').map((x, i) => (i === 1 ? +x - 1 : +x)), 21) + 5 * 3600e3 - Date.now();
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
  const ip = '10.19.0.' + ++ipN;
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@teste.pt' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const get = async (p) => (await fetch(BASE + p, { headers: { cookie, 'X-Forwarded-For': ip } })).json();
  const ag = async (body) => { const x = await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: JSON.stringify(body) }); return { status: x.status, body: await x.json() }; };
  await get('/api/state');
  return { nome, ag, get, me: async () => (await get('/api/state')).me };
}
before(async () => { dir = mkdtempSync(join(tmpdir(), 'nomes-')); await arrancar(); });
after(async () => { await parar(); rmSync(dir, { recursive: true, force: true }); });


test('API: os nomes sugeridos', async () => {
  const A = await conta('Paulo_1'), B = await conta('Pedro_2'), C = await conta('paula9'), D = await conta('Zeca');
  for (const X of [A, B, C, D]) await X.ag({ type: 'class', id: CFG.classes[0].id });
  const nomes = async (X, q) => (await X.get('/api/names?q=' + encodeURIComponent(q))).list;
  // pelo início do nome, sem diferença de maiúsculas, por ordem, com o nível; nunca a própria conta
  assert.deepEqual((await nomes(D, 'pa')).map((x) => x.name), ['paula9', 'Paulo_1']);
  assert.deepEqual((await nomes(D, 'PAU')).map((x) => x.name), ['paula9', 'Paulo_1']);
  assert.deepEqual((await nomes(A, 'pau')).map((x) => x.name), ['paula9']);
  assert.equal((await nomes(D, 'p'))[0].lv, 1);
  assert.deepEqual((await nomes(D, 'p')).map((x) => x.name), ['paula9', 'Paulo_1', 'Pedro_2']);
  // quem não joga há mais de 7 dias vem depois, mesmo que venha antes no alfabeto
  await mexer({ paula9: (e) => { e.t = Date.now() + DESVIO - 9 * 86_400_000; } });
  assert.deepEqual((await nomes(D, 'p')).map((x) => x.name), ['Paulo_1', 'Pedro_2', 'paula9']);
  // o que não pode ser um nome não pesquisa nada (nem o caráter que fecha o intervalo)
  for (const q of ['~', "p'", 'p%', 'p_~', 'a'.repeat(17), 'zé']) assert.deepEqual(await nomes(D, q), [], q);
  assert.deepEqual(await nomes(D, 'pedro_'), [{ name: 'Pedro_2', lv: 1 }]);
  // sem texto: os da mesma gangue, por respeito; sem gangue, nada
  assert.deepEqual(await nomes(D, ''), []);
  const rico = (e) => { e.cash = 500_000; e.respect = 100; e.peakRespect = 100; };
  await mexer({ Zeca: rico, Pedro_2: rico, paula9: (e) => { rico(e); e.respect = 900; e.peakRespect = 900; }, Paulo_1: rico });
  let r = await D.ag({ type: 'gangCreate', name: 'Os Zecas', tag: 'ZEC' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const gid = r.body.result.id;
  for (const X of [B, C]) { r = await X.ag({ type: 'gangJoin', id: gid }); assert.equal(r.status, 200, JSON.stringify(r.body)); }
  r = await A.ag({ type: 'gangCreate', name: 'Os Paulos', tag: 'PAU' }); assert.equal(r.status, 200);
  assert.deepEqual((await nomes(D, '')).map((x) => x.name), ['paula9', 'Pedro_2']);
  // quem ainda não entrou nesta ronda não aparece
  const E = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.19.0.99' }, body: JSON.stringify({ name: 'Pombo', password: 'segredo123', email: 'pombo@teste.pt' }) });
  assert.equal(E.status, 200);
  assert.ok(!(await nomes(D, 'po')).some((x) => x.name === 'Pombo'));
  // sem sessão
  assert.equal((await (await fetch(BASE + '/api/names?q=p')).json()).error, 'LOGIN_REQUIRED');
  // o herdeiro guarda-se com o nome sugerido
  const x = await D.ag({ type: 'ckHeir', name: 'paula9' });
  assert.equal(x.status, 200); assert.equal(x.body.result.name, 'paula9');
});
