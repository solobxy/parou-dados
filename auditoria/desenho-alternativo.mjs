// Testa os desenhos oficiais que não servem à viagem (CI de 24/11/2026: a viagem carris:5383_…_199_1_2, Odivelas → Cais do
// Sodré, saía sem desenho porque o desenho oficial desse sentido é um laço fechado no Saldanha; o mesmo nas circulares 226 e
// 238, cujo laço começa noutro ponto). A app passa a experimentar o laço a começar na 1.ª paragem e os outros desenhos da
// mesma linha (o do outro sentido, ao contrário). Se nenhum servir, fica como antes (sem desenho: linha reta).
// Monta uma base pequena com as funções da própria app. Uso: APP=<pasta da app> tsx auditoria/desenho-alternativo.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-desenho-')); // antes de importar a app
const APP = process.env.APP || '../parou';
const B = await import(`${APP}/src/server/db/gtfsDatabase.ts`);
const P = await import(`${APP}/src/server/percursoLinha.ts`);
const U = await import(`${APP}/src/utils/caminho.ts`);
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };

const db = B.getDatabase();
db.exec('CREATE TABLE IF NOT EXISTS stop_routes (feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0, stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id))');
B.upsertFeed({ id: 'bus_t', operator_name: 'Autocarros T', mode: 'Autocarro', feed_type: 'gtfs', source_origin: 'seed', url: '', status: 'OK', progress: 'OK', lines_count: 1, stops_count: 1, trips_count: 1, realtime_entities: 'Nenhum' });

// Rua a direito (6 paragens, ~700 m entre elas) e uma volta quadrada (8 paragens)
const rua = Array.from({ length: 6 }, (_, i) => ({ stop_id: `bus_t:R${i}`, feed_id: 'bus_t', stop_name: `Rua ${i}`, stop_lat: 38.70, stop_lon: -9.20 + i * 0.008 }));
const canto = [[38.70, -9.10], [38.70, -9.09], [38.71, -9.09], [38.71, -9.10]];
const volta = [];
for (let i = 0; i < 4; i++) {
  const [a, b] = [canto[i], canto[(i + 1) % 4]];
  volta.push([a[0], a[1]], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
}
const pVolta = volta.map(([lat, lon], i) => ({ stop_id: `bus_t:V${i}`, feed_id: 'bus_t', stop_name: `Volta ${i}`, stop_lat: lat, stop_lon: lon }));
B.batchInsertStops([...rua, ...pVolta]);

const denso = (pts, n = 12) => { const out = []; for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < n; k++) out.push({ lat: pts[i].lat + (pts[i + 1].lat - pts[i].lat) * k / n, lon: pts[i].lon + (pts[i + 1].lon - pts[i].lon) * k / n }); out.push(pts[pts.length - 1]); return out; };
const ptsRua = denso(rua.map((s) => ({ lat: s.stop_lat, lon: s.stop_lon })));
const laco = denso([{ lat: 38.73, lon: -9.15 }, { lat: 38.735, lon: -9.15 }, { lat: 38.735, lon: -9.145 }, { lat: 38.73, lon: -9.145 }, { lat: 38.73, lon: -9.15 }]);
// a volta desenhada a começar no 3.º canto (como a Carris faz nas circulares)
const ordemVolta = [...canto.slice(2), ...canto.slice(0, 2), canto[2]].map(([lat, lon]) => ({ lat, lon }));
const ptsVolta = denso(ordemVolta);
const insS = db.prepare('INSERT INTO shapes (shape_id, feed_id, pontos) VALUES (?, ?, ?)');
insS.run('bus_t:RUA_ASC', 'bus_t', U.codificarPolilinha(ptsRua));
insS.run('bus_t:RUA_DESC_ESTRAGADO', 'bus_t', U.codificarPolilinha(laco));
insS.run('bus_t:VOLTA', 'bus_t', U.codificarPolilinha(ptsVolta));
insS.run('bus_t:SO_ESTRAGADO', 'bus_t', U.codificarPolilinha(laco));
const insT = db.prepare('INSERT INTO trips (trip_id, feed_id, route_id, service_id, trip_headsign, direction_id, shape_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
insT.run('bus_t:ida', 'bus_t', 'bus_t:L1', 'S', 'Rua 5', 0, 'bus_t:RUA_ASC');
insT.run('bus_t:volta', 'bus_t', 'bus_t:L1', 'S', 'Rua 0', 1, 'bus_t:RUA_DESC_ESTRAGADO');
insT.run('bus_t:circ', 'bus_t', 'bus_t:L2', 'S', 'Volta 0', 0, 'bus_t:VOLTA');
insT.run('bus_t:sem', 'bus_t', 'bus_t:L3', 'S', 'Rua 0', 1, 'bus_t:SO_ESTRAGADO');
const insST = db.prepare('INSERT INTO stop_times (feed_id, trip_id, stop_id, arrival_secs, departure_secs, stop_sequence) VALUES (?, ?, ?, ?, ?, ?)');
const viagem = (trip, ids) => ids.forEach((id, i) => insST.run('bus_t', trip, id, 8 * 3600 + i * 120, 8 * 3600 + i * 120, i + 1));
viagem('bus_t:ida', rua.map((s) => s.stop_id));
viagem('bus_t:volta', [...rua].reverse().map((s) => s.stop_id));
viagem('bus_t:circ', [...pVolta.map((s) => s.stop_id), pVolta[0].stop_id]);
viagem('bus_t:sem', [...rua].reverse().map((s) => s.stop_id));
B.batchInsertRoutes([
  { route_id: 'bus_t:L1', feed_id: 'bus_t', route_short_name: '199', route_long_name: 'Rua', route_type: 3 },
  { route_id: 'bus_t:L2', feed_id: 'bus_t', route_short_name: '238', route_long_name: 'Volta', route_type: 3 },
  { route_id: 'bus_t:L3', feed_id: 'bus_t', route_short_name: '9', route_long_name: 'Sem', route_type: 3 },
]);

const todos = (p) => Array.isArray(p?.cortes) && p.cortes.length === p.paragens.length && p.cortes.every((c) => typeof c === 'number');
const longe = (p) => { const pts = U.descodificarPolilinha(p.caminho); return Math.max(...p.paragens.map((s) => Math.min(...pts.map((q) => Math.hypot((s.lat - q.lat) * 111000, (s.lon - q.lon) * 87000))))); };

const ida = P.percursoDeViagem('bus_t:ida');
ok('[normal] a ida usa o desenho dela', !!ida?.caminho && todos(ida));
const volta2 = P.percursoDeViagem('bus_t:volta');
ok('[estragado] a volta (desenho dela é um laço noutro sítio) ganha desenho', !!volta2?.caminho, JSON.stringify(volta2?.cortes));
ok('[estragado] com todas as paragens encaixadas', todos(volta2), JSON.stringify(volta2?.cortes));
ok('[estragado] o desenho passa junto das paragens (o da ida, ao contrário)', volta2?.caminho && longe(volta2) < 30, volta2?.caminho ? `${Math.round(longe(volta2))} m` : '');
const circ = P.percursoDeViagem('bus_t:circ');
ok('[circular] a volta que começa noutro ponto do laço ganha desenho', !!circ?.caminho && todos(circ), JSON.stringify(circ?.cortes));
ok('[circular] começa e acaba junto da 1.ª paragem', circ?.caminho && (() => { const pts = U.descodificarPolilinha(circ.caminho); const p0 = circ.paragens[0]; return [pts[0], pts[pts.length - 1]].every((q) => Math.hypot((q.lat - p0.lat) * 111000, (q.lon - p0.lon) * 87000) < 30); })());
const sem = P.percursoDeViagem('bus_t:sem');
ok('[sem alternativa] continua sem desenho (linha reta, como antes)', !!sem && !sem.caminho);
const t0 = Date.now();
for (let i = 0; i < 200; i++) P.percursoDeViagem('bus_t:volta');
ok('[rapidez] 200 pedidos em menos de 1 s (a escolha fica guardada)', Date.now() - t0 < 1000, `${Date.now() - t0} ms`);

console.log(falhas ? `${falhas} testes falharam` : 'Todos os testes passaram');
process.exit(falhas ? 1 : 0);
