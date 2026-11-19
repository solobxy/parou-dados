// v120: a estufa. Erva feita à mão num armazém: comprar sementes, plantar num vaso, podar a meio (as folhas amarelas) e colher
// quando está madura. A colheita entra no armazém como a erva comprada (com o calor que isso dá). No motor: as regras de cada passo;
// na API: as quatro ações e o que o ecrã recebe. Corre com: node --test dev/estufa120.test.mjs
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

const G = CFG.grow, ERVA = CFG.drugs.findIndex((d) => d.id === G.drug);
const START = lisbonToUtc(2026, 11, 20, 23);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const mk = (resp = 5000) => { const p = E.newPlayer('g' + Math.random(), START, world); p.cash = 1e5; p.respect = resp; p.peakRespect = resp; return p; };
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
const meio = { int: (a, b) => Math.round((a + b) / 2), chance: () => true }, alto = { int: (a, b) => b, chance: () => true };

test('sementes: custam o preço da config, há um máximo e pedem o nível', () => {
  const p = mk(), c0 = p.cash;
  const r = E.seedBuy(p, START, world, 5);
  assert.equal(p.seeds, 5); assert.equal(r.cost, 5 * G.seed); assert.equal(p.cash, c0 - 5 * G.seed);
  erro(() => E.seedBuy(p, START, world, 0), 'BAD_AMOUNT');
  erro(() => E.seedBuy(p, START, world, G.seedsMax), 'SEEDS_FULL');
  const pobre = mk(); pobre.cash = G.seed - 1; erro(() => E.seedBuy(pobre, START, world, 1), 'NO_MONEY');
  const novo = mk(0); erro(() => E.seedBuy(novo, START, world, 1), 'LOW_LEVEL');
  assert.deepEqual(E.checkInvariants(p), []);
});

test('vasos: o número cresce com o espaço do armazém; sem armazém não há estufa', () => {
  const p = mk();
  assert.equal(E.growPots(p, 'lx').length, G.pots[0]);
  p.wh.lx.sp = 3; assert.equal(E.growPots(p, 'lx').length, G.pots[2]);
  const semWh = Object.keys(p.wh).find((r) => !p.wh[r]);
  if (semWh) { p.seeds = 1; erro(() => E.growPlant(p, START, world, semWh, 0), 'NO_WH'); }
  p.seeds = 1; erro(() => E.growPlant(p, START, world, 'lx', 99), 'NO_POT');
  erro(() => E.growPlant(p, START, world, 'xx', 0), 'NO_REGION');
});

test('plantar, podar na janela, colher madura: a poda dá mais; a erva entra no armazém', () => {
  const p = mk(); E.seedBuy(p, START, world, 2);
  E.growPlant(p, START, world, 'lx', 0);
  assert.equal(p.seeds, 1);
  erro(() => E.growPlant(p, START, world, 'lx', 0), 'POT_BUSY');
  erro(() => E.growPrune(p, START + 1, world, 'lx', 0), 'NOT_PRUNE_TIME');        // cedo demais
  erro(() => E.growHarvest(p, START + 1, world, 'lx', 0, meio), 'NOT_READY');
  erro(() => E.growPrune(p, START + 1, world, 'lx', 1), 'POT_EMPTY');
  const tPoda = START + Math.ceil((G.ms * G.pruneFrom) / 10000);
  E.growPrune(p, tPoda, world, 'lx', 0);
  erro(() => E.growPrune(p, tPoda + 1, world, 'lx', 0), 'PRUNED');
  const s0 = p.stock[ERVA];
  const r = E.growHarvest(p, START + G.ms, world, 'lx', 0, meio);
  assert.equal(r.grams, Math.floor((G.yield * (10000 + G.pruneBp)) / 10000), 'podada: +25%');
  assert.equal(p.stock[ERVA], s0 + r.grams); assert.equal(E.growPots(p, 'lx')[0], null);
  // sem poda: a colheita base; tarde demais para podar
  E.growPlant(p, START + G.ms, world, 'lx', 1);
  erro(() => E.growPrune(p, START + G.ms + G.ms - 1, world, 'lx', 1), 'NOT_PRUNE_TIME');
  const r2 = E.growHarvest(p, START + 2 * G.ms, world, 'lx', 1, meio);
  assert.equal(r2.grams, G.yield); assert.equal(r2.pruned, false);
  // a sorte mexe no máximo ±10%
  E.seedBuy(p, START + 2 * G.ms, world, 1); E.growPlant(p, START + 2 * G.ms, world, 'lx', 2);
  const r3 = E.growHarvest(p, START + 3 * G.ms, world, 'lx', 2, alto);
  assert.equal(r3.grams, Math.floor((G.yield * (10000 + G.yieldVarBp)) / 10000));
  erro(() => E.growPlant(p, START + 3 * G.ms, world, 'lx', 0), 'NO_SEEDS');
  assert.equal(p.c.harv, 3);
  assert.deepEqual(E.checkInvariants(p), []);
});

test('armazém cheio: não se colhe e a planta fica à espera', () => {
  const p = mk(); E.seedBuy(p, START, world, 1); E.growPlant(p, START, world, 'lx', 0);
  p.stock[ERVA] += E.whFree(p, 'lx');
  erro(() => E.growHarvest(p, START + G.ms, world, 'lx', 0, meio), 'WH_FULL');
  assert.ok(E.growPots(p, 'lx')[0], 'a planta continua lá');
});

test('preso também colhe? não: as mãos estão na cela (begin sem jailOk)', () => {
  const p = mk(); E.seedBuy(p, START, world, 1); E.growPlant(p, START, world, 'lx', 0);
  p.jailUntil = START + G.ms + T.HOUR; p.jailTier = 1;
  assert.throws(() => E.growHarvest(p, START + G.ms, world, 'lx', 0, meio));
});

// ---------- na API ----------
const AQUI = dirname(fileURLToPath(import.meta.url)), TESTE = join(AQUI, '..', 'test');
const PORT = 5200 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
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
  const ip = '10.17.0.' + ++ipN;
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@teste.pt' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const get = async (p) => (await fetch(BASE + p, { headers: { cookie, 'X-Forwarded-For': ip } })).json();
  const ag = async (body) => { const x = await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: JSON.stringify(body) }); return { status: x.status, body: await x.json() }; };
  await get('/api/state');
  return { nome, ag, get, me: async () => (await get('/api/state')).me };
}
before(async () => { dir = mkdtempSync(join(tmpdir(), 'estufa-')); await arrancar(); });
after(async () => { await parar(); rmSync(dir, { recursive: true, force: true }); });

test('API: comprar sementes, plantar, ver o vaso no armazém; a config chega ao ecrã', async () => {
  const A = await conta('Gina');
  await A.ag({ type: 'class', id: (await A.get('/api/config')).classes?.[0]?.id || 'ladrao' });
  let x = await A.ag({ type: 'seedBuy', n: 3 });
  assert.equal(x.body.error, 'LOW_LEVEL');
  await mexer({ Gina: (e) => { e.respect = 5000; e.peakRespect = 5000; e.cash = 50000; } });
  x = await A.ag({ type: 'seedBuy', n: 3 });
  assert.equal(x.status, 200, JSON.stringify(x.body).slice(0, 200));
  let st = await A.get('/api/state');
  assert.equal(st.me.seeds, 3);
  x = await A.ag({ type: 'growPlant', r: 'lx', i: 1 });
  assert.equal(x.status, 200, JSON.stringify(x.body).slice(0, 200));
  x = await A.ag({ type: 'growPlant', r: 'lx', i: 1 }); assert.equal(x.body.error, 'POT_BUSY');
  x = await A.ag({ type: 'growHarvest', r: 'lx', i: 1 }); assert.equal(x.body.error, 'NOT_READY');
  x = await A.ag({ type: 'growPrune', r: 'lx', i: '1' }); assert.equal(x.body.error, 'NO_POT', 'só números');
  st = await A.get('/api/state');
  assert.equal(st.me.seeds, 2);
  const lx = JSON.stringify(st.me).includes('"g":[null,{"t0"');
  assert.ok(lx, 'o vaso 1 aparece plantado no armazém');
  const cfg = await A.get('/api/config');
  assert.equal(cfg.grow.ms, G.ms); assert.equal(cfg.grow.pots.length, 5);
});
