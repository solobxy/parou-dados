// v77 (pedido de 17/11, 03:39: «um sistema de noticias muito melhor», com 1 ou 10 milhões de jogadores): o jornal mede o que é
// grande contra o que é normal, imprime 3 por categoria e edição e trava a última hora. Corre com: node --test dev/noticias77.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as NW from '../engine/noticias.js';
import { seededRng } from '../engine/rng.js';

// valores de um golpe: quase todos pequenos, alguns enormes (cauda longa), como no jogo
const golpe = (rng) => Math.round(80 * Math.exp(rng.int(0, 1000) / 180));   // 80 € a ~20 000 €

test('a mediana dos histogramas fica no degrau certo', () => {
  const h = {}; for (let i = 0; i < 99; i++) NW.histAdd(h, 100); NW.histAdd(h, 1e6);
  const m = NW.histMedian([h]); assert.ok(m > 80 && m <= 100, String(m));
  assert.equal(NW.histMedian([{}, null]), 0);
  assert.ok(NW.bucketOf(1e12) <= 255);
});

test('uma edição imprime no máximo 3 por categoria, cada pessoa uma vez, e só o que passa o triplo do normal', () => {
  const s = NW.newsState(0), rng = seededRng(3);
  for (let i = 0; i < 2000; i++) { const v = golpe(rng); NW.sample(s, 'job', v, { name: 'p' + (i % 50), c: 1 }); }
  NW.sample(s, 'job', 1e6, { name: 'p1', c: 2 }); NW.sample(s, 'job', 9e5, { name: 'p1', c: 2 });
  const floor = NW.floorOf(s, 'job'), out = NW.closeEdition(s, 1).filter((x) => x.cat === 'job');
  assert.ok(out.length <= 3 && out.length >= 1);
  assert.equal(new Set(out.map((x) => x.name)).size, out.length, 'a mesma pessoa não aparece duas vezes');
  assert.equal(out[0].v, 1e6); assert.ok(out.every((x) => x.v >= floor));
  assert.equal(s.ring.length, 1); assert.deepEqual(s.cur.c, {});
  for (let e = 2; e < 20; e++) NW.closeEdition(s, e);
  assert.equal(s.ring.length, CFG.news.ed.eds, 'só as últimas 8 edições contam para o normal');
});

test('com um jogador sozinho, o jornal fala dos golpes grandes dele (e não dos pequenos)', () => {
  const s = NW.newsState(0);
  for (let i = 0; i < 40; i++) NW.sample(s, 'job', 600, { name: 'so', c: 1 });
  NW.sample(s, 'job', 1500, { name: 'so', c: 1 });   // abaixo do mínimo de 2 000 €: não é notícia
  assert.equal(NW.closeEdition(s, 1).length, 0);
  for (let i = 0; i < 40; i++) NW.sample(s, 'job', 600, { name: 'so', c: 1 });
  NW.sample(s, 'job', 4000, { name: 'so', c: 3 });
  const out = NW.closeEdition(s, 2); assert.equal(out.length, 1); assert.equal(out[0].v, 4000);
  assert.ok(NW.livePass(NW.newsState(0), 'job', 4000, 0), 'na última hora também');
});

// N jogadores, cada um com 4 golpes por hora durante 24 h: quantas notícias saem?
function dia(Nj, seed) {
  const s = NW.newsState(0), rng = seededRng(seed), H = 24, t0 = Date.UTC(2026, 10, 17);
  let live = 0, feats = 0, ed = 0;
  const per = Math.min(Nj * 4, 4000);   // amostra: com muita gente simula-se 4 000 golpes por hora, mas com a cauda de N jogadores
  const extra = Math.log(Math.max(1, (Nj * 4) / per));   // os maiores de N×4 golpes são maiores do que os de 4 000: sobe-se a cauda
  for (let h = 0; h < H; h++) {
    for (let i = 0; i < per; i++) {
      const v = Math.round(golpe(rng) * Math.exp(extra * (rng.int(0, 1000) / 1000) ** 8)), t = t0 + h * T.HOUR + Math.floor((i * T.HOUR) / per);
      NW.sample(s, 'job', v, { name: 'p' + rng.int(0, Nj - 1), c: 1 });
      if (v >= CFG.news.cats.job.min && NW.livePass(s, 'job', v, t)) live++;
    }
    if (h % 6 === 5) { feats += NW.closeEdition(s, ++ed).length; }
  }
  return { live, feats };
}
test('escala: com 10, 1 000 ou 10 milhões de jogadores, a última hora sai ao mesmo ritmo e as edições trazem 3 por categoria', () => {
  const r = [10, 1000, 1e7].map((n) => ({ n, ...dia(n, 11) }));
  for (const x of r) {
    assert.ok(x.live <= 24 * 12, `${x.n}: ${x.live} notícias numa categoria num dia é demais`);
    assert.ok(x.feats <= 4 * 3, `${x.n}: no máximo 3 por edição`);
  }
  console.log('ritmo por dia:', r.map((x) => x.n + ' jogadores → ' + x.live + ' na última hora, ' + x.feats + ' nas edições').join('; '));
  assert.ok(r[0].live >= 1, 'com 10 jogadores ainda há notícias');
  assert.ok(r[2].live >= 6, 'com 10 milhões o jornal não fica calado');
  assert.ok(r[2].live <= r[1].live * 4 + 10, `o ritmo não explode com a gente: ${r.map((x) => x.n + '→' + x.live).join(', ')}`);
});

test('o travão: com pouca gente passa tudo; numa rajada, gasta-se a reserva e depois só passa quando a fasquia desce', () => {
  const s = NW.newsState(0), t = 0;
  for (let i = 0; i < CFG.news.live.tokens; i++) assert.ok(NW.livePass(s, 'escape', 0, t + i * 1000), 'a reserva deixa passar ' + (i + 1));
  assert.ok(!NW.livePass(s, 'escape', 0, t + 10_000), 'reserva gasta: a seguinte igual não passa');
  assert.ok(NW.livePass(s, 'escape', 0, t + 11 * 60_000), 'uma notícia de reserva volta em 10 minutos');
  const g = NW.newsState(0); for (let i = 0; i < 6; i++) NW.livePass(g, 'job', 3000, i);
  assert.ok(NW.livePass(g, 'job', 50000, 10), 'com a reserva gasta, uma muito maior passa na mesma');
});

test('o peso: um escândalo pesa mais do que uma proposta; um golpe enorme pesa mais do que um no limite', () => {
  assert.ok(NW.weight({ k: 'govScandal' }) > NW.weight({ k: 'govBill' }));
  assert.ok(NW.weight({ k: 'feat', cat: 'job', v: 64000 }) > NW.weight({ k: 'feat', cat: 'job', v: 2000 }));
  assert.ok(NW.weight({ k: 'govVote', passed: true }) > NW.weight({ k: 'govVote', passed: false }));
});

test('o mundo antigo ganha o estado do jornal sem perder nada', () => {
  const w = { ed: 7 }; const s = NW.newsUp(w); assert.equal(s.cur.ed, 7); assert.ok(Array.isArray(s.ring));
  w.nw.ring.push({ ed: 6, h: { job: { 40: 2 } } }); NW.newsUp(w); assert.equal(w.nw.ring.length, 1);
});
