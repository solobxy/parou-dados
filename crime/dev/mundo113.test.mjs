// v113 (pedido do Dinis: «Tu continuas a fazer tudo em Portugal e isso é horrível» → mundo internacional, em PT e EN).
// Barreira: nenhum texto do jogo volta a pôr o mundo em Portugal (Lisboa, Alentejo, Algarve, bairros e ruas de Lisboa, sítios
// portugueses), os bairros, as pistas e as regiões têm nome nas duas línguas, o dinheiro é em libras e a casa é Londres.
// Corre com: node --test dev/mundo113.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG } from '../engine/config.js';

const AQUI = dirname(fileURLToPath(import.meta.url)), SITE = join(AQUI, '..', '..', 'sites', 'crime');
globalThis.document = { documentElement: {} };
const I = await import(join(SITE, 'js', 'i18n.js'));
const txt = (lang, k) => { I.setLang(lang); return I.t(k); };

// os valores de cada língua, lidos do ficheiro (as chaves de uma língua ficam entre «en: {» e «pt: {»)
const SRC = readFileSync(join(SITE, 'js', 'i18n.js'), 'utf8');
const enIni = SRC.indexOf('\n  en: {'), ptIni = SRC.indexOf('\n  pt: {'), fim = SRC.indexOf('\nexport function setLang');
const BLOCO = { en: SRC.slice(enIni, ptIni), pt: SRC.slice(ptIni, fim) };
const valores = (b) => [...b.matchAll(/\b(\w+): ('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\[[^\]]*\])/g)].map((m) => [m[1], m[2]]);

// nomes que puseram o jogo em Portugal (o «Porto» das docas e o «Rua Viva» do parlamento não contam)
const PT_LUGARES = /Lisboa|Lisbon|Portugal|Alentejo|Algarve|\bSines\b|\bTejo\b|Tagus|Briteiros|Conímbriga|Mértola|\bTroia\b|Belém|Alfama|Mouraria|Intendente|Arroios|Marvila|Chiado|Rossio|Bairro Alto|Cais do Sodré|Alcântara|Campo de Ourique|Parque das Nações|Santa Clara|Feira da Ladra|Cascais|Estoril|Monsanto|Ponte 25|Saldanha|Alvalade|Graça|Coimbra|Douro|Guimarães|Condeixa|Grândola|Guadiana|Pestana|Valadares|Honório|elétrico|\btram\b|Av\. do Porto|Porto, Portugal|euros?\b|€/;

test('nenhum texto põe o jogo em Portugal, nas duas línguas', () => {
  for (const lang of ['en', 'pt']) {
    const maus = valores(BLOCO[lang]).filter(([, v]) => PT_LUGARES.test(v)).map(([k, v]) => k + ' = ' + v.slice(0, 80));
    assert.deepEqual(maus, [], lang + ': ' + maus.join(' | '));
  }
});

test('bairros pelo mundo: nome, cidade e «em» nas duas línguas, por continente', () => {
  for (const lang of ['en', 'pt']) {
    for (const z of CFG.turf.zones) for (const p of ['tz_', 'tzEm_', 'tzC_']) {
      const v = txt(lang, p + z.id);
      assert.ok(v && v !== p + z.id, `${lang} ${p}${z.id}`);
    }
    for (const c of ['am', 'eu', 'af', 'as']) assert.ok(txt(lang, 'bxCont_' + c) !== 'bxCont_' + c);
    assert.equal(txt(lang, 'bxRiver'), 'bxRiver', 'o rio de Lisboa saiu do mapa');
  }
  // o mapa do cliente tem os 12 bairros, cada um uma vez
  const app = readFileSync(join(SITE, 'js', 'app.js'), 'utf8');
  const ids = [...app.match(/const BX_CONT = (\[.*\]);/)[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).filter((x) => !['am', 'eu', 'af', 'as'].includes(x));
  assert.deepEqual([...ids].sort(), CFG.turf.zones.map((z) => z.id).sort());
});

test('pistas, regiões e sítios de casa com nomes do mundo', () => {
  I.setLang('en');
  assert.deepEqual(CFG.race.tracks.map((x) => I.t('rt_' + x.id)), ['Pacific Coast Highway', 'Wangan Expressway', 'Stelvio Pass', 'Monte Carlo streets', 'Nordschleife']);
  assert.deepEqual(['lx', 'al', 'ag'].map((r) => I.t('rg_' + r)), ['London', 'Rotterdam', 'Antwerp']);
  assert.equal(I.t('dgHome'), 'United Kingdom');
  assert.equal(I.t('trCity_gb'), 'Paris');
  I.setLang('pt');
  assert.deepEqual(['lx', 'al', 'ag'].map((r) => I.t('rgEm_' + r)), ['em Londres', 'em Roterdão', 'em Antuérpia']);
  assert.equal(I.t('p_feira'), 'Feira');
});

test('a casa é Londres e o destino «gb» é Paris (no globo e nas contas)', () => {
  assert.equal(CFG.air.home.lat, 51.5);
  const gb = CFG.travel.dests.find((d) => d.id === 'gb');
  assert.equal(gb.lat, 48.86);
  assert.equal(CFG.round.tz, 'Europe/London');
});

test('dinheiro em libras nas duas línguas', () => {
  const ui = readFileSync(join(SITE, 'js', 'ui.js'), 'utf8');
  assert.match(ui, /export const CUR = '£';/);
  assert.doesNotMatch(ui.replace(/\/\/.*$/gm, ''), /€/);
  const app = readFileSync(join(SITE, 'js', 'app.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(app, /€|Europe\/Lisbon/);
});

test('os pilotos da rua não são portugueses', () => {
  const srv = readFileSync(join(AQUI, '..', 'server.mjs'), 'utf8');
  const bots = srv.match(/const BOTS_CORRIDA = (\[[^\]]*\])/)[1];
  assert.doesNotMatch(bots, /Zé|Tó |Embraiagem|Travão|Pistão|Jantes|Rotunda/);
  assert.equal(JSON.parse(bots.replace(/'/g, '"')).length, 12);
});
