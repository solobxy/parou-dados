// Garante que o "castigo" de andar muito a pé não faz perder autocarros.
//
// O problema que isto impede: para o planeador preferir percursos com pouca caminhada, cada minuto a pé acima de 8 conta a
// dobrar (custoAPe). Mas esse castigo era somado à HORA a que se chega à paragem: a 12 min a pé, a PAROU "chegava" à paragem
// 16 min depois de sair e perdia o autocarro que passa aos 13. Encontrado ao comparar com o Transitous (Faro, linha 59 da Vamus
// às 08:13: a PAROU propunha outro percurso, 16 min mais tarde e com a mesma caminhada).
// Agora há também uma pesquisa com o tempo real a pé; quem ordena as opções continua a ser a escolha final (que pesa o esforço).
// Uso: APP=caminho-da-app tsx auditoria/planeador-castigo-a-pe.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-castigo-'));
const caminho = process.env.APP || '../app';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
globalThis.fetch = async () => new Response('sem rede no teste', { status: 503 });

const B = await import(`${caminho}/src/server/db/gtfsDatabase.ts`);
const P = await import(`${caminho}/src/server/planeador.ts`);
const I = await import(`${caminho}/src/server/planeadorIndice.ts`);

const AGORA = new Date('2026-12-02T08:00:00Z'); // quarta-feira, 08:00 em Lisboa
B.getDatabase().exec('CREATE TABLE IF NOT EXISTS stop_routes (feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0, stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id))');
B.upsertFeed({ id: 'teste', operator_name: 'Teste', mode: 'Autocarro', feed_type: 'gtfs', source_origin: 'seed', url: '', status: 'OK', progress: 'OK', lines_count: 2, stops_count: 4, trips_count: 1, realtime_entities: 'Nenhum' });
B.batchInsertCalendar([{ feed_id: 'teste', service_id: 'todos', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: '20200101', end_date: '20991231' }]);
const KM_LAT = 1 / 111, KM_LON = 1 / 84;
const C0 = { lat: 37.01, lon: -7.93 };
const ponto = (n, e) => ({ lat: C0.lat + n * KM_LAT, lon: C0.lon + e * KM_LON });
// A: a 690 m (12 min a pé, linha reta × 1,3 a 75 m/min). B: à porta (100 m).
const PAR = { A: ponto(0.69, 0), B: ponto(0.1, 0), DA: ponto(0.69, 3.5), DB: ponto(0.1, 3.4) };
B.batchInsertStops(Object.entries(PAR).map(([k, p]) => ({ stop_id: `teste:${k}`, feed_id: 'teste', stop_name: `Paragem ${k}`, stop_lat: p.lat, stop_lon: p.lon })));
const O = ponto(0, 0), D = ponto(0.4, 3.45);
function linha(cod, de, para, mins, cada, desf) {
  B.batchInsertRoutes([{ route_id: `teste:${cod}`, feed_id: 'teste', route_short_name: cod, route_long_name: cod, route_type: 3 }]);
  const trips = [], sts = [];
  for (let m = 5 * 60 + desf; m < 23 * 60; m += cada) {
    const t = `teste:${cod}:${m}`;
    trips.push({ trip_id: t, feed_id: 'teste', route_id: `teste:${cod}`, service_id: 'todos', trip_headsign: 'Fim' });
    sts.push({ feed_id: 'teste', trip_id: t, stop_id: `teste:${de}`, arrival_secs: m * 60, departure_secs: m * 60, stop_sequence: 1 });
    sts.push({ feed_id: 'teste', trip_id: t, stop_id: `teste:${para}`, arrival_secs: (m + mins) * 60, departure_secs: (m + mins) * 60, stop_sequence: 2 });
  }
  B.batchInsertTrips(trips); B.batchInsertStopTimes(sts);
}
linha('59', 'A', 'DA', 9, 60, 13); // 08:13 → 08:22, de hora a hora (a paragem fica a 12 min a pé)
linha('2', 'B', 'DB', 30, 60, 4); // 08:04 → 08:34 (à porta, mais lento)

for (let i = 0; i < 400 && !I.indicePronto(); i++) await new Promise((r) => setTimeout(r, 50));
ok('o motor em memória do planeador ficou pronto', !!I.indicePronto(), I.estadoIndice);

const r = await P.planearViagem(O.lat, O.lon, D.lat, D.lon, 'Destino', AGORA);
const tr = (o) => o.legs.filter((l) => l.mode === 'TRANSIT');
const resumo = r.routes.map((o) => `${o.id === 'a-pe' ? 'a pé' : tr(o).map((l) => `${l.lineCode}@${l.departureTime}`).join('>')}→${o.arrivalTime} (a pé ${o.walkingMinutes})`).join(' | ');
const l59 = r.routes.find((o) => tr(o).some((l) => l.lineCode === '59'));
ok('a linha 59 das 08:13 aparece (12 min a pé dá para a apanhar)', tr(l59 || { legs: [] })[0]?.departureTime === '08:13', resumo);
ok('com a hora real: sair às 08:01 e chegar antes das 08:30', l59 && l59.departureTime <= '08:01' && l59.arrivalTime < '08:30', resumo);
ok('a linha 2 (à porta, chega às 08:34 e pouco) continua nas opções', r.routes.some((o) => tr(o).some((l) => l.lineCode === '2')), resumo);
ok('nenhuma opção manda apanhar a 59 da hora seguinte (09:13)', !r.routes.some((o) => tr(o).some((l) => l.lineCode === '59' && l.departureTime === '09:13')), resumo);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
