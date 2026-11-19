// v112 (pedido do Dinis: corridas de carros, à maneira do Torn). Arranca o servidor numa pasta temporária e joga por pedidos HTTP:
// a garagem (comprar, afinar, escolher, vender), a corrida de rua (pilotos da rua, prémio, energia, perícia, histórico com as voltas)
// e as corridas a dinheiro (classe do carro, sala cheia arranca, pote menos a casa, prazo sem gente devolve tudo, desistir).
// Corre com: node --test dev/corridas112.test.mjs   (dentro de crime/)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CFG } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';

const AQUI = dirname(fileURLToPath(import.meta.url)), TESTE = join(AQUI, '..', 'test');
const PORT = 4500 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
const R = CFG.race;
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
async function mexer(jog = {}, sql = []) {
  await parar();
  const db = new DatabaseSync(join(dir, 'jogo.db'));
  for (const [nome, fn] of Object.entries(jog)) {
    const id = db.prepare('SELECT id FROM contas WHERE nome = ?').get(nome).id, row = db.prepare('SELECT ronda, estado FROM jogadores WHERE conta = ?').get(id);
    const e = JSON.parse(row.estado); fn(e); db.prepare('UPDATE jogadores SET estado = ? WHERE conta = ? AND ronda = ?').run(JSON.stringify(e), id, row.ronda);
  }
  for (const s of sql) db.exec(s);
  db.close(); await arrancar();
}
const caixa = () => { const db = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true }); const r = db.prepare("SELECT SUM(entra) e, SUM(sai) s FROM caixa WHERE fonte = 'corridas'").get(); db.close(); return { e: r.e || 0, s: r.s || 0 }; };
let ipN = 0;
async function conta(nome) {
  const ip = '10.10.0.' + ++ipN;
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@teste.pt' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const get = async (p) => (await fetch(BASE + p, { headers: { cookie, 'X-Forwarded-For': ip } })).json();
  const ag = async (body) => { const x = await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: JSON.stringify(body) }); return { status: x.status, body: await x.json() }; };
  await get('/api/state');
  return { nome, ag, get, races: () => get('/api/races'), me: async () => (await get('/api/state')).me, events: async () => (await get('/api/events')).list };
}
before(async () => { dir = mkdtempSync(join(tmpdir(), 'corridas-')); await arrancar(); });
after(async () => { await parar(); rmSync(dir, { recursive: true, force: true }); });
const rico = (e) => { e.cash = 3_000_000; e.bank = 0; e.respect = 60_000; e.peakRespect = 60_000; e.vigor = 100; e.shieldUntil = 0; };
let A, B, C;

test('a corrida em si: mais carro e mais perícia ganham mais vezes, com acaso; despistes', () => {
  const rng = seededRng(3), base = { spd: 40, acc: 46, han: 50, sk: 0 }, forte = { spd: 46, acc: 52, han: 56, sk: CFG.skills.maxBp };
  let w = 0;
  for (let k = 0; k < 400; k++) { const r = E.raceSim([forte, base, base, base], k % R.tracks.length, rng); if (r[0].i === 0) w++; assert.equal(r.length, 4); assert.equal(r[0].laps.length, R.laps); assert.ok(r[0].total <= r[1].total); }
  assert.ok(w > 200 && w < 400, 'o forte ganha a maioria, mas não todas: ' + w);
});

test('garagem: comprar, afinar até ao máximo, escolher, vender', async () => {
  [A, B, C] = await Promise.all(['Ana', 'Bea', 'Caio'].map(conta));
  await mexer({ Ana: rico, Bea: rico, Caio: (e) => { e.cash = 1000; e.vigor = 100; } });
  let r = await A.ag({ type: 'raceStreet', track: 0 }); assert.equal(r.body.error, 'NO_CAR');
  r = await C.ag({ type: 'carBuy', id: 'clio' }); assert.equal(r.body.error, 'NO_MONEY');
  r = await A.ag({ type: 'carBuy', id: 'xpto' }); assert.equal(r.body.error, 'NO_CAR');
  const m0 = (await A.me()).cash;
  r = await A.ag({ type: 'carBuy', id: 'clio' }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.me.cash, m0 - R.cars[0].price); assert.deepEqual(r.body.me.cars, [{ id: 'clio', up: [0, 0, 0] }]); assert.equal(r.body.me.car, 0);
  r = await A.ag({ type: 'carBuy', id: 'clio' }); assert.equal(r.body.error, 'HAVE_IT');
  for (let lv = 0; lv < R.upBp.length; lv++) { r = await A.ag({ type: 'carUp', i: 0, part: 0 }); assert.equal(r.status, 200); assert.equal(r.body.result.cost, E.carUpCost('clio', lv)); }
  r = await A.ag({ type: 'carUp', i: 0, part: 0 }); assert.equal(r.body.error, 'CAR_UP_MAX');
  r = await A.ag({ type: 'carUp', i: 0, part: 7 }); assert.equal(r.body.error, 'BAD_PART');
  r = await A.ag({ type: 'carBuy', id: 'golf' }); assert.equal(r.body.me.car, 1);
  r = await A.ag({ type: 'carSel', i: 0 }); assert.equal(r.body.me.car, 0);
  const b0 = r.body.me.bank, val = E.carValue({ id: 'golf', up: [0, 0, 0] });
  r = await A.ag({ type: 'carSell', i: 1 }); assert.equal(r.status, 200); assert.equal(r.body.me.bank, b0 + Math.floor((val * R.sellBp) / 10000)); assert.equal(r.body.me.cars.length, 1); assert.equal(r.body.me.car, 0);
});

test('corrida de rua: pilotos da rua da mesma classe, energia, prémio, perícia e a repetição no histórico', async () => {
  const me0 = await A.me(), sk0 = me0.rsk;
  const r = await A.ag({ type: 'raceStreet', track: 2 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  const x = r.body.result;
  assert.ok(x.n >= 1 + R.botsMin && x.n <= 1 + R.botsMax); assert.equal(x.drivers.length, x.n);
  assert.equal(x.drivers.filter((d) => d.me).length, 1); assert.ok(x.drivers.filter((d) => d.bot).every((d) => E.carOf(d.car).tier === 1), 'pilotos da rua da mesma classe');
  assert.equal(x.drivers.find((d) => d.me).name, 'Ana');
  const prize = x.pos <= 3 ? Math.floor((R.street[1] * [10000, 5000, 2500][x.pos - 1]) / 10000) : 0;
  assert.equal(x.prize, prize); assert.equal(r.body.me.vigor, me0.vigor - R.vigor); assert.equal(r.body.me.rcn.n, 1);
  assert.ok(r.body.me.rsk >= sk0, 'a perícia de condução não desce');
  const v = await A.races(); assert.equal(v.mine.length, 1); assert.equal(v.mine[0].kind, 's'); assert.equal(v.mine[0].pos, x.pos); assert.equal(v.mine[0].drivers.length, x.n);
  assert.ok(v.mine[0].drivers.every((d) => d.laps.length === R.laps)); assert.ok(v.mine[0].drivers.some((d) => d.me));
  assert.equal(caixa().e, prize, 'o prémio da rua entra no jogo e conta no caixa');
  r.body = (await A.ag({ type: 'raceStreet', track: 99 })).body; assert.equal(r.body.error, 'NO_TRACK');
});

test('corrida a dinheiro: a classe, a sala cheia arranca, o pote menos a casa vai ao primeiro', async () => {
  await mexer({ Ana: (e) => { e.vigor = 100; }, Bea: (e) => { e.vigor = 100; } });
  let r = await A.ag({ type: 'raceCreate', track: 0, fee: 1000, max: 2 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  const id = r.body.result.id;
  r = await A.ag({ type: 'carSell', i: 0 }); assert.equal(r.body.error, 'IN_RACE');
  r = await B.ag({ type: 'carBuy', id: 'golf' }); assert.equal(r.status, 200);
  r = await B.ag({ type: 'raceJoin', id }); assert.equal(r.body.error, 'RACE_TIER');
  r = await B.ag({ type: 'carBuy', id: 'clio' }); assert.equal(r.status, 200);
  let v = await B.races(); assert.equal(v.open.length, 1); assert.equal(v.open[0].n, 1); assert.equal(v.open[0].tier, 1);
  const a0 = (await A.me()).bank, b0 = (await B.me()).bank;
  const c0 = caixa();
  r = await B.ag({ type: 'raceJoin', id }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  await new Promise((x) => setTimeout(x, 1500));
  v = await A.races(); assert.equal(v.open.length, 0);
  const res = v.mine.find((x) => x.id === id); assert.ok(res); assert.equal(res.kind, 'p'); assert.equal(res.drivers.length, 2);
  const pote = Math.floor((1000 * 2 * (10000 - R.houseBp)) / 10000), win = res.drivers.find((d) => d.pos === 1);
  assert.equal(win.prize, pote); assert.equal(res.drivers.find((d) => d.pos === 2).prize, 0);
  const ganhou = win.name === 'Ana' ? A : B, bank = win.name === 'Ana' ? a0 : b0;
  assert.equal((await ganhou.me()).bank, bank + pote);
  assert.ok((await A.events()).some((e) => e.k === 'race' && e.id === id && e.n === 2));
  assert.equal(caixa().s - c0.s, 2000 - pote, 'a casa fica com 10% (sai do jogo)');
});

test('sem gente: ao fim do prazo devolve a inscrição e a energia; desistir também devolve', async () => {
  await mexer({ Ana: (e) => { e.vigor = 100; }, Bea: (e) => { e.vigor = 100; } });
  const m0 = await A.me();
  let r = await A.ag({ type: 'raceCreate', track: 1, fee: 10_000, max: 4 }); assert.equal(r.status, 200);
  const id = r.body.result.id; assert.equal(r.body.me.vigor, m0.vigor - R.vigor);
  r = await B.ag({ type: 'raceJoin', id }); assert.equal(r.status, 200);
  const bb = (await B.me()).bank;
  r = await B.ag({ type: 'raceLeave' }); assert.equal(r.status, 200); assert.equal(r.body.me.bank, bb + 10_000);
  await mexer({}, [`UPDATE corridas SET prazo = prazo - ${R.waitMs + 1000} WHERE estado = 'open'`]);
  await new Promise((x) => setTimeout(x, 1500));
  const me = await A.me(); assert.equal(me.cash + me.bank, m0.cash + m0.bank, 'a inscrição volta (para o banco)');
  assert.ok(me.vigor >= m0.vigor, 'a energia volta');
  assert.ok((await A.events()).some((e) => e.k === 'raceOff' && e.id === id && e.fee === 10_000));
  const v = await A.races(); assert.equal(v.open.length, 0); assert.equal(v.mine.find((x) => x.id === id).state, 'cancel');
});
