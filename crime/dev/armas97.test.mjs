// v97 (pedido do Dinis: armas como no Torn, «com stats, attachments, range e etc», e tantas ou mais). Cada arma tem precisão e
// alcance; os acessórios montam-se numa arma vestida (um de cada família, até aos espaços dela) e somam-lhe. Nas lutas, a
// precisão e o alcance mexem na hipótese; o laser dá críticos; o carregador poupa balas; o silenciador baixa a prisão.
// Corre com: node --test dev/armas97.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 22, 12);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const mk = (resp = 1e6) => { const p = E.newPlayer('w' + Math.random(), START - T.DAY, world); p.cash = 1e8; p.respect = resp; p.peakRespect = resp; return p; };
const code = (fn) => { try { fn(); return 'ok'; } catch (e) { return e.code || e.message; } };
const G = (id) => CFG.gear.find((g) => g.id === id);

test('15 acessórios em 7 famílias; cada um serve em tipos que existem', () => {
  const M = CFG.gear.filter((g) => g.slot === 'mod'), tipos = new Set(CFG.gear.filter((g) => g.t).map((g) => g.t));
  assert.equal(M.length, 15);
  assert.equal(new Set(M.map((m) => m.cat)).size, 7);
  for (const m of M) { assert.ok(m.fits.length && m.fits.every((k) => tipos.has(k)), m.id); assert.ok(m.price > 0, m.id); }
});

test('comprar um acessório põe-no no inventário (não se veste); monta-se numa arma vestida que o aceite e soma-lhe', () => {
  const p = mk(); p.eq.principal = { id: 'sniper', u: 50 };
  const c0 = p.cash; E.buyItem(p, START, world, 'mod_luneta4');
  assert.equal(c0 - p.cash, G('mod_luneta4').price); assert.equal(p.inv.at(-1).id, 'mod_luneta4');
  assert.equal(code(() => E.equip(p, START, world, p.inv.length - 1)), 'NOT_WEARABLE');
  const w0 = E.wStat(p.eq.principal);
  E.modFit(p, START, world, 'principal', p.inv.length - 1);
  assert.deepEqual(p.eq.principal.m, ['mod_luneta4']); assert.equal(p.inv.length, 0);
  const w1 = E.wStat(p.eq.principal);
  assert.equal(w1.acc, w0.acc + 8); assert.equal(w1.rng, w0.rng + 150); assert.equal(w1.atk, w0.atk);
  assert.deepEqual(E.checkInvariants(p), []);
});

test('não monta: tipo errado, família repetida, sem espaço, nível baixo; tirar devolve ao inventário (se couber)', () => {
  const p = mk(); p.eq.mao = { id: 'pistola', u: 20 }; p.eq.branca = { id: 'navalha' };
  for (const id of ['mod_luneta12', 'mod_reflex', 'mod_holo', 'mod_laser', 'mod_carregador', 'mod_fita', 'mod_afiar']) p.inv.push({ id });
  const at = (id) => p.inv.findIndex((x) => x.id === id);
  assert.equal(code(() => E.modFit(p, START, world, 'mao', at('mod_luneta12'))), 'MOD_NO_FIT');
  assert.equal(code(() => E.modFit(p, START, world, 'mao', at('mod_holo'))), 'MOD_NO_FIT');
  E.modFit(p, START, world, 'mao', at('mod_reflex'));
  assert.equal(code(() => E.modFit(p, START, world, 'mao', at('mod_luneta12'))), 'MOD_NO_FIT');
  E.modFit(p, START, world, 'mao', at('mod_laser'));
  assert.equal(code(() => E.modFit(p, START, world, 'mao', at('mod_carregador'))), 'MOD_FULL', 'a pistola tem 2 espaços');
  E.modFit(p, START, world, 'branca', at('mod_fita'));
  assert.equal(code(() => E.modFit(p, START, world, 'branca', at('mod_afiar'))), 'MOD_FULL', 'as brancas têm 1');
  assert.equal(code(() => E.modFit(p, START, world, 'principal', at('mod_afiar'))), 'NO_GEAR');
  const q = mk(0); q.eq.mao = { id: 'pistola', u: 20 }; q.inv.push({ id: 'mod_silenciador' });
  assert.equal(code(() => E.modFit(q, START, world, 'mao', 0)), 'LOW_LEVEL');
  // tirar
  const n = p.inv.length; E.modTake(p, START, world, 'mao', 0);
  assert.deepEqual(p.eq.mao.m, ['mod_laser']); assert.equal(p.inv.length, n + 1); assert.equal(p.inv.at(-1).id, 'mod_reflex');
  while (p.inv.length < E.invCap(p)) p.inv.push({ id: 'pedecabra' });
  assert.equal(code(() => E.modTake(p, START, world, 'mao', 0)), 'NO_ROOM');
  assert.equal(code(() => E.modTake(p, START, world, 'mao', 5)), 'NO_MOD');
  assert.deepEqual(E.checkInvariants(p), []);
});

test('a arma vai com os acessórios para o inventário; vender pede que se tirem primeiro', () => {
  const p = mk(); p.eq.mao = { id: 'pistola', u: 20, m: ['mod_reflex'] };
  E.unequip(p, START, world, 'mao');
  assert.deepEqual(p.inv.at(-1), { id: 'pistola', u: 20, m: ['mod_reflex'] });
  assert.equal(code(() => E.sellItem(p, START, world, p.inv.length - 1)), 'HAS_MODS');
  E.equip(p, START, world, p.inv.length - 1); E.modTake(p, START, world, 'mao', 0); E.unequip(p, START, world, 'mao');
  assert.equal(code(() => E.sellItem(p, START, world, p.inv.findIndex((x) => x.id === 'pistola'))), 'ok');
});

test('lutas: a precisão da arma soma à hipótese (15 bp por ponto acima de 50) e o dobro do alcance dá +3 pontos', () => {
  const a = mk(), d = mk();
  a.stats = { F: 100, T: 100, I: 10, C: 10 }; d.stats = { F: 100, T: 100, I: 10, C: 10 };
  const base = E.chanceBp(E.attackPower(a, START), E.defensePower(d, START));
  assert.equal(E.attackChanceBp(a, d, START), base, 'os dois de mãos vazias');
  a.eq.principal = { id: 'sniper', u: 50 }; const s = G('sniper');
  const b2 = E.chanceBp(E.attackPower(a, START), E.defensePower(d, START));
  assert.equal(E.attackChanceBp(a, d, START), Math.min(9500, b2 + (s.acc - 50) * 15 + 300));
  d.eq.principal = { id: 'sniper', u: 50 };
  const b3 = E.chanceBp(E.attackPower(a, START), E.defensePower(d, START));
  assert.equal(E.attackChanceBp(a, d, START), Math.min(9500, b3 + (s.acc - 50) * 15), 'mesmo alcance: sem vantagem');
  const u = mk(); u.stats = { F: 100, T: 100, I: 10, C: 10 };   // de mãos vazias contra quem tem uma sniper: metade do alcance, −3 pontos
  assert.equal(E.attackChanceBp(u, d, START), Math.max(500, E.chanceBp(E.attackPower(u, START), E.defensePower(d, START)) - 300));
});

test('o laser dá golpes críticos nas lutas: +50% de respeito', () => {
  const a = mk(), d = mk(); a.stats = { F: 500, T: 100, I: 10, C: 10 }; d.stats = { F: 10, T: 10, I: 10, C: 10 };
  a.eq.mao = { id: 'pistola', u: 20, m: ['mod_laser'] };
  const sempre = { chance: () => true, int: (x) => x, float: () => 0 };
  const base = E.pvpBaseGain(a, d);
  const r = E.attack(a, d, START + T.HOUR, world, 'beat', sempre);
  assert.equal(r.win, true); assert.equal(r.crit, true); assert.equal(r.respect, Math.floor((base * 15000) / 10000));
});

test('golpes com arma: o carregador alargado poupa balas; o silenciador baixa a hipótese de ser apanhado', () => {
  const k = CFG.crimes.findIndex((c) => c.gun), c = CFG.crimes[k];
  const p = mk(); p.eq.mao = { id: 'pistola', u: 20, m: ['mod_carregador'] }; p.inv.push({ id: 'balas', n: 100 });
  assert.equal(E.ammoPerJob(p), CFG.bullets.perJob - 3);
  p.energy = 1000; p.energyMax = 1000;
  const vez = { n: 0 }, rng = { chance: (bp) => { vez[vez.n++] = bp; return vez.n === 1 ? false : true; }, int: (x) => x, float: () => 0 };
  const r = E.doCrime(p, START, world, k, rng);
  assert.equal(r.ammo, CFG.bullets.perJob - 3); assert.equal(p.inv.find((x) => x.id === 'balas').n, 100 - r.ammo);
  const semSil = vez[1];
  const q = mk(); q.eq.mao = { id: 'pistola', u: 20, m: ['mod_silenciador'] }; q.inv.push({ id: 'balas', n: 100 }); q.energy = 1000; q.energyMax = 1000;
  vez.n = 0; E.doCrime(q, START, world, k, rng);
  assert.equal(vez[1], Math.floor((semSil * (10000 - G('mod_silenciador').bust)) / 10000), 'menos 15%');
  assert.ok(c.gun);
});
