// v106 (pedido do Dinis: «há armas e proteções que não aparecem no personagem como deviam»): cada peça que se veste tem a sua camada
// no boneco. As armas têm uma camada própria, feita da fotografia da arma (img/boneco/w/<id>.webp); as outras peças, a camada com o
// nome delas. Também confirma que as camadas por tipo, de reserva, existem para todos os tipos.
// Corre com: node --test dev/boneco106.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG } from '../engine/config.js';
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sites', 'crime', 'img', 'boneco');
const veste = CFG.gear.filter((g) => g.slot !== 'mat' && g.slot !== 'mod');

test('cada arma tem a camada feita da sua fotografia', () => {
  const falta = veste.filter((g) => g.t && !existsSync(join(DIR, 'w', g.id + '.webp'))).map((g) => g.id);
  assert.deepEqual(falta, []);
});
test('cada tipo de arma tem a camada de reserva', () => {
  const tipos = [...new Set(veste.filter((g) => g.t).map((g) => g.t))];
  assert.deepEqual(tipos.filter((t) => !existsSync(join(DIR, 'L_' + t + '.webp'))), []);
});
test('cada proteção, roupa e acessório tem a sua camada', () => {
  const falta = veste.filter((g) => !g.t && !existsSync(join(DIR, g.id + '.webp'))).map((g) => g.id);
  assert.deepEqual(falta, []);
});
// v106 (2.ª ronda): as pistolas e revólveres vêm de 7 desenhos de catálogo (dev/boneco-fontes), um por cada aspeto das fotografias
test('cada pistola e revólver tem desenho de catálogo e a pistola fica por baixo das luvas', async () => {
  const { readFileSync } = await import('node:fs');
  const py = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'boneco106-armas.py'), 'utf8');
  const bloco = py.slice(py.indexOf('CURTA = {'), py.indexOf('def recorta_branco'));
  const curtas = veste.filter((g) => g.t === 'pistola' || g.t === 'revolver').map((g) => g.id);
  assert.deepEqual(curtas.filter((id) => !new RegExp(`'${id}'`).test(bloco)), []);
  for (const f of new Set(bloco.match(/'hg_[a-z]'/g).map((x) => x.slice(1, -1)))) assert.ok(existsSync(join(dirname(fileURLToPath(import.meta.url)), 'boneco-fontes', f + '.webp')), f);
  const app = readFileSync(join(DIR, '..', '..', 'js', 'app.js'), 'utf8'), ord = app.match(/const DOLL_ORDER = (\[[^\]]*\])/)[1];
  assert.ok(ord.indexOf("'mao'") < ord.indexOf("'maos'"), 'a pistola por baixo das luvas');
});
