// Rua mais suave (pedido de 16/11, 23:48): «encher a stamina está demasiado caro e roubar aquece demasiado depressa».
// A rua e a escada da recarga deixam de contar por dia: arrefecem com o tempo, 50 de stamina por hora (uma barra em 2 h).
// Corre com: node --test dev/rua-suave.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 10);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER };
const mk = () => { const p = E.newPlayer('p' + Math.random(), START, world); p.cash = 1e9; return p; };
const ok = { int: (lo) => lo, chance: () => true, float: () => 0 };
const k = CFG.crimes.findIndex((c) => c.id === 'carteirista');
const barra = (p, t) => { for (let i = 0; i < 10; i++) { p.energy = 100; E.doCrime(p, t, world, k, ok); } };

test('a rua arrefece por patamares suaves: 100, 100, 90, 80, 70, 60, 50 e nunca abaixo de 40%', () => {
  const p = mk(), vistos = [], resp = [];
  for (let b = 0; b < 10; b++) { vistos.push(E.streetView(p, START).heatBp); resp.push(E.streetView(p, START).respBp); barra(p, START); }
  assert.deepEqual(vistos, [10000, 10000, 9000, 8000, 7000, 6000, 5000, 4000, 4000, 4000]);
  // o respeito continua a contar por dia, com os patamares de antes (a corrida ao nível 100 não acelera)
  assert.deepEqual(resp, [10000, 10000, 7000, 7000, 4500, 4500, 2500, 2500, 2500, 2500]);
  const amanha = START + T.DAY;
  assert.equal(E.streetView(p, amanha).respBp, 10000, 'no dia seguinte o respeito volta a 100%');
});

test('a rua arrefece com o tempo e não à meia-noite: uma barra em 2 horas', () => {
  const p = mk();
  for (let b = 0; b < 3; b++) barra(p, START);   // 300 de stamina gasta: a próxima rende 80%
  assert.equal(E.streetView(p, START).heatBp, 8000);
  assert.equal(E.streetView(p, START + 2 * T.HOUR).heatBp, 9000, 'duas horas depois desce um patamar');
  assert.equal(E.streetView(p, START + 4 * T.HOUR).heatBp, 10000, 'quatro horas depois está fria');
  assert.equal(E.streetView(p, START + 2 * T.HOUR).used, 200);
});

test('quem joga só com a stamina natural nunca aquece a rua (volta uma barra em 3h20, arrefece uma em 2 h)', () => {
  const p = mk(); let t = START;
  for (let b = 0; b < 12; b++) { assert.equal(E.streetView(p, t).heatBp, 10000, 'barra ' + (b + 1)); barra(p, t); t += 200 * T.MIN; }
});

test('o formato antigo (por dia) ainda se lê: no mesmo dia conta, no dia seguinte já não', () => {
  const p = mk(); p.rua = { d: E.dayOf(START), e: 300 };
  assert.equal(E.streetView(p, START).heatBp, 8000);
  assert.equal(E.streetView(p, START + T.DAY).heatBp, 10000);
  barra(p, START);
  assert.equal(p.rua.e, 400); assert.equal(p.rua.t, START);
});

test('recarga mais barata: 30 € a primeira barra, 70 € a segunda, 120 € a terceira', () => {
  const p = mk(), pagos = [];
  for (let b = 0; b < 3; b++) { p.energy = 0; pagos.push(E.refill(p, START, world).price); }
  assert.deepEqual(pagos, [30, 70, 120]);
});

test('a escada da recarga também desce com o tempo: quatro horas depois de uma barra volta ao preço de partida', () => {
  const p = mk(); p.energy = 0; E.refill(p, START, world);
  p.energy = 0; assert.equal(E.refillPlan(p, START).cost, 70);
  p.energy = 0; assert.equal(E.refillPlan(p, START + 2 * T.HOUR).cost, Math.ceil((50 * 30 + 50 * 70) / 100), 'duas horas: meia barra desceu');
  p.energy = 0; assert.equal(E.refillPlan(p, START + 4 * T.HOUR).cost, 30);
  assert.equal(E.refillUsed(p, START + 2 * T.HOUR), 50);
});

test('as putas sobem a mesma escada e ela também arrefece', () => {
  const p = mk(); p.energy = 0;
  E.visitHooker(p, START, world, 0, { ...ok, chance: () => false });
  const g = CFG.hookers.list[0];
  assert.equal(p.rf.e, g.e); assert.equal(p.rf.t, START);
  assert.equal(E.refillUsed(p, START + 4 * T.HOUR), Math.max(0, g.e - 100));
});
