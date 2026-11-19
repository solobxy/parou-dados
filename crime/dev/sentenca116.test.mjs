// v116 (o Dinis mostrou a folha «COURT RULING» de outro jogo: «algo do género mas ao nosso estilo»). Quem vai preso recebe a sentença:
// porque foi, a pena que a lei dá, o que as penas pesadas e o advogado mudaram, e pode recorrer uma vez por pena (paga custas, e se ganhar
// tira metade do que falta; se perder, a pena mantém-se). Corre com: node --test dev/sentenca116.test.mjs   (dentro de crime/)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const A = CFG.appeal;
const START = lisbonToUtc(2026, 11, 20, 23);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const mk = () => { const p = E.newPlayer('s' + Math.random(), START, world); p.cash = 1e5; p.respect = 5000; p.peakRespect = 5000; p.energy = 100; return p; };
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
const seq = (...v) => { let i = 0; return { int: (a) => a, chance: () => (i < v.length ? v[i++] : false) }; };
const sempre = { int: (a) => a, chance: () => true }, nunca = { int: (a) => a, chance: () => false };

test('a sentença fica registada: porquê, a pena da tabela e a pena final', () => {
  const p = mk(), k = 2, c = CFG.crimes[k];
  const r = E.doCrime(p, START, world, k, seq(false, true));   // falha e é apanhado
  assert.ok(r.busted && p.jailUntil > START);
  const s = p.jsr;
  assert.equal(s.t0, p.jailT0); assert.equal(s.k, 'crime'); assert.equal(s.id, k);
  assert.equal(s.b, c.jailMin * T.MIN); assert.equal(s.l, s.b, 'sem a lei das penas pesadas'); assert.equal(s.av, 0); assert.equal(s.em, 0);
  assert.equal(p.jailUntil - START, s.l); assert.equal(s.ap, 0);
  const v = E.sentence(p, START);
  assert.equal(v.k, 'crime'); assert.equal(v.left, s.l); assert.ok(v.appeal && v.appeal.fee >= A.feeMin && v.appeal.chance === A.baseBp);
});

test('com avença o corte do advogado aparece na sentença; tirar alguém da prisão e ser apanhado também tem sentença', () => {
  const p = mk(); p.avenca = true; p.respect = p.peakRespect = 1e7;
  assert.ok(E.level(p) >= CFG.retainer.level);
  const o = mk(); o.jailUntil = START + 30 * T.MIN; o.jailTier = 1; o.name = 'Bruno';
  const r = E.bust(p, o, START, world, seq(false, true));
  assert.ok(r.caught);
  assert.equal(p.jsr.k, 'bust'); assert.equal(p.jsr.id, 'Bruno'); assert.equal(p.jsr.av, CFG.retainer.jailCutBp);
  assert.equal(p.jailUntil - START, Math.floor((p.jsr.l * (10000 - CFG.retainer.jailCutBp)) / 10000));
  assert.equal(E.sentence(p, START).appeal.chance, A.baseBp + A.avencaBp);
});

test('recorrer: paga as custas; ganhar tira metade do que falta, perder mantém a pena; só uma vez por pena', () => {
  const p = mk();
  E.doCrime(p, START, world, 3, seq(false, true));
  const t1 = START + 30 * 1000, left = p.jailUntil - t1, fee = E.sentence(p, t1).appeal.fee, din = p.cash + p.bank;
  assert.equal(fee, Math.max(A.feeMin, Math.ceil((E.bailCost(p, t1) * A.feeBp) / 10000)));
  const r = E.jailAppeal(p, t1, world, sempre);
  assert.ok(r.won); assert.equal(r.fee, fee); assert.equal(p.cash + p.bank, din - fee);
  assert.equal(p.jailUntil - t1, left - Math.floor((left * A.cutBp) / 10000));
  assert.equal(p.jsr.ap, 1); assert.equal(E.sentence(p, t1).appeal, null);
  erro(() => E.jailAppeal(p, t1, world, sempre), 'APPEALED');
  // outra pena: perde, a pena fica igual
  const q = mk();
  E.doCrime(q, START, world, 3, seq(false, true));
  const u0 = q.jailUntil, r2 = E.jailAppeal(q, t1, world, nunca);
  assert.ok(!r2.won); assert.equal(q.jailUntil, u0); assert.equal(q.jsr.ap, 2);
  // uma pena nova volta a deixar recorrer
  q.jailUntil = 0; q.jailTier = 0;
  E.doCrime(q, t1 + 10 * T.MIN, world, 3, seq(false, true));
  assert.equal(q.jsr.ap, 0); assert.ok(E.sentence(q, t1 + 10 * T.MIN).appeal);
});

test('erros do recurso: cá fora, sem dinheiro, sem sentença; um erro não gasta nada', () => {
  const p = mk();
  erro(() => E.jailAppeal(p, START, world, sempre), 'NOT_IN_JAIL');
  E.doCrime(p, START, world, 3, seq(false, true));
  const u0 = p.jailUntil; p.cash = 0; p.bank = 0;
  erro(() => E.jailAppeal(p, START, world, sempre), 'NO_MONEY');
  assert.equal(p.jailUntil, u0); assert.equal(p.jsr.ap, 0);
  const q = mk(); q.jailUntil = START + 5 * T.MIN; q.jailTier = 1; q.jailT0 = START;   // preso antes desta versão: sem sentença registada
  erro(() => E.jailAppeal(q, START, world, sempre), 'NO_SENTENCE');
  assert.equal(E.sentence(q, START), null);
});

test('a rusga ao armazém e as penas pesadas também ficam escritas', () => {
  const p = mk();
  E.jailForTest(p, START, 10 * T.MIN, 1, { k: 'gig', id: 'camiao' });
  assert.equal(p.jsr.k, 'gig'); assert.equal(p.jsr.id, 'camiao');
  E.jailAtTest(p, START + T.MIN);
  assert.equal(p.jsr.k, 'raid'); assert.equal(p.jsr.t0, p.jailT0); assert.equal(p.jsr.b, CFG.wh.jailMin * T.MIN);
});

// ---------- na API ----------
const AQUI = dirname(fileURLToPath(import.meta.url)), TESTE = join(AQUI, '..', 'test');
const PORT = 4800 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
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
  const ip = '10.13.0.' + ++ipN;
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@teste.pt' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const get = async (p) => (await fetch(BASE + p, { headers: { cookie, 'X-Forwarded-For': ip } })).json();
  const ag = async (body) => { const x = await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: JSON.stringify(body) }); return { status: x.status, body: await x.json() }; };
  await get('/api/state');
  return { nome, ag, get, me: async () => (await get('/api/state')).me };
}
before(async () => { dir = mkdtempSync(join(tmpdir(), 'sentenca-')); await arrancar(); });
after(async () => { await parar(); rmSync(dir, { recursive: true, force: true }); });

test('API: o estado traz a sentença e o recurso; recorrer uma vez', async () => {
  const Ana = await conta('Ana');
  const t0 = Date.now() + DESVIO;
  await mexer({ Ana: (e) => { e.cash = 50_000; e.jailUntil = t0 + 20 * T.MIN; e.jailTier = 3; e.jailT0 = t0; e.jsr = { t0, k: 'crime', id: 2, b: 20 * T.MIN, l: 20 * T.MIN, av: 0, em: 0, ap: 0 }; } });
  let me = await Ana.me();
  assert.equal(me.jsr.k, 'crime'); assert.ok(me.appeal && me.appeal.fee > 0 && me.appeal.chance === A.baseBp);
  assert.ok((await Ana.get('/api/config')).appeal, 'a config pública tem o recurso');
  const r = await Ana.ag({ type: 'jailAppeal' });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  me = await Ana.me();
  assert.ok(me.jsr.ap === 1 || me.jsr.ap === 2); assert.equal(me.appeal, null);
  const r2 = await Ana.ag({ type: 'jailAppeal' }); assert.equal(r2.body.error, 'APPEALED');
});
