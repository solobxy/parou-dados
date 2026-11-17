// Passo 3 da base nova: empregos por turnos, cursos e skills por família de golpe (números da especificação da wiki).
// Corre com: node --test dev/passo3-motor.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 10);   // sexta às 10:00 de Lisboa
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER };
const mk = (resp = 0) => { const p = E.newPlayer('p' + Math.random(), START, world); p.respect = p.peakRespect = resp; return p; };
const lv = (n) => CFG.levels[n - 1];
const ok = { int: (lo) => lo, chance: () => true, float: () => 0 };
const falha = { int: (lo) => lo, chance: () => false, float: () => 0 };
const j = (id) => CFG.jobs.list.findIndex((x) => x.id === id);
const k = (id) => CFG.crimes.findIndex((c) => c.id === id);
// v80: o curso só acaba com o exame passado (três perguntas certas)
const exame = (p, t) => { E.examStart(p, t, world, ok); return E.examAnswer(p, t, world, p.course.q.ids.map((i) => CFG.exam.ans[p.course.id][i])); };
const erro = (fn, code) => assert.throws(fn, (e) => e.code === code, code);

test('empregos: os seis da especificação, com o ordenado de um dia completo (6 turnos) e o curso que pedem', () => {
  const tab = [['estafeta', 1400, null], ['minimo', 1638, null], ['vigilante', 1800, 'vigilante'], ['motorista', 2500, 'pesados'],
    ['quadro', 2700, 'licenciatura'], ['senior', 4800, 'especializacao']];
  assert.equal(CFG.jobs.list.length, 6);
  for (const [id, dia, curso] of tab) { const x = CFG.jobs.list[j(id)]; assert.ok(x, id); assert.equal(x.day, dia, id); assert.equal(x.course, curso, id); }
  assert.equal(CFG.jobs.perDay, 6); assert.equal(CFG.jobs.shiftE, 10);
  const cursos = Object.fromEntries(CFG.courses.map((c) => [c.id, c]));
  assert.equal(cursos.vigilante.price, 570); assert.equal(cursos.vigilante.days, 2);
  assert.equal(cursos.pesados.price, 1500); assert.equal(cursos.pesados.days, 4);
  assert.equal(cursos.licenciatura.price, 3 * 697); assert.equal(cursos.licenciatura.days, 21);
  assert.equal(cursos.especializacao.price, 4000); assert.equal(cursos.especializacao.days, 30); assert.equal(cursos.especializacao.level, 40);
});

test('turno: gasta 10 de energia (não stamina), paga para o banco, dá respeito; 6 turnos pagam o dia certo; o 7.º é recusado', () => {
  const p = mk(); p.vigor = 100; p.energy = 100; p.bank = 0;
  erro(() => E.doShift(p, START, world), 'NO_JOB');
  E.chooseJob(p, START, world, j('minimo'));
  let pago = 0;
  for (let n = 1; n <= 6; n++) {
    const r = E.doShift(p, START + n, world);
    assert.equal(r.n, n); pago += r.money;
    assert.equal(p.vigor, 100 - 10 * n); assert.equal(p.energy, 100, 'a stamina não mexe');
  }
  assert.equal(pago, 1638); assert.equal(p.bank, 1638); assert.equal(p.cash, CFG.start.cash);
  assert.equal(p.respect, 6 * CFG.jobs.resp);
  erro(() => E.doShift(p, START + 10, world), 'SHIFTS_DONE');
  // no dia seguinte (Lisboa) recomeça
  p.vigor = 100;
  assert.equal(E.doShift(p, START + T.DAY, world).n, 1);
});

test('turno: sem energia é recusado; preso também', () => {
  const p = mk(); E.chooseJob(p, START, world, j('estafeta')); p.vigor = 9;
  erro(() => E.doShift(p, START, world), 'NO_VIGOR');
  p.vigor = 100; p.jailUntil = START + T.HOUR;
  erro(() => E.doShift(p, START, world), 'IN_JAIL');
});

test('emprego: sem curso só dá estafeta e ordenado mínimo; trocar não custa nada', () => {
  const p = mk();
  erro(() => E.chooseJob(p, START, world, j('vigilante')), 'NEED_COURSE');
  E.chooseJob(p, START, world, j('estafeta')); assert.equal(p.job, j('estafeta'));
  E.chooseJob(p, START, world, j('minimo')); assert.equal(p.job, j('minimo'));
  erro(() => E.chooseJob(p, START, world, 99), 'NO_JOB');
});

test('cursos: pagam-se à cabeça, um de cada vez, correm em tempo real e abrem o emprego quando acabam', () => {
  const p = mk(); p.cash = 10000; p.bank = 0;
  erro(() => E.startCourse(p, START, world, 'nada'), 'NO_COURSE');
  const r = E.startCourse(p, START, world, 'vigilante');
  assert.equal(r.price, 570); assert.equal(p.cash, 10000 - 570); assert.equal(p.course.id, 'vigilante'); assert.equal(p.course.end, START + 2 * T.DAY);
  erro(() => E.startCourse(p, START + 1, world, 'pesados'), 'COURSE_BUSY');
  erro(() => E.chooseJob(p, START + T.DAY, world, j('vigilante')), 'NEED_COURSE');
  E.touch(p, START + 2 * T.DAY);
  assert.ok(p.course, 'v80: no fim do tempo falta o exame'); exame(p, START + 2 * T.DAY);
  assert.equal(p.course, null); assert.deepEqual(p.done, ['vigilante']);
  E.chooseJob(p, START + 2 * T.DAY, world, j('vigilante'));
  erro(() => E.startCourse(p, START + 2 * T.DAY, world, 'vigilante'), 'COURSE_DONE');
  // sem dinheiro
  const q = mk(); q.cash = 100; q.bank = 0;
  erro(() => E.startCourse(q, START, world, 'pesados'), 'NO_MONEY');
});

test('especialização: pede nível 40 e direito nível 1 (v81; era a licenciatura)', () => {
  const p = mk(lv(40)); p.cash = 100000;
  erro(() => E.startCourse(p, START, world, 'especializacao'), 'NEED_COURSE');
  p.done = ['direito1'];
  const q = mk(lv(39)); q.cash = 100000; q.done = ['direito1'];
  erro(() => E.startCourse(q, START, world, 'especializacao'), 'LOW_LEVEL');
  E.startCourse(p, START, world, 'especializacao');
  E.touch(p, START + 30 * T.DAY); exame(p, START + 30 * T.DAY);
  E.chooseJob(p, START + 30 * T.DAY, world, j('senior'));
  p.vigor = 100; let pago = 0; for (let n = 0; n < 6; n++) pago += E.doShift(p, START + 30 * T.DAY + n, world).money;
  assert.equal(pago, 4800);
});

test('skills: cada golpe soma a stamina gasta à família; a 400 barras dá +30%; antes, em proporção', () => {
  assert.deepEqual(CFG.skills.fams, ['furto', 'assalto', 'burla', 'trafico', 'conducao', 'armas']);
  assert.equal(CFG.skills.maxBp, 3000); assert.equal(CFG.skills.fullPts, 400 * 100);
  for (const c of CFG.crimes) assert.ok(CFG.skills.fams.includes(c.fam), c.id);
  const p = mk(); p.energy = 100;
  E.doCrime(p, START, world, k('carteirista'), ok);
  assert.equal(p.sk.furto, 10);
  E.doCrime(p, START + 1, world, k('loja'), falha);
  assert.equal(p.sk.furto, 20, 'falhar também treina');
  assert.equal(E.skillBp(p, 'furto'), Math.floor((3000 * 20) / 40000));
  p.sk.furto = 20000; assert.equal(E.skillBp(p, 'furto'), 1500);
  p.sk.furto = 90000; assert.equal(E.skillBp(p, 'furto'), 3000, 'não passa dos 30%');
});

test('skills: o dinheiro do golpe sobe com a skill da família (e já não com as estrelas)', () => {
  const a = mk(), b = mk(); a.energy = b.energy = 100;
  b.sk.furto = 40000;   // skill cheia
  b.wk[k('loja')] = 500; a.wk[k('loja')] = 500;   // as vitórias antigas já não dão bónus
  const ra = E.doCrime(a, START, world, k('loja'), ok), rb = E.doCrime(b, START, world, k('loja'), ok);
  assert.equal(ra.base, rb.base);
  assert.equal(rb.value, Math.floor((ra.base * 13000) / 10000));
  assert.equal(ra.value, ra.base);
});

test('skills: vender droga na rua treina o tráfico e rende mais com ele', () => {
  const p = mk(lv(20)); p.energy = 100; p.cash = 100000;
  E.dealBuy(p, START, world, 0, 1);
  const r1 = E.deal(p, START + 1, world, 0);
  assert.equal(p.sk.trafico, CFG.deal.step);
  p.sk.trafico = 40000;
  const r2 = E.deal(p, START + 2, world, 0);
  assert.equal(r2.money, Math.floor((r1.money * 13000) / 10000));
});

test('jogadores antigos: as vitórias passam a skill da família (stamina gasta nos golpes que correram bem)', () => {
  const p = mk(); delete p.sk; p.wk = CFG.crimes.map(() => 0); p.wk[k('carteirista')] = 30; p.wk[k('esticao')] = 4; p.c.wins = 34;
  E.touch(p, START + 1);
  assert.equal(p.sk.furto, 30 * 10); assert.equal(p.sk.assalto, 4 * 50); assert.equal(p.job, -1); assert.deepEqual(p.done, []);
  assert.deepEqual(E.checkInvariants(p), []);
});

test('objetivos: as estrelas de mestria saem; entram o primeiro turno, o primeiro curso e uma skill a 100 barras', () => {
  assert.ok(!CFG.missions.some((m) => m.type === 'stars'));
  for (const t of ['shifts', 'courses', 'skill']) assert.ok(CFG.missions.some((m) => m.type === t), t);
  const p = mk(); p.vigor = 100; E.chooseJob(p, START, world, j('estafeta'));
  E.doShift(p, START, world); assert.equal(p.c.shifts, 1);
});

test('invariantes: emprego, curso e skills', () => {
  const p = mk(); assert.deepEqual(E.checkInvariants(p), []);
  p.job = 42; assert.ok(E.checkInvariants(p).length);
  p.job = -1; p.sk.furto = -1; assert.ok(E.checkInvariants(p).length);
  p.sk.furto = 0; p.course = { id: 'x', end: 1 }; assert.ok(E.checkInvariants(p).length);
});
