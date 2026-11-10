// Memória: /api/lines?near=lat,lon guardava a resposta de cada zona de ~100 m num Map sem limite. Cada pessoa a andar
// pela cidade deixava dezenas de zonas para sempre (~1 GB por dia): a app ficou sem memória 5 vezes de 2 a 8/11/2026
// («Reached heap limit», 1650 MB ocupados antes de cair). E o raio não tinha máximo (r=1000000 percorria o país).
// Testa: 2000 zonas diferentes não fazem a cache passar do limite; o raio fica entre 100 e 2000 m; a cache limpa-se
// quando chega uma base nova.
// Uso: APP=<pasta da app> tsx auditoria/cache-linhas-perto.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const APP = process.env.APP || '../parou';
process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'linhas-perto-'));
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };

const B = await import(path.join(APP, 'src/server/db/gtfsDatabase.ts'));
B.getDatabase().exec('CREATE TABLE IF NOT EXISTS stop_routes (stop_id TEXT, route_id TEXT, direction_id INTEGER, stop_sequence INTEGER)');
const L = await import(path.join(APP, 'src/server/linesEngine.ts'));
const { LinesEngine } = L;

ok('[limite] a app diz quantas zonas tem guardadas', typeof L.tamanhoCacheLinhasPerto === 'function');
if (typeof L.tamanhoCacheLinhasPerto === 'function') {
  // 2000 zonas diferentes (uma pessoa de autocarro do Porto a Gaia, mais robôs)
  for (let i = 0; i < 2000; i++) await LinesEngine.getLinesNear(41.10 + i * 0.001, -8.61, 500);
  const n = L.tamanhoCacheLinhasPerto();
  ok('[limite] 2000 zonas pedidas: a cache fica com no máximo 300', n <= 300, `${n} zonas guardadas`);

  // O raio é limitado: 1 000 000 m e 2000 m são o mesmo pedido (a mesma entrada)
  B.clearAllCaches();
  ok('[base nova] a cache das zonas esvazia quando chega uma base nova', L.tamanhoCacheLinhasPerto() === 0, String(L.tamanhoCacheLinhasPerto()));
  await LinesEngine.getLinesNear(38.71, -9.14, 2000);
  await LinesEngine.getLinesNear(38.71, -9.14, 1000000);
  await LinesEngine.getLinesNear(38.71, -9.14, 'abc');
  await LinesEngine.getLinesNear(38.71, -9.14, 500);
  ok('[raio] r=1000000 conta como 2000 e r inválido como 500', L.tamanhoCacheLinhasPerto() === 2, String(L.tamanhoCacheLinhasPerto()));
  ok('[raio] limites 100 e 2000 m', L.raioLinhasPerto(5) === 100 && L.raioLinhasPerto(99999) === 2000 && L.raioLinhasPerto(undefined) === 500 && L.raioLinhasPerto(750) === 750);
}

// As próximas partidas por paragem também se limpam com uma base nova
const D = await import(path.join(APP, 'src/server/departureEngine.ts'));
ok('[base nova] as próximas partidas guardadas também se limpam', fs.readFileSync(path.join(APP, 'src/server/departureEngine.ts'), 'utf8').includes('registerCacheClearCallback(clearNextDeparturesCache)') && typeof D.clearNextDeparturesCache === 'function');
console.log(falhas ? `${falhas} FALHOU` : 'tudo OK');
process.exit(falhas ? 1 : 0);
