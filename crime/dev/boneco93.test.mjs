// v93 (pedido do Dinis: inventário com o boneco, arrastar e largar para as slots ao estilo Tarkov). O motor ganha «tirar do corpo»:
// a peça volta ao inventário se houver espaço, e a mochila só sai se o que está guardado couber sem os espaços dela.
// Corre com: node --test dev/boneco93.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 22, 12);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const NOW = START;
const mk = () => { const p = E.newPlayer('b' + Math.random(), START - T.DAY, world); p.cash = 1e8; p.respect = CFG.levels[59]; p.peakRespect = p.respect; return p; };
const code = (fn) => { try { fn(); return 'ok'; } catch (e) { return e.code || e.message; } };
const vestir = (p, id) => { p.inv.push({ id }); return E.equip(p, NOW, world, p.inv.length - 1); };

test('tirar do corpo: a peça volta ao inventário e a slot fica vazia', () => {
  const p = mk(); vestir(p, 'colete');
  assert.equal(p.eq.tronco.id, 'colete');
  const n = p.inv.length, r = E.unequip(p, NOW, world, 'tronco');
  assert.equal(r.id, 'colete'); assert.equal(p.eq.tronco, null);
  assert.equal(p.inv.length, n + 1); assert.equal(p.inv.at(-1).id, 'colete');
  assert.equal(code(() => E.unequip(p, NOW, world, 'tronco')), 'NO_GEAR', 'slot vazia');
  assert.equal(code(() => E.unequip(p, NOW, world, 'mat')), 'NO_GEAR', 'slot que não existe');
  assert.equal(code(() => E.unequip(p, NOW, world, '__proto__')), 'NO_GEAR');
});

test('sem espaço no inventário não se tira nada do corpo', () => {
  const p = mk(); vestir(p, 'botas');
  while (E.invUsed(p) < E.invCap(p)) p.inv.push({ id: 'balas', n: 1 + p.inv.length });
  assert.equal(code(() => E.unequip(p, NOW, world, 'pes')), 'NO_ROOM');
  assert.equal(p.eq.pes.id, 'botas', 'continua vestida');
});

test('a mochila só sai se o que está guardado couber sem os espaços dela', () => {
  const p = mk(); vestir(p, 'mochila');
  const room = CFG.gear.find((g) => g.id === 'mochila').room;
  assert.ok(room > 0);
  while (E.invUsed(p) < E.invCap(p) - room) p.inv.push({ id: 'balas', n: 1 + p.inv.length });
  assert.equal(code(() => E.unequip(p, NOW, world, 'acess')), 'NO_ROOM', 'a própria mochila precisava de um espaço');
  p.inv.pop();
  assert.equal(code(() => E.unequip(p, NOW, world, 'acess')), 'ok');
  assert.ok(E.invUsed(p) <= E.invCap(p));
});

test('vestir por cima troca: a que estava volta ao lugar da nova no inventário', () => {
  const p = mk(); vestir(p, 'bone'); const r = vestir(p, 'gorro');
  assert.equal(r.swapped, 'bone'); assert.equal(p.eq.cabeca.id, 'gorro'); assert.ok(p.inv.some((x) => x.id === 'bone'));
});
