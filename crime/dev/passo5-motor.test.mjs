// Passo 5 da base nova: golpes grandes com preparação, rasto e polícia; advogado em avença; prisão com coisas para fazer.
// Corre com: node --test dev/passo5-motor.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 10);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER };
const mk = (resp = 0) => { const p = E.newPlayer('p' + Math.random(), START, world); p.respect = p.peakRespect = resp; return p; };
const lv = (n) => CFG.levels[n - 1];
const O = (id) => CFG.ops.findIndex((o) => o.id === id);
const erro = (fn, code) => assert.throws(fn, (e) => e.code === code, code);
// sorte por guião: cada chance() tira o próximo valor da lista (true = acontece)
const guiao = (...xs) => ({ chance: () => { if (!xs.length) throw new Error('guião acabou'); return xs.shift(); }, int: (lo) => lo, float: () => 0 });
const H = T.HOUR;

test('golpes grandes: os oito da especificação, com nível, preparação, custo, parte, hipótese e pausa', () => {
  const quer = [['carros', 15, 12, 200, 4300, 8000, 0], ['residencia', 20, 24, 500, 4500, 7500, 0], ['ourivesaria', 35, 48, 5000, 35000, 6500, 24],
    ['lancha', 40, 48, 70000, 170000, 8000, 48], ['banco', 55, 96, 30000, 78000, 5500, 48], ['carrinha', 65, 120, 40000, 100000, 5000, 72],
    ['contentor', 75, 120, 400000, 1500000, 7000, 120], ['casino', 80, 168, 150000, 700000, 4000, 120]];
  assert.deepEqual(CFG.ops.map((o) => [o.id, o.level, o.prepH, o.cost, o.gain, o.p, o.pauseH]), quer);
  for (const o of CFG.ops) { assert.ok(CFG.skills.fams.includes(o.fam)); assert.ok(o.lawyer >= 300 && o.lawyer <= 7000); assert.ok(o.jailMin >= 30 && o.jailMin <= 120); }
});

test('preparar: paga-se à cabeça, um de cada vez, e só a partir do nível do golpe', () => {
  const p = mk(lv(34)); p.cash = 100_000;
  erro(() => E.opStart(p, START, world, O('ourivesaria')), 'LOW_LEVEL');
  p.respect = p.peakRespect = lv(35);
  const r = E.opStart(p, START, world, O('ourivesaria'));
  assert.equal(r.price, 5000); assert.equal(p.cash, 95_000); assert.equal(p.op.ready, START + 48 * H);
  erro(() => E.opStart(p, START, world, O('carros')), 'OP_BUSY');
  // desistir perde o que se pagou
  const d = E.opDrop(p, START + 1, world); assert.equal(d.lost, 5000); assert.equal(p.op, null);
});

test('passos da preparação: reconhecimento baixa o rasto, equipa sobe a hipótese, suborno só nos grandes; cada um uma vez', () => {
  const p = mk(lv(40)); p.cash = 100_000;
  E.opStart(p, START, world, O('ourivesaria'));
  const o = CFG.ops[O('ourivesaria')];
  assert.equal(E.opRasto(p, o), 60); assert.equal(E.opChanceBp(p, o), 6500);
  let r = E.opStep(p, START, world, 'recon'); assert.equal(r.price, 350); assert.equal(r.rasto, 40);
  r = E.opStep(p, START, world, 'crew'); assert.equal(r.price, 1750); assert.equal(r.chanceBp, 7300);
  r = E.opStep(p, START, world, 'bribe'); assert.equal(r.price, 2100);
  erro(() => E.opStep(p, START, world, 'crew'), 'STEP_DONE');
  assert.equal(p.op.paid, 5000 + 350 + 1750 + 2100);
  // nos pequenos não há suborno
  const q = mk(lv(20)); q.cash = 10_000; E.opStart(q, START, world, O('carros'));
  erro(() => E.opStep(q, START, world, 'bribe'), 'NO_STEP');
  assert.equal(E.opStepCost(CFG.ops[O('carros')], 'recon'), 43);
});

test('rasto: luvas, curso de vigilante (alarmes), motorista (fuga de carro), skill e contacto da prisão; a hipótese só sobe com a equipa', () => {
  const p = mk(lv(40)); p.cash = 1e6;
  const ouri = CFG.ops[O('ourivesaria')], carros = CFG.ops[O('carros')];
  p.eq.maos = { id: 'luvas' }; p.done = ['vigilante', 'pesados'];
  assert.equal(E.opRasto(p, ouri, null), 60 - 10 - 10, 'luvas e alarmes');
  assert.equal(E.opRasto(p, carros, null), 40 - 10 - 10, 'luvas e fuga de carro (os carros não têm alarme)');
  assert.equal(E.opChanceBp(p, carros, null), 8000, 'os cursos não mexem na hipótese');
  p.sk.assalto = CFG.skills.fullPts;
  assert.equal(E.opRasto(p, ouri, null), 60 - 10 - 10 - 10, 'skill cheia: −10 de rasto');
  assert.equal(E.opChanceBp(p, ouri, null), 6500);
  p.contacts = 1; E.opStart(p, START, world, O('ourivesaria'));
  assert.equal(p.contacts, 0); assert.equal(E.opRasto(p, ouri), 60 - 10 - 10 - 10 - 15);
});

test('avançar: só quando está pronto e com o material; corre bem → a parte, respeito 3×√parte, pausa e skill', () => {
  const p = mk(lv(40)); p.cash = 100_000; p.energy = 100;
  E.opStart(p, START, world, O('ourivesaria'));
  erro(() => E.opGo(p, START + 47 * H, world, guiao(true, false)), 'PREP_LEFT');
  erro(() => E.opGo(p, START + 48 * H, world, guiao(true, false)), 'OP_MISSING');
  E.buyItem(p, START + 48 * H, world, 'pedecabra');
  erro(() => E.buyItem(p, START + 48 * H, world, 'pedecabra'), 'HAVE_IT');
  E.buyItem(p, START + 48 * H, world, 'pistola'); E.buyItem(p, START + 48 * H, world, 'balas', 1);
  const c0 = p.cash, sk0 = p.sk.assalto;
  const r = E.opGo(p, START + 48 * H, world, guiao(true, false));
  assert.equal(r.success, true); assert.equal(r.money, 35000); assert.equal(p.cash, c0 + 35000);
  assert.equal(r.respect, 374, 'a ourivesaria dá 2 × √35 000 (a wiki dizia 3 ×, 561: com isso o nível 100 chegava antes das metas)');
  assert.equal(p.opPause, START + 48 * H + 24 * H); assert.equal(p.sk.assalto, sk0 + CFG.opSteps.practice);
  assert.ok(p.inv.some((x) => x.id === 'pedecabra'), 'as ferramentas ficam');
  assert.equal(p.inv.find((x) => x.id === 'balas').n, 50 - 30); assert.equal(p.eq.mao.u, 19);
  erro(() => E.opStart(p, START + 48 * H + 1, world, O('carros')), 'OP_PAUSE');
});

test('os explosivos gastam-se; o material não se veste e conta como um espaço', () => {
  const p = mk(lv(70)); p.cash = 1e6;
  erro(() => E.buyItem(p, START, world, 'explosivos'), 'CRAFT_ONLY');   // v83: já não se vendem; fazem-se na cave
  p.inv.push({ id: 'explosivos' });
  erro(() => E.equip(p, START, world, 0), 'NOT_WEARABLE');
  assert.equal(E.invUsed(p), 1);
  E.buyItem(p, START, world, 'pistola'); E.buyItem(p, START, world, 'balas', 1);
  E.opStart(p, START, world, O('carrinha'));
  E.opGo(p, START + 120 * H, world, guiao(true, false));
  assert.ok(!p.inv.some((x) => x.id === 'explosivos'));
});

test('corre mal: perde-se o que se pagou e paga-se o advogado; o rasto decide a prisão; a fiança é o advogado pelo tempo que falta', () => {
  const p = mk(lv(40)); p.cash = 100_000;
  E.opStart(p, START, world, O('lancha'));
  const c0 = p.cash;
  const r = E.opGo(p, START + 48 * H, world, guiao(false, true));
  assert.equal(r.success, false); assert.equal(r.lawyer, 4000); assert.equal(p.cash, c0 - 4000); assert.equal(r.busted, true);
  assert.equal(p.jailUntil, START + 48 * H + 75 * T.MIN); assert.equal(p.jailTier, 100 + O('lancha'));
  assert.equal(E.bailCost(p, START + 48 * H), 4000);
  assert.equal(E.bailCost(p, START + 48 * H + 75 * T.MIN - 15 * T.MIN), 800);
});

test('suborno: se correr mal não há advogado nem prisão; se correr bem ninguém liga o golpe a ti', () => {
  const p = mk(lv(40)); p.cash = 1e6;
  E.opStart(p, START, world, O('lancha')); E.opStep(p, START, world, 'bribe');
  const c0 = p.cash;
  const r = E.opGo(p, START + 48 * H, world, guiao(false));
  assert.equal(r.lawyer, 0); assert.equal(r.busted, false); assert.equal(p.cash, c0); assert.equal(p.jailUntil, 0);
  const q = mk(lv(40)); q.cash = 1e6;
  E.opStart(q, START, world, O('lancha')); E.opStep(q, START, world, 'bribe');
  const s = E.opGo(q, START + 48 * H, world, guiao(true));
  assert.equal(s.linked, false); assert.equal(q.jailUntil, 0);
});

test('investigação: depois de correr bem, o rasto pode ligar o golpe a ti; ficas com o dinheiro mas vais preso', () => {
  const p = mk(lv(40)); p.cash = 1e6;
  E.opStart(p, START, world, O('lancha'));
  const r = E.opGo(p, START + 48 * H, world, guiao(true, true));
  assert.equal(r.linked, true); assert.equal(r.value, 170000); assert.ok(p.jailUntil > START + 48 * H);
});

test('lavagem: os primeiros 100 000 € de crime passam inteiros; depois perde-se 20% (15% com a licenciatura); o que é teu não paga', () => {
  const p = mk(lv(40)); p.cash = 1e6;
  E.opStart(p, START, world, O('lancha'));
  const r = E.opGo(p, START + 48 * H, world, guiao(true, false));
  assert.equal(r.value, 170000); assert.equal(r.lav, Math.floor((70000 * 2000) / 10000)); assert.equal(r.money, 170000 - 14000);
  assert.equal(p.ilegal, 170000);
  // a seguir, tudo paga: venda ao recetador de objetos roubados sim, equipamento não
  p.inv.push({ id: 'joias', n: 1, v: 1000 }, { id: 'navalha' });
  const g = E.sellGoods(p, START + 49 * H, world); assert.equal(g.money, 800); assert.equal(g.lav, 200);
  const e = E.sellItem(p, START + 49 * H, world, p.inv.findIndex((x) => x.id === 'navalha')); assert.equal(e.lav, 0); assert.equal(e.money, 12);
  // com a licenciatura, 15%
  const q = mk(lv(40)); q.cash = 1e6; q.ilegal = 200_000; q.done = ['licenciatura'];
  assert.deepEqual(E.launder(q, 1000), { net: 850, lav: 150 });
  // e só conta o que passa dos 100 000 €
  const z = mk(); z.ilegal = 99_500; assert.deepEqual(E.launder(z, 1000), { net: 900, lav: 100 });
});

test('advogado em avença: do nível 30, 3 000 € por dia jogado; paga o advogado dos falhados e corta a prisão a metade', () => {
  const p = mk(lv(29)); p.cash = 100_000;
  erro(() => E.setRetainer(p, START, world, true), 'LOW_LEVEL');
  p.respect = p.peakRespect = lv(40);
  E.setRetainer(p, START, world, true); assert.equal(p.cash, 97_000); assert.equal(p.avN, 1);
  E.opStart(p, START, world, O('lancha'));   // mesmo dia: não volta a pagar
  assert.equal(p.cash, 97_000 - 70_000); assert.equal(p.avN, 1);
  const c0 = p.cash;
  const r = E.opGo(p, START + 48 * H, world, guiao(false, true));   // dois dias depois: paga esse dia ao agir
  assert.equal(p.avN, 2); assert.equal(r.lawyer, 0); assert.equal(p.cash, c0 - 3000);
  assert.equal(p.jailUntil - (START + 48 * H), (75 * T.MIN) / 2);
  // sem dinheiro para o dia, a avença acaba
  p.jailUntil = 0; p.cash = 100; p.bank = 0;
  E.deposit(p, START + 72 * H, world, 10);
  assert.equal(p.avenca, false);
});

test('prisão: só lá dentro; contrabando dá metade da rua no teu nível e às vezes perde-se; oficina 50 €; fuga', () => {
  const p = mk(lv(1)); p.cash = 1000; p.energy = 100; p.vigor = 100;
  erro(() => E.jailWork(p, START, world), 'NOT_IN_JAIL');
  p.jailUntil = START + 20 * T.MIN; p.jailTier = 1; p.jailT0 = START;
  assert.equal(E.streetPerBar(p), Math.floor(E.streetPerBar(p)));
  assert.ok(Math.abs(E.streetPerBar(p) - 1150) <= 5, 'um novato faz ~1 150 € por barra na rua (a wiki diz 575 € de contrabando, metade)');
  const s = E.jailSmuggle(p, START, world, guiao(false));
  assert.equal(s.money, Math.floor((E.streetPerBar(p) * 20) / 200)); assert.equal(p.energy, 80);
  const s2 = E.jailSmuggle(p, START, world, guiao(true)); assert.equal(s2.money, 0); assert.equal(s2.lost, true);
  const w = E.jailWork(p, START, world); assert.equal(w.money, 50); assert.equal(p.vigor, 90);
  // fuga falhada: a pena cresce metade do que falta; fuga certa: sai
  const f = E.jailEscape(p, START, world, guiao(false)); assert.equal(f.free, false); assert.equal(p.jailUntil, START + 30 * T.MIN);
  const g = E.jailEscape(p, START, world, guiao(true)); assert.equal(g.free, true); assert.equal(p.jailUntil, 0);
});

test('prisão: pátio (aposta conforme o nível, treina a força), cartas até 50 €, dois favores por estadia', () => {
  const p = mk(lv(50)); p.cash = 1000; p.vigor = 100;
  p.jailUntil = START + 60 * T.MIN; p.jailTier = 1; p.jailT0 = START; p.jf = 0;
  assert.equal(E.yardBet(mk(lv(1))), 20); assert.equal(E.yardBet(mk(lv(100))), 200);
  const F0 = p.stats.F, y = E.jailYard(p, START, world, guiao(true));
  assert.equal(y.money, E.yardBet(p)); assert.equal(p.stats.F, F0 + 1);
  erro(() => E.jailCards(p, START, world, 51, guiao(true)), 'BAD_AMOUNT');
  const c = E.jailCards(p, START, world, 50, guiao(false)); assert.equal(c.money, -50);
  const a = E.jailFavor(p, START, world, 'time'); assert.equal(a.cut, 9 * T.MIN);
  E.jailFavor(p, START, world, 'contact'); assert.equal(p.contacts, 1);
  erro(() => E.jailFavor(p, START, world, 'time'), 'NO_FAVORS');
});

test('jogadores antigos: as ferramentas compradas passam a material no inventário (o que não cabe, e as que não são material, voltam em dinheiro)', () => {
  const p = mk(lv(30));
  delete p.op; p.tool = 7; p.inv = [{ id: 'telemovel', n: 1, v: 100 }, { id: 'relogio', n: 1, v: 100 }]; p.cash = 0;
  E.touch(p, START + 1);
  assert.deepEqual(p.inv.map((x) => x.id), ['telemovel', 'relogio', 'pedecabra', 'gazuas', 'macarico', 'explosivos']);
  assert.equal(p.cash, 60 + 900 + 1500 + 5000, 'taser, revólver e serrada voltam pelo preço, e a broca não coube'); assert.equal(p.tool, -1); assert.equal(p.op, null);
});

test('invariantes: golpe a preparar, contactos e avença', () => {
  const p = mk(lv(80)); p.cash = 1e7;
  E.setRetainer(p, START, world, true); E.opStart(p, START, world, O('casino')); E.opStep(p, START, world, 'recon');
  assert.deepEqual(E.checkInvariants(p), []);
});
