// v79 (pedido do Dinis, 17/11, 08:12: «continua» com os colecionáveis e o museu à maneira do Torn).
// Corre com: node --test dev/colecao79.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 10);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER };
const lv = (n) => CFG.levels[n - 1];
const mk = (resp = 0) => { const p = E.newPlayer('m' + Math.random(), START, world); p.respect = p.peakRespect = resp; p.cash = 1_000_000; return p; };
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
// sorte às ordens: diz que sim às chances da lista e regista todas as que lhe pedem
const sorte = (sim) => { const pedidas = []; return { pedidas, int: (lo) => lo, float: () => 0, chance: (bp) => { pedidas.push(bp); return sim(bp); } }; };
const encher = (p, set) => { for (const i of CFG.col.sets[set].items) p.col[i] = (p.col[i] || 0) + 1; };

test('golpe que corre bem: a peça rara sai com 0,15% por ponto de stamina e vai para a vitrine', () => {
  const p = mk(1); p.energy = 100;
  const c = CFG.crimes[0], bp = c.e * CFG.col.crimeBpPerE;
  const r = E.doCrime(p, START, world, 0, sorte(() => true));
  assert.equal(r.col, CFG.col.sets.raras.items[0]); assert.equal(p.col[r.col], 1);
  const s = sorte((x) => x !== bp); const r2 = E.doCrime(p, START, world, 0, s);
  assert.ok(s.pedidas.includes(bp), 'pediu a chance da peça'); assert.equal(r2.col, undefined);
});

test('golpe falhado não dá peça (nem pede a sorte dela)', () => {
  const p = mk(1); p.energy = 100;
  const s = sorte(() => false); const r = E.doCrime(p, START, world, 0, s);
  assert.equal(r.success, false); assert.equal(s.pedidas.length, 2, 'só a do golpe e a de ser apanhado'); assert.deepEqual(p.col, {});
});

test('«usar a stamina toda» junta as peças que saíram', () => {
  const p = mk(1); p.energy = 30;
  const r = E.doCrimeAll(p, START, world, 0, sorte(() => true));
  assert.equal(r.n, 3); assert.deepEqual(r.col, { [CFG.col.sets.raras.items[0]]: 3 }); assert.equal(p.col[CFG.col.sets.raras.items[0]], 3);
});

test('avião: lembrança da rota com 25% só se a carga chega inteira', () => {
  const p = mk(lv(5)), i = CFG.air.routes.findIndex((x) => x.id === 'tanger');
  E.airSend(p, START, world, i, 1000, false);
  const s = sorte((bp) => bp === CFG.col.airBp);   // não é apreendido, sai a lembrança
  const r = E.airCollect(p, START + 2 * T.HOUR, world, s);
  assert.equal(r.seized, false); assert.equal(r.col, 'bule'); assert.equal(p.col.bule, 1);
  E.airSend(p, START + 2 * T.HOUR, world, i, 1000, false);
  const r2 = E.airCollect(p, START + 4 * T.HOUR, world, sorte(() => true));   // apreendido
  assert.equal(r2.seized, true); assert.equal(r2.col, undefined); assert.equal(p.col.bule, 1);
});

test('museu: conjunto incompleto não mexe em nada; a primeira entrega paga o dobro no banco e põe o nome na placa', () => {
  const p = mk(lv(5)); encher(p, 'mundo'); p.col.tapete = 0;
  const b0 = p.bank, r0 = p.respect;
  erro(() => E.museumGive(p, START, world, 'mundo'), 'SET_INCOMPLETE');
  assert.equal(p.bank, b0); assert.equal(p.col.bule, 1);
  p.col.tapete = 2;
  const r = E.museumGive(p, START, world, 'mundo');
  assert.equal(r.first, true); assert.equal(r.cash, 2 * CFG.col.sets.mundo.cash); assert.equal(p.bank, b0 + r.cash);
  assert.equal(p.respect, r0 + 2 * CFG.col.sets.mundo.resp); assert.equal(p.col.bule, 0); assert.equal(p.col.tapete, 1);
  encher(p, 'mundo');
  const r2 = E.museumGive(p, START, world, 'mundo');
  assert.equal(r2.first, false); assert.equal(r2.cash, CFG.col.sets.mundo.cash); assert.equal(p.mus.mundo, 2);
  erro(() => E.museumGive(p, START, world, 'constructor'), 'NO_SET');
  erro(() => E.museumGive(p, START, world, '__proto__'), 'NO_SET');
});

test('penhorista: só as repetidas, 300 € cada; a última fica', () => {
  const p = mk(1); p.col.moeda = 3; const c0 = p.cash;
  const r = E.colSell(p, START, world, 'moeda', 5);
  assert.equal(r.n, 2); assert.equal(p.cash, c0 + 2 * CFG.col.pawn); assert.equal(p.col.moeda, 1);
  erro(() => E.colSell(p, START, world, 'moeda', 1), 'NO_EXTRA');
  erro(() => E.colSell(p, START, world, 'toString', 1), 'NO_ITEM');
  erro(() => E.colSell(p, START, world, 'moeda', 0), 'NO_EXTRA');
});

test('preso ou internado não se vai ao museu nem ao penhorista', () => {
  const p = mk(lv(5)); encher(p, 'raras'); p.col.moeda = 2; p.jailUntil = START + T.HOUR;
  assert.throws(() => E.museumGive(p, START, world, 'raras'));
  assert.throws(() => E.colSell(p, START, world, 'moeda', 1));
  assert.equal(p.col.moeda, 2);
});
