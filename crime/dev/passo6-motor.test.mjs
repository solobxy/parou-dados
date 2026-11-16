// Passo 6 (mundo ligado), parte 1: relógio das edições, Lisboa e a bolsa com empresas, no motor (engine/mundo.js).
// Corre com: node --test dev/passo6-motor.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../engine/config.js';
import * as M from '../engine/mundo.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import { localParts } from '../engine/time.js';

const T0 = Date.UTC(2026, 10, 20, 12);   // sexta, 12h em Lisboa (inverno)
const K = (id) => CFG.stocks.list.findIndex((s) => s.id === id);
const mercado = () => { const m = { prices: CFG.stocks.list.map((s) => s.base), gen: CFG.stocks.list.map(() => 0), tick: 0, hist: [] }; m.w = M.newWorld(m.prices, T0); return m; };
// gerador que responde sempre o mesmo (para tirar a sorte das contas)
const fixo = (v) => ({ int: (a, b) => Math.min(b, Math.max(a, v)), chance: () => false, float: () => 0.5 });

test('edições às 03h, 09h, 15h e 21h de Lisboa, também com a mudança de hora', () => {
  for (const t of [T0, Date.UTC(2026, 2, 29, 0, 30), Date.UTC(2026, 9, 25, 1, 30), Date.UTC(2026, 6, 1, 20, 59)]) {
    const ed = M.edAt(t), a = M.edStart(ed), b = M.edStart(ed + 1);
    assert.ok(a <= t && t < b, 'o instante cai dentro da sua edição');
    assert.ok([3, 9, 15, 21].includes(localParts(a).h) && localParts(a).mi === 0);
    assert.equal(M.edAt(a), ed); assert.equal(M.edAt(a - 1), ed - 1);
  }
  // antes das 03h ainda é a edição das 21h do dia anterior
  const madrugada = Date.UTC(2026, 10, 21, 2, 0);
  assert.equal(localParts(M.edStart(M.edAt(madrugada))).h, 21);
});

test('Lisboa: a criminalidade sobe com o que os jogadores fazem, a pressão vai atrás uma edição depois, e acalma sozinha', () => {
  const m = mercado(), rng = seededRng(1), ed = m.w.ed;
  M.accAdd(m.w, 'lx', 12000);   // 120 barras de golpes numa edição
  M.runEdition(m, ed + 1, rng);
  const c1 = m.w.lx.crime;
  assert.ok(c1 > CFG.world.lx.start + 10, 'subiu'); assert.equal(m.w.lx.press, CFG.world.lx.start, 'a pressão ainda é a de antes');
  M.runEdition(m, ed + 2, rng);
  assert.equal(m.w.lx.press, c1, 'uma edição depois, a pressão é a criminalidade da edição anterior');
  for (let i = 3; i < 20; i++) M.runEdition(m, ed + i, rng);
  assert.ok(m.w.lx.crime <= CFG.world.lx.floor + 1, 'sem nada, volta à rua calma');
  // a pressão mexe na hipótese de ser apanhado ao falhar um golpe: 50 é a do modelo
  const p = E.newPlayer('x', T0, { start: T0 - 1, playEnd: T0 + 1e10 });
  assert.equal(E.bustChanceBp(p, T0), CFG.bustBp); assert.equal(E.bustChanceBp(p, T0, 50), CFG.bustBp);
  assert.equal(E.bustChanceBp(p, T0, 0), Math.floor((CFG.bustBp * 7500) / 10000));
  assert.equal(E.bustChanceBp(p, T0, 100), Math.floor((CFG.bustBp * 12500) / 10000));
});

test('empresas: a receita da edição mexe no valor (até 6%), e o dividendo é uma parte do que os jogadores lá gastaram', () => {
  const m = mercado(), k = K('casino'), cc = CFG.world.co.casino, ed = m.w.ed;
  // um jogador leva 200 000 € ao casino: a receita fica negativa e a ação desce o máximo
  M.accAdd(m.w, 'casino', -200000);
  let r = M.runEdition(m, ed + 1, fixo(0));
  const res = r.arts.find((a) => a.k === 'coRes' && a.c === 'casino');
  assert.equal(res.pct, -CFG.world.maxMoveBp); assert.equal(r.div[k], 0, 'sem receita dos jogadores, não há dividendo');
  assert.ok(m.prices[k] < CFG.stocks.list[k].base);
  // muita gente a desintoxicar: a Farma sobe e paga dividendo
  const f = K('farma'), antes = m.prices[f];
  M.accAdd(m.w, 'farma', 100000);
  r = M.runEdition(m, ed + 2, fixo(0));
  assert.ok(m.prices[f] > antes);
  assert.equal(r.div[f], Math.floor((100000 * CFG.world.divBp * 100) / (10000 * CFG.world.co.farma.float)));
  assert.ok(cc.r0 > 0 && CFG.world.co.moeda.r0 === 0 && r.div[K('moeda')] === 0, 'o Merdacoin não paga dividendo');
});

test('histórias em três atos: anúncio, rumores com fiabilidade, investigação e desfecho', () => {
  const m = mercado(), rng = seededRng(5), ed0 = m.w.ed;
  let vistos = { stAnn: 0, stRum: 0, stInv: 0, stOut: 0 }, ok = 0, out = 0;
  for (let i = 1; i < 4000; i++) {
    const r = M.runEdition(m, ed0 + i, rng);
    for (const a of r.arts) {
      if (vistos[a.k] !== undefined) vistos[a.k]++;
      if (a.k === 'stRum') assert.ok(a.rel >= CFG.world.story.relMin && a.rel <= CFG.world.story.relMax && a.due > ed0 + i);
      if (a.k === 'stInv') assert.ok(a.p >= CFG.world.story.pMin && a.p <= CFG.world.story.pMax);
      if (a.k === 'stOut') { out++; if (a.ok) { ok++; assert.ok(a.pct >= CFG.world.story.upMin && a.pct <= CFG.world.story.upMax); } else assert.ok(-a.pct >= CFG.world.story.dnMin && -a.pct <= CFG.world.story.dnMax); }
    }
  }
  for (const k of Object.keys(vistos)) assert.ok(vistos[k] > 20, k);
  assert.ok(ok / out > 0.45 && ok / out < 0.65, 'corre bem perto de 55% das vezes');
  // o que se mostra de uma empresa não diz o desfecho nem a hipótese antes da investigação
  const v = M.companyView(m);
  for (const c of v) if (c.st) { assert.equal(c.st.ok, undefined); if (c.st.p !== null) assert.ok(c.st.p > 0); }
});

test('pânico: caiu mais de 12% numa edição, cai mais 4% a 8% na seguinte; falência só com três desfechos maus e a valer menos de metade', () => {
  const m = mercado(), k = K('armas'), c = m.w.co[k], ed = m.w.ed;
  c.st = { s: 'contrato', ed0: ed, due: ed + 1, p: 5000, ok: false, up: 3000, dn: 4000, rum: [], inv: false };
  let r = M.runEdition(m, ed + 1, fixo(0));
  assert.ok(r.arts.some((a) => a.k === 'stOut' && !a.ok)); assert.equal(c.pan, -1);
  const v = c.v;
  r = M.runEdition(m, ed + 2, fixo(CFG.world.panic.min));
  assert.ok(r.arts.some((a) => a.k === 'stPanic' && a.pct === -CFG.world.panic.min));
  assert.ok(m.prices[k] <= c.v && m.prices[k] < v, 'o preço passa abaixo do valor de antes'); assert.ok(c.v <= v);
  // mais dois desfechos maus seguidos (três ao todo), com a empresa já abaixo de metade: falência no terceiro, não antes
  c.st = { s: 'contrato', ed0: ed, due: ed + 3, p: 5000, ok: false, up: 3000, dn: 4500, rum: [], inv: false };
  r = M.runEdition(m, ed + 3, fixo(0)); assert.equal(c.bad, 2); assert.ok(!r.bust.includes(k));
  c.st = { s: 'contrato', ed0: ed, due: ed + 4, p: 5000, ok: false, up: 3000, dn: 4500, rum: [], inv: false };
  r = M.runEdition(m, ed + 4, fixo(0));
  assert.ok(r.bust.includes(k)); assert.equal(m.gen[k], 1); assert.equal(m.prices[k], CFG.stocks.list[k].base);
  assert.ok(r.arts.some((a) => a.k === 'stBust' && a.c === 'armas'));
});

test('entre edições o preço volta à abertura; comprar e vender logo a seguir perde sempre o empurrão e as duas comissões', () => {
  const m = mercado(), k = K('noite'), rng = seededRng(3);
  const p = E.newPlayer('y', T0, { start: T0 - 1, playEnd: T0 + 1e10 }); p.cash = 1e9; p.bank = 0; p.respect = p.peakRespect = CFG.levels[79];
  const W = { start: T0 - 1, playEnd: T0 + 1e10 }, antes = m.prices[k];
  const b = E.stockBuy(p, T0, W, m, k, 5000, antes);
  assert.ok(b.price > antes && m.prices[k] === b.price, 'a compra empurra o preço e faz-se ao preço empurrado');
  const s = E.stockSell(p, T0, W, m, k, 5000, m.prices[k]);
  assert.ok(s.got < b.paid, 'ida e volta perde');
  for (let i = 0; i < 30; i++) M.priceTick(m, rng);
  assert.ok(Math.abs(m.prices[k] - m.w.co[k].anc) <= Math.ceil(m.w.co[k].anc * 0.01), 'volta à abertura');
  // o mercado antigo (sem empresas) continua sem empurrão: os testes e as contas antigas não mudam
  const velho = E.newMarket(); const q = E.newPlayer('z', T0, W); q.cash = 1e9; q.respect = q.peakRespect = CFG.levels[79];
  E.stockBuy(q, T0, W, velho, k, 5000); assert.equal(velho.prices[k], CFG.stocks.list[k].base);
});
