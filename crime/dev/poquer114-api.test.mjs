// v114: o póquer no servidor, por pedidos HTTP. Sentar (compra com o dinheiro do bolso, limites, nível, limite do dia), os da casa a
// encher a mesa, jogar mãos inteiras, sair a meio (as fichas voltam já; o que estava no pote fica), quem adormece sai sozinho, e um
// reinício do servidor a meio devolve as fichas da última mão fechada. O caixa conta o que entra e sai das mesas.
// Corre com: node --test dev/poquer114-api.test.mjs   (dentro de crime/)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CFG } from '../engine/config.js';

const AQUI = dirname(fileURLToPath(import.meta.url)), TESTE = join(AQUI, '..', 'test');
const PORT = 4600 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
const PK = CFG.poker, S0 = PK.stakes[0];
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
    env: { ...process.env, PORT: String(PORT), DATA: dir, COOKIE_INSEGURO: '1', PRIMEIRA_RONDA: RONDA, TESTE_DESVIO_MS: String(DESVIO), ATOS_3S: '100000', ATOS_MIN: '1000000', POQUER_RAPIDO: '1' },
    stdio: ['ignore', 'pipe', 'pipe'] });
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
const caixa = () => { const db = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true }); const r = db.prepare("SELECT SUM(entra) e, SUM(sai) s FROM caixa WHERE fonte = 'poquer'").get(); db.close(); return { e: r.e || 0, s: r.s || 0 }; };
const lugares = () => { const db = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true }); const r = db.prepare('SELECT * FROM poquer_lugares').all(); db.close(); return r; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ipN = 0;
async function conta(nome) {
  const ip = '10.11.0.' + ++ipN;
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@teste.pt' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const get = async (p) => (await fetch(BASE + p, { headers: { cookie, 'X-Forwarded-For': ip } })).json();
  const ag = async (body) => { const x = await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: JSON.stringify(body) }); return { status: x.status, body: await x.json() }; };
  await get('/api/state');
  return { nome, ag, get, pk: () => get('/api/poker'), me: async () => (await get('/api/state')).me, events: async () => (await get('/api/events')).list };
}
// joga até acabar uma mão depois da mão «depois»: passa ou vai a jogo sempre que é a vez dele
async function jogarMao(J, depois = 0, max = 300) {
  for (let k = 0; k < max; k++) {
    const v = (await J.pk()).mine;
    if (!v) return null;
    if (v.hand && v.hand.res && v.n > depois) return v;
    if (v.opt) { const r = await J.ag({ type: 'pkAct', move: v.opt.check ? 'check' : 'call' }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200)); }
    await espera(60);
  }
  throw new Error('a mão não acabou');
}
before(async () => { dir = mkdtempSync(join(tmpdir(), 'poquer-')); await arrancar(); });
after(async () => { await parar(); rmSync(dir, { recursive: true, force: true }); });
const rico = (e) => { e.cash = 500_000; e.bank = 0; e.respect = 60_000; e.peakRespect = 60_000; e.shieldUntil = 0; };
let A, B, C;

test('sentar: compra do bolso, limites, nível e uma mesa com os da casa', async () => {
  [A, B, C] = await Promise.all(['Ana', 'Bea', 'Caio'].map(conta));
  await mexer({ Ana: rico, Bea: rico, Caio: (e) => { e.cash = 1000; } });
  let r = await C.ag({ type: 'pkSit', st: 0, buy: S0.min }); assert.equal(r.body.error, 'LOW_LEVEL');
  r = await A.ag({ type: 'pkSit', st: 0, buy: S0.min - 1 }); assert.equal(r.body.error, 'BAD_AMOUNT');
  r = await A.ag({ type: 'pkSit', st: 9, buy: S0.min }); assert.equal(r.body.error, 'NO_STAKE');
  const c0 = (await A.me()).cash;
  r = await A.ag({ type: 'pkSit', st: 0, buy: S0.max }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.me.cash, c0 - S0.max); assert.ok(r.body.me.pk);
  r = await A.ag({ type: 'pkSit', st: 0, buy: S0.max }); assert.equal(r.body.error, 'PK_SEATED');
  const v = (await A.pk()).mine;
  assert.equal(v.seats.filter(Boolean).length, PK.minPlayers, 'os da casa enchem a mesa');
  assert.equal(v.seats.filter((s) => s && s.bot).length, PK.minPlayers - 1);
  assert.equal(v.seats[v.seat].name, 'Ana'); assert.equal(v.seats[v.seat].chips, S0.max);
  assert.deepEqual(lugares().map((x) => x.fichas), [S0.max]);
  assert.equal(caixa().s, S0.max, 'a compra conta como saída do bolso');
});

test('jogar mãos inteiras: as fichas mexem-se, a mão acaba e as contas ficam guardadas', async () => {
  let v = null, n = 0;
  for (let k = 0; k < 3; k++) { v = await jogarMao(A, n); n = v ? v.n : n; }
  assert.ok(v, 'continua sentada');
  const me = await A.me();
  assert.ok(me.pkn.h >= 2, 'mãos contadas: ' + me.pkn.h);
  const mine = (await A.pk()).mine, lg = lugares().find((x) => x.mesa === mine.id);
  assert.ok(lg, 'o lugar está gravado');
  assert.ok(mine.hist.length >= 1 && mine.hist[0].win.length >= 1);
  // ninguém vê as cartas dos outros a meio de uma mão
  if (mine.hand && !mine.hand.res) for (const s of mine.seats) if (s && !s.me && s.hole) assert.deepEqual(s.hole, [null, null]);
});

test('dois jogadores na mesma mesa: os da casa dão o lugar', async () => {
  const r = await B.ag({ type: 'pkSit', st: 0, buy: S0.min }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const a = (await A.pk()).mine, b = (await B.pk()).mine;
  assert.equal(a.id, b.id, 'a mesma mesa');
  for (let k = 0; k < 40; k++) { const m = (await B.pk()).mine; if (m.seats.filter((s) => s && s.bot).length === PK.minPlayers - 2) return; await espera(100); }
  assert.fail('um dos da casa devia ter saído');
});

test('sair: as fichas voltam ao bolso e o caixa fecha', async () => {
  const me0 = await A.me(), v = (await A.pk()).mine, chips = v.seats[v.seat].chips;
  const r = await A.ag({ type: 'pkLeave' }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.me.cash, me0.cash + chips);
  assert.equal(r.body.me.pk, null);
  assert.equal((await A.pk()).mine, null);
  assert.equal(lugares().filter((x) => x.conta !== undefined).length, 1, 'só a Bea continua');
  const cx = caixa(); assert.equal(cx.e, chips); assert.equal(cx.s, S0.max + S0.min);
  const r2 = await A.ag({ type: 'pkLeave' }); assert.equal(r2.body.error, 'PK_NOT_SEATED');
});

test('quem não joga sai sozinho ao fim de algumas vezes', async () => {
  // a Bea não faz nada: cada vez que é a vez dela, passa ou desiste; ao fim de idleOut, sai com as fichas
  const me0 = await B.me();
  for (let k = 0; k < 150; k++) { const st = await B.me(); if (!st.pk) break; await espera(150); }
  const me = await B.me();
  assert.equal(me.pk, null, 'saiu da mesa');
  const ev = (await B.events()).find((e) => e.k === 'pkOut');
  assert.ok(ev && ev.why === 'idle', JSON.stringify(ev));
  assert.equal(me.cash, me0.cash + ev.m);
  assert.equal(lugares().length, 0);
});

test('limite do dia: não se compram mais fichas do que dayBuy', async () => {
  await mexer({ Ana: (e) => { e.pkd = { d: e.pkd.d, n: PK.dayBuy - S0.min + 1 }; } });
  const r = await A.ag({ type: 'pkSit', st: 0, buy: S0.min }); assert.equal(r.body.error, 'PK_DAY');
});

test('o servidor reinicia a meio: as fichas da última mão fechada voltam ao bolso', async () => {
  await mexer({ Ana: (e) => { e.pkd = null; } });
  const c0 = (await A.me()).cash;
  let r = await A.ag({ type: 'pkSit', st: 0, buy: S0.max }); assert.equal(r.status, 200);
  await jogarMao(A);
  const lg = lugares()[0];
  assert.ok(lg && lg.fichas >= 0);
  await mexer();
  const me = await A.me();
  assert.equal(me.pk, null);
  assert.equal(me.cash, c0 - S0.max + lg.fichas, 'recebe o que tinha no fim da última mão');
  assert.equal(lugares().length, 0);
  const ev = (await A.events()).find((e) => e.k === 'pkBack');
  if (lg.fichas > 0) assert.equal(ev.m, lg.fichas);
});
