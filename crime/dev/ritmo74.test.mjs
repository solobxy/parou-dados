// v74 (pedido de 17/11, 03:36): cada biscate tem um ritmo que sobe com o trabalho bem feito (com teto),
// e os biscates mais longos e difíceis pagam mais.
// Corre com: node --test dev/ritmo74.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 10);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const nunca = { int: (lo) => lo, chance: () => false, float: () => 0 };
const mk = () => { const p = E.newPlayer('p' + Math.random(), START, world); p.cash = 1000; p.respect = p.peakRespect = 1000; return p; };
const R = () => CFG.work.ritmo;

// camião: as mais pesadas em baixo é perfeito; tudo trocado e duas caídas é 0%
const bom = (L) => { const ord = L.boxes.map((b, i) => [b.kg, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]); const s = []; ord.forEach(([, i], k) => { s[i] = k; }); return { slots: s, drops: 0 }; };
const mau = (L) => ({ slots: bom(L).slots.map((s) => (s + 3) % 6), drops: 2 });
let t = START;
function camiao(p, certo, seed = 1) {
  const r = E.workStart(p, t, world, seededRng(seed), 'camiao');
  t += 60000;
  return E.workDone(p, t, world, nunca, certo ? bom(r.task.layout) : mau(r.task.layout));
}

test('o ritmo existe na configuração e tem teto', () => {
  assert.ok(R() && R().cap > 0 && R().step > 0 && R().drop > 0 && R().good > R().bad);
  assert.ok(R().cap <= 5000, 'o teto não passa de +50%');
});

test('bem feito sobe o ritmo de 5 em 5% até ao teto; o dinheiro sobe com ele', () => {
  const p = mk();
  const d1 = camiao(p, true);
  assert.equal(d1.ritmoAntes, 0); assert.equal(d1.ritmo, R().step);
  assert.equal(d1.money, Math.floor((Math.floor((95 * 12000) / 10000) * (10000 + R().step)) / 10000), 'o 1.º já paga com o ritmo novo (cansaço ainda 0)');
  let d; for (let i = 0; i < 20; i++) d = camiao(p, true, i + 2);
  assert.equal(d.ritmo, R().cap); assert.equal(p.wm.camiao, R().cap);
  assert.deepEqual(E.checkInvariants(p), []);
});

test('mal feito desce 10%, nunca abaixo de 0', () => {
  const p = mk();
  for (let i = 0; i < 4; i++) camiao(p, true, i + 1);
  assert.equal(p.wm.camiao, 4 * R().step);
  const d = camiao(p, false, 9);
  assert.equal(d.ritmo, 4 * R().step - R().drop);
  for (let i = 0; i < 5; i++) camiao(p, false, i + 20);
  assert.equal(p.wm.camiao, 0);
});

test('o ritmo é de cada biscate', () => {
  const p = mk();
  for (let i = 0; i < 3; i++) camiao(p, true, i + 1);
  const r = E.workStart(p, t, world, seededRng(5), 'entregas'); t += 60000;
  const L = r.task.layout;
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((q) => [x, ...q])));
  const len = (o) => { let x = 0, y = 0, s = 0; for (const i of o) { s += Math.abs(L.stops[i].x - x) + Math.abs(L.stops[i].y - y); x = L.stops[i].x; y = L.stops[i].y; } return s; };
  const d = E.workDone(p, t, world, nunca, { order: perms(L.stops.map((_, i) => i)).sort((a, b) => len(a) - len(b))[0] });
  assert.equal(d.ritmoAntes, 0); assert.equal(d.ritmo, R().step);
  assert.equal(p.wm.camiao, 3 * R().step);
  assert.deepEqual(E.workView(p, t).ritmo, { camiao: 3 * R().step, entregas: R().step });
});

test('os biscates mais longos pagam mais: a base sobe com o número de passos e o nível', () => {
  const b = Object.fromEntries(CFG.work.list.filter((x) => !x.shift).map((x) => [x.id, x.base]));
  const ord = ['camiao', 'entregas', 'laboratorio', 'oficina', 'mudancas', 'desmanche'];
  for (let i = 1; i < ord.length; i++) assert.ok(b[ord[i]] > b[ord[i - 1]], `${ord[i]} (${b[ord[i]]}) > ${ord[i - 1]} (${b[ord[i - 1]]})`);
  assert.ok(b.desmanche >= 1.8 * b.camiao, 'o mais difícil paga quase o dobro do mais fácil');
});

test('uma conta antiga, sem ritmo, ganha um ritmo vazio', () => {
  const p = mk(); delete p.wm;
  E.upgrade(p);
  assert.deepEqual(p.wm, {});
  assert.deepEqual(E.checkInvariants(p), []);
  p.wm = { camiao: R().cap + 1 };
  assert.ok(E.checkInvariants(p).includes('ritmo'));
});
