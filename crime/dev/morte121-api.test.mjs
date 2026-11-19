// v121: mortes (CK) na API: o plano pelo nome do alvo, os estudos, os contactos, a parte escolhida e a execução; o que o ecrã
// recebe (o plano, a morte, o testamento) e o herdeiro. Corre com: node --test dev/morte121-api.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CFG } from '../engine/config.js';

const C = CFG.ck, RESP = (lv) => CFG.levels[lv - 1] + 1;
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
  const ip = '10.18.0.' + ++ipN;
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@teste.pt' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const get = async (p) => (await fetch(BASE + p, { headers: { cookie, 'X-Forwarded-For': ip } })).json();
  const ag = async (body) => { const x = await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: JSON.stringify(body) }); return { status: x.status, body: await x.json() }; };
  await get('/api/state');
  return { nome, ag, get, me: async () => (await get('/api/state')).me };
}
before(async () => { dir = mkdtempSync(join(tmpdir(), 'morte-')); await arrancar(); });
after(async () => { await parar(); rmSync(dir, { recursive: true, force: true }); });


test('API: plano, estudos, contactos, escolha e execução; a morte e o testamento chegam a quem tem de chegar', async () => {
  const A = await conta('Matador'), B = await conta('Alvo'), H = await conta('Herdeiro');
  for (const X of [A, B, H]) await X.ag({ type: 'class', id: CFG.classes[0].id });
  let x = await A.ag({ type: 'ckStart', target: 'Alvo' });
  assert.equal(x.body.error, 'LOW_LEVEL');
  const forte = (e) => { e.respect = RESP(80); e.peakRespect = e.respect; e.cash = 500000; e.energy = 400; e.eq.mao = { id: 'pistola', u: 20 }; e.inv.push({ id: 'balas', n: 100 }); };
  await mexer({ Matador: forte, Alvo: (e) => { e.respect = RESP(70); e.peakRespect = e.respect; e.cash = 30000; e.bank = 100000; } });
  x = await B.ag({ type: 'ckHeir', name: 'Herdeiro' }); assert.equal(x.status, 200, JSON.stringify(x.body)); assert.equal(x.body.result.name, 'Herdeiro');
  x = await A.ag({ type: 'ckStart', target: 'Ninguem' }); assert.equal(x.body.error, 'NO_TARGET');
  x = await A.ag({ type: 'ckStart', target: 'Alvo' }); assert.equal(x.status, 200, JSON.stringify(x.body));
  x = await A.ag({ type: 'ckStudy' }); assert.equal(x.body.result.part, 'cash'); assert.equal(x.body.result.v, 30000);
  x = await A.ag({ type: 'ckStudy' }); assert.equal(x.body.error, 'STUDY_WAIT');
  let me = await A.me();
  assert.equal(me.ck.plan.name, 'Alvo'); assert.equal(me.ck.plan.s.length, 1); assert.ok(me.ck.plan.chanceBp >= C.minBp);
  x = await A.ag({ type: 'ckGo' }); assert.equal(x.body.error, 'CK_STUDY');
  await mexer({ Matador: (e) => { e.ck.last -= C.studyGapMs; } });
  x = await A.ag({ type: 'ckStudy' }); assert.equal(x.body.result.part, 'wh');
  for (let i = 0; i < C.contacts; i++) { x = await A.ag({ type: 'ckContact' }); assert.equal(x.status, 200); }
  x = await A.ag({ type: 'ckPick', k: 'cars' }); assert.equal(x.body.error, 'NOT_STUDIED');
  x = await A.ag({ type: 'ckPick', k: 'cash' }); assert.equal(x.status, 200);
  const hb0 = (await H.me()).bank;
  x = await A.ag({ type: 'ckGo' }); assert.equal(x.status, 200, JSON.stringify(x.body));
  const r = x.body.result;
  assert.equal(r.target, 'Alvo');
  const mb = await B.me(), mh = await H.me(), ev = await B.get('/api/events');
  if (r.win) {
    assert.equal(r.loot, 30000);
    assert.ok(mb.ck.dead && mb.ck.dead.heir === 'Herdeiro'); assert.equal(mb.cash, CFG.start.cash); assert.equal(mb.bank, 0);
    assert.equal(mh.bank, hb0 + r.will, 'o testamento foi para o herdeiro');
    assert.ok(JSON.stringify(ev).includes('ckDead'));
  } else {
    assert.ok(JSON.stringify(ev).includes('ckTry'));
  }
  me = await A.me(); assert.equal(me.ck.plan, null);
  const cfg = await A.get('/api/config'); assert.equal(cfg.ck.level, C.level);
});
