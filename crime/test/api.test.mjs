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
import { CFG } from '../engine/config.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let dir, srv;
let ENV_EXTRA = {};
const INICIAL = 50;   // base nova (16/11/2026): todos começam com 50 €
const NIVEL60 = CFG.levels[59];   // sala reservada do casino (até 1 000 € por jogada)
const E0 = CFG.crimes[0].e;       // stamina do carteirista

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
  const r = await a('POST', '/api/register', { name: 'Ana_1', password: 'segredo123', email: 'ana_1@teste.pt' });
  assert.equal(r.status, 200);
  assert.match(r.setCookie, /HttpOnly/); assert.match(r.setCookie, /SameSite=Lax/);
  assert.equal((await a('POST', '/api/register', { name: 'ana_1', password: 'segredo123', email: 'ana_1@teste.pt' })).body.error, 'NAME_TAKEN');
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
  await a('POST', '/api/register', { name: 'Bruno', password: 'segredo123', email: 'bruno@teste.pt' });
  const s = await a('GET', '/api/state');
  assert.equal(s.body.round.phase, 'play');
  assert.equal(s.body.me.energy, 100);
  const r1 = await a('POST', '/api/act', { type: 'crime', k: 0, rid: 'x1' });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.me.energy, 100 - E0);
  const r2 = await a('POST', '/api/act', { type: 'crime', k: 0, rid: 'x1' }); // mesmo pedido outra vez
  assert.equal(r2.body.me.energy, 100 - E0);
  assert.equal((await a('POST', '/api/act', { type: 'voar' })).body.error, 'BAD_ACTION');
  assert.equal((await a('POST', '/api/act', { type: 'crime', k: 99 })).body.error, 'NO_CRIME');
  assert.equal((await a('POST', '/api/act', { type: 'deposit', amount: 1e15 })).body.error, 'BAD_AMOUNT');
  assert.equal((await a('POST', '/api/act', { type: 'train', stat: '__proto__' })).body.error, 'NO_STAT');
  // recarga e desintoxicação chegam ao motor
  assert.equal((await a('POST', '/api/act', { type: 'detox' })).body.error, 'NO_VICE');
  const st = (await a('GET', '/api/state')).body.me;
  assert.equal(st.refill.energy, E0, 'a barra a droga enche o que falta');
  assert.equal(st.refill.cost, Math.ceil((E0 * 50) / 100), 'ao preço da primeira barra do dia (50 €)');
  const r3 = await a('POST', '/api/act', { type: 'refill', rid: 'rf1' });
  assert.equal(r3.status, 200, JSON.stringify(r3.body));
  assert.equal(r3.body.me.energy, 100);
  assert.equal(r3.body.me.addiction, 0, 'a barra não mexe no vício'); assert.equal(r3.body.me.refillBars, E0);
  assert.equal(r3.body.me.refill, null);
  assert.equal((await a('POST', '/api/act', { type: 'refill', rid: 'rf2' })).body.error, 'ENERGY_FULL');
});

test('ataque entre duas contas: hospital, evento e ranking', async () => {
  const a = cliente('10.0.0.5'), b = cliente('10.0.0.6');
  await a('POST', '/api/register', { name: 'Carla', password: 'segredo123', email: 'carla@teste.pt' });
  await b('POST', '/api/register', { name: 'Duarte', password: 'segredo123', email: 'duarte@teste.pt' });
  await b('GET', '/api/state');
  const t = await a('GET', '/api/targets');
  assert.ok(t.body.list.some((x) => x.name === 'Duarte'), JSON.stringify(t.body));
  const r = await a('POST', '/api/act', { type: 'attack', target: 'duarte', mode: 'beat' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // as lutas gastam energia, não a stamina dos crimes (e subir de nível já não enche nada)
  assert.equal(r.body.me.energy, 100); assert.equal(r.body.me.vigor, CFG.vigor.max - CFG.pvp.energy);
  const perdeu = r.body.result.win ? 'Duarte' : 'Carla';
  const sb = await b('GET', '/api/state');
  if (perdeu === 'Duarte') assert.ok(sb.body.me.hospUntil > sb.body.now);
  // quem está no hospital ou protegido continua na lista de alvos, apagado, com o motivo e a hora a que acaba (sem preço nem hipótese)
  if (perdeu === 'Duarte') {
    const d = (await a('GET', '/api/targets')).body.list.find((x) => x.name === 'Duarte');
    assert.ok(['TARGET_HOSPITAL', 'TARGET_PROTECTED'].includes(d.why), JSON.stringify(d)); assert.ok(d.until > sb.body.now); assert.equal(d.chance, undefined);
    assert.deepEqual(Object.keys(d).sort(), ['av', 'cls', 'level', 'name', 'respect', 'tag', 'until', 'why']);
  }
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
  for (let i = 0; i < 6; i++) ultimo = await x('POST', '/api/register', { name: 'Robo' + i, password: 'segredo123', email: 'robo' + i + '@teste.pt' });
  assert.equal(ultimo.status, 429);
});

test('o estado sobrevive a um reinício', async () => {
  const a = cliente('10.0.0.8');
  await a('POST', '/api/register', { name: 'Eva', password: 'segredo123', email: 'eva@teste.pt' });
  await a('POST', '/api/act', { type: 'train', stat: 'F' });
  const antes = (await a('GET', '/api/state')).body.me;
  await parar(); await arrancar();
  const depois = (await a('GET', '/api/state')).body.me;
  assert.equal(depois.stats.F, antes.stats.F);
  assert.equal(depois.energy >= antes.energy, true);
});

test('logout acaba a sessão', async () => {
  const a = cliente('10.0.0.9');
  await a('POST', '/api/register', { name: 'Filipe', password: 'segredo123', email: 'filipe@teste.pt' });
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
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ipFalso }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@teste.pt' }) });
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
  assert.equal(depois.house, 0); assert.equal(depois.luxuries, 0); assert.ok(Object.values(depois.eq).every((x) => !x));
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
  assert.equal(me.energy, 100 - E0);
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
  assert.equal(me.cash, INICIAL + r.body.result.money);
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
  // o que se levou conta pelo valor: o dinheiro na mão mais o que foi para o inventário (vale isso no recetador)
  const objetos = me.inv.reduce((x, it) => x + (it.v || 0), 0);
  assert.equal(sum('money'), me.cash - INICIAL + objetos);
});

test('mesa ao vivo: dois jogadores na mesma ronda veem o mesmo resultado e as contas batem certo', async () => {
  await parar(); ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000', MESA_BET_MS: '900', MESA_SPIN_MS: '500' }; await arrancar();
  const A = await contaNova('MesaA', '10.0.9.40'), B = await contaNova('MesaB', '10.0.9.41');
  await A.estado(); await B.estado(); await mexer({ MesaA: (e) => { e.cash = 500; e.respect = e.peakRespect = NIVEL60; }, MesaB: (e) => { e.cash = 500; e.respect = e.peakRespect = NIVEL60; } });   // começa-se com 50 €: o teste aposta mais
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
  await A.estado(); await mexer({ MesaC: (e) => { e.cash = 500; e.respect = e.peakRespect = NIVEL60; } });
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

test('Crazy na mesa: o resultado só abre depois da escolha do flapper, cada um é pago pelo seu, e quem não escolhe fica com um à sorte', async () => {
  await parar(); ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000', MESA_BET_MS: '900', MESA_SPIN_MS: '300', CRAZY_PICK_MS: '1500', MESA_FORCA_RODA: 'louca' }; await arrancar();
  const A = await contaNova('CrazyA', '10.0.9.60'), B = await contaNova('CrazyB', '10.0.9.61'), C = await contaNova('CrazyC', '10.0.9.62');
  for (const x of [A, B, C]) await x.estado();
  const sala = (e) => { e.cash = 500; e.respect = e.peakRespect = NIVEL60; };
  await mexer({ CrazyA: sala, CrazyB: sala, CrazyC: sala });
  const ips = new Map([[A, '10.0.9.60'], [B, '10.0.9.61'], [C, '10.0.9.62']]);
  const mesa = async (x) => (await fetch(BASE + '/api/table?g=wheel', { headers: { cookie: x.cookie, 'X-Forwarded-For': ips.get(x) } })).json();
  const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
  let t = await mesa(A);
  while (t.phase !== 'bets' || t.closesAt - t.now < 650) { await dorme(100); t = await mesa(A); }
  const id = t.id;
  // fora da escolha não se escolhe flapper
  let r = await cru(A.cookie, ips.get(A), { type: 'tableFlap', c: 1 }); assert.equal(r.body.error, 'PICK_CLOSED');
  r = await cru(A.cookie, ips.get(A), { type: 'tableBet', g: 'wheel', bets: [{ s: 'louca', amt: 10 }, { s: '1', amt: 20 }] }); assert.equal(r.status, 200);
  r = await cru(B.cookie, ips.get(B), { type: 'tableBet', g: 'wheel', bets: [{ s: '1', amt: 50 }] }); assert.equal(r.status, 200);
  r = await cru(C.cookie, ips.get(C), { type: 'tableBet', g: 'wheel', bets: [{ s: 'louca', amt: 30 }] }); assert.equal(r.status, 200);
  while (t.phase !== 'spin' || t.id !== id) { await dorme(60); t = await mesa(A); assert.ok(t.id === id, 'a ronda mudou antes de abrir a Crazy'); }
  // escolha aberta: saiu a Crazy, mas onde a roda grande pára ainda não foi dito a ninguém, e ninguém foi pago
  assert.equal(t.res.s, 'louca'); assert.ok(t.res.bonus.pickUntil > t.now); assert.equal(t.res.bonus.stops, undefined); assert.equal(t.res.bonus.mults, undefined); assert.equal(t.res.mult, null);
  assert.equal(t.mine.win, undefined); assert.equal(t.hist[0].m, null);
  assert.ok(!JSON.stringify(t).includes('stops'), 'o resultado fechado não pode ir na resposta');
  r = await cru(A.cookie, ips.get(A), { type: 'tableFlap', c: 7 }); assert.equal(r.body.error, 'BAD_BET');
  r = await cru(B.cookie, ips.get(B), { type: 'tableFlap', c: 0 }); assert.equal(r.body.error, 'NO_BET');   // só apostou no 1
  r = await cru(A.cookie, ips.get(A), { type: 'tableFlap', c: 0 }); assert.equal(r.status, 200);
  r = await cru(A.cookie, ips.get(A), { type: 'tableFlap', c: 2 }); assert.equal(r.status, 200); assert.equal(r.body.result.flap, 2);   // pode mudar enquanto está aberta
  assert.equal(r.body.me.cash, 500 - 30);   // ainda sem prémio
  while (!t.res.bonus.stops) { await dorme(80); t = await mesa(A); assert.equal(t.id, id, 'a ronda seguinte abriu antes de a Crazy pagar'); }
  // aberto: três resultados, um por flapper; A com o flapper 2, C com um à sorte, B perdeu (o 1 não saiu)
  const { stops, mults } = t.res.bonus, tm = t.res.tm, teto = (ap, tot) => Math.min(ap, tot * 2500);
  assert.ok(stops.length >= 1 && mults.length === 3 && mults.every((m) => m >= 15));
  assert.equal(t.mine.flap, 2); assert.ok(!t.mine.auto); assert.equal(t.mine.win, teto(10 * (mults[2] * tm + 1), 30));
  const tc = await mesa(C); assert.ok([0, 1, 2].includes(tc.mine.flap) && tc.mine.auto === true); assert.equal(tc.mine.win, teto(30 * (mults[tc.mine.flap] * tm + 1), 30));
  const tb = await mesa(B); assert.equal(tb.mine.win, 0);
  assert.equal(t.hist[0].m, Math.max(...mults) * tm);
  r = await cru(A.cookie, ips.get(A), { type: 'tableFlap', c: 1 }); assert.equal(r.body.error, 'PICK_CLOSED');
  assert.equal((await A.estado()).cash, 500 - 30 + t.mine.win); assert.equal((await B.estado()).cash, 450);
  // a ronda seguinte só começa depois das voltas da roda grande
  assert.ok(t.nextAt >= t.res.bonus.pickUntil);
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
      for (const h of a.hist) { assert.ok(Number.isInteger(h.i) && h.i >= 0 && h.i < 54); assert.ok(typeof h.s === 'string' && (h.m >= 1 || (h.s === 'louca' && h.m === null))); }   // Crazy a meio da escolha: ainda sem multiplicador
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
  const CLUB0 = CFG.venue.club.cost[0], P = CFG.drugs[COCA].price, PG = Math.floor((P * 8800) / 10000), PF = Math.floor((P * 11000) / 10000);
  assert.equal(r.body.me.club.lvl, 1); assert.equal(r.body.me.cash, a0 - CLUB0); assert.deepEqual(r.body.me.stock[COCA], 5);
  r = await ag(A, '10.0.9.80', { type: 'venueSet', kind: 'club', pi: 3, gd: 2 }); assert.equal(r.status, 200); assert.equal(r.body.me.club.pi, 3); assert.equal(r.body.me.club.gd, 2);
  r = await ag(A, '10.0.9.80', { type: 'venueSet', kind: 'club', pi: 9, gd: 0 }); assert.equal(r.body.error, 'BAD_AMOUNT');
  // a lista: o membro da gangue vê 88%, quem é de fora vê 110%; o dono não aparece na sua própria lista
  let vb = await get(B, '10.0.9.81', '/api/venues'), vx = await get(X, '10.0.9.82', '/api/venues'), va = await get(A, '10.0.9.80', '/api/venues');
  assert.equal(va.clubs.length, 0);
  assert.deepEqual(vb.clubs.map((c) => [c.name, c.tag, c.gang, c.bp, c.pub]), [['CasaA', 'CAS', true, 8800, 11000]]); assert.deepEqual(vb.clubs[0].items, [{ d: COCA, n: 5, price: PG }]);
  assert.deepEqual(vx.clubs.map((c) => [c.name, c.gang, c.bp]), [['CasaA', false, 11000]]); assert.equal(vx.clubs[0].items[0].price, PF);
  // comprar: o dinheiro sai do comprador e entra no caixa do dono; a droga sai do armazém dele (dá o efeito, não stamina)
  r = await ag(B, '10.0.9.81', { type: 'clubBuy', owner: 'CasaA', d: COCA, price: PG }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.price, PG); assert.equal(r.body.me.cash, 500_000 - PG); assert.equal(r.body.me.energy, 0);
  r = await ag(X, '10.0.9.82', { type: 'clubBuy', owner: 'CasaA', d: COCA, price: PF - 1 }); assert.equal(r.body.error, 'PRICE_CHANGED'); assert.equal((await X.estado()).cash, 500_000);
  r = await ag(X, '10.0.9.82', { type: 'clubBuy', owner: 'CasaA', d: COCA, price: PF }); assert.equal(r.status, 200); assert.equal(r.body.me.cash, 500_000 - PF);
  r = await ag(X, '10.0.9.82', { type: 'clubBuy', owner: 'CasaA', d: 0 }); assert.equal(r.body.error, 'NO_STOCK');
  r = await ag(X, '10.0.9.82', { type: 'clubBuy', owner: 'Ninguem', d: COCA }); assert.equal(r.body.error, 'NO_VENUE');
  r = await ag(A, '10.0.9.80', { type: 'clubBuy', owner: 'CasaA', d: COCA }); assert.equal(r.body.error, 'SELF');
  let a = await A.estado(); assert.equal(a.club.till, PG + PF); assert.equal(a.stock[COCA], 3); assert.equal(a.cash, a0 - CLUB0);
  r = await ag(A, '10.0.9.80', { type: 'venueCollect' }); assert.equal(r.body.result.club, PG + PF); assert.equal(r.body.me.cash, a0 - CLUB0 + PG + PF); assert.equal(r.body.me.club.till, 0);
  // armazém: tomar uma e despachar o resto (desde o passo 6, parte 2: vende-se ao mercado de Lisboa, ao preço de lá)
  r = await ag(A, '10.0.9.80', { type: 'stockUse', d: COCA }); assert.equal(r.status, 200); assert.equal(r.body.me.stock[COCA], 2); assert.equal(r.body.me.cash, a0 - CLUB0 + PG + PF);
  r = await ag(A, '10.0.9.80', { type: 'stockDump', d: COCA, n: 3 }); assert.equal(r.body.error, 'NO_STOCK');
  const lx = r.body.me.mk.lx, D = Math.floor((CFG.market.depth.lx * 100) / (P * 80)), s0 = lx.sat[COCA];
  const vale = Math.floor((P * 80 * lx.dem[COCA] * 2 * (s0 - 10000 / D) * (10000 - CFG.market.spreadBp)) / 1e12 / 100);
  r = await ag(A, '10.0.9.80', { type: 'stockDump', d: COCA, n: 2 }); assert.ok(Math.abs(r.body.result.got - vale) <= 1, JSON.stringify([r.body.result.got, vale])); assert.equal(r.body.me.stock[COCA], 0);
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
  const cfgP = await (await fetch(BASE + '/api/config')).json(), ervaP = cfgP.port.ships[0].drug; assert.equal(cfgP.drugs[ervaP].id, 'erva');
  r = await ag(A, '10.0.9.80', { type: 'port', amount: 1000, goods: true }); assert.equal(r.body.error, 'NO_SHIP', 'sem barco escolhido não se envia');
  r = await ag(A, '10.0.9.80', { type: 'port', k: 0, amount: 1000, goods: true }); assert.equal(r.status, 200); assert.equal(r.body.me.port.at(-1).d, ervaP); assert.equal(r.body.me.port.at(-1).k, 0);
  // o estado sobrevive a um reinício
  await mexer({}); a = await A.estado(); assert.equal(a.club.pi, 3); assert.equal(a.bro.lvl, 1); assert.equal(a.port.at(-1).d, ervaP);
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
  assert.deepEqual(a0.stk[k], { n: 0, cost: 0, value: 0, tp: 0, sl: 0 }); assert.ok(a0.stockCap > 0);
  // preço diferente do que está: não compra
  let r = await ag(A, '10.0.9.90', { type: 'stockBuy', k, n: 10, price: preco + 1 }); assert.equal(r.body.error, 'PRICE_CHANGED'); assert.equal((await A.estado()).cash, 100_000);
  r = await ag(A, '10.0.9.90', { type: 'stockBuy', k, n: 10, price: preco }); assert.equal(r.status, 200, JSON.stringify(r.body));
  // (passo 6) a compra faz-se ao preço empurrado pela própria ordem, e o preço fica lá
  const ex = r.body.result.price, bruto = Math.ceil((10 * ex) / 100), pago = bruto + Math.ceil(bruto / 100);
  assert.ok(ex >= preco && ex <= preco + Math.ceil(preco / 100));
  assert.equal(r.body.result.paid, pago); assert.equal(r.body.me.cash, 100_000 - pago); assert.deepEqual(r.body.me.stk[k], { n: 10, cost: pago, value: Math.floor((10 * ex) / 100), tp: 0, sl: 0 });
  const depoisDaCompra = ma.prices.slice(); depoisDaCompra[k] = ex;
  r = await ag(A, '10.0.9.90', { type: 'stockSell', k, n: 11 }); assert.equal(r.body.error, 'NO_SHARES');
  r = await ag(A, '10.0.9.90', { type: 'stockBuy', k: 9, n: 1 }); assert.equal(r.body.error, 'NO_STOCK_CO');
  r = await ag(A, '10.0.9.90', { type: 'stockBuy', k, n: 0 }); assert.equal(r.body.error, 'BAD_AMOUNT');
  // reinício: o mercado e as ações ficam como estavam
  await mexer({});
  const m2 = await get(A, '10.0.9.90', '/api/stocks'); if (m2.tick === ma.tick) { assert.deepEqual(m2.prices, depoisDaCompra); assert.deepEqual(m2.hist, ma.hist); }
  assert.equal((await A.estado()).stk[k].n, 10);
  r = await ag(A, '10.0.9.90', { type: 'stockSell', k, n: 10, price: m2.prices[k] }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const v = Math.floor((10 * r.body.result.price) / 100); assert.ok(r.body.result.price <= m2.prices[k]); assert.equal(r.body.result.got, v - Math.min(v, Math.ceil(v / 100))); assert.equal(r.body.me.cash, 100_000 - pago + r.body.result.got); assert.deepEqual(r.body.me.stk[k], { n: 0, cost: 0, value: 0, tp: 0, sl: 0 });
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
  const DOA = CFG.gang.armaria[0] + CFG.gang.sede[0], RESTO = 1_000_000 - DOA;
  r = await ag(B, '10.0.9.51', { type: 'gangDonate', amount: DOA }); assert.equal(r.body.me.cash, RESTO); assert.equal(r.body.result.fund, DOA);
  r = await ag(B, '10.0.9.51', { type: 'gangDonate', amount: 50 }); assert.equal(r.body.error, 'BAD_AMOUNT');
  r = await ag(B, '10.0.9.51', { type: 'gangDonate', amount: 2_000_000 }); assert.equal(r.body.error, 'NO_MONEY');
  r = await ag(B, '10.0.9.51', { type: 'gangUp', what: 'armaria' }); assert.equal(r.body.error, 'NOT_LEADER');
  r = await ag(A, '10.0.9.50', { type: 'gangUp', what: 'armaria' }); assert.equal(r.body.result.level, 1); assert.equal(r.body.result.fund, CFG.gang.sede[0]);
  r = await ag(A, '10.0.9.50', { type: 'gangUp', what: 'sede' }); assert.equal(r.body.result.level, 2); assert.equal(r.body.result.fund, 0);
  r = await ag(A, '10.0.9.50', { type: 'gangUp', what: 'sede' }); assert.equal(r.body.error, 'NO_GANG_MONEY');
  // o bónus chega a todos os membros e sobrevive a um reinício
  await parar(); await arrancar();
  let b = await B.estado();
  assert.deepEqual(b.gb, { loot: 400, atk: 300, def: 300 }); assert.equal(b.attack, Math.floor((forcaAntes * 10300) / 10000)); assert.equal(b.cash, RESTO);
  let g = await gangue(B, '10.0.9.51');
  assert.equal(g.mine.roster.length, 2); assert.equal(g.mine.members, 2); assert.equal(g.mine.fund, 0); assert.equal(g.mine.slots, 8); assert.equal(g.list[0].respect, 200); assert.equal(g.mine.leaderMe, false);
  assert.equal(g.mine.roster.find((m) => m.name === 'MembroG').given, DOA);
  // conversa: guarda o texto tal como veio (o ecrã é que o mostra como texto), sem caracteres de controlo
  r = await ag(B, '10.0.9.51', { type: 'gangChat', txt: '  <b>olá</b>\n\u0007 malta  ' }); assert.equal(r.status, 200);
  r = await ag(C, '10.0.9.52', { type: 'gangChat', txt: 'olá' }); assert.equal(r.body.error, 'NO_GANG');
  g = await gangue(A, '10.0.9.50'); assert.equal(g.mine.chat.at(-1).txt, '<b>olá</b>   malta'); assert.equal(g.mine.chat.at(-1).name, 'MembroG');
  // gangue fechada: pede-se, o chefe aceita
  r = await ag(A, '10.0.9.50', { type: 'gangOpen', open: false }); assert.equal(r.body.result.open, false);
  r = await ag(D, '10.0.9.53', { type: 'gangJoin', id: gid }); assert.equal(r.body.result.asked, true); assert.equal(r.body.me.gang, null);
  r = await ag(B, '10.0.9.51', { type: 'gangAccept', name: 'PedeG' }); assert.equal(r.body.error, 'NO_RANK');
  assert.deepEqual((await gangue(B, '10.0.9.51')).mine.asks, [], 'quem não tem cargo não vê os pedidos');
  g = await gangue(A, '10.0.9.50'); assert.deepEqual(g.mine.asks.map((x) => x.name), ['PedeG']);
  r = await ag(A, '10.0.9.50', { type: 'gangAccept', name: 'PedeG' }); assert.equal(r.status, 200);
  assert.deepEqual((await D.estado()).gb, { loot: 400, atk: 300, def: 300 });
  // expulsar tira o bónus e obriga a esperar para entrar noutra
  r = await ag(B, '10.0.9.51', { type: 'gangKick', name: 'ChefeG' }); assert.equal(r.body.error, 'NO_RANK');
  r = await ag(A, '10.0.9.50', { type: 'gangKick', name: 'MembroG' }); assert.equal(r.status, 200);
  b = await B.estado(); assert.equal(b.gang, null); assert.equal(b.gb, null); assert.equal(b.attack, forcaAntes); assert.equal(b.cash, RESTO);
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
  r = await ag(A, '10.0.9.90', { type: 'gangBiz', k: 0, amount: 12000 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.inv, 12000); assert.equal(r.body.result.coop, 0); assert.equal(r.body.me.cash, a0 - 12000);
  r = await ag(A, '10.0.9.90', { type: 'gangBiz', k: 1, amount: 1000 }); assert.equal(r.body.error, 'GBIZ_SEDE');           // a sede ainda é de nível 1
  for (const bad of [{ k: 0, amount: 50 }, { k: 0, amount: -5 }, { k: 0, amount: 1e12 }, { k: 7, amount: 1000 }, { k: '0', amount: '1000' }, { k: 0 }]) {
    r = await ag(A, '10.0.9.90', { type: 'gangBiz', ...bad }); assert.ok(r.status === 400 || r.status === 409 || r.status === 422, JSON.stringify(r.body)); assert.ok(r.body.error);
  }
  assert.equal((await A.estado()).cash, a0 - 12000);
  // B põe metade: B fica com +5% (A tem pelo menos o mesmo) e A com +2,5%, sem A ter feito nada
  r = await ag(B, '10.0.9.91', { type: 'gangBiz', k: 0, amount: 6000 }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.result.coop, 500);
  let g = await gangue(A, '10.0.9.90'), z = g.mine.biz[0];
  assert.equal(z.id, 'oficina'); assert.equal(z.open, true); assert.equal(g.mine.biz[1].open, false);
  const rate = CFG.gang.biz[0].rateBp, porH = (inv, coop) => Math.floor((Math.floor((inv * rate) / 10000) * (10000 + coop)) / 10000);
  assert.equal(z.total, 18000); assert.equal(z.investors, 2); assert.equal(z.inv, 12000); assert.equal(z.coop, 250); assert.equal(z.full, 0); assert.equal(z.perH, porH(12000, 250));
  assert.equal(g.mine.roster.find((m) => m.name === 'NegB').stake, 6000);
  z = (await gangue(B, '10.0.9.91')).mine.biz[0]; assert.equal(z.inv, 6000); assert.equal(z.coop, 500); assert.equal(z.full, 1); assert.equal(z.perH, porH(6000, 500));
  // reinício: o investimento e o bónus continuam lá
  await parar(); await arrancar();
  z = (await gangue(A, '10.0.9.90')).mine.biz[0]; assert.equal(z.inv, 12000); assert.equal(z.coop, 250);
  r = await ag(A, '10.0.9.90', { type: 'gangBizCollect' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(r.body.result.money >= 0);
  // expulsar: B recebe metade de volta (e o que tinha por receber) e A perde o bónus que vinha dele
  const b0 = (await B.estado()).cash;
  r = await ag(A, '10.0.9.90', { type: 'gangKick', name: 'NegB' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const b1 = await B.estado(); assert.ok(b1.cash >= b0 + 3000 && b1.cash <= b0 + 3000 + 10); assert.equal(b1.gang, null);
  const ev = await (await fetch(BASE + '/api/events', { headers: { cookie: B.cookie, 'X-Forwarded-For': '10.0.9.91' } })).json();
  assert.equal(ev.list[0].k, 'gangOut'); assert.equal(ev.list[0].money, b1.cash - b0);
  z = (await gangue(A, '10.0.9.90')).mine.biz[0]; assert.equal(z.coop, 0); assert.equal(z.total, 12000); assert.equal(z.investors, 1);
  // sair: A recebe metade e a gangue acaba
  const a1 = (await A.estado()).cash;
  r = await ag(A, '10.0.9.90', { type: 'gangLeave' }); assert.equal(r.status, 200); assert.ok(r.body.result.back >= 6000); assert.equal(r.body.me.cash, a1 + r.body.result.back);
  assert.equal((await gangue(A, '10.0.9.90')).list.length, 0);
});

test('guardas e assassino a soldo: comprar guardas, encomendar, o alvo não sabe quem foi quando acerta e sabe quando falha, jornal sem nomes a mais', async () => {
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000' };
  const A = await contaNova('HitA', '10.0.9.95'), B = await contaNova('HitB', '10.0.9.96'), C = await contaNova('HitC', '10.0.9.94');
  for (const x of [A, B, C]) await x.estado();
  const base = (e) => { e.cash = 3_000_000; e.bank = 0; e.respect = 1000; e.peakRespect = 1000; e.shieldUntil = 0; e.protectUntil = 0; e.hospUntil = 0; e.jailUntil = 0; };
  await mexer({ HitA: base, HitB: (e) => { base(e); e.cash = 40_600; }, HitC: (e) => { base(e); e.respect = 100; e.peakRespect = 100; } });
  const ag = (x, ip, body) => cru(x.cookie, ip, body), get = async (x, ip, url) => (await fetch(BASE + url, { headers: { cookie: x.cookie, 'X-Forwarded-For': ip } })).json();
  // a lista de alvos traz o preço e a pontaria do assassino
  let alvo = (await get(A, '10.0.9.95', '/api/targets')).list.find((x) => x.name === 'HitB');
  const HP = 1000 * CFG.hitman.pricePerRespect, G01 = CFG.guards[0].price + CFG.guards[1].price;
  assert.equal(alvo.hp, HP); assert.equal(alvo.hc, 9000); assert.equal(alvo.hw, null);
  // o sítio do assassino mostra toda a gente, com o motivo quando não dá: um fraco demais não entra nos alvos, mas aparece aqui a dizer porquê
  { const tl = (await get(A, '10.0.9.95', '/api/targets')).list, c = tl.find((x) => x.name === 'HitC');   // nos alvos aparece no fim, sem números, só com o motivo
    assert.equal(c.why, 'TARGET_TOO_WEAK'); assert.equal(c.until, 0); assert.equal(c.chance, undefined); assert.equal(c.hp, undefined);
    assert.ok(tl.findIndex((x) => x.name === 'HitB') < tl.findIndex((x) => x.name === 'HitC')); }
  const contratos = (await get(A, '10.0.9.95', '/api/hitman')).list.filter((x) => x.name.startsWith('Hit'));
  assert.deepEqual(contratos.map((x) => [x.name, x.hw, x.hp, x.hc]), [['HitB', null, HP, 9000], ['HitC', 'TARGET_TOO_WEAK', CFG.hitman.priceMin, 9000]]);
  assert.deepEqual(Object.keys(contratos[0]).sort(), ['av', 'hc', 'hp', 'hw', 'level', 'name', 'respect', 'tag', 'until']);
  assert.equal((await fetch(BASE + '/api/hitman')).status, 401);
  // B compra um pitbull: a pontaria desce 15 pontos
  // (as armas e os guardas compram-se por ordem: saltar o chihuahua não dá)
  assert.equal((await ag(B, '10.0.9.96', { type: 'gear', kind: 'guard', idx: 1 })).body.error, 'GEAR_ORDER');
  let r = await ag(B, '10.0.9.96', { type: 'gear', kind: 'guard', idx: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await ag(B, '10.0.9.96', { type: 'gear', kind: 'guard', idx: 1 }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.guard, 1); assert.equal(r.body.me.cash, 40_600 - G01);
  alvo = (await get(A, '10.0.9.95', '/api/targets')).list.find((x) => x.name === 'HitB'); assert.equal(alvo.hc, 7500);
  assert.equal((await ag(A, '10.0.9.95', { type: 'hitman', target: 'ninguem' })).body.error, 'NO_TARGET');
  assert.equal((await ag(A, '10.0.9.95', { type: 'hitman', target: 'HitA' })).body.error, 'SELF');
  // encomenda até acertar (no máximo 3 por dia); cada uma custa o preço, acerte ou não
  let certo = null, feitas = 0;
  for (let i = 0; i < 3 && !certo; i++) {
    const antes = (await A.estado()).cash;
    r = await ag(A, '10.0.9.95', { type: 'hitman', target: 'hitb' }); assert.equal(r.status, 200, JSON.stringify(r.body)); feitas++;
    assert.equal(r.body.me.cash, antes - HP); assert.equal(r.body.result.price, HP); assert.equal(r.body.result.target, 'HitB'); assert.equal(r.body.me.hitmanLeft, 3 - feitas);
    const ev = (await get(B, '10.0.9.96', '/api/events')).list[0];
    assert.equal(ev.k, 'hitman'); assert.equal(ev.win, r.body.result.success);
    if (r.body.result.success) { certo = r.body.result; assert.equal(ev.by, undefined); assert.equal(JSON.stringify(ev).includes('HitA'), false); assert.equal(ev.respect, -15); assert.equal(ev.money, Math.floor((40_600 - G01) / 10)); }
    else assert.equal(ev.by, 'HitA');
  }
  const b = await B.estado();
  if (certo) {
    assert.equal(b.respect, 985); assert.equal(b.cash, 40_600 - G01 - Math.floor((40_600 - G01) / 10)); assert.ok(b.hospUntil > Date.now() + DESVIO);
    assert.equal((await ag(A, '10.0.9.95', { type: 'hitman', target: 'HitB' })).body.error, feitas >= 3 ? 'HITMAN_LIMIT' : 'TARGET_HOSPITAL');
    const jornal = (await get(B, '10.0.9.96', '/api/state')).feed || [];
    const n = jornal.find((x) => x.k === 'hitman'); if (n) { assert.equal(n.target, 'HitB'); assert.equal(JSON.stringify(n).includes('HitA'), false); }
  } else { assert.equal(b.respect, 1000); assert.equal(b.cash, 40_600 - G01); assert.equal((await ag(A, '10.0.9.95', { type: 'hitman', target: 'HitB' })).body.error, 'HITMAN_LIMIT'); }
  assert.equal((await A.estado()).respect, 1000);
});

test('gangue da rua: existe sempre, entra quem quiser, sem cofre nem chefe, os membros atacam-se, sobrevive vazia e a um reinício', async () => {
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000', GANG_BOT_OP_MS: '900' };
  const A = await contaNova('RuaA', '10.0.9.97'), B = await contaNova('RuaB', '10.0.9.98');
  for (const x of [A, B]) await x.estado();
  const base = (e) => { e.cash = 500_000; e.bank = 0; e.respect = 1000; e.peakRespect = 1000; e.shieldUntil = 0; e.protectUntil = 0; e.hospUntil = 0; e.jailUntil = 0; e.energy = 100; };
  await mexer({ RuaA: base, RuaB: base });
  const ag = (x, ip, body) => cru(x.cookie, ip, body), gangue = async (x, ip) => (await fetch(BASE + '/api/gang', { headers: { cookie: x.cookie, 'X-Forwarded-For': ip } })).json();
  let g = await gangue(A, '10.0.9.97');
  assert.equal(g.bot.id, 'rua'); assert.equal(g.bot.members, 0); assert.equal(g.bot.wait, 0); assert.equal(g.list.some((x) => x.id === 'rua'), false);   // não entra no ranking das gangues
  // o nome e a sigla estão reservados
  assert.equal((await ag(A, '10.0.9.97', { type: 'gangCreate', name: 'strays', tag: 'XYZ' })).body.error, 'GANG_NAME_TAKEN');
  assert.equal((await ag(A, '10.0.9.97', { type: 'gangCreate', name: 'Outra Coisa', tag: 'BOT' })).body.error, 'GANG_TAG_TAKEN');
  let r = await ag(A, '10.0.9.97', { type: 'gangJoin', id: 'rua' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.result.bot, true); assert.equal(r.body.me.gang.bot, true); assert.equal(r.body.me.gang.tag, 'BOT');
  r = await ag(B, '10.0.9.98', { type: 'gangJoin', id: 'rua' }); assert.equal(r.status, 200);
  g = await gangue(A, '10.0.9.97');
  assert.equal(g.mine.bot, true); assert.equal(g.mine.members, 2); assert.equal(g.mine.leader, 'Bot'); assert.equal(g.mine.leaderMe, false); assert.equal(g.mine.sede, 1); assert.equal(g.mine.roster.length, 2);
  // ninguém manda: sem cofre, sem melhorias, sem expulsar, sem fechar
  assert.equal((await ag(A, '10.0.9.97', { type: 'gangDonate', amount: 1000 })).body.error, 'BOT_GANG_NO');
  for (const body of [{ type: 'gangUp', what: 'sede' }, { type: 'gangOpen', open: false }, { type: 'gangLeader', name: 'RuaB' }, { type: 'gangRole', name: 'RuaB', role: 2 }]) assert.equal((await ag(A, '10.0.9.97', body)).body.error, 'NOT_LEADER');
  assert.equal((await ag(A, '10.0.9.97', { type: 'gangKick', name: 'RuaB' })).body.error, 'NO_RANK');
  assert.equal(g.mine.role, 0); assert.deepEqual(g.mine.can, { asks: false, ops: false, kick: false, roles: false }); assert.ok(g.mine.roster.every((m) => m.role === 0));
  assert.equal((await ag(A, '10.0.9.97', { type: 'gangOp', kind: 'hit', target: 'RuaB' })).body.error, 'BOT_GANG_NO');
  // dá para o que interessa: conversa, negócio e golpe em grupo
  assert.equal((await ag(A, '10.0.9.97', { type: 'gangChat', txt: 'boas' })).status, 200);
  assert.equal((await ag(A, '10.0.9.97', { type: 'gangBiz', k: 0, amount: 1000 })).status, 200);
  r = await ag(A, '10.0.9.97', { type: 'gangOp', kind: 'heist', k: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await ag(B, '10.0.9.98', { type: 'gangOpCancel' }); assert.equal(r.body.error, 'NO_RANK');   // aqui só cancela quem abriu
  r = await ag(A, '10.0.9.97', { type: 'gangOpCancel' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  // sem chefe nem cargos, ninguém podia cancelar um pedido esquecido: o bot cancela-o ao fim do tempo dele e a stamina volta
  r = await ag(A, '10.0.9.97', { type: 'gangOp', kind: 'heist', k: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.energy, 80);
  g = await gangue(B, '10.0.9.98'); assert.ok(g.mine.op.staleAt > g.now); assert.equal(g.mine.op.goAt, 0);
  await new Promise((ok) => setTimeout(ok, 1300));
  g = await gangue(A, '10.0.9.97'); assert.equal(g.mine.op, null); assert.equal(g.mine.last.cancelled, true); assert.equal(g.mine.last.stale, true); assert.equal((await A.estado()).energy, 100);
  const evRua = await (await fetch(BASE + '/api/events', { headers: { cookie: A.cookie, 'X-Forwarded-For': '10.0.9.97' } })).json();
  assert.equal(evRua.list[0].k, 'gop'); assert.equal(evRua.list[0].stale, true); assert.equal(evRua.list[0].cancelled, true);
  // os membros continuam a poder atacar-se
  const alvo = (await (await fetch(BASE + '/api/targets', { headers: { cookie: A.cookie, 'X-Forwarded-For': '10.0.9.97' } })).json()).list.find((x) => x.name === 'RuaB');
  assert.ok(alvo, 'o outro membro aparece nos alvos'); assert.equal(alvo.tag, 'BOT');
  r = await ag(A, '10.0.9.97', { type: 'attack', target: 'RuaB', mode: 'beat' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  // reinício: continua tudo lá
  await parar(); await arrancar();
  g = await gangue(B, '10.0.9.98'); assert.equal(g.mine.bot, true); assert.equal(g.mine.members, 2);
  // saem os dois: a gangue fica, vazia; quem saiu só volta ao fim de 24 h (a outra gangue qualquer é 1 h)
  r = await ag(A, '10.0.9.97', { type: 'gangLeave' }); assert.equal(r.status, 200); assert.equal(r.body.result.back >= 500, true);
  r = await ag(B, '10.0.9.98', { type: 'gangLeave' }); assert.equal(r.status, 200);
  g = await gangue(A, '10.0.9.97'); assert.equal(g.mine, null); assert.equal(g.bot.members, 0); assert.ok(g.bot.wait > g.now + 23 * 3600_000); assert.equal(g.list.length, 0);
  await mexer({ RuaA: (e) => { e.gangLeft = e.gangLeft - 2 * 3600_000; } });   // passou a hora de espera normal, mas não as 24 h
  assert.equal((await ag(A, '10.0.9.97', { type: 'gangJoin', id: 'rua' })).body.error, 'BOT_GANG_WAIT');
  await parar(); await arrancar();
  assert.equal((await gangue(A, '10.0.9.97')).bot.members, 0);
});

test('gangues: golpe em grupo e tareia em grupo — pedido sem prazo, alinhar e sair, última chamada, avançar já, contas certas, sobrevive a um reinício', async () => {
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
  // sozinho não dá, mas o pedido não tem prazo: fica aberto à espera de gente, o tempo que for preciso
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'heist', k: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.energy, 80);
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'heist', k: 0 }); assert.equal(r.body.error, 'OP_OPEN');
  r = await ag(A, ips.A, { type: 'gangOpJoin' }); assert.equal(r.body.error, 'IN_OP');
  let g = await gangue(B, ips.B); assert.deepEqual(g.mine.op.parts, ['GolpeA']); assert.equal(g.mine.op.need, 2); assert.equal(g.mine.op.joined, false); assert.ok(g.mine.op.chance > 0);
  assert.equal(g.mine.op.goAt, 0); assert.equal(g.mine.op.staleAt, 0); assert.equal(g.mine.op.mine, false); assert.equal(g.mine.op.mineToCancel, false); assert.equal(g.mine.op.canGo, false);
  await espera(1600);   // mais do dobro da última chamada destes testes (700 ms)
  g = await gangue(A, ips.A); assert.deepEqual(g.mine.op.parts, ['GolpeA'], 'o pedido continua aberto'); assert.equal(g.mine.op.goAt, 0); assert.equal(g.mine.op.mine, true); assert.equal(g.mine.op.mineToCancel, true);
  assert.equal(g.mine.last, null); assert.equal((await A.estado()).energy, 80);
  // quem não abriu nem tem cargo não cancela nem manda avançar; sem gente que chegue ninguém avança
  r = await ag(B, ips.B, { type: 'gangOpCancel' }); assert.equal(r.body.error, 'NO_RANK');
  r = await ag(B, ips.B, { type: 'gangOpGo' }); assert.equal(r.body.error, 'NO_RANK');
  r = await ag(A, ips.A, { type: 'gangOpGo' }); assert.equal(r.body.error, 'OP_NOT_READY');
  r = await ag(B, ips.B, { type: 'gangOpLeave' }); assert.equal(r.body.error, 'NOT_IN_OP');
  // cancelar devolve a stamina e fica escrito quem cancelou
  r = await ag(A, ips.A, { type: 'gangOpCancel' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.energy, 100);
  g = await gangue(B, ips.B); assert.equal(g.mine.op, null); assert.equal(g.mine.last.cancelled, true); assert.equal(g.mine.last.by, 'GolpeA');
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
    const H0 = CFG.gang.heists[0];
    if (L.success) { assert.ok(eu.money >= H0.min && eu.money <= Math.floor((H0.max * (10000 + CFG.gang.lootBpPer)) / 10000)); assert.equal(eu.money, L.parts[0].money); assert.equal(e.respect, 100 + H0.r); }
    else { assert.equal(eu.money, 0); assert.equal(e.respect, 100); assert.equal(eu.busted, e.jailUntil > 0); }
  }
  const ev = await (await fetch(BASE + '/api/events', { headers: { cookie: B.cookie, 'X-Forwarded-For': ips.B } })).json();
  assert.equal(ev.list[0].k, 'gop'); assert.equal(ev.list[0].ok, !!L.success);
  const feed = (await (await fetch(BASE + '/api/state', { headers: { cookie: V.cookie, 'X-Forwarded-For': ips.V } })).json()).feed;
  assert.ok(feed.some((n) => n.k === (L.success ? 'gangHeist' : 'gangHeistFail') && n.tag === 'GLP' && n.n === 3));
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'heist', k: 0 });
  assert.ok(['OP_WAIT', 'IN_JAIL'].includes(r.body.error), JSON.stringify(r.body));
  // um pedido aberto sobrevive a um reinício (com a última chamada a contar); cancelar devolve a stamina a quem alinhou e avisa-o
  const livres = (e) => { e.jailUntil = 0; e.hospUntil = 0; e.energy = 100; };
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000', GANG_OP_MS: '60000' };
  await mexer({ GolpeA: livres, GolpeB: livres, GolpeC: livres });
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'heist', k: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await ag(B, ips.B, { type: 'gangOpJoin' }); assert.equal(r.status, 200);
  await parar(); await arrancar();
  g = await gangue(C, ips.C); assert.deepEqual(g.mine.op.parts, ['GolpeA', 'GolpeB']); assert.ok(g.mine.op.goAt > g.now && g.mine.op.goAt <= g.now + 60_000, 'equipa completa: a última chamada está a contar');
  r = await ag(C, ips.C, { type: 'gangOpCancel' }); assert.equal(r.body.error, 'NO_RANK');
  r = await ag(A, ips.A, { type: 'gangOpCancel' }); assert.equal(r.status, 200); assert.equal(r.body.me.energy, 100);
  assert.equal((await B.estado()).energy, 100);
  g = await gangue(A, ips.A); assert.equal(g.mine.op, null);
  let evB = await (await fetch(BASE + '/api/events', { headers: { cookie: B.cookie, 'X-Forwarded-For': ips.B } })).json();
  assert.equal(evB.list[0].k, 'gop'); assert.equal(evB.list[0].cancelled, true); assert.equal(evB.list[0].by, 'GolpeA');
  // quem alinhou pode sair do pedido: a stamina volta e a última chamada pára, porque deixou de haver gente que chegue
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'heist', k: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await ag(B, ips.B, { type: 'gangOpJoin' }); assert.equal(r.body.me.energy, 80);
  g = await gangue(B, ips.B); assert.ok(g.mine.op.goAt > g.now); assert.equal(g.mine.op.canGo, false);
  r = await ag(B, ips.B, { type: 'gangOpLeave' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.energy, 100);
  g = await gangue(A, ips.A); assert.deepEqual(g.mine.op.parts, ['GolpeA']); assert.equal(g.mine.op.goAt, 0); assert.equal(g.mine.op.canGo, false);
  // equipa completa outra vez: quem abriu (ou quem tem cargo) manda avançar sem esperar pelo fim da última chamada
  r = await ag(B, ips.B, { type: 'gangOpJoin' }); assert.equal(r.status, 200);
  r = await ag(C, ips.C, { type: 'gangOpGo' }); assert.equal(r.body.error, 'NO_RANK');
  g = await gangue(A, ips.A); assert.equal(g.mine.op.canGo, true);
  r = await ag(A, ips.A, { type: 'gangOpGo' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  g = await gangue(A, ips.A); assert.equal(g.mine.op, null); assert.equal(g.mine.last.kind, 'heist'); assert.equal(g.mine.last.cancelled, undefined); assert.equal(g.mine.last.parts.length, 2);
  // sair da gangue com um pedido aberto já não fica preso: sai do pedido, a stamina volta e, sendo o único, o pedido fecha
  await mexer({ GolpeA: livres, GolpeB: livres, GolpeC: livres });
  r = await ag(C, ips.C, { type: 'gangOp', kind: 'heist', k: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await ag(C, ips.C, { type: 'gangLeave' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.energy, 100); assert.equal(r.body.me.gang, null);
  g = await gangue(A, ips.A); assert.equal(g.mine.op, null); assert.equal(g.mine.roster.length, 2);
  // tareia em grupo: precisa de dois; o alvo perde uma vez e vai para o hospital, ou vão os que atacaram
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000', GANG_OP_MS: '700' };
  await parar(); await arrancar();
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'hit', target: 'GolpeB' }); assert.equal(r.body.error, 'SAME_GANG');
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'hit', target: 'ninguem' }); assert.equal(r.body.error, 'NO_TARGET');
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'hit', target: 'golpev' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.vigor, CFG.vigor.max - CFG.pvp.energy, 'a tareia gasta energia');
  await espera(1600);
  g = await gangue(A, ips.A); assert.equal(g.mine.op.kind, 'hit', 'sozinho, a tareia fica à espera'); assert.equal(g.mine.op.goAt, 0); assert.equal(g.mine.op.hold, false); assert.equal((await A.estado()).vigor, CFG.vigor.max - CFG.pvp.energy);
  // o alvo vai parar ao hospital: o pedido não se perde, espera por ele (e entretanto ninguém alinha)
  await mexer({ GolpeV: (e) => { e.hospUntil = Date.now() + DESVIO + 3600_000; } });
  g = await gangue(B, ips.B); assert.equal(g.mine.op.hold, true); assert.equal(g.mine.op.target, 'GolpeV');
  r = await ag(B, ips.B, { type: 'gangOpJoin' }); assert.equal(r.body.error, 'TARGET_HOSPITAL');
  await mexer({ GolpeV: (e) => { e.hospUntil = 0; } });
  const antes = { A: (await A.estado()).respect, B: (await B.estado()).respect, V: (await V.estado()).respect };
  g = await gangue(B, ips.B); assert.equal(g.mine.op.hold, false); assert.deepEqual(g.mine.op.parts, ['GolpeA']);
  r = await ag(B, ips.B, { type: 'gangOpJoin' }); assert.equal(r.status, 200);
  g = await gangue(B, ips.B); if (g.mine.op) { assert.equal(g.mine.op.kind, 'hit'); assert.equal(g.mine.op.target, 'GolpeV'); assert.equal(g.mine.op.parts.length, 2); assert.ok(g.mine.op.goAt > 0); }
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
  // o alvo entra para a gangue com a tareia marcada: já não dá, fica sem efeito e a stamina volta
  const limpo = (e) => { e.jailUntil = 0; e.hospUntil = 0; e.protectUntil = 0; e.capUntil = 0; e.shieldUntil = 0; e.energy = 100; e.vigor = CFG.vigor.max; e.respect = 100; e.peakRespect = 100; };
  await mexer({ GolpeA: limpo, GolpeB: limpo, GolpeV: limpo });
  r = await ag(A, ips.A, { type: 'gangOp', kind: 'hit', target: 'GolpeV' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.vigor, CFG.vigor.max - CFG.pvp.energy);
  r = await ag(V, ips.V, { type: 'gangJoin', id: gid }); assert.equal(r.body.result.joined, true);
  g = await gangue(A, ips.A); assert.equal(g.mine.op, null); assert.equal(g.mine.last.cancelled, true); assert.equal(g.mine.last.gone, true); assert.equal((await A.estado()).vigor, CFG.vigor.max, 'a energia volta');
});

test('gangues: cargos — subchefe e capitães com as permissões certas, limites, sucessão da chefia e tudo gravado', async () => {
  const nomes = ['CargoA', 'CargoB', 'CargoC', 'CargoD', 'CargoE', 'CargoF'], ip = (i) => '10.0.9.' + (120 + i);
  const X = []; for (let i = 0; i < nomes.length; i++) { X.push(await contaNova(nomes[i], ip(i))); await X[i].estado(); }
  const forte = (e) => { e.cash = 1_000_000; e.respect = 100; e.peakRespect = 100; e.energy = 100; e.jailUntil = 0; e.hospUntil = 0; };
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000', GANG_OP_MS: '60000' };
  await mexer(Object.fromEntries(nomes.map((n) => [n, forte])));
  const ag = (i, body) => cru(X[i].cookie, ip(i), body), gangue = async (i) => (await fetch(BASE + '/api/gang', { headers: { cookie: X[i].cookie, 'X-Forwarded-For': ip(i) } })).json();
  const eventos = async (i) => (await (await fetch(BASE + '/api/events', { headers: { cookie: X[i].cookie, 'X-Forwarded-For': ip(i) } })).json()).list;
  const [A, B, C, D, E, F] = [0, 1, 2, 3, 4, 5];
  const cargos = (g) => Object.fromEntries(g.mine.roster.map((m) => [m.name, m.role]));
  let r = await ag(A, { type: 'gangCreate', name: 'Os Cargos', tag: 'CRG' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const gid = (await gangue(A)).mine.id;
  for (const i of [B, C, D, E]) { r = await ag(i, { type: 'gangJoin', id: gid }); assert.equal(r.body.result.joined, true); }
  let g = await gangue(A);
  assert.equal(g.mine.role, 3); assert.deepEqual(g.mine.can, { asks: true, ops: true, kick: true, roles: true }); assert.deepEqual(cargos(g), { CargoA: 3, CargoB: 0, CargoC: 0, CargoD: 0, CargoE: 0 });
  // só o chefe dá cargos; a ele próprio não; só os cargos que existem; 1 subchefe e 2 capitães
  r = await ag(B, { type: 'gangRole', name: 'CargoC', role: 1 }); assert.equal(r.body.error, 'NOT_LEADER');
  r = await ag(A, { type: 'gangRole', name: 'CargoA', role: 1 }); assert.equal(r.body.error, 'NO_TARGET');
  r = await ag(A, { type: 'gangRole', name: 'ninguem', role: 1 }); assert.equal(r.body.error, 'NO_TARGET');
  for (const role of [3, -1, 1.5, '2', null]) { r = await ag(A, { type: 'gangRole', name: 'CargoB', role }); assert.equal(r.body.error, 'BAD_ACTION', JSON.stringify(role)); }
  r = await ag(A, { type: 'gangRole', name: 'CargoD', role: 2 }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.result.role, 2);
  r = await ag(A, { type: 'gangRole', name: 'CargoB', role: 2 }); assert.equal(r.body.error, 'ROLE_FULL');
  r = await ag(A, { type: 'gangRole', name: 'CargoB', role: 1 }); assert.equal(r.status, 200);
  r = await ag(A, { type: 'gangRole', name: 'CargoC', role: 1 }); assert.equal(r.status, 200);
  r = await ag(A, { type: 'gangRole', name: 'CargoE', role: 1 }); assert.equal(r.body.error, 'ROLE_FULL');
  r = await ag(A, { type: 'gangRole', name: 'CargoC', role: 1 }); assert.equal(r.status, 200, 'repetir o cargo que já tem não conta para o limite');
  assert.deepEqual((await eventos(D))[0], { ...(await eventos(D))[0], k: 'gangRole', role: 2, gang: 'Os Cargos' });
  // os cargos ficam gravados
  await parar(); await arrancar();
  g = await gangue(D); assert.equal(g.mine.role, 2); assert.deepEqual(g.mine.can, { asks: true, ops: true, kick: true, roles: false }); assert.deepEqual(cargos(g), { CargoA: 3, CargoB: 1, CargoC: 1, CargoD: 2, CargoE: 0 });
  g = await gangue(B); assert.equal(g.mine.role, 1); assert.deepEqual(g.mine.can, { asks: true, ops: true, kick: false, roles: false });
  g = await gangue(E); assert.equal(g.mine.role, 0); assert.deepEqual(g.mine.can, { asks: false, ops: false, kick: false, roles: false });
  // dar ao cofre não mexe no cargo (a linha do membro é gravada outra vez)
  r = await ag(D, { type: 'gangDonate', amount: 1000 }); assert.equal(r.status, 200);
  await parar(); await arrancar();
  assert.equal((await gangue(D)).mine.role, 2);
  // pedidos de entrada: aceita o capitão; o membro nem os vê; o que continua a ser só do chefe continua
  r = await ag(A, { type: 'gangOpen', open: false }); assert.equal(r.body.result.open, false);
  r = await ag(F, { type: 'gangJoin', id: gid }); assert.equal(r.body.result.asked, true);
  assert.deepEqual((await gangue(E)).mine.asks, []); assert.deepEqual((await gangue(B)).mine.asks.map((x) => x.name), ['CargoF']);
  r = await ag(E, { type: 'gangAccept', name: 'CargoF' }); assert.equal(r.body.error, 'NO_RANK');
  r = await ag(B, { type: 'gangAccept', name: 'CargoF' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal((await X[F].estado()).gang.tag, 'CRG');
  for (const body of [{ type: 'gangOpen', open: true }, { type: 'gangUp', what: 'sede' }, { type: 'gangLeader', name: 'CargoB' }, { type: 'gangRole', name: 'CargoE', role: 1 }]) assert.equal((await ag(D, body)).body.error, 'NOT_LEADER', body.type);
  // expulsar: o capitão não pode; o subchefe pode, mas só quem está abaixo dele
  r = await ag(E, { type: 'gangOp', kind: 'heist', k: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await ag(F, { type: 'gangOpJoin' }); assert.equal(r.status, 200);
  g = await gangue(F); assert.equal(g.mine.op.by, 'CargoE'); assert.ok(g.mine.op.goAt > g.now);
  r = await ag(B, { type: 'gangKick', name: 'CargoE' }); assert.equal(r.body.error, 'NO_RANK');
  r = await ag(D, { type: 'gangKick', name: 'CargoA' }); assert.equal(r.body.error, 'NO_RANK');
  r = await ag(D, { type: 'gangKick', name: 'CargoD' }); assert.equal(r.body.error, 'NO_TARGET');
  // expulso com um pedido aberto por ele: sai do pedido com a stamina, e o pedido passa para quem alinhou a seguir
  r = await ag(D, { type: 'gangKick', name: 'CargoE' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const e = await X[E].estado(); assert.equal(e.gang, null); assert.equal(e.energy, 100); assert.equal((await eventos(E))[0].k, 'gangOut');
  g = await gangue(F); assert.deepEqual(g.mine.op.parts, ['CargoF']); assert.equal(g.mine.op.by, 'CargoF'); assert.equal(g.mine.op.mine, true); assert.equal(g.mine.op.goAt, 0);
  // cancelar um pedido que não é dele: o membro não pode, o capitão pode, e quem tinha alinhado fica a saber
  r = await ag(B, { type: 'gangOpJoin' }); assert.equal(r.status, 200);
  g = await gangue(C); assert.equal(g.mine.op.mineToCancel, true); assert.equal(g.mine.op.canGo, true); assert.equal(g.mine.op.mine, false);
  r = await ag(C, { type: 'gangOpCancel' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await X[F].estado()).energy, 100); assert.equal((await X[B].estado()).energy, 100);
  const evF = (await eventos(F))[0]; assert.equal(evF.k, 'gop'); assert.equal(evF.cancelled, true); assert.equal(evF.by, 'CargoC');
  // o capitão manda avançar um pedido que não abriu
  r = await ag(F, { type: 'gangOp', kind: 'heist', k: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await ag(A, { type: 'gangOpJoin' }); assert.equal(r.status, 200);
  r = await ag(C, { type: 'gangOpGo' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  g = await gangue(C); assert.equal(g.mine.op, null); assert.equal(g.mine.last.kind, 'heist'); assert.equal(g.mine.last.parts.length, 2);
  // o chefe sai: a chefia vai para o subchefe (D), não para o membro mais antigo (B); o cargo antigo dele fica livre
  await mexer({ CargoA: forte, CargoF: forte });
  r = await ag(A, { type: 'gangLeave' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  g = await gangue(D); assert.equal(g.mine.leaderMe, true); assert.equal(g.mine.role, 3); assert.deepEqual(cargos(g), { CargoB: 1, CargoC: 1, CargoD: 3, CargoF: 0 });
  assert.deepEqual((await eventos(D))[0], { ...(await eventos(D))[0], k: 'gangRole', role: 3 });
  r = await ag(D, { type: 'gangRole', name: 'CargoB', role: 2 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  // tirar um cargo, e passar a chefia: quem a recebe deixa o cargo que tinha, quem a passa fica como membro
  r = await ag(D, { type: 'gangRole', name: 'CargoB', role: 0 }); assert.equal(r.status, 200); assert.equal((await gangue(B)).mine.role, 0);
  r = await ag(D, { type: 'gangLeader', name: 'CargoC' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await ag(C, { type: 'gangRole', name: 'CargoD', role: 1 }); assert.equal(r.status, 200); r = await ag(C, { type: 'gangRole', name: 'CargoB', role: 1 }); assert.equal(r.status, 200, 'o lugar de capitão do novo chefe ficou livre');
  await parar(); await arrancar();
  g = await gangue(C); assert.equal(g.mine.leaderMe, true); assert.deepEqual(cargos(g), { CargoB: 1, CargoC: 3, CargoD: 1, CargoF: 0 });
});

test('bolsa: limites de venda — recusa limites do lado errado, guarda-os e vende sozinho no passo seguinte, com aviso', async () => {
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000' };
  const A = await contaNova('LimiteA', '10.0.9.110'); await A.estado();
  await mexer({ LimiteA: (e) => { e.cash = 100_000; e.bank = 0; e.respect = 3000; e.peakRespect = 3000; } });
  const ip = '10.0.9.110', ag = (body) => cru(A.cookie, ip, body), get = async (path) => (await fetch(BASE + path, { headers: { cookie: A.cookie, 'X-Forwarded-For': ip } })).json();
  const m = await get('/api/stocks'), k = 0, pr = m.prices[k];
  let r = await ag({ type: 'stockLimit', k, tp: pr + 100, sl: 0 }); assert.equal(r.body.error, 'NO_SHARES');
  r = await ag({ type: 'stockBuy', k, n: 20, price: pr }); assert.equal(r.status, 200, JSON.stringify(r.body)); const pago = r.body.result.paid;
  r = await ag({ type: 'stockLimit', k, tp: pr, sl: 0 }); assert.equal(r.body.error, 'BAD_LIMIT');
  r = await ag({ type: 'stockLimit', k, tp: 0, sl: pr }); assert.equal(r.body.error, 'BAD_LIMIT');
  for (const x of ['x', -1, 0.5, null, 1e13]) { r = await ag({ type: 'stockLimit', k, tp: x, sl: 0 }); assert.equal(r.body.error, 'BAD_AMOUNT'); }
  r = await ag({ type: 'stockLimit', k: 9, tp: pr * 2, sl: 0 }); assert.equal(r.body.error, 'NO_STOCK_CO');
  r = await ag({ type: 'stockLimit', k, tp: pr * 3, sl: Math.floor(pr / 3) }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.stk[k].tp, pr * 3); assert.equal(r.body.me.stk[k].sl, Math.floor(pr / 3)); assert.equal(r.body.me.cash, 100_000 - pago);
  // com o servidor parado: recua o mercado um passo e deixa o alvo abaixo de qualquer preço. No passo em falta, vende tudo ao preço desse passo.
  await parar();
  { const db = new DatabaseSync(join(dir, 'jogo.db'));
    const id = db.prepare('SELECT id FROM contas WHERE nome = ?').get('LimiteA').id, row = db.prepare('SELECT ronda, estado FROM jogadores WHERE conta = ?').get(id);
    const e = JSON.parse(row.estado); e.stk[k].tp = 1; delete e.stk[k].sl; db.prepare('UPDATE jogadores SET estado = ? WHERE conta = ? AND ronda = ?').run(JSON.stringify(e), id, row.ronda);
    const b = JSON.parse(db.prepare('SELECT dados FROM bolsa WHERE ronda = ?').get(row.ronda).dados); b.tick -= 1; b.hist.pop();
    db.prepare('UPDATE bolsa SET dados = ? WHERE ronda = ?').run(JSON.stringify(b), row.ronda); db.close(); }
  await arrancar();
  const depois = await A.estado(), m2 = await get('/api/stocks'), bruto = Math.floor((20 * m2.prices[k]) / 100), recebe = bruto - Math.min(bruto, Math.ceil(bruto / 100));
  assert.deepEqual(depois.stk[k], { n: 0, cost: 0, value: 0, tp: 0, sl: 0 }); assert.equal(depois.cash, 100_000 - pago + recebe);
  const ev = (await get('/api/events')).list.find((x) => x.k === 'stAuto');
  assert.ok(ev, 'ficou o aviso'); assert.equal(ev.why, 'tp'); assert.equal(ev.n, 20); assert.equal(ev.money, recebe); assert.equal(ev.profit, recebe - pago); assert.equal(ev.c, 'docas');
  // depois de reiniciar não volta a vender nem a pagar
  await mexer({}); assert.equal((await A.estado()).cash, 100_000 - pago + recebe);
});

test('contabilista: armazém de 24 h com a parte dele, só com o nível; já não há fábricas de droga', async () => {
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000' };
  const A = await contaNova('Fabrica', '10.0.9.111'); await A.estado();
  const ip = '10.0.9.111', ag = (body) => cru(A.cookie, ip, body), cfg = await (await fetch(BASE + '/api/config')).json();
  const iLav = cfg.biz.findIndex((x) => x.id === 'lavandaria');
  assert.ok(cfg.biz.every((x) => x.drug === -1)); assert.deepEqual(cfg.accountant, { price: 25000, minLevel: 2, capMult: 3, feeBp: 1000 });   // o nível 3 das rondas (10 de respeito) é o 2 dos 100
  let r = await ag({ type: 'acct' }); assert.equal(r.body.error, 'LOW_LEVEL');
  r = await ag({ type: 'bizGoods', i: iLav, on: true }); assert.equal(r.body.error, 'NO_BIZ');
  await mexer({ Fabrica: (e) => { e.cash = 1_000_000; e.bank = 0; e.respect = 3000; e.peakRespect = 3000; } });
  r = await ag({ type: 'buyBiz', i: iLav }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.cash, 1_000_000 - cfg.biz[iLav].price);
  r = await ag({ type: 'bizGoods', i: iLav, on: true }); assert.equal(r.body.error, 'NO_BIZ');
  r = await ag({ type: 'acct' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.acct, true); const c1 = r.body.me.cash, b1 = r.body.me.bank;
  r = await ag({ type: 'acct' }); assert.equal(r.body.error, 'ACCT_HAVE'); assert.equal((await A.estado()).cash, c1);
  // 20 h depois (recuando o relógio do negócio): há 20 h guardadas e a parte dele é 10% das 12 h a mais; a lavandaria paga para o banco
  await mexer({ Fabrica: (e) => { e.biz[iLav].t -= 20 * 3600_000; e.biz[iLav].stored = 0; e.biz[iLav].rem = 0; } });
  const me = await A.estado(), perH = me.biz[iLav].perH, guardado = me.biz[iLav].stored, taxa = me.biz[iLav].fee;
  assert.ok(guardado >= perH * 20 && guardado <= perH * 20 + perH, 'guardado ' + guardado); assert.equal(taxa, Math.floor(((guardado - perH * 8) * 1000) / 10000));
  r = await ag({ type: 'collect' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const it = r.body.result.items.find((x) => x.biz === 'lavandaria');
  assert.equal(it.fee, taxa); assert.equal(it.money, guardado - taxa); assert.equal(r.body.me.bank, b1 + it.money); assert.equal(r.body.me.cash, c1);
});

test('registo: o email é obrigatório, tem de ter forma de email, é um por conta e nunca sai em resposta nenhuma', async () => {
  const a = cliente('10.0.9.130'), b = cliente('10.0.9.131');
  const reg = (c, name, email) => c('POST', '/api/register', { name, password: 'segredo123', ...(email === undefined ? {} : { email }) });
  assert.equal((await reg(a, 'SemMail')).body.error, 'BAD_EMAIL');
  // (cada tentativa vem de um IP diferente, para não bater no limite de 5 registos por hora)
  const maus = ['', 'semarroba', 'a@b', '@b.pt', 'a b@c.pt', 'a@b..pt', 'a@.pt', 12345, null, { x: 1 }, 'a@' + 'b'.repeat(260) + '.pt'];
  for (let i = 0; i < maus.length; i++) assert.equal((await reg(cliente('10.0.11.' + (i + 1)), 'SemMail', maus[i])).body.error, 'BAD_EMAIL', JSON.stringify(maus[i]));
  const r = await reg(a, 'ComMail', '  Joana.Silva@Exemplo.PT ');
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.deepEqual(r.body, { ok: true, name: 'ComMail' });
  // o mesmo email, com outras maiúsculas e noutra conta: recusado; o nome repetido continua a dar o erro do nome
  assert.equal((await reg(b, 'OutraConta', 'joana.silva@exemplo.pt')).body.error, 'EMAIL_TAKEN');
  assert.equal((await reg(b, 'commail', 'outra@exemplo.pt')).body.error, 'NAME_TAKEN');
  assert.equal((await reg(b, 'OutraConta', 'outra@exemplo.pt')).status, 200);
  // guardado em minúsculas e sem espaços; nunca aparece no estado, no ranking, nos alvos, nas notícias nem no login
  await parar();
  { const db = new DatabaseSync(join(dir, 'jogo.db')); assert.equal(db.prepare('SELECT email FROM contas WHERE nome = ?').get('ComMail').email, 'joana.silva@exemplo.pt'); db.close(); }
  await arrancar();
  const l = await a('POST', '/api/login', { name: 'ComMail', password: 'segredo123' }); assert.deepEqual(l.body, { ok: true, name: 'ComMail', lang: 'en' });
  for (const path of ['/api/state', '/api/rank', '/api/targets', '/api/hitman', '/api/news', '/api/gang', '/api/events', '/api/config']) {
    const x = await a('GET', path); assert.ok(!JSON.stringify(x.body).toLowerCase().includes('exemplo.pt'), path + ' mostra o email');
  }
});

test('jogadores antigos: um estado guardado antes da bolsa, da stash e do contabilista não trava o jogo de ninguém quando o mercado avança', async () => {
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000' };
  const velho = await contaNova('Antigo', '10.0.9.132'), novo = await contaNova('Recente', '10.0.9.133'); await velho.estado(); await novo.estado();
  // com o servidor parado: o Antigo fica como se não entrasse desde antes destas novidades, e o mercado recua 3 passos (como depois de horas sem ninguém)
  await parar();
  { const db = new DatabaseSync(join(dir, 'jogo.db'));
    const id = db.prepare('SELECT id FROM contas WHERE nome = ?').get('Antigo').id, row = db.prepare('SELECT ronda, estado FROM jogadores WHERE conta = ?').get(id);
    const e = JSON.parse(row.estado); for (const k of ['stk', 'stock', 'acct', 'club', 'bro', 'guard', 'hmT', 'gbotLeft', 'fx', 'hkN', 'hkAt']) delete e[k];
    db.prepare('UPDATE jogadores SET estado = ? WHERE conta = ? AND ronda = ?').run(JSON.stringify(e), id, row.ronda);
    const b = JSON.parse(db.prepare('SELECT dados FROM bolsa WHERE ronda = ?').get(row.ronda).dados); assert.ok(b.tick >= 3); b.tick -= 3; b.hist.splice(-3);
    db.prepare('UPDATE bolsa SET dados = ? WHERE ronda = ?').run(JSON.stringify(b), row.ronda); db.close(); }
  await arrancar();
  // o primeiro pedido de outro jogador faz o mercado apanhar os 3 passos: tem de responder à primeira, sem erro
  const ip = '10.0.9.133', r1 = await fetch(BASE + '/api/state', { headers: { cookie: novo.cookie, 'X-Forwarded-For': ip } });
  assert.equal(r1.status, 200); const m = await (await fetch(BASE + '/api/stocks', { headers: { cookie: novo.cookie, 'X-Forwarded-For': ip } })).json();
  assert.ok(m.tick >= 3 && Array.isArray(m.prices), 'mercado em dia');
  // e o Antigo entra e joga normalmente, já com os campos novos
  const ra = await fetch(BASE + '/api/state', { headers: { cookie: velho.cookie, 'X-Forwarded-For': '10.0.9.132' } }); assert.equal(ra.status, 200);
  const me = (await ra.json()).me; assert.equal(me.acct, false); assert.ok(Array.isArray(me.stock) && me.stock.every((x) => x === 0)); assert.ok(me.stk.every((h) => h.n === 0 && h.tp === 0));
  const login = await cliente('10.0.9.134')('POST', '/api/login', { name: 'Antigo', password: 'segredo123' }); assert.equal(login.status, 200);
});

test('porto e stash por API: escolhe-se o barco (com nível, droga e risco próprios) e uma droga guardada deixa de aparecer e de se vender aos outros', async () => {
  ENV_EXTRA = { ATOS_3S: '100000', ATOS_MIN: '1000000' };
  const A = await contaNova('Armador', '10.0.9.140'), X = await contaNova('Freguesa', '10.0.9.141'); await A.estado(); await X.estado();
  const ag = (x, ip, body) => cru(x.cookie, ip, body), get = async (x, ip, path) => (await fetch(BASE + path, { headers: { cookie: x.cookie, 'X-Forwarded-For': ip } })).json();
  const cfg = await (await fetch(BASE + '/api/config')).json(), S = cfg.port.ships;
  assert.deepEqual(S.map((s) => s.id), ['pesca', 'lancha', 'ferry', 'contentor', 'cargueiro', 'submarino']); assert.ok(S.every((s) => s.drug >= 0 && cfg.drugs[s.drug]));
  let a = await A.estado(); assert.deepEqual(a.portRisk, S.map((s) => s.seizeBp)); assert.equal(a.level, 1); assert.deepEqual(a.hold, []);
  let r = await ag(A, '10.0.9.140', { type: 'port', k: 3, amount: 500 }); assert.equal(r.body.error, 'LOW_LEVEL'); assert.equal(r.body.need, 8);   // o nível 7 das rondas (350 de respeito) é o 8 dos 100
  for (const k of [-1, 6, 'a', 0.5, null]) { r = await ag(A, '10.0.9.140', { type: 'port', k, amount: 500 }); assert.equal(r.body.error, 'NO_SHIP', JSON.stringify(k)); }
  const c0 = (await A.estado()).cash + (await A.estado()).bank;
  await mexer({ Armador: (e) => { e.cash = 10_000; e.bank = 0; } });
  r = await ag(A, '10.0.9.140', { type: 'port', k: 0, amount: 500, goods: false }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.cash, 9500); assert.equal(r.body.me.port.length, 1); assert.equal(r.body.me.port[0].k, 0); assert.equal(r.body.me.port[0].readyAt - r.body.now, S[0].ms); assert.equal(r.body.result.k, 0);
  r = await ag(A, '10.0.9.140', { type: 'port', k: 0, amount: 500 }); assert.equal(r.body.error, 'NO_SLOT');
  // chegou (recuando a hora de chegada): paga +12% ou é apreendido, nunca outra coisa
  await mexer({ Armador: (e) => { e.port[0].readyAt = e.t - 1; } });
  r = await ag(A, '10.0.9.140', { type: 'collect' }); assert.equal(r.status, 200); const it = r.body.result.port[0];
  assert.equal(it.k, 0); assert.equal(it.amount, 500); assert.ok(it.seized ? it.got === 0 && r.body.me.cash === 9500 : it.got === 560 && r.body.me.cash === 9500 + 560, JSON.stringify(it));
  // abrir um contentor de cada vez (a animação do porto): só o que já chegou, identificado pela hora de chegada; os outros ficam como estavam
  // os barcos descarregam no país onde se vive (países, 16/11/2026): em droga, entra no armazém de casa
  await mexer({ Armador: (e) => { e.cash = 10_000; e.bank = 0; e.respect = 50_000; e.peakRespect = 50_000; e.port = []; e.stock = CFG.drugs.map(() => 0); } });
  r = await ag(A, '10.0.9.140', { type: 'port', k: 0, amount: 500 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await ag(A, '10.0.9.140', { type: 'port', k: 1, amount: 800, goods: true }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.port.length, 2); assert.equal(r.body.me.cash, 8700);
  r = await ag(A, '10.0.9.140', { type: 'portOpen', at: r.body.me.port[0].readyAt }); assert.equal(r.body.error, 'SHIP_AT_SEA');
  for (const at of [0, 'x', null, 1.5, undefined]) { r = await ag(A, '10.0.9.140', { type: 'portOpen', at }); assert.equal(r.body.error, 'NO_CARGO', JSON.stringify(at)); }
  await mexer({ Armador: (e) => { e.port[0].readyAt = e.t - 2; e.port[1].readyAt = e.t - 1; } });
  a = await A.estado(); assert.equal(a.port.length, 2); const [at0, at1] = a.port.map((c) => c.readyAt);
  // «receber» dos negócios com port:false não toca nos contentores (o jogo novo pede assim, para a abertura ficar para o porto)
  r = await ag(A, '10.0.9.140', { type: 'collect', port: false }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.deepEqual(r.body.result.port, []); assert.equal(r.body.me.port.length, 2); assert.equal(r.body.me.cash, 8700);
  r = await ag(A, '10.0.9.140', { type: 'portOpen', at: at1 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  let o = r.body.result; assert.equal(o.left, 1); assert.equal(o.item.k, 1); assert.equal(o.item.amount, 800);
  assert.ok(o.item.seized ? o.item.got === 0 && r.body.me.cash === 8700 : o.item.got === 864 && o.item.units > 0 && r.body.me.cash === 8700 + o.item.rest && r.body.me.stock[o.item.d] === o.item.units && o.item.rg === 'lx', JSON.stringify(o));
  assert.equal(r.body.me.port.length, 1); assert.equal(r.body.me.port[0].k, 0);
  r = await ag(A, '10.0.9.140', { type: 'portOpen', at: at1 }); assert.equal(r.body.error, 'NO_CARGO', 'o mesmo contentor não se abre duas vezes');
  const antesAbrir = (await A.estado()).cash;
  r = await ag(A, '10.0.9.140', { type: 'portOpen', at: at0 }); assert.equal(r.status, 200, JSON.stringify(r.body)); o = r.body.result;
  assert.equal(o.left, 0); assert.equal(o.item.k, 0); assert.ok(o.item.seized ? r.body.me.cash === antesAbrir : o.item.got === 560 && r.body.me.cash === antesAbrir + 560, JSON.stringify(o)); assert.equal(r.body.me.port.length, 0);
  // o «receber» de sempre (sem port:false) continua a descarregar tudo, para quem ainda tem o jogo antigo aberto
  r = await ag(A, '10.0.9.140', { type: 'port', k: 0, amount: 500 }); assert.equal(r.status, 200);
  await mexer({ Armador: (e) => { e.port[0].readyAt = e.t - 1; } });
  r = await ag(A, '10.0.9.140', { type: 'collect' }); assert.equal(r.body.result.port.length, 1); assert.equal(r.body.me.port.length, 0);
  await mexer({ Armador: (e) => { e.stock = e.stock.map(() => 0); } });   // o haxixe que veio no contentor não entra nas contas da stash, mais abaixo
  // stash: o Armador tem discoteca com erva e coca; a Freguesa vê as duas no menu
  const COCA = cfg.drugs.findIndex((d) => d.id === 'coca'), ERVA = cfg.drugs.findIndex((d) => d.id === 'erva');
  await mexer({ Armador: (e) => { e.club = { lvl: 1, till: 0, t: e.t, rem: 0, pi: 2, gd: 0 }; e.stock[COCA] = 30; e.stock[ERVA] = 5000; }, Freguesa: (e) => { e.cash = 100_000; e.energy = 0; } });
  let v = await get(X, '10.0.9.141', '/api/venues'); assert.deepEqual(v.clubs[0].items.map((x) => x.d).sort((p, q) => p - q), [ERVA, COCA].sort((p, q) => p - q));
  for (const d of [-1, 99, 'x']) { r = await ag(A, '10.0.9.140', { type: 'stockHold', d, on: true }); assert.equal(r.body.error, 'NO_DRUG'); }
  r = await ag(A, '10.0.9.140', { type: 'stockHold', d: COCA, on: true }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.deepEqual(r.body.me.hold, [COCA]); assert.equal(r.body.me.stock[COCA], 30);
  v = await get(X, '10.0.9.141', '/api/venues'); assert.deepEqual(v.clubs[0].items.map((x) => x.d), [ERVA], 'a coca guardada não aparece a mais ninguém');
  r = await ag(X, '10.0.9.141', { type: 'clubBuy', owner: 'Armador', d: COCA }); assert.equal(r.body.error, 'NO_STOCK'); assert.equal((await A.estado()).stock[COCA], 30);
  r = await ag(X, '10.0.9.141', { type: 'clubBuy', owner: 'Armador', d: ERVA }); assert.equal(r.status, 200, JSON.stringify(r.body));
  // sobrevive a um reinício e volta à venda quando o dono quiser
  await mexer({}); assert.deepEqual((await A.estado()).hold, [COCA]);
  r = await ag(A, '10.0.9.140', { type: 'stockHold', d: COCA, on: false }); assert.deepEqual(r.body.me.hold, []);
  v = await get(X, '10.0.9.141', '/api/venues'); assert.ok(v.clubs[0].items.some((x) => x.d === COCA));
  void c0;
});
