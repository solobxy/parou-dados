// v114 (pedido do Dinis: póquer entre jogadores, à maneira do Torn). Primeiro o motor da mesa (engine/poker.js), puro:
// as mãos, as voltas de apostas, os potes laterais, a comissão e os jogadores da casa. Milhares de mãos ao calhas a provar que as
// fichas nunca aparecem nem desaparecem (só a comissão sai), que a mão acaba sempre e que ninguém joga fora da vez.
// Corre com: node --test dev/poquer114.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../engine/config.js';
import * as K from '../engine/poker.js';
import { seededRng } from '../engine/rng.js';

// cartas: «As» = ás de espadas; naipes s h d c (0..3), valores A 2..9 T J Q K (0..12)
const C = (x) => 'shdc'.indexOf(x[1]) * 13 + 'A23456789TJQK'.indexOf(x[0]);
const H = (s) => s.split(' ').map(C);
const cat = (s) => K.handCat(K.best(H(s)));

test('as categorias das mãos', () => {
  assert.equal(cat('As Kd 7h 4c 2s'), 0);
  assert.equal(cat('As Ad 7h 4c 2s'), 1);
  assert.equal(cat('As Ad 7h 7c 2s'), 2);
  assert.equal(cat('As Ad Ah 7c 2s'), 3);
  assert.equal(cat('As 2d 3h 4c 5s'), 4, 'a roda');
  assert.equal(cat('Ts Jd Qh Kc As'), 4);
  assert.equal(cat('2h 7h 9h Jh Kh'), 5);
  assert.equal(cat('As Ad Ah 7c 7s'), 6);
  assert.equal(cat('As Ad Ah Ac 2s'), 7);
  assert.equal(cat('9h Th Jh Qh Kh'), 8);
  assert.equal(cat('As 2s 3s 4s 5s'), 8, 'a roda de cor');
});

test('quem ganha: desempates e a melhor de 7', () => {
  const v = (s) => K.best(H(s));
  assert.ok(v('As Ad 7h 4c 2s') > v('Ks Kd Qh Jc 9s'), 'par de ases ganha a par de reis');
  assert.ok(v('As Ad Kh 4c 2s') > v('Ah Ac Qh Jc 9s'), 'o kicker desempata');
  assert.equal(v('As Ad Kh 4c 2s'), v('Ah Ac Kd 4h 2d'), 'igual é igual');
  assert.ok(v('As 2d 3h 4c 5s') < v('2s 3d 4h 5c 6s'), 'a roda é a sequência mais baixa');
  assert.ok(v('2h 7h 9h Jh Kh') > v('Ts Jd Qh Kc As'), 'cor ganha a sequência');
  // 7 cartas: a melhor de 5 (uma cor escondida entre pares)
  assert.equal(K.handCat(K.best(H('2h 2d 7h 9h Jh Kh 7c'))), 5);
  assert.equal(K.handCat(K.best(H('2h 3d 4c 5s 9h Kd 6h'))), 4);
  assert.equal(K.handCat(K.best(H('Ah Ad Ac Kh Kd 2c 2d'))), 6);
});

// uma mesa com fichas dadas, de propósito
function mesa(chips, st = 0, rng = seededRng(7)) {
  const tb = K.pkNew('t', st, 0);
  chips.forEach((c, i) => { if (c != null) K.pkSit(tb, i, { who: 'j' + i, name: 'J' + i, chips: c }); });
  return tb;
}
// as fichas de todos: na mão, o que cada um tem e o que já pôs no pote; no fim, o pote já foi pago a quem ganhou
const soma = (tb) => tb.seats.reduce((a, s) => a + (s ? s.chips + (tb.hand && !tb.hand.res ? s.put : 0) : 0), 0);

test('dois a jogar: o botão põe a pequena e fala primeiro antes do flop', () => {
  const tb = mesa([400, 400]), rng = seededRng(1);
  assert.ok(K.pkStart(tb, rng, 0));
  const bb = CFG.poker.stakes[0].bb, h = tb.hand;
  assert.equal(h.sb, tb.btn);
  assert.equal(tb.seats[h.sb].bet, bb / 2); assert.equal(tb.seats[h.bb].bet, bb);
  assert.equal(h.toAct, h.sb);
  assert.throws(() => K.pkAct(tb, h.bb, 'check', 0, 1), /NOT_YOUR_TURN/);
  K.pkAct(tb, h.sb, 'call', 0, 1);
  assert.equal(tb.hand.toAct, h.bb, 'a grande ainda pode aumentar');
  K.pkAct(tb, h.bb, 'check', 0, 2);
  assert.equal(tb.hand.street, 1); assert.equal(tb.hand.board.length, 3);
});

test('sem flop não há comissão; quem desiste perde o que pôs', () => {
  const tb = mesa([400, 400, 400]), rng = seededRng(2);
  K.pkStart(tb, rng, 0);
  const h = tb.hand, ini = 1200;
  let guard = 0;
  while (!tb.hand.res && guard++ < 10) K.pkAct(tb, tb.hand.toAct, 'fold', 0, guard);
  assert.ok(tb.hand.res); assert.equal(tb.hand.res.rake, 0);
  assert.equal(soma(tb), ini, 'as fichas ficam todas na mesa');
  assert.equal(tb.hand.res.win.length, 1);
  assert.equal(tb.seats[h.bb].chips, 400 + CFG.poker.stakes[0].bb / 2, 'a grande leva a pequena');
});

test('potes laterais: quem foi a all-in com menos só ganha até onde pôs', () => {
  // A (lugar 0) tem 100 e a melhor mão; B e C têm 400. Todos a all-in: A leva 3 × 100; B e C disputam o resto.
  const tb = mesa([100, 400, 400]);
  K.pkStart(tb, seededRng(3), 0);
  const h = tb.hand;
  // cartas à mão: A com ases, B com reis, C com lixo; mesa sem cor nem sequência
  tb.seats[0].hole = H('As Ad'); tb.seats[1].hole = H('Ks Kd'); tb.seats[2].hole = H('7c 2h');
  h.deck = H('3c 8d 9s Jh 4d').reverse();   // sai do fim do baralho: flop 4d Jh 9s, turn 8d, river 3c
  let guard = 0;
  while (!tb.hand.res && guard++ < 20) { const i = tb.hand.toAct, o = K.pkOptions(tb, i); K.pkAct(tb, i, o.canRaise ? 'raise' : o.check ? 'check' : 'call', o.max, guard); }
  const r = tb.hand.res, rake = r.rake;
  assert.equal(r.total, 900);
  assert.ok(rake > 0 && rake <= CFG.poker.stakes[0].bb * CFG.poker.rakeCapBB);
  assert.equal(soma(tb) + rake, 900);
  // A ganha o pote principal (300, menos a comissão que cai primeiro nele); B ganha o lateral (600)
  assert.equal(tb.seats[0].chips, 300 - rake);
  assert.equal(tb.seats[1].chips, 600);
  assert.equal(tb.seats[2].chips, 0);
  assert.deepEqual(new Set(r.shown), new Set([0, 1, 2]));
});

test('o aumento: mínimo, máximo e um all-in curto não reabre', () => {
  const tb = mesa([400, 400, 30]);
  K.pkStart(tb, seededRng(4), 0);
  const i = tb.hand.toAct, o = K.pkOptions(tb, i), bb = CFG.poker.stakes[0].bb;
  assert.equal(o.minTo, 2 * bb);
  assert.throws(() => K.pkAct(tb, i, 'raise', 3, 1), /BAD_RAISE/);
  assert.throws(() => K.pkAct(tb, i, 'raise', o.max + 1, 1), /BAD_RAISE/);
  assert.throws(() => K.pkAct(tb, i, 'check', 0, 1), /CANT_CHECK/);
  K.pkAct(tb, i, 'raise', 20, 1);
  assert.equal(tb.hand.cur, 20); assert.equal(tb.hand.minR, 18);
  assert.equal(K.pkOptions(tb, tb.hand.toAct).minTo, 38);
});

// milhares de mãos com jogadas ao calhas (e algumas mal feitas): as fichas nunca mudam de soma (só sai a comissão)
test('mãos ao calhas: as fichas fecham sempre e ninguém fica preso', () => {
  const rng = seededRng(114);
  let maos = 0, rakeTot = 0;
  for (let jogo = 0; jogo < 120; jogo++) {
    const n = rng.int(2, 6), st = rng.int(0, 3), S = CFG.poker.stakes[st];
    const tb = K.pkNew('t', st, 0);
    for (let i = 0; i < n; i++) K.pkSit(tb, i, { who: 'j' + i, name: 'J' + i, chips: rng.int(S.bb, S.max), bot: rng.chance(2000) });
    const ini = soma(tb);
    let rk = 0;
    for (let m = 0; m < 25 && K.pkStart(tb, rng, m); m++) {
      maos++;
      let guard = 0;
      while (!tb.hand.res) {
        assert.ok(guard++ < 200, 'a mão tem de acabar');
        const i = tb.hand.toAct;
        assert.ok(i >= 0, 'há sempre alguém a jogar até ao fim');
        // ninguém mais pode jogar
        for (let k = 0; k < tb.seats.length; k++) if (k !== i) assert.equal(K.pkOptions(tb, k), null);
        const o = K.pkOptions(tb, i);
        if (rng.chance(500)) { assert.throws(() => K.pkAct(tb, i, 'raise', -5, m), K.PokerError); continue; }
        const mv = tb.seats[i].bot ? K.pkBot(tb, i, rng) : (() => { const x = rng.int(0, 9); if (x < 2) return { move: 'fold' }; if (x < 6) return { move: o.check ? 'check' : 'call' };
          return o.canRaise ? { move: 'raise', amt: rng.int(o.minTo, o.max) } : { move: o.check ? 'check' : 'call' }; })();
        K.pkAct(tb, i, mv.move, mv.amt, m);
        assert.equal(soma(tb) + rk + (tb.hand.res ? tb.hand.res.rake : 0), ini, 'durante a mão');
      }
      rk += tb.hand.res.rake;
      assert.equal(soma(tb) + rk, ini, 'no fim da mão');
      assert.ok(tb.hand.res.win.every((w) => w.amt >= 0));
      for (const s of tb.seats) if (s) { assert.ok(Number.isSafeInteger(s.chips) && s.chips >= 0); s.put = 0; }   // o servidor limpa o pote entre mãos
      // quem ficou sem fichas sai
      tb.seats.forEach((s, k) => { if (s && s.chips === 0) tb.seats[k] = null; });
    }
    rakeTot += rk;
  }
  assert.ok(maos > 1000, 'muitas mãos jogadas: ' + maos);
  assert.ok(rakeTot > 0);
});

test('os da casa jogam sempre uma jogada válida e não desistem quando podem passar', () => {
  const rng = seededRng(9);
  for (let k = 0; k < 60; k++) {
    const tb = mesa([400, 400, 400, 400]);
    tb.seats.forEach((s) => { if (s) s.bot = true; });
    K.pkStart(tb, rng, 0);
    let guard = 0;
    while (!tb.hand.res && guard++ < 100) {
      const i = tb.hand.toAct, o = K.pkOptions(tb, i), mv = K.pkBot(tb, i, rng);
      if (o.check) assert.notEqual(mv.move, 'fold');
      K.pkAct(tb, i, mv.move, mv.amt, guard);
    }
    assert.ok(tb.hand.res);
  }
});

test('o que cada um vê: as suas cartas sim, as dos outros só na mostra', () => {
  const tb = mesa([400, 400, 400]);
  K.pkStart(tb, seededRng(5), 0);
  const v = K.pkView(tb, 'j1', 0);
  assert.equal(v.seats[1].hole.length, 2); assert.ok(v.seats[1].hole.every((c) => Number.isInteger(c)));
  assert.deepEqual(v.seats[0].hole, [null, null]);
  assert.equal(v.hand.deck, undefined, 'o baralho nunca sai do servidor');
  assert.equal(JSON.stringify(v).includes('"deck"'), false);
});
