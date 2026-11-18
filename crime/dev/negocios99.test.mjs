// v99 (pedido do Dinis: negócios mais baratos/ajustados). Quatro negócios pequenos no fim da lista (banca, quiosque, lavagem,
// barbearia), com máximo próprio, e os de sempre a render mais. Corre com: node --test dev/negocios99.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 12), world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const I = (id) => CFG.biz.findIndex((b) => b.id === id);
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
const mk = () => { const p = E.newPlayer('n' + Math.random(), START, world); p.cash = 1e7; return p; };

test('o mais barato custa 5 000 € e paga-se em 6 dias; quanto mais caro, mais devagar se paga', () => {
  const B = [...CFG.biz].sort((a, b) => a.price - b.price);
  assert.equal(B[0].id, 'banca'); assert.equal(B[0].price, 5000);
  const dias = B.map((b) => b.price / (b.perH * 24));
  assert.ok(dias[0] >= 5.5 && dias[0] <= 6.5, 'banca: ' + dias[0]);
  for (let k = 1; k < dias.length; k++) assert.ok(dias[k] > dias[k - 1], B[k].id);
  // os pequenos são legais (vão para o banco, sem rusgas) e têm máquina na cave
  for (const id of ['banca', 'quiosque', 'lavagem', 'barbearia']) { const b = CFG.biz[I(id)]; assert.ok(b.toBank && !b.raid); assert.ok(CFG.craft.list.some((r) => r.kind === 'maq' && r.biz === id)); }
});

test('banca e quiosque até 3; lavagem e barbearia até 5; o resto até 10; cada unidade a mais custa +50%', () => {
  const p = mk();
  for (const [id, max] of [['banca', 3], ['quiosque', 3], ['lavagem', 5], ['barbearia', 5], ['lavandaria', CFG.bizMax]]) {
    const i = I(id);
    let pr = CFG.biz[i].price;
    for (let n = 0; n < max; n++) { const r = E.buyBiz(p, START, world, i); assert.equal(r.price, pr); pr += Math.floor(pr / 2); }
    erro(() => E.buyBiz(p, START, world, i), 'BIZ_MAX');
    assert.equal(p.biz[i].n, max);
  }
  assert.deepEqual(E.checkInvariants(p), []);
});

test('a banca rende 35 € por hora por unidade (vezes a stat) e dá 5 de respeito ao comprar', () => {
  const p = mk(), i = I('banca'), r0 = p.respect;
  const r = E.buyBiz(p, START, world, i);
  assert.equal(r.respect, 5); assert.equal(p.respect - r0, 5);
  const st = Math.min(p.stats.C, CFG.statMultCap);
  assert.equal(E.bizRates(p, i, START).base, Math.floor((35 * (CFG.statMultDiv + st)) / CFG.statMultDiv));
});

test('quem já jogava (4 negócios) fica com os novos a zero, sem perder o que tinha', () => {
  const p = mk();
  E.buyBiz(p, START, world, I('lavandaria'));
  p.biz = p.biz.slice(0, 4);   // como estava gravado antes da v99
  E.touch(p, START + T.HOUR);
  assert.equal(p.biz.length, CFG.biz.length);
  assert.equal(p.biz[I('lavandaria')].n, 1); assert.equal(p.biz[I('banca')].n, 0);
  assert.deepEqual(E.checkInvariants(p), []);
});
