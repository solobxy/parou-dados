// v78 (pedido do Dinis, 17/11, 08:12: «continua» com os consumíveis à maneira do Torn): café e farmácia, com as contas de espera.
// Corre com: node --test dev/consumiveis78.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 10);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER };
const lv = (n) => CFG.levels[n - 1];
const mk = (resp = 0) => { const p = E.newPlayer('c' + Math.random(), START, world); p.respect = p.peakRespect = resp; p.cash = 10_000; return p; };
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);

test('cerveja: paga 1 €, dá 2 de stamina e 1 hora de espera; com a stamina cheia não se paga nada', () => {
  const p = mk(); p.energy = 50;
  const r = E.consume(p, START, world, 'cerveja');
  assert.equal(r.price, 1); assert.equal(r.gain, 2); assert.equal(p.energy, 52); assert.equal(p.cash, 9_999);
  assert.equal(E.consumWait(p, 'est', START), T.HOUR);
  p.energy = E.energyMax(p); const c0 = p.cash;
  erro(() => E.consume(p, START, world, 'cerveja'), 'ENERGY_FULL'); assert.equal(p.cash, c0);
});

test('o estômago tem teto de 12 horas: 12 bebidas seguidas e a 13.ª só depois de passar uma hora', () => {
  const p = mk(); p.energy = 0; p.vigor = 0;
  for (let i = 0; i < 12; i++) E.consume(p, START + i * 1000, world, 'cerveja');
  erro(() => E.consume(p, START + 13_000, world, 'cerveja'), 'TOO_SOON');
  erro(() => E.consume(p, START + 13_000, world, 'energetico'), 'TOO_SOON');   // a mesma conta
  assert.ok(E.consume(p, START + T.HOUR + 20_000, world, 'cerveja').ok, 'passada uma hora há lugar para mais uma');
});

test('energético: +10 de vigor e 2 horas; o absinto só a partir do nível 10', () => {
  const p = mk(); p.vigor = 30;
  const r = E.consume(p, START, world, 'energetico'); assert.equal(r.gain, 10); assert.equal(p.vigor, 40);
  assert.equal(E.consumWait(p, 'est', START), 2 * T.HOUR);
  erro(() => E.consume(p, START, world, 'absinto'), 'LOW_LEVEL');
  const q = mk(lv(10)); q.energy = 0; assert.equal(E.consume(q, START, world, 'absinto').gain, 6);
});

test('farmácia: só internado; o kit tira 1 hora; a ligadura no fim dá alta; a conta médica tem teto de 6 horas', () => {
  const p = mk(lv(20));
  erro(() => E.consume(p, START, world, 'kit'), 'NOT_IN_HOSPITAL');
  p.hospUntil = START + 5 * T.HOUR;
  E.consume(p, START, world, 'kit'); assert.equal(p.hospUntil, START + 4 * T.HOUR);
  E.consume(p, START, world, 'morfina'); assert.equal(p.hospUntil, START + T.HOUR);
  erro(() => E.consume(p, START, world, 'morfina'), 'TOO_SOON');   // 1 h + 3 h + 3 h passava das 6 h
  p.hospUntil = START + 10 * T.MIN; E.consume(p, START, world, 'ligadura'); assert.equal(p.hospUntil, 0, 'alta');
  // internado, o café não serve
  p.hospUntil = START + T.HOUR; p.energy = 0; erro(() => E.consume(p, START, world, 'cerveja'), 'IN_HOSPITAL');
});

test('preso não se consome nada, e um jogador antigo ganha as contas de espera', () => {
  const p = mk(); p.jailUntil = START + T.HOUR; p.energy = 0;
  erro(() => E.consume(p, START, world, 'cerveja'), 'IN_JAIL');
  erro(() => E.consume(p, START, world, 'nada'), 'NO_ITEM');
  const q = mk(); delete q.cd; E.upgrade(q); assert.deepEqual(q.cd, { est: 0, med: 0 });
});
