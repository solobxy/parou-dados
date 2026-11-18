// v91 (pedido do Dinis: «uma lore do jogo, uma história que explique bem o jogo, tipo wiki»). O Arquivo tem a história em
// capítulos e a wiki montada a partir da configuração. Aqui confere-se que cada capítulo e cada página existem nas duas
// línguas, com os mesmos marcadores, e que os números que a wiki lê chegam ao site.
// Corre com: node --test dev/arquivo91.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG } from '../engine/config.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const I18N = readFileSync(join(AQUI, '../../sites/crime/js/i18n.js'), 'utf8'), APP = readFileSync(join(AQUI, '../../sites/crime/js/app.js'), 'utf8'), SRV = readFileSync(join(AQUI, '../server.mjs'), 'utf8');
const ip = I18N.indexOf('  pt: {'), EN = I18N.slice(0, ip), PT = I18N.slice(ip);
const val = (bloco, k) => { const m = bloco.match(new RegExp('[ ,{]' + k + ": '((?:[^'\\\\]|\\\\.)*)'")); return m ? m[1] : null; };
const marcas = (x) => [...new Set([...x.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join();
const lista = (nome) => JSON.parse(APP.match(new RegExp('const ' + nome + ' = (\\[[^\\]]*\\])'))[1].replace(/'/g, '"'));

test('cada capítulo da história existe nas duas línguas, com título e pelo menos dois parágrafos', () => {
  const L = lista('LORE');
  assert.ok(L.length >= 10);
  for (const k of L) for (const [n, b] of [['en', EN], ['pt', PT]]) {
    assert.ok(val(b, 'loT_' + k), `${n}: título de ${k}`);
    const tx = val(b, 'lo_' + k); assert.ok(tx, `${n}: texto de ${k}`);
    assert.ok(tx.split('\\n\\n').length >= 2, `${n}: ${k} em parágrafos`);
    assert.ok(!/[Ll]orem ipsum|\bTODO\b/.test(tx), `${n}: ${k} sem texto por escrever`);
  }
  for (const k of L) assert.equal(marcas(val(EN, 'lo_' + k)), marcas(val(PT, 'lo_' + k)), 'os números da história de ' + k + ' (vêm da configuração)');
});

test('cada página da wiki existe nas duas línguas, com os mesmos números por preencher', () => {
  for (const k of lista('WIKI')) {
    for (const b of [EN, PT]) assert.ok(val(b, 'wkT_' + k), 'título ' + k);
    const key = k === 'drogas' ? 'wk_drugs' : 'wk_' + k;
    assert.equal(marcas(val(EN, key)), marcas(val(PT, key)), 'marcadores de ' + k);
  }
});

test('os números que a wiki lê existem na configuração e chegam ao site', () => {
  for (const x of [CFG.energy.regenMs, CFG.addiction.decayMs, CFG.port.capBase, CFG.port.capPerLevel, CFG.port.slotsEvery, CFG.air.bribeBp, CFG.launder.freeUpTo, CFG.launder.bp, CFG.launder.courseBp,
    CFG.bank.feeBp, CFG.accountant.price, CFG.accountant.feeBp, CFG.feira.pairMax, CFG.feira.acctMax, CFG.feira.orderMs, CFG.pvp.newbieLevel, CFG.pvp.newbiePowerX, CFG.hitman.hospMs, CFG.season.days, CFG.raid.chanceBp, CFG.round.newbieShieldMs])
    assert.ok(Number.isFinite(x) && x > 0);
  for (const k of ['raid: CFG.raid', 'newbieShieldMs: CFG.round.newbieShieldMs', 'launder: CFG.launder', 'classes: CFG.classes', 'hitman: CFG.hitman', 'season: CFG.season'])
    assert.ok(SRV.includes(k), 'a configuração pública manda ' + k);
});
