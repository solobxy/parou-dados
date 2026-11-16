// O site tem de abrir: cada ficheiro de JavaScript do jogo (e o service worker) tem de ser JavaScript válido.
// Barreira posta a 16/11/2026, depois de um comentário colado a meio de uma linha ter deixado o jogo sem abrir.
// Corre com: node --test dev/site.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sites', 'crime');
const ficheiros = [...readdirSync(join(SITE, 'js')).filter((f) => f.endsWith('.js')).map((f) => join(SITE, 'js', f)), join(SITE, 'sw.js')];

test('todos os ficheiros de JavaScript do site são válidos (como módulos)', () => {
  assert.ok(ficheiros.length >= 5);
  for (const f of ficheiros) {
    const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(f) });
    assert.equal(r.status, 0, f + '\n' + String(r.stderr).split('\n').slice(0, 4).join('\n'));
  }
});
