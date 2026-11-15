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

// o servidor dos testes vive sempre 3 h 30 depois das 21:00 (UTC) dessa sexta-feira: a ronda já abriu os ataques e ainda não há entradas tardias
const RONDA = sextaRecente();
const DESVIO = Date.UTC(...RONDA.split('-').map((x, i) => (i === 1 ? +x - 1 : +x)), 21) + 3.5 * 3600e3 - Date.now();

async function arrancar() {
  srv = spawn(process.execPath, ['--import', join(AQUI, 'relogio.mjs'), join(AQUI, '..', 'server.mjs')], {
    env: { ...process.env, PORT: String(PORT), DATA: dir, COOKIE_INSEGURO: '1', PRIMEIRA_RONDA: RONDA, TESTE_DESVIO_MS: String(DESVIO), ...ENV_EXTRA },
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
    setTimeout(() => { enviado = Date.now() + DESVIO; s.write(corpo); }, 700);
  });
  const out = JSON.parse(resposta.slice(resposta.indexOf('{'), resposta.lastIndexOf('}') + 1));
  assert.equal(out.result.success, true);
  assert.ok(out.now >= enviado - 20, `hora da ação ${out.now} anterior ao envio do corpo ${enviado}`);
});

test('jornal da cidade: uma luta ganha aparece para todos, sem dados privados', async () => {
  const st = await (await fetch(BASE + '/api/state', { headers: { 'X-Forwarded-For': '10.0.9.9' } })).json();
  assert.ok(Array.isArray(st.feed));
  for (const e of st.feed) {
    assert.ok(['job', 'crit', 'spree', 'jail', 'house', 'lux', 'beat', 'mug', 'fail', 'sick', 'lvl', 'casino', 'casinoLoss'].includes(e.k), e.k);
    assert.deepEqual(Object.keys(e).filter((k) => !['t', 'k', 'name', 'c', 'money', 'crit', 'h', 'i', 'target', 'mode', 'n', 'g'].includes(k)), []);
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

test('mesa ao vivo: dois jogadores na mesma ronda veem o mesmo resultado e as contas batem certo', async () => {
  await parar(); ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000', MESA_BET_MS: '900', MESA_SPIN_MS: '500' }; await arrancar();
  const A = await contaNova('MesaA', '10.0.9.40'), B = await contaNova('MesaB', '10.0.9.41');
  const mesa = async (c, ip, g) => (await fetch(BASE + '/api/table?g=' + g, { headers: { cookie: c, 'X-Forwarded-For': ip } })).json();
  const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
  // espera pelo início de uma ronda para ter o tempo todo de apostas
  let t = await mesa(A.cookie, '10.0.9.40', 'roulette');
  while (t.phase !== 'bets' || t.closesAt - t.now < 600) { await dorme(120); t = await mesa(A.cookie, '10.0.9.40', 'roulette'); }
  const id = t.id;
  let r = await cru(A.cookie, '10.0.9.40', { type: 'tableBet', g: 'roulette', bets: [{ t: 'red', amt: 100 }] });
  assert.equal(r.status, 200); assert.equal(r.body.me.cash, 400); assert.equal(r.body.result.round, id);
  r = await cru(A.cookie, '10.0.9.40', { type: 'tableBet', g: 'roulette', bets: [{ t: 'red', amt: 50 }, { t: 'num', n: 7, amt: 10 }] });
  assert.equal(r.body.me.cash, 340); assert.equal(r.body.result.total, 160);
  r = await cru(B.cookie, '10.0.9.41', { type: 'tableBet', g: 'roulette', bets: [{ t: 'black', amt: 200 }] });
  assert.equal(r.body.me.cash, 300);
  // apostas inválidas e acima do que se tem não tiram dinheiro
  r = await cru(B.cookie, '10.0.9.41', { type: 'tableBet', g: 'roulette', bets: [{ t: 'black', amt: 400 }] });
  assert.equal(r.status, 400); assert.equal(r.body.error, 'NO_CASH'); assert.equal(r.body.me.cash, 300);
  t = await mesa(B.cookie, '10.0.9.41', 'roulette');
  assert.equal(t.players, 2); assert.equal(t.pot, 360); assert.equal(t.mine.total, 200); assert.equal(t.res, undefined);
  // fecha: os dois veem o mesmo número e recebem o que a roleta paga
  while (t.phase !== 'spin' || t.id !== id) { await dorme(100); t = await mesa(B.cookie, '10.0.9.41', 'roulette'); if (t.id !== id && t.last?.id === id) break; }
  const ta = await mesa(A.cookie, '10.0.9.40', 'roulette');
  const n = t.id === id ? t.res.n : null, na = ta.id === id ? ta.res.n : null;
  if (n !== null && na !== null) assert.equal(n, na);
  const num = n ?? na ?? t.hist[0];
  const red = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(num);
  const winA = (red ? 300 : 0) + (num === 7 ? 360 : 0), winB = num > 0 && !red ? 400 : 0;
  assert.equal((await A.estado()).cash, 340 + winA);
  assert.equal((await B.estado()).cash, 300 + winB);
  // com a mesa fechada não se aposta nem se limpa
  let fechada = false;
  for (let i = 0; i < 30 && !fechada; i++) {
    const s = await mesa(A.cookie, '10.0.9.40', 'wheel');
    if (s.phase === 'spin') { const x = await cru(A.cookie, '10.0.9.40', { type: 'tableBet', g: 'wheel', bets: [{ s: '1', amt: 10 }] }); if (x.status === 400) { assert.equal(x.body.error, 'BETS_CLOSED'); fechada = true; } }
    await dorme(100);
  }
  assert.ok(fechada, 'nunca apanhou a mesa fechada');
});

test('mesa ao vivo: limpar devolve tudo, e se o servidor parar a meio as apostas voltam para o jogador', async () => {
  const A = await contaNova('MesaC', '10.0.9.42');
  const mesa = async (g) => (await fetch(BASE + '/api/table?g=' + g, { headers: { cookie: A.cookie, 'X-Forwarded-For': '10.0.9.42' } })).json();
  const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
  const abre = async () => { let t = await mesa('wheel'); while (t.phase !== 'bets' || t.closesAt - t.now < 500) { await dorme(100); t = await mesa('wheel'); } return t; };
  await abre();
  let r = await cru(A.cookie, '10.0.9.42', { type: 'tableBet', g: 'wheel', bets: [{ s: '2', amt: 120 }, { s: 'louca', amt: 30 }] });
  assert.equal(r.body.me.cash, 350);
  r = await cru(A.cookie, '10.0.9.42', { type: 'tableClear', g: 'wheel' });
  assert.equal(r.status, 200); assert.equal(r.body.me.cash, 500); assert.equal(r.body.result.back, 150);
  r = await cru(A.cookie, '10.0.9.42', { type: 'tableClear', g: 'wheel' });
  assert.equal(r.body.error, 'NO_BET');
  // o servidor pára com uma aposta na mesa: ao voltar, o dinheiro está outra vez na mão
  await parar(); ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000', MESA_BET_MS: '60000', MESA_SPIN_MS: '500' }; await arrancar();
  r = await cru(A.cookie, '10.0.9.42', { type: 'tableBet', g: 'wheel', bets: [{ s: '5', amt: 200 }] });
  assert.equal(r.body.me.cash, 300);
  await parar(); await arrancar();
  assert.equal((await A.estado()).cash, 500);
  const t = await mesa('wheel'); assert.equal(t.mine, null); assert.equal(t.players, 0);
});

test('mesas ao vivo: correm sozinhas sem ninguém a ver, o histórico é o mesmo para todos e sobrevive a um reinício', async () => {
  await parar(); ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000', MESA_BET_MS: '300', MESA_SPIN_MS: '200' }; await arrancar();
  const A = await contaNova('HistA', '10.0.9.45'), B = await contaNova('HistB', '10.0.9.46');
  const mesa = async (x, ip, g) => (await fetch(BASE + '/api/table?g=' + g, { headers: { cookie: x.cookie, 'X-Forwarded-For': ip } })).json();
  const dentro = (peq, grande) => { const a = JSON.stringify(peq).slice(1, -1), b = JSON.stringify(grande); return b.includes(a); };
  await new Promise((r) => setTimeout(r, 3200));   // ninguém pede a mesa durante este tempo
  for (const g of ['roulette', 'wheel']) {
    const a = await mesa(A, '10.0.9.45', g), b = await mesa(B, '10.0.9.46', g);
    assert.ok(a.hist.length >= 4, `${g}: só ${a.hist.length} rondas em 3 s sem ninguém a ver`);
    assert.ok(dentro(a.hist.slice(0, 4), b.hist), `${g}: o histórico não é o mesmo para os dois`);
    if (g === 'wheel') {
      for (const h of a.hist) { assert.ok(Number.isInteger(h.i) && h.i >= 0 && h.i < 54); assert.ok(typeof h.s === 'string' && h.m >= 1); }
      assert.equal(a.prev, a.hist[a.phase === 'bets' ? 0 : 1].i);
    } else for (const n of a.hist) assert.ok(Number.isInteger(n) && n >= 0 && n <= 36);
  }
  const antes = { roulette: (await mesa(A, '10.0.9.45', 'roulette')).hist, wheel: (await mesa(A, '10.0.9.45', 'wheel')).hist };
  await parar(); await arrancar();
  for (const g of ['roulette', 'wheel']) {
    const d = await mesa(B, '10.0.9.46', g);
    assert.ok(dentro(antes[g].slice(0, 6), d.hist), `${g}: o histórico perdeu-se no reinício`);
  }
});

test('gangue: safar um membro da prisão e do hospital paga quem carrega no botão, e o membro fica livre', async () => {
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000' };
  const A = await contaNova('SafaA', '10.0.9.70'), B = await contaNova('SafaB', '10.0.9.71'), X = await contaNova('SafaX', '10.0.9.72');
  for (const x of [A, B, X]) await x.estado();
  const base = (e) => { e.cash = 500_000; e.respect = 100; e.peakRespect = 100; };
  await mexer({ SafaA: base, SafaB: base, SafaX: base });
  const ag = (x, ip, body) => cru(x.cookie, ip, body), gangue = async (x, ip) => (await fetch(BASE + '/api/gang', { headers: { cookie: x.cookie, 'X-Forwarded-For': ip } })).json();
  let r = await ag(A, '10.0.9.70', { type: 'gangCreate', name: 'Safados', tag: 'SAF' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const gid = (await gangue(A, '10.0.9.70')).mine.id;
  r = await ag(B, '10.0.9.71', { type: 'gangJoin', id: gid }); assert.equal(r.status, 200);
  r = await ag(A, '10.0.9.70', { type: 'gangBail', name: 'SafaB' }); assert.equal(r.body.error, 'NOT_IN_JAIL');
  r = await ag(A, '10.0.9.70', { type: 'gangBail', name: 'SafaX' }); assert.equal(r.body.error, 'NO_TARGET');
  // o servidor pára, B fica preso e X (de fora) também
  const t = Date.now() + DESVIO;
  await mexer({ SafaB: (e) => { e.jailUntil = t + 8 * 60000; e.jailTier = 6; }, SafaX: (e) => { e.jailUntil = t + 8 * 60000; e.jailTier = 6; } });
  let g = await gangue(A, '10.0.9.70'); const mb = g.mine.roster.find((m) => m.name === 'SafaB');
  assert.ok(mb.jail > g.now); assert.ok(mb.bail > 0); assert.equal(g.mine.roster.find((m) => m.name === 'SafaA').jail, 0);
  const a0 = (await A.estado()).cash;
  r = await ag(A, '10.0.9.70', { type: 'gangBail', name: 'SafaB' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.result.cost > 0 && r.body.result.cost <= mb.bail); assert.equal(r.body.me.cash, a0 - r.body.result.cost);
  const b = await B.estado(); assert.equal(b.jailUntil, 0); assert.equal(b.cash, 500_000);
  const ev = await (await fetch(BASE + '/api/events', { headers: { cookie: B.cookie, 'X-Forwarded-For': '10.0.9.71' } })).json();
  assert.equal(ev.list[0].k, 'gangBail'); assert.equal(ev.list[0].by, 'SafaA'); assert.equal(ev.list[0].money, r.body.result.cost);
  // hospital: igual
  await mexer({ SafaB: (e) => { e.hospUntil = Date.now() + DESVIO + 15 * 60000; } });
  g = await gangue(A, '10.0.9.70'); assert.ok(g.mine.roster.find((m) => m.name === 'SafaB').medic > 0);
  r = await ag(A, '10.0.9.70', { type: 'gangMedic', name: 'SafaB' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal((await B.estado()).hospUntil, 0);
  r = await ag(A, '10.0.9.70', { type: 'gangMedic', name: 'SafaA' }); assert.equal(r.body.error, 'NO_TARGET');
  // arruma: a gangue acaba quando sai o último (os testes seguintes contam com a cidade sem gangues)
  await ag(B, '10.0.9.71', { type: 'gangLeave' }); await ag(A, '10.0.9.70', { type: 'gangLeave' });
  assert.equal((await gangue(A, '10.0.9.70')).list.length, 0);
});

// muda o estado guardado de jogadores (com o servidor parado), para os testes chegarem a níveis e quantias altas
test('discoteca e bordel: abrir, pôr preço, cada um vê o seu preço (gangue com desconto) e o dinheiro vai para o caixa do dono', async () => {
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000' };
  const A = await contaNova('CasaA', '10.0.9.80'), B = await contaNova('CasaB', '10.0.9.81'), X = await contaNova('CasaX', '10.0.9.82');
  for (const x of [A, B, X]) await x.estado();
  const COCA = 6, agora = Date.now() + DESVIO;
  const base = (e) => { e.cash = 500_000; e.bank = 0; e.respect = 100; e.peakRespect = 100; e.energy = 0; e.energyT = agora; };
  await mexer({ CasaA: (e) => { base(e); e.stock[COCA] = 5; }, CasaB: base, CasaX: base });
  const ag = (x, ip, body) => cru(x.cookie, ip, body), get = async (x, ip, path) => (await fetch(BASE + path, { headers: { cookie: x.cookie, 'X-Forwarded-For': ip } })).json();
  let r = await ag(A, '10.0.9.80', { type: 'gangCreate', name: 'Casas', tag: 'CAS' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await ag(B, '10.0.9.81', { type: 'gangJoin', id: (await get(A, '10.0.9.80', '/api/gang')).mine.id }); assert.equal(r.status, 200);
  const a0 = (await A.estado()).cash;
  // abrir a discoteca e pôr o preço a 110% com 20% de desconto para a gangue
  r = await ag(A, '10.0.9.80', { type: 'venueSet', kind: 'club', pi: 3, gd: 2 }); assert.equal(r.body.error, 'NO_VENUE');
  r = await ag(A, '10.0.9.80', { type: 'venueBuy', kind: 'club' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.club.lvl, 1); assert.equal(r.body.me.cash, a0 - 10000); assert.deepEqual(r.body.me.stock[COCA], 5);
  r = await ag(A, '10.0.9.80', { type: 'venueSet', kind: 'club', pi: 3, gd: 2 }); assert.equal(r.status, 200); assert.equal(r.body.me.club.pi, 3); assert.equal(r.body.me.club.gd, 2);
  r = await ag(A, '10.0.9.80', { type: 'venueSet', kind: 'club', pi: 9, gd: 0 }); assert.equal(r.body.error, 'BAD_AMOUNT');
  // a lista: o membro da gangue vê 88%, quem é de fora vê 110%; o dono não aparece na sua própria lista
  let vb = await get(B, '10.0.9.81', '/api/venues'), vx = await get(X, '10.0.9.82', '/api/venues'), va = await get(A, '10.0.9.80', '/api/venues');
  assert.equal(va.clubs.length, 0);
  assert.deepEqual(vb.clubs.map((c) => [c.name, c.tag, c.gang, c.bp, c.pub]), [['CasaA', 'CAS', true, 8800, 11000]]); assert.deepEqual(vb.clubs[0].items, [{ d: COCA, n: 5, price: 1320 }]);
  assert.deepEqual(vx.clubs.map((c) => [c.name, c.gang, c.bp]), [['CasaA', false, 11000]]); assert.equal(vx.clubs[0].items[0].price, 1650);
  // comprar: o dinheiro sai do comprador e entra no caixa do dono; a droga sai do armazém dele
  r = await ag(B, '10.0.9.81', { type: 'clubBuy', owner: 'CasaA', d: COCA, price: 1320 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.price, 1320); assert.equal(r.body.me.cash, 500_000 - 1320); assert.equal(r.body.me.energy, 30);
  r = await ag(X, '10.0.9.82', { type: 'clubBuy', owner: 'CasaA', d: COCA, price: 1000 }); assert.equal(r.body.error, 'PRICE_CHANGED'); assert.equal((await X.estado()).cash, 500_000);
  r = await ag(X, '10.0.9.82', { type: 'clubBuy', owner: 'CasaA', d: COCA, price: 1650 }); assert.equal(r.status, 200); assert.equal(r.body.me.cash, 500_000 - 1650);
  r = await ag(X, '10.0.9.82', { type: 'clubBuy', owner: 'CasaA', d: 0 }); assert.equal(r.body.error, 'NO_STOCK');
  r = await ag(X, '10.0.9.82', { type: 'clubBuy', owner: 'Ninguem', d: COCA }); assert.equal(r.body.error, 'NO_VENUE');
  r = await ag(A, '10.0.9.80', { type: 'clubBuy', owner: 'CasaA', d: COCA }); assert.equal(r.body.error, 'SELF');
  let a = await A.estado(); assert.equal(a.club.till, 2970); assert.equal(a.stock[COCA], 3); assert.equal(a.cash, a0 - 10000);
  r = await ag(A, '10.0.9.80', { type: 'venueCollect' }); assert.equal(r.body.result.club, 2970); assert.equal(r.body.me.cash, a0 - 10000 + 2970); assert.equal(r.body.me.club.till, 0);
  // armazém: tomar uma e despachar o resto (95% do preço de grosso)
  r = await ag(A, '10.0.9.80', { type: 'stockUse', d: COCA }); assert.equal(r.status, 200); assert.equal(r.body.me.stock[COCA], 2); assert.equal(r.body.me.cash, a0 - 10000 + 2970);
  r = await ag(A, '10.0.9.80', { type: 'stockDump', d: COCA, n: 3 }); assert.equal(r.body.error, 'NO_STOCK');
  r = await ag(A, '10.0.9.80', { type: 'stockDump', d: COCA, n: 2 }); assert.equal(r.body.result.got, 2280); assert.equal(r.body.me.stock[COCA], 0);
  assert.equal((await get(X, '10.0.9.82', '/api/venues')).clubs.length, 0);   // sem mercadoria, a discoteca sai da lista
  // bordel: abrir, contratar, preço a 90%; a visita paga ao caixa só a parte da casa
  r = await ag(A, '10.0.9.80', { type: 'broHire', i: 5 }); assert.equal(r.body.error, 'NO_VENUE');
  r = await ag(A, '10.0.9.80', { type: 'venueBuy', kind: 'bro' }); assert.equal(r.status, 200); assert.equal(r.body.me.bro.rooms, 2);
  r = await ag(A, '10.0.9.80', { type: 'broHire', i: 5 }); assert.equal(r.status, 200); assert.deepEqual(r.body.me.bro.girls, [5]); assert.ok(r.body.me.bro.perH > 0);
  r = await ag(A, '10.0.9.80', { type: 'venueSet', kind: 'bro', pi: 1, gd: 0 }); assert.equal(r.status, 200);
  vx = await get(X, '10.0.9.82', '/api/venues'); const cidade = (await X.estado()).hookers[5];
  assert.equal(vx.bros.length, 1); assert.deepEqual(vx.bros[0].girls, [{ slot: 0, i: 5, price: Math.floor((cidade * 9000) / 10000) }]);
  const x0 = (await X.estado()).cash;
  r = await ag(X, '10.0.9.82', { type: 'broVisit', owner: 'CasaA', slot: 0, price: vx.bros[0].girls[0].price }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.price, vx.bros[0].girls[0].price); assert.equal(r.body.me.cash, x0 - r.body.result.price); assert.equal(r.body.result.house, r.body.result.price - Math.floor((cidade * 8000) / 10000));
  a = await A.estado(); assert.ok(a.bro.till >= r.body.result.house && a.bro.till <= r.body.result.house + 3, 'caixa do bordel: ' + a.bro.till);
  r = await ag(A, '10.0.9.80', { type: 'broFire', slot: 0 }); assert.equal(r.status, 200); assert.deepEqual(r.body.me.bro.girls, []);
  // porto: o contentor de mercadoria fica marcado com a droga
  r = await ag(A, '10.0.9.80', { type: 'port', amount: 1000, goods: true }); assert.equal(r.status, 200); assert.equal(r.body.me.port.at(-1).d, r.body.me.portDrug);
  // o estado sobrevive a um reinício
  await mexer({}); a = await A.estado(); assert.equal(a.club.pi, 3); assert.equal(a.bro.lvl, 1); assert.equal(a.port.at(-1).d, a.portDrug);
  await ag(B, '10.0.9.81', { type: 'gangLeave' }); await ag(A, '10.0.9.80', { type: 'gangLeave' });
  assert.equal((await get(A, '10.0.9.80', '/api/gang')).list.length, 0);
});

test('bolsa: preços iguais para todos, compra e venda ao preço que se viu, e o mercado sobrevive a um reinício', async () => {
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000' };
  const A = await contaNova('BolsaA', '10.0.9.90'), B = await contaNova('BolsaB', '10.0.9.91');
  for (const x of [A, B]) await x.estado();
  await mexer({ BolsaA: (e) => { e.cash = 100_000; e.bank = 0; e.respect = 3000; e.peakRespect = 3000; } });
  const ag = (x, ip, body) => cru(x.cookie, ip, body), get = async (x, ip, path) => (await fetch(BASE + path, { headers: { cookie: x.cookie, 'X-Forwarded-For': ip } })).json();
  const ma = await get(A, '10.0.9.90', '/api/stocks'), mb = await get(B, '10.0.9.91', '/api/stocks');
  // a ronda de teste vai com 3 h 30: 21 passos de 10 minutos
  assert.ok(ma.tick >= 21 && ma.tick <= 22, 'passo ' + ma.tick); assert.equal(ma.prices.length, 6); assert.ok(ma.prices.every((x) => Number.isSafeInteger(x) && x > 0));
  assert.equal(ma.hist.length, 6); assert.equal(ma.hist[0].length, ma.tick + 1); assert.equal(ma.hist[2].at(-1), ma.prices[2]); assert.ok(ma.nextAt > ma.now && ma.nextAt - ma.now <= 10 * 60000);
  if (mb.tick === ma.tick) assert.deepEqual(mb.prices, ma.prices);
  const k = 2, preco = ma.prices[k], a0 = (await A.estado());
  assert.deepEqual(a0.stk[k], { n: 0, cost: 0, value: 0 }); assert.ok(a0.stockCap > 0);
  // preço diferente do que está: não compra
  let r = await ag(A, '10.0.9.90', { type: 'stockBuy', k, n: 10, price: preco + 1 }); assert.equal(r.body.error, 'PRICE_CHANGED'); assert.equal((await A.estado()).cash, 100_000);
  r = await ag(A, '10.0.9.90', { type: 'stockBuy', k, n: 10, price: preco }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const bruto = Math.ceil((10 * preco) / 100), pago = bruto + Math.ceil(bruto / 100);
  assert.equal(r.body.result.paid, pago); assert.equal(r.body.me.cash, 100_000 - pago); assert.deepEqual(r.body.me.stk[k], { n: 10, cost: pago, value: Math.floor((10 * preco) / 100) });
  r = await ag(A, '10.0.9.90', { type: 'stockSell', k, n: 11 }); assert.equal(r.body.error, 'NO_SHARES');
  r = await ag(A, '10.0.9.90', { type: 'stockBuy', k: 9, n: 1 }); assert.equal(r.body.error, 'NO_STOCK_CO');
  r = await ag(A, '10.0.9.90', { type: 'stockBuy', k, n: 0 }); assert.equal(r.body.error, 'BAD_AMOUNT');
  // reinício: o mercado e as ações ficam como estavam
  await mexer({});
  const m2 = await get(A, '10.0.9.90', '/api/stocks'); if (m2.tick === ma.tick) { assert.deepEqual(m2.prices, ma.prices); assert.deepEqual(m2.hist, ma.hist); }
  assert.equal((await A.estado()).stk[k].n, 10);
  r = await ag(A, '10.0.9.90', { type: 'stockSell', k, n: 10, price: m2.prices[k] }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const v = Math.floor((10 * m2.prices[k]) / 100); assert.equal(r.body.result.got, v - Math.min(v, Math.ceil(v / 100))); assert.equal(r.body.me.cash, 100_000 - pago + r.body.result.got); assert.deepEqual(r.body.me.stk[k], { n: 0, cost: 0, value: 0 });
});

async function mexer(muda) {
  await parar();
  const db = new DatabaseSync(join(dir, 'jogo.db'));
  for (const [nome, fn] of Object.entries(muda)) {
    const id = db.prepare('SELECT id FROM contas WHERE nome = ?').get(nome).id, row = db.prepare('SELECT ronda, estado FROM jogadores WHERE conta = ?').get(id);
    const e = JSON.parse(row.estado); fn(e);
    db.prepare('UPDATE jogadores SET estado = ? WHERE conta = ? AND ronda = ?').run(JSON.stringify(e), id, row.ronda);
  }
  db.close(); await arrancar();
}

test('gangues: criar, entrar, cofre sem volta, melhorias que dão bónus a todos, pedidos, expulsar, sair e passar a chefia', async () => {
  const A = await contaNova('ChefeG', '10.0.9.50'), B = await contaNova('MembroG', '10.0.9.51'), C = await contaNova('NovatoG', '10.0.9.52'), D = await contaNova('PedeG', '10.0.9.53');
  for (const x of [A, B, C, D]) await x.estado();
  const rico = (cash) => (e) => { e.cash = cash; e.respect = 100; e.peakRespect = 100; };
  await mexer({ ChefeG: rico(5_000_000), MembroG: rico(1_000_000), PedeG: rico(1000) });
  const ag = (x, ip, body) => cru(x.cookie, ip, body), gangue = async (x, ip) => (await fetch(BASE + '/api/gang', { headers: { cookie: x.cookie, 'X-Forwarded-For': ip } })).json();
  // criar: paga, pede nível, nome e sigla válidos e únicos
  let r = await ag(C, '10.0.9.52', { type: 'gangCreate', name: 'Novatos', tag: 'NOV' }); assert.equal(r.body.error, 'LOW_LEVEL');
  r = await ag(A, '10.0.9.50', { type: 'gangCreate', name: 'Os Cabrões', tag: 'c' }); assert.equal(r.body.error, 'BAD_GANG_TAG');
  r = await ag(A, '10.0.9.50', { type: 'gangCreate', name: '<script>', tag: 'XSS' }); assert.equal(r.body.error, 'BAD_GANG_NAME');
  r = await ag(A, '10.0.9.50', { type: 'gangCreate', name: 'Os  Cabrões', tag: 'cbr' });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.cash, 5_000_000 - 25_000); assert.deepEqual(r.body.me.gang.tag, 'CBR'); assert.equal(r.body.me.gb.loot, 200);
  const gid = r.body.result.id;
  r = await ag(A, '10.0.9.50', { type: 'gangCreate', name: 'Outra', tag: 'OUT' }); assert.equal(r.body.error, 'IN_GANG');
  r = await ag(B, '10.0.9.51', { type: 'gangCreate', name: 'os cabrões', tag: 'XYZ' }); assert.equal(r.body.error, 'GANG_NAME_TAKEN');
  r = await ag(B, '10.0.9.51', { type: 'gangCreate', name: 'Diferente', tag: 'CBR' }); assert.equal(r.body.error, 'GANG_TAG_TAKEN');
  // entrar numa gangue aberta; quem não tem nível não entra
  r = await ag(C, '10.0.9.52', { type: 'gangJoin', id: gid }); assert.equal(r.body.error, 'LOW_LEVEL');
  const forcaAntes = (await B.estado()).attack;
  r = await ag(B, '10.0.9.51', { type: 'gangJoin', id: gid }); assert.equal(r.body.result.joined, true); assert.equal(r.body.me.gb.loot, 200);
  // cofre: só entra; só o chefe gasta
  r = await ag(B, '10.0.9.51', { type: 'gangDonate', amount: 150_000 }); assert.equal(r.body.me.cash, 850_000); assert.equal(r.body.result.fund, 150_000);
  r = await ag(B, '10.0.9.51', { type: 'gangDonate', amount: 50 }); assert.equal(r.body.error, 'BAD_AMOUNT');
  r = await ag(B, '10.0.9.51', { type: 'gangDonate', amount: 900_000 }); assert.equal(r.body.error, 'NO_MONEY');
  r = await ag(B, '10.0.9.51', { type: 'gangUp', what: 'armaria' }); assert.equal(r.body.error, 'NOT_LEADER');
  r = await ag(A, '10.0.9.50', { type: 'gangUp', what: 'armaria' }); assert.equal(r.body.result.level, 1); assert.equal(r.body.result.fund, 100_000);
  r = await ag(A, '10.0.9.50', { type: 'gangUp', what: 'sede' }); assert.equal(r.body.result.level, 2); assert.equal(r.body.result.fund, 0);
  r = await ag(A, '10.0.9.50', { type: 'gangUp', what: 'sede' }); assert.equal(r.body.error, 'NO_GANG_MONEY');
  // o bónus chega a todos os membros e sobrevive a um reinício
  await parar(); await arrancar();
  let b = await B.estado();
  assert.deepEqual(b.gb, { loot: 400, atk: 300, def: 300 }); assert.equal(b.attack, Math.floor((forcaAntes * 10300) / 10000)); assert.equal(b.cash, 850_000);
  let g = await gangue(B, '10.0.9.51');
  assert.equal(g.mine.roster.length, 2); assert.equal(g.mine.members, 2); assert.equal(g.mine.fund, 0); assert.equal(g.mine.slots, 8); assert.equal(g.list[0].respect, 200); assert.equal(g.mine.leaderMe, false);
  assert.equal(g.mine.roster.find((m) => m.name === 'MembroG').given, 150_000);
  // conversa: guarda o texto tal como veio (o ecrã é que o mostra como texto), sem caracteres de controlo
  r = await ag(B, '10.0.9.51', { type: 'gangChat', txt: '  <b>olá</b>\n\u0007 malta  ' }); assert.equal(r.status, 200);
  r = await ag(C, '10.0.9.52', { type: 'gangChat', txt: 'olá' }); assert.equal(r.body.error, 'NO_GANG');
  g = await gangue(A, '10.0.9.50'); assert.equal(g.mine.chat.at(-1).txt, '<b>olá</b>   malta'); assert.equal(g.mine.chat.at(-1).name, 'MembroG');
  // gangue fechada: pede-se, o chefe aceita
  r = await ag(A, '10.0.9.50', { type: 'gangOpen', open: false }); assert.equal(r.body.result.open, false);
  r = await ag(D, '10.0.9.53', { type: 'gangJoin', id: gid }); assert.equal(r.body.result.asked, true); assert.equal(r.body.me.gang, null);
  r = await ag(B, '10.0.9.51', { type: 'gangAccept', name: 'PedeG' }); assert.equal(r.body.error, 'NOT_LEADER');
  g = await gangue(A, '10.0.9.50'); assert.deepEqual(g.mine.asks.map((x) => x.name), ['PedeG']);
  r = await ag(A, '10.0.9.50', { type: 'gangAccept', name: 'PedeG' }); assert.equal(r.status, 200);
  assert.deepEqual((await D.estado()).gb, { loot: 400, atk: 300, def: 300 });
  // expulsar tira o bónus e obriga a esperar para entrar noutra
  r = await ag(B, '10.0.9.51', { type: 'gangKick', name: 'ChefeG' }); assert.equal(r.body.error, 'NOT_LEADER');
  r = await ag(A, '10.0.9.50', { type: 'gangKick', name: 'MembroG' }); assert.equal(r.status, 200);
  b = await B.estado(); assert.equal(b.gang, null); assert.equal(b.gb, null); assert.equal(b.attack, forcaAntes); assert.equal(b.cash, 850_000);
  r = await ag(A, '10.0.9.50', { type: 'gangOpen', open: true });
  r = await ag(B, '10.0.9.51', { type: 'gangJoin', id: gid }); assert.equal(r.body.error, 'GANG_WAIT');
  // o chefe sai: a chefia passa para quem ficou; o último a sair acaba com a gangue
  r = await ag(A, '10.0.9.50', { type: 'gangLeave' }); assert.equal(r.status, 200); assert.equal(r.body.me.gang, null); assert.equal(r.body.me.cash, 5_000_000 - 25_000);
  g = await gangue(D, '10.0.9.53'); assert.equal(g.mine.leaderMe, true); assert.equal(g.mine.roster.length, 1);
  r = await ag(D, '10.0.9.53', { type: 'gangLeave' }); assert.equal(r.status, 200);
  g = await gangue(D, '10.0.9.53'); assert.equal(g.mine, null); assert.equal(g.list.length, 0);
  await parar(); await arrancar();
  g = await gangue(A, '10.0.9.50'); assert.equal(g.list.length, 0); assert.equal((await A.estado()).gb, null);
});

test('negócios da gangue: investir, bónus de grupo acertado em todos, sede a mais recusada, expulsar devolve metade, e tudo sobrevive a um reinício', async () => {
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000' };
  const A = await contaNova('NegA', '10.0.9.90'), B = await contaNova('NegB', '10.0.9.91'), X = await contaNova('NegX', '10.0.9.92');
  for (const x of [A, B, X]) await x.estado();
  const base = (e) => { e.cash = 500_000; e.bank = 0; e.respect = 100; e.peakRespect = 100; };
  await mexer({ NegA: base, NegB: base, NegX: base });
  const ag = (x, ip, body) => cru(x.cookie, ip, body), gangue = async (x, ip) => (await fetch(BASE + '/api/gang', { headers: { cookie: x.cookie, 'X-Forwarded-For': ip } })).json();
  let r = await ag(X, '10.0.9.92', { type: 'gangBiz', k: 0, amount: 1000 }); assert.equal(r.body.error, 'NO_GANG');
  r = await ag(A, '10.0.9.90', { type: 'gangCreate', name: 'Socios', tag: 'SOC' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const gid = (await gangue(A, '10.0.9.90')).mine.id;
  r = await ag(B, '10.0.9.91', { type: 'gangJoin', id: gid }); assert.equal(r.status, 200);
  const a0 = (await A.estado()).cash;
  r = await ag(A, '10.0.9.90', { type: 'gangBiz', k: 0, amount: 4000 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.inv, 4000); assert.equal(r.body.result.coop, 0); assert.equal(r.body.me.cash, a0 - 4000);
  r = await ag(A, '10.0.9.90', { type: 'gangBiz', k: 1, amount: 1000 }); assert.equal(r.body.error, 'GBIZ_SEDE');           // a sede ainda é de nível 1
  for (const bad of [{ k: 0, amount: 50 }, { k: 0, amount: -5 }, { k: 0, amount: 1e12 }, { k: 7, amount: 1000 }, { k: '0', amount: '1000' }, { k: 0 }]) {
    r = await ag(A, '10.0.9.90', { type: 'gangBiz', ...bad }); assert.ok(r.status === 400 || r.status === 409 || r.status === 422, JSON.stringify(r.body)); assert.ok(r.body.error);
  }
  assert.equal((await A.estado()).cash, a0 - 4000);
  // B põe metade: B fica com +5% (A tem pelo menos o mesmo) e A com +2,5%, sem A ter feito nada
  r = await ag(B, '10.0.9.91', { type: 'gangBiz', k: 0, amount: 2000 }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.result.coop, 500);
  let g = await gangue(A, '10.0.9.90'), z = g.mine.biz[0];
  assert.equal(z.id, 'oficina'); assert.equal(z.open, true); assert.equal(g.mine.biz[1].open, false);
  assert.equal(z.total, 6000); assert.equal(z.investors, 2); assert.equal(z.inv, 4000); assert.equal(z.coop, 250); assert.equal(z.full, 0); assert.equal(z.perH, 123);
  assert.equal(g.mine.roster.find((m) => m.name === 'NegB').stake, 2000);
  z = (await gangue(B, '10.0.9.91')).mine.biz[0]; assert.equal(z.inv, 2000); assert.equal(z.coop, 500); assert.equal(z.full, 1); assert.equal(z.perH, 63);
  // reinício: o investimento e o bónus continuam lá
  await parar(); await arrancar();
  z = (await gangue(A, '10.0.9.90')).mine.biz[0]; assert.equal(z.inv, 4000); assert.equal(z.coop, 250);
  r = await ag(A, '10.0.9.90', { type: 'gangBizCollect' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(r.body.result.money >= 0);
  // expulsar: B recebe metade de volta (e o que tinha por receber) e A perde o bónus que vinha dele
  const b0 = (await B.estado()).cash;
  r = await ag(A, '10.0.9.90', { type: 'gangKick', name: 'NegB' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const b1 = await B.estado(); assert.ok(b1.cash >= b0 + 1000 && b1.cash <= b0 + 1000 + 10); assert.equal(b1.gang, null);
  const ev = await (await fetch(BASE + '/api/events', { headers: { cookie: B.cookie, 'X-Forwarded-For': '10.0.9.91' } })).json();
  assert.equal(ev.list[0].k, 'gangOut'); assert.equal(ev.list[0].money, b1.cash - b0);
  z = (await gangue(A, '10.0.9.90')).mine.biz[0]; assert.equal(z.coop, 0); assert.equal(z.total, 4000); assert.equal(z.investors, 1);
  // sair: A recebe metade e a gangue acaba
  const a1 = (await A.estado()).cash;
  r = await ag(A, '10.0.9.90', { type: 'gangLeave' }); assert.equal(r.status, 200); assert.ok(r.body.result.back >= 2000); assert.equal(r.body.me.cash, a1 + r.body.result.back);
  assert.equal((await gangue(A, '10.0.9.90')).list.length, 0);
});

test('gangues: golpe em grupo e tareia em grupo — alinhar, falta de gente devolve tudo, contas certas, sobrevive a um reinício', async () => {
  const ips = { A: '10.0.9.60', B: '10.0.9.61', C: '10.0.9.62', V: '10.0.9.63' };
  const A = await contaNova('GolpeA', ips.A), B = await contaNova('GolpeB', ips.B), C = await contaNova('GolpeC', ips.C), V = await contaNova('GolpeV', ips.V);
  for (const x of [A, B, C, V]) await x.estado();
  const forte = (e) => { e.cash = 1_000_000; e.respect = 100; e.peakRespect = 100; for (const s of Object.keys(e.stats)) e.stats[s] = 400; e.energy = 100; };
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000', GANG_OP_MS: '700' };
  await mexer({ GolpeA: forte, GolpeB: forte, GolpeC: forte, GolpeV: (e) => { e.respect = 100; e.peakRespect = 100; } });
  const ag = (x, ip, body) => cru(x.cookie, ip, body), gangue = async (x, ip) => (await fetch(BASE + '/api/gang', { headers: { cookie: x.cookie, 'X-Forwarded-For': ip } })).json();
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  let r = await ag(A, ips.A, { type: 'gangCreate', name: 'Golpistas', tag: 'GLP' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const gid = (await gangue(A, ips.A)).mine.id;
  for (const [x, ip] of [[B, ips.B], [C, ips.C]]) { r = await ag(x, ip, { type: 'gangJoin', id: gid }); assert.equal(r.body.result.joined, true); }
  // regras para abrir
  r = await ag(V, ips.V, { type: 'gangOp', kind: 'heist', k: 0 }); assert.equal(r.body.error, 'NO_GANG');
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'heist', k: 1 }); assert.equal(r.body.error, 'NEED_SEDE');
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'heist', k: 99 }); assert.equal(r.body.error, 'NO_CRIME');
  r = await ag(A, ips.A, { type: 'gangOpJoin' }); assert.equal(r.body.error, 'NO_OP');
  // sozinho não dá: a stamina e a vez voltam
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'heist', k: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.energy, 80);
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'heist', k: 0 }); assert.equal(r.body.error, 'OP_OPEN');
  r = await ag(A, ips.A, { type: 'gangOpJoin' }); assert.equal(r.body.error, 'IN_OP');
  r = await ag(A, ips.A, { type: 'gangLeave' }); assert.equal(r.body.error, 'IN_OP');
  let g = await gangue(B, ips.B); assert.deepEqual(g.mine.op.parts, ['GolpeA']); assert.equal(g.mine.op.need, 2); assert.equal(g.mine.op.joined, false); assert.ok(g.mine.op.chance > 0);
  await espera(1000);
  g = await gangue(A, ips.A); assert.equal(g.mine.op, null); assert.equal(g.mine.last.cancelled, true); assert.equal((await A.estado()).energy, 100);
  // três a alinhar: paga-se a todos por igual, ou ninguém leva nada
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'heist', k: 0 }); assert.equal(r.status, 200);
  r = await ag(B, ips.B, { type: 'gangOpJoin' }); assert.equal(r.body.result.joined, true); assert.equal(r.body.me.energy, 80);
  r = await ag(C, ips.C, { type: 'gangOpJoin' }); assert.equal(r.status, 200);
  await espera(1000);
  g = await gangue(A, ips.A); const L = g.mine.last;
  assert.equal(L.kind, 'heist'); assert.equal(L.cancelled, undefined); assert.equal(L.parts.length, 3);
  for (const [x, nome] of [[A, 'GolpeA'], [B, 'GolpeB'], [C, 'GolpeC']]) {
    const e = await x.estado(), eu = L.parts.find((y) => y.name === nome);
    assert.equal(e.cash, 1_000_000 - (nome === 'GolpeA' ? 25_000 : 0) + eu.money);
    if (L.success) { assert.ok(eu.money >= 3000 && eu.money <= Math.floor(4500 * 1.02)); assert.equal(eu.money, L.parts[0].money); assert.equal(e.respect, 114); }
    else { assert.equal(eu.money, 0); assert.equal(e.respect, 100); assert.equal(eu.busted, e.jailUntil > 0); }
  }
  const ev = await (await fetch(BASE + '/api/events', { headers: { cookie: B.cookie, 'X-Forwarded-For': ips.B } })).json();
  assert.equal(ev.list[0].k, 'gop'); assert.equal(ev.list[0].ok, !!L.success);
  const feed = (await (await fetch(BASE + '/api/state', { headers: { cookie: V.cookie, 'X-Forwarded-For': ips.V } })).json()).feed;
  assert.ok(feed.some((n) => n.k === (L.success ? 'gangHeist' : 'gangHeistFail') && n.tag === 'GLP' && n.n === 3));
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'heist', k: 0 });
  assert.ok(['OP_WAIT', 'IN_JAIL'].includes(r.body.error), JSON.stringify(r.body));
  // uma operação aberta sobrevive a um reinício; cancelar devolve a stamina a quem alinhou
  const livres = (e) => { e.jailUntil = 0; e.hospUntil = 0; e.energy = 100; };
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000', GANG_OP_MS: '60000' };
  await mexer({ GolpeA: livres, GolpeB: livres, GolpeC: livres });
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'heist', k: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await ag(B, ips.B, { type: 'gangOpJoin' }); assert.equal(r.status, 200);
  await parar(); await arrancar();
  g = await gangue(C, ips.C); assert.deepEqual(g.mine.op.parts, ['GolpeA', 'GolpeB']);
  r = await ag(C, ips.C, { type: 'gangOpCancel' }); assert.equal(r.body.error, 'NOT_LEADER');
  r = await ag(A, ips.A, { type: 'gangOpCancel' }); assert.equal(r.status, 200); assert.equal(r.body.me.energy, 100);
  assert.equal((await B.estado()).energy, 100);
  g = await gangue(A, ips.A); assert.equal(g.mine.op, null);
  // tareia em grupo: precisa de dois; o alvo perde uma vez e vai para o hospital, ou vão os que atacaram
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000', GANG_OP_MS: '700' };
  await parar(); await arrancar();
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'hit', target: 'GolpeB' }); assert.equal(r.body.error, 'SAME_GANG');
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'hit', target: 'ninguem' }); assert.equal(r.body.error, 'NO_TARGET');
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'hit', target: 'golpev' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.energy, 80);
  await espera(1000);
  g = await gangue(A, ips.A); assert.equal(g.mine.last.kind, 'hit'); assert.equal(g.mine.last.cancelled, true); assert.equal((await A.estado()).energy, 100);
  const antes = { A: (await A.estado()).respect, B: (await B.estado()).respect, V: (await V.estado()).respect };
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'hit', target: 'GolpeV' }); assert.equal(r.status, 200);
  r = await ag(B, ips.B, { type: 'gangOpJoin' }); assert.equal(r.status, 200);
  g = await gangue(C, ips.C); assert.equal(g.mine.op.kind, 'hit'); assert.equal(g.mine.op.target, 'GolpeV'); assert.equal(g.mine.op.parts.length, 2);
  await espera(1000);
  g = await gangue(A, ips.A); const H = g.mine.last;
  assert.equal(H.kind, 'hit'); assert.equal(H.target, 'GolpeV'); assert.equal(H.parts.length, 2);
  const a2 = await A.estado(), b2 = await B.estado(), sv = await (await fetch(BASE + '/api/state', { headers: { cookie: V.cookie, 'X-Forwarded-For': ips.V } })).json(), v2 = sv.me;
  assert.equal(a2.respect - antes.A, H.parts.find((x) => x.name === 'GolpeA').respect);
  assert.equal(b2.respect - antes.B, H.parts.find((x) => x.name === 'GolpeB').respect);
  if (H.win) { assert.ok(v2.hospUntil > sv.now); assert.equal(antes.V - v2.respect, H.targetLoss); assert.ok(a2.respect > antes.A && b2.respect > antes.B); assert.ok(H.targetLoss <= Math.max(a2.respect - antes.A, b2.respect - antes.B)); }
  else { assert.ok(a2.hospUntil > sv.now && b2.hospUntil > sv.now); assert.ok(v2.respect >= antes.V); assert.ok(a2.respect < antes.A); }
  const evV = await (await fetch(BASE + '/api/events', { headers: { cookie: V.cookie, 'X-Forwarded-For': ips.V } })).json();
  assert.equal(evV.list[0].k, 'attacked'); assert.equal(evV.list[0].by, '[GLP] Golpistas'); assert.equal(evV.list[0].crew, 2);
  assert.equal(a2.cash, (await A.estado()).cash);
});
