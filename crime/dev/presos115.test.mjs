// v115 (pedido do Dinis: «tirar outros da prisão por perícia», à maneira dos busts do Torn). No motor: a hipótese (menos com mais
// pena a faltar, mais com a perícia de furto), o preso sai, quem o tira ganha respeito e perícia, e se correr mal pode ir preso.
// Na API: a lista de quem está preso, a ação, o aviso a quem saiu e a notícia. Corre com: node --test dev/presos115.test.mjs   (dentro de crime/)
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

const B = CFG.bust;
const START = lisbonToUtc(2026, 11, 20, 23);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const mk = () => { const p = E.newPlayer('b' + Math.random(), START, world); p.cash = 1e5; p.respect = 5000; p.peakRespect = 5000; p.energy = 100; return p; };
const preso = (min) => { const p = mk(); p.jailUntil = START + min * T.MIN; p.jailTier = 2; return p; };
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
const sempre = { int: (a) => a, chance: () => true }, nunca = { int: (a) => a, chance: () => false };

test('a hipótese: desce com a pena que falta e sobe com a perícia de furto, entre o mínimo e o máximo', () => {
  const p = mk();
  assert.equal(E.bustChance(p, preso(10), START), B.baseBp - 10 * B.perMinBp);
  assert.ok(E.bustChance(p, preso(30), START) < E.bustChance(p, preso(10), START));
  assert.equal(E.bustChance(p, preso(600), START), B.minBp);
  p.sk.furto = CFG.skills.fullPts;
  assert.equal(E.bustChance(p, preso(10), START), Math.min(B.maxBp, B.baseBp - 10 * B.perMinBp + CFG.skills.maxBp));
});

test('corre bem: o preso sai, ganha-se respeito e perícia, gasta-se stamina', () => {
  const p = mk(), o = preso(35), r0 = p.respect, e0 = p.energy, sk0 = p.sk.furto;
  const r = E.bust(p, o, START, world, sempre);
  assert.ok(r.freed); assert.equal(o.jailUntil, 0);
  assert.equal(r.respect, Math.min(B.respMax, 1 + Math.floor(35 / B.respMin)));
  assert.equal(p.respect, r0 + r.respect); assert.equal(p.energy, e0 - B.e); assert.equal(p.sk.furto, sk0 + B.e);
  E.honorTrack(p, START, { j: false, h: false }, 'bust', r);
  assert.equal(p.c.busts, 1);
});

test('corre mal: às vezes passa despercebido, às vezes vai preso', () => {
  const p = mk(), o = preso(20);
  const rng1 = { int: (a) => a, chance: (bp) => bp === B.failJailBp ? false : false };
  let r = E.bust(p, o, START, world, rng1);
  assert.ok(!r.freed && !r.caught); assert.ok(o.jailUntil > START); assert.equal(p.jailUntil || 0, 0);
  r = E.bust(p, o, START + 1, world, { int: (a) => a, chance: (bp) => bp === B.failJailBp });
  assert.ok(!r.freed && r.caught); assert.ok(p.jailUntil > START);
  erro(() => E.bust(p, preso(20), START + 2, world, sempre), 'IN_JAIL');   // de dentro não se tira ninguém
});

test('erros: o próprio, quem não está preso, sem stamina', () => {
  const p = mk();
  erro(() => E.bust(p, p, START, world, sempre), 'SELF');
  erro(() => E.bust(p, mk(), START, world, sempre), 'NOT_IN_JAIL');
  const pobre = mk(); pobre.energy = B.e - 1;
  erro(() => E.bust(pobre, preso(10), START, world, sempre), 'NO_ENERGY');
  const o = preso(10), e0 = p.energy;
  erro(() => E.bust(p, o, START + 11 * T.MIN, world, sempre), 'NOT_IN_JAIL');   // a pena acabou entretanto
  assert.equal(p.energy, e0, 'um erro não gasta nada');
});

// ---------- na API ----------
const AQUI = dirname(fileURLToPath(import.meta.url)), TESTE = join(AQUI, '..', 'test');
const PORT = 4700 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
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
  const ip = '10.12.0.' + ++ipN;
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@teste.pt' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const get = async (p) => (await fetch(BASE + p, { headers: { cookie, 'X-Forwarded-For': ip } })).json();
  const ag = async (body) => { const x = await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: JSON.stringify(body) }); return { status: x.status, body: await x.json() }; };
  await get('/api/state');
  return { nome, ag, get, me: async () => (await get('/api/state')).me, events: async () => (await get('/api/events')).list };
}
before(async () => { dir = mkdtempSync(join(tmpdir(), 'presos-')); await arrancar(); });
after(async () => { await parar(); rmSync(dir, { recursive: true, force: true }); });

test('API: a lista dos presos, tirar alguém, o aviso e a notícia', async () => {
  const [A, Bo] = await Promise.all(['Ana', 'Bruno'].map(conta));
  const t0 = Date.now() + DESVIO;
  await mexer({ Ana: (e) => { e.energy = 100; e.sk.furto = CFG.skills.fullPts; e.shieldUntil = 0; }, Bruno: (e) => { e.jailUntil = t0 + 2 * T.MIN; e.jailTier = 1; } });
  const l = await A.get('/api/jail');
  assert.equal(l.n, 1); assert.equal(l.list[0].name, 'Bruno'); assert.ok(l.list[0].chance >= B.baseBp);
  assert.equal((await Bo.get('/api/jail')).n, 0, 'cada um não se vê a si próprio');
  let r = await A.ag({ type: 'bust', target: 'Ninguém' }); assert.equal(r.body.error, 'NO_TARGET');
  // com a perícia no máximo e 2 minutos de pena, a hipótese é a máxima: tenta-se até sair (ou ir preso)
  for (let k = 0; k < 6; k++) {
    r = await A.ag({ type: 'bust', target: 'Bruno' });
    if (r.status !== 200 || r.body.result.freed || r.body.result.caught) break;
  }
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  if (r.body.result.freed) {
    assert.ok(!((await Bo.me()).jailUntil > Date.now() + DESVIO), 'o Bruno saiu');
    const ev = (await Bo.events()).find((e) => e.k === 'busted'); assert.equal(ev.by, 'Ana');
    assert.equal((await A.get('/api/jail')).n, 0);
    r = await A.ag({ type: 'bust', target: 'Bruno' }); assert.equal(r.body.error, 'NOT_IN_JAIL');
  } else assert.ok(r.body.result.caught);
});
