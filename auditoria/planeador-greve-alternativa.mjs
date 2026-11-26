// Greve anunciada nas notícias, de ponta a ponta: o aviso entra, o troço do metro aparece com a greve e, se todas as opções
// tiverem greve, junta-se a melhor sem greve (mesmo chegando mais tarde) e é essa a «mais rápida».
//
// O problema que isto impede: na greve da Metro do Porto (27/11/2026), Trindade → Aeroporto só mostrava o metro E (que não
// circulava); o autocarro 601 da STCP ficava escondido por chegar mais tarde.
// Uso: APP=caminho-da-app tsx auditoria/planeador-greve-alternativa.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-greve-alt-'));
const caminho = process.env.APP || '../app';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const RSS = `<rss><channel><item><title>Greve dos maquinistas reduz serviço do Metro do Porto na sexta-feira</title><link>https://www.rtp.pt/noticias/economia/greve-metro-porto</link><description>O Metro do Porto vai reduzir o serviço na sexta-feira, operando apenas na linha Amarela e entre Senhora da Hora e Estádio do Dragão, devido à greve dos maquinistas.</description><pubDate>Wed, 25 Nov 2026 18:53:00 +0000</pubDate></item></channel></rss>`;
globalThis.fetch = async (u) => (String(u).includes('rtp.pt/noticias/rss') ? new Response(RSS, { status: 200 }) : new Response('sem rede no teste', { status: 503 }));

const B = await import(`${caminho}/src/server/db/gtfsDatabase.ts`);
const P = await import(`${caminho}/src/server/planeador.ts`);
const I = await import(`${caminho}/src/server/planeadorIndice.ts`);
const C = await import(`${caminho}/src/server/centralAlertsEngine.ts`);

B.getDatabase().exec('CREATE TABLE IF NOT EXISTS stop_routes (feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0, stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id))');
for (const [id, mode] of [['metro_porto', 'Metro'], ['stcp', 'Autocarro']]) {
  B.upsertFeed({ id, operator_name: id === 'stcp' ? 'STCP' : 'Metro do Porto', mode, feed_type: 'gtfs', source_origin: 'seed', url: '', status: 'OK', progress: 'OK', lines_count: 1, stops_count: 2, trips_count: 1, realtime_entities: 'Nenhum' });
  B.batchInsertCalendar([{ feed_id: id, service_id: 'todos', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: '20200101', end_date: '20991231' }]);
}
const KM_LAT = 1 / 111, KM_LON = 1 / 84;
const C0 = { lat: 41.15, lon: -8.61 };
const ponto = (n, e) => ({ lat: C0.lat + n * KM_LAT, lon: C0.lon + e * KM_LON });
const PAR = { 'metro_porto:TRI': ['Trindade', ponto(0.1, 0)], 'metro_porto:AER': ['Aeroporto', ponto(9, 0.1)], 'stcp:COR': ['Cordoaria', ponto(0.2, 0.1)], 'stcp:AER2': ['Aeroporto', ponto(9, 0.2)] };
B.batchInsertStops(Object.entries(PAR).map(([id, [nome, p]]) => ({ stop_id: id, feed_id: id.split(':')[0], stop_name: nome, stop_lat: p.lat, stop_lon: p.lon })));
function linha(feed, cod, tipo, de, para, mins, cada, desf) {
  B.batchInsertRoutes([{ route_id: `${feed}:${cod}`, feed_id: feed, route_short_name: cod, route_long_name: cod, route_type: tipo }]);
  const trips = [], sts = [];
  for (let m = 6 * 60 + desf; m < 23 * 60; m += cada) {
    const t = `${feed}:${cod}:${m}`;
    trips.push({ trip_id: t, feed_id: feed, route_id: `${feed}:${cod}`, service_id: 'todos', trip_headsign: 'Aeroporto' });
    sts.push({ feed_id: feed, trip_id: t, stop_id: de, arrival_secs: m * 60, departure_secs: m * 60, stop_sequence: 1 });
    sts.push({ feed_id: feed, trip_id: t, stop_id: para, arrival_secs: (m + mins) * 60, departure_secs: (m + mins) * 60, stop_sequence: 2 });
  }
  B.batchInsertTrips(trips); B.batchInsertStopTimes(sts);
}
linha('metro_porto', 'E', 1, 'metro_porto:TRI', 'metro_porto:AER', 30, 15, 2); // metro: 30 min
linha('stcp', '601', 3, 'stcp:COR', 'stcp:AER2', 60, 30, 10); // autocarro: 60 min

for (let i = 0; i < 400 && !I.indicePronto(); i++) await new Promise((r) => setTimeout(r, 50));
ok('o motor em memória do planeador ficou pronto', !!I.indicePronto(), I.estadoIndice);
await C.runCentralAlertsSync();
const aviso = C.avisosEmMemoria().find((a) => a.tipo === 'greve' && a.operador === 'Metro do Porto');
ok('a greve da notícia entrou nos avisos', !!aviso, aviso && `${aviso.start_datetime} → ${aviso.end_datetime} (${aviso.source})`);

const O = ponto(0, 0), D = ponto(9, 0.15);
const tr = (o) => o.legs.filter((l) => l.mode === 'TRANSIT');
const resumo = (r) => r.routes.map((o) => `${o.id === 'a-pe' ? 'a pé' : tr(o).map((l) => `${l.lineCode}@${l.departureTime}${l.greve ? (l.greve.reduzido ? '[reduzido]' : '[GREVE]') : ''}`).join('>')}→${o.arrivalTime}${o.highlight ? ` (${o.highlight})` : ''}`).join(' | ');

// sexta-feira 27/11, 10:00: metro E com greve; o 601 tem de aparecer e ser a «mais rápida»
const r1 = await P.planearViagem(O.lat, O.lon, D.lat, D.lon, 'Aeroporto', new Date('2026-11-27T10:00:00Z'));
const metro = r1.routes.find((o) => tr(o).some((l) => l.lineCode === 'E'));
const bus = r1.routes.find((o) => tr(o).some((l) => l.lineCode === '601'));
ok('sexta: o metro E aparece marcado com greve (fonte: notícia)', metro && tr(metro)[0].greve && !tr(metro)[0].greve.reduzido && tr(metro)[0].greve.noticia === true, resumo(r1));
ok('sexta: o 601 (sem greve) aparece, mesmo chegando 30 min mais tarde', !!bus, resumo(r1));
ok('sexta: «mais rápido» é o 601, não o metro com greve', bus && bus.highlight === 'mais_rapido', resumo(r1));
ok('sexta: o 601 vem em primeiro', r1.routes.filter((o) => o.id !== 'a-pe')[0] === bus, resumo(r1));

// quinta-feira 26/11, 10:00: sem greve, o metro chega muito antes e o 601 não faz falta
const r2 = await P.planearViagem(O.lat, O.lon, D.lat, D.lon, 'Aeroporto', new Date('2026-11-26T10:00:00Z'));
const metro2 = r2.routes.find((o) => tr(o).some((l) => l.lineCode === 'E'));
ok('quinta de manhã: o metro sem greve', metro2 && !tr(metro2)[0].greve, resumo(r2));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
