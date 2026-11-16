// Passo 4 da base nova: inventário e equipamento (9 espaços no corpo, objetos com espaço, desgaste das armas e balas compradas).
// Corre com: node --test dev/passo4-motor.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 10);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER };
const mk = (resp = 0) => { const p = E.newPlayer('p' + Math.random(), START, world); p.respect = p.peakRespect = resp; return p; };
const lv = (n) => CFG.levels[n - 1];
const ok = { int: (lo) => lo, chance: () => true, float: () => 0 };
const k = (id) => CFG.crimes.findIndex((c) => c.id === id);
const G = (id) => CFG.gear.find((x) => x.id === id);
const erro = (fn, code) => assert.throws(fn, (e) => e.code === code, code);
// «sorte» que tira sempre a linha do sorteio pedida (0 = a mais comum) e o valor mais baixo
const linha = (r) => ({ int: (lo, hi) => (hi === 9999 ? CFG.crimes[0].prizes.slice(0, r).reduce((s, x) => s + x[0], 0) : lo), chance: () => true, float: () => 0 });

test('equipamento: os 9 espaços da especificação, com os preços reais (pistola 1 750 €, colete 600 €, navalha 25 €)', () => {
  assert.deepEqual(CFG.slots, ['branca', 'mao', 'principal', 'cabeca', 'tronco', 'pernas', 'pes', 'maos', 'acess']);
  assert.equal(G('pistola').price, 1750); assert.equal(G('colete').price, 600); assert.equal(G('navalha').price, 25);
  for (const x of CFG.gear) assert.ok(CFG.slots.includes(x.slot) || x.slot === 'mat', x.id);   // (o material dos golpes grandes do passo 5 não se veste)
  for (const s of CFG.slots) assert.ok(CFG.gear.some((x) => x.slot === s), 'há pelo menos um objeto para ' + s);
  assert.ok(!CFG.gear.some((x) => /lanca|minigun/.test(x.id)), 'o lança-chamas e a minigun saíram');
  for (const x of CFG.gear.filter((g) => g.gun)) assert.ok(x.life > 0 && ['mao', 'principal'].includes(x.slot), x.id);
});

test('comprar: equipa logo se o espaço do corpo estiver livre; se não, a nova vai para o corpo e a antiga para o inventário', () => {
  const p = mk(); p.cash = 10000;
  E.buyItem(p, START, world, 'navalha');
  assert.equal(p.eq.branca.id, 'navalha'); assert.equal(p.inv.length, 0); assert.equal(p.cash, 10000 - 25);
  E.buyItem(p, START, world, 'soqueira');
  assert.equal(p.eq.branca.id, 'soqueira'); assert.deepEqual(p.inv.map((x) => x.id), ['navalha']);
  // trocar de volta: a do inventário vai para o corpo e a do corpo para o inventário
  E.equip(p, START, world, 0);
  assert.equal(p.eq.branca.id, 'navalha'); assert.deepEqual(p.inv.map((x) => x.id), ['soqueira']);
  erro(() => E.buyItem(p, START, world, 'nada'), 'NO_GEAR');
});

test('ataque e defesa: arma de fogo (a melhor entre a de mão e a principal) mais a arma branca; a defesa soma as peças do corpo', () => {
  const p = mk(); p.cash = 1e6; const F = p.stats.F, Tt = p.stats.T, now = START;
  const a0 = E.attackPower(p, now), d0 = E.defensePower(p, now);
  E.buyItem(p, now, world, 'navalha'); E.buyItem(p, now, world, 'pistola'); E.buyItem(p, now, world, 'cacadeira');
  assert.equal(E.attackPower(p, now), Math.floor((a0 * (10000 + G('cacadeira').atk + G('navalha').atk)) / 10000));
  for (const id of ['capacete', 'colete', 'calcas', 'botas', 'luvas']) E.buyItem(p, now, world, id);
  const def = ['capacete', 'colete', 'calcas', 'botas', 'luvas'].reduce((s, id) => s + G(id).def, 0);
  assert.equal(E.defensePower(p, now), Math.floor((d0 * (10000 + def)) / 10000));
  assert.ok(F > 0 && Tt > 0);
});

test('espaços: a casa dá os espaços (6 na barraca), a mochila mais 4; um espaço por tipo de objeto, o equipado não ocupa', () => {
  const p = mk(); p.cash = 1e6;
  assert.equal(E.invCap(p), 6); assert.equal(E.invUsed(p), 0);
  E.buyItem(p, START, world, 'mochila'); assert.equal(E.invCap(p), 10);
  E.buyItem(p, START, world, 'balas', 3); assert.equal(E.invUsed(p), 1, 'as balas empilham');
  assert.equal(p.inv.find((x) => x.id === 'balas').n, 3 * CFG.bullets.box);
  p.house = 5; assert.equal(E.invCap(p), CFG.house.tiers[5].slots + 4);
  // a droga para vender na rua ocupa um espaço por tipo
  const q = mk(lv(30)); q.cash = 1e6;
  E.dealBuy(q, START, world, 0, 1); assert.equal(E.invUsed(q), 1);
  E.dealBuy(q, START, world, 0, 1); assert.equal(E.invUsed(q), 1, 'mais haxixe não ocupa outro espaço');
  E.dealBuy(q, START, world, 1, 1); assert.equal(E.invUsed(q), 2);
});

test('sem espaço: comprar uma coisa que não cabe é recusado', () => {
  const p = mk(); p.cash = 1e6;
  for (const id of ['soqueira', 'navalha', 'cabedal', 'colete', 'balistico', 'kevlar', 'blindado']) E.buyItem(p, START, world, id);
  assert.equal(E.invUsed(p), 5);
  E.buyItem(p, START, world, 'titanio'); assert.equal(E.invUsed(p), 6);
  erro(() => E.buyItem(p, START, world, 'balas'), 'NO_ROOM');
});

test('golpes: o que é objeto vai para o inventário com o valor que saiu; o dinheiro vai para a mão', () => {
  const p = mk(); p.energy = 100; p.cash = 0;
  const c = CFG.crimes[k('carteirista')];
  const r1 = E.doCrime(p, START, world, k('carteirista'), linha(0));   // carteira: dinheiro
  assert.equal(r1.item, 'carteira'); assert.equal(p.cash, r1.money); assert.equal(p.inv.length, 0); assert.equal(r1.good, null);
  const r2 = E.doCrime(p, START + 1, world, k('carteirista'), linha(1));   // telemóvel: objeto
  assert.equal(r2.item, 'telemovel'); assert.equal(r2.money, 0); assert.equal(p.cash, r1.money);
  assert.deepEqual(p.inv, [{ id: 'telemovel', n: 1, v: r2.value }]); assert.equal(r2.value, Math.floor((c.prizes[1][1] * (10000 + E.skillBp(p, 'furto'))) / 10000));
  const r3 = E.doCrime(p, START + 2, world, k('carteirista'), linha(1));
  assert.deepEqual(p.inv, [{ id: 'telemovel', n: 2, v: r2.value + r3.value }], 'o mesmo objeto empilha');
});

test('golpes: sem espaço, o objeto vende-se logo à pressa por metade', () => {
  const p = mk(); p.energy = 100; p.cash = 0;
  p.inv = CFG.gear.filter((x) => x.slot === 'tronco').slice(0, 6).map((x) => ({ id: x.id, n: 1 }));
  const r = E.doCrime(p, START, world, k('carteirista'), linha(1));
  assert.equal(r.rushed, true); assert.equal(p.cash, Math.floor((r.value * CFG.loot.rushBp) / 10000)); assert.equal(p.inv.length, 6);
});

test('vários golpes seguidos: conta os objetos que foram para o inventário e os vendidos à pressa', () => {
  const p = mk(); p.energy = 100; p.cash = 0;
  p.inv = CFG.gear.filter((x) => x.slot === 'tronco').slice(0, 5).map((x) => ({ id: x.id, n: 1 }));   // fica 1 espaço livre
  const r = E.doCrimeAll(p, START, world, k('carteirista'), linha(1));   // telemóveis em todos
  assert.equal(r.n, 10); assert.equal(r.goodsN, 10, 'todos empilham no mesmo espaço'); assert.equal(r.rushed, undefined);
  assert.equal(p.inv.find((x) => x.id === 'telemovel').n, 10); assert.equal(r.goods.telemovel, p.inv.find((x) => x.id === 'telemovel').v);
  const q = mk(); q.energy = 100; q.cash = 0;
  q.inv = CFG.gear.filter((x) => x.slot === 'tronco').slice(0, 6).map((x) => ({ id: x.id, n: 1 }));   // cheio
  const s = E.doCrimeAll(q, START, world, k('carteirista'), linha(1));
  assert.equal(s.goodsN, undefined); assert.equal(s.rushed, 10); assert.equal(q.cash, s.money);
});

test('recetador: vende os objetos roubados pelo valor que têm; o equipamento por metade', () => {
  const p = mk(); p.energy = 100; p.cash = 0;
  E.doCrime(p, START, world, k('carteirista'), linha(1)); E.doCrime(p, START + 1, world, k('carteirista'), linha(2));
  const v = p.inv.reduce((s, x) => s + x.v, 0);
  const r = E.sellGoods(p, START + 2, world);
  assert.equal(r.money, v); assert.equal(p.cash, v); assert.equal(p.inv.length, 0);
  erro(() => E.sellGoods(p, START + 3, world), 'NOTHING_TO_SELL');
  p.cash = 10000; E.buyItem(p, START + 3, world, 'soqueira'); E.buyItem(p, START + 3, world, 'navalha');   // a soqueira vai para o inventário
  const c0 = p.cash; const s = E.sellItem(p, START + 4, world, 0);
  assert.equal(s.money, Math.floor(G('soqueira').price / 2)); assert.equal(p.cash, c0 + s.money); assert.equal(p.inv.length, 0);
});

test('armas de fogo: cada golpe com arma gasta 10 balas e um uso da arma; sem balas ou com a arma estragada não dá', () => {
  const p = mk(lv(30)); p.cash = 1e6; p.energy = 100;
  erro(() => E.doCrime(p, START, world, k('bomba'), ok), 'NEED_GUN');
  E.buyItem(p, START, world, 'pistola');
  erro(() => E.doCrime(p, START, world, k('bomba'), ok), 'NO_AMMO');
  E.buyItem(p, START, world, 'balas', 1);
  const life = G('pistola').life;
  E.doCrime(p, START, world, k('bomba'), ok);
  assert.equal(p.inv.find((x) => x.id === 'balas').n, CFG.bullets.box - CFG.bullets.perJob); assert.equal(p.eq.mao.u, life - 1);
  p.eq.mao.u = 0; p.energy = 100;
  erro(() => E.doCrime(p, START + 1, world, k('bomba'), ok), 'GUN_BROKEN');
  // reparar custa a parte gasta do preço
  const c0 = p.cash; const r = E.repair(p, START + 2, world, 'mao');
  assert.equal(r.price, G('pistola').price); assert.equal(p.cash, c0 - G('pistola').price); assert.equal(p.eq.mao.u, life);
  erro(() => E.repair(p, START + 3, world, 'mao'), 'NOT_WORN');
  // com a pistola gasta e uma caçadeira boa, o golpe usa a caçadeira
  p.eq.mao.u = 0; p.eq.principal = { id: 'cacadeira', u: 5 }; p.energy = 100;
  E.doCrime(p, START + 4, world, k('bomba'), ok);
  assert.equal(p.eq.principal.u, 4); assert.equal(p.eq.mao.u, 0);
});

test('balas: compram-se às caixas de 50 a 25 € (0,50 € cada); um golpe com arma custa cerca de 100 € entre balas e desgaste', () => {
  assert.equal(CFG.bullets.box, 50); assert.equal(CFG.bullets.price, 25); assert.equal(CFG.bullets.perJob, 10);
  const pist = G('pistola'), porGolpe = (CFG.bullets.price * CFG.bullets.perJob) / CFG.bullets.box + pist.price / pist.life;
  assert.ok(porGolpe >= 80 && porGolpe <= 110, 'custo por golpe ' + porGolpe);
});

test('jogadores antigos: a arma e a proteção passam para o corpo; quem tinha arma de fogo recebe uma caixa de balas', () => {
  const p = mk(); delete p.eq; delete p.inv; p.weapon = 2; p.armor = 1;
  E.touch(p, START + 1);
  assert.equal(p.eq.mao.id, 'pistola'); assert.equal(p.eq.mao.u, G('pistola').life); assert.equal(p.eq.tronco.id, 'colete');
  assert.deepEqual(p.inv, [{ id: 'balas', n: CFG.bullets.box }]);
  assert.equal(p.weapon, undefined); assert.equal(p.armor, undefined);
  assert.deepEqual(E.checkInvariants(p), []);
});

test('invariantes: espaços do corpo e inventário', () => {
  const p = mk(); assert.deepEqual(E.checkInvariants(p), []);
  p.eq.mao = { id: 'navalha' }; assert.ok(E.checkInvariants(p).length, 'objeto no espaço errado');
  p.eq.mao = null; p.inv = [{ id: 'telemovel', n: 0, v: 0 }]; assert.ok(E.checkInvariants(p).length, 'pilha vazia');
  p.inv = [{ id: 'balas', n: 5 }, { id: 'balas', n: 5 }]; assert.ok(E.checkInvariants(p).length, 'balas em duas pilhas');
});
