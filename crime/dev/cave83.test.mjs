// v83 (plano do Dinis: «os biscates podiam dar itens que se juntam para craftar outros, necessários mais para a frente»).
// Corre com: node --test dev/cave83.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 10);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const mk = () => { const p = E.newPlayer('m' + Math.random(), START, world); p.cash = 1e6; p.respect = 1e7; p.peakRespect = 1e7; return p; };
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
const R = (id) => CFG.craft.list.find((r) => r.id === id);
const encher = (p, o) => { for (const [k, n] of Object.entries(o)) p.mt[k] = n; };

test('cada biscate tem o seu material: 1, ou 2 com trabalho bem feito; o teto do depósito corta', () => {
  for (const [w, m] of Object.entries(CFG.mat.drop)) assert.ok(CFG.mat.base.includes(m), w);
  assert.deepEqual(Object.keys(CFG.mat.drop).sort(), CFG.work.list.filter((x) => !x.shift).map((x) => x.id).sort());
  assert.equal(new Set(Object.values(CFG.mat.drop)).size, CFG.mat.base.length, 'um material diferente por biscate');
  const p = mk();
  assert.deepEqual(E.matGain(p, 'oficina', 9000), { id: 'sucata', n: 2, lost: 0 });
  assert.deepEqual(E.matGain(p, 'oficina', 6000), { id: 'sucata', n: 1, lost: 0 });
  assert.equal(p.mt.sucata, 3);
  p.mt.sucata = CFG.mat.cap - 1;
  assert.deepEqual(E.matGain(p, 'oficina', 9000), { id: 'sucata', n: 1, lost: 1 });
  assert.equal(p.mt.sucata, CFG.mat.cap);
  assert.deepEqual(E.matGain(p, 'oficina', 9000), { id: 'sucata', n: 0, lost: 2 });
});

test('componentes fazem-se na hora: gastam materiais e dinheiro e entram logo no depósito, sem ocupar a bancada', () => {
  const p = mk(), r = R('chapa'), c0 = p.cash;
  encher(p, { sucata: 10 });
  const o = E.craftStart(p, START, world, 'chapa', 3);
  assert.equal(o.n, 3); assert.equal(o.price, 3 * r.price); assert.equal(o.end, undefined);
  assert.equal(p.mt.sucata, 10 - 3 * r.needs.sucata); assert.equal(p.mt.chapa, 3); assert.equal(p.cash, c0 - 3 * r.price); assert.equal(p.cf, null);
  assert.deepEqual(E.checkInvariants(p), []);
});

test('ferramentas, armas e máquinas ficam na bancada o tempo da receita, uma de cada vez, e depois recolhem-se', () => {
  const p = mk(), r = R('macarico'), c0 = p.cash;
  encher(p, { cano: 2, chapa: 2, reagente: 2, sucata: 3 });
  const o = E.craftStart(p, START, world, 'macarico');
  assert.equal(o.end, START + r.ms); assert.equal(p.cash, c0 - r.price); assert.deepEqual(p.mt, { cano: 1, chapa: 1, reagente: 1, sucata: 3 });
  erro(() => E.craftStart(p, START + 1, world, 'macarico'), 'BENCH_BUSY');
  E.craftStart(p, START + 1, world, 'chapa', 1);   // os componentes não precisam da bancada
  assert.equal(p.mt.chapa, 2);
  erro(() => E.buyItem(p, START + 2, world, 'macarico'), 'ON_BENCH');   // não se compra o que está a ser feito
  erro(() => E.craftTake(p, START + r.ms - 1, world), 'CRAFT_WAIT');
  const t = E.craftTake(p, START + r.ms, world);
  assert.equal(t.kind, 'tool'); assert.ok(p.inv.some((x) => x.id === 'macarico')); assert.equal(p.cf, null);
  erro(() => E.craftTake(p, START + r.ms, world), 'NO_CRAFT');
  erro(() => E.craftStart(p, START + r.ms, world, 'macarico'), 'HAVE_IT');
  assert.deepEqual(E.checkInvariants(p), []);
});

test('sem materiais, sem dinheiro ou com quantidade errada não mexe em nada', () => {
  const p = mk(); encher(p, { sucata: 2 });
  erro(() => E.craftStart(p, START, world, 'chapa', 1), 'NO_MAT');
  erro(() => E.craftStart(p, START, world, 'chapa', 0), 'BAD_AMOUNT');
  erro(() => E.craftStart(p, START, world, 'chapa', CFG.craft.batch + 1), 'BAD_AMOUNT');
  erro(() => E.craftStart(p, START, world, 'chapa', 1.5), 'BAD_AMOUNT');
  for (const id of ['xpto', '', 'toString', '__proto__', null, 7]) erro(() => E.craftStart(p, START, world, id, 1), 'NO_RECIPE');
  encher(p, { sucata: 9 }); p.cash = 0; p.bank = 0;
  erro(() => E.craftStart(p, START, world, 'chapa', 1), 'NO_MONEY');
  assert.equal(p.mt.sucata, 9); assert.equal(p.mt.chapa, undefined); assert.equal(p.cf, null);
  encher(p, { motor: 1, circuito: 1, chapa: 2 }); p.cash = 1e6;
  erro(() => E.craftStart(p, START, world, 'broca', 2), 'BAD_AMOUNT');   // produtos: um de cada vez
});

test('em degraus: a broca pede motor, circuito e chapa, que se fazem com o que os biscates deixam', () => {
  const b = R('broca');
  for (const k of Object.keys(b.needs)) assert.ok(R(k) && R(k).kind === 'comp', k);
  for (const c of CFG.craft.list.filter((r) => r.kind === 'comp' && r.id !== 'kit')) for (const k of Object.keys(c.needs)) assert.ok(CFG.mat.base.includes(k), c.id + ' ' + k);   // o kit faz-se com componentes
  for (const c of CFG.craft.list.filter((r) => r.kind === 'comp')) assert.equal(c.ms, undefined, c.id);
  for (const c of CFG.craft.list.filter((r) => r.kind !== 'comp')) assert.ok(c.ms >= 5 * T.MIN, c.id);
  // todos os materiais dos biscates servem para alguma coisa, e todos os componentes entram nalgum produto
  const usados = new Set([...CFG.craft.list.flatMap((r) => Object.keys(r.needs)), ...Object.keys(CFG.craft.rev.needs), 'kit']);
  for (const id of E.matIds()) assert.ok(usados.has(id), id);
  // do zero: só com materiais de biscates chega-se à broca
  const p = mk(); encher(p, { pecas: 2, cobre: 3, sucata: 7, eletronica: 2 });
  E.craftStart(p, START, world, 'motor'); E.craftStart(p, START, world, 'circuito'); E.craftStart(p, START, world, 'chapa', 2);
  assert.deepEqual(p.mt, { motor: 1, circuito: 1, chapa: 2 });
  E.craftStart(p, START, world, 'broca');
  assert.deepEqual(p.mt, {});
  E.craftTake(p, START + b.ms, world);
  assert.ok(p.inv.some((x) => x.id === 'broca'));
});

test('a broca e os explosivos já não se compram: fazem-se na cave', () => {
  const p = mk();
  erro(() => E.buyItem(p, START, world, 'broca'), 'CRAFT_ONLY');
  erro(() => E.buyItem(p, START, world, 'explosivos'), 'CRAFT_ONLY');
  E.buyItem(p, START, world, 'macarico');   // os outros continuam à venda
  for (const g of CFG.gear.filter((x) => x.craft)) assert.ok(R(g.id), 'o que só se faz tem receita: ' + g.id);
});

test('uma ferramenta que já se tem não se faz; ferramentas baratas não têm receita', () => {
  const p = mk(); encher(p, R('macarico').needs);
  E.buyItem(p, START, world, 'macarico');
  erro(() => E.craftStart(p, START, world, 'macarico', 1), 'HAVE_IT');
  for (const id of ['pedecabra', 'gazuas']) erro(() => E.craftStart(p, START, world, id), 'NO_RECIPE');
});

test('armas feitas na cave saem novas, iguais às da loja; com o inventário cheio ficam na bancada', () => {
  const p = mk(), r = R('pistola'); encher(p, r.needs);
  E.craftStart(p, START, world, 'pistola', 1);
  while (E.invUsed(p) < E.invCap(p)) p.inv.push({ id: 'navalha' });
  erro(() => E.craftTake(p, START + r.ms, world), 'NO_ROOM');
  assert.ok(p.cf);
  p.inv.pop();
  E.craftTake(p, START + r.ms, world);
  const g = p.inv.find((x) => x.id === 'pistola');
  assert.ok(g); assert.equal(g.u, CFG.gear.find((x) => x.id === 'pistola').life); assert.equal(p.cf, null);
});

test('máquina de negócio: só com o negócio, uma por negócio, rende mais 15% enquanto trabalha', () => {
  const p = mk(), i = CFG.biz.findIndex((b) => b.id === 'cafe'), r = R('maq-cafe');
  encher(p, r.needs);
  erro(() => E.craftStart(p, START, world, 'maq-cafe', 1), 'NO_BIZ');
  E.buyBiz(p, START, world, i);
  const antes = E.bizRates(p, i, START).perH;
  E.craftStart(p, START, world, 'maq-cafe', 1);
  assert.equal(E.bizRates(p, i, START + 1).perH, antes, 'na bancada ainda não rende');
  const t1 = START + r.ms;
  E.craftTake(p, t1, world);
  assert.equal(p.maq.cafe, t1 + CFG.craft.rev.ms, 'trabalha uma semana');
  assert.equal(E.bizRates(p, i, t1).perH, Math.floor((antes * (10000 + CFG.craft.maqBp)) / 10000));
  assert.equal(E.bizRates(p, i, t1 + CFG.craft.rev.ms).perH, antes, 'sem revisão pára');
  encher(p, r.needs);
  erro(() => E.craftStart(p, t1, world, 'maq-cafe', 1), 'HAVE_IT');
  for (const b of CFG.biz) assert.ok(R('maq-' + b.id) && R('maq-' + b.id).biz === b.id, 'cada negócio tem a sua máquina: ' + b.id);
});

test('revisão: só quando falta uma semana ou menos; soma 7 dias; uma máquina parada volta a render', () => {
  const p = mk(), i = CFG.biz.findIndex((b) => b.id === 'cafe'), r = R('maq-cafe'), V = CFG.craft.rev;
  E.buyBiz(p, START, world, i); encher(p, r.needs);
  const base = E.bizRates(p, i, START).perH;
  E.craftStart(p, START, world, 'maq-cafe'); E.craftTake(p, START + r.ms, world);
  const u = p.maq.cafe;
  erro(() => E.maqService(p, START + r.ms, world, 'cafe'), 'NO_MAT');
  encher(p, { chapa: 3, circuito: 3, reagente: 3 });
  erro(() => E.maqService(p, START + r.ms, world, 'lavandaria'), 'NO_MACHINE');
  for (const x of ['x', 'toString', '__proto__', null, 7]) erro(() => E.maqService(p, START + r.ms, world, x), 'NO_BIZ');
  const c0 = p.cash;
  const s1 = E.maqService(p, START + r.ms + T.HOUR, world, 'cafe');   // falta menos de uma semana: pode
  assert.equal(s1.until, u + V.ms); assert.equal(p.maq.cafe, u + V.ms); assert.equal(p.cash, c0 - V.price);
  assert.deepEqual(p.mt, { chapa: 2, circuito: 2, reagente: 2 });
  erro(() => E.maqService(p, START + r.ms + 2 * T.HOUR, world, 'cafe'), 'SERVICE_EARLY');   // já está 13 dias à frente
  // deixa parar e revê: conta 7 dias a partir de agora
  const tarde = p.maq.cafe + 3 * T.DAY;
  assert.equal(E.bizRates(p, i, tarde).perH, base);
  const s2 = E.maqService(p, tarde, world, 'cafe');
  assert.equal(s2.stopped, true); assert.equal(p.maq.cafe, tarde + V.ms);
  assert.deepEqual(E.checkInvariants(p), []);
});

test('a máquina que pára a meio: o rendimento conta com ela até parar e sem ela depois', () => {
  const p = mk(), i = CFG.biz.findIndex((b) => b.id === 'cafe'), r = R('maq-cafe'), nunca = { int: (lo) => lo, chance: () => false, float: () => 0 };
  p.acct = true;   // com contabilista o armazém leva 24 h
  E.buyBiz(p, START, world, i); encher(p, r.needs);
  const base = E.bizRates(p, i, START).perH, com = Math.floor((base * (10000 + CFG.craft.maqBp)) / 10000);
  E.craftStart(p, START, world, 'maq-cafe'); E.craftTake(p, START + r.ms, world);
  const u = p.maq.cafe;
  E.collectBiz(p, u - 2 * T.HOUR, world, nunca);   // recolhe 2 h antes de parar
  const b0 = p.bank;
  E.collectBiz(p, u + 3 * T.HOUR, world, nunca);   // 2 h com máquina + 3 h sem
  assert.equal(p.bank - b0, 2 * com + 3 * base);
});

test('instalar a máquina a meio conta o rendimento anterior sem ela', () => {
  const p = mk(), i = CFG.biz.findIndex((b) => b.id === 'cafe'), r = R('maq-cafe'), nunca = { int: (lo) => lo, chance: () => false, float: () => 0 };
  E.buyBiz(p, START, world, i); encher(p, r.needs);
  const perH = E.bizRates(p, i, START).perH;
  E.craftStart(p, START, world, 'maq-cafe');
  E.craftTake(p, START + r.ms, world);   // 3 h sem máquina
  const b0 = p.bank;
  E.collectBiz(p, START + r.ms + T.HOUR, world, nunca);   // + 1 h com máquina
  assert.equal(p.bank - b0, perH * (r.ms / T.HOUR) + Math.floor((perH * (10000 + CFG.craft.maqBp)) / 10000));
});

// um biscate a sério, do princípio ao fim: o camião bem arrumado (as mais pesadas em baixo) e mal arrumado
const nunca = { int: (lo) => lo, chance: () => false, float: () => 0 }, sempre = { int: (lo) => lo, chance: () => true, float: () => 0 };
const bom = (L) => { const ord = L.boxes.map((b, i) => [b.kg, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]); const s = []; ord.forEach(([, i], k) => { s[i] = k; }); return { slots: s, drops: 0 }; };
const mau = (L) => ({ slots: bom(L).slots.map((s) => (s + 3) % 6), drops: 2 });

test('entregar o biscate: bem feito deixa 2 no depósito, mal feito 1, e o resultado diz o que deixou', () => {
  const p = mk(); let t = START;
  let r = E.workStart(p, t, world, seededRng(1), 'camiao'); t += 60000;
  let d = E.workDone(p, t, world, nunca, bom(r.task.layout));
  assert.deepEqual(d.mat, { id: 'madeira', n: 2, lost: 0 }); assert.equal(p.mt.madeira, 2);
  r = E.workStart(p, t, world, seededRng(2), 'camiao'); t += 60000;
  d = E.workDone(p, t, world, nunca, mau(r.task.layout));
  assert.deepEqual(d.mat, { id: 'madeira', n: 1, lost: 0 }); assert.equal(p.mt.madeira, 3);
  assert.deepEqual(E.checkInvariants(p), []);
});

test('apanhado num biscate ilegal: nem dinheiro nem material', () => {
  const p = mk(), c0 = p.cash;
  const r = E.workStart(p, START, world, seededRng(3), 'laboratorio');
  const d = E.workDone(p, START + 60000, world, sempre, { taps: [100, 200, 300], holds: r.task.layout.bags.map(() => 1000) });
  assert.equal(d.busted, true); assert.equal(d.mat, undefined); assert.equal(p.cash, c0); assert.deepEqual(p.mt, {});
});

test('o turno do emprego não deixa material (é trabalho da empresa, não biscate)', () => {
  const p = mk(); p.job = CFG.jobs.list.findIndex((j) => j.id === 'minimo'); p.vigor = 100;
  const r = E.workStart(p, START, world, seededRng(4), 'camiao', true);
  const d = E.workDone(p, START + 60000, world, nunca, bom(r.task.layout));
  assert.equal(d.shift, true); assert.equal(d.mat, undefined); assert.deepEqual(p.mt, {});
});

test('um estado antigo ganha os campos novos e passa as invariantes', () => {
  const p = mk(); encher(p, { sucata: 40, madeira: 1 });
  encher(p, R('macarico').needs); E.craftStart(p, START, world, 'macarico');
  const velho = JSON.parse(JSON.stringify(p)); delete velho.mt; delete velho.cf; delete velho.maq;
  E.touch(velho, START + 1000);
  assert.deepEqual(velho.mt, {}); assert.equal(velho.cf, null); assert.deepEqual(velho.maq, {});
  assert.deepEqual(E.checkInvariants(velho), []); assert.deepEqual(E.checkInvariants(p), []);
});

test('componentes: não se faz mais do que cabe no depósito', () => {
  const p = mk(); encher(p, { sucata: 40, chapa: CFG.mat.cap - 2 });
  erro(() => E.craftStart(p, START, world, 'chapa', 3), 'MAT_FULL');
  assert.equal(p.mt.sucata, 40);
  E.craftStart(p, START, world, 'chapa', 2);
  assert.equal(p.mt.chapa, CFG.mat.cap);
});

test('as contas das receitas: ferramentas e armas custam metade do preço da loja (o que o recetador dá); máquinas, 5% do negócio', () => {
  for (const r of CFG.craft.list.filter((x) => x.kind === 'tool' || x.kind === 'gun')) {
    const g = CFG.gear.find((x) => x.id === r.id);
    assert.equal(r.price, Math.floor((g.price * CFG.loot.gearSellBp) / 10000), r.id);
  }
  for (const r of CFG.craft.list.filter((x) => x.kind === 'maq')) assert.equal(r.price, CFG.biz.find((b) => b.id === r.biz).price / 20, r.id);
  // fazer e vender ao recetador nunca dá lucro em dinheiro
  const p = mk(), r = R('pistola'); encher(p, r.needs); const c0 = p.cash + p.bank;
  E.craftStart(p, START, world, 'pistola'); E.craftTake(p, START + r.ms, world);
  E.sellItem(p, START + r.ms, world, p.inv.findIndex((x) => x.id === 'pistola'));
  assert.ok(p.cash + p.bank <= c0);
});

test('kit de armeiro: faz-se na hora e repara uma arma gasta sem pagar', () => {
  const p = mk(), g = CFG.gear.find((x) => x.id === 'pistola');
  E.buyItem(p, START, world, 'pistola');
  p.eq.mao.u = 0;
  const custo = E.repairCost(p, 'mao');
  erro(() => E.repair(p, START, world, 'mao', true), 'NO_MAT');
  encher(p, R('kit').needs);
  E.craftStart(p, START, world, 'kit');
  assert.equal(p.mt.kit, 1); assert.equal(p.cf, null);
  const c0 = p.cash + p.bank;
  const r = E.repair(p, START, world, 'mao', true);
  assert.equal(r.kit, true); assert.equal(r.price, 0); assert.equal(p.cash + p.bank, c0);
  assert.equal(p.eq.mao.u, g.life); assert.equal(p.mt.kit, undefined);
  assert.ok(custo > 0);
  erro(() => E.repair(p, START, world, 'mao', true), 'NOT_WORN');
  p.eq.mao.u = 3;
  const r2 = E.repair(p, START, world, 'mao');   // sem kit: paga como antes
  assert.equal(r2.kit, false); assert.equal(p.cash + p.bank, c0 - r2.price);
});
