// Passo 1 da base nova (conta permanente e épocas): regras do motor.
// Corre com: node --test dev/passo1-motor.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seasonAt, lisbonToUtc, localParts } from '../engine/time.js';

const START = Date.UTC(2026, 10, 20, 21, 0);
const world = { start: START, playEnd: Number.MAX_SAFE_INTEGER };
const always = { int: (lo) => lo, chance: () => true, float: () => 0 };
const mk = () => E.newPlayer('x' + Math.random(), START, world);
const setResp = (p, r) => { p.respect = r; p.peakRespect = Math.max(p.peakRespect, r); };

// a escala antiga (rondas): só serve para a economia antiga continuar igual até ao passo 2
const OLD = [0, 3, 10, 30, 80, 180, 350, 600, 950, 1400, 2000, 2800, 3900, 5400, 7500, 10500, 15000, 22000, 32000, 46000];
const oldLevel = (r) => { let L = 1; while (L < OLD.length && OLD[L] <= r) L++; return L; };
const newLevel = (r) => { let L = 1; while (L < 100 && Math.round(1.3 * (L + 1) ** 2.55) <= r) L++; return L; };

test('níveis: 100, respeito acumulado = 1,3 × N^2,55 (a tabela da wiki)', () => {
  assert.equal(CFG.levels.length, 100);
  assert.equal(CFG.levels[0], 0);
  const wiki = { 10: 461, 20: 2701, 40: 15820, 60: 44487, 80: 92645, 100: 163660 };
  for (const [n, r] of Object.entries(wiki)) assert.equal(CFG.levels[n - 1], r, `nível ${n}`);
  for (let i = 1; i < 100; i++) assert.ok(CFG.levels[i] > CFG.levels[i - 1], 'sempre a subir');
  const p = mk();
  for (const r of [0, 7, 8, 460, 461, 2700, 2701, 163659, 163660, 9e9]) { setResp(p, r); assert.equal(E.level(p), newLevel(r), `respeito ${r}`); }
  setResp(p, 9e9); assert.equal(E.level(p), 100, 'não passa de 100');
});

test('o nível nunca desce: conta o maior respeito que já se teve', () => {
  const p = mk(); setResp(p, 5000); const L = E.level(p);
  p.respect = 10; assert.equal(E.level(p), L);
});

test('v89: o porto e o aeroporto passaram para a escala nova (1 000 € + 100 € por nível, um lugar a mais nos níveis 35 e 70); o casino já está em euros (passo 2)', () => {
  for (const r of [0, 3, 79, 80, 600, 2800, 2801, 15000, 46000, 300000, 1e7]) {
    const p = mk(); setResp(p, r);
    assert.equal(E.tier(p), oldLevel(r), `tier com ${r}`);
    assert.ok([5, 20, 50, 1000].includes(E.casinoMax(p)), `aposta máxima com ${r}`);
    assert.equal(E.portCap(p), 1000 + 100 * E.level(p), `carregamento máximo com ${r}`);
    assert.equal(E.airCap(p), E.portCap(p));
    assert.equal(E.portSlots(p), E.level(p) >= 70 ? 3 : E.level(p) >= 35 ? 2 : 1, `lugares no porto com ${r}`);
  }
});

test('o que se desbloqueia por nível passa para a escala nova com o mesmo respeito', () => {
  const lvAt = (oldL) => newLevel(OLD[oldL - 1]);
  assert.equal(CFG.gang.minLevel, lvAt(4));
  assert.equal(CFG.accountant.minLevel, lvAt(3));
  assert.equal(CFG.hitman.minLevel, lvAt(5));
  assert.deepEqual(CFG.port.ships.map((s) => s.level), [1, 3, 5, 7, 10, 13].map(lvAt));
  assert.deepEqual(CFG.air.routes.map((s) => s.level), [5, 7, 9, 11, 13].map(lvAt));
  assert.deepEqual(CFG.missions.filter((m) => m.type === 'level').map((m) => m.need), [3, 5, 8, 10, 13, 16, 20].map(lvAt));
  // quem tinha o respeito para passar a porta antiga passa a nova
  for (const kind of ['gear', 'tools', 'gweapons', 'guards']) for (const g of CFG[kind]) {
    if (!g.level) continue;
    assert.ok(g.level >= 1 && g.level <= 100, `${kind} ${g.id}`);
  }
  assert.equal(CFG.tools.find((g) => g.id === 'broca').level, lvAt(15));
  assert.equal(CFG.gear.find((g) => g.id === 'minigun'), undefined, 'a minigun saiu no passo 2');
});

test('subir de nível já não enche a stamina (passo 2), nem na escala antiga', () => {
  // de 124 para 125 sobe o nível novo (5 → 6) mas não a escala antiga (fica em 5, de 80 a 179)
  const a = E.newPlayer('y', START, world); a.energy = 10;
  assert.equal(newLevel(124), 5); assert.equal(newLevel(125), 6); assert.equal(oldLevel(124), oldLevel(125));
  // um golpe que dá respeito (o carteirista dá uns 2 a 3 no nível 5)
  a.respect = a.peakRespect = 124; const t = START + T.MIN;
  const r = E.doCrime(a, t, world, 0, always);
  assert.ok(r.levelUp && r.levelUp.to === 6, 'o nível novo subiu e vem no resultado');
  assert.equal(a.energy, 10 - CFG.crimes[0].e, 'a stamina não encheu');
  const b = E.newPlayer('z', START, world); b.respect = b.peakRespect = 179; b.energy = 10;   // 180 = escala antiga 6
  E.doCrime(b, t, world, 0, always);
  assert.equal(b.energy, 10 - CFG.crimes[0].e, 'subir a escala antiga também já não enche');
});

test('começa-se com 50 €', () => {
  assert.equal(CFG.start.cash, 50);
  assert.equal(mk().cash, 50);
  assert.deepEqual(mk().titles, []);
});

test('divisões por nível: 1–20, 21–40, 41–60, 61–80, 81–100', () => {
  const d = (L) => E.divisionOf(L);
  assert.deepEqual([1, 20, 21, 40, 41, 60, 61, 80, 81, 100].map(d), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test('épocas: 28 dias, a começar à sexta às 21:00 de Lisboa, também na mudança de hora', () => {
  const A = { y: 2026, m: 11, d: 13 };
  const e0 = seasonAt(A, lisbonToUtc(2026, 11, 13, 21) + 1000);
  assert.equal(e0.n, 0);
  assert.equal(e0.start, lisbonToUtc(2026, 11, 13, 21));
  assert.equal(e0.end, lisbonToUtc(2026, 12, 11, 21));
  for (let n = 0; n < 20; n++) {
    const s = seasonAt(A, e0.start + n * 28 * T.DAY + 3 * T.DAY);
    assert.equal(s.n, n);
    const p = localParts(s.start), q = localParts(s.end);
    assert.equal(p.h, 21); assert.equal(q.h, 21); assert.equal(p.mi, 0);
    assert.equal(new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(), 5, 'sexta-feira');
    const h = (s.end - s.start) / T.HOUR; assert.ok([671, 672, 673].includes(h), `época ${n}: ${h} h`);
    assert.equal(seasonAt(A, s.end).n, n + 1, 'o fim de uma é o início da seguinte');
    assert.equal(seasonAt(A, s.end - 1).n, n);
  }
  assert.equal(seasonAt(A, lisbonToUtc(2026, 11, 1, 12)).n, 0, 'antes da primeira conta como a primeira');
});

test('época: entra-se na divisão do nível que se tem; conta o respeito ganho nela', () => {
  const p = mk(); setResp(p, CFG.levels[44]);   // nível 45
  E.seasonJoin(p, 3);
  assert.deepEqual(p.ep, { n: 3, div: 2, r0: CFG.levels[44] });
  assert.equal(E.seasonScore(p, 3), 0);
  p.respect += 120; assert.equal(E.seasonScore(p, 3), 120);
  p.respect = 5; assert.equal(E.seasonScore(p, 3), 0, 'perder respeito não dá pontos negativos');
  E.seasonJoin(p, 3); assert.equal(p.ep.r0, CFG.levels[44], 'entrar outra vez na mesma época não mexe em nada');
  assert.equal(E.seasonScore(p, 4), 0, 'noutra época não conta');
});

test('pódio: os 3 primeiros de cada divisão, só quem ganhou respeito; empates pelo respeito total', () => {
  const ps = [];
  const add = (div, score, resp) => { const p = mk(); p.ep = { n: 1, div, r0: 0 }; p.respect = score; p.peakRespect = resp; ps.push(p); return p; };
  const a = add(0, 50, 50), b = add(0, 80, 80), c = add(0, 80, 80), d = add(0, 10, 10), e = add(0, 0, 0);
  c.respect = 80; c.ep.r0 = 0; b.respect = 80;
  const f = add(2, 5, 5);
  const old = mk(); old.ep = { n: 0, div: 0, r0: 0 }; old.respect = 999; ps.push(old);   // de outra época: não entra
  const pod = E.seasonPodium(ps, 1);
  assert.equal(pod.length, 5);
  assert.deepEqual(pod[0].map((x) => x.score), [80, 80, 50]);
  assert.ok(!pod[0].some((x) => x.p === d || x.p === e || x.p === old));
  assert.deepEqual(pod[2].map((x) => x.p), [f]);
  assert.deepEqual(pod[1], []);
  // prémio: 3, 2 e 1 dias do que a divisão ganha por dia
  assert.deepEqual([1, 2, 3].map((pos) => E.seasonPrize(1000, pos)), [3000, 2000, 1000]);
  E.seasonAward(a, 1, 0, 3, 1000);
  assert.equal(a.cash, 1050);
  assert.deepEqual(a.titles.at(-1), { k: 'ep', n: 1, d: 0, pos: 3 });
});
