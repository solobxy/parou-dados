// v101 (pedido do Dinis: viagens entre países e arqueologia pelo mundo, nada centrado em Portugal). Voa-se para um país, compra-se
// lá o que é barato (legal ou contrabando), volta-se e vende-se ao importador. Fora do país só se faz o que se faz lá.
// Corre com: node --test dev/viagens101.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import * as MW from '../engine/mundo.js';
import { lisbonToUtc } from '../engine/time.js';
import { seededRng } from '../engine/rng.js';

const START = lisbonToUtc(2026, 11, 20, 12), world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
const mk = (nivel = true) => { const p = E.newPlayer('v' + Math.random(), START, world); if (nivel) { p.respect = 1e9; p.peakRespect = 1e9; } p.cash = 1e6; p.shieldUntil = 0; return p; };
const mercado = () => { const m = E.newMarket(); m.w = MW.newWorld(m.prices, START); return m; };
// sorteios com o resultado à escolha (o resto ao calhas, mas sempre igual)
const rngSim = (v) => { const r = seededRng(5); return { ...r, int: (a, b) => r.int(a, b), chance: () => v }; };
const sim = rngSim(true), nao = rngSim(false);
const D = (id) => CFG.travel.dests.find((d) => d.id === id);

test('voar: bilhete, nível, ida, chegada; a voar não se faz nada da cidade, mas bebe-se e lê-se', () => {
  const novo = mk(false);
  erro(() => E.travel(novo, START, world, 'ma'), 'LOW_LEVEL');
  erro(() => E.travel(novo, START, world, 'x'), 'NO_DEST');
  erro(() => E.travel(novo, START, world, '__proto__'), 'NO_DEST');
  const p = mk(), c0 = p.cash + p.bank;
  const r = E.travel(p, START, world, 'it');
  assert.equal(r.paid, D('it').ticket); assert.equal(p.cash + p.bank, c0 - D('it').ticket);
  assert.equal(p.tr.st, 'out'); assert.equal(p.tr.at, START + D('it').ms);
  erro(() => E.doCrime(p, START + 1, world, 0, nao), 'FLYING');
  erro(() => E.trBuy(p, START + 1, world, mercado(), 'limoncello', 1), 'FLYING');
  erro(() => E.travel(p, START + 1, world, 'ma'), 'FLYING');
  p.energy = 0; E.consume(p, START + 2, world, 'cerveja');   // em qualquer lado
  E.trBuy(p, START + D('it').ms, world, mercado(), 'limoncello', 1);   // já lá está
  assert.equal(p.tr.st, 'there');
  erro(() => E.doCrime(p, START + D('it').ms + 1, world, 0, nao), 'ABROAD');
});

test('lá fora: só o que é desse país, até encher a mala, e o stock é de todos', () => {
  const p = mk(), m = mercado(), t1 = START + D('ma').ms;
  E.travel(p, START, world, 'ma');
  erro(() => E.trBuy(p, t1, world, m, 'whisky', 1), 'NOT_THERE');
  erro(() => E.trBuy(p, t1, world, m, 'argao', 0), 'BAD_AMOUNT');
  erro(() => E.trBuy(p, t1, world, m, 'toString', 1), 'NO_GOOD');
  erro(() => E.trBuy(p, t1, world, m, 'argao', 11), 'BAG_FULL');
  const c0 = p.cash + p.bank, r = E.trBuy(p, t1, world, m, 'argao', 7);
  assert.equal(r.cost, 7 * CFG.travel.goods.argao.buy); assert.equal(p.cash + p.bank, c0 - r.cost);
  assert.equal(r.s, CFG.travel.goods.argao.max - 7);
  E.trBuy(p, t1, world, m, 'tabaco', 3);
  erro(() => E.trBuy(p, t1, world, m, 'tabaco', 1), 'BAG_FULL');
  // o stock: outro jogador esvazia o contrabando e ele repõe-se com o tempo
  const q = mk(); q.trB = 3; E.travel(q, START, world, 'ma');
  E.trBuy(q, t1, world, m, 'tabaco', 40);
  assert.ok(E.trState(m.w, 'tabaco', t1).s < CFG.travel.goods.tabaco.max - 40);
  assert.equal(E.trState(m.w, 'tabaco', t1 + T.HOUR).s, Math.min(CFG.travel.goods.tabaco.max, E.trState(m.w, 'tabaco', t1).s + CFG.travel.goods.tabaco.perH));
});

test('voltar, aterrar e vender: o legal vai para o banco; o contrabando paga lavagem; a alfândega fica com o lote', () => {
  const p = mk(), m = mercado(), G = CFG.travel.goods, ms = D('ma').ms;
  E.travel(p, START, world, 'ma');
  E.trBuy(p, START + ms, world, m, 'argao', 6); E.trBuy(p, START + ms, world, m, 'tabaco', 4);
  E.trBack(p, START + ms + 10, world, nao);
  assert.equal(p.tr.st, 'back');
  erro(() => E.trSell(p, START + ms + 11, world, m), 'FLYING');
  const t2 = START + 2 * ms + 10, b0 = p.bank, c0 = p.cash;
  E.touch(p, t2); assert.equal(p.tr, null); assert.ok(p.trL);
  erro(() => E.travel(p, t2, world, 'ma'), 'BAG_WAITING');
  const r = E.trSell(p, t2, world, m);
  const leg = Math.floor((6 * G.argao.sell * (10000 - Math.floor((CFG.travel.satBp * 5) / 2))) / 10000);
  assert.equal(p.bank - b0, leg, 'o legal vai para o banco');
  assert.ok(p.cash > c0, 'o contrabando vem em dinheiro');
  assert.equal(r.units, 10); assert.equal(r.respect, D('ma').r);
  assert.equal(p.cx.trip.ma, undefined, 'a contagem das honras faz-se depois da ação (como no servidor)');
  E.honorTrack(p, t2, { j: false, h: false }, 'trSell', r); assert.equal(p.cx.trip.ma, 1); assert.equal(p.c.trGoods, 10);
  assert.ok(E.trState(m.w, 'argao', t2).sat < 10000, 'o importador baixou o preço');
  assert.equal(E.trState(m.w, 'argao', t2 + 2 * T.HOUR).sat, 10000, 'e volta com o tempo');
  erro(() => E.trSell(p, t2, world, m), 'NO_BAG');
  // a alfândega: o lote de contrabando fica lá, o legal passa
  const q = mk();
  E.travel(q, START, world, 'ma'); E.trBuy(q, START + ms, world, m, 'argao', 2); E.trBuy(q, START + ms, world, m, 'tabaco', 5);
  E.trBack(q, START + ms, world, sim);
  E.touch(q, START + 2 * ms); assert.deepEqual(q.trL.sz, ['tabaco']);
  const b1 = q.bank, c1 = q.cash, rq = E.trSell(q, START + 2 * ms, world, m);
  assert.equal(q.cash, c1, 'nada do contrabando'); assert.ok(q.bank > b1);
  assert.ok(rq.lines.some((x) => x.g === 'tabaco' && x.sz));
});

test('escavar lá fora: só no país do sítio; apanhado, é deportado sem a mala e cumpre a pena cá', () => {
  const p = mk(), m = mercado(), ms = D('ma').ms;
  p.done.push('arqueologia1', 'arqueologia2', 'arqueologia3');
  erro(() => E.digStart(p, START, world, nao, 'volubilis'), 'NOT_THERE');
  E.travel(p, START, world, 'ma');
  const t1 = START + ms;
  erro(() => E.digStart(p, t1, world, nao, 'briteiros'), 'NOT_THERE');
  E.trBuy(p, t1, world, m, 'argao', 5);
  E.digStart(p, t1, world, nao, 'volubilis');
  erro(() => E.trBack(p, t1, world, nao), 'DIG_OPEN');
  // pazadas até a ronda aparecer
  let r; for (let i = 0; i < 25; i++) { r = E.digTap(p, t1 + i, world, sim, i); if (r.caught || r.end) break; }
  assert.ok(r.caught); assert.equal(r.deported.to, 'ma'); assert.equal(r.deported.bag.argao, 5);
  assert.equal(p.tr, null); assert.equal(p.trL, null); assert.ok(p.jailUntil > t1);
  assert.deepEqual(E.checkInvariants(p), []);
});

test('lá fora só se luta com quem está no mesmo país (nunca no avião, nem logo à chegada); o assassino não vai lá', () => {
  const a = mk(), d = mk(), w2 = { ...world, start: START - 30 * T.DAY }, ms = D('gb').ms;
  a.shieldUntil = 0; d.shieldUntil = 0; a.respect = d.respect;
  E.travel(d, START, w2, 'gb');
  assert.equal(E.canAttack(a, d, START + 1, w2), 'TARGET_AWAY');
  assert.equal(E.canHitman(a, d, START + 1, w2), 'TARGET_AWAY');
  E.travel(a, START + 5, w2, 'gb');
  assert.equal(E.canAttack(a, d, START + 10, w2), 'TARGET_AWAY', 'os dois no avião');
  assert.equal(E.canAttack(a, d, START + ms + 5 + 1000, w2), 'TARGET_LANDED', 'acabou de chegar');
  assert.equal(E.canAttack(a, d, START + ms + 5 + CFG.travel.graceMs, w2), null, 'no mesmo país');
  const c = mk(); c.shieldUntil = 0; E.travel(c, START, w2, 'ma');
  assert.equal(E.canAttack(c, d, START + ms + CFG.travel.graceMs, w2), 'TARGET_AWAY', 'noutro país');
  const e = mk(); e.shieldUntil = 0;
  assert.equal(E.canAttack(e, d, START + ms + CFG.travel.graceMs, w2), 'TARGET_AWAY', 'cá contra lá');
});

test('o raio-X: as armas ficam no cacifo (luta-se à mão), ou vão escondidas; apanhado, perde-as e paga multa', () => {
  const arma = (p) => { p.eq.mao = { id: 'pistola', u: 20 }; p.inv.push({ id: 'pistola', u: 5 }); };
  const p = mk(); arma(p);
  const atk0 = E.atkBp(p);
  assert.ok(atk0 > 0);
  const r = E.travel(p, START, world, 'ma', 'locker', nao);
  assert.deepEqual(r.xr, { mode: 'locker', n: 2 }); assert.equal(E.atkBp(p), 0); assert.equal(E.mainWeapon(p), null);
  const q = mk(); arma(q);
  const rq = E.travel(q, START, world, 'ma', 'hide', nao);
  assert.equal(rq.xr.caught, false); assert.equal(E.atkBp(q), atk0, 'passou: luta com elas');
  const z = mk(); arma(z); const c0 = z.cash + z.bank;
  const rz = E.travel(z, START, world, 'ma', 'hide', sim);
  assert.equal(rz.xr.caught, true); assert.deepEqual(rz.xr.lost, ['pistola', 'pistola']);
  assert.equal(z.eq.mao, null); assert.ok(!z.inv.some((x) => x.id === 'pistola'));
  assert.equal(c0 - z.cash - z.bank, D('ma').ticket + 2 * CFG.travel.xray.fine);
  for (const x of [p, q, z]) assert.deepEqual(E.checkInvariants(x), []);
  // o contacto no aeroporto: paga uma parte do valor das armas (menos com contactos da prisão) e o risco é pequeno
  const k = mk(); arma(k); const custo = E.trContactCost(k);
  assert.equal(custo, Math.max(CFG.travel.contact.min, Math.floor((2 * CFG.gear.find((x) => x.id === 'pistola').price * CFG.travel.contact.bp) / 10000)));
  k.contacts = 2; assert.ok(E.trContactCost(k) < custo || custo === CFG.travel.contact.min);
  const ck = k.cash + k.bank, rk = E.travel(k, START, world, 'ma', 'contact', nao);
  assert.equal(rk.xr.mode, 'contact'); assert.equal(ck - k.cash - k.bank, D('ma').ticket + rk.xr.bribe); assert.equal(E.atkBp(k), atk0);
  erro(() => E.travel(mk(), START, world, 'ma', 'x', nao), 'BAD_MODE');
  // o armeiro de lá: aluga a arma do país, que só conta lá
  const g = mk(); E.travel(g, START, world, 'it', 'locker', nao);
  erro(() => E.trGun(g, START + 1, world), 'FLYING');
  const tg = START + D('it').ms; E.trGun(g, tg, world);
  assert.ok(E.atkBp(g) > 0); assert.equal(E.mainWeapon(g).id, D('it').gun);
  erro(() => E.trGun(g, tg, world), 'HAVE_IT');
  E.trBack(g, tg, world, nao); assert.equal(E.atkBp(g), 0, 'a voar já não conta');
  // voltar para casa: as do cacifo voltam a contar
  E.touch(p, START + D('ma').ms); E.trBack(p, START + D('ma').ms, world, nao); E.touch(p, START + 2 * D('ma').ms);
  assert.equal(E.atkBp(p), atk0);
});

test('nada de escavação aberta, caça nem golpe grande ao embarcar', () => {
  const p = mk(); p.done.push('arqueologia1');
  E.digStart(p, START, world, nao, 'briteiros');
  erro(() => E.travel(p, START, world, 'ma'), 'DIG_OPEN');
});

test('a mala maior, por ordem, até à última', () => {
  const p = mk();
  for (let k = 1; k < CFG.travel.bag.length; k++) { const r = E.trBag(p, START, world); assert.equal(r.cap, CFG.travel.bag[k]); }
  erro(() => E.trBag(p, START, world), 'BAG_MAX');
  assert.equal(E.trBagCap(p), CFG.travel.bag.at(-1));
});

test('as contas da configuração: mais longe rende mais por hora de voo (mala cheia, preço normal)', () => {
  const caps = { 5: 10, 8: 15, 12: 15, 16: 25, 20: 25, 25: 25, 30: 40, 35: 40, 40: 40, 45: 40 };
  let ant = 0;
  for (const d of CFG.travel.dests) {
    const leg = Object.entries(CFG.travel.goods).find(([, g]) => g.at === d.id && !g.seizeBp)[1];
    const lucro = caps[d.level] * (leg.sell - leg.buy) - d.ticket, h = lucro / ((2 * d.ms) / T.HOUR);
    assert.ok(lucro > 0 && h >= ant * 0.98, d.id + ' ' + Math.round(h)); ant = h;
    // e o contrabando vale mais em média (antes da lavagem), mas pouco
    const con = Object.entries(CFG.travel.goods).find(([, g]) => g.at === d.id && g.seizeBp)[1];
    const ev = ((10000 - con.seizeBp) * con.sell) / 10000 - con.buy;
    assert.ok(ev > leg.sell - leg.buy && ev < 1.5 * (leg.sell - leg.buy), d.id + ' contrabando');
  }
  // cada sítio lá fora fica num país para onde se voa, e cada conjunto tem 5 peças novas
  for (const s of CFG.dig.sites) assert.ok(s.at === 'pt' || CFG.travel.dests.some((d) => d.id === s.at), s.id);
  const ids = Object.values(CFG.col.sets).flatMap((x) => x.items); assert.equal(new Set(ids).size, ids.length);
});

test('no máximo 3 viagens por dia de Lisboa (quem joga sem parar não vive de ir a Tânger)', () => {
  const p = mk(), m = mercado(), ms = D('ma').ms;
  let t = START;
  for (let k = 0; k < CFG.travel.perDay; k++) { E.travel(p, t, world, 'ma', 'locker', nao); t += ms; E.trBack(p, t, world, nao); t += ms; E.touch(p, t); E.trSell(p, t, world, m); }
  erro(() => E.travel(p, t, world, 'ma', 'locker', nao), 'TRIP_LIMIT');
  E.travel(p, t + T.DAY, world, 'ma', 'locker', nao);   // no dia seguinte, já pode
});
