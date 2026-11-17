// v71 (17/11): os objetos dos minijogos e do porto são fotografias em sites/crime/img/obj. Este teste garante que cada
// fotografia que o código pede existe (um móvel novo no motor sem fotografia aparecia como imagem partida).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url)), SITE = join(AQUI, '../../sites/crime'), OBJ = join(SITE, 'img/obj');
const tem = (n) => existsSync(join(OBJ, n + '.webp'));

test('mudanças: há fotografia para cada móvel que o motor pode sortear', () => {
  const eng = readFileSync(join(AQUI, '../engine/engine.js'), 'utf8');
  const nomes = [...eng.matchAll(/(?:NAMES|HEAVY|FRAGILE) = \{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]));
  assert.ok(nomes.length >= 16, 'li os nomes dos móveis: ' + nomes.length);
  for (const n of nomes) assert.ok(tem('m-' + n), 'falta img/obj/m-' + n + '.webp');
});

test('os nomes fixos de fotografias no código existem todos', () => {
  for (const f of ['js/tarefas.js', 'js/reveal.js']) {
    const src = readFileSync(join(SITE, f), 'utf8');
    const fixos = [...src.matchAll(/(?:pic|foto)\('([a-z0-9-]+)'(?!\s*\+)/g)].map((m) => m[1]);
    const listas = [...src.matchAll(/PARTS = \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]));
    assert.ok(fixos.length > 5, f + ': li ' + fixos.length + ' nomes');
    for (const n of [...fixos, ...listas]) assert.ok(tem(n), f + ': falta img/obj/' + n + '.webp');
  }
  for (let k = 0; k < 3; k++) assert.ok(tem('pilula' + k), 'falta pilula' + k);
});
