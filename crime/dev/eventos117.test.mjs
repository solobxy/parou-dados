// v117 (pedido do Dinis: «eventos sazonais», internacionais e não portugueses). O calendário calcula-se sozinho para qualquer ano;
// cada evento tem um efeito para toda a gente, fichas que caem dos golpes bem feitos, três metas pagas logo e, no Natal e no Ano
// Novo Lunar, um presente por dia. Corre com: node --test dev/eventos117.test.mjs   (dentro de crime/)
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
import * as V from '../engine/eventos.js';
import { lisbonToUtc, localParts } from '../engine/time.js';

const L = (y, m, d, h = 12) => lisbonToUtc(y, m, d, h);
const ymd = (t) => { const x = localParts(t); return [x.y, x.m, x.d].join('-'); };
const world = { start: L(2020, 1, 1), playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const mk = (now) => { const p = E.newPlayer('e' + Math.random(), now, world); p.cash = 1e6; p.respect = 5000; p.peakRespect = 5000; p.energy = 100; return p; };
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
const sempre = { int: (a) => a, chance: () => true }, nunca = { int: (a) => a, chance: () => false };

test('o calendário calcula-se sozinho, em hora de Londres', () => {
  const st = (id, y) => ymd(V.eventIn(id, y).start), en = (id, y) => ymd(V.eventIn(id, y).end - 1);
  assert.deepEqual(V.easter(2026), { y: 2026, m: 4, d: 5 }); assert.deepEqual(V.easter(2027), { y: 2027, m: 3, d: 28 });
  assert.equal(st('pascoa', 2026), '2026-4-3'); assert.equal(en('pascoa', 2026), '2026-4-6');
  assert.equal(st('ascot', 2026), '2026-6-16'); assert.equal(en('ascot', 2026), '2026-6-20');   // Royal Ascot: de terça a sábado
  assert.equal(st('nottinghill', 2026), '2026-8-29'); assert.equal(en('nottinghill', 2026), '2026-8-31');   // até à segunda-feira do feriado
  assert.deepEqual(V.eventIn('natal', 2026).goals, [39, 91, 156]); assert.deepEqual(V.eventIn('anonovo', 2026).goals, [3, 7, 12]);   // pela duração
  assert.equal(st('blackfriday', 2026), '2026-11-27'); assert.equal(st('blackfriday', 2027), '2027-11-26');
  assert.equal(st('oktober', 2026), '2026-9-19'); assert.equal(st('oktober', 2027), '2027-9-18');
  assert.equal(st('lunar', 2027), '2027-2-6'); assert.equal(st('lunar', 2034), '2034-2-19');
  assert.deepEqual(V.lunarNewYear(2043), { y: 2043, m: 2, d: 10 });   // já sem tabela: pela lua nova
  assert.equal(V.eventIn('natal', 2026).start, L(2026, 12, 1, 0));
  assert.deepEqual(V.eventsAt(L(2027, 1, 1, 10)).map((e) => e.key), ['anonovo-2026']);   // o Ano Novo atravessa o ano
  assert.deepEqual(V.eventsAt(L(2029, 2, 14)).map((e) => e.key), ['lunar-2029', 'namorados-2029']);   // dois ao mesmo tempo
  assert.equal(V.nextEvent(L(2026, 11, 19)).key, 'blackfriday-2026');
  assert.deepEqual(V.eventsAt(L(2026, 11, 19)), []);
});

test('os efeitos: Black Friday nas armas, Halloween na polícia, São Patrício na hipótese, Oktoberfest na stamina', () => {
  const bf = L(2026, 11, 28), fora = L(2026, 11, 19), g = CFG.gear.find((x) => x.id === 'micro');
  assert.equal(E.evBp('shop', bf), 3000); assert.equal(E.evBp('shop', fora), 0);
  assert.ok(E.gearPrice(g, bf) < E.gearPrice(g, fora) && E.gearPrice(g, bf) >= Math.floor((E.gearPrice(g, fora) * 7000) / 10000));
  const p = mk(fora);
  assert.ok(E.bustChanceBp(p, L(2026, 10, 31), 50) < E.bustChanceBp(p, fora, 50));
  const q = mk(L(2027, 3, 16)), r = E.doCrime(q, L(2027, 3, 16), world, 1, sempre);
  assert.equal(r.chanceBp, Math.min(9500, CFG.crimes[1].p + 500));
  const z = mk(fora); z.energy = 0;
  assert.ok(E.refillPlan(z, L(2026, 9, 20)).cost < E.refillPlan(z, fora).cost);
});

test('fichas: caem dos golpes bem feitos, até 8 por dia; cada meta paga uma vez, logo; a última conta para a honra', () => {
  const t0 = L(2027, 2, 13, 10), p = mk(t0), e = V.eventsAt(t0)[0], G = e.goals, cap = CFG.events.dayCap;   // Dia dos Namorados (2 dias)
  assert.equal(e.id, 'namorados');
  const b0 = p.bank, paid = [];
  for (let i = 0; i < cap + 3; i++) { p.energy = 100; const r = E.doCrime(p, t0 + i * 1000, world, 0, sempre); for (const x of r.ev || []) paid.push(...x.paid); }
  assert.equal(p.evs[e.key].n, cap, 'o limite do dia');
  for (let i = 0; i < G[2] - cap; i++) { p.energy = 100; const r = E.doCrime(p, L(2027, 2, 14, 10) + i * 1000, world, 0, sempre); for (const x of r.ev || []) paid.push(...x.paid); }
  assert.equal(p.evs[e.key].n, G[2]); assert.equal(p.evs[e.key].got, 7);
  assert.deepEqual(paid.map((x) => x.i), [0, 1, 2]);
  assert.equal(p.bank - b0, paid.reduce((s, x) => s + x.cash, 0));
  assert.ok(paid[2].cash >= CFG.events.prize[2].cash + CFG.events.prize[2].perLevel && paid[2].respect === 3 * paid[1].respect && paid[0].respect === 0);
  assert.equal(p.c.evtop, 1); assert.equal(E.honorVal(p, 'evtop'), 1);
  // fora de eventos não cai nada (nem se gasta sorte)
  const q = mk(L(2026, 11, 19)), r = E.doCrime(q, L(2026, 11, 19), world, 0, sempre);
  assert.equal(r.ev, undefined); assert.deepEqual(q.evs, {});
  // um evento novo apaga o registo dos que acabaram
  E.doCrime(p, L(2027, 3, 16), world, 0, sempre);
  assert.deepEqual(Object.keys(p.evs), ['patrick-2027']);

});

test('presente do dia: o Advento sobe até dia 24 e triplica no 25; o envelope do Ano Novo Chinês é um valor da sorte; uma vez por dia, também preso', () => {
  const t0 = L(2026, 12, 5, 9), p = mk(t0), b0 = p.bank, key = 'natal-2026', A = CFG.events.advent, base = A.base + A.perLevel * E.level(p);
  p.jailUntil = t0 + T.HOUR; p.jailTier = 1;
  const r = E.evGift(p, t0, world, key, sempre);
  assert.equal(r.cash, Math.round((base * (12 + 5)) / 24)); assert.equal(p.bank, b0 + r.cash);
  assert.equal(p.evs[key].n, 0, 'o presente não dá fichas (senão a primeira meta vinha de borla)');
  erro(() => E.evGift(p, t0 + T.HOUR, world, key, sempre), 'GIFT_TAKEN');
  assert.ok(E.evGift(p, L(2026, 12, 24, 9), world, key, sempre).cash > r.cash);
  assert.equal(E.evGift(p, L(2026, 12, 25, 9), world, key, sempre).cash, base * A.day25);
  const q = mk(L(2027, 2, 7)); q.respect = q.peakRespect = 1e7; assert.ok(E.level(q) >= CFG.events.hongbaoLevel);
  assert.equal(E.evGift(q, L(2027, 2, 7), world, 'lunar-2027', { int: () => 9999, chance: () => true }).cash, 88888);
  assert.equal(E.evGift(q, L(2027, 2, 8), world, 'lunar-2027', { int: () => 0, chance: () => true }).cash, 888);
  const n = mk(L(2027, 2, 7)); n.respect = n.peakRespect = 0; assert.ok(E.level(n) < CFG.events.hongbaoLevel);
  assert.equal(E.evGift(n, L(2027, 2, 7), world, 'lunar-2027', { int: () => 9999, chance: () => true }).cash, 8888, 'um décimo abaixo do nível 20');
  erro(() => E.evGift(mk(L(2026, 11, 28)), L(2026, 11, 28), world, 'blackfriday-2026', sempre), 'NO_GIFT');
  erro(() => E.evGift(mk(L(2026, 11, 19)), L(2026, 11, 19), world, key, sempre), 'NO_EVENT');
  assert.equal(E.evView(p, L(2026, 12, 25, 10))[0].gift, false);
  assert.equal(E.evView(p, L(2026, 12, 26, 10))[0].gift, true);
});

test('ovos da Páscoa: três por dia, cada um num ecrã; valem 2 fichas fora do limite do dia', () => {
  const t0 = L(2027, 3, 27, 10), p = mk(t0), key = 'pascoa-2027', v = E.evView(p, t0)[0];
  assert.equal(v.eggs.length, CFG.events.eggs); assert.equal(new Set(v.eggs).size, v.eggs.length);
  assert.ok(v.eggs.every((x) => CFG.events.eggTabs.includes(x)));
  assert.deepEqual(E.evView(p, t0 + T.HOUR)[0].eggs, v.eggs, 'os mesmos ecrãs o dia todo');
  for (let i = 0; i < CFG.events.eggs; i++) E.evEgg(p, t0, world, key, i);
  assert.equal(p.evs[key].n, CFG.events.eggs * CFG.events.eggTokens); assert.equal(p.evs[key].dn, 0);
  erro(() => E.evEgg(p, t0, world, key, 0), 'EGG_TAKEN');
  erro(() => E.evEgg(p, t0, world, key, 9), 'NO_EGG');
  E.evEgg(p, L(2027, 3, 28, 10), world, key, 0);   // no dia seguinte há ovos novos
  erro(() => E.evEgg(mk(L(2027, 3, 16)), L(2027, 3, 16), world, 'patrick-2027', 0), 'NO_EGGS');
});

// ---------- na API ----------
const AQUI = dirname(fileURLToPath(import.meta.url)), TESTE = join(AQUI, '..', 'test');
const PORT = 4900 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
const RONDA = '2026-12-04', DESVIO = Date.UTC(2026, 11, 4, 21) + 5 * 3600e3 - Date.now();   // uma sexta de dezembro: o relógio cai no Natal
let dir, srv;
async function arrancar() {
  srv = spawn(process.execPath, ['--import', join(TESTE, 'relogio.mjs'), join(AQUI, '..', 'server.mjs')], {
    env: { ...process.env, PORT: String(PORT), DATA: dir, COOKIE_INSEGURO: '1', PRIMEIRA_RONDA: RONDA, TESTE_DESVIO_MS: String(DESVIO), ATOS_3S: '100000', ATOS_MIN: '1000000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => { const s = String(d); if (!s.includes('ExperimentalWarning') && !s.includes('trace-warnings')) process.stderr.write(s); });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/api/saude')).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('servidor não arrancou');
}
async function parar() { srv.kill(); await new Promise((r) => srv.once('exit', r)); }
let ipN = 0;
async function conta(nome) {
  const ip = '10.14.0.' + ++ipN;
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@teste.pt' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const get = async (p) => (await fetch(BASE + p, { headers: { cookie, 'X-Forwarded-For': ip } })).json();
  const ag = async (body) => { const x = await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: JSON.stringify(body) }); return { status: x.status, body: await x.json() }; };
  await get('/api/state');
  return { ag, get, me: async () => (await get('/api/state')).me };
}
before(async () => { dir = mkdtempSync(join(tmpdir(), 'eventos-')); await arrancar(); });
after(async () => { await parar(); rmSync(dir, { recursive: true, force: true }); });

test('API: o estado traz o evento e o próximo, a config pública os eventos; o presente abre uma vez', async () => {
  const A = await conta('Ana');
  let me = await A.me();
  assert.equal(me.ev.length, 1); assert.equal(me.ev[0].key, 'natal-2026'); assert.equal(me.ev[0].gift, true);
  assert.equal(me.evNext.id, 'anonovo');
  assert.ok((await A.get('/api/config')).events.list.length >= 10);
  const r = await A.ag({ type: 'evGift', key: 'natal-2026' });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  me = await A.me();
  assert.equal(me.ev[0].gift, false); assert.equal(me.ev[0].gv, r.body.result.cash); assert.ok(r.body.result.cash > 0);
  assert.equal((await A.ag({ type: 'evGift', key: 'natal-2026' })).body.error, 'GIFT_TAKEN');
});
