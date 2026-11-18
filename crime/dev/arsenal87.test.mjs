// v87 (pedido do Dinis: «5x mais armas de todos os tipos, até melees», e fazer na cave tem de compensar mais do que comprar).
// 30 armas; as melhores de cada categoria só se fazem na cave, com um material raro das escavações.
// Revisão: a de mão conta 30% ao lado da principal, nível por ordem, nível ao vestir, receitas para as da loja, reparação.
// Corre com: node --test dev/arsenal87.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const START = lisbonToUtc(2026, 11, 22, 12);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const ARMAS = ['branca', 'mao', 'principal'], G = CFG.gear.filter((g) => ARMAS.includes(g.slot));
const mk = (resp) => { const p = E.newPlayer('a' + Math.random(), START, world); p.cash = 1e7; p.respect = resp; p.peakRespect = resp; return p; };
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);

// v97 (pedido do Dinis: «como no Torn, mas mais»): 156 armas em 13 tipos, com precisão e alcance além do ataque. As regras de
// escada passam a valer dentro de cada tipo (entre tipos diferentes há trocas: uma caçadeira bate mais e chega menos longe).
const TIPOS = ['soqueira', 'faca', 'contundente', 'lamina', 'espada', 'pistola', 'revolver', 'smg', 'cacadeira', 'carabina', 'espingarda', 'sniper', 'pesada'];
test('156 armas: 54 brancas, 28 de mão e 74 principais, em 13 tipos', () => {
  assert.equal(G.length, 156);
  assert.deepEqual(ARMAS.map((s) => G.filter((g) => g.slot === s).length), [54, 28, 74]);
  assert.deepEqual([...new Set(G.map((g) => g.t))].sort(), [...TIPOS].sort());
  assert.equal(new Set(CFG.gear.map((g) => g.id)).size, CFG.gear.length, 'ids únicos');
  for (const g of G) {
    assert.ok(g.price > 0 && g.atk > 0, g.id);
    assert.equal(!!g.gun, g.slot !== 'branca', g.id + ': as de mão e principais são de fogo, as brancas não');
    if (g.gun) assert.ok(Number.isInteger(g.life) && g.life > 0, g.id);
    assert.ok(g.acc >= 20 && g.acc <= 95 && g.rng >= 1 && g.ms >= 1, g.id + ': precisão, alcance e espaços');
  }
});

test('na loja, dentro de cada tipo, mais caro é sempre mais forte', () => {
  for (const tp of TIPOS) {
    const L = G.filter((g) => g.t === tp && !g.craft).sort((a, b) => a.price - b.price);
    for (let i = 1; i < L.length; i++) assert.ok(L[i].atk > L[i - 1].atk && L[i].price > L[i - 1].price, `${L[i].id} custa mais que ${L[i - 1].id} e não é mais forte`);
  }
});

test('por nível, dentro de cada tipo: a que pede mais nível nunca é mais fraca, com degraus que se notam', () => {
  for (const tp of TIPOS) {
    const L = G.filter((g) => g.t === tp && !g.craft).sort((a, b) => (a.level || 1) - (b.level || 1) || a.atk - b.atk);
    const passo = L[0].slot === 'principal' ? 400 : 200;
    for (let i = 1; i < L.length; i++) {
      assert.ok(L[i].atk > L[i - 1].atk, `${L[i].id} (nível ${L[i].level || 1}) não é mais forte que ${L[i - 1].id} (nível ${L[i - 1].level || 1})`);
      assert.ok(L[i].atk - L[i - 1].atk >= passo, `${L[i - 1].id} → ${L[i].id}: degrau de ${L[i].atk - L[i - 1].atk} bp`);
      if ((L[i].level || 1) === (L[i - 1].level || 1)) assert.ok(L[i].price > L[i - 1].price, L[i].id + ': no mesmo nível, mais forte é mais caro');
    }
  }
  // as da cave ficam acima de todas as da loja do mesmo espaço que se usam até ao nível delas
  for (const c of G.filter((g) => g.craft)) for (const g of G.filter((x) => !x.craft && x.slot === c.slot && (x.level || 1) <= c.level)) assert.ok(c.atk > g.atk, c.id + ' > ' + g.id);
});

test('ataque: a melhor arma de fogo, 30% da outra e a branca; o teto não passa o da defesa', () => {
  const p = mk(0), at = (id) => CFG.gear.find((g) => g.id === id).atk;
  p.eq.mao = { id: 'pistola', u: 5 }; p.eq.principal = { id: 'sniper', u: 5 }; p.eq.branca = { id: 'navalha' };
  assert.equal(E.atkBp(p), at('sniper') + Math.floor((at('pistola') * CFG.gunSideBp) / 10000) + at('navalha'));
  p.eq.principal.u = 0;   // gasta: deixa de contar, e a de mão passa a ser a melhor
  assert.equal(E.atkBp(p), at('pistola') + at('navalha'));
  delete p.eq.principal; p.eq.mao.u = 0;
  assert.equal(E.atkBp(p), at('navalha'));
  const top = (s) => Math.max(...G.filter((g) => g.slot === s).map((g) => g.atk));
  const atkMax = top('principal') + Math.floor((top('mao') * CFG.gunSideBp) / 10000) + top('branca');
  const defMax = ['cabeca', 'tronco', 'pernas', 'pes', 'maos'].reduce((t, s) => t + Math.max(...CFG.gear.filter((g) => g.slot === s).map((g) => g.def)), 0);
  // no topo, com o melhor guarda (multiplica a defesa), quem se protege continua à frente de quem ataca com o melhor arsenal
  const guarda = Math.max(...CFG.guards.map((g) => g.bp));
  assert.ok(10000 + atkMax < ((10000 + defMax) * (10000 + guarda)) / 10000, `ataque ${atkMax} contra defesa ${defMax} com guarda ${guarda}`);
  assert.ok(atkMax <= defMax * 1.15, 'nas peças, o ataque não passa a defesa em mais de 15%');
});

test('o nível conta ao vestir (o que se compra na feira ou se guarda não contorna o nível)', () => {
  const lv = CFG.gear.find((g) => g.id === 'sniper').level, fraco = mk(CFG.levels[lv - 1] - 1), forte = mk(CFG.levels[lv - 1]);
  for (const p of [fraco, forte]) p.inv.push({ id: 'sniper', u: 100 });
  erro(() => E.equip(fraco, START, world, 0), 'LOW_LEVEL');
  assert.ok(!fraco.eq.principal); assert.equal(fraco.inv.length, 1);
  assert.equal(E.equip(forte, START, world, 0).slot, 'principal');
  assert.deepEqual(E.checkInvariants(forte), []);
});

test('todas as da loja a partir de 200 € também se fazem na cave, por metade do preço', () => {
  for (const g of G.filter((x) => !x.craft && x.price >= 200)) {
    const r = E.recipeOf(g.id);
    assert.ok(r && r.kind === 'gun', g.id + ' tem receita');
    assert.equal(r.price, g.price / 2, g.id);
  }
});

test('quem já tinha uma arma vestida abaixo do nível novo fica com ela (e conta no ataque); só não a volta a vestir', () => {
  const p = mk(0), lv = CFG.gear.find((g) => g.id === 'sniper').level;
  assert.ok(E.level(p) < lv);
  p.eq.principal = { id: 'sniper', u: 50 };
  E.upgrade(p);
  assert.equal(p.eq.principal.id, 'sniper');
  assert.equal(E.atkBp(p), CFG.gear.find((g) => g.id === 'sniper').atk);
  assert.deepEqual(E.checkInvariants(p), []);
  p.inv.push(p.eq.principal); delete p.eq.principal;
  erro(() => E.equip(p, START, world, p.inv.length - 1), 'LOW_LEVEL');
});

test('reparar uma da cave paga sobre o dinheiro da receita, não sobre o valor (reparar não custa mais do que fazer outra)', () => {
  const p = mk(1e7), g = CFG.gear.find((x) => x.id === 'tatica'), r = E.recipeOf('tatica');
  p.eq.principal = { id: 'tatica', u: 0 };
  assert.equal(E.repairCost(p, 'principal'), r.price);
  p.eq.principal.u = g.life / 2;
  assert.equal(E.repairCost(p, 'principal'), Math.ceil(r.price / 2));
  p.eq.mao = { id: 'pistola', u: 0 };
  assert.equal(E.repairCost(p, 'mao'), CFG.gear.find((x) => x.id === 'pistola').price, 'as da loja continuam sobre o preço');
});

test('a melhor de cada categoria só se faz na cave, com um material raro; não se compra', () => {
  for (const s of ARMAS) {
    const top = G.filter((g) => g.slot === s).sort((a, b) => b.atk - a.atk)[0];
    assert.ok(top.craft, s + ': a mais forte é da cave');
  }
  const p = mk(1e7);
  for (const g of G.filter((x) => x.craft)) {
    const r = E.recipeOf(g.id);
    assert.ok(r && r.kind === 'gun', g.id + ' tem receita');
    assert.ok(Object.keys(r.needs).some((k) => CFG.mat.rare.includes(k)), g.id + ' pede um material raro');
    assert.equal(r.price, g.price / 2, g.id + ': em dinheiro, metade do valor (como as outras)');
    erro(() => E.buyItem(p, START, world, g.id), 'CRAFT_ONLY');
  }
});

test('o que pede nível na loja também o pede na cave', () => {
  const lv = CFG.gear.find((g) => g.id === 'tatica').level, need = CFG.levels[lv - 1];
  const fraco = mk(need - 1), forte = mk(need);
  const M = { cano: 2, circuito: 1, chapa: 2, vidro: 1 }; Object.assign(fraco.mt, M); Object.assign(forte.mt, M);
  erro(() => E.craftStart(fraco, START, world, 'tatica'), 'LOW_LEVEL');
  assert.ok(E.craftStart(forte, START, world, 'tatica').ok);
  const o = E.craftTake(forte, START + E.recipeOf('tatica').ms, world);
  assert.equal(o.id, 'tatica'); assert.ok(forte.inv.some((x) => x.id === 'tatica' && x.u === CFG.gear.find((g) => g.id === 'tatica').life));
  assert.deepEqual(E.checkInvariants(forte), []);
});

test('cada arma tem nome nas duas línguas e imagem', async () => {
  globalThis.document ??= { documentElement: {} };
  const I = await import('../../sites/crime/js/i18n.js');
  for (const lang of ['pt', 'en']) { I.setLang(lang); for (const g of G) assert.ok(I.t('g_' + g.id) && I.t('g_' + g.id) !== 'g_' + g.id, lang + ' g_' + g.id); }
  for (const g of G) assert.ok(existsSync(join(AQUI, '../../sites/crime/img/gear', g.id + '.webp')), 'falta a imagem img/gear/' + g.id + '.webp');
});
