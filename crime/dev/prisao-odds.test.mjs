// As odds da prisão (pedido de 17/11, 04:10: «as cartas dizem 50% mas sinto que é pior»).
// Joga cada coisa da prisão muitas vezes com o gerador do servidor a sério (cryptoRng) e confirma que sai o que o ecrã diz.
// Corre com: node --test dev/prisao-odds.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { cryptoRng } from '../engine/rng.js';
import { lisbonToUtc } from '../engine/time.js';

const NOW = lisbonToUtc(2026, 11, 20, 10);
const W = { start: NOW - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const rng = cryptoRng();
const N = 200_000;
const preso = () => { const p = E.newPlayer('x' + Math.random(), NOW, W); p.respect = p.peakRespect = CFG.levels[20]; p.cash = 1e12; p.jailUntil = NOW + 1e12; return p; };
// a margem de 4 desvios-padrão: com 200 000 jogadas, uma diferença maior do que isto quase nunca é sorte
const margem = (pBp) => 4 * Math.sqrt((pBp / 10000) * (1 - pBp / 10000) / N);

test('cartas: ganha-se 50% das vezes e ganha-se o mesmo que se perde', () => {
  const p = preso(); let w = 0, saldo = 0, iguais = 0;
  for (let i = 0; i < N; i++) { const r = E.jailCards(p, NOW, W, 50, rng); if (r.win) w++; saldo += r.money; if ((r.cards[0] >> 2) === (r.cards[1] >> 2) || r.win !== (r.cards[0] >> 2) > (r.cards[1] >> 2)) iguais++; }
  assert.equal(iguais, 0, "as cartas mostradas decidem a mão: ganha a mais alta, nunca há empate");
  assert.equal(p.jc.n, N); assert.equal(p.jc.w, w);
  const taxa = w / N;
  console.log(`cartas: ${(taxa * 100).toFixed(2)}% de vitórias em ${N}, saldo médio por mão ${(saldo / N).toFixed(3)} €`);
  assert.ok(Math.abs(taxa - 0.5) < margem(5000), `${taxa}`);
  assert.ok(Math.abs(saldo / N) < 50 * 2 * margem(5000), 'a média por mão é zero');
});

test('pátio: 50% de vitórias; fuga: 35%; contrabando: perde-se 15%', () => {
  const y = preso(); let wy = 0;
  for (let i = 0; i < N; i++) { y.vigor = 100; if (E.jailYard(y, NOW, W, rng).win) wy++; }
  const e = preso(); let we = 0;
  for (let i = 0; i < N; i++) { e.energy = 100; e.jailUntil = NOW + 1e12; if (E.jailEscape(e, NOW, W, rng).free) we++; }
  const s = preso(); let ls = 0;
  for (let i = 0; i < N; i++) { s.energy = 100; if (E.jailSmuggle(s, NOW, W, rng).lost) ls++; }
  console.log(`pátio ${(wy / N * 100).toFixed(2)}% · fuga ${(we / N * 100).toFixed(2)}% · contrabando perdido ${(ls / N * 100).toFixed(2)}%`);
  assert.ok(Math.abs(wy / N - 0.5) < margem(5000));
  assert.ok(Math.abs(we / N - CFG.jail.escapeBp / 10000) < margem(CFG.jail.escapeBp));
  assert.ok(Math.abs(ls / N - CFG.jail.smuggleLoseBp / 10000) < margem(CFG.jail.smuggleLoseBp));
});

test('sequências: em 20 mãos a 50%, perder 13 ou mais acontece cerca de 13% das vezes (é sorte, não batota)', () => {
  // conta exata pela binomial, para o texto do ecrã
  const C = (n, k) => { let x = 1; for (let i = 0; i < k; i++) x = (x * (n - i)) / (i + 1); return x; };
  let p = 0; for (let k = 13; k <= 20; k++) p += C(20, k) / 2 ** 20;
  console.log(`P(perder 13+ em 20) = ${(p * 100).toFixed(1)}%`);
  assert.ok(p > 0.12 && p < 0.14);
});
