// v105 (pedido do Dinis): uma honra cuja barra já está cheia é dada logo, e não só na ação seguinte do jogador.
// Caso real: o respeito sobe sem o jogador fazer nada (defende-se de um ataque, um golpe do gangue acaba) e o nível passa a
// marca; antes, a barra ficava «30/30» a cinzento até ele carregar num botão. Agora o estado que o site pede já a traz, e fica gravada.
// Corre com: node --test dev/honras105.test.mjs   (dentro de crime/)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const AQUI = dirname(fileURLToPath(import.meta.url)), TESTE = join(AQUI, '..', 'test');
const PORT = 4300 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
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
const estado = (nome) => { const db = new DatabaseSync(join(dir, 'jogo.db')); const id = db.prepare('SELECT id FROM contas WHERE nome = ?').get(nome).id;
  const e = JSON.parse(db.prepare('SELECT estado FROM jogadores WHERE conta = ?').get(id).estado); db.close(); return e; };
async function mexer(nome, fn) {
  await parar();
  const db = new DatabaseSync(join(dir, 'jogo.db'));
  const id = db.prepare('SELECT id FROM contas WHERE nome = ?').get(nome).id, row = db.prepare('SELECT ronda, estado FROM jogadores WHERE conta = ?').get(id);
  const e = JSON.parse(row.estado); fn(e); db.prepare('UPDATE jogadores SET estado = ? WHERE conta = ? AND ronda = ?').run(JSON.stringify(e), id, row.ronda);
  db.close(); await arrancar();
}
before(async () => { dir = mkdtempSync(join(tmpdir(), 'crime-hon105-')); await arrancar(); });
after(async () => { await parar(); rmSync(dir, { recursive: true, force: true }); });

test('a honra de nível chega sem o jogador fazer nada e fica gravada', async () => {
  const ip = '10.9.0.1';
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: 'Subidor', password: 'segredo123', email: 'subidor@teste.pt' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const me = async () => (await (await fetch(BASE + '/api/state', { headers: { cookie, 'X-Forwarded-For': ip } })).json()).me;
  assert.equal((await me()).hon.level_30, undefined);
  // o respeito sobe por fora (como ao defender-se), muito acima do nível 30
  await mexer('Subidor', (e) => { e.respect = 5_000_000; e.peakRespect = 5_000_000; });
  const m = await me();
  assert.ok(m.level >= 30, 'nível ' + m.level);
  assert.ok(m.hon.level_30 > 0, 'a honra do nível 30 já devia estar dada');
  assert.ok(m.hon.level_2 > 0 && m.hon.level_10 > 0);
  await parar();
  assert.ok(estado('Subidor').hon.level_30 > 0, 'e gravada, não só na memória');
  await arrancar();
});
