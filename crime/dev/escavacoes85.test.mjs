// v85 (plano do Dinis: arqueologia em sítios a sério, achados para o museu). Escavações clandestinas: a Arqueologia da
// Universidade abre os sítios e dá pazadas seguras; uma grelha com achados escondidos, pazadas que dizem quantos há à volta, e a
// ronda depois das seguras (preso, perde-se o saco). No fim mostra-se onde estava tudo. Corre com: node --test dev/escavacoes85.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 23);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const D = CFG.dig, N = D.size * D.size;
const mk = (arq = 1) => {
  const p = E.newPlayer('d' + Math.random(), START, world);
  p.cash = 1e6; p.respect = 1e7; p.peakRespect = 1e7;
  for (let n = 1; n <= arq; n++) p.done.push('arqueologia' + n);
  return p;
};
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
// uma sorte que nunca chama a ronda (ou chama sempre), e que põe a grelha com a semente
const semRonda = (seed = 7) => { const r = seededRng(seed); return { int: (a, b) => r.int(a, b), chance: () => false }; };
const comRonda = (seed = 7) => { const r = seededRng(seed); return { int: (a, b) => r.int(a, b), chance: () => true }; };
const vazias = (p) => p.dg.cells.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
const cheias = (p) => p.dg.cells.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);

test('a Arqueologia é um estudo da Universidade com 3 níveis e banco de perguntas; abre os sítios por nível', () => {
  const st = CFG.studies.list.find((x) => x.id === 'arqueologia');
  assert.ok(st && st.kind === 'st');
  assert.equal(CFG.exam.ans.arqueologia.length, 6);
  for (let n = 1; n <= 3; n++) assert.ok(CFG.courses.some((c) => c.id === 'arqueologia' + n && c.bank === 'arqueologia'));
  for (const S of D.sites) { const k = E.digSet(S.id); assert.ok(k, S.id); assert.equal(CFG.col.sets[k].items.length, 5); }
  // os ids dos achados não repetem os que já havia
  const all = Object.values(CFG.col.sets).flatMap((x) => x.items);
  assert.equal(new Set(all).size, all.length);
  erro(() => E.digStart(mk(0), START, world, semRonda(), 'briteiros'), 'NEED_STUDY');
  const preso = mk(0); preso.jailUntil = START + T.HOUR;
  erro(() => E.digStart(preso, START, world, semRonda(), 'briteiros'), 'IN_JAIL');   // (diz que está preso, não que falta o curso)
  erro(() => E.digStart(mk(1), START, world, semRonda(), 'troia'), 'NEED_STUDY');
  erro(() => E.digStart(mk(2), START, world, semRonda(), 'mertola'), 'NEED_STUDY');
  erro(() => E.digStart(mk(3), START, world, semRonda(), 'atlantida'), 'NO_SITE');
  erro(() => E.digStart(mk(3), START, world, semRonda(), '__proto__'), 'NO_SITE');
  assert.ok(E.digStart(mk(3), START, world, semRonda(), 'mertola').ok);
});

test('começar: paga à cabeça; a grelha tem os achados do conjunto do sítio e nunca sai para o site', () => {
  const p = mk(), c0 = p.cash, S = E.siteOf('conimbriga');
  const o = E.digStart(p, START, world, semRonda(), 'conimbriga');
  assert.equal(o.price, S.price); assert.equal(p.cash, c0 - S.price); assert.equal(o.taps, D.taps); assert.equal(o.safe, D.safe + 1);
  const set = CFG.col.sets.conimbriga.items, achados = p.dg.cells.filter(Boolean);
  assert.equal(p.dg.cells.length, N); assert.equal(achados.length, D.finds);
  assert.ok(achados.every((x) => set.includes(x)));
  const v = E.digView(p, START);
  assert.equal(v.cells, undefined); assert.ok(!JSON.stringify(v).includes(achados[0]), 'a vista não leva os achados por abrir');
  erro(() => E.digStart(p, START, world, semRonda(), 'briteiros'), 'DIG_OPEN');
  const pobre = mk(); pobre.cash = 10; pobre.bank = 0;
  erro(() => E.digStart(pobre, START, world, semRonda(), 'conimbriga'), 'NO_MONEY');
  assert.equal(pobre.dg, null); assert.equal(pobre.cash, 10);
});

test('uma pazada vazia diz quantos achados há nas 8 à volta; um achado vai para o saco; a mesma casa não se abre duas vezes', () => {
  const p = mk();
  E.digStart(p, START, world, semRonda(3), 'briteiros');
  const cells = p.dg.cells.slice(), i = vazias(p)[0], S6 = D.size;
  let conta = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = (i % S6) + dx, y = Math.floor(i / S6) + dy;
    if ((dx || dy) && x >= 0 && y >= 0 && x < S6 && y < S6 && cells[y * S6 + x]) conta++;
  }
  let r = E.digTap(p, START + 1000, world, semRonda(), i);
  assert.equal(r.n, conta); assert.equal(r.v, null); assert.equal(r.used, 1);
  erro(() => E.digTap(p, START + 2000, world, semRonda(), i), 'CELL_OPEN');
  for (const bad of [-1, N, 1.5, NaN, '3']) erro(() => E.digTap(p, START + 2000, world, semRonda(), bad), 'BAD_CELL');
  const j = cheias(p)[0];
  r = E.digTap(p, START + 3000, world, semRonda(), j);
  assert.equal(r.v, cells[j]); assert.deepEqual(p.dg.got, [cells[j]]);
  assert.equal(p.col[cells[j]] || 0, 0, 'só vai para a vitrine quando se sai');
  assert.deepEqual(E.checkInvariants(p), []);
});

test('sair guarda o saco na vitrine e o sítio fica vigiado umas horas (os outros não)', () => {
  const p = mk();
  E.digStart(p, START, world, semRonda(5), 'briteiros');
  const [a, b] = cheias(p), va = p.dg.cells[a], vb = p.dg.cells[b];
  E.digTap(p, START + 1000, world, semRonda(), a); E.digTap(p, START + 2000, world, semRonda(), b);
  const grid0 = p.dg.cells.map((v) => v || 0), r = E.digStop(p, START + 3000, world);
  assert.deepEqual(r.got.sort(), [va, vb].sort());
  assert.deepEqual(r.grid, grid0, 'acabou: mostra-se onde estava tudo'); assert.equal(r.open.length, 2);
  assert.equal(p.dg, null); assert.equal((p.col[va] || 0) + (va === vb ? 0 : p.col[vb] || 0), 2);
  erro(() => E.digStop(p, START + 4000, world), 'NO_DIG');
  erro(() => E.digStart(p, START + 5000, world, semRonda(), 'briteiros'), 'DIG_WAIT');
  assert.ok(E.digStart(p, START + 5000, world, semRonda(), 'conimbriga').ok);
  E.digStop(p, START + 6000, world);
  assert.ok(E.digStart(p, START + 3000 + D.coolMs, world, semRonda(), 'briteiros').ok);
});

test('as primeiras pazadas são seguras; depois a ronda pode vir: preso, o saco perde-se, e a fiança é a do sítio', () => {
  const p = mk(3), S = E.siteOf('mertola'), seq = [];
  const rng = { ...comRonda(9), chance: (bp) => { seq.push(bp); return true; } };
  E.digStart(p, START, world, semRonda(9), 'mertola');
  const ordem = [...cheias(p), ...vazias(p)], safe = p.dg.safe;
  assert.equal(safe, D.safe + 3, 'Arqueologia 3: mais 3 seguras');
  for (let k = 0; k < safe; k++) { const r = E.digTap(p, START + k * 1000, world, rng, ordem[k]); assert.ok(!r.caught, 'pazada ' + (k + 1)); }
  assert.deepEqual(seq, [], 'nas seguras nem se tira a sorte');
  assert.ok(p.dg.got.length >= 1);
  const grid0 = p.dg.cells.map((v) => v || 0);
  const r = E.digTap(p, START + 9000, world, rng, ordem[safe]);
  assert.equal(r.caught, true); assert.deepEqual(seq, [D.riskBp]); assert.deepEqual(r.grid, grid0);
  assert.ok(r.lost.length >= 1); assert.equal(p.dg, null);
  assert.ok(Object.keys(p.col).every((k) => !p.col[k]), 'o saco ficou para trás');
  assert.equal(p.jailUntil, START + 9000 + S.jailMin * T.MIN);
  assert.equal(p.jailTier, E.DIG_JAIL + D.sites.indexOf(S));
  assert.equal(E.bailCost(p, START + 9000), S.lawyer);
  assert.ok(p.dgc.mertola > START + 9000);
  assert.equal(E.digRiskBp(D.safe), 0); assert.equal(E.digRiskBp(D.safe + 1), D.riskBp); assert.equal(E.digRiskBp(D.safe + 3), 3 * D.riskBp);
});

test('a Arqueologia dá pazadas seguras; a última pazada fecha a escavação e guarda o saco', () => {
  for (let n = 1; n <= 3; n++) assert.equal(E.digSafe(mk(n)), D.safe + n);
  assert.equal(E.digRiskBp(5, 4), D.riskBp); assert.equal(E.digRiskBp(4, 4), 0);
  const p = mk(1);
  E.digStart(p, START, world, semRonda(11), 'briteiros');
  const ordem = [...cheias(p), ...vazias(p)];
  let r;
  const taps = p.dg.taps;
  for (let k = 0; k < taps; k++) r = E.digTap(p, START + k * 1000, world, semRonda(), ordem[k]);
  assert.equal(r.end, true); assert.equal(r.got.length, Math.min(D.finds, taps)); assert.equal(r.grid.length, N); assert.equal(p.dg, null);
  assert.equal(Object.values(p.col).reduce((a, b) => a + b, 0), Math.min(D.finds, taps));
});

test('uma escavação esquecida fecha sozinha e guarda o que se achou', () => {
  const p = mk();
  E.digStart(p, START, world, semRonda(13), 'briteiros');
  const j = cheias(p)[0], v = p.dg.cells[j];
  E.digTap(p, START + 1000, world, semRonda(), j);
  E.touch(p, START + D.ttl + 1);
  assert.equal(p.dg, null); assert.equal(p.col[v], 1);
  assert.equal(p.dgc.briteiros, START + D.ttl + D.coolMs);
});

test('museu: a 1.ª entrega de um conjunto das escavações paga o dobro; as seguintes pagam 30% e não dão respeito', () => {
  const p = mk(), C = CFG.col.sets.castrejo, dar = () => { for (const i of C.items) p.col[i] = (p.col[i] || 0) + 1; return E.museumGive(p, START, world, 'castrejo'); };
  let r = dar(); assert.equal(r.cash, C.cash * 2); assert.equal(r.respect, C.resp * 2); assert.equal(r.first, true);
  r = dar(); assert.equal(r.cash, Math.floor((C.cash * CFG.col.digRepBp) / 10000)); assert.equal(r.respect, 0);
  // os conjuntos dos golpes e dos voos ficam como estavam
  const R = CFG.col.sets.raras; for (const i of R.items) p.col[i] = 2;
  E.museumGive(p, START, world, 'raras'); r = E.museumGive(p, START, world, 'raras'); assert.equal(r.cash, R.cash); assert.equal(r.respect, R.resp);
});

test('estado antigo sem os campos novos fica com eles', () => {
  const p = mk(); delete p.dg; delete p.dgc;
  E.upgrade(p);
  assert.equal(p.dg, null); assert.deepEqual(p.dgc, {});
});
