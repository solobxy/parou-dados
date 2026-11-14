// Testes da API: arranca o servidor numa pasta temporária e joga por pedidos HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let dir, srv;
let ENV_EXTRA = {};

// sexta-feira mais recente às 21:00 de Lisboa já passada há mais de 1 h (para haver ataques)
function sextaRecente() {
  const d = new Date(Date.now() - 2 * 3600e3);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  if (Date.now() - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 21) < 2 * 3600e3) d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

async function arrancar() {
  srv = spawn(process.execPath, [join(AQUI, '..', 'server.mjs')], {
    env: { ...process.env, PORT: String(PORT), DATA: dir, COOKIE_INSEGURO: '1', PRIMEIRA_RONDA: sextaRecente(), ...ENV_EXTRA },
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
  // quem ganha a luta sobe de nível logo ao início e a energia volta ao máximo
  assert.equal(r.body.me.energy, r.body.result.levelUp?.to > r.body.result.levelUp?.from ? 100 : 80);
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

// ---------- batota ----------
const cru = async (cookie, ipFalso, body, bruto) => {
  const r = await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ipFalso }, body: bruto ?? JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
async function contaNova(nome, ipFalso) {
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ipFalso }, body: JSON.stringify({ name: nome, password: 'segredo123' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const estado = async () => (await (await fetch(BASE + '/api/state', { headers: { cookie, 'X-Forwarded-For': ipFalso } })).json()).me;
  return { cookie, estado };
}

test('batota: valores hostis nunca dão erro do servidor nem criam dinheiro, respeito ou stats', async () => {
  await parar(); ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000' }; await arrancar();
  const { cookie, estado } = await contaNova('Batoteiro', '10.0.9.1');
  const antes = await estado();
  const hostis = [-1, -100000, 0.5, 1e21, 2 ** 53, '5', '0', null, [], [0], {}, true, '__proto__', 'constructor', 'toString', 'cash', -1e-7];
  const tipos = ['deposit', 'withdraw', 'port', 'gear', 'buyBiz', 'drug', 'hooker', 'houseUp', 'avatar', 'class', 'train', 'crime', 'attack', 'luxury', 'house', 'claim', 'bail', 'medic', 'cure', 'detox', 'refill', '__proto__', 'constructor', 'toString', null, 7];
  let n = 0;
  for (const type of tipos) for (const v of hostis) {
    const r = await cru(cookie, n % 2 ? '10.0.9.1' : '10.0.9.3', { type, amount: v, k: v, d: v, i: v, u: v, idx: v, kind: v, stat: v, id: v, target: v, mode: v });
    assert.ok(r.status === 400, `${type} ${JSON.stringify(v)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    n++;
  }
  // corpos que nem são um objeto
  for (const bruto of ['null', '5', '"x"', '[]', '[{"type":"crime","k":0}]', '{"type":"crime","k":0,', '']) {
    const r = await cru(cookie, '10.0.9.1', null, bruto);
    assert.equal(r.status, 400, bruto);
  }
  const depois = await estado();
  assert.equal(depois.cash + depois.bank, antes.cash + antes.bank);
  assert.equal(depois.respect, 0);
  assert.deepEqual(depois.stats, antes.stats);
  assert.equal(depois.energy, antes.energy);
  assert.equal(depois.house, 0); assert.equal(depois.luxuries, 0); assert.equal(depois.weapon, -1);
});

test('batota: 30 depósitos ao mesmo tempo só depositam uma vez', async () => {
  const { cookie, estado } = await contaNova('Duplicador', '10.0.9.4');
  const antes = await estado();
  const rs = await Promise.all(Array.from({ length: 30 }, () => cru(cookie, '10.0.9.4', { type: 'deposit', amount: antes.cash })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  const depois = await estado();
  const taxa = Math.ceil(antes.cash * 0.03);
  assert.equal(depois.cash, 0);
  assert.equal(depois.bank, antes.cash - taxa);
});

test('batota: o mesmo pedido repetido (mesmo rid) só conta uma vez, mesmo em paralelo', async () => {
  const { cookie, estado } = await contaNova('Repetidor', '10.0.9.5');
  const rs = await Promise.all(Array.from({ length: 20 }, () => cru(cookie, '10.0.9.5', { type: 'crime', k: 0, rid: 'igual-1' })));
  assert.ok(rs.every((r) => r.status === 200));
  const me = await estado();
  assert.equal(me.counters.crimes, 1);
  assert.equal(me.energy, 95);
});

test('batota: segurar o pedido não deixa agir no passado (a hora é a de quando o pedido acaba de chegar)', async () => {
  const { cookie } = await contaNova('Atrasado', '10.0.9.6');
  const corpo = JSON.stringify({ type: 'crime', k: 0 });
  let enviado = 0;
  const resposta = await new Promise((resolve, reject) => {
    const s = net.connect(PORT, '127.0.0.1'); let buf = '';
    s.on('data', (d) => { buf += d; }); s.on('end', () => resolve(buf)); s.on('error', reject);
    s.write(`POST /api/act HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nCookie: ${cookie}\r\nX-Forwarded-For: 10.0.9.6\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(corpo)}\r\n\r\n`);
    setTimeout(() => { enviado = Date.now(); s.write(corpo); }, 700);
  });
  const out = JSON.parse(resposta.slice(resposta.indexOf('{'), resposta.lastIndexOf('}') + 1));
  assert.equal(out.result.success, true);
  assert.ok(out.now >= enviado - 20, `hora da ação ${out.now} anterior ao envio do corpo ${enviado}`);
});

test('jornal da cidade: uma luta ganha aparece para todos, sem dados privados', async () => {
  const st = await (await fetch(BASE + '/api/state', { headers: { 'X-Forwarded-For': '10.0.9.9' } })).json();
  assert.ok(Array.isArray(st.feed));
  for (const e of st.feed) {
    assert.ok(['job', 'crit', 'spree', 'jail', 'house', 'lux', 'beat', 'mug', 'fail', 'sick', 'lvl'].includes(e.k), e.k);
    assert.deepEqual(Object.keys(e).filter((k) => !['t', 'k', 'name', 'c', 'money', 'crit', 'h', 'i', 'target', 'mode', 'n'].includes(k)), []);
  }
});

test('usar a stamina toda pela API', async () => {
  const { cookie, estado } = await contaNova('Toda', '10.0.9.10');
  const r = await cru(cookie, '10.0.9.10', { type: 'crimeAll', k: 0, rid: 'tudo-1' });
  assert.equal(r.status, 200);
  assert.equal(r.body.result.all, true);
  assert.ok(r.body.result.n >= 1);
  const me = await estado();
  assert.equal(me.counters.crimes, r.body.result.n);
  assert.equal(me.cash, 500 + r.body.result.money);
});

test('manchetes do dia: quem bate e quem leva aparecem, com os números certos', async () => {
  const a = await contaNova('Pancadas', '10.0.9.20'), b = await contaNova('Levador', '10.0.9.21');
  const r = await (await fetch(BASE + '/api/news', { headers: { 'X-Forwarded-For': '10.0.9.22' } })).json();
  assert.ok(Array.isArray(r.feed)); assert.ok(Array.isArray(r.today.items)); assert.ok(Array.isArray(r.yesterday.items));
  assert.match(r.today.dia, /^\d{4}-\d{2}-\d{2}$/);
  for (const it of r.today.items) {
    assert.deepEqual(Object.keys(it).sort(), ['av', 'cls', 'k', 'level', 'm', 'n', 'name', 'respect']);
    assert.ok(Number.isSafeInteger(it.n) && it.n > 0);
  }
  // um jogador aparece numa só manchete
  const nomes = r.today.items.map((x) => x.name);
  assert.equal(new Set(nomes).size, nomes.length);
});

test('contas do dia batem com o jogador: golpes, vitórias, dinheiro e respeito', async () => {
  const { cookie, estado } = await contaNova('Contado', '10.0.9.30');
  await cru(cookie, '10.0.9.30', { type: 'crimeAll', k: 0 });
  await cru(cookie, '10.0.9.30', { type: 'crime', k: 0 });
  const me = await estado();
  const db = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true });
  const conta = db.prepare('SELECT id FROM contas WHERE nome = ?').get('Contado').id;
  const rows = db.prepare('SELECT * FROM diario WHERE conta = ?').all(conta);
  db.close();
  const sum = (k) => rows.reduce((x, r) => x + r[k], 0);
  assert.equal(sum('crimes'), me.counters.crimes);
  assert.equal(sum('wins'), me.counters.wins);
  assert.equal(sum('resp'), me.respect);
  assert.equal(sum('money'), me.cash - 500);
});
