// v76 (pedido de 17/11, 03:39): o mundo tem de funcionar igual com 1, 10, 100… 10 000 000 de jogadores.
// Prova: o mesmo comportamento por cabeça dá os mesmos indicadores em todas as escalas (criminalidade, pressão, preço da droga,
// empurrão na bolsa, dividendo por ação a quem tem a mesma parte). Só abaixo de 8 pessoas o mundo pequeno manda (é o piso).
// Corre com: node --test dev/escala76.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../engine/config.js';
import * as M from '../engine/mundo.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';

const T0 = Date.UTC(2026, 10, 17, 12);
const ESCALAS = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000];
const mercado = () => { const m = { ...E.newMarket(), hist: [] }; m.w = M.newWorld(m.prices, T0); return m; };
const COCA = CFG.drugs.findIndex((g) => g.id === 'coca');

// N jogadores durante 40 edições: cada um faz por edição o mesmo que um jogador normal (300 pontos em Lisboa, 60 no Alentejo,
// 20 € no casino); o resultado tem de ser o mesmo em todas as escalas
function correr(N, eds = 40) {
  const m = mercado(), rng = seededRng(7);
  for (let i = 1; i <= eds; i++) {
    M.accAdd(m.w, 'n', N); M.accAdd(m.w, 'lx', 300 * N); M.accAdd(m.w, 'al', 60 * N);
    M.runEdition(m, m.w.ed + 1, rng);
  }
  return m;
}

test('a gente: média que anda devagar, mais 5 de fundo, nunca menos de 8', () => {
  const m = mercado();
  assert.equal(M.popOf(m.w), CFG.world.pop.ref);
  M.accAdd(m.w, 'n', 1000); M.runEdition(m, m.w.ed + 1, seededRng(1));
  assert.equal(Math.round(M.popOf(m.w)), 250 + 5, 'um quarto da edição nova entra na média');
  for (let i = 0; i < 60; i++) M.runEdition(m, m.w.ed + 1, seededRng(1));
  assert.equal(M.popOf(m.w), CFG.world.pop.ref, 'sem ninguém, volta ao piso');
});

test('criminalidade e pressão iguais em todas as escalas a partir de 100 jogadores (a menos de 5 pontos); com 10, as 5 pessoas de fundo pesam um terço', () => {
  const res = ESCALAS.map((N) => { const m = correr(N); return { N, lx: m.w.lx.crime, pr: m.w.lx.press, al: m.w.rg.al.crime }; });
  console.log(res.map((x) => `${x.N}: Lisboa ${x.lx}, pressão ${x.pr}, Alentejo ${x.al}`).join(' · '));
  const big = res.filter((x) => x.N >= 100), ref = big[big.length - 1];
  const dez = res.find((x) => x.N === 10); assert.ok(dez.lx < ref.lx && ref.lx - dez.lx <= 10, `10 jogadores: ${dez.lx}`);
  for (const x of big) {
    assert.ok(Math.abs(x.lx - ref.lx) <= 5, `${x.N}: Lisboa ${x.lx} contra ${ref.lx}`);
    assert.ok(Math.abs(x.al - ref.al) <= 5, `${x.N}: Alentejo ${x.al} contra ${ref.al}`);
  }
  // com 1 jogador conta como uma cidade de 8: a rua fica mais calma, mas mexe (e nunca passa da de muitos)
  const um = res[0];
  assert.ok(um.lx > CFG.world.lx.floor && um.lx <= ref.lx, `1 jogador: ${um.lx}`);
  // ninguém a jogar: tudo na base
  const vazio = correr(0); assert.ok(vazio.w.lx.crime <= CFG.world.lx.floor + 1);
});

test('o preço da droga: despejar o mesmo por cabeça mexe o mesmo em qualquer escala', () => {
  const sat = ESCALAS.map((N) => {
    const m = correr(N, 12);
    // cada jogador despeja 1/100 da profundidade de uma cidade de 8 (no total, 10% do mercado num mundo grande)
    const D0 = M.depthU('lx', COCA), q = M.quoteC(m.w, 'lx', COCA, Math.max(1, Math.round((D0 * N) / 80)), -1, T0);
    return { N, s1: q.s1 };
  });
  console.log(sat.map((x) => `${x.N}: ${x.s1}`).join(' · '));
  const big = sat.filter((x) => x.N >= 100), a = big[big.length - 1].s1;
  for (const x of big) assert.ok(Math.abs(x.s1 - a) <= 60, `${x.N}: ${x.s1} contra ${a}`);
  assert.ok(a > CFG.market.satMin + 500, 'o teste não bate no limite');
  // um jogador sozinho num mundo de 10 milhões quase não mexe o preço
  const m = correr(10_000_000, 12), q = M.quoteC(m.w, 'lx', COCA, 1000, -1, T0);
  assert.ok(Math.abs(q.s1 - 10000) < 5, 'mil gramas num mundo enorme não fazem mossa');
});

test('bolsa: o empurrão de uma ordem do mesmo tamanho por cabeça é o mesmo; o dividendo por ação não cresce com a gente', () => {
  const res = ESCALAS.filter((N) => N >= 100).map((N) => {
    const m = correr(N, 12), k = CFG.stocks.list.findIndex((s) => s.id === 'casino');
    const imp = M.impactBp(m, k, 2_000 * N);   // 2 000 € por cabeça numa ordem
    M.accAdd(m.w, 'casino', 5_000 * N); M.runEdition(m, m.w.ed + 1, seededRng(3));
    return { N, imp, div: m.w.co[k].div };
  });
  console.log(res.map((x) => `${x.N}: empurrão ${x.imp} bp, dividendo ${x.div}`).join(' · '));
  const z = res[res.length - 1];
  assert.ok(z.imp > 0 && z.imp < CFG.world.impMaxBp && z.div > 0, 'os números do teste não são zero nem o teto');
  for (const x of res) { assert.ok(Math.abs(x.imp - z.imp) <= Math.max(2, z.imp * 0.06), `${x.N}: ${x.imp}`); assert.ok(Math.abs(x.div - z.div) <= Math.max(1, z.div * 0.06), `${x.N}: ${x.div}`); }
});
