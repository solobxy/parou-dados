// v82 (plano do Dinis: «ginásio novo: treinar é uma série de repetições no ritmo certo, e não um toque»).
// Corre com: node --test dev/ginasio82.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 10);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER };
const mk = () => { const p = E.newPlayer('g' + Math.random(), START, world); p.vigor = 100; return p; };
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
const S = CFG.train.set, JIT = [-40, 30, -20, 50, 0, -60, 10, 40, -30, 20];
// toques de pessoa: no topo, com uns ms de desvio (um ritmo exato demais conta como máquina)
const tops = (n) => Array.from({ length: n }, (_, k) => S.lead + k * S.beat + JIT[k % JIT.length]);
const fim = (n) => START + S.lead + (n - 1) * S.beat + 550;

test('série de 5 no ritmo certo: +6 pontos (120%), gasta a energia de 5 treinos', () => {
  const p = mk(), f0 = p.stats.F;
  const r0 = E.gymStart(p, START, world, 'F', 5);
  assert.equal(r0.reps, 5); assert.equal(r0.beat, S.beat); assert.equal(r0.lead, S.lead);
  const r = E.gymDone(p, fim(5), world, tops(5));
  assert.equal(r.gain, 6); assert.equal(p.stats.F, f0 + 6); assert.equal(p.vigor, 100 - 5 * CFG.train.energy);
  assert.deepEqual(r.marks, [0, 0, 0, 0, 0]);
});

test('cada toque vale conforme o erro: perfeito, bom, fraco e falhado; os pontos partidos ficam guardados', () => {
  const p = mk(), f0 = p.stats.T, t = tops(5);
  const taps = [t[0] + 30, t[1] - 120, t[2] + 200, t[3] + 400, t[4]];   // 120, 100, 80, 50, 120 → 4,7 pontos
  E.gymStart(p, START, world, 'T', 5);
  const r = E.gymDone(p, fim(5), world, taps);
  assert.deepEqual(r.marks, [0, 1, 2, 3, 0]); assert.equal(p.stats.T, f0 + 4); assert.equal(p.sx.T, 700);
  E.gymStart(p, fim(5) + 1000, world, 'T', 5); E.gymDone(p, fim(5) + 1000 + fim(5) - START, world, tops(5));   // +6 + 0,7
  assert.equal(p.stats.T, f0 + 10); assert.equal(p.sx.T, 700);
});

test('martelar o botão não serve: mais toques do que repetições + 2 contam tudo como falhado', () => {
  const p = mk(), f0 = p.stats.I, spam = Array.from({ length: 40 }, (_, i) => i * 150);
  E.gymStart(p, START, world, 'I', 5);
  const r = E.gymDone(p, fim(5), world, spam);
  assert.deepEqual(r.marks, [3, 3, 3, 3, 3]); assert.equal(p.stats.I, f0 + 2); assert.equal(p.sx.I, 500);
});

test('toques mal formados ou do futuro não mexem em nada', () => {
  const p = mk(); p.vigor = 20;
  erro(() => E.gymStart(p, START, world, 'F', 5), 'NO_VIGOR');
  erro(() => E.gymStart(p, START, world, 'F', 7), 'BAD_REPS');
  erro(() => E.gymStart(p, START, world, 'Z', 5), 'NO_STAT');
  p.vigor = 100; E.gymStart(p, START, world, 'F', 5);
  for (const bad of [null, 'x', [1, 'a'], [-5, 10], [1e9]]) erro(() => E.gymDone(p, fim(5), world, bad), 'BAD_TAPS');
  erro(() => E.gymDone(p, START + 4000, world, [3000, 4000 + S.slack + 1]), 'BAD_TAPS');   // um toque marcado depois do tempo que passou
  assert.equal(p.vigor, 100); assert.ok(p.gs);
});

test('nervos no «prepara-te» não estragam a série: só contam os toques dentro da janela de cada repetição', () => {
  const p = mk(), f0 = p.stats.F;
  E.gymStart(p, START, world, 'F', 5);
  const r = E.gymDone(p, fim(5), world, [400, 1100, 1900, ...tops(5)]);
  assert.deepEqual(r.marks, [0, 0, 0, 0, 0]); assert.equal(p.stats.F, f0 + 6);
});

test('dois toques na mesma janela falham só essa repetição', () => {
  const p = mk(), t = tops(5);
  E.gymStart(p, START, world, 'F', 5);
  const r = E.gymDone(p, fim(5), world, [t[0], t[1], t[1] + 300, t[2], t[3], t[4]].sort((a, b) => a - b));
  assert.deepEqual(r.marks, [0, 3, 0, 0, 0]);
});

test('um ritmo exato demais é de máquina: os perfeitos contam como bons', () => {
  const p = mk(), exatos = Array.from({ length: 5 }, (_, k) => S.lead + k * S.beat + 20);
  E.gymStart(p, START, world, 'F', 5);
  const r = E.gymDone(p, fim(5), world, exatos);
  assert.deepEqual(r.marks, [1, 1, 1, 1, 1]); assert.equal(r.gain, 5);
});

test('desistir a meio cobra só as repetições cujo topo já passou; antes do primeiro, não custa nada', () => {
  const p = mk(), t = tops(5);
  E.gymStart(p, START, world, 'F', 5);
  const r = E.gymDone(p, START + S.lead + S.beat + 400, world, [t[0], t[1]]);   // dois topos passaram
  assert.equal(r.reps, 2); assert.equal(r.of, 5); assert.deepEqual(r.marks, [0, 0]); assert.equal(p.vigor, 100 - 2 * CFG.train.energy);
  E.gymStart(p, START + 10000, world, 'F', 5);
  const r2 = E.gymDone(p, START + 10000 + 2000, world, [500]);
  assert.equal(r2.reps, 0); assert.equal(r2.gain, 0); assert.equal(p.vigor, 100 - 2 * CFG.train.energy); assert.equal(p.gs, null);
  // um topo que acabou de passar no servidor e que o jogador ainda não viu (a rede atrasa) não se cobra
  E.gymStart(p, START + 20000, world, 'F', 5);
  assert.equal(E.gymDone(p, START + 20000 + S.lead + 100, world, []).reps, 0);
});

test('uma série esquecida caduca ao fim de 2 minutos', () => {
  const p = mk(); E.gymStart(p, START, world, 'C', 10);
  erro(() => E.gymDone(p, START + 3 * T.MIN, world, tops(10)), 'NO_SERIES');
  assert.equal(p.gs, null);
});
