// v81 (pedido do Dinis, 17/11, 13:08): a Universidade junta os cursos, os estudos e as artes marciais.
// Cada estudo tem 3 níveis (cursos com exame) e um bónus que se nota. Corre com: node --test dev/universidade81.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 10);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER };
const lv = (n) => CFG.levels[n - 1];
const mk = (resp = 0) => { const p = E.newPlayer('u' + Math.random(), START, world); p.respect = p.peakRespect = resp; p.cash = 1_000_000; return p; };
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
const seq = { int: (lo) => lo, chance: () => true, float: () => 0 };
const certas = (p) => p.course.q.ids.map((i, k) => p.course.q.p[k].indexOf(CFG.exam.ans[E.examBank(p.course.id)][i]));
const acabar = (p, t) => { E.examStart(p, t, world, seq); return E.examAnswer(p, t, world, certas(p)); };

test('7 matérias com 3 níveis cada; o nível 2 pede o 1 e nível 20 de jogador', () => {
  for (const s of CFG.studies.list) for (const n of [1, 2, 3]) assert.ok(CFG.courses.find((c) => c.id === s.id + n), s.id + n);
  const p = mk(lv(25));
  erro(() => E.startCourse(p, START, world, 'medicina2'), 'NEED_COURSE');
  const q = mk(lv(4)); erro(() => E.startCourse(q, START, world, 'medicina1'), 'LOW_LEVEL');
  E.startCourse(p, START, world, 'medicina1');
  erro(() => E.startCourse(p, START, world, 'boxe1'), 'COURSE_BUSY');   // um curso de cada vez, de qualquer tipo
});

test('o exame de cada nível sai do banco da matéria e acabar dá o bónus', () => {
  const p = mk(lv(10)); E.startCourse(p, START, world, 'direito1');
  assert.equal(E.studyBp(p, 'bail'), 0);
  const t = START + 3 * T.DAY; const r = E.examStart(p, t, world, seq);
  assert.ok(r.ids.every((i) => i < CFG.exam.ans.direito.length));
  assert.equal(acabar(p, t).done, true); assert.equal(E.studyBp(p, 'bail'), 1000);
  p.done.push('direito2'); assert.equal(E.studyBp(p, 'bail'), 2000, 'conta o nível mais alto');
});

test('direito: a fiança fica mais barata', () => {
  const p = mk(lv(10)); p.jailUntil = START + 30 * T.MIN; p.jailTier = 1; p.jailT0 = START;
  const a = E.bailCost(p, START); p.done.push('direito1'); const b = E.bailCost(p, START);
  assert.equal(b, Math.max(1, Math.ceil((a * 9000) / 10000)));
});

test('gestão: os negócios rendem mais', () => {
  const p = mk(lv(10)); p.biz[0].n = 5;
  const a = E.bizRates(p, 0).perH; p.done.push('gestao1', 'gestao2', 'gestao3'); const b = E.bizRates(p, 0).perH;
  assert.ok(b > a && b <= Math.ceil((a * 11500) / 10000) + 1, `${a} → ${b}`);
});

test('boxe sobe o ataque, jiu-jitsu a defesa, krav maga um pouco dos dois', () => {
  const p = mk(lv(10)); p.stats.F = 1000; p.stats.T = 1000;
  const a0 = E.attackPower(p, START), d0 = E.defensePower(p, START);
  p.done.push('boxe1'); assert.ok(E.attackPower(p, START) > a0); assert.equal(E.defensePower(p, START), d0);
  p.done.push('jiujitsu1'); assert.ok(E.defensePower(p, START) > d0);
  const q = mk(lv(10)); q.stats.F = 1000; q.stats.T = 1000; q.done.push('kravmaga1');
  assert.ok(E.attackPower(q, START) > a0 && E.defensePower(q, START) > d0);
});

test('artes: os golpes de burla rendem mais (e os outros não)', () => {
  const k = CFG.crimes.findIndex((c) => c.fam === 'burla'), f = CFG.crimes.findIndex((c) => c.fam === 'furto');
  const run = (done, kk) => { const p = mk(lv(30)); p.peakRespect = p.respect = lv(30); p.energy = 100; p.done.push(...done); return E.doCrime(p, START, world, kk, { int: (lo, hi) => hi, chance: () => true, float: () => 0 }).value; };
  assert.ok(run(['artes1'], k) > run([], k)); assert.equal(run(['artes1'], f), run([], f));
});

test('medicina: o hospital dura menos', () => {
  assert.equal(E.studyBp({ done: ['medicina3'] }, 'hosp'), 3000);
});
