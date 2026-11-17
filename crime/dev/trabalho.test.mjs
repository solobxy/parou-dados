// Trabalho à mão (pedido de 16/11, 23:51): biscates sem barra, cada um uma tarefa curta com objetos.
// Paga a base vezes a qualidade (60 a 120%) vezes 0,5^(cansaço/30); o cansaço sobe 1 por tarefa e desce para metade a cada 6 horas.
// Corre com: node --test dev/trabalho.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 10);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const mk = () => { const p = E.newPlayer('p' + Math.random(), START, world); p.cash = 1000; return p; };
const nunca = { int: (lo) => lo, chance: () => false, float: () => 0 };
const sempre = { int: (lo) => lo, chance: () => true, float: () => 0 };
const W = () => CFG.work;
const job = (id) => W().list.find((x) => x.id === id);
const code = (c) => (e) => e.code === c;

// a resposta perfeita de cada tarefa, feita a partir da disposição que o servidor mandou
function perfeita(task) {
  const L = task.layout;
  if (task.id === 'camiao') {
    const ord = L.boxes.map((b, i) => [b.kg, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    const slots = []; ord.forEach(([, i], k) => { slots[i] = k; });   // as três mais pesadas nos lugares 0 a 2 (em baixo)
    return { slots, drops: 0 };
  }
  if (task.id === 'entregas') {
    const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r])));
    const len = (o) => { let x = 0, y = 0, s = 0; for (const i of o) { s += Math.abs(L.stops[i].x - x) + Math.abs(L.stops[i].y - y); x = L.stops[i].x; y = L.stops[i].y; } return s; };
    return { order: perms(L.stops.map((_, i) => i)).sort((a, b) => len(a) - len(b))[0] };
  }
  // laboratório: tocar quando o ponteiro está no meio da zona verde; encher cada saco até ao peso certo
  const P = L.gauge.periodMs, c = L.gauge.c / 10000, tap = (k) => k * P + Math.round((c / 2) * P);   // na subida, x = 2·fase
  return { taps: [tap(1), tap(2), tap(3)], holds: L.bags.map(() => Math.round((L.target * 1000) / L.rate)), pills: L.pills };
}

test('três biscates desde o nível 1: camião e entregas pagam 25 €, o laboratório 45 € com risco de rusga', () => {
  assert.deepEqual(W().list.map((x) => [x.id, x.level, x.base, !!x.bustBp]), [['camiao', 1, 25, false], ['entregas', 1, 25, false], ['laboratorio', 1, 45, true]]);
  assert.equal(W().half, 30); assert.equal(W().halfLifeMs, 6 * T.HOUR);
  for (const x of W().list) assert.ok(x.minMs >= 8000 && x.minMs <= 15000, x.id);
});

test('a disposição sai da semente: a mesma semente dá a mesma tarefa', () => {
  for (const x of W().list) {
    const a = mk(), b = mk();
    const ra = E.workStart(a, START, world, seededRng(5), x.id), rb = E.workStart(b, START, world, seededRng(5), x.id);
    assert.deepEqual(ra.task.layout, rb.task.layout, x.id);
    assert.equal(a.tk.id, x.id); assert.equal(a.tk.t0, START);
    assert.deepEqual(E.workLayout(x.id, a.tk.s), ra.task.layout);
  }
});

test('entregar depressa demais não paga e não mexe em nada; sem tarefa começada também não', () => {
  const p = mk(); const r = E.workStart(p, START, world, seededRng(1), 'camiao');
  const antes = structuredClone(p);
  assert.throws(() => E.workDone(p, START + job('camiao').minMs - 1, world, nunca, perfeita(r.task)), code('TOO_FAST'));
  assert.deepEqual(p, antes);
  const q = mk(); assert.throws(() => E.workDone(q, START, world, nunca, { slots: [0, 1, 2, 3, 4, 5], drops: 0 }), code('NO_TASK'));
});

test('respostas inventadas são recusadas sem mexer em nada', () => {
  const p = mk(); E.workStart(p, START, world, seededRng(2), 'camiao');
  const t = START + 60000, antes = structuredClone(p);
  for (const ans of [null, {}, { slots: [0, 0, 1, 2, 3, 4], drops: 0 }, { slots: [0, 1, 2, 3, 4], drops: 0 }, { slots: [0, 1, 2, 3, 4, 9], drops: 0 }, { slots: [0, 1, 2, 3, 4, 5], drops: -1 }])
    assert.throws(() => E.workDone(p, t, world, nunca, ans), code('BAD_ANSWER'), JSON.stringify(ans));
  assert.deepEqual(p, antes);
  const q = mk(); E.workStart(q, START, world, seededRng(2), 'laboratorio');
  for (const ans of [{ taps: [1, 2], holds: [1, 1, 1] }, { taps: [3, 2, 1], holds: [1, 1, 1] }, { taps: [1, 2, 3], holds: [1, 1] }, { taps: [1, 2, 3], holds: [1, 1, 1e9] }])
    assert.throws(() => E.workDone(q, t, world, nunca, ans), code('BAD_ANSWER'), JSON.stringify(ans));
  const e = mk(); E.workStart(e, START, world, seededRng(2), 'entregas');
  for (const ans of [{ order: [0, 1, 2] }, { order: [0, 0, 1, 2] }, { order: ['a', 1, 2, 3] }])
    assert.throws(() => E.workDone(e, t, world, nunca, ans), code('BAD_ANSWER'), JSON.stringify(ans));
});

test('bem feito paga 120% da base; mal feito paga menos, nunca menos de 60%', () => {
  for (const x of W().list) {
    const p = mk(); const r = E.workStart(p, START, world, seededRng(3), x.id);
    const d = E.workDone(p, START + 60000, world, nunca, perfeita(r.task));
    assert.equal(d.q, 10000, x.id); assert.equal(d.money, Math.floor((x.base * 12000) / 10000), x.id);
    assert.equal(p.tk, null, 'a tarefa acaba');
  }
  // camião com as caixas todas trocadas (as leves em baixo) e duas caídas
  const p = mk(); const r = E.workStart(p, START, world, seededRng(3), 'camiao');
  const bom = perfeita(r.task).slots, mau = bom.map((s) => (s + 3) % 6);
  const d = E.workDone(p, START + 60000, world, nunca, { slots: mau, drops: 2 });
  assert.equal(d.q, 0); assert.equal(d.money, Math.floor((25 * 6000) / 10000));
});

test('entregas: a ordem mais curta vale 100%; uma volta maior vale a proporção', () => {
  const p = mk(); const r = E.workStart(p, START, world, seededRng(4), 'entregas'), L = r.task.layout;
  assert.equal(L.stops.length, 4);
  const len = (o) => { let x = 0, y = 0, s = 0; for (const i of o) { s += Math.abs(L.stops[i].x - x) + Math.abs(L.stops[i].y - y); x = L.stops[i].x; y = L.stops[i].y; } return s; };
  const best = perfeita(r.task).order, pior = [...best].reverse();
  const d = E.workDone(p, START + 60000, world, nunca, { order: pior });
  assert.equal(d.q, Math.round((10000 * len(best)) / len(pior)));
});

test('cansaço: a 31.ª tarefa seguida paga metade; seis horas depois o cansaço desce para metade', () => {
  const p = mk(); let t = START;
  const pagos = [];
  for (let i = 0; i < 31; i++) { const r = E.workStart(p, t, world, seededRng(9), 'camiao'); t += 20000; pagos.push(E.workDone(p, t, world, nunca, perfeita(r.task)).money); }
  assert.equal(pagos[0], 30); assert.equal(pagos[30], 15, 'trinta seguidas: metade');
  assert.ok(pagos.every((x, i) => i === 0 || x <= pagos[i - 1]), 'nunca sobe a meio');
  const agora = E.workView(p, t).tired, depois = E.workView(p, t + 6 * T.HOUR).tired;
  assert.ok(agora > 30 && agora <= 31, String(agora));
  assert.ok(Math.abs(depois - agora / 2) < 0.01, `${agora} → ${depois}`);
  assert.ok(E.workView(p, t).multBp < 5000 && E.workView(p, t + 6 * T.HOUR).multBp > 6500);
});

test('laboratório: o dinheiro é sujo (conta para a lavagem) e uma rusga leva à prisão, sem pagar', () => {
  const p = mk(); const r = E.workStart(p, START, world, seededRng(6), 'laboratorio');
  const ilegal0 = p.ilegal, d = E.workDone(p, START + 60000, world, nunca, perfeita(r.task));
  assert.equal(d.busted, false); assert.equal(p.ilegal - ilegal0, Math.floor((45 * 12000) / 10000));
  const q = mk(); const r2 = E.workStart(q, START, world, seededRng(6), 'laboratorio'), c0 = q.cash;
  const b = E.workDone(q, START + 60000, world, sempre, perfeita(r2.task));
  assert.equal(b.busted, true); assert.equal(b.money, 0); assert.equal(q.cash, c0);
  assert.equal(q.jailUntil, START + 60000 + job('laboratorio').jailMin * T.MIN);
  assert.ok(E.bailCost(q, START + 60000) > 0);
  assert.equal(Math.round(E.workView(q, START + 60000).tired), 1, 'a rusga também cansa');
  // preso não trabalha (na prisão há trabalhos à parte)
  assert.throws(() => E.workStart(q, START + 60001, world, nunca, 'camiao'), code('IN_JAIL'));
});

test('camião e entregas não têm risco nenhum', () => {
  for (const id of ['camiao', 'entregas']) { const p = mk(); const r = E.workStart(p, START, world, seededRng(8), id); assert.equal(E.workDone(p, START + 60000, world, sempre, perfeita(r.task)).busted, false); }
});

test('invariantes: 2 000 tarefas ao acaso não partem o jogador', () => {
  const rng = seededRng(11); const p = mk(); let t = START;
  for (let i = 0; i < 2000; i++) {
    const id = W().list[rng.int(0, 2)].id;
    if (p.jailUntil > t) t = p.jailUntil + 1;
    const r = E.workStart(p, t, world, rng, id); t += rng.int(5000, 40000);
    const ans = rng.chance(5000) ? perfeita(r.task) : (id === 'camiao' ? { slots: [5, 4, 3, 2, 1, 0], drops: rng.int(0, 6) } : id === 'entregas' ? { order: [3, 1, 0, 2] } : { taps: [10, 20, 30], holds: [rng.int(0, 5000), 1, 2] });
    try { E.workDone(p, t, world, rng, ans); } catch (e) { assert.ok(['TOO_FAST'].includes(e.code), e.code); }
    assert.deepEqual(E.checkInvariants(p), []);
  }
});
