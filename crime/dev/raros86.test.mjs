// v86 (plano do Dinis: os achados das escavações dão materiais raros para as receitas de topo). Cada sítio tem um material raro
// que aparece na grelha como mais um achado; ao sair vai para o depósito da cave e serve para os fatos blindado e de titânio e
// (v87) para as armas que só se fazem na cave. Corre com: node --test dev/raros86.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 21, 23);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const D = CFG.dig;
const mk = () => { const p = E.newPlayer('r' + Math.random(), START, world); p.cash = 1e6; p.respect = 1e7; p.peakRespect = 1e7; p.done.push('arqueologia1', 'arqueologia2', 'arqueologia3'); return p; };
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
const sorte = (raro, seed = 5) => { const r = seededRng(seed); return { int: (a, b) => r.int(a, b), chance: () => raro }; };

test('cada sítio tem o seu material raro, e cada raro serve numa receita de topo; a feira sabe o preço deles', () => {
  const raros = [...new Set(D.sites.map((s) => s.rare).filter(Boolean))];   // (v101: os sítios lá fora repetem os raros)
  assert.deepEqual([...raros].sort(), [...CFG.mat.rare].sort());
  for (const m of CFG.mat.rare) {
    assert.ok(CFG.craft.list.some((r) => r.needs[m]), m + ' serve para alguma coisa');
    assert.ok(E.matIds().includes(m)); assert.ok(E.feiraRef('mt', m) > 0);
  }
  for (const id of ['blindado', 'titanio', 'falcata', 'gladio', 'pistolaafinada', 'artesanal', 'afinada', 'tatica']) {
    const r = E.recipeOf(id), g = CFG.gear.find((x) => x.id === id);
    assert.ok(r && g, id); assert.equal(r.price, g.price / 2, id + ': metade do preço da loja');
  }
});

test('apanhado pela ronda, o raro do saco também se perde', () => {
  const p = mk();
  E.digStart(p, START, world, sorte(true, 4), 'troia');
  const safe = p.dg.safe, i = p.dg.cells.indexOf('vidro'), vazias = p.dg.cells.map((v, k) => (v ? -1 : k)).filter((k) => k >= 0);
  E.digTap(p, START + 1000, world, sorte(false), i);
  for (let k = 1; k < safe; k++) E.digTap(p, START + 1000 + k, world, sorte(false), vazias[k]);
  const r = E.digTap(p, START + 5000, world, sorte(true), vazias[safe]);
  assert.equal(r.caught, true); assert.ok(r.lost.includes('vidro'));
  assert.equal(p.mt.vidro, undefined);
});

test('a grelha às vezes tem o raro do sítio (um só, além dos achados); os números à volta contam-no', () => {
  for (const S of D.sites) {
    const p = mk(), q = mk();
    if (S.at !== 'pt') for (const x of [p, q]) x.tr = { to: S.at, st: 'there', t0: START, at: START, bag: {}, paid: {}, arm: false };   // v101: lá fora, só quem lá está
    E.digStart(p, START, world, sorte(true), S.id); E.digStart(q, START, world, sorte(false), S.id);
    if (!S.rare) { assert.equal(p.dg.cells.filter(Boolean).length, D.finds); continue; }
    assert.equal(p.dg.cells.filter((v) => v === S.rare).length, 1, S.id);
    assert.equal(p.dg.cells.filter(Boolean).length, D.finds + 1);
    assert.equal(q.dg.cells.filter((v) => v === S.rare).length, 0);
    assert.deepEqual(E.checkInvariants(p), []); assert.deepEqual(E.checkInvariants(q), []);
  }
});

test('ao sair, o raro vai para o depósito da cave (até ao teto) e os achados para a vitrine; apanhado, perde-se tudo', () => {
  const p = mk();
  E.digStart(p, START, world, sorte(true, 9), 'conimbriga');
  const i = p.dg.cells.indexOf('bronze'), j = p.dg.cells.findIndex((v) => v && v !== 'bronze');
  let r = E.digTap(p, START + 1000, world, sorte(false), i);
  assert.equal(r.v, 'bronze');
  E.digTap(p, START + 2000, world, sorte(false), j);
  const achado = p.dg.cells[j];
  r = E.digStop(p, START + 3000, world);
  assert.equal(p.mt.bronze, 1); assert.equal(p.col.bronze, undefined); assert.equal(p.col[achado], 1);
  // com o depósito cheio, o raro perde-se (como o material dos biscates)
  const q = mk(); q.mt.malha = CFG.mat.cap;
  E.digStart(q, START, world, sorte(true, 3), 'mertola');
  E.digTap(q, START + 1000, world, sorte(false), q.dg.cells.indexOf('malha'));
  const rq = E.digStop(q, START + 2000, world);
  assert.equal(q.mt.malha, CFG.mat.cap); assert.equal(rq.matLost, 1, 'o site sabe que se perdeu');
  assert.deepEqual(E.checkInvariants(q), []);
});

test('as receitas de topo: pedem os raros, ficam na bancada o tempo da receita e saem para o inventário', () => {
  const p = mk();
  Object.assign(p.mt, { motor: 1, cano: 2, chapa: 2 });
  erro(() => E.craftStart(p, START, world, 'artesanal'), 'NO_MAT');   // falta o bronze
  p.mt.bronze = 1;
  const c0 = p.cash, o = E.craftStart(p, START, world, 'artesanal');
  assert.equal(p.cash, c0 - E.recipeOf('artesanal').price); assert.equal(p.mt.bronze, undefined); assert.equal(o.end, START + E.recipeOf('artesanal').ms);
  erro(() => E.craftTake(p, START + 1000, world), 'CRAFT_WAIT');
  E.craftTake(p, o.end, world);
  const m = p.inv.find((x) => x.id === 'artesanal');
  assert.ok(m); assert.equal(m.u, CFG.gear.find((x) => x.id === 'artesanal').life, 'sai nova');
  Object.assign(p.mt, { chapa: 3, ferro: 1 });
  const b = E.craftStart(p, o.end, world, 'blindado');
  E.craftTake(p, b.end, world);
  assert.ok(p.inv.some((x) => x.id === 'blindado' && x.u === undefined), 'um colete não tem usos');
  assert.deepEqual(E.checkInvariants(p), []);
});
