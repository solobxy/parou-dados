// v100 (pedido do Dinis: honor bars «centenas, todas diferentes»). Honras por degraus e por coisa (golpes, stats, negócios, casas,
// luxos, rotas, espécies, reservas, conjuntos do museu, cursos, tipos de arma), barras desenhadas pelo nome, uma à escolha.
// Corre com: node --test dev/honras100.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 12), world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);
const mk = () => E.newPlayer('h' + Math.random(), START, world);

test('mais de 300 honras, ids únicos, 13 categorias, e cada barra é diferente de todas as outras', async () => {
  assert.ok(E.HONORS.length >= 300, String(E.HONORS.length));
  assert.equal(new Set(E.HONORS.map((h) => h.id)).size, E.HONORS.length);
  assert.equal(new Set(E.HONORS.map((h) => h.cat)).size, 13);
  globalThis.document ??= { documentElement: {} };
  const Hn = await import('../../sites/crime/js/honras.js');
  const sig = E.HONORS.map(Hn.honorSig);
  assert.equal(new Set(sig).size, sig.length, 'há duas barras iguais');
  // todos os números que as honras medem existem (nenhum dá sempre 0 por engano de nome)
  const p = mk();
  for (const h of E.HONORS) assert.ok(Number.isFinite(E.honorVal(p, h.m, h.k)), h.id);
});

test('as honras dão-se pelo estado e ficam para sempre; a escolhida tem de ser tua', () => {
  const p = mk();
  assert.deepEqual(E.honorsCheck(p, START), []);
  p.c.crimes = 120; p.cash = 60000;
  const n = E.honorsCheck(p, START + 1);
  for (const id of ['crimes_10', 'crimes_50', 'crimes_100', 'nw_10000', 'nw_50000']) assert.ok(n.includes(id), id);
  assert.ok(!n.includes('crimes_250'));
  p.cash = 0;   // gastar o dinheiro não tira a honra (e o maior património fica guardado)
  assert.deepEqual(E.honorsCheck(p, START + 2), []);
  assert.ok(p.hon.nw_50000); assert.equal(p.c.nw, 60000);
  erro(() => E.honorPick(p, START, world, 'crimes_250'), 'NO_HONOR');
  erro(() => E.honorPick(p, START, world, '__proto__'), 'NO_HONOR');
  E.honorPick(p, START, world, 'crimes_100'); assert.equal(p.honSel, 'crimes_100');
  E.honorPick(p, START, world, null); assert.equal(p.honSel, null);
});

test('os contadores novos: golpes perfeitos, prisões, hospital, voos por rota, escavações, fugas, armas por tipo e acessórios', () => {
  const p = mk(), now = START;
  E.honorTrack(p, now, { j: false, h: false }, 'crime', { ok: true, crit: true });
  E.honorTrack(p, now, { j: false, h: false }, 'crimeAll', { ok: true, crits: 3 });
  assert.equal(p.c.crits, 4);
  E.honorTrack(p, now, { j: false, h: false }, 'airCollect', { ok: true, r: 0, seized: false });
  E.honorTrack(p, now, { j: false, h: false }, 'airCollect', { ok: true, r: 0, seized: true });
  assert.equal(p.cx.air[CFG.air.routes[0].id], 1);
  p.jailUntil = now + T.HOUR; E.honorTrack(p, now, { j: false, h: false }, 'crime', { ok: true });
  E.honorTrack(p, now, { j: true, h: false }, 'jailWork', { ok: true });   // já estava preso: não conta outra vez
  assert.equal(p.c.jail, 1);
  p.hospUntil = now + T.HOUR; E.honorTrack(p, now, { j: true, h: false }, 'attack', { ok: true });
  assert.equal(p.c.hosp, 1);
  p.eq.principal = { id: 'sniperanti', u: 5 }; E.honorTrack(p, now, { j: true, h: true }, 'equip', { ok: true });
  assert.ok(p.cx.wt.includes('sniper'));
  E.honorTrack(p, now, { j: true, h: true }, 'modFit', { ok: true }); assert.equal(p.c.mods, 1);
  E.honorTrack(p, now, { j: true, h: true }, 'digStart', { ok: true }); assert.equal(p.c.digs, 1);
  E.honorTrack(p, now, { j: true, h: true }, 'jailEscape', { ok: true, free: true }); assert.equal(p.c.esc, 1);
  const n = E.honorsCheck(p, now);
  for (const id of ['crits_1', 'jail_1', 'hosp_1', 'wt_sniper', 'mods_1', 'digs_1', 'esc_1', 'air_' + CFG.air.routes[0].id + '_1']) assert.ok(n.includes(id), id);
});

test('por coisa: uma espécie, uma reserva completa, um conjunto do museu, um curso, um negócio', () => {
  const p = mk();
  p.hunt.tr.corco = { n: 1, sc: 100, md: 3 };
  const S = E.huntSite('florestanegra');
  let n = E.honorsCheck(p, START);
  assert.ok(n.includes('sp_corco') && n.includes('gold_1') && !n.includes('res_florestanegra'));
  for (const [id] of [...S.sp, ...S.prot]) p.hunt.tr[id] = { n: 1, sc: 1, md: 0 };
  n = E.honorsCheck(p, START + 1); assert.ok(n.includes('res_florestanegra'));
  p.mus.mundo = 1; p.done.push('vigilante'); p.biz[CFG.biz.findIndex((b) => b.id === 'banca')].n = 1;
  n = E.honorsCheck(p, START + 2);
  for (const id of ['mus_mundo', 'musn_1', 'course_vigilante', 'biz_banca', 'bizn_1']) assert.ok(n.includes(id), id);
  assert.deepEqual(E.checkInvariants(p).filter((x) => /hon/.test(x)), []);
});
