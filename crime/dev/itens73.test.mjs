// v73 (17/11): 16 peças novas de equipamento (cabeça, pernas, pés, mãos e acessórios), cada uma com fotografia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const AQUI = dirname(fileURLToPath(import.meta.url)), GEAR = join(AQUI, '../../sites/crime/img/gear');
const START = lisbonToUtc(2026, 11, 20, 10);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const mk = (nivel = 1) => { const p = E.newPlayer('i' + Math.random(), START, world); p.cash = 1e6; p.respect = p.peakRespect = CFG.levels[nivel - 1]; return p; };
const NOVAS = ['bone', 'gorro', 'chapeu', 'capatatico', 'capabalistico', 'ganga', 'calcastaticas', 'perneiras', 'tenis', 'biqueira', 'botastaticas', 'luvascabedal', 'luvastaticas', 'pochete', 'mochilatatica', 'scannerdigital'];
const code = (c) => (e) => e.code === c;

test('as 16 peças novas existem, cada uma com fotografia', () => {
  for (const id of NOVAS) { assert.ok(CFG.gear.some((g) => g.id === id), id); }
  for (const g of CFG.gear) assert.ok(existsSync(join(GEAR, g.id + '.webp')), 'falta a fotografia de ' + g.id);
});

test('em cada parte do corpo, mais caro protege mais (e os ids não se repetem)', () => {
  assert.equal(new Set(CFG.gear.map((g) => g.id)).size, CFG.gear.length);
  for (const sl of ['cabeca', 'pernas', 'pes', 'maos', 'tronco']) {
    const L = CFG.gear.filter((g) => g.slot === sl);
    for (let i = 1; i < L.length; i++) { assert.ok(L[i].price > L[i - 1].price, sl + ': preço sobe'); assert.ok(L[i].def > L[i - 1].def, sl + ': defesa sobe'); }
  }
});

test('as peças táticas pedem nível; com o nível compram-se e vestem-se', () => {
  assert.throws(() => E.buyItem(mk(5), START, world, 'capatatico'), code('LOW_LEVEL'));
  const p = mk(15); const r = E.buyItem(p, START, world, 'capatatico');
  assert.equal(r.slot, 'cabeca'); assert.equal(p.eq.cabeca.id, 'capatatico');
  assert.equal(E.defBp(p), 3000);
});

test('a mochila tática dá 8 espaços e o scanner digital baixa a hipótese de ser apanhado', () => {
  const p = mk(20), base = E.invCap(p);
  E.buyItem(p, START, world, 'mochilatatica'); assert.equal(E.invCap(p), base + 8);
  E.buyItem(p, START, world, 'scannerdigital'); assert.equal(p.eq.acess.id, 'scannerdigital');
  assert.ok(CFG.gear.find((g) => g.id === 'scannerdigital').bustBp < CFG.gear.find((g) => g.id === 'scanner').bustBp);
});
