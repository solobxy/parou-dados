// v98 (pedido do Dinis: «hunting… melhor ainda que o deles»). Caça em 8 reservas pelo mundo: licença ou furtiva, mira com ritmo,
// distância contra o alcance da arma, robustez dos animais, perigosos que carregam, troféus com medalha e perícia.
// Corre com: node --test dev/caca98.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 12);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const H = CFG.hunt;
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
// sorte controlada: os inteiros vêm da semente; as hipóteses saem por ordem da lista (e depois o valor de «resto»)
const sorte = (seq = [], resto = false, seed = 3) => { const r = seededRng(seed), q = seq.slice(); return { int: (a, b) => r.int(a, b), chance: () => (q.length ? q.shift() : resto) }; };
const mk = (gun = 'sniperanti') => {
  const p = E.newPlayer('h' + Math.random(), START, world);
  p.cash = 1e6; p.respect = 1e9; p.peakRespect = 1e9; p.vigor = 100;
  if (gun) p.eq.principal = { id: gun, u: 50 };
  return p;
};
const pos = (p, sp, d) => { const c = p.hunt.on.cur; c.sp = sp; c.d = d; c.sz = 800; return c; };
// um instante em que a mira está no centro (qualidade perfeita)
const centro = (c) => Math.round(((1000 - c.ph) % 1000) / 1000 * (c.P / 2));

test('8 reservas fora de Portugal, cada uma com 4-5 espécies legais e 1 protegida; todas as espécies existem e têm números certos', () => {
  assert.equal(H.sites.length, 8);
  const ids = new Set();
  for (const S of H.sites) {
    assert.ok(S.sp.length >= 4 && S.sp.length <= 5, S.id); assert.equal(S.prot.length, 1, S.id);
    for (const [id] of S.sp) { const a = E.huntSp(id); assert.ok(a && !a.prot, id); ids.add(id); }
    for (const [id] of S.prot) { const a = E.huntSp(id); assert.ok(a && a.prot, id); ids.add(id); }
    assert.ok(S.fee > 0 && S.ranger > 0 && S.jail > 0 && S.lawyer > 0);
  }
  assert.deepEqual([...ids].sort(), Object.keys(H.sp).sort());   // nenhuma espécie fica de fora
  for (const [id, a] of Object.entries(H.sp)) {
    assert.ok(a.d[0] > 0 && a.d[1] > a.d[0] && a.tough > 0 && a.v > 0 && a.wary > 0 && a.xp > 0 && a.sc[1] > a.sc[0], id);
    if (a.dg) assert.ok(a.hosp > 0, id);
  }
  // as reservas vão subindo de nível e de taxa
  for (let i = 1; i < H.sites.length; i++) { assert.ok(H.sites[i].level > H.sites[i - 1].level); assert.ok(H.sites[i].fee > H.sites[i - 1].fee); }
});

test('sair: nível, arma de fogo, arma de caça com licença, taxa, energia, uso da arma, 3 saídas por dia e reserva', () => {
  erro(() => E.huntStart(mk(), START, world, sorte(), 'atlantida', 'lic'), 'NO_SITE');
  erro(() => E.huntStart(mk(), START, world, sorte(), '__proto__', 'lic'), 'NO_SITE');
  erro(() => E.huntStart(mk(), START, world, sorte(), 'limpopo', 'x'), 'BAD_MODE');
  const novo = mk(); novo.respect = 0; novo.peakRespect = 0;
  erro(() => E.huntStart(novo, START, world, sorte(), 'limpopo', 'lic'), 'LOW_LEVEL');
  erro(() => E.huntStart(mk(null), START, world, sorte(), 'florestanegra', 'lic'), 'NO_GUN');
  const faca = mk(null); faca.eq.branca = { id: 'canivete' };
  erro(() => E.huntStart(faca, START, world, sorte(), 'florestanegra', 'lic'), 'NO_GUN');
  erro(() => E.huntStart(mk('smgbullpup'), START, world, sorte(), 'florestanegra', 'lic'), 'GUN_NOT_LEGAL');
  assert.ok(E.huntStart(mk('smgbullpup'), START, world, sorte(), 'florestanegra', 'fur').ok);   // furtiva: qualquer arma de fogo
  const cansado = mk(); cansado.vigor = H.e - 1;
  erro(() => E.huntStart(cansado, START, world, sorte(), 'limpopo', 'lic'), 'NO_VIGOR');
  const p = mk(), c0 = p.cash, S = E.huntSite('limpopo');
  const o = E.huntStart(p, START, world, sorte(), 'limpopo', 'lic');
  assert.equal(o.fee, S.fee); assert.equal(p.cash, c0 - S.fee); assert.equal(p.vigor, 100 - H.e); assert.equal(p.eq.principal.u, 49);
  assert.equal(p.hunt.on.shots, H.shots); assert.equal(p.hunt.on.moves, H.moves); assert.ok(p.hunt.on.cur);
  erro(() => E.huntStart(p, START, world, sorte(), 'alasca', 'lic'), 'HUNT_OPEN');
  // o site nunca vê o tamanho do animal à vista
  const v = E.huntView(p, START);
  assert.ok(v.cur && !('sz' in v.cur)); assert.ok(!JSON.stringify(v).includes('"sz"'));
  // 3 saídas com licença por reserva e dia; a 4.ª não; outra reserva sim; no dia seguinte volta
  for (let i = 1; i < H.quota; i++) { E.huntStop(p, START + i, world); E.huntStart(p, START + i, world, sorte(), 'limpopo', 'lic'); }
  E.huntStop(p, START + 10, world);
  assert.equal(E.huntQuotaLeft(p, START + 10, 'limpopo'), 0);
  erro(() => E.huntStart(p, START + 11, world, sorte(), 'limpopo', 'lic'), 'HUNT_QUOTA');
  assert.ok(E.huntStart(p, START + 12, world, sorte(), 'alasca', 'lic').ok); E.huntStop(p, START + 13, world);
  p.vigor = 100;
  assert.ok(E.huntStart(p, START + T.DAY, world, sorte(), 'limpopo', 'lic').ok);
});

test('mira: o centro é perfeito, a ponta é má; a hipótese cai com a distância acima do alcance e é zero no dobro', () => {
  const c = { P: 2000, ph: 0 };
  assert.equal(E.huntAim(c, 0), 'perf'); assert.equal(E.huntAim(c, 1000), 'perf');   // passa pelo centro a cada meio período
  assert.equal(E.huntAim(c, 500), 'mau');   // na ponta
  assert.equal(E.huntAim(c, 120), 'bom'); assert.equal(E.huntAim(c, 250), 'fraco');
  const p = mk('sniperanti'), it = p.eq.principal, R = E.wStat(it).rng;
  const at = (d, sp = 'impala') => E.huntHitBp(p, it, { sp, d }, 'bom');
  assert.ok(at(R) > at(R * 1.5)); assert.ok(at(R * 1.5) > 0); assert.equal(at(R * 2), 0);
  assert.ok(E.huntHitBp(p, it, { sp: 'impala', d: 100 }, 'perf') > E.huntHitBp(p, it, { sp: 'impala', d: 100 }, 'mau'));
  // aves só com caçadeira
  const q = mk('cacadeirasemi');
  assert.ok(E.huntHitBp(q, q.eq.principal, { sp: 'lagopode', d: 30 }, 'bom') > 2 * E.huntHitBp(p, it, { sp: 'lagopode', d: 30 }, 'bom'));
  // mais perícia, mais hipótese
  const b0 = at(100); p.hunt.sk = 50000; assert.ok(at(100) > b0);
});

test('disparar: abate se a arma mata, fere se não; o saco, o troféu, a perícia e o fim da saída', () => {
  const p = mk('sniperanti');
  E.huntStart(p, START, world, sorte(), 'limpopo', 'lic');
  erro(() => E.huntShoot(p, START + 100, world, sorte([true]), 999999), 'BAD_TAP');
  erro(() => E.huntShoot(p, START + 100, world, sorte([true]), -1), 'BAD_TAP');
  let c = pos(p, 'kudu', 150);
  const r = E.huntShoot(p, START + 5000, world, sorte([true]), centro(c));
  assert.ok(r.shot.kill); assert.equal(r.shot.q, 'perf');
  const k = p.hunt.on.bag[0], a = E.huntSp('kudu');
  assert.equal(k.sp, 'kudu'); assert.equal(k.md, 2);   // tamanho 0,8: prata
  assert.equal(k.v, Math.floor((a.v * 1300 * 10000) / 1e7));
  assert.ok(p.hunt.sk > 0); assert.equal(p.hunt.on.shots, H.shots - 1); assert.equal(p.hunt.on.cur, null);
  erro(() => E.huntShoot(p, START + 6000, world, sorte([true]), 0), 'NO_ANIMAL');
  E.huntLook(p, START + 7000, world, sorte());
  assert.equal(p.hunt.on.moves, H.moves - 1);
  // uma arma fraca só fere um búfalo
  const w = mk('revolvercaca'); E.huntStart(w, START, world, sorte(), 'florestanegra', 'lic');
  c = pos(w, 'javali', 20); w.hunt.on.cur.sp = 'bufalo';
  const f = E.huntShoot(w, START + 3000, world, sorte([true, false]), centro(c));
  assert.ok(f.shot.hit && f.shot.wounded && !f.shot.kill); assert.equal(w.hunt.on.bag.length, 0);
  // o último tiro fecha a saída e o guia compra a caça
  const cash0 = p.cash, resp0 = p.respect;
  c = p.hunt.on.cur; c.sp = 'impala'; c.d = 120; c.sz = 950;
  E.huntShoot(p, START + 9000, world, sorte([true]), centro(c));
  c = p.hunt.on.cur || (E.huntLook(p, START + 9500, world, sorte()), p.hunt.on.cur); c.sp = 'impala'; c.d = 120; c.sz = 300;
  const fim = E.huntShoot(p, START + 12000, world, sorte([true]), centro(c));
  assert.ok(fim.end); assert.equal(p.hunt.on, null);
  assert.equal(fim.bag.length, 3); assert.equal(p.cash - cash0, fim.cash); assert.equal(fim.cash, fim.bag.reduce((s, x) => s + x.v, 0));
  assert.ok(p.respect > resp0); assert.deepEqual(fim.firsts.sort(), ['impala', 'kudu']);
  assert.equal(p.hunt.tr.impala.n, 2); assert.equal(p.hunt.tr.impala.md, 3); assert.equal(p.hunt.tr.kudu.n, 1);
  assert.equal(p.hunt.tr.impala.sc, Math.max(...fim.bag.filter((x) => x.sp === 'impala').map((x) => x.sc)));
});

test('aproximar: fica a 60% da distância ou o animal foge; trocar de arma a meio não vale', () => {
  const p = mk(); E.huntStart(p, START, world, sorte(), 'limpopo', 'lic');
  pos(p, 'kudu', 300);
  const r = E.huntNear(p, START + 1000, world, sorte([false]));
  assert.ok(!r.fled); assert.equal(p.hunt.on.cur.d, 180); assert.equal(p.hunt.on.moves, H.moves - 1);
  const f = E.huntNear(p, START + 2000, world, sorte([true]));
  assert.ok(f.fled); assert.equal(p.hunt.on.cur, null);
  erro(() => E.huntNear(p, START + 2500, world, sorte()), 'NO_ANIMAL');
  E.huntLook(p, START + 3000, world, sorte());
  p.eq.principal = { id: 'pesadabelt', u: 50 };
  if (!CFG.gear.some((g) => g.id === 'pesadabelt')) p.eq.principal = { id: CFG.gear.find((g) => g.t === 'pesada').id, u: 50 };
  erro(() => E.huntShoot(p, START + 4000, world, sorte([true]), 0), 'NO_GUN');
});

test('com licença nunca aparecem protegidas; na furtiva aparecem', () => {
  const p = mk(); E.huntStart(p, START, world, sorte(), 'limpopo', 'lic');
  const r = seededRng(11), rr = { int: (a, b) => r.int(a, b), chance: () => false };
  const vistas = new Set();
  for (let i = 0; i < 400; i++) { p.hunt.on.moves = 6; E.huntLook(p, START + i, world, rr); vistas.add(p.hunt.on.cur.sp); }
  assert.ok(!vistas.has('rinoceronte'));
  const q = mk(); q.hunt.sk = 100000; E.huntStart(q, START, world, sorte(), 'limpopo', 'fur');
  const v2 = new Set();
  for (let i = 0; i < 400; i++) { q.hunt.on.moves = 6; E.huntLook(q, START + i, world, rr); v2.add(q.hunt.on.cur.sp); }
  assert.ok(v2.has('rinoceronte')); assert.ok(v2.has('bufalo'));   // perícia 100: aparece tudo
  // sem perícia, o búfalo (pede 50) não aparece
  const z = new Set(); const s = mk(); E.huntStart(s, START, world, sorte(), 'limpopo', 'lic');
  for (let i = 0; i < 300; i++) { s.hunt.on.moves = 6; E.huntLook(s, START + i, world, rr); z.add(s.hunt.on.cur.sp); }
  assert.ok(!z.has('bufalo'));
});

test('furtiva: os guardas prendem, o saco perde-se, a fiança é a da reserva, e a reserva fica vigiada', () => {
  const p = mk('sniperanti'); E.huntStart(p, START, world, sorte(), 'limpopo', 'fur');
  let c = pos(p, 'impala', 100);
  E.huntShoot(p, START + 2000, world, sorte([true, false]), centro(c));   // abate, os guardas não vêm
  assert.equal(p.hunt.on.bag.length, 1);
  E.huntLook(p, START + 3000, world, sorte()); c = pos(p, 'impala', 100);
  const cash0 = p.cash, r = E.huntShoot(p, START + 4000, world, sorte([true, true]), centro(c));
  assert.ok(r.caught && r.end); assert.equal(r.lost.length, 2); assert.equal(p.cash, cash0); assert.equal(p.hunt.on, null);
  assert.ok(p.jailUntil > START); assert.equal(p.jailTier, E.HUNT_JAIL + 7);
  const S = E.huntSite('limpopo');
  assert.equal(E.bailCost(p, START + 4000), S.lawyer);
  p.jailUntil = 0; p.jailTier = 0; p.vigor = 100;
  erro(() => E.huntStart(p, START + T.HOUR, world, sorte(), 'limpopo', 'fur'), 'HUNT_WATCHED');
  assert.ok(E.huntStart(p, START + T.HOUR, world, sorte(), 'limpopo', 'lic').ok);   // com licença pode-se
  // o silenciador corta para metade a hipótese dos guardas
  const s = mk('sniperanti'); s.eq.principal.m = ['mod_silenciador']; E.huntStart(s, START, world, sorte(), 'alasca', 'fur');
  assert.equal(E.huntView(s, START).ranger, Math.floor(E.huntSite('alasca').ranger / 2));
});

test('animal perigoso falhado de perto carrega: hospital; o que já se tinha é vendido', () => {
  const p = mk('sniperanti'); E.huntStart(p, START, world, sorte(), 'limpopo', 'lic');
  let c = pos(p, 'impala', 100);
  E.huntShoot(p, START + 1000, world, sorte([true]), centro(c));
  E.huntLook(p, START + 2000, world, sorte()); c = pos(p, 'bufalo', 40);
  const cash0 = p.cash, r = E.huntShoot(p, START + 3000, world, sorte([false, true]), centro(c));
  assert.ok(r.charged && r.end); assert.ok(p.hospUntil > START); assert.equal(p.cash - cash0, r.cash); assert.equal(r.bag.length, 1);
  // longe não carrega
  const q = mk(); E.huntStart(q, START, world, sorte(), 'limpopo', 'lic'); c = pos(q, 'bufalo', 140);
  const r2 = E.huntShoot(q, START + 3000, world, sorte([false], true), centro(c));
  assert.ok(!r2.charged); assert.equal(q.hospUntil || 0, 0);
});

test('saída esquecida: passado o tempo, fecha sozinha e o guia paga', () => {
  const p = mk(); E.huntStart(p, START, world, sorte(), 'limpopo', 'lic');
  const c = pos(p, 'impala', 100);
  E.huntShoot(p, START + 1000, world, sorte([true]), centro(c));
  const v = p.hunt.on.bag[0].v, cash0 = p.cash;
  E.huntView(p, START + H.ttl + 1);
  E.payBail; // (nada)
  assert.ok(E.huntStart(p, START + H.ttl + 5, world, sorte(), 'alasca', 'lic').ok);   // a anterior fechou ao entrar
  assert.equal(p.cash, cash0 + v - E.huntSite('alasca').fee);
});

test('cada espécie e cada reserva têm fotografia e nome nas duas línguas; os erros novos têm texto', async () => {
  globalThis.document ??= { documentElement: {} };
  globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
  const fs = await import('node:fs'), { t, setLang, errText } = await import('../../sites/crime/js/i18n.js');
  const ids = Object.keys(H.sp), sites = H.sites.map((s) => s.id);
  for (const id of [...ids, ...sites.map((s) => 'r_' + s)]) assert.ok(fs.existsSync(new URL('../../sites/crime/img/caca/' + id + '.webp', import.meta.url)), id);
  for (const L of ['en', 'pt']) {
    setLang(L);
    for (const id of ids) assert.notEqual(t('hs_' + id), 'hs_' + id, L + ' ' + id);
    for (const s of sites) { assert.notEqual(t('hsite_' + s), 'hsite_' + s); assert.notEqual(t('hctry_' + s), 'hctry_' + s); }
    for (const e of ['NO_GUN', 'BAD_TAP', 'NO_MOVES', 'NO_ANIMAL', 'TOO_CLOSE', 'HUNT_OPEN', 'HUNT_QUOTA', 'HUNT_WATCHED', 'GUN_NOT_LEGAL', 'BAD_MODE', 'NO_HUNT'])
      assert.notEqual(errText(e), errText('__nada__'), L + ' ' + e);
  }
});
