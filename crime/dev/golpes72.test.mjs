// v72 (17/11): três golpes novos (roubar bicicletas no nível 3, viciar um multibanco no 5, assaltar uma farmácia no 24),
// acrescentados no fim da lista. Os objetivos «golpe de degrau N» contam pelo degrau do golpe, não pela posição na lista.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 10);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const mk = () => { const p = E.newPlayer('g' + Math.random(), START, world); p.cash = 1e6; return p; };
const comResp = (p, r) => { p.respect = r; p.peakRespect = Math.max(p.peakRespect, r); return p; };
const nivelResp = (n) => CFG.levels[n - 1];
const K = (id) => CFG.crimes.findIndex((c) => c.id === id);

test('os três golpes novos existem, no fim da lista, e abrem no nível certo', () => {
  assert.deepEqual(CFG.crimes.slice(0, 6).map((c) => c.id), ['carteirista', 'loja', 'carro', 'esticao', 'bomba', 'armado']);
  for (const [id, lv] of [['bicicleta', 3], ['multibanco', 5], ['farmacia', 24]]) {
    const k = K(id); assert.ok(k >= 6, id + ' vai no fim');
    assert.equal(CFG.crimes[k].level, lv);
    assert.equal(E.crimeUnlocked(comResp(mk(), nivelResp(lv - 1)), k), false, id + ' fechado antes');
    assert.equal(E.crimeUnlocked(comResp(mk(), nivelResp(lv)), k), true, id + ' aberto no nível ' + lv);
  }
  assert.equal(CFG.crimes[K('farmacia')].gun, true, 'a farmácia pede arma');
});

test('rendimento por stamina: cada golpe novo fica entre os vizinhos de nível', () => {
  const ev = (c) => c.prizes.reduce((x, [bp, a, z]) => x + (bp * (a + z)) / 2, 0) / 10000;
  const porE = (id) => { const c = CFG.crimes[K(id)]; return (ev(c) * c.p) / 10000 / c.e; };
  assert.ok(porE('bicicleta') > porE('carteirista') && porE('bicicleta') < porE('carro'), 'bicicleta entre o carteirista e o carro');
  assert.ok(porE('multibanco') > porE('carteirista') * 0.95 && porE('multibanco') < porE('carro'), 'multibanco abaixo do carro');
  assert.ok(porE('farmacia') > porE('bomba') && porE('farmacia') < porE('armado'), 'farmácia entre a bomba e o assalto armado');
});

test('um jogador antigo (6 golpes no registo) passa a ter os 9, sem perder o que tinha', () => {
  const p = mk(); p.wk = [3, 2, 1, 0, 0, 0];
  E.touch(p, START + 1000);
  assert.equal(p.wk.length, CFG.crimes.length); assert.deepEqual(p.wk.slice(0, 6), [3, 2, 1, 0, 0, 0]);
  assert.deepEqual(E.checkInvariants(p).filter((x) => x === 'mastery'), []);
});

test('o objetivo do degrau conta pelo golpe e não pela posição: a bicicleta não vale um assalto armado', () => {
  const p = comResp(mk(), nivelResp(30));
  const tierOf = () => { const m = CFG.missions.find((x) => x.type === 'tier' && x.need === 6); p.mq = [CFG.missions.indexOf(m)]; return E.mission(p).have; };
  p.wk = CFG.crimes.map(() => 0); p.wk[K('bicicleta')] = 5; assert.equal(tierOf(), 2);
  p.wk[K('farmacia')] = 1; assert.equal(tierOf(), 5);
  p.wk[K('armado')] = 1; assert.equal(tierOf(), 6);
});

test('dá para fazer cada golpe novo e o saque sai da tabela dele', () => {
  for (const id of ['bicicleta', 'multibanco', 'farmacia']) {
    const k = K(id), c = CFG.crimes[k], p = comResp(mk(), nivelResp(c.level));
    if (c.gun) { p.eq.mao = { id: 'pistola', u: 1e6 }; p.inv = [{ id: 'balas', n: 1e9 }]; }
    let ok = 0;
    for (let i = 0; i < 40; i++) {
      p.energy = E.energyMax(p); p.jailUntil = 0; p.hospUntil = 0;
      try { const r = E.doCrime(p, START + i * 60000, world, k, seededRng(i + 1)); if (r.success) { ok++; assert.ok(c.prizes.some((x) => x[3] === r.item), id + ': item ' + r.item); } } catch (e) { if (!['IN_JAIL', 'NEED_GUN', 'NO_AMMO'].includes(e.code)) throw e; }
    }
    assert.ok(ok > 0, id + ': pelo menos um golpe correu bem');
  }
});
