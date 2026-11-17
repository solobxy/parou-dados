import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import { roundAt, phaseAt, lisbonToUtc, localParts } from '../engine/time.js';

const START = Date.UTC(2026, 10, 20, 21, 0); // qualquer instante serve para as regras
const world = { start: START, playEnd: START + 13 * T.DAY };
const setResp = (p, r) => { p.respect = r; p.peakRespect = Math.max(p.peakRespect, r); };
const always = { int: (lo) => lo, chance: () => true, float: () => 0 };
const never = { int: (lo) => lo, chance: () => false, float: () => 0.99 };
// falha o golpe (1.ª sorte) e é apanhado (2.ª sorte)
const bust = () => { let i = 0; return { int: (lo) => lo, chance: () => i++ % 2 === 1, float: () => 0.99 }; };
const G = CFG.pvp.gainBase;

test('energia: recupera 1 a cada 2 min, sem perder progresso com consultas frequentes', () => {
  const p = E.newPlayer('a', START, world);
  p.energy = 0; p.energyT = START;
  for (let t = START; t <= START + 10 * T.MIN; t += 7_000) E.touch(p, t); // consulta a cada 7 s
  E.touch(p, START + 10 * T.MIN);
  assert.equal(p.energy, 5);
  const q = E.newPlayer('b', START, world);
  q.energy = 0; q.energyT = START;
  E.touch(q, START + 10 * T.MIN);
  assert.equal(q.energy, 5);
  assert.equal(p.energyT, q.energyT);
});

test('energia: cheia não acumula; o relógio começa quando se gasta', () => {
  const p = E.newPlayer('a', START, world);
  const t1 = START + 5 * T.HOUR; // esteve cheia 5 h
  E.doCrime(p, t1, world, 0, always);
  const e1 = CFG.energy.max - CFG.crimes[0].e;
  assert.equal(p.energy, e1);
  E.touch(p, t1 + 2 * T.MIN - 1);
  assert.equal(p.energy, e1);
  E.touch(p, t1 + 2 * T.MIN);
  assert.equal(p.energy, e1 + 1);
});

test('energia: nunca passa do máximo', () => {
  const p = E.newPlayer('a', START, world);
  p.energy = 99; p.energyT = START;
  E.touch(p, START + 3 * T.DAY);
  assert.equal(p.energy, CFG.energy.max);
});

test('vício: desce 1 por minuto e para no zero', () => {
  const p = E.newPlayer('a', START, world);
  p.energy = 0;
  E.buyDrug(p, START + 1000, world, 0);
  assert.equal(p.addiction, CFG.drugs[0].a);
  E.touch(p, START + 1000 + 1 * T.MIN + 59_999);   // 1 minuto completo
  assert.equal(p.addiction, CFG.drugs[0].a - 1);
  E.touch(p, START + 2 * T.HOUR);
  assert.equal(p.addiction, 0);
});

test('discoteca: a droga dá o efeito e não stamina (toma-se de stamina cheia); bloqueia acima do limite de vício', () => {
  const p = E.newPlayer('a', START, world);
  p.cash = 1e6;
  assert.equal(E.buyDrug(p, START, world, 0).energy, 0);
  assert.equal(p.energy, CFG.energy.max);
  p.cash = 1e6; p.energy = 0;
  p.addiction = E.addictionCap(p) - CFG.drugs[0].a + 1; p.addictionT = START;
  assert.throws(() => E.buyDrug(p, START, world, 0), { code: 'ADDICTION_LIMIT' });
  assert.equal(p.cash, 1e6); // falhar não mexe no dinheiro
});

test('probabilidade: 50% quando stats = dificuldade, limites 5% e 95%', () => {
  assert.equal(E.chanceBp(10, 10), 5000);
  assert.equal(E.chanceBp(20, 10), 8000);
  assert.equal(E.chanceBp(1, 1000), 500);
  assert.equal(E.chanceBp(1000, 1), 9500);
  assert.equal(E.chanceBp(0, 5), 500);
});

test('crime: primeiro crime tem pelo menos 70% de hipótese', () => {
  const p = E.newPlayer('a', START, world);
  assert.ok(E.crimeChanceBp(p, 0) >= 7000);
});


test('crime: a garantia do primeiro golpe é só para o carteirista e só sem respeito', () => {
  const p = E.newPlayer('a', START, world);
  p.stats.I = p.stats.F = p.stats.C = 200;
  assert.equal(E.doCrime(p, START, world, 1, never).success, false, 'outro golpe pode falhar logo');
  const q = E.newPlayer('b', START, world);
  q.respect = q.peakRespect = 1;
  assert.equal(E.doCrime(q, START, world, 0, never).success, false, 'com respeito já pode falhar');
});

test('crime: bloqueado abaixo do nível do golpe; sem stamina não faz', () => {
  const p = E.newPlayer('a', START, world);
  assert.throws(() => E.doCrime(p, START, world, CFG.crimes.length - 1, always), { code: 'LOCKED' });
  assert.throws(() => E.doCrime(p, START, world, CFG.crimes.length, always), { code: 'NO_CRIME' });
  p.energy = 4;
  assert.throws(() => E.doCrime(p, START, world, 0, always), { code: 'NO_ENERGY' });
  assert.equal(p.energy, 4);
});

test('negócios: recolher a cada segundo dá o mesmo que recolher uma vez', () => {
  const a = E.newPlayer('a', START, world); a.cash = 1e7;
  const b = E.newPlayer('b', START, world); b.cash = 1e7;
  E.buyBiz(a, START, world, 0); E.buyBiz(b, START, world, 0);
  const bankA0 = a.bank, bankB0 = b.bank;
  for (let t = START + 1000; t <= START + T.HOUR; t += 1000) E.collectBiz(a, t, world, never);
  E.collectBiz(b, START + T.HOUR, world, never);
  assert.equal(a.bank - bankA0, b.bank - bankB0);
  assert.equal(b.bank - bankB0, Math.floor(CFG.biz[0].perH * 1010 / 1000));
});

test('negócios: armazém enche em 8 h e não passa disso', () => {
  const p = E.newPlayer('a', START, world); p.cash = 1e7;
  E.buyBiz(p, START, world, 3);   // clube: o dinheiro fica na mão
  const before = p.cash;
  E.collectBiz(p, START + 3 * T.DAY, world, never);
  const perH = Math.floor(CFG.biz[3].perH * 1010 / 1000);
  assert.equal(p.cash - before, perH * 8);
});

test('negócios: cada unidade extra custa +50% (arredondado para baixo); máximo 10', () => {
  assert.equal(E.bizPrice(0, 0), 40000);
  assert.equal(E.bizPrice(0, 1), 60000);
  assert.equal(E.bizPrice(0, 2), 90000);
  assert.equal(E.bizPrice(1, 3), 202500);
  const p = E.newPlayer('a', START, world); p.cash = 1e9;
  for (let i = 0; i < 10; i++) E.buyBiz(p, START, world, 0);
  assert.throws(() => E.buyBiz(p, START, world, 0), { code: 'BIZ_MAX' });
});

test('negócios: treinar a stat a meio conta o rendimento anterior com a stat antiga', () => {
  const p = E.newPlayer('a', START, world); p.cash = 1e7;
  E.buyBiz(p, START, world, 0);
  for (let i = 0; i < 20; i++) { p.vigor = CFG.vigor.max; E.train(p, START + T.HOUR, world, 'C'); } // C 10 -> 30
  const b0 = p.bank;
  E.collectBiz(p, START + 2 * T.HOUR, world, never);
  const first = Math.floor(CFG.biz[0].perH * 1010 / 1000);        // 1.ª hora com C=10
  const second = Math.floor(CFG.biz[0].perH * 1030 / 1000);       // 2.ª hora com C=30
  assert.equal(p.bank - b0, first + second);
});

test('porto: não aceita contentores que só chegam depois do fim da ronda', () => {
  const p = E.newPlayer('a', START, world);
  assert.throws(() => E.sendPort(p, world.playEnd - T.HOUR, world, 0, 200), { code: 'ROUND_ENDING' });   // o barco de pesca demora 2 h
});

test('banco: taxa de 3% arredondada para cima', () => {
  const p = E.newPlayer('a', START, world); p.cash = 500;   // começa-se com 50 €
  E.deposit(p, START, world, 101);
  assert.equal(p.bank, 101 - 4);
});

test('ronda: nada acontece fora da ronda', () => {
  const p = E.newPlayer('a', START, world);
  assert.throws(() => E.doCrime(p, world.playEnd, world, 0, always), { code: 'ROUND_CLOSED' });
  assert.throws(() => E.doCrime(p, START - 1, world, 0, always), { code: 'ROUND_CLOSED' });
});

test('tempo: o servidor recusa ações com hora anterior à última', () => {
  const p = E.newPlayer('a', START, world);
  E.doCrime(p, START + 5000, world, 0, always);
  assert.throws(() => E.doCrime(p, START + 4000, world, 0, always), { code: 'TIME_BACKWARDS' });
});

test('ataques: nada na primeira hora; regra dos 25%; ganho pela fórmula; proteção', () => {
  const a = E.newPlayer('a', START, world), d = E.newPlayer('d', START, world);
  assert.throws(() => E.attack(a, d, START + 10 * T.MIN, world, 'beat', always), { code: 'NO_PVP_YET' });
  setResp(a, 900); setResp(d, 224);
  const t = START + 2 * T.HOUR;
  assert.throws(() => E.attack(a, d, t, world, 'beat', always), { code: 'TARGET_TOO_WEAK' });
  setResp(d, 250);
  const La = E.tier(a);   // o ganho das lutas ainda cresce pela escala antiga (até ao passo 2)
  const r = E.attack(a, d, t, world, 'beat', always);
  const exp = Math.floor(((G + La) * Math.floor(Math.sqrt(Math.floor((10000 * 250) / 900) * 10000))) / 10000);
  assert.equal(r.respect, exp);             // (base + nível) x raiz(250/900)
  assert.equal(d.respect, 250 - Math.floor(exp / 2)); // perde metade (arredondada para baixo)
  assert.equal(d.hospUntil, t + 20 * T.MIN);
  assert.equal(d.protectUntil, t + 50 * T.MIN);
  assert.throws(() => E.attack(a, d, t + 49 * T.MIN, world, 'beat', always), { code: 'TARGET_PROTECTED' });
  const t2 = d.protectUntil;
  a.energy = 100;
  const base2 = E.pvpBaseGain(a, d);
  const r2 = E.attack(a, d, t2, world, 'beat', always); // 2.º ataque ao mesmo alvo em 24 h: metade
  assert.equal(r2.respect, Math.floor(base2 / 2));
});

test('ataques: o ganho vai de metade (alvo fraco) ao dobro (alvo 4x mais forte)', () => {
  const a = E.newPlayer('a', START, world), d = E.newPlayer('d', START, world);
  setResp(a, 1000);
  const B = G + E.tier(a);                  // base + nível (escala antiga, até ao passo 2)
  setResp(d, 250); assert.equal(E.pvpBaseGain(a, d), Math.floor(B / 2));
  setResp(d, 1000); assert.equal(E.pvpBaseGain(a, d), B);
  setResp(d, 4000); assert.equal(E.pvpBaseGain(a, d), 2 * B);
  setResp(d, 99999); assert.equal(E.pvpBaseGain(a, d), 2 * B);
});

test('ataques: ninguém vai ao hospital mais de 4 vezes em 24 h', () => {
  const d = E.newPlayer('d', START, world);
  d.respect = 1000;
  let t = START + 2 * T.HOUR;
  const first = t;
  for (let i = 0; i < 4; i++) {
    const a = E.newPlayer('a' + i, START, world);
    E.attack(a, d, t, world, 'beat', always);
    t = d.protectUntil;
  }
  assert.equal(d.capUntil, first + T.DAY);
  const a5 = E.newPlayer('a5', START, world);
  // mesmo que ele próprio ataque (perde a proteção normal), o limite fixo mantém-se
  const v = E.newPlayer('v', START, world); v.respect = 1000;
  E.attack(d, v, t + T.HOUR, world, 'beat', always);
  assert.equal(d.protectUntil, 0);
  assert.throws(() => E.attack(a5, d, first + T.DAY - 1, world, 'beat', always), { code: 'TARGET_PROTECTED' });
  a5.energy = 100;
  E.attack(a5, d, first + T.DAY, world, 'beat', always);
});

test('ataques: quem perde vai para o hospital e perde metade do ganho', () => {
  const a = E.newPlayer('a', START, world), d = E.newPlayer('d', START, world);
  setResp(a, 500); setResp(d, 500);
  const t = START + 2 * T.HOUR;
  const r = E.attack(a, d, t, world, 'beat', never);
  assert.equal(r.win, false);
  assert.equal(a.respect, 500 - Math.floor((G + E.tier(d)) / 2)); // perde metade da base (mesmo nível)
  assert.equal(d.respect, 500 + CFG.pvp.defendGain);
  assert.ok(a.hospUntil > t);
});

test('nível: nunca desce quando se perde respeito', () => {
  const p = E.newPlayer('a', START, world);
  const edge = CFG.levels[9];
  setResp(p, edge + 5);                          // logo acima de um patamar
  const L = E.level(p);
  assert.equal(L, 10);
  const d = E.newPlayer('d', START, world); setResp(d, edge + 5); d.stats.T = 1000;
  E.attack(p, d, START + 2 * T.HOUR, world, 'beat', never);
  assert.ok(p.respect < edge);                   // ficou abaixo do patamar
  assert.equal(E.level(p), L);
});

test('negócios: cada compra dá respeito uma vez', () => {
  const p = E.newPlayer('a', START, world); p.cash = 1e7;
  const r = E.buyBiz(p, START, world, 3);
  const R = CFG.biz[3].resp;
  assert.equal(r.respect, R);
  assert.equal(p.respect, R);
  E.collectBiz(p, START + T.HOUR, world, never);
  assert.equal(p.respect, R);                    // recolher não dá respeito
});

test('ataques: assalto leva 25% do dinheiro na mão e do armazém ilegal, nunca do banco', () => {
  const a = E.newPlayer('a', START, world), d = E.newPlayer('d', START, world);
  d.cash = 1e6;
  E.buyBiz(d, START, world, 3);                      // clube (ilegal)
  E.buyBiz(d, START, world, 0);                      // lavandaria (legal)
  d.cash = 1000; d.bank = 50000;
  const t = START + 2 * T.HOUR;
  const expect = E.mugValue(a, d, t);
  const r = E.attack(a, d, t, world, 'mug', always);
  const stored1 = Math.floor(CFG.biz[3].perH * 1010 / 1000) * 2;  // 2 h de clube
  assert.equal(r.money, 250 + Math.floor(stored1 / 4));
  assert.equal(r.money, expect);
  assert.equal(d.cash, 750);
  assert.equal(d.bank, 50000);
  assert.equal(d.biz[3].stored, stored1 - Math.floor(stored1 / 4));
  assert.equal(d.biz[0].stored, Math.floor(CFG.biz[0].perH * 1010 / 1000) * 2); // legal fica intacto
});

test('ranking: empate desfaz-se por quem lá chegou primeiro', () => {
  const x = { id: 'x', respect: 10, respectAt: 5 }, y = { id: 'y', respect: 10, respectAt: 3 }, z = { id: 'z', respect: 11, respectAt: 9 };
  assert.deepEqual(E.ranking([x, y, z]).map((p) => p.id), ['z', 'y', 'x']);
});

test('calendário: rondas começam sexta às 21:00 de Lisboa, também na mudança de hora', () => {
  const first = { y: 2026, m: 11, d: 20 }; // sexta-feira
  for (let n = 0; n < 30; n++) {
    const r = roundAt(first, n);
    for (const t of [r.start, r.playEnd, r.nextStart]) {
      const p = localParts(t);
      assert.equal(p.h, 21); assert.equal(p.mi, 0);
    }
    const wd = new Date(Date.UTC(localParts(r.start).y, localParts(r.start).m - 1, localParts(r.start).d)).getUTCDay();
    assert.equal(wd, 5);
    const lenH = (r.playEnd - r.start) / T.HOUR;
    assert.ok([311, 312, 313].includes(lenH), `ronda ${n}: ${lenH} h`);
    assert.equal(roundAt(first, n + 1).start, r.nextStart);
    assert.equal(phaseAt(first, r.start).phase, 'play');
    assert.equal(phaseAt(first, r.playEnd - 1).phase, 'play');
    assert.equal(phaseAt(first, r.playEnd).phase, 'pause');
    assert.equal(phaseAt(first, r.nextStart - 1).round.n, n);
  }
});

test('calendário: hora que não existe é recusada', () => {
  assert.throws(() => lisbonToUtc(2027, 3, 28, 1, 30), /LOCAL_TIME_INVALID/);
});

test('aleatório: inteiros uniformes dentro dos limites', () => {
  const r = seededRng(42);
  const counts = [0, 0, 0];
  for (let i = 0; i < 30000; i++) counts[r.int(0, 2)]++;
  for (const c of counts) assert.ok(Math.abs(c - 10000) < 400);
  for (let i = 0; i < 1000; i++) { const x = r.int(12, 28); assert.ok(x >= 12 && x <= 28); }
});

test('luxos: pela ordem da lista, cada um dá uma vez a raiz do preço em respeito; acaba no último', () => {
  const p = E.newPlayer('a', START, world); p.cash = 2 ** 52; const c0 = p.cash;
  E.buyLuxury(p, START, world);
  E.buyLuxury(p, START, world);
  const L = CFG.luxury.list;
  assert.equal(p.respect, Math.floor(Math.sqrt(L[0].price)) + Math.floor(Math.sqrt(L[1].price)));
  assert.equal(E.luxuryPrice(p), L[2].price);
  for (let i = 2; i < L.length; i++) E.buyLuxury(p, START, world);
  assert.equal(c0 - p.cash, L.reduce((x, l) => x + l.price, 0));
  assert.equal(E.luxuryPrice(p), null);
  assert.throws(() => E.buyLuxury(p, START, world), { code: 'LUXURY_MAX' });
  assert.ok(Number.isSafeInteger(p.cash));
});

test('negócios: o bónus da stat para nos x2', () => {
  const p = E.newPlayer('a', START, world); p.cash = 1e7;
  E.buyBiz(p, START, world, 1);
  p.stats.C = 5000;
  assert.equal(E.bizRates(p, 1).perH, 2 * CFG.biz[1].perH);
});

test('recarga: enche até à stamina máxima da casa, ao preço da escada, sem mexer no vício', () => {
  const p = E.newPlayer('a', START, world); p.cash = 500;   // começa-se com 50 €
  p.energy = 3;
  const plan = E.refillPlan(p, START);
  assert.equal(plan.energy, CFG.energy.max - 3);
  assert.equal(plan.cost, Math.ceil((97 * 30) / 100));
  const before = p.cash;
  const r = E.refill(p, START, world);
  assert.equal(p.energy, CFG.energy.max);
  assert.equal(p.addiction, 0); assert.equal(r.addiction, 0);
  assert.equal(before - p.cash, r.price); assert.equal(r.price, plan.cost);
  assert.throws(() => E.refill(p, START, world), { code: 'ENERGY_FULL' });
  // sem dinheiro recusa sem mexer em nada
  const q = E.newPlayer('b', START, world); q.energy = 0; q.cash = 0;
  const snap = JSON.stringify(q);
  assert.throws(() => E.refill(q, START, world), { code: 'NO_MONEY' });
  assert.equal(JSON.stringify(q), snap);
});

test('recarga: na mansão enche até 130 (os últimos 30 já são da segunda barra)', () => {
  const p = E.newPlayer('a', START, world); p.cash = 1e6; p.house = CFG.house.tiers.length - 1; p.energy = 0;
  assert.equal(E.energyMax(p), 130);
  const r = E.refill(p, START, world);
  assert.equal(r.energy, 130); assert.equal(r.price, 30 + Math.ceil((30 * 70) / 100));
});

test('recarga e desintoxicação: 20 000 casos aleatórios sem quebrar regras', () => {
  const r = seededRng(42);
  for (let i = 0; i < 20000; i++) {
    const p = E.newPlayer('f' + i, START, world);
    for (const s of E.STATS) p.stats[s] = r.int(10, 3000);
    setResp(p, r.int(0, 40000));
    p.energy = r.int(0, CFG.energy.max); p.energyT = START;
    p.addiction = r.int(0, E.addictionCap(p)); p.addictionT = START;
    p.cash = r.chance(1000) ? 0 : r.int(0, 2e6); p.bank = r.chance(5000) ? 0 : r.int(0, 2e6);
    const t = START + r.int(0, 3 * T.HOUR);
    const before = JSON.stringify({ ...p, hits: [] });
    const total = p.cash + p.bank;
    try {
      const out = r.chance(5000) ? E.refill(p, t, world) : E.detox(p, t, world);
      assert.equal(total - (p.cash + p.bank), out.price, 'paga exatamente o preço');
    } catch (e) {
      if (!(e instanceof E.GameError)) throw e;
    }
    assert.deepEqual(E.checkInvariants(p), [], 'invariantes: ' + before);
  }
});


test('crime: falhar nem sempre é prisão; preso não faz nada; fiança liberta', () => {
  const p = E.newPlayer('a', START, world);
  const r0 = E.doCrime(p, START, world, 0, never);
  assert.equal(r0.success, true, 'o primeiro carteirista corre sempre bem');
  const r1 = E.doCrime(p, START + 10, world, 0, never);       // falha, mas escapa
  assert.equal(r1.success, false); assert.equal(r1.busted, false);
  assert.equal(p.jailUntil, 0);
  assert.equal(p.energy, CFG.energy.max - 2 * CFG.crimes[0].e, 'perde a energia na mesma');
  const r2 = E.doCrime(p, START + 20, world, 0, bust());       // falha e é apanhado
  assert.equal(r2.busted, true);
  assert.throws(() => E.doCrime(p, START + 1000, world, 0, always), { code: 'IN_JAIL' });
  assert.equal(E.bailCost(p, START + 20), CFG.crimes[0].fine, 'a multa do golpe');
  p.cash += 1000; E.payBail(p, START + 1000, world);
  E.doCrime(p, START + 2000, world, 0, always);
  assert.equal(p.respect, 5, 'dois golpes que correram bem: 2,588 cada, com o resto guardado');
  assert.equal(p.c.crimes, 4); assert.equal(p.c.wins, 2); assert.equal(p.wk[0], 2);
});

test('fiança: a multa do golpe, proporcional ao tempo que falta', () => {
  const p = E.newPlayer('a', START, world);
  setResp(p, 1);
  E.doCrime(p, START, world, 1, bust());            // loja: 2 min de prisão
  const full = CFG.crimes[1].fine;
  assert.equal(E.bailCost(p, START), full);
  assert.equal(E.bailCost(p, START + T.MIN), Math.ceil(full / 2));
});

test('prática: cada golpe treina as stats que usa; falhar dá metade; a percentagem sobe', () => {
  const p = E.newPlayer('a', START, world);
  const c = CFG.crimes[0];
  const before = E.crimeChanceBp(p, 0);
  E.doCrime(p, START, world, 0, always);
  assert.equal(p.xp.C, c.e * c.w.C);
  assert.equal(p.xp.I, c.e * c.w.I);
  assert.equal(p.xp.F, 0);
  E.doCrime(p, START + 1000, world, 0, never);      // falha sem prisão: metade
  assert.equal(p.xp.C, c.e * c.w.C + Math.floor(c.e * c.w.C * CFG.practice.failBp / 10000));
  let t = START + 3000, gainedC = 0;
  for (let i = 0; i < 10; i++) { p.energy = 100; const r = E.doCrime(p, t, world, 0, always); gainedC += r.gained.C || 0; t += 1000; }
  assert.ok(gainedC >= 2);
  assert.equal(p.stats.C, CFG.start.stat + gainedC);
  assert.equal(E.crimeChanceBp(p, 0), before, 'a hipótese é a do golpe: as stats não mexem nela');
  assert.deepEqual(E.checkInvariants(p), []);
});

test('skills (passo 3): a prática conta a stamina por família, a mestria por golpe já não dá dinheiro', () => {
  const p = E.newPlayer('a', START, world);
  let t = START;
  for (let i = 0; i < 10; i++) { p.energy = 100; const r = E.doCrime(p, t, world, 0, always); assert.equal(r.star, 0); t += 1000; }
  assert.equal(p.wk[0], 10); assert.equal(p.sk[CFG.crimes[0].fam], 10 * CFG.crimes[0].e);
  p.energy = 100;
  const r = E.doCrime(p, t, world, 0, always);     // "always" tira a linha mais comum e o valor mais baixo
  assert.equal(r.base, CFG.crimes[0].prizes[0][1]);
  assert.equal(r.money, Math.floor((r.base * (10000 + E.skillBp(p, CFG.crimes[0].fam) - Math.floor((CFG.skills.maxBp * CFG.crimes[0].e) / CFG.skills.fullPts))) / 10000));
});

test('subir de nível já não enche a stamina (economia nova)', () => {
  const p = E.newPlayer('a', START, world);
  let t = START;
  while (E.level(p) < 3) { p.energy = 50; E.doCrime(p, t, world, 0, always); t += 1000; }
  assert.equal(p.energy, 50 - CFG.crimes[0].e);
  assert.deepEqual(E.checkInvariants(p), []);
});

test('desintoxicação: nunca bloqueia; custa pelo que rendes e sobe 25% a cada uso em 24 h', () => {
  const p = E.newPlayer('a', START, world);
  p.cash = 1e12;
  p.addiction = 100; p.addictionT = START;
  const v100 = Math.floor(E.valuePerEnergy(p) * 100);
  const c1 = E.detoxCost(p, START);
  assert.equal(c1, Math.max(CFG.detox.min, Math.floor(v100 * 100 / CFG.detox.valueDiv)));
  E.detox(p, START, world);
  assert.equal(p.addiction, 0);
  assert.throws(() => E.detox(p, START + 500, world), { code: 'NO_VICE' });
  p.addiction = 100; p.addictionT = START + 1000;
  assert.equal(E.detoxCost(p, START + 1000), Math.ceil(c1 * CFG.detox.stepNum / CFG.detox.stepDen));
  // muitas vezes seguidas: sempre possível, lista limitada
  let t = START + 2000, last = 0;
  for (let i = 0; i < CFG.detox.maxSteps + 5; i++) { p.addiction = 100; p.addictionT = t; const r = E.detox(p, t, world); assert.ok(r.price >= last); last = r.price; t += 1000; }
  assert.ok(p.detoxT.length <= CFG.detox.maxSteps);
  assert.ok(Number.isSafeInteger(last));
  // 24 h depois volta ao preço base
  E.touch(p, t + T.DAY);
  p.addiction = 100;
  assert.equal(E.detoxCost(p, t + T.DAY), c1);
});

test('objetivos: um de cada vez, só se recebe quando está feito, e uma só vez', () => {
  const p = E.newPlayer('a', START, world);
  assert.equal(E.mission(p).id, CFG.missions[0].id);
  assert.throws(() => E.claimMission(p, START, world), { code: 'MISSION_NOT_DONE' });
  E.doCrime(p, START, world, 0, always);
  assert.equal(E.mission(p).done, true);
  const cash = p.cash;
  const r = E.claimMission(p, START + 1, world);
  assert.equal(p.cash, cash + CFG.missions[0].cash);
  assert.equal(r.next.id, CFG.missions[1].id);
  assert.throws(() => E.claimMission(p, START + 2, world), { code: 'MISSION_NOT_DONE' });
  // todos os tipos de objetivo têm de onde tirar o progresso, e a cadeia acaba
  const types = new Set(CFG.missions.map((m) => m.type));
  for (const ty of types) assert.ok(['wins', 'trains', 'refills', 'collects', 'pvpWins', 'ports', 'level', 'tier', 'shifts', 'courses', 'skill', 'gear', 'biz', 'lux'].includes(ty), ty);
  // trocar: o que está à vista vai para o fim, aparece o seguinte, uma vez por hora, sem mexer no dinheiro nem no progresso
  const q = E.newPlayer('q', START, world), c0 = q.cash, a = E.mission(q).id;
  assert.equal(E.mission(q).swapAt <= START, true);
  let s1 = E.swapMission(q, START, world);
  assert.equal(s1.skipped, a); assert.equal(s1.next.id, CFG.missions[1].id); assert.equal(q.cash, c0); assert.equal(q.mq.at(-1), 0); assert.equal(E.mission(q).i, 0);
  assert.throws(() => E.swapMission(q, START + T.HOUR - 1, world), { code: 'SWAP_WAIT' }); assert.equal(E.mission(q).id, CFG.missions[1].id);
  assert.equal(E.mission(q).swapAt, START + T.HOUR);
  s1 = E.swapMission(q, START + T.HOUR, world); assert.equal(s1.next.id, CFG.missions[2].id); assert.deepEqual(q.mq.slice(-2), [0, 1]);
  // um objetivo já feito recebe-se, não se troca; e o que se saltou volta depois dos outros, uma só vez
  q.c.trains = 3; assert.throws(() => E.swapMission(q, START + 3 * T.HOUR, world), { code: 'MISSION_READY' });
  E.claimMission(q, START + 3 * T.HOUR, world); assert.equal(q.mi, 1); assert.equal(q.mq.length, CFG.missions.length - 1); assert.ok(!q.mq.includes(2));
  const todos = new Set(); let pago = 0; q.c.wins = 1e6; q.c.trains = 1e6; q.c.refills = 1e6; q.c.collects = 1e6; q.c.pvpWins = 1e6; q.c.ports = 1e6; q.respect = 1e12; q.peakRespect = 1e12; q.wk = q.wk.map(() => 1e6); q.c.shifts = 1e6; q.done = ['vigilante']; q.sk.furto = 1e6; q.eq.branca = { id: 'soqueira' }; q.eq.tronco = { id: 'cabedal' }; q.biz.forEach((b) => { b.n = 10; }); q.luxuries = 9;
  for (let k = 0; k < 40 && E.mission(q); k++) { const m = E.mission(q); assert.ok(m.done, m.id); assert.ok(!todos.has(m.id)); todos.add(m.id); pago += E.claimMission(q, START + 4 * T.HOUR + k, world).cash; }
  assert.equal(todos.size, CFG.missions.length - 1); assert.equal(pago, CFG.missions.reduce((x, m) => x + m.cash, 0) - CFG.missions[2].cash);
  assert.equal(E.mission(q), null); assert.throws(() => E.swapMission(q, START + 9 * T.HOUR, world), { code: 'NO_MISSION' });
  // com um só por fazer não há por quem trocar
  const u = E.newPlayer('u', START, world); u.mq = [5]; u.mi = CFG.missions.length - 1; assert.equal(E.mission(u).swapAt, 0); assert.throws(() => E.swapMission(u, START, world), { code: 'NO_OTHER' });
  p.mq = []; p.mi = CFG.missions.length;
  assert.equal(E.mission(p), null);
  assert.throws(() => E.claimMission(p, START + 3, world), { code: 'NO_MISSION' });
  assert.deepEqual(E.checkInvariants(p), []);
});

test('jogador gravado com regras antigas ganha os campos novos', () => {
  const p = E.newPlayer('a', START, world);
  delete p.wk; delete p.c; delete p.mi; delete p.xp; delete p.detoxT;
  E.touch(p, START + 1000);
  assert.deepEqual(E.checkInvariants(p), []);
  E.doCrime(p, START + 2000, world, 0, always);
  assert.equal(p.c.wins, 1);
});

let _n = 0; const mk = () => E.newPlayer('n' + (_n++), START, world); const W = world;

test('drogas: efeito temporário sobe a stat e acaba no fim do tempo', () => {
  const p = mk(); p.cash = 1e6; p.energy = 50; p.stats.I = 100;
  const lsd = CFG.drugs.findIndex((g) => g.id === 'lsd');
  const r = E.buyDrug(p, START, W, lsd);
  assert.equal(r.fx[0].k, 'I');
  assert.ok(E.effStat(p, 'I', START) > 100, 'sob efeito a stat sobe');
  assert.equal(E.effStat(p, 'I'), 100, 'sem relógio não conta o efeito');
  assert.equal(E.effStat(p, 'I', r.fx[0].until), 100, 'no fim do tempo volta ao normal');
  assert.equal(E.activeFx(p, r.fx[0].until).length, 0);
});

test('drogas: todas têm efeito e tomam-se de stamina cheia (não dão stamina)', () => {
  const p = mk(); p.cash = 1e6;
  assert.ok(CFG.drugs.every((g) => g.e === 0 && g.fx));
  const r = E.buyDrug(p, START, W, 1);
  assert.equal(r.energy, 0); assert.equal(p.energy, CFG.energy.max);
  assert.deepEqual(E.checkInvariants(p), []);
});

test('profissão: escolhe-se uma vez e muda as contas', () => {
  const a = mk(), b = mk(); a.cash = b.cash = 1e6;
  E.setClass(a, START, W, 'traficante');
  assert.throws(() => E.setClass(a, START, W, 'ladrao'), (e) => e.code === 'CLASS_SET');
  assert.throws(() => E.setClass(b, START, W, 'nada'), (e) => e.code === 'NO_CLASS');
  assert.ok(E.drugPrice(a, 6) < E.drugPrice(b, 6));
  assert.equal(E.addictionCap(a), E.addictionCap(b) + 15);
  a.energy = b.energy = 0;
  const fa = E.buyDrug(a, START, W, 6).fx[0], fb = E.buyDrug(b, START, W, 6).fx[0];
  assert.equal(fa.until - START, 2 * (fb.until - START), 'ao traficante o efeito dura o dobro');
  const m = mk(); E.setClass(m, START, W, 'matador');
  assert.ok(E.attackPower(m, START) > E.attackPower(mk(), START));
  const v = mk(); E.setClass(v, START, W, 'vigarista');
  assert.ok(E.bustChanceBp(v, START) < CFG.bustBp);
  E.setAvatar(v, START, W, CFG.avatars - 1); assert.equal(v.av, CFG.avatars - 1);
  assert.throws(() => E.setAvatar(v, START, W, CFG.avatars), (e) => e.code === 'NO_AVATAR');
  for (const p of [a, b, m, v]) assert.deepEqual(E.checkInvariants(p), []);
});

test('putas: stamina sem vício, preço sobe a cada visita, doença trata-se no hospital', () => {
  const p = mk(); p.cash = 1e6; p.energy = 0;
  const p0 = E.hookerPrice(p, 0, START);
  let r = E.visitHooker(p, START, W, 0, never);
  assert.equal(r.energy, CFG.hookers.list[0].e); assert.equal(p.addiction, 0); assert.equal(r.sick, false);
  assert.ok(E.hookerPrice(p, 0, START) > p0, 'a segunda visita custa mais');
  assert.equal(E.hookerPrice(p, 0, START + T.DAY), p0, 'no dia seguinte volta ao preço normal');
  const antes = E.attackPower(p, START);
  r = E.visitHooker(p, START, W, 5, always);
  assert.equal(r.sick, true); assert.ok(E.attackPower(p, START) < antes, 'doente fica mais fraco');
  assert.throws(() => E.visitHooker(p, START, W, 0, never), (e) => e.code === 'SICK');
  assert.ok(E.cureCost(p) >= CFG.hookers.cureMin);
  E.cure(p, START, W); assert.equal(p.sick, false);
  assert.throws(() => E.cure(p, START, W), (e) => e.code === 'NOT_SICK');
  p.energy = CFG.energy.max;
  assert.throws(() => E.visitHooker(p, START, W, 0, never), (e) => e.code === 'ENERGY_FULL');
  assert.deepEqual(E.checkInvariants(p), []);
});

test('casa: compra-se a seguinte (a antiga entra na troca), dá respeito e mais stamina máxima; já não há melhorias', () => {
  const p = mk(); p.cash = 1e9; const c0 = p.cash;
  assert.throws(() => E.buyUpgrade(p, START, W, 0), (e) => e.code === 'NO_UPGRADE');
  assert.equal(E.upgradePrice(p, 0), null);
  const r = E.buyHouse(p, START, W);
  const H = CFG.house.tiers;
  assert.equal(p.house, 1); assert.equal(r.price, H[1].price); assert.equal(r.respect, H[1].resp); assert.equal(p.respect, H[1].resp);
  assert.equal(E.energyMax(p), H[1].emax);
  assert.equal(E.housePrice(p), H[2].price - H[1].price);
  while (E.housePrice(p) !== null) E.buyHouse(p, START, W);
  assert.equal(c0 - p.cash, H[H.length - 1].price, 'no fim pagou o preço da última');
  assert.throws(() => E.buyHouse(p, START, W), (e) => e.code === 'HOUSE_MAX');
  // sem melhorias, o cofre não guarda nada num assalto
  const d = mk(), a = mk(); d.cash = 100000; setResp(d, 500); setResp(a, 500);
  assert.equal(E.mugValue(a, d, START), Math.floor((100000 * CFG.pvp.mugBp) / 10000));
  assert.deepEqual(E.checkInvariants(p), []); assert.deepEqual(E.checkInvariants(d), []);
});
