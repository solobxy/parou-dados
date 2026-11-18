// v94 (pedido do Dinis: ginásios como no Torn — vários, uns melhores do que outros, incluindo o da prisão). Ginásios pelo mundo,
// por escalões (leve 5E, médio e pesado 10E por repetição), abertos pela ordem com a energia lá gasta e a entrada paga;
// especialistas com uma stat (ou duas) 25% acima; o da prisão só preso. Corre com: node --test dev/ginasios94.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 22, 12);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
let NOW = START;
const mk = () => { const p = E.newPlayer('g' + Math.random(), START - T.DAY, world); p.cash = 1e9; p.vigor = 1e6; return p; };
const code = (fn) => { try { fn(); return 'ok'; } catch (e) { return e.code || e.message; } };
const S = CFG.train.set;
// uma série perfeita (±20 ms em cada topo, como uma pessoa)
function serie(p, stat, reps = 5) {
  const r = E.gymStart(p, NOW, world, stat, reps);
  const taps = Array.from({ length: reps }, (_, k) => S.lead + k * S.beat + (k % 2 ? 20 : -20));
  NOW += S.lead + reps * S.beat + 200;
  const d = E.gymDone(p, NOW, world, taps);
  NOW += 1000;
  return { r, d };
}
const G = (id) => CFG.gyms.list.find((g) => g.id === id);

test('31 ginásios: 8 leves, 8 médios, 8 pesados, 6 especialistas e o da prisão; nenhum em Portugal a não ser a garagem do início', () => {
  const by = (t) => CFG.gyms.list.filter((g) => g.tier === t).length;
  assert.deepEqual([by('leve'), by('medio'), by('pesado'), by('esp'), by('prisao')], [8, 8, 8, 6, 1]);
  assert.equal(CFG.gyms.list.filter((g) => g.at === 'pt').length, 1);
  assert.ok(new Set(CFG.gyms.list.map((g) => g.at)).size >= 15, 'pelo mundo todo');
  const normais = CFG.gyms.list.filter((g) => ['leve', 'medio', 'pesado'].includes(g.tier));
  for (let i = 1; i < normais.length; i++) { assert.ok(normais[i].price > normais[i - 1].price); assert.ok(normais[i].xp > normais[i - 1].xp); }
});

test('jogador novo começa na garagem e treina como antes (1,2 pontos por repetição perfeita, 5 de energia)', () => {
  const p = mk(), v0 = p.vigor;
  assert.equal(p.gym, 'garagem'); assert.deepEqual(p.gyms, ['garagem']);
  const { d } = serie(p, 'F', 5);
  assert.equal(d.gain, 6); assert.equal(v0 - p.vigor, 25); assert.equal(p.gx, 25);
});

test('o seguinte só abre pela ordem, com a energia gasta e a entrada paga', () => {
  const p = mk();
  assert.equal(code(() => E.gymBuy(p, NOW, world, 'caveboxe')), 'GYM_LOCKED', 'salta um');
  assert.equal(code(() => E.gymBuy(p, NOW, world, 'ringue')), 'GYM_LOCKED', 'ainda sem energia gasta');
  p.gx = G('ringue').xp;
  const c0 = p.cash; const r = E.gymBuy(p, NOW, world, 'ringue');
  assert.equal(r.gym, 'ringue'); assert.equal(c0 - p.cash, G('ringue').price); assert.equal(p.gym, 'ringue');
  assert.equal(code(() => E.gymBuy(p, NOW, world, 'ringue')), 'HAVE_IT');
  E.gymUse(p, NOW, world, 'garagem'); assert.equal(p.gym, 'garagem');
  assert.equal(code(() => E.gymUse(p, NOW, world, 'olimpo')), 'NO_GYM');
  assert.equal(code(() => E.gymUse(p, NOW, world, 'prisao')), 'NO_GYM');
  p.cash = 0; p.bank = 0; p.gx = 1e9;
  assert.equal(code(() => E.gymBuy(p, NOW, world, 'caveboxe')), 'NO_MONEY');
});

test('ginásio médio: 10 de energia por repetição e ganho pelo valor do ginásio (Ferro Velho, Força 3,4 → ×3,4 por repetição)', () => {
  const p = mk(); p.gyms = CFG.gyms.list.filter((g) => g.tier === 'leve' || g.id === 'ferro').map((g) => g.id); p.gym = 'ferro';
  const v0 = p.vigor, { d } = serie(p, 'F', 5);
  assert.equal(v0 - p.vigor, 50);
  assert.equal(d.gain, Math.floor((5 * 1200 * 34 * 10) / (20 * 5) / 1000));
});

test('uma stat que o ginásio não treina é recusada (no clube de xadrez não há Força)', () => {
  const p = mk(); p.gyms.push('xadrez'); p.gym = 'xadrez';
  assert.equal(code(() => E.gymStart(p, NOW, world, 'F', 5)), 'GYM_NO_STAT');
  assert.equal(code(() => serie(p, 'I', 5)), 'ok');
});

test('especialistas: só depois do ginásio que pedem e com a stat 25% acima das outras', () => {
  const p = mk(); p.gyms = CFG.gyms.list.filter((g) => ['leve', 'medio', 'pesado'].includes(g.tier) && g.id !== 'olimpo').map((g) => g.id);
  assert.equal(code(() => E.gymBuy(p, NOW, world, 'strongman')), 'GYM_LOCKED');
  p.gyms.push('olimpo');
  p.stats = { F: 100, T: 90, I: 50, C: 50 };
  const r = E.gymBuy(p, NOW, world, 'strongman');
  assert.notEqual(r.gym, 'strongman', 'sem a stat acima, compra-se mas não fica ativo');
  p.gym = 'strongman';
  assert.equal(code(() => E.gymStart(p, NOW, world, 'F', 5)), 'GYM_REQ');
  p.stats.F = 125;
  assert.equal(code(() => serie(p, 'F', 5)), 'ok');
  // duas stats juntas
  p.gyms.push('corpo'); p.gym = 'corpo'; p.stats = { F: 100, T: 100, I: 80, C: 81 };
  assert.equal(code(() => E.gymStart(p, NOW, world, 'T', 5)), 'GYM_REQ');
  p.stats = { F: 100, T: 100, I: 80, C: 80 }; // 200 contra 160: 25% certos
  assert.equal(code(() => serie(p, 'T', 5)), 'ok');
});

test('preso treina-se no ginásio da prisão (Força e Tolerância, sem Inteligência nem Carisma); solto, no seu', () => {
  const p = mk(); p.jailUntil = NOW + T.HOUR;
  assert.equal(E.gymNow(p, NOW).id, 'prisao');
  assert.equal(code(() => E.gymStart(p, NOW, world, 'I', 5)), 'GYM_NO_STAT');
  const { r, d } = serie(p, 'T', 5);
  assert.equal(r.gym, 'prisao'); assert.equal(d.gain, Math.floor((5 * 1200 * 34) / 20 / 1000));
  p.jailUntil = 0;
  assert.equal(E.gymNow(p, NOW).id, 'garagem');
  assert.equal(code(() => E.gymBuy(p, NOW, world, 'prisao')), 'NO_GYM');
});

test('um jogador de antes da v94 fica sócio da garagem', () => {
  const p = mk(); delete p.gym; delete p.gyms; delete p.gx;
  E.upgrade(p);
  assert.equal(p.gym, 'garagem'); assert.deepEqual(p.gyms, ['garagem']); assert.equal(p.gx, 0);
});
