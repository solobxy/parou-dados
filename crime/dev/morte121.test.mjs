// v121: mortes (CK). No motor: quem pode matar e ser morto, o plano (estudos, contactos, a parte escolhida), o que fica e o que se
// perde ao morrer, o testamento, a investigação (ADN e prisão longa) e acabar com tudo estando preso por uma morte.
// Corre com: node --test dev/morte121.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';
import { refC } from '../engine/mundo.js';

const C = CFG.ck, START = lisbonToUtc(2027, 2, 10, 12);
const world = { start: START - 30 * T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const RESP = (lv) => CFG.levels[lv - 1] + 1;
const mk = (lv = 70) => {
  const p = E.newPlayer('k' + Math.random(), START - 20 * T.DAY, world);
  p.respect = RESP(lv); p.peakRespect = p.respect; p.cash = 500000; p.bank = 2000000; p.energy = 1000; p.t = START;
  p.eq.mao = { id: 'pistola', u: 20 }; p.inv.push({ id: 'balas', n: 200 });
  return p;
};
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
const sempre = { int: (a) => a, chance: () => true }, nunca = { int: (a, b) => b, chance: () => false };
const plano = (a, d, t = START) => {
  E.ckStart(a, d, t, world);
  E.ckStudy(a, d, t + 1, world); E.ckStudy(a, d, t + C.studyGapMs + 1, world);
  for (let i = 0; i < C.contacts; i++) E.ckContact(a, t + C.studyGapMs + 2, world);
  return t + C.studyGapMs + 3;
};

test('só a partir do nível 60, dos dois lados; não na própria gangue; o plano custa e não se abrem dois', () => {
  const a = mk(), d = mk(), fraco = mk(40), novo = mk(50);
  erro(() => E.ckStart(novo, d, START, world), 'LOW_LEVEL');
  erro(() => E.ckStart(a, fraco, START, world), 'TARGET_LOW');
  erro(() => E.ckStart(a, a, START, world), 'SELF');
  const c0 = a.cash + a.bank;
  E.ckStart(a, d, START, world);
  assert.equal(a.cash + a.bank, c0 - C.cost);
  erro(() => E.ckStart(a, d, START + 1, world), 'PLAN_OPEN');
  assert.deepEqual(E.checkInvariants(a), []);
});

test('estudos: um de cada vez (20 min), cada um mostra uma parte pela ordem; contactos da prisão primeiro', () => {
  const a = mk(), d = mk(); d.cash = 12345;
  E.ckStart(a, d, START, world);
  const r = E.ckStudy(a, d, START + 1, world);
  assert.equal(r.part, 'cash'); assert.equal(r.v, 12345);
  erro(() => E.ckStudy(a, d, START + 2, world), 'STUDY_WAIT');
  assert.equal(E.ckStudy(a, d, START + C.studyGapMs + 1, world).part, 'wh');
  a.contacts = 1; const c0 = a.cash;
  assert.equal(E.ckContact(a, START + C.studyGapMs + 2, world).cost, 0); assert.equal(a.contacts, 0);
  assert.equal(E.ckContact(a, START + C.studyGapMs + 3, world).cost, C.contactCost); assert.equal(a.cash, c0 - C.contactCost);
  erro(() => E.ckPick(a, START + C.studyGapMs + 4, world, 'cars'), 'NOT_STUDIED');
  E.ckPick(a, START + C.studyGapMs + 4, world, 'cash');
  erro(() => E.ckGo(a, d, START + C.studyGapMs + 5, world, sempre), 'NEED_CONTACTS');
});

test('matar: quem mata leva só a parte escolhida; quem morre fica com a personagem e perde o resto; testamento de 10%', () => {
  const a = mk(80), d = mk(75), t = plano(a, d);
  d.cash = 40000; d.bank = 160000; d.stats.F = 999; d.inv.push({ id: 'balas', n: 5 }); d.house = 2; d.seeds = 9;
  const hon0 = JSON.stringify(d.hon), lv0 = E.level(d), resp0 = d.respect;
  E.ckPick(a, t, world, 'cash');
  const a0 = a.cash, r = E.ckGo(a, d, t + 1, world, sempre);
  assert.equal(r.win, true); assert.equal(r.loot, 40000); assert.equal(a.cash, a0 + r.net); assert.ok(r.net <= 40000);
  // o testamento conta o que ficou depois de levarem a parte (aqui, o banco e o resto)
  assert.equal(r.will, Math.floor(((r.lost - r.loot) * C.willBp) / 10000)); assert.equal(d.ckD.lost, r.lost);
  assert.equal(d.cash, CFG.start.cash); assert.equal(d.bank, r.will, 'sem herdeiro: o testamento vai para a vida nova');
  assert.equal(d.house, 0); assert.equal(d.seeds, 0); assert.ok(!d.inv.some((x) => x.id === 'balas'));
  assert.equal(d.stats.F, 999); assert.equal(E.level(d), lv0); assert.equal(d.respect, resp0); assert.equal(JSON.stringify(d.hon), hon0);
  assert.equal(d.ckN, 1); assert.ok(d.ckG > t); assert.equal(d.ckD.by, a.id);
  assert.deepEqual(E.checkInvariants(d), []); assert.deepEqual(E.checkInvariants(a), []);
  // depois de morrer, 7 dias sem poder ser alvo
  const b = mk(90); erro(() => E.ckStart(b, d, t + 2, world), 'TARGET_GRACE');
});

test('herdeiro: o testamento vai para ele (e quem mata nunca é herdeiro de ninguém por esta via)', () => {
  const a = mk(80), d = mk(75), h = mk(20), t = plano(a, d);
  E.ckPick(a, t, world, 'cash');
  const hb = h.bank, r = E.ckGo(a, d, t + 1, world, sempre, h);
  assert.equal(h.bank, hb + r.will); assert.equal(d.bank, 0);
});

test('investigação: matar alguém muito abaixo quase sempre dá prisão; o ADN chega horas depois e a pena é longa', () => {
  const a = mk(100), d = mk(60);
  assert.equal(E.ckCaughtBp(a, d), Math.min(9500, C.probeBp + C.weakBp * (E.level(a) - E.level(d))));
  const t = plano(a, d); E.ckPick(a, t, world, 'cash');
  const r = E.ckGo(a, d, t + 1, world, sempre);
  assert.equal(r.win, true); assert.ok(a.ckw && a.ckw.at > t);
  E.touch(a, a.ckw.at + 1);
  assert.ok(a.jailUntil > a.ckw?.at || a.jailUntil > t, 'preso');
  assert.equal(a.jsr.k, 'ck');
  const ms = E.ckJailMs(d, t + 1);
  assert.ok(ms >= C.jailMinMs && ms <= C.jailMaxMs);
  // preso por uma morte: pode acabar com tudo e sai
  const cash0 = a.cash; assert.ok(cash0 > 0);
  const end = E.ckEnd(a, a.jailUntil - T.HOUR, world);
  assert.equal(a.jailUntil, 0); assert.equal(a.ckN, 1); assert.ok(end.lost >= cash0);
  assert.deepEqual(E.checkInvariants(a), []);
  erro(() => E.ckEnd(mk(), START, world), 'NOT_CK_JAIL');
});

test('falhar: quem tenta pode morrer, ser preso ou ir parar ao hospital; o plano acaba', () => {
  const fate = (roll) => { const a = mk(80), d = mk(80), t = plano(a, d); E.ckPick(a, t, world, 'cash'); return [E.ckGo(a, d, t + 1, world, { int: () => roll, chance: () => false }), a]; };
  let [r, a] = fate(0); assert.equal(r.fate, 'dead'); assert.equal(a.ckN, 1);
  [r, a] = fate(C.failDieBp); assert.equal(r.fate, 'jail'); assert.ok(a.jailUntil > START); assert.equal(a.jsr.k, 'ck');
  [r, a] = fate(9999); assert.equal(r.fate, 'hosp'); assert.ok(a.hospUntil > START); assert.equal(a.ck, null);
});

test('a parte escolhida: armazéns (droga a metade), negócios, carros', () => {
  const a = mk(80), d = mk(80);
  const erva = CFG.drugs.findIndex((x) => x.id === 'erva'); d.stock[erva] = 1000;
  assert.equal(E.ckPart(d, 'wh'), Math.floor((Math.floor((1000 * refC(erva)) / 100) * C.fenceBp) / 10000));
  d.biz[0].stored = 7000; assert.ok(E.ckPart(d, 'biz') >= 7000);
  const t = plano(a, d); E.ckStudy(a, d, t + C.studyGapMs, world);
  E.ckPick(a, t + C.studyGapMs + 1, world, 'biz'); a.energy = E.energyMax(a);
  const r = E.ckGo(a, d, t + C.studyGapMs + 2, world, sempre);
  assert.ok(r.loot >= 7000); assert.equal(d.biz[0].stored, 0);
});
