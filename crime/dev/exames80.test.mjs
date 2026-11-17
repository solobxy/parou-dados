// v80 (plano do Dinis: «cursos como uma entrevista, como no Torn»): para acabar um curso responde-se a perguntas sobre o ofício.
// Errar obriga a esperar; acertar a meio encurta o curso. Corre com: node --test dev/exames80.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 10);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER };
const mk = () => { const p = E.newPlayer('x' + Math.random(), START, world); p.cash = 100_000; return p; };
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
const seq = (...v) => { let i = 0; return { int: (lo, hi) => Math.min(hi, Math.max(lo, v[i++ % v.length])), chance: () => false, float: () => 0 }; };
// a resposta certa na posição em que aparece (as opções vêm baralhadas: p[k][d] é a opção do banco mostrada em d)
const certas = (p) => p.course.q.ids.map((i, k) => p.course.q.p[k].indexOf(CFG.exam.ans[p.course.id][i]));
const erradas = (p) => certas(p).map((x) => (x + 1) % 4);
const rnd = (seed) => { let a = seed >>> 0; const f = () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };   // mulberry32
  return { int: (lo, hi) => lo + Math.floor(f() * (hi - lo + 1)), chance: () => false, float: f }; };

test('o curso já não acaba sozinho: no fim do tempo fica à espera do exame', () => {
  const p = mk(); E.startCourse(p, START, world, 'vigilante');
  const t = START + 2 * T.DAY + T.MIN;
  E.touch(p, t);
  assert.ok(p.course, 'continua a decorrer'); assert.ok(!p.done.includes('vigilante'));
  E.examStart(p, t, world, seq(0, 1, 2));
  const r = E.examAnswer(p, t + T.MIN, world, certas(p));
  assert.equal(r.pass, true); assert.equal(r.done, true); assert.ok(p.done.includes('vigilante')); assert.equal(p.course, null);
});

test('acertar a meio encurta: 25% do curso a partir de 1/4 do tempo, outra vez a partir de metade', () => {
  const p = mk(); E.startCourse(p, START, world, 'vigilante'); const D = 2 * T.DAY;
  erro(() => E.examStart(p, START + T.HOUR, world, seq(0, 1, 2)), 'EXAM_NOT_YET');
  const t1 = START + D / 4;
  E.examStart(p, t1, world, seq(0, 1, 2));
  const r = E.examAnswer(p, t1, world, certas(p));
  assert.equal(r.pass, true); assert.equal(r.done, false); assert.equal(p.course.end, START + D - D / 4); assert.equal(p.course.cuts, 1);
  erro(() => E.examStart(p, t1 + T.MIN, world, seq(3, 4, 5)), 'EXAM_NOT_YET');   // o segundo corte só a meio
  const t2 = START + D / 2;
  E.examStart(p, t2, world, seq(3, 4, 5));
  const r2 = E.examAnswer(p, t2, world, certas(p));
  assert.equal(r2.done, true, 'com os dois cortes acaba a meio'); assert.ok(p.done.includes('vigilante'));
});

test('errar obriga a esperar 1/8 do curso (de 1 a 12 horas) e diz quais falhaste, sem dizer as certas', () => {
  const p = mk(); E.startCourse(p, START, world, 'pesados'); const t = START + 4 * T.DAY;
  E.examStart(p, t, world, seq(0, 1, 2));
  const a = certas(p); a[1] = (a[1] + 1) % 4;
  const r = E.examAnswer(p, t, world, a);
  assert.equal(r.pass, false); assert.deepEqual(r.wrong, [1]); assert.equal(r.right, undefined);
  assert.equal(r.next, t + 12 * T.HOUR); assert.equal(p.course.q, null);
  erro(() => E.examStart(p, t + T.HOUR, world, seq(0, 1, 2)), 'EXAM_WAIT');
  assert.ok(E.examStart(p, t + 12 * T.HOUR, world, seq(0, 1, 2)).ok);
  const q = mk(); E.startCourse(q, START, world, 'vigilante'); E.examStart(q, START + 2 * T.DAY, world, seq(0, 1, 2));
  assert.equal(E.examAnswer(q, START + 2 * T.DAY, world, erradas(q)).next, START + 2 * T.DAY + 6 * T.HOUR, 'vigilante: 2 dias / 8 = 6 h');
});

test('pedir o exame outra vez dá as mesmas perguntas; deixá-lo aberto mais de 15 minutos conta como chumbo', () => {
  const p = mk(); E.startCourse(p, START, world, 'vigilante'); const t = START + 2 * T.DAY;
  const a = E.examStart(p, t, world, seq(0, 1, 2)), b = E.examStart(p, t + 5 * T.MIN, world, seq(3, 4, 5));
  assert.deepEqual(a.ids, b.ids); assert.equal(b.until, t + CFG.exam.ttl);
  erro(() => E.examAnswer(p, t + 16 * T.MIN, world, [0, 0, 0]), 'NO_EXAM');
  assert.equal(p.course.next, t + CFG.exam.ttl + 6 * T.HOUR); assert.equal(p.course.why, 'ttl');
});

test('três perguntas diferentes do banco do curso; respostas mal formadas não mexem em nada', () => {
  const p = mk(); E.startCourse(p, START, world, 'licenciatura'); const t = START + 21 * T.DAY;
  const r = E.examStart(p, t, world, seq(2, 2, 2, 5, 0));
  assert.equal(new Set(r.ids).size, CFG.exam.n); assert.ok(r.ids.every((i) => i >= 0 && i < CFG.exam.ans.licenciatura.length));
  for (const bad of [null, [0, 0], [0, 0, 4], [0, 0, 0.5], 'abc', [0, 0, -1]]) erro(() => E.examAnswer(p, t, world, bad), 'EXAM_BAD');
  assert.ok(p.course.q, 'o exame continua aberto');
});

test('quem já estava num curso antes (sem exame) acaba como dantes', () => {
  const p = mk(); p.course = { id: 'vigilante', end: START + T.HOUR };
  E.touch(p, START + 2 * T.HOUR);
  assert.equal(p.course, null); assert.ok(p.done.includes('vigilante'));
});

test('as respostas certas não vão para o cliente', () => {
  assert.equal(JSON.stringify(CFG.courses).includes('ans'), false);
  for (const c of CFG.courses) assert.ok(CFG.exam.ans[c.id]?.length >= 6, 'cada curso tem pelo menos 6 perguntas');
});

test('o sorteio é justo: cada pergunta sai com a mesma hipótese, e a letra da certa muda de exame para exame', () => {
  const r = rnd(7), conta = new Array(6).fill(0), letra = [0, 0, 0, 0];
  for (let k = 0; k < 6000; k++) {
    const p = mk(); E.startCourse(p, START, world, 'vigilante'); const x = E.examStart(p, START + 2 * T.DAY, world, r);
    for (const i of x.ids) conta[i] += 1;
    letra[certas(p)[0]] += 1;
  }
  for (const c of conta) assert.ok(Math.abs(c / 6000 - 0.5) < 0.04, 'cada pergunta perto de 50%: ' + conta);
  for (const l of letra) assert.ok(Math.abs(l / 6000 - 0.25) < 0.04, 'cada letra perto de 25%: ' + letra);
});

test('um chumbo guarda as escolhas para a revisão (sem as certas); passar limpa-a', () => {
  const p = mk(); E.startCourse(p, START, world, 'vigilante'); const t = START + 2 * T.DAY;
  E.examStart(p, t, world, rnd(3)); const a = erradas(p); E.examAnswer(p, t, world, a);
  assert.deepEqual(p.course.last.sel, a); assert.equal(p.course.last.wrong.length, 3); assert.equal(p.course.why, 'wrong');
  assert.equal(JSON.stringify(p.course.last).includes('ans'), false);
  E.examStart(p, t + 6 * T.HOUR, world, rnd(4)); assert.equal(p.course.last, null);
});

test('as perguntas não se adivinham pelo tamanho: a certa é a mais comprida em no máximo 1/3, e nunca 1,3 vezes maior', async () => {
  globalThis.document ??= { documentElement: {} };   // o i18n é do browser; aqui só se lê o banco
  const I = await import('../../sites/crime/js/i18n.js');
  for (const c of CFG.courses) for (const lang of ['pt', 'en']) {
    I.setLang(lang); const banco = I.list('exq_' + c.id);
    assert.equal(banco.length, CFG.exam.ans[c.id].length, 'o banco e as respostas têm o mesmo tamanho');
    let maior = 0;
    banco.forEach((q, i) => {
      const certa = q.o[CFG.exam.ans[c.id][i]].length, outras = q.o.filter((_, j) => j !== CFG.exam.ans[c.id][i]).map((x) => x.length);
      if (certa > Math.max(...outras)) maior += 1;
      assert.ok(certa <= 1.3 * Math.max(...outras), `${c.id} ${lang} ${i + 1}: a certa é muito mais comprida`);
    });
    assert.ok(maior <= banco.length / 3, `${c.id} ${lang}: a certa é a mais comprida em ${maior} de ${banco.length}`);
  }
});
