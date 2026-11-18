// v90 pela API: o servidor conta o que se usa, por dia (ações, ecrãs abertos e jogadores diferentes por ação), para escolher
// os atalhos e as barras com dados. Só nomes e contagens: nada do que cada um fez fica guardado.
// Corre com: node --test dev/uso90-api.test.mjs   (dentro de crime/)
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

before(() => { dir = mkdtempSync(join(tmpdir(), 'crime-uso-')); });
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); });

const A = cliente('10.9.3.1'), B = cliente('10.9.3.2');
const uso = () => { const db = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true }); const rows = db.prepare('SELECT tipo, SUM(n) n FROM uso GROUP BY tipo').all(); db.close(); return Object.fromEntries(rows.map((r) => [r.tipo, r.n])); };

test('conta as ações feitas, os ecrãs abertos e quantos jogadores diferentes fizeram cada ação', async () => {
  srv = await novo(0);
  for (const [c, nome] of [[A, 'Usa'], [B, 'Usb']]) {
    const r = await c('POST', '/api/register', { name: nome, password: 'segredo123', email: nome.toLowerCase() + '@t.pt' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await c('POST', '/api/act', { type: 'class', id: CFG.classes[0].id });
  }
  await A('POST', '/api/act', { type: 'avatar', i: 1 }); await A('POST', '/api/act', { type: 'avatar', i: 2 }); await B('POST', '/api/act', { type: 'avatar', i: 3 });
  await A('POST', '/api/act', { type: 'naoExiste' });   // recusada: não conta
  let r = await A('POST', '/api/uso', { e: { gym: 3, feira: 1, 'MAU!': 5, bank: -2 } }); assert.equal(r.status, 200);
  r = await B('POST', '/api/uso', { e: { gym: 999 } }); assert.equal(r.status, 200);
  await parar(srv);   // ao parar grava o que estava em memória
  const u = uso();
  assert.equal(u['a:class'], 2); assert.equal(u['j:class'], 2);
  assert.equal(u['a:avatar'], 3); assert.equal(u['j:avatar'], 2, 'dois jogadores diferentes');
  assert.equal(u['a:naoExiste'], undefined, 'o que falha não conta');
  assert.equal(u['e:gym'], 3 + 200, 'no máximo 200 de cada vez'); assert.equal(u['e:feira'], 1);
  assert.equal(u['e:MAU!'], undefined); assert.equal(u['e:bank'], undefined);
});
