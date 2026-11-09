// Os minutos e metros a pé do planeador contam-se pelas ruas, não em linha reta.
//
// Caso: a paragem A fica a 120 m em linha reta, mas do outro lado de uma linha de comboio (a única passagem é 700 m ao
// lado: ~1,5 km a pé); a paragem B fica a 350 m pela mesma rua. Antes, a PAROU dizia "2 min a pé" até A e mandava a pessoa
// para lá; tem de mandar para B, e qualquer opção por A tem de dizer a distância a sério. Os troços a pé vêm com o desenho
// pelas ruas (pontos), para o mapa (até nas versões antigas da app) não riscar uma linha reta por cima de tudo.
// Uso: APP=caminho-da-app tsx auditoria/planeador-a-pe-ruas.mjs   (precisa de python3 para fazer os mosaicos)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-ape-plan-'));
process.env.PAROU_DATA_DIR = dir; // tem de ser antes de importar a app
const caminho = process.env.APP || '../app';
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const B = await import(`${caminho}/src/server/db/gtfsDatabase.ts`);
const P = await import(`${caminho}/src/server/planeador.ts`);
const I = await import(`${caminho}/src/server/planeadorIndice.ts`);

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const AGORA = new Date('2026-10-14T12:00:00+01:00');
const C0 = { lat: 41.15, lon: -8.6 };
const mLat = 111195, mLon = 111195 * Math.cos(C0.lat * Math.PI / 180);
const P_ = (n, e) => ({ lat: C0.lat + n / mLat, lon: C0.lon + e / mLon }); // n metros a norte, e a este

// Ruas: a do sul (onde se está e onde fica B), a do norte (onde fica A) e a única ligação entre elas, 700 m a este
const vias = [
  [P_(0, -60), P_(0, 100), P_(0, 350), P_(0, 700), P_(0, 760)],
  [P_(120, -60), P_(120, 0), P_(120, 350), P_(120, 700), P_(120, 760)],
  [P_(0, 700), P_(120, 700)],
  // zona do destino
  [P_(5000, -100), P_(5000, 100)],
];
const geo = path.join(dir, 'vias.geojsonseq');
fs.writeFileSync(geo, vias.map((c) => JSON.stringify({ type: 'Feature', properties: { highway: 'residential' }, geometry: { type: 'LineString', coordinates: c.map((p) => [p.lon, p.lat]) } })).join('\n') + '\n');
const sq = path.join(dir, 'caminhos.sqlite');
execFileSync('python3', [path.join(RAIZ, 'caminhos_a_pe.py'), geo, sq]);

const db = B.getDatabase();
db.exec('CREATE TABLE IF NOT EXISTS stop_routes (feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0, stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id))');
db.exec('CREATE TABLE IF NOT EXISTS ape (t INTEGER PRIMARY KEY, d BLOB NOT NULL)');
const fonte = new DatabaseSync(sq, { readOnly: true });
const ins = db.prepare('INSERT OR REPLACE INTO ape (t, d) VALUES (?, ?)');
for (const r of fonte.prepare('SELECT t, d FROM ape').all()) ins.run(r.t, r.d);

const F = { id: 'bus_r', mode: 'Autocarro', nome: 'Autocarros R' };
B.upsertFeed({ id: F.id, operator_name: F.nome, mode: F.mode, feed_type: 'gtfs', source_origin: 'seed', url: '', status: 'OK', progress: 'OK', lines_count: 2, stops_count: 3, trips_count: 1, realtime_entities: 'Nenhum' });
B.batchInsertCalendar([{ feed_id: F.id, service_id: 'todos', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: '20200101', end_date: '20991231' }]);
const A = P_(120, 0), Bp = P_(0, 350), Z = P_(5000, 0), ZB = P_(5000, 60);
B.batchInsertStops([
  { stop_id: 'r:A', feed_id: F.id, stop_name: 'Paragem A (outro lado da linha)', stop_lat: A.lat, stop_lon: A.lon },
  { stop_id: 'r:B', feed_id: F.id, stop_name: 'Paragem B (mesma rua)', stop_lat: Bp.lat, stop_lon: Bp.lon },
  { stop_id: 'r:Z', feed_id: F.id, stop_name: 'Destino Z', stop_lat: Z.lat, stop_lon: Z.lon },
  { stop_id: 'r:ZB', feed_id: F.id, stop_name: 'Destino ZB', stop_lat: ZB.lat, stop_lon: ZB.lon },
]);
function linha(codigo, de, para, min, cada, desf) {
  const rota = `${F.id}:${codigo}`;
  B.batchInsertRoutes([{ route_id: rota, feed_id: F.id, route_short_name: codigo, route_long_name: `${codigo} teste`, route_type: 3 }]);
  const trips = [], sts = [];
  for (let m = 5 * 60 + desf; m < 23 * 60; m += cada) {
    const t = `${rota}:${m}`;
    trips.push({ trip_id: t, feed_id: F.id, route_id: rota, service_id: 'todos', trip_headsign: 'Fim' });
    sts.push({ feed_id: F.id, trip_id: t, stop_id: de, arrival_secs: m * 60, departure_secs: m * 60, stop_sequence: 1 });
    sts.push({ feed_id: F.id, trip_id: t, stop_id: para, arrival_secs: (m + min) * 60, departure_secs: (m + min) * 60, stop_sequence: 2 });
  }
  B.batchInsertTrips(trips);
  B.batchInsertStopTimes(sts);
}
linha('LA', 'r:A', 'r:Z', 12, 10, 2);  // de A: chega mais depressa
linha('LB', 'r:B', 'r:ZB', 14, 10, 6); // de B: um pouco mais lenta
for (let i = 0; i < 400 && !I.indicePronto(); i++) await new Promise((r) => setTimeout(r, 50));
ok('o motor em memória do planeador ficou pronto', !!I.indicePronto());

const O = P_(0, 0), D = P_(5000, 30);
const r = await P.planearViagem(O.lat, O.lon, D.lat, D.lon, 'Destino', AGORA, {});
const emTransito = r.routes.filter((o) => o.id !== 'a-pe');
const resumo = emTransito.map((o) => `${o.legs.map((l) => (l.mode === 'WALK' ? `pé ${l.distanceMeters}m/${l.durationMinutes}min` : `${l.lineCode} de ${l.fromStopName}`)).join(' > ')} [sai ${o.departureTime}, chega ${o.arrivalTime}]`).join(' | ');
ok('há opções em transporte', emTransito.length > 0, resumo);
const primeiro = (o) => o.legs.find((l) => l.mode === 'TRANSIT');
ok('a melhor opção apanha o autocarro em B (mesma rua), não em A (outro lado da linha)', /Paragem B/.test(primeiro(emTransito[0])?.fromStopName || ''), resumo);
for (const o of emTransito) {
  const t = primeiro(o), aPe = o.legs[0];
  if (/Paragem A/.test(t?.fromStopName || '')) {
    ok('opção por A diz a distância a pé pelas ruas (~1,5 km), não "120 m"', aPe.mode === 'WALK' && aPe.distanceMeters >= 1400, `${aPe.distanceMeters} m`);
    ok('opção por A: o desenho a pé dá a volta pela passagem (700 m a este)', (aPe.pontos || []).some((p) => (p.lon - C0.lon) * mLon > 650), JSON.stringify((aPe.pontos || []).length));
  } else if (/Paragem B/.test(t?.fromStopName || '')) {
    ok('opção por B: ~350 m a pé (pela rua)', aPe.mode === 'WALK' && aPe.distanceMeters >= 330 && aPe.distanceMeters <= 420, `${aPe.distanceMeters} m`);
    const fora = (aPe.pontos || []).filter((p) => Math.abs((p.lat - C0.lat) * mLat) > 3);
    ok('opção por B: o desenho a pé vai pela rua (nenhum ponto fora dela)', fora.length === 0, JSON.stringify(fora.slice(0, 2)));
  }
  // a hora de sair dá para chegar à paragem a pé antes do autocarro
  const min = (s) => { const m = /^(\d\d):(\d\d)$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : NaN; };
  ok(`sair às ${o.departureTime} e andar ${aPe.durationMinutes} min chega antes do autocarro das ${t?.departureTime}`, min(o.departureTime) + (aPe.durationMinutes || 0) <= min(t?.departureTime));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* sem importância */ }
process.exit(falhas ? 1 : 0);
