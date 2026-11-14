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
  assert.equal(p.energy, 95);
  E.touch(p, t1 + 2 * T.MIN - 1);
  assert.equal(p.energy, 95);
  E.touch(p, t1 + 2 * T.MIN);
  assert.equal(p.energy, 96);
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

test('discoteca: bloqueia acima do máximo de energia e do limite de vício', () => {
  const p = E.newPlayer('a', START, world);
  p.cash = 1e6;
  assert.throws(() => E.buyDrug(p, START, world, 0), { code: 'ENERGY_FULL' });
  p.energy = 0;
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

test('crime: falhado vai para a prisão; preso não faz nada; fiança liberta', () => {
  const p = E.newPlayer('a', START, world);
  const r0 = E.doCrime(p, START, world, 0, never);
  assert.equal(r0.success, true, 'o primeiro carteirista corre sempre bem');
  const r = E.doCrime(p, START + 10, world, 0, never);
  assert.equal(r.success, false);
  assert.throws(() => E.doCrime(p, START + 1000, world, 0, always), { code: 'IN_JAIL' });
  const cost = E.bailCost(p, START + 1000);
  // 30% do valor médio do carteirista (20), proporcional ao tempo que falta (59 de 60 s)
  assert.equal(cost, Math.ceil((Math.floor(20 * CFG.bailBp / 10000) * 59000) / 60000));
  E.payBail(p, START + 1000, world);
  E.doCrime(p, START + 2000, world, 0, always);
  assert.equal(p.respect, 2);
});

test('crime: a garantia do primeiro golpe é só para o carteirista e só sem respeito', () => {
  const p = E.newPlayer('a', START, world);
  p.stats.I = p.stats.F = p.stats.C = 200;
  assert.equal(E.doCrime(p, START, world, 1, never).success, false, 'outro golpe pode falhar logo');
  const q = E.newPlayer('b', START, world);
  q.respect = q.peakRespect = 1;
  assert.equal(E.doCrime(q, START, world, 0, never).success, false, 'com respeito já pode falhar');
});

test('crime: bloqueado abaixo de 20% de hipótese; sem energia não faz', () => {
  const p = E.newPlayer('a', START, world);
  assert.throws(() => E.doCrime(p, START, world, 9, always), { code: 'LOCKED' });
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
  assert.equal(b.bank - bankB0, Math.floor(125 * 1010 / 1000));
});

test('negócios: armazém enche em 8 h e não passa disso', () => {
  const p = E.newPlayer('a', START, world); p.cash = 1e7;
  E.buyBiz(p, START, world, 1);
  const before = p.cash;
  E.collectBiz(p, START + 3 * T.DAY, world, never);
  const perH = Math.floor(500 * 1010 / 1000);
  assert.equal(p.cash - before, perH * 8);
});

test('negócios: cada unidade extra custa +50% (arredondado para baixo); máximo 10', () => {
  assert.equal(E.bizPrice(0, 0), 3000);
  assert.equal(E.bizPrice(0, 1), 4500);
  assert.equal(E.bizPrice(0, 2), 6750);
  assert.equal(E.bizPrice(1, 3), 27000);
  const p = E.newPlayer('a', START, world); p.cash = 1e9;
  for (let i = 0; i < 10; i++) E.buyBiz(p, START, world, 0);
  assert.throws(() => E.buyBiz(p, START, world, 0), { code: 'BIZ_MAX' });
});

test('negócios: treinar a stat a meio conta o rendimento anterior com a stat antiga', () => {
  const p = E.newPlayer('a', START, world); p.cash = 1e7;
  E.buyBiz(p, START, world, 0);
  for (let i = 0; i < 20; i++) E.train(p, START + T.HOUR, world, 'C'); // C 10 -> 30
  const b0 = p.bank;
  E.collectBiz(p, START + 2 * T.HOUR, world, never);
  const first = Math.floor(125 * 1010 / 1000);        // 1.ª hora com C=10
  const second = Math.floor(125 * 1030 / 1000);       // 2.ª hora com C=30
  assert.equal(p.bank - b0, first + second);
});

test('porto: não aceita contentores que só chegam depois do fim da ronda', () => {
  const p = E.newPlayer('a', START, world);
  assert.throws(() => E.sendPort(p, world.playEnd - T.HOUR, world, 200), { code: 'ROUND_ENDING' });
});

test('banco: taxa de 3% arredondada para cima', () => {
  const p = E.newPlayer('a', START, world);
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
  assert.equal(E.level(a), 9);
  const r = E.attack(a, d, t, world, 'beat', always);
  assert.equal(r.respect, 11);              // (12+9) x raiz(250/900) = 21 x 0,527 = 11
  assert.equal(d.respect, 250 - 5);         // perde metade (arredondada para baixo)
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
  setResp(a, 1000);                         // nível 10 -> 12+10 = 22 de base
  setResp(d, 250); assert.equal(E.pvpBaseGain(a, d), 11);
  setResp(d, 1000); assert.equal(E.pvpBaseGain(a, d), 22);
  setResp(d, 4000); assert.equal(E.pvpBaseGain(a, d), 44);
  setResp(d, 99999); assert.equal(E.pvpBaseGain(a, d), 44);
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
  assert.equal(a.respect, 500 - 10);        // base (12+8) x 1 = 20 -> perde 10
  assert.equal(d.respect, 500 + CFG.pvp.defendGain);
  assert.ok(a.hospUntil > t);
});

test('nível: nunca desce quando se perde respeito', () => {
  const p = E.newPlayer('a', START, world);
  setResp(p, 1005);                              // logo acima do patamar dos 1000
  const L = E.level(p);
  const d = E.newPlayer('d', START, world); setResp(d, 1005); d.stats.T = 1000;
  E.attack(p, d, START + 2 * T.HOUR, world, 'beat', never);
  assert.equal(p.respect, 1005 - 11);            // 994, abaixo dos 1000
  assert.equal(E.level(p), L);
});

test('negócios: cada compra dá respeito uma vez', () => {
  const p = E.newPlayer('a', START, world); p.cash = 1e7;
  const r = E.buyBiz(p, START, world, 4);
  const R = CFG.biz[4].resp;
  assert.equal(r.respect, R);
  assert.equal(p.respect, R);
  E.collectBiz(p, START + T.HOUR, world, never);
  assert.equal(p.respect, R);                    // recolher não dá respeito
});

test('ataques: assalto leva 10% do dinheiro na mão e do armazém ilegal, nunca do banco', () => {
  const a = E.newPlayer('a', START, world), d = E.newPlayer('d', START, world);
  d.cash = 1e6;
  E.buyBiz(d, START, world, 1);                      // prostitutas (ilegal)
  E.buyBiz(d, START, world, 0);                      // lavandaria (legal)
  d.cash = 1000; d.bank = 50000;
  const t = START + 2 * T.HOUR;
  const expect = E.mugValue(a, d, t);
  const r = E.attack(a, d, t, world, 'mug', always);
  const stored1 = Math.floor(500 * 1010 / 1000) * 2;  // 2 h de prostitutas
  assert.equal(r.money, 100 + Math.floor(stored1 / 10));
  assert.equal(r.money, expect);
  assert.equal(d.cash, 900);
  assert.equal(d.bank, 50000);
  assert.equal(d.biz[1].stored, stored1 - Math.floor(stored1 / 10));
  assert.equal(d.biz[0].stored, Math.floor(125 * 1010 / 1000) * 2); // legal fica intacto
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

test('luxos: cada um custa o dobro e dá sempre o mesmo respeito; máximo 20', () => {
  const p = E.newPlayer('a', START, world); p.cash = 2 ** 52;
  E.buyLuxury(p, START, world);
  E.buyLuxury(p, START, world);
  assert.equal(p.respect, 2 * CFG.luxury.respect);
  assert.equal(E.luxuryPrice(p), 1000000);
  for (let i = 2; i < 20; i++) E.buyLuxury(p, START, world);
  assert.throws(() => E.buyLuxury(p, START, world), { code: 'LUXURY_MAX' });
  assert.ok(Number.isSafeInteger(p.cash));
});

test('negócios: o bónus da stat para nos x2', () => {
  const p = E.newPlayer('a', START, world); p.cash = 1e7;
  E.buyBiz(p, START, world, 1);
  p.stats.C = 5000;
  assert.equal(E.bizRates(p, 1).perH, 1000);
});

test('recarga: enche ao melhor preço, sem passar o vício, o dinheiro nem a energia máxima', () => {
  const p = E.newPlayer('a', START, world);
  p.energy = 3;
  const plan = E.refillPlan(p);
  assert.ok(plan.energy <= CFG.energy.max - 3 && plan.energy > CFG.energy.max - 3 - 5);
  const before = p.cash;
  const r = E.refill(p, START, world);
  assert.equal(p.energy, 3 + r.energy);
  assert.equal(p.addiction, r.addiction);
  assert.equal(before - p.cash, r.price);
  // a soma das compras bate certo com o plano
  const sum = (f) => r.counts.reduce((s, n, d) => s + n * CFG.drugs[d][f], 0);
  assert.equal(sum('e'), r.energy); assert.equal(sum('a'), r.addiction); assert.equal(sum('price'), r.price);
  // sem margem de vício recusa sem mexer em nada
  p.energy = 0; p.addiction = E.addictionCap(p) - 1; p.addictionT = START;
  const snap = JSON.stringify({ ...p, hits: [] });
  assert.throws(() => E.refill(p, START, world), { code: 'ADDICTION_LIMIT' });
  assert.equal(JSON.stringify({ ...p, hits: [] }), snap);
  // sem dinheiro também recusa
  const q = E.newPlayer('b', START, world); q.energy = 0; q.cash = 0;
  assert.throws(() => E.refill(q, START, world), { code: 'NO_MONEY' });
});

test('recarga: com pouco vício livre usa consumos mais eficientes se compensarem', () => {
  const p = E.newPlayer('a', START, world);
  p.stats.I = p.stats.F = p.stats.C = 600; p.cash = 1e8; p.energy = 0;
  p.addiction = E.addictionCap(p) - 14; p.addictionT = START;
  const plan = E.refillPlan(p);
  assert.ok(plan.vice <= 14);
  assert.ok(plan.energy > (14 / CFG.drugs[0].a) * CFG.drugs[0].e, 'mais energia do que só com cerveja');
});

test('desintoxicação: limpa o vício, custa vício x nível e dobra a cada uso em 24 h', () => {
  const p = E.newPlayer('a', START, world);
  p.cash = 1e9; setResp(p, 1000);                 // nível 10
  p.addiction = 100; p.addictionT = START;
  const c1 = E.detoxCost(p, START);
  assert.equal(c1, 100 * 10);
  E.detox(p, START, world);
  assert.equal(p.addiction, 0);
  p.addiction = 100; p.addictionT = START + 1000;
  assert.equal(E.detoxCost(p, START + 1000), 2 * 100 * 10);
  assert.throws(() => { p.addiction = 0; E.detox(p, START + 2000, world); }, { code: 'NO_VICE' });
  // esgota o máximo por 24 h e depois volta a poder
  let t = START + 3000;
  while (p.detoxT.length < CFG.detox.max) { p.addiction = 10; p.addictionT = t; E.detox(p, t, world); t += 1000; }
  p.addiction = 10; p.addictionT = t;
  assert.throws(() => E.detox(p, t, world), { code: 'DETOX_COOLDOWN' });
  assert.equal(E.detoxReadyAt(p, t), START + T.DAY);
  E.touch(p, START + T.DAY + 5000);
  p.addiction = 10;
  E.detox(p, START + T.DAY + 5000, world);
});

test('fiança: 30% do valor médio do golpe, proporcional ao tempo que falta', () => {
  const p = E.newPlayer('a', START, world);
  setResp(p, 1);                                  // já não tem o primeiro golpe garantido
  E.doCrime(p, START, world, 1, never);            // loja: 2 min de prisão
  const full = Math.floor(((CFG.crimes[1].min + CFG.crimes[1].max) / 2) * CFG.bailBp / 10000);
  assert.equal(E.bailCost(p, START), full);
  assert.equal(E.bailCost(p, START + T.MIN), Math.ceil(full / 2));
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

test('prática: cada golpe treina as stats que usa; falhar dá metade; a percentagem sobe', () => {
  const p = E.newPlayer('a', START, world);
  const c = CFG.crimes[0];                         // carteirista: I 30, C 70
  const before = E.crimeChanceBp(p, 0);
  E.doCrime(p, START, world, 0, always);
  assert.equal(p.xp.C, c.e * c.w.C);
  assert.equal(p.xp.I, c.e * c.w.I);
  assert.equal(p.xp.F, 0);
  setResp(p, 5);
  E.doCrime(p, START + 1000, world, 0, never);      // falha: metade
  assert.equal(p.xp.C, c.e * c.w.C + Math.floor(c.e * c.w.C * CFG.practice.failBp / 10000));
  E.payBail(p, START + 2000, world);
  let t = START + 3000, gainedC = 0;
  for (let i = 0; i < 10; i++) { p.energy = 100; const r = E.doCrime(p, t, world, 0, always); gainedC += r.gained.C || 0; t += 1000; }
  assert.ok(gainedC >= 2, 'em 12 golpes sobe pelo menos 2 pontos de carisma');
  assert.equal(p.stats.C, CFG.start.stat + gainedC);
  assert.ok(E.crimeChanceBp(p, 0) > before, 'a percentagem subiu');
  assert.deepEqual(E.checkInvariants(p), []);
});
