// Testes da API: arranca o servidor numa pasta temporária e joga por pedidos HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let dir, srv;

// sexta-feira mais recente às 21:00 de Lisboa já passada há mais de 1 h (para haver ataques)
function sextaRecente() {
  const d = new Date(Date.now() - 2 * 3600e3);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  if (Date.now() - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 21) < 2 * 3600e3) d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

async function arrancar() {
  srv = spawn(process.execPath, [join(AQUI, '..', 'server.mjs')], {
    env: { ...process.env, PORT: String(PORT), DATA: dir, COOKIE_INSEGURO: '1', PRIMEIRA_RONDA: sextaRecente() },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stderr.on('data', (d) => { const s = String(d); if (!s.includes('ExperimentalWarning') && !s.includes('trace-warnings')) process.stderr.write(s); });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + '/api/saude'); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('servidor não arrancou');
}
async function parar() { srv.kill(); await new Promise((r) => srv.once('exit', r)); }

function cliente(ipFalso) {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(BASE + path, {
      method, headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ipFalso },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json(), setCookie: sc };
  };
}

before(async () => { dir = mkdtempSync(join(tmpdir(), 'crime-')); await arrancar(); });
after(async () => { await parar(); rmSync(dir, { recursive: true, force: true }); });

test('contas: validação, nome único, palavra-passe e cookie seguro', async () => {
  const a = cliente('10.0.0.1');
  assert.equal((await a('POST', '/api/register', { name: 'ab', password: '12345678' })).body.error, 'BAD_NAME');
  assert.equal((await a('POST', '/api/register', { name: 'Ana_1', password: '123' })).body.error, 'BAD_PASSWORD');
  const r = await a('POST', '/api/register', { name: 'Ana_1', password: 'segredo123' });
  assert.equal(r.status, 200);
  assert.match(r.setCookie, /HttpOnly/); assert.match(r.setCookie, /SameSite=Lax/);
  assert.equal((await a('POST', '/api/register', { name: 'ana_1', password: 'segredo123' })).body.error, 'NAME_TAKEN');
  const b = cliente('10.0.0.2');
  assert.equal((await b('POST', '/api/login', { name: 'Ana_1', password: 'errada123' })).status, 401);
  assert.equal((await b('POST', '/api/login', { name: 'ana_1', password: 'segredo123' })).status, 200);
});

test('sem sessão não se joga', async () => {
  const x = cliente('10.0.0.3');
  assert.equal((await x('POST', '/api/act', { type: 'crime', k: 0 })).status, 401);
  const st = await x('GET', '/api/state');
  assert.equal(st.status, 200, 'o estado sem sessão responde, mas sem jogador');
  assert.equal(st.body.account, null);
  assert.equal(st.body.me, null);
  assert.equal((await x('GET', '/api/targets')).status, 401);
});

test('crime, toque repetido e erros de regra', async () => {
  const a = cliente('10.0.0.4');
  await a('POST', '/api/register', { name: 'Bruno', password: 'segredo123' });
  const s = await a('GET', '/api/state');
  assert.equal(s.body.round.phase, 'play');
  assert.equal(s.body.me.energy, 100);
  const r1 = await a('POST', '/api/act', { type: 'crime', k: 0, rid: 'x1' });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.me.energy, 95);
  const r2 = await a('POST', '/api/act', { type: 'crime', k: 0, rid: 'x1' }); // mesmo pedido outra vez
  assert.equal(r2.body.me.energy, 95);
  assert.equal((await a('POST', '/api/act', { type: 'voar' })).body.error, 'BAD_ACTION');
  assert.equal((await a('POST', '/api/act', { type: 'crime', k: 99 })).body.error, 'NO_CRIME');
  assert.equal((await a('POST', '/api/act', { type: 'deposit', amount: 1e15 })).body.error, 'BAD_AMOUNT');
  assert.equal((await a('POST', '/api/act', { type: 'train', stat: '__proto__' })).body.error, 'NO_STAT');
  // recarga e desintoxicação chegam ao motor
  assert.equal((await a('POST', '/api/act', { type: 'detox' })).body.error, 'NO_VICE');
  const st = (await a('GET', '/api/state')).body.me;
  assert.equal(st.refill.energy, 5, 'com 95 de energia cabe uma cerveja');
  const r3 = await a('POST', '/api/act', { type: 'refill', rid: 'rf1' });
  assert.equal(r3.status, 200, JSON.stringify(r3.body));
  assert.equal(r3.body.me.energy, 100);
  assert.ok(r3.body.me.addiction > 0);
  assert.equal(r3.body.me.refill, null);
  assert.equal((await a('POST', '/api/act', { type: 'refill', rid: 'rf2' })).body.error, 'ENERGY_FULL');
});

test('ataque entre duas contas: hospital, evento e ranking', async () => {
  const a = cliente('10.0.0.5'), b = cliente('10.0.0.6');
  await a('POST', '/api/register', { name: 'Carla', password: 'segredo123' });
  await b('POST', '/api/register', { name: 'Duarte', password: 'segredo123' });
  await b('GET', '/api/state');
  const t = await a('GET', '/api/targets');
  assert.ok(t.body.list.some((x) => x.name === 'Duarte'), JSON.stringify(t.body));
  const r = await a('POST', '/api/act', { type: 'attack', target: 'duarte', mode: 'beat' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.energy, 80);
  const perdeu = r.body.result.win ? 'Duarte' : 'Carla';
  const sb = await b('GET', '/api/state');
  if (perdeu === 'Duarte') assert.ok(sb.body.me.hospUntil > sb.body.now);
  const ev = await b('GET', '/api/events');
  assert.equal(ev.body.list[0].by, 'Carla');
  const rk = await a('GET', '/api/ranking');
  assert.ok(rk.body.total >= 2);
  assert.ok(!('id' in rk.body.top[0]));
  assert.equal((await a('POST', '/api/act', { type: 'attack', target: 'ninguem', mode: 'beat' })).body.error, 'NO_TARGET');
});

test('limite de registos por endereço', async () => {
  const x = cliente('10.0.0.7');
  let ultimo;
  for (let i = 0; i < 6; i++) ultimo = await x('POST', '/api/register', { name: 'Robo' + i, password: 'segredo123' });
  assert.equal(ultimo.status, 429);
});

test('o estado sobrevive a um reinício', async () => {
  const a = cliente('10.0.0.8');
  await a('POST', '/api/register', { name: 'Eva', password: 'segredo123' });
  await a('POST', '/api/act', { type: 'train', stat: 'F' });
  const antes = (await a('GET', '/api/state')).body.me;
  await parar(); await arrancar();
  const depois = (await a('GET', '/api/state')).body.me;
  assert.equal(depois.stats.F, antes.stats.F);
  assert.equal(depois.energy >= antes.energy, true);
});

test('logout acaba a sessão', async () => {
  const a = cliente('10.0.0.9');
  await a('POST', '/api/register', { name: 'Filipe', password: 'segredo123' });
  await a('POST', '/api/logout');
  assert.equal((await a('GET', '/api/state')).body.account, null);
  assert.equal((await a('POST', '/api/act', { type: 'crime', k: 0 })).status, 401);
});
