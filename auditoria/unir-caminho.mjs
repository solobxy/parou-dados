// Testa que as linhas da UNIR (que não têm viagens na base, só a ordem das paragens) se desenham PELA ESTRADA quando a base traz o desenho
// da linha (tabela route_shapes, feita pelo mapa de estradas), e que sem desenho tudo continua como antes (paragens unidas em linha reta).
// Monta uma base pequena com uma estrada em «L» (a linha reta entre a primeira e a última paragem atravessaria o campo) e chama as funções da app.
// Uso: APP=caminho-da-app node --import tsx auditoria/unir-caminho.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-unir-'));
process.env.PAROU_DATA_DIR = dir; // antes de importar a app
const APP = process.env.APP || '../app';
const B = await import(`${APP}/src/server/db/gtfsDatabase.ts`);
const C = await import(`${APP}/src/utils/caminho.ts`);
const CM = await import(`${APP}/src/server/caminhos.ts`);
const PL = await import(`${APP}/src/server/percursoLinha.ts`);

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const M_LAT = 110540, M_LON = 111320 * Math.cos(41.15 * Math.PI / 180);
const ll = (xM, yM) => ({ lat: 41.15 + yM / M_LAT, lon: -8.6 + xM / M_LON });
const hav = (a, b) => Math.hypot((a.lat - b.lat) * M_LAT, (a.lon - b.lon) * M_LON);

// A estrada: 2 km para este e depois 2 km para norte (em «L»). Paragens: no início, junto à esquina (a 15 m da estrada) e no fim.
const ESTRADA = [ll(0, 0), ll(1000, 0), ll(2000, 0), ll(2000, 1000), ll(2000, 2000)];
const PARAGENS = [['P1', 'Início', ll(0, 5)], ['P2', 'Esquina', ll(1985, 12)], ['P3', 'Fim', ll(1995, 2000)]];
const db = B.getDatabase();
db.exec('CREATE TABLE IF NOT EXISTS stop_routes (feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0, stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id))');
const inserirParagem = db.prepare('INSERT INTO stops (stop_id, feed_id, stop_name, stop_lat, stop_lon) VALUES (?, ?, ?, ?, ?)');
const inserirSR = db.prepare('INSERT INTO stop_routes (feed_id, stop_id, route_id, direction_id, stop_sequence) VALUES (?, ?, ?, ?, ?)');
db.prepare('INSERT INTO routes (route_id, feed_id, route_short_name, route_long_name, route_type) VALUES (?, ?, ?, ?, 3)').run('unir:L1', 'unir', 'L1', 'Linha em L');
db.prepare('INSERT INTO routes (route_id, feed_id, route_short_name, route_long_name, route_type) VALUES (?, ?, ?, ?, 3)').run('unir:L2', 'unir', 'L2', 'Linha sem desenho');
PARAGENS.forEach(([id, nome, p], i) => {
  inserirParagem.run(`unir:${id}`, 'unir', nome, p.lat, p.lon);
  inserirSR.run('unir', `unir:${id}`, 'unir:L1', 0, i + 1);
  inserirSR.run('unir', `unir:${id}`, 'unir:L2', 0, i + 1);
});
// sentido 1 da L1: o mesmo desenho, mas as paragens em ordem contrária
PARAGENS.slice().reverse().forEach(([id], i) => inserirSR.run('unir', `unir:${id}`, 'unir:L1', 1, i + 1));

// ------------------------------------------------------------ 1. base SEM a tabela route_shapes (como a de hoje): nada rebenta, desenha-se em linha reta
let p = PL.percursoUnir('unir:L1', 'unir:P1', '0');
ok('[sem desenhos na base] o percurso da UNIR continua a funcionar', !!p && p.paragens.length === 3, p ? `${p.paragens.length} paragens` : 'null');
ok('[sem desenhos na base] sem caminho (a app une as paragens em linha reta, como antes)', !!p && p.caminho === undefined && p.cortes === undefined);

// ------------------------------------------------------------ 2. base com o desenho da L1 (sentido 0)
db.exec('CREATE TABLE IF NOT EXISTS route_shapes (route_id TEXT NOT NULL, direction_id INTEGER NOT NULL DEFAULT 0, shape_id TEXT NOT NULL, PRIMARY KEY (route_id, direction_id))');
db.prepare('INSERT INTO shapes (shape_id, feed_id, pontos) VALUES (?, ?, ?)').run('osrm:teste', 'unir', C.codificarPolilinha(ESTRADA));
db.prepare('INSERT INTO route_shapes (route_id, direction_id, shape_id) VALUES (?, ?, ?)').run('unir:L1', 0, 'osrm:teste');
db.prepare('INSERT INTO route_shapes (route_id, direction_id, shape_id) VALUES (?, ?, ?)').run('unir:L1', 1, 'osrm:teste'); // o mesmo desenho, guardado no mesmo sentido (vira-se)
B.clearAllCaches();

p = PL.percursoUnir('unir:L1', 'unir:P1', '0');
ok('[percurso] a linha com desenho traz o caminho', !!p?.caminho, p ? String(typeof p.caminho) : 'null');
ok('[percurso] e a posição de cada paragem no desenho (uma por paragem)', Array.isArray(p?.cortes) && p.cortes.length === 3, JSON.stringify(p?.cortes));
if (p?.caminho) {
  const t = C.trocosDoPercurso(p.paragens, 0, p.caminho, p.cortes);
  ok('[percurso] a app desenha pela estrada', t.pelaEstrada === true);
  const linha = t.restante;
  const esquinaPerto = Math.min(...linha.map((q) => hav(q, ll(2000, 0))));
  ok('[percurso] a linha passa pela esquina da estrada (e não corta pelo campo)', esquinaPerto < 30, `${Math.round(esquinaPerto)} m da esquina`);
  const compr = linha.slice(1).reduce((a, q, i) => a + hav(linha[i], q), 0);
  ok('[percurso] tem o comprimento da estrada (4 km) e não o da reta (2,8 km)', compr > 3800 && compr < 4300, `${Math.round(compr)} m`);
}

// sentido 1: as paragens vêm ao contrário; o desenho está guardado no outro sentido e tem de se virar
p = PL.percursoUnir('unir:L1', 'unir:P3', '1');
ok('[sentido contrário] o percurso traz o caminho, virado para a ordem das paragens', !!p?.caminho && p.paragens[0].id === 'unir:P3', p ? p.paragens.map((x) => x.id).join('>') : 'null');
if (p?.caminho) {
  const linha = C.descodificarPolilinha(p.caminho);
  ok('[sentido contrário] o desenho começa na primeira paragem (a do fim da estrada)', hav(linha[0], PARAGENS[2][2]) < 60, `${Math.round(hav(linha[0], PARAGENS[2][2]))} m`);
}

// linha sem desenho (L2) numa base que já tem route_shapes: continua em linha reta
p = PL.percursoUnir('unir:L2', 'unir:P1', '0');
ok('[linha sem desenho] sem caminho (linha reta, como antes)', !!p && p.caminho === undefined);

// ------------------------------------------------------------ 3. troço de uma opção de viagem (planeador)
const pontosTroco = PARAGENS.map(([, , q]) => ({ lat: q.lat, lon: q.lon }));
const troco = CM.caminhoDoTrocoUnir?.('unir:L1', 0, pontosTroco);
ok('[planeador] o troço da UNIR traz o caminho pela estrada', typeof troco === 'string' && troco.length > 10, String(typeof troco));
if (typeof troco === 'string') {
  const linha = C.descodificarPolilinha(troco);
  const esquinaPerto = Math.min(...linha.map((q) => hav(q, ll(2000, 0))));
  ok('[planeador] passa pela esquina', esquinaPerto < 30, `${Math.round(esquinaPerto)} m`);
}
ok('[planeador] linha sem desenho: sem caminho', CM.caminhoDoTrocoUnir?.('unir:L2', 0, pontosTroco) === undefined);
// paragens que não são do desenho (outra estrada, longe): o desenho não serve e não se inventa
const longe = pontosTroco.map((q) => ({ lat: q.lat + 0.05, lon: q.lon }));
ok('[planeador] paragens longe do desenho: sem caminho (nunca se inventa)', CM.caminhoDoTrocoUnir?.('unir:L1', 0, longe) === undefined);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nAs linhas da UNIR desenham-se pela estrada quando a base tem o desenho.');
process.exit(falhas ? 1 : 0);
