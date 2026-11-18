// v95 (pedido do Dinis: os «books» do Torn). Comprar no alfarrabista (4 por dia, iguais para todos), ler um de cada vez
// (leva horas), 31 dias de efeito (o novo substitui o anterior), +5% de vez numa stat, «Déjà lu» repete o último; achar nos golpes.
// Corre com: node --test dev/livros95.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 22, 12);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const mk = () => { const p = E.newPlayer('l' + Math.random(), START - T.DAY, world); p.cash = 1e9; p.vigor = 1e6; return p; };
const code = (fn) => { try { fn(); return 'ok'; } catch (e) { return e.code || e.message; } };
const B = (id) => CFG.books.list.find((b) => b.id === id);
// um dia em que o livro está na prateleira (procura nos dias seguintes)
const diaCom = (id, from = START) => { for (let d = 0; d < 400; d++) { const t = from + d * T.DAY; if (E.bookShelf(t).includes(id)) return t; } throw new Error('nunca aparece ' + id); };
const dar = (p, id) => { p.bk.own[id] = (p.bk.own[id] || 0) + 1; };
const ler = (p, t, id) => { const r = E.bookRead(p, t, world, id); E.touch(p, r.end); return r.end; };

test('26 livros; a prateleira tem 4 títulos diferentes, os mesmos para todos no mesmo dia, e muda de dia para dia', () => {
  assert.equal(CFG.books.list.length, 26);
  const a = E.bookShelf(START), b = E.bookShelf(START + 3 * T.HOUR);
  assert.equal(a.length, 4); assert.equal(new Set(a).size, 4); assert.deepEqual(a, b);
  assert.ok(a.every((id) => B(id)));
  const vistos = new Set(); for (let d = 0; d < 120; d++) E.bookShelf(START + d * T.DAY).forEach((id) => vistos.add(id));
  assert.equal(vistos.size, 26, 'em 4 meses aparecem todos');
});

test('comprar: só o que está na prateleira, um de cada por dia, e paga-se o preço', () => {
  const p = mk(), t = diaCom('advogado'), fora = CFG.books.list.find((b) => !E.bookShelf(t).includes(b.id)).id;
  assert.equal(code(() => E.bookBuy(p, t, world, fora)), 'NOT_ON_SHELF');
  assert.equal(code(() => E.bookBuy(p, t, world, 'x')), 'NO_BOOK');
  const c0 = p.cash; E.bookBuy(p, t, world, 'advogado');
  assert.equal(c0 - p.cash, B('advogado').price); assert.equal(p.bk.own.advogado, 1);
  assert.equal(code(() => E.bookBuy(p, t + 1000, world, 'advogado')), 'BOUGHT_TODAY');
  p.cash = 0; p.bank = 0;
  const outro = E.bookShelf(t).find((id) => id !== 'advogado');
  assert.equal(code(() => E.bookBuy(p, t + 2000, world, outro)), 'NO_MONEY');
  assert.equal(p.bk.own[outro], undefined);
});

test('ler: um de cada vez, leva as horas do livro, e o efeito dura 31 dias (Músculo para Preguiçosos: +30% de Força no ginásio)', () => {
  const p = mk(); dar(p, 'musculo'); dar(p, 'sorri');
  assert.equal(code(() => E.bookRead(p, START, world, 'pensar')), 'NO_BOOK');
  const r = E.bookRead(p, START, world, 'musculo');
  assert.equal(r.end, START + B('musculo').h * T.HOUR);
  assert.equal(code(() => E.bookRead(p, START + 1000, world, 'sorri')), 'BOOK_BUSY');
  assert.equal(E.bookGymBp(p, 'F'), 0, 'ainda a ler');
  E.touch(p, r.end);
  assert.deepEqual(p.bk.on, { id: 'musculo', until: r.end + 31 * T.DAY });
  assert.equal(E.bookGymBp(p, 'F'), 3000); assert.equal(E.bookGymBp(p, 'I'), 0);
  // uma série perfeita de 5 na garagem: 6 pontos sem livro, 7,8 com ele
  let t = r.end + 1000; const S = CFG.train.set;
  E.gymStart(p, t, world, 'F', 5); t += S.lead + 5 * S.beat + 200;
  const d = E.gymDone(p, t, world, Array.from({ length: 5 }, (_, k) => S.lead + k * S.beat + (k % 2 ? 20 : -20)));
  assert.equal(d.gain, 7); assert.equal(p.sx.F, 800);
  E.touch(p, r.end + 31 * T.DAY);
  assert.equal(p.bk.on, null, 'acabou');
  assert.equal(p.bk.n, 1); assert.equal(p.bk.done.musculo, 1);
});

test('o livro novo substitui o efeito do anterior (Contrabando para Principiantes e depois Advogado de Bolso)', () => {
  const p = mk(); dar(p, 'advogado'); dar(p, 'contrabando');
  const base = E.portSeizeBp(p);
  let t = ler(p, START, 'contrabando');
  assert.equal(E.portSeizeBp(p), Math.floor((base * 8000) / 10000), 'Contrabando para Principiantes: −20% de apreensões');
  t = ler(p, t + 1000, 'advogado');
  assert.equal(p.bk.on.id, 'advogado');
  assert.equal(E.portSeizeBp(p), base, 'o do contrabando deixou de contar');
});

test('livros de stat: +5% de vez ao acabar (Diário de um Halterofilista: Força 200 → 210)', () => {
  const p = mk(); p.stats.F = 200; dar(p, 'diario'); dar(p, 'musculo');
  let t = ler(p, START, 'musculo');
  t = ler(p, t + 1000, 'diario');
  assert.equal(p.stats.F, 210); assert.deepEqual(p.bk.got, { s: 'F', add: 10, at: t });
  assert.equal(p.bk.on.id, 'musculo', 'o efeito que estava ativo continua');
});

test('Déjà lu: só com um livro lido antes; repete-o (efeito por mais 31 dias, ou a stat outra vez)', () => {
  const p = mk(); dar(p, 'dejalu'); dar(p, 'dejalu'); dar(p, 'quimica');
  assert.equal(code(() => E.bookRead(p, START, world, 'dejalu')), 'NO_LAST');
  let t = ler(p, START, 'quimica');
  t = ler(p, t + 10 * T.DAY, 'dejalu');
  assert.deepEqual(p.bk.on, { id: 'quimica', until: t + 31 * T.DAY });
  assert.equal(p.bk.last, 'quimica', 'o último continua a ser o que se repetiu');
});

test('preso ou no hospital lê-se, mas não se compra', () => {
  const p = mk(); dar(p, 'fitacola'); p.jailUntil = START + 5 * T.HOUR;
  assert.equal(code(() => E.bookRead(p, START, world, 'fitacola')), 'ok');
  const t = diaCom(E.bookShelf(START)[0]);
  p.jailUntil = t + T.HOUR;
  assert.equal(code(() => E.bookBuy(p, t, world, E.bookShelf(t)[0])), 'IN_JAIL');
});

test('acha-se um livro a cada 150 golpes bem-sucedidos, até ao limite de 20 guardados', () => {
  const p = mk(); p.c.wins = 149;
  p.energy = 1000; p.energyMax = 1000;
  const rng = { int: (a) => a, chance: () => true, float: () => 0 };
  const r = E.doCrime(p, START, world, 0, rng);
  assert.equal(r.success, true); assert.ok(r.book, 'achou'); assert.equal(p.bk.own[r.book], 1);
  assert.ok(CFG.books.list.find((b) => b.id === r.book).w >= 3, 'dos comuns');
  p.c.wins = 299; for (const b of CFG.books.list.slice(0, 20)) p.bk.own[b.id] = 1;
  const r2 = E.doCrime(p, START + 60000, world, 0, rng);
  assert.equal(r2.book, undefined, 'sem espaço não se acha');
  assert.equal(E.bookOwned(p), 20);
});

test('um jogador de antes da v95 fica sem livros e com tudo a zeros', () => {
  const p = mk(); delete p.bk; E.upgrade(p);
  assert.deepEqual(p.bk, { own: {}, rd: null, on: null, done: {}, last: null, n: 0, bd: null });
});
