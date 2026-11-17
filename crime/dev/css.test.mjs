// Barreira (17/11): um @property com o nome de uma variável do tema estraga a cor de tudo (aconteceu com --tx, a cor do texto).
// Este teste garante que nenhum @property usa o nome de uma variável que o CSS declara noutro sítio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../sites/crime/css/app.css'), 'utf8');

test('nenhum @property tem o nome de uma variável do tema', () => {
  const props = [...css.matchAll(/@property\s+(--[a-z0-9-]+)/gi)].map((m) => m[1]);
  for (const name of props) {
    const decl = [...css.matchAll(new RegExp('(?<![\\w-])' + name.replace(/-/g, '\\-') + '\\s*:', 'g'))].length;
    const usedInKeyframes = [...css.matchAll(new RegExp('@keyframes[^{]*\\{[^@]*' + name.replace(/-/g, '\\-') + '\\s*:', 'g'))].length;
    assert.ok(decl <= usedInKeyframes + 1, `${name} é declarado ${decl} vezes fora do @property: escolhe outro nome`);
  }
  assert.ok(!props.includes('--tx') && !props.includes('--ink') && !props.includes('--cash'), 'nome reservado do tema');
});
