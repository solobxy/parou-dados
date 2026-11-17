// Passo 2 da base nova (economia nova): regras do motor, com os números da especificação da wiki.
// Corre com: node --test dev/passo2-motor.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 10);   // sexta às 10:00 de Lisboa (longe da meia-noite)
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER };
const mk = (resp = 0) => { const p = E.newPlayer('p' + Math.random(), START, world); p.respect = p.peakRespect = resp; return p; };
const lv = (n) => CFG.levels[n - 1];
const ok = { int: (lo) => lo, chance: () => true, float: () => 0 };
const k = (id) => CFG.crimes.findIndex((c) => c.id === id);
// passo 4: a pistola vai para o corpo e as balas para o inventário
const armar = (p) => { p.eq.mao = { id: 'pistola', u: 1000 }; p.inv = p.inv.filter((x) => x.id !== 'balas'); p.inv.push({ id: 'balas', n: 100000 }); return p; };
const ev = (c) => c.prizes.reduce((s, [bp, a, z]) => s + (bp * (a + z)) / 2, 0) / 10000;

test('golpes de rua: os seis da especificação (nível, stamina, média se correr bem, sucesso, média por barra)', () => {
  const tab = [['loja', 1, 10, 128, 9000, 1150], ['carteirista', 1, 10, 135, 8500, 1150], ['carro', 8, 20, 375, 8000, 1500],
    ['esticao', 12, 50, 1500, 6700, 2000], ['bomba', 18, 50, 2150, 6500, 2800], ['armado', 30, 100, 5150, 7000, 3600],
    // v72: três golpes novos, no fim da lista
    ['bicicleta', 3, 10, 152, 8500, 1292], ['multibanco', 5, 20, 325, 8000, 1300], ['farmacia', 24, 50, 2402, 6600, 3171]];
  assert.equal(CFG.crimes.length, 9);
  for (const [id, nivel, e, media, p, barra] of tab) {
    const c = CFG.crimes[k(id)];
    assert.ok(c, id); assert.equal(c.level, nivel, id); assert.equal(c.e, e, id); assert.equal(c.p, p, id);
    assert.ok(Math.abs(ev(c) - media) <= 1, `${id}: média ${ev(c)}`);
    assert.equal(c.prizes.reduce((s, [bp]) => s + bp, 0), 10000, id + ': as hipóteses somam 100%');
    const porBarra = (100 / e) * (p / 10000) * ev(c);
    assert.ok(Math.abs(porBarra - barra) / barra < 0.02, `${id}: ${Math.round(porBarra)} por barra`);
  }
  assert.deepEqual(CFG.crimes[k('carteirista')].prizes, [[6200, 15, 80, 'carteira'], [2800, 120, 320, 'telemovel'], [900, 250, 450, 'relogio'], [100, 1000, 1500, 'turista']]);
});

test('carteirista: a primeira hora de um novato (13 carteiras) dá cerca de 1 500 €, uns 800 € numa hora fraca e mais de 2 200 € numa boa', () => {
  const rng = seededRng(7), horas = [];
  for (let i = 0; i < 3000; i++) {
    const p = mk(); p.energy = 100; p.cash = 0; let t = START;
    for (let j = 0; j < 13; j++) { if (p.jailUntil > t) t = p.jailUntil; if (p.energy < 10) p.energy = 10; E.doCrime(p, t, world, k('carteirista'), rng); t += 1000; }
    horas.push(p.cash + p.inv.reduce((x, it) => x + (it.v || 0), 0));   // dinheiro na mão mais o que ficou no inventário
  }
  horas.sort((a, b) => a - b);
  const med = horas.reduce((a, b) => a + b, 0) / horas.length, q = (x) => horas[Math.floor(x * horas.length)];
  assert.ok(med > 1400 && med < 1600, 'média ' + med);
  assert.ok(q(0.1) > 600 && q(0.1) < 1000, 'hora fraca ' + q(0.1));
  assert.ok(q(0.9) > 2200, 'hora boa ' + q(0.9));
});

test('golpes: abrem pelo nível; o armado e o assalto a loja pedem pistola e gastam balas e um uso da arma (passo 4)', () => {
  const p = mk(); p.energy = 100;
  assert.throws(() => E.doCrime(p, START, world, k('carro'), ok), { code: 'LOCKED' });
  p.respect = p.peakRespect = lv(18); p.cash = 1000;
  assert.throws(() => E.doCrime(p, START, world, k('bomba'), ok), { code: 'NEED_GUN' });
  armar(p);
  const c0 = p.cash, r = E.doCrime(p, START, world, k('bomba'), ok);
  assert.equal(r.ammo, CFG.bullets.perJob); assert.equal(p.cash, c0 + r.money);
  const pobre = mk(lv(30)); pobre.eq.mao = { id: 'pistola', u: 5 };
  assert.throws(() => E.doCrime(pobre, START, world, k('armado'), ok), { code: 'NO_AMMO' });
  assert.equal(pobre.energy, CFG.energy.max, 'recusado não gasta stamina');
});

test('a rua aquece: 100%, 100%, 90%, 80%, 70%, 60%, 50%, 40% por barra seguida; arrefece com o tempo (16/11)', () => {
  const p = armar(mk(lv(30))); p.cash = 1e9;
  const vistos = [];
  let t = START;
  for (let b = 0; b < 8; b++) { p.energy = 100; const r = E.doCrime(p, t, world, k('armado'), ok); vistos.push(r.heatBp); t += 1000; }
  assert.deepEqual(vistos, [10000, 10000, 9000, 8000, 7000, 6000, 5000, 4000]);
  // o dinheiro corta pelo calor (com a mesma sorte, a 9.ª barra rende 40% da 1.ª)
  const a = armar(mk(lv(30))); a.cash = 1e9; a.energy = 100; const r1 = E.doCrime(a, t, world, k('armado'), ok);
  assert.equal(r1.heatBp, 10000, 'cada jogador tem a sua rua');
  p.energy = 100; p.sk.armas = 0; const r7 = E.doCrime(p, t, world, k('armado'), ok);   // sem a skill do passo 3, para comparar só o calor
  assert.equal(r7.value, Math.floor((r1.value * 4) / 10), 'a mesma sorte rende 40% com a rua quente');
  const meiaNoite = lisbonToUtc(2026, 11, 21, 0, 1);   // já não volta à meia-noite: 900 de stamina arrefecem em 18 h
  assert.equal(E.streetView(p, meiaNoite).heatBp, 9000);
  p.energy = 100; assert.equal(E.doCrime(p, t + 18 * T.HOUR, world, k('armado'), ok).heatBp, 10000);
});

test('respeito de uma barra de golpes: 20 + 2 por nível, até 120, vezes o calor', () => {
  for (const [nivel, esperado] of [[1, 22], [10, 40], [30, 80], [60, 120], [90, 120]]) {
    const p = armar(mk(lv(nivel))); p.cash = 1e9; const rng = seededRng(nivel);
    let resp = 0, gasto = 0; const N = 400;
    for (let i = 0; i < N; i++) {
      p.energy = 100; p.rua = null; p.jailUntil = 0; p.respect = p.peakRespect = lv(nivel);   // sem subir de nível a meio
      const r = E.doCrimeAll(p, START + i * 1000, world, k('loja'), rng); resp += r.respect; gasto += r.n * CFG.crimes[k('loja')].e;
    }
    const porBarra = (resp * 100) / gasto;   // por 100 de stamina gasta (quem é apanhado não gasta a barra toda)
    assert.ok(Math.abs(porBarra - esperado) <= Math.max(1.5, esperado * 0.06), `nível ${nivel}: ${porBarra} por barra (esperado ${esperado})`);
  }
});

test('falhar: uma em quatro é apanhada; prisão do golpe ou multa/fiança para sair já', () => {
  const tab = { carteirista: [2, 150], loja: [2, 150], carro: [5, 400], esticao: [8, 1500], bomba: [12, 2500], armado: [20, 6000] };
  for (const [id, [min, multa]] of Object.entries(tab)) {
    const p = armar(mk(lv(30))); p.cash = 1e6; p.peakRespect = lv(30);
    let i = 0; const apanhado = { int: (lo) => lo, chance: () => i++ % 2 === 1, float: () => 0.99 };
    const r = E.doCrime(p, START, world, k(id), apanhado);
    assert.equal(r.success, false); assert.equal(r.busted, true);
    assert.equal(p.jailUntil, START + min * T.MIN, id);
    assert.equal(E.bailCost(p, START), multa, id + ': multa inteira logo a seguir');
    assert.equal(E.bailCost(p, START + (min * T.MIN) / 2), Math.ceil(multa / 2), id + ': metade a meio');
  }
  assert.equal(CFG.bustBp, 2500);
});

test('stamina a mais, a droga: 30, 70, 120, 180 € por barra seguida; barra a meio paga a parte; a escada desce com o tempo (16/11)', () => {
  const p = mk(); p.cash = 1e6;
  const precos = [];
  for (let b = 0; b < 4; b++) { p.energy = 0; const r = E.refill(p, START + b, world); assert.equal(r.energy, 100); precos.push(r.price); }
  assert.deepEqual(precos, [30, 70, 120, 180]);
  assert.equal(p.addiction, 0, 'a barra não mexe no vício');
  const q = mk(); q.cash = 1e6; q.energy = 50;
  assert.equal(E.refill(q, START, world).price, 15, 'meia barra = metade de 30');
  q.energy = 0; assert.equal(E.refill(q, START + 1, world).price, 15 + 35, 'a outra metade da 1.ª e metade da 2.ª');
  const amanha = lisbonToUtc(2026, 11, 21, 9); p.energy = 0; p.energyT = amanha;
  assert.equal(E.refill(p, amanha, world).price, 30);
  const cheio = mk(); assert.throws(() => E.refill(cheio, START, world), { code: 'ENERGY_FULL' });
});

test('droga a preços reais; tomar dá o efeito, não dá stamina', () => {
  const real = { cerveja: 3, erva: 6, haxixe: 5, coca: 35, heroina: 17, ecstasy: 7, crack: 5, ketamina: 30, oxi: 9, speed: 10, cristal: 60, lsd: 8, cogumelos: 8, poppers: 10, absinto: 15 };
  for (const [id, preco] of Object.entries(real)) assert.equal(CFG.drugs.find((d) => d.id === id).price, preco, id);
  const p = mk(); p.energy = 40; const d = CFG.drugs.findIndex((x) => x.id === 'coca');
  const r = E.buyDrug(p, START, world, d);
  assert.equal(p.energy, 40); assert.equal(r.energy, 0); assert.equal(r.price, 35); assert.ok(p.fx.C, 'efeito ativo');
});

test('venda de droga na rua: haxixe no 10, cocaína no 25; uma barra dá 1 800 € e 4 000 € de lucro; clientela de 1 barra por dia mais 1 a cada 25 níveis', () => {
  const H = CFG.deal.list.findIndex((x) => x.drug === 'haxixe'), C = CFG.deal.list.findIndex((x) => x.drug === 'coca');
  const p = mk(lv(9)); p.cash = 1e6;
  assert.throws(() => E.dealBuy(p, START, world, H, 1), { code: 'LOW_LEVEL' });
  p.respect = p.peakRespect = lv(10);
  const c0 = p.cash; E.dealBuy(p, START, world, H, 1);
  assert.equal(c0 - p.cash, 2000); assert.equal(p.dst[H], 1000, 'fica à parte, em gramas');
  assert.equal(p.stock[CFG.drugs.findIndex((x) => x.id === 'haxixe')], 0, 'não vai para a discoteca (lá vende-se a preço de grosso de 80%)');
  const antes = p.cash;
  for (let i = 0; i < 10; i++) { p.energy = 100; E.deal(p, START + i, world, H); }
  assert.equal(p.cash - antes, 600 * 5, 'uma barra vende 600 g a 5 €');
  assert.equal(600 * 5 - 600 * 2, 1800, 'lucro de uma barra de haxixe');
  p.energy = 100; assert.throws(() => E.deal(p, START + 20, world, H), { code: 'NO_CLIENTS' });
  const q = mk(lv(50)); q.cash = 1e6; E.dealBuy(q, START, world, C, 2);
  let n = 0; while (n < 50) { q.energy = 100; try { E.deal(q, START + n, world, C); n++; } catch (e) { assert.equal(e.code, 'NO_CLIENTS'); break; } }
  assert.equal(n, 30, 'nível 50: 3 barras por dia');
  assert.equal(200 * 35 - 200 * 15, 4000, 'lucro de uma barra de coca');
  const amanha = lisbonToUtc(2026, 11, 21, 9); q.energy = 100; E.deal(q, amanha, world, C);
});

test('casas: barraca de 0 € com 6 espaços; só se compram; a antiga entra na troca; sem despesa; mais stamina máxima', () => {
  const H = CFG.house.tiers;
  assert.deepEqual(H.map((x) => [x.id, x.price, x.slots]), [['barraca', 0, 6], ['roulotte', 6000, 12], ['t1interior', 54000, 20], ['t1cidade', 183000, 30], ['moradia', 600000, 45], ['mansao', 3000000, 80]]);
  const p = mk(); assert.equal(p.house, 0); assert.equal(E.energyMax(p), 100);
  p.cash = 60000; p.bank = 0;
  E.buyHouse(p, START, world); assert.equal(p.cash, 54000);
  E.buyHouse(p, START, world); assert.equal(p.cash, 6000, 'paga 54 000 € − 6 000 € da roulotte');
  assert.ok(E.energyMax(p) > 100);
  assert.deepEqual(CFG.house.ups, []);
});

test('casino em euros: 5 € até ao nível 20, 20 € até ao 40, 50 € até ao 60, 1 000 € a partir do 60; mínimo 1 €', () => {
  for (const [n, max] of [[1, 5], [19, 5], [20, 20], [39, 20], [40, 50], [59, 50], [60, 1000], [100, 1000]]) assert.equal(E.casinoMax(mk(lv(n))), max, 'nível ' + n);
  assert.equal(CFG.casino.minBet, 1);
});

test('duas barras: o ginásio e as lutas gastam energia, os crimes gastam stamina', () => {
  const p = mk(); p.cash = 1000;
  const S = CFG.train.set, fim = S.lead + 4 * S.beat, gasto = 5 * CFG.train.energy;
  E.gymStart(p, START, world, 'F', 5); E.gymDone(p, START + fim, world, []);
  assert.equal(p.energy, CFG.energy.max); assert.equal(p.vigor, CFG.vigor.max - gasto);
  E.doCrime(p, START + fim + 1, world, k('loja'), ok);
  assert.equal(p.vigor, CFG.vigor.max - gasto); assert.equal(p.energy, CFG.energy.max - 10);
  p.vigor = 0; assert.throws(() => E.gymStart(p, START + fim + 2, world, 'F', 5), { code: 'NO_VIGOR' });
  E.touch(p, START + fim + 2 + 10 * T.MIN); assert.equal(p.vigor, 5, 'sobe 1 a cada 2 minutos');
});

test('armas a preços reais, sem lança-chamas nem minigun; luxo acima da mansão com os dez da wiki', () => {
  assert.equal(CFG.gear.find((w) => w.id === 'pistola').price, 1750);
  assert.ok(!CFG.gear.some((w) => w.id === 'lancachamas' || w.id === 'minigun'));
  assert.equal(CFG.gear.find((w) => w.id === 'colete').price, 600);
  assert.equal(CFG.gear.find((w) => w.id === 'navalha').price, 25);
  assert.deepEqual(CFG.luxury.list.map((x) => x.price), [12000, 25700, 80000, 200263, 550000, 2500000, 4500000, 6000000, 15000000, 40000000]);
  const p = mk(); p.cash = 13000; const r = E.buyLuxury(p, START, world);
  assert.equal(r.price, 12000); assert.equal(p.luxuries, 1); assert.equal(E.luxuryPrice(p), 25700);
});

test('negócios: lavandaria 40 000 € e 1 500 € por dia, café 60 000 € e 2 000 €, oficina 90 000 € e 3 000 €, clube 800 000 € e 25 000 €', () => {
  const tab = [['lavandaria', 40000, 1500], ['cafe', 60000, 2000], ['oficina', 90000, 3000], ['clube', 800000, 25000]];
  assert.deepEqual(CFG.biz.map((b) => b.id), tab.map((x) => x[0]));
  for (const [id, preco, dia] of tab) { const b = CFG.biz.find((x) => x.id === id); assert.equal(b.price, preco); assert.ok(Math.abs(b.perH * 24 - dia) <= 12, id); }
});

test('quem vinha da economia antiga recebe de volta o que comprou e fica com as coisas novas a zero', () => {
  const p = mk(); delete p.eco;
  p.cash = 1000; p.house = 2; p.hu = [1, 0, 0, 0]; p.weapon = 2; p.armor = 1; p.tool = 0; p.luxuries = 1;
  p.biz = [{ n: 2, stored: 0, rem: 0, t: START }, { n: 0, stored: 0, rem: 0, t: START }, { n: 0, stored: 0, rem: 0, t: START }, { n: 0, stored: 0, rem: 0, t: START }, { n: 0, stored: 0, rem: 0, t: START }];
  E.upgrade(p);
  assert.equal(p.eco, 2);
  // casa: barraca 2 000 + quarto 10 000; 1.º nível do cofre: 25% da barraca; armas 500 + 3 000 + 20 000; colete 400 + 2 500;
  // pé de cabra 500; luxo 250 000; lavandaria 3 000 + 4 500
  assert.equal(p.cash, 1000 + 12000 + 500 + 23500 + 2900 + 500 + 250000 + 7500);
  assert.equal(p.house, 0); assert.deepEqual(p.hu, []); assert.deepEqual(Object.values(p.eq).filter(Boolean), []); assert.equal(p.tool, -1); assert.equal(p.luxuries, 0);
  assert.equal(p.biz.length, CFG.biz.length); assert.ok(p.biz.every((b) => b.n === 0));
  E.upgrade(p); assert.equal(p.cash, 1000 + 12000 + 500 + 23500 + 2900 + 500 + 250000 + 7500, 'só uma vez');
  assert.deepEqual(E.checkInvariants(p), []);
});

test('putas: o preço é o da escada de stamina vezes o dela, e o que elas dão sobe a mesma escada', () => {
  const nunca = { int: (lo) => lo, chance: () => false, float: () => 0.99 };
  const i = CFG.hookers.list.findIndex((g) => g.id === 'rosinha'), g = CFG.hookers.list[i];
  const p = mk(); p.cash = 1e6; p.energy = 0;
  assert.equal(E.hookerPrice(p, i, START), Math.ceil((Math.ceil((g.e * 30) / 100) * g.valueBp) / 10000), 'primeira barra a 30 €, vezes o dela');
  E.visitHooker(p, START, world, i, nunca);
  assert.equal(p.rf.e, g.e, 'a stamina dela conta na escada do dia');
  const j = CFG.hookers.list.findIndex((x) => x.id === 'celeste'), c = CFG.hookers.list[j];
  const q = mk(); q.cash = 1e6; q.energy = 0; q.rf = { d: E.dayOf(START), e: 300 };
  assert.equal(E.hookerPrice(q, j, START), Math.ceil((180 * c.valueBp) / 10000), 'depois de três barras custa como a quarta');
  assert.equal(E.hookerPrice(q, j, lisbonToUtc(2026, 11, 21, 10)), Math.ceil((30 * c.valueBp) / 10000), 'no dia seguinte recomeça');
  assert.ok(CFG.hookers.list.every((x) => x.valueBp >= 8000 && x.valueBp <= 11500));
});
