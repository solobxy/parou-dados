// v90 (pedido do Dinis: «repensa bem as profissões da personagem e os respetivos bónus»). Cada profissão de rua fica ligada a
// uma parte do jogo; a cave e a feira ganham o seu ofício (armeiro e feirante); o chulo passa a valer também no bordel e o
// contrabandista leva cargas maiores. Os bónus fazem exatamente o que o cartão diz.
// Corre com: node --test dev/profissoes90.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 22, 12);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const NOW = START;
const mk = (cls = '', resp = CFG.levels[39]) => { const p = E.newPlayer('a' + Math.random(), START - T.DAY, world); p.cls = cls; p.cash = 1e8; p.bank = 0; p.respect = resp; p.peakRespect = resp; return p; };
const cls = (id) => CFG.classes.find((c) => c.id === id);

test('dez profissões de rua e seis de elite; cada uma de rua mexe numa parte diferente do jogo', () => {
  const rua = CFG.classes.filter((c) => !c.need), elite = CFG.classes.filter((c) => c.need);
  assert.equal(rua.length, 10); assert.equal(elite.length, 6);
  assert.ok(cls('armeiro') && cls('recetador'));
  const chaves = rua.map((c) => Object.keys(c).filter((k) => k !== 'id').sort().join());
  assert.equal(new Set(chaves).size, rua.length, 'nenhuma repete os bónus de outra');
  for (const c of rua) assert.ok(Object.keys(c).length >= 3, c.id + ': pelo menos dois bónus');
});

test('armeiro: receitas 25% mais baratas e a bancada 30% mais depressa (componentes também mais baratos)', () => {
  const R = CFG.craft.list.find((r) => r.kind !== 'comp' && r.kind !== 'maq' && !CFG.gear.find((g) => g.id === r.id)?.level), C = CFG.craft.list.find((r) => r.kind === 'comp');
  for (const r of [R, C]) {
    const a = mk('armeiro'), b = mk('ladrao');
    for (const x of [a, b]) for (const [k, v] of Object.entries(r.needs)) x.mt[k] = v;
    const ra = E.craftStart(a, NOW, world, r.id), rb = E.craftStart(b, NOW, world, r.id);
    assert.equal(rb.price, r.price); assert.equal(ra.price, Math.floor((r.price * 7500) / 10000), r.id);
    assert.equal(a.cash, 1e8 - ra.price);
    if (r.kind !== 'comp') { assert.equal(b.cf.end - NOW, r.ms); assert.equal(a.cf.end - NOW, Math.floor((r.ms * 7000) / 10000)); }
  }
});

test('feirante: o recetador paga +30% pelo equipamento e a taxa da feira fica a metade', () => {
  const g = CFG.gear.find((x) => x.gun && !x.craft), item = { id: g.id, u: g.life };
  const a = mk('recetador'), b = mk('ladrao'); a.inv = [{ ...item }]; b.inv = [{ ...item }];
  const base = Math.floor((g.price * CFG.loot.gearSellBp) / 10000);
  assert.equal(E.sellItem(b, NOW, world, 0).money, base);
  assert.equal(E.sellItem(a, NOW, world, 0).money, Math.floor((base * 13000) / 10000));
  assert.equal(E.feiraFeeBp(b), CFG.feira.feeBp); assert.equal(E.feiraFeeBp(a), CFG.feira.feeBp / 2);
  assert.equal(E.feiraFee(1000, a), 25); assert.equal(E.feiraFee(1000, b), 50); assert.equal(E.feiraFee(1000), 50, 'sem vendedor conhecido, a taxa normal');
  // e o que se vende ao recetador nunca chega ao preço da loja (comprar e vender logo nunca dá lucro)
  for (const x of CFG.gear.filter((y) => y.price > 0)) assert.ok(Math.floor((Math.floor((x.price * CFG.loot.gearSellBp) / 10000) * 13000) / 10000) < x.price, x.id);
});

test('contrabandista: carga máxima 25% maior no porto e no avião, e menos 30% de apreensões', () => {
  const a = mk('contrabandista'), b = mk('ladrao');
  assert.equal(E.portCap(a), Math.floor((E.portCap(b) * 12500) / 10000)); assert.equal(E.airCap(a), E.portCap(a));
  CFG.port.ships.forEach((S, k) => assert.equal(E.portSeizeBp(a, k), Math.floor(S.seizeBp * 0.7)));
});

test('chulo: o bordel rende +25%', () => {
  const V = CFG.venue, a = mk('chulo'), b = mk('ladrao');
  for (const x of [a, b]) x.bro = { lvl: 1, till: 0, t: NOW, rem: 0, pi: 2, gd: 0, girls: [0, 1, 2] };
  assert.ok(E.broRate(b) > 0);
  assert.equal(E.broRate(a), Math.floor((E.broRate(b) * 12500) / 10000));
  assert.ok(V.bro);
});

test('ladrão: +50% de hipótese de achar peças raras nos golpes', () => {
  const N = 40000, conta = (cl) => { let n = 0; for (let i = 0; i < N; i++) { const p = mk(cl, 1); p.energy = 100; p.col = {}; const k = 0, rng = { int: (lo) => lo, chance: (bp) => (i % 10000) < bp };
    const r = E.doCrime(p, NOW, world, k, rng); if (r.col) n++; } return n; };
  const a = conta('ladrao'), b = conta('vigarista');
  assert.ok(b > 0);
  assert.ok(Math.abs(a / b - 1.5) < 0.05, `ladrão ${a}, outro ${b}`);
});

test('chulo: o que o bordel juntou lê-se igual no ecrã (e no assalto) e na recolha', () => {
  const a = mk('chulo'); a.bro = { lvl: 1, till: 0, t: NOW, rem: 0, pi: 2, gd: 0, girls: [0, 1, 2] };
  const v = E.venueView(a, NOW + 3 * T.HOUR).bro.till;
  assert.equal(v, E.broRate(a) * 3);
});
