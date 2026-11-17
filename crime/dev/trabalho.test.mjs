// Trabalho à mão (pedido de 16/11, 23:51): biscates sem barra, cada um uma tarefa curta com objetos.
// Paga a base vezes a qualidade (60 a 120%) vezes 0,5^(cansaço/30); o cansaço sobe 1 por tarefa e desce para metade a cada 12 horas.
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
const mkAlto = () => { const p = mk(); p.respect = p.peakRespect = 1000; return p; };   // nível 13: todos os biscates abertos
const W = () => CFG.work;
const BISC = () => CFG.work.list.filter((x) => !x.shift);
const job = (id) => W().list.find((x) => x.id === id);
const code = (c) => (e) => e.code === c;

// mudanças: procura uma arrumação que encha a carrinha e cumpra as regras (pesadas na fila 0, a frágil na última)
function arrumar(L) {
  const g = Array(L.W * L.H).fill(-1), out = L.pcs.map(() => [-1, -1, 0]);
  const fits = (x, y, w, h) => { if (x + w > L.W || y + h > L.H) return false; for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (g[yy * L.W + xx] >= 0) return false; return true; };
  const put = (i, x, y, w, h, v) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy * L.W + xx] = v; };
  const go = (i) => {
    if (i === L.pcs.length) return true;
    const q = L.pcs[i];
    for (const rot of q.w === q.h ? [0] : [0, 1]) {
      const w = rot ? q.h : q.w, h = rot ? q.w : q.h;
      for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
        if ((q.heavy && y !== 0) || (q.fragile && y + h !== L.H) || !fits(x, y, w, h)) continue;
        put(i, x, y, w, h, i); out[i] = [x, y, rot];
        if (go(i + 1)) return true;
        put(i, x, y, w, h, -1); out[i] = [-1, -1, 0];
      }
    }
    return false;
  };
  assert.ok(go(0), 'há sempre uma arrumação certa');
  return out;
}

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
  if (task.id === 'entradas') return { picks: L.rows.map((r, i) => (L.guests.includes(r.n) ? -1 : i)).filter((i) => i >= 0) };
  if (task.id === 'contrato') return { picks: L.rows.map((r, i) => (r.v !== L.ficha[r.f] ? i : -1)).filter((i) => i >= 0) };
  if (task.id === 'doses') return { holds: L.doses.map((d) => Math.round((d * 10000) / L.rate)) };
  if (task.id === 'oficina') return { picks: [0, 2, 4, 1, 3], holds: [0, 1, 2, 3, 4].map(() => Math.round((L.nm * 1000) / L.rate)) };
  if (task.id === 'mudancas') return { place: arrumar(L) };
  if (task.id === 'desmanche') {   // o melhor conjunto que cabe em 85% do tempo
    let best = 0, bm = 0;
    for (let m = 1; m < 1 << L.parts.length; m++) { let t = 0, v = 0; L.parts.forEach((x, i) => { if (m & (1 << i)) { t += x.need; v += x.v; } }); if (t <= L.win * 0.85 && v > best) { best = v; bm = m; } }
    return { holds: L.parts.map((x, i) => (bm & (1 << i) ? x.need : 0)), spotted: false };
  }
  // laboratório: tocar quando o ponteiro está no meio da zona verde; encher cada saco até ao peso certo
  const P = L.gauge.periodMs, c = L.gauge.c / 10000, tap = (k) => k * P + Math.round((c / 2) * P);   // na subida, x = 2·fase
  return { taps: [tap(1), tap(2), tap(3)], holds: L.bags.map(() => Math.round((L.target * 1000) / L.rate)), pills: L.pills };
}

test('três biscates desde o nível 1: camião e entregas pagam 95 € (um toque de carteirista), o laboratório 115 € com risco de rusga', () => {
  assert.deepEqual(BISC().filter((x) => x.level === 1).map((x) => [x.id, x.level, x.base, !!x.bustBp]), [['camiao', 1, 95, false], ['entregas', 1, 95, false], ['laboratorio', 1, 115, true]]);
  assert.equal(W().half, 30); assert.equal(W().halfLifeMs, 12 * T.HOUR);
  for (const x of W().list) assert.ok(x.minMs >= 8000 && x.minMs <= 15000, x.id);
  for (const x of W().list.filter((y) => y.shift)) assert.throws(() => E.workStart(mk(), START, world, seededRng(1), x.id), code('NO_WORK'), 'só nos turnos');
});

test('a disposição sai da semente: a mesma semente dá a mesma tarefa', () => {
  for (const x of BISC()) {
    const a = mkAlto(), b = mkAlto();
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
  for (const x of BISC()) {
    const p = mkAlto(); const r = E.workStart(p, START, world, seededRng(3), x.id);
    const d = E.workDone(p, START + 60000, world, nunca, perfeita(r.task));
    assert.equal(d.q, 10000, x.id); assert.equal(d.money, Math.floor((x.base * 12000) / 10000), x.id);
    assert.equal(p.tk, null, 'a tarefa acaba');
  }
  // camião com as caixas todas trocadas (as leves em baixo) e duas caídas
  const p = mk(); const r = E.workStart(p, START, world, seededRng(3), 'camiao');
  const bom = perfeita(r.task).slots, mau = bom.map((s) => (s + 3) % 6);
  const d = E.workDone(p, START + 60000, world, nunca, { slots: mau, drops: 2 });
  assert.equal(d.q, 0); assert.equal(d.money, Math.floor((95 * 6000) / 10000));
});

test('entregas: a ordem mais curta vale 100%; uma volta maior vale a proporção', () => {
  const p = mk(); const r = E.workStart(p, START, world, seededRng(4), 'entregas'), L = r.task.layout;
  assert.equal(L.stops.length, 4);
  const len = (o) => { let x = 0, y = 0, s = 0; for (const i of o) { s += Math.abs(L.stops[i].x - x) + Math.abs(L.stops[i].y - y); x = L.stops[i].x; y = L.stops[i].y; } return s; };
  const best = perfeita(r.task).order, pior = [...best].reverse();
  const d = E.workDone(p, START + 60000, world, nunca, { order: pior });
  assert.equal(d.q, Math.round((10000 * len(best)) / len(pior)));
});

test('cansaço: a 31.ª tarefa seguida paga metade; doze horas depois o cansaço desce para metade', () => {
  const p = mk(); let t = START;
  const pagos = [];
  for (let i = 0; i < 31; i++) { const r = E.workStart(p, t, world, seededRng(9), 'camiao'); t += 20000; pagos.push(E.workDone(p, t, world, nunca, perfeita(r.task)).money); }
  assert.equal(pagos[0], 114); assert.equal(pagos[30], 57, 'trinta seguidas: metade');
  assert.ok(pagos.every((x, i) => i === 0 || x <= pagos[i - 1]), 'nunca sobe a meio');
  const agora = E.workView(p, t).tired, depois = E.workView(p, t + 12 * T.HOUR).tired;
  assert.ok(agora > 30 && agora <= 31, String(agora));
  assert.ok(Math.abs(depois - agora / 2) < 0.01, `${agora} → ${depois}`);
  assert.ok(E.workView(p, t).multBp < 5000 && E.workView(p, t + 12 * T.HOUR).multBp > 6500);
});

test('laboratório: o dinheiro é sujo (conta para a lavagem) e uma rusga leva à prisão, sem pagar', () => {
  const p = mk(); const r = E.workStart(p, START, world, seededRng(6), 'laboratorio');
  const ilegal0 = p.ilegal, d = E.workDone(p, START + 60000, world, nunca, perfeita(r.task));
  assert.equal(d.busted, false); assert.equal(p.ilegal - ilegal0, Math.floor((115 * 12000) / 10000));
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

test('turnos: cada emprego tem a sua tarefa; bem feita paga 120% do turno para o banco, gasta 10 de energia e dá 2 de respeito', () => {
  for (let i = 0; i < CFG.jobs.list.length; i++) {
    const j = CFG.jobs.list[i], p = mk(); p.job = i; p.vigor = 100; p.bank = 0;
    assert.ok(W().list.some((x) => x.id === j.task), j.id + ' tem tarefa');
    const r = E.workStart(p, START, world, seededRng(20 + i), j.task, true);
    assert.equal(r.task.shift, true);
    const resp0 = p.respect, d = E.workDone(p, START + 60000, world, nunca, perfeita(r.task));
    assert.equal(d.shift, true); assert.equal(d.q, 10000, j.id);
    assert.equal(d.money, Math.floor((E.shiftPay(j, 1) * 12000) / 10000), j.id);
    assert.equal(p.bank, d.money); assert.equal(p.vigor, 90); assert.equal(p.respect - resp0, CFG.jobs.resp); assert.equal(E.shiftsToday(p, START + 60000), 1);
  }
});

test('turnos: mal feitos pagam 80%; a tarefa tem de ser a do emprego; 6 por dia; sem energia não', () => {
  const i = CFG.jobs.list.findIndex((x) => x.task === 'contrato'), j = CFG.jobs.list[i];
  const p = mk(); p.job = i; p.vigor = 100;
  assert.throws(() => E.workStart(p, START, world, seededRng(1), 'camiao', true), code('NO_WORK'));
  const r = E.workStart(p, START, world, seededRng(2), 'contrato', true);
  const d = E.workDone(p, START + 60000, world, nunca, { picks: r.task.layout.rows.map((_, k) => k) });   // marcou tudo: as erradas não chegam para as certas
  assert.equal(d.q, 0); assert.equal(d.money, Math.floor((E.shiftPay(j, 1) * 8000) / 10000));
  const q = mk(); q.job = 0; q.vigor = 1000;
  let t = START;
  for (let k = 0; k < 6; k++) { const a = E.workStart(q, t, world, seededRng(k + 3), CFG.jobs.list[0].task, true); t += 20000; E.workDone(q, t, world, nunca, perfeita(a.task)); }
  assert.throws(() => E.workStart(q, t, world, seededRng(9), CFG.jobs.list[0].task, true), code('SHIFTS_DONE'));
  const z = mk(); z.job = 0; z.vigor = 5;
  assert.throws(() => E.workStart(z, START, world, seededRng(1), CFG.jobs.list[0].task, true), code('NO_VIGOR'));
  const semEmprego = mk(); semEmprego.job = null;
  assert.throws(() => E.workStart(semEmprego, START, world, seededRng(1), 'entregas', true), code('NO_JOB'));
});

test('turnos: o cansaço dos biscates não mexe nos turnos, e os turnos não cansam', () => {
  const p = mk(); p.job = 0; p.vigor = 100;
  const r = E.workStart(p, START, world, seededRng(5), CFG.jobs.list[0].task, true);
  E.workDone(p, START + 60000, world, nunca, perfeita(r.task));
  assert.equal(E.workView(p, START + 60000).tired, 0);
});

test('entradas e contrato: respostas com linhas repetidas ou fora da lista são recusadas', () => {
  for (const id of ['entradas', 'contrato']) {
    const i = CFG.jobs.list.findIndex((x) => x.task === id), p = mk(); p.job = i; p.vigor = 100;
    E.workStart(p, START, world, seededRng(7), id, true);
    const antes = structuredClone(p);
    for (const ans of [{ picks: [0, 0] }, { picks: [99] }, { picks: ['a'] }, { picks: null }]) assert.throws(() => E.workDone(p, START + 60000, world, nunca, ans), code('BAD_ANSWER'));
    assert.deepEqual(p, antes);
  }
});

// ---------- v68: um degrau de biscates por cada crime (17/11) ----------
test('oficina no nível 8, mudanças e desmanche no 12: pagam mais, mas menos do que o crime do mesmo nível', () => {
  assert.deepEqual(BISC().filter((x) => x.level > 1).map((x) => [x.id, x.level, x.base, !!x.bustBp]), [['oficina', 8, 110, false], ['mudancas', 12, 125, false], ['desmanche', 12, 150, true]]);
  const p = mk(); p.respect = p.peakRespect = CFG.levels[6];   // nível 7
  assert.throws(() => E.workStart(p, START, world, seededRng(1), 'oficina'), code('LOW_LEVEL'));
  // o crime do nível 8 (carros) rende mais por toque do que a oficina com tudo perfeito
  const carro = CFG.crimes.find((c) => c.id === 'carro'), ev = carro.prizes.reduce((a, [bp, lo, hi]) => a + (bp * (lo + hi)) / 2, 0) / 10000;
  assert.ok((ev * carro.p) / 10000 / (carro.e / 10) > 110 * 1.2, 'o crime paga mais à medida que se sobe');
});

test('a mesma semente dá a mesma oficina, carrinha e desmanche; a carrinha tem sempre arrumação', () => {
  for (const id of ['oficina', 'mudancas', 'desmanche']) for (let s = 1; s < 40; s++) assert.deepEqual(E.workLayout(id, s * 7919), E.workLayout(id, s * 7919));
  for (let s = 1; s < 200; s++) {
    const L = E.workLayout('mudancas', s * 104729);
    assert.equal(L.pcs.reduce((a, q) => a + q.w * q.h, 0), L.W * L.H, 'as peças enchem a carrinha');
    assert.equal(L.pcs.filter((q) => q.heavy).length, 1); assert.ok(L.pcs.filter((q) => q.fragile).length <= 1);
    assert.ok(!('x' in L.pcs[0]), 'a solução não vai para o telemóvel');
    arrumar(L);
    const D = E.workLayout('desmanche', s * 104729);
    assert.ok(D.parts.reduce((a, x) => a + x.need, 0) > D.win * 1.4, 'não dá para levar tudo');
  }
});

test('oficina: a ordem em estrela e o aperto contam; mudanças: as peças não se sobrepõem', () => {
  const p = mkAlto(); let r = E.workStart(p, START, world, seededRng(4), 'oficina');
  const bom = perfeita(r.task);
  let d = E.workDone(p, START + 60000, world, nunca, { picks: [0, 1, 2, 3, 4], holds: bom.holds });
  assert.equal(d.q, 6000, 'em roda e não em estrela: só o aperto conta');
  r = E.workStart(p, START + 60000, world, seededRng(4), 'oficina');
  d = E.workDone(p, START + 120000, world, nunca, { picks: bom.picks, holds: bom.holds.map((ms) => ms * 2) });
  assert.equal(d.q, 4000, 'o dobro do binário: só a ordem conta');
  r = E.workStart(p, START + 120000, world, seededRng(4), 'mudancas');
  const pl = perfeita(r.task).place;
  const sobre = pl.map((v, i) => (i === 1 ? [...pl[0]] : v));
  assert.throws(() => E.workDone(p, START + 180000, world, nunca, { place: sobre }), code('BAD_ANSWER'));
  const metade = pl.map((v, i) => (i % 2 ? [-1, -1, 0] : v));
  d = E.workDone(p, START + 180000, world, nunca, { place: metade });
  assert.ok(d.q > 0 && d.q < 10000);
});

test('desmanche: dinheiro sujo, 4% de rusga; quem a patrulha apanha agarrado a uma peça é visto (50%)', () => {
  const p = mkAlto(); let r = E.workStart(p, START, world, seededRng(6), 'desmanche');
  const bom = perfeita(r.task), ilegal0 = p.ilegal;
  let d = E.workDone(p, START + 60000, world, nunca, bom);
  assert.equal(d.q, 10000); assert.equal(d.busted, false); assert.equal(d.spotted, false); assert.ok(p.ilegal > ilegal0, 'dinheiro sujo');
  // visto: a rusga passa a ser 50%, sem contar a pressão policial
  r = E.workStart(p, START + 60000, world, seededRng(6), 'desmanche');
  const metade = { int: (lo) => lo, chance: (bp) => bp >= 5000, float: () => 0 };
  d = E.workDone(p, START + 120000, world, metade, { ...perfeita(r.task), spotted: true });
  assert.equal(d.busted, true); assert.equal(d.spotted, true); assert.ok(p.jailUntil >= START + 120000 + 15 * T.MIN - 1);
  // somar mais tempo do que a patrulha dá também conta como visto, diga o telemóvel o que disser
  const L = E.workLayout('desmanche', 77), tudo = { holds: L.parts.map((x) => x.need), spotted: false };
  assert.equal(E.stripSpotted(L, tudo), true);
});

