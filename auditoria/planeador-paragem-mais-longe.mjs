// Com muita espera pela 1.ª partida, o planeador procura também nas linhas que param um pouco mais longe.
//
// O problema que isto impede (queixa real, 26/11/2026): de casa, na Rua das Cangostas (S. Pedro da Cova), para Campanhã às
// 11:20, a PAROU só mostrava o 8006 das 12:12 (chega 12:57), porque a paragem do 801 em S. Pedro da Cova fica a mais de 900 m.
// A pé até lá apanha-se o 801 das 12:00 e o metro no Dragão, e chega-se ~20 min antes. Mas a opção que anda pouco não pode
// desaparecer, e a que anda muito não fica em primeiro só por chegar uns minutos antes.
// Uso: APP=caminho-da-app tsx auditoria/planeador-paragem-mais-longe.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-longe-'));
const caminho = process.env.APP || '../app';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
globalThis.fetch = async () => new Response('sem rede no teste', { status: 503 });

const B = await import(`${caminho}/src/server/db/gtfsDatabase.ts`);
const P = await import(`${caminho}/src/server/planeador.ts`);
const I = await import(`${caminho}/src/server/planeadorIndice.ts`);

B.getDatabase().exec('CREATE TABLE IF NOT EXISTS stop_routes (feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0, stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id))');
B.upsertFeed({ id: 'teste', operator_name: 'Teste', mode: 'Autocarro', feed_type: 'gtfs', source_origin: 'seed', url: '', status: 'OK', progress: 'OK', lines_count: 2, stops_count: 4, trips_count: 1, realtime_entities: 'Nenhum' });
B.batchInsertCalendar([{ feed_id: 'teste', service_id: 'todos', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: '20200101', end_date: '20991231' }]);
const KM_LAT = 1 / 111, KM_LON = 1 / 84;
const C0 = { lat: 41.14, lon: -8.49 };
const ponto = (n, e) => ({ lat: C0.lat + n * KM_LAT, lon: C0.lon + e * KM_LON });
// Perto: a 150 m de casa, linha de hora a hora. Longe: a 1,1 km (≈19 min a pé), linha de 15 em 15 min. Destino a 7 km.
const PAR = { PERTO: ponto(0.15, 0), LONGE: ponto(1.1, 0), DP: ponto(0.1, 7), DL: ponto(0.2, 7) };
B.batchInsertStops(Object.entries(PAR).map(([k, p]) => ({ stop_id: `teste:${k}`, feed_id: 'teste', stop_name: `Paragem ${k}`, stop_lat: p.lat, stop_lon: p.lon })));
const CASA = ponto(0, 0), DEST = ponto(0.15, 7);
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
linha('8006', 'PERTO', 'DP', 40, 60, 45); // às :45 de cada hora, 40 min de viagem
linha('801', 'LONGE', 'DL', 15, 15, 0); // de 15 em 15 min, 15 min de viagem

for (let i = 0; i < 400 && !I.indicePronto(); i++) await new Promise((r) => setTimeout(r, 50));
ok('o motor em memória do planeador ficou pronto', !!I.indicePronto(), I.estadoIndice);

const tr = (o) => o.legs.filter((l) => l.mode === 'TRANSIT');
const resumo = (r) => r.routes.map((o) => `${o.id === 'a-pe' ? 'a pé' : tr(o).map((l) => `${l.lineCode}@${l.departureTime}`).join('>')}→${o.arrivalTime} (a pé ${o.walkingMinutes})`).join(' | ');
const temLinha = (r, cod) => r.routes.find((o) => tr(o).some((l) => l.lineCode === cod));

// 1) 08:00 (quarta-feira): o 8006 só às 08:45 (45 min de espera)
const r1 = await P.planearViagem(CASA.lat, CASA.lon, DEST.lat, DEST.lon, 'Destino', new Date('2026-12-02T08:00:00Z'));
const o801 = temLinha(r1, '801');
ok('com 45 min de espera, aparece o 801 da paragem mais longe', !!o801, resumo(r1));
ok('o 801 chega bem antes do 8006 (antes das 09:00)', o801 && o801.arrivalTime < '09:00', resumo(r1));
ok('a opção que anda pouco (8006, à porta) continua na lista', !!temLinha(r1, '8006'), resumo(r1));
ok('a pé até à paragem mais longe ≤ 25 min no total', o801 && o801.walkingMinutes <= 25, resumo(r1));

// 2) 08:38: o 8006 passa às 08:45 (7 min de espera) — não é preciso ir mais longe
const r2 = await P.planearViagem(CASA.lat, CASA.lon, DEST.lat, DEST.lon, 'Destino', new Date('2026-12-02T08:38:00Z'));
ok('com pouca espera fica o 8006 à porta', !!temLinha(r2, '8006'), resumo(r2));
ok('com pouca espera não manda andar 19 min até outra paragem', !temLinha(r2, '801'), resumo(r2));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
