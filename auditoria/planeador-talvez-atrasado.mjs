// O autocarro sem dados em direto que devia ter passado há 1–2 min: pode ainda não ter passado.
//
// O caso (25/11/2026, Gondomar → Campanhã): às 12:24 o ecrã da paragem mostrava o 8019 das 12:23 "a chegar" (sem previsão em
// direto: a TMP não a publica para essa viagem), mas o planeador dava-o como passado e só propunha o 8017 das 12:44. Medido
// nesse dia: os autocarros da UNIR iam em média 2,5 min atrasados e metade com 2+ min de atraso.
// Agora: para pedidos "para agora", o 1.º autocarro sem previsão em direto que passou na hora até 2 min antes de se chegar à
// paragem aparece como alternativa marcada ("pode ainda não ter passado"), nunca como a recomendada nem a mais rápida.
// Uso: APP=caminho-da-app tsx auditoria/planeador-talvez-atrasado.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-talvez-'));
const caminho = process.env.APP || '../app';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
globalThis.fetch = async () => new Response('sem rede no teste', { status: 503 });

// "agora" do teste: quarta-feira 25/11/2026, 12:24 em Lisboa (o relógio da app também)
const AGORA = new Date('2026-11-25T12:24:00Z');
const realNow = Date.now; const t0 = realNow();
Date.now = () => AGORA.getTime() + (realNow() - t0);

const B = await import(`${caminho}/src/server/db/gtfsDatabase.ts`);
const P = await import(`${caminho}/src/server/planeador.ts`);
const I = await import(`${caminho}/src/server/planeadorIndice.ts`);

B.getDatabase().exec('CREATE TABLE IF NOT EXISTS stop_routes (feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0, stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id))');
B.upsertFeed({ id: 'teste', operator_name: 'Teste', mode: 'Autocarro', feed_type: 'gtfs', source_origin: 'seed', url: '', status: 'OK', progress: 'OK', lines_count: 2, stops_count: 2, trips_count: 1, realtime_entities: 'Nenhum' });
B.batchInsertCalendar([{ feed_id: 'teste', service_id: 'todos', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: '20200101', end_date: '20991231' }]);
const KM_LAT = 1 / 111, KM_LON = 1 / 84;
const C0 = { lat: 41.15, lon: -8.53 };
const ponto = (n, e) => ({ lat: C0.lat + n * KM_LAT, lon: C0.lon + e * KM_LON });
const A = ponto(0.05, 0), D = ponto(0.05, -5);
B.batchInsertStops([{ stop_id: 'teste:A', feed_id: 'teste', stop_name: 'Combatentes', stop_lat: A.lat, stop_lon: A.lon }, { stop_id: 'teste:D', feed_id: 'teste', stop_name: 'Campanhã', stop_lat: D.lat, stop_lon: D.lon }]);
function linha(cod, horas, mins) {
  B.batchInsertRoutes([{ route_id: `teste:${cod}`, feed_id: 'teste', route_short_name: cod, route_long_name: cod, route_type: 3 }]);
  const trips = [], sts = [];
  for (const m of horas) {
    const t = `teste:${cod}:${m}`;
    trips.push({ trip_id: t, feed_id: 'teste', route_id: `teste:${cod}`, service_id: 'todos', trip_headsign: 'Campanhã' });
    sts.push({ feed_id: 'teste', trip_id: t, stop_id: 'teste:A', arrival_secs: m * 60, departure_secs: m * 60, stop_sequence: 1 });
    sts.push({ feed_id: 'teste', trip_id: t, stop_id: 'teste:D', arrival_secs: (m + mins) * 60, departure_secs: (m + mins) * 60, stop_sequence: 2 });
  }
  B.batchInsertTrips(trips); B.batchInsertStopTimes(sts);
}
linha('8019', [12 * 60 + 23, 13 * 60 + 3], 17); // 12:23 (há 1 min) e 13:03
linha('8017', [12 * 60 + 38, 13 * 60 + 8], 17); // 12:38

for (let i = 0; i < 400 && !I.indicePronto(); i++) await new Promise((r) => setTimeout(r, 50));
ok('o motor em memória do planeador ficou pronto', !!I.indicePronto(), I.estadoIndice);

const O = ponto(0, 0); // ~1 min a pé da paragem
const tr = (o) => o.legs.filter((l) => l.mode === 'TRANSIT');
const resumo = (r) => r.routes.map((o) => `${o.id === 'a-pe' ? 'a pé' : tr(o).map((l) => `${l.lineCode}@${l.departureTime}`).join('>')}→${o.arrivalTime}${o.possivelAtraso ? ' (talvez)' : ''}${o.highlight ? ` [${o.highlight}]` : ''}`).join(' | ');

{
  const r = await P.planearViagem(O.lat, O.lon, D.lat, D.lon, 'Campanhã', AGORA);
  const talvez = r.routes.find((o) => o.possivelAtraso);
  ok('[agora] aparece o 8019 das 12:23 como "pode ainda não ter passado"', !!talvez && tr(talvez)[0]?.lineCode === '8019' && tr(talvez)[0]?.departureTime === '12:23', resumo(r));
  ok('[agora] não é a recomendada (a 1.ª é a garantida: 8017 das 12:38)', tr(r.routes[0] || { legs: [] })[0]?.lineCode === '8017' && !r.routes[0].possivelAtraso, resumo(r));
  ok('[agora] não leva o destaque "mais rápido" nem "melhor"', !!talvez && !talvez.highlight, resumo(r));
  ok('[agora] sai "já" (nunca uma hora de saída no passado)', !!talvez && talvez.departureTime === '12:24', talvez?.departureTime);
  ok('[agora] o troço vem marcado para o ecrã explicar', !!talvez && tr(talvez)[0]?.talvezJaPassou === true);
}
{
  // O telemóvel volta a ordenar as opções (junta as da UNIR): a "talvez" continua em 2.º e sem destaque
  const r = await P.planearViagem(O.lat, O.lon, D.lat, D.lon, 'Campanhã', AGORA);
  const { ordenarOpcoes } = await import(`${caminho}/src/services/rotaVarios.ts`);
  const lista = ordenarOpcoes([...r.routes].reverse());
  const resumoL = resumo({ routes: lista });
  ok('[telemóvel] depois de reordenar, a 1.ª continua a ser a garantida', !!lista[0] && !lista[0].possivelAtraso, resumoL);
  ok('[telemóvel] a "talvez" fica em 2.º, sem destaque', !!lista[1]?.possivelAtraso && !lista[1].highlight, resumoL);
  ok('[telemóvel] "mais rápido" e "melhor" só nas garantidas', lista.filter((o) => o.highlight).every((o) => !o.possivelAtraso) && lista.some((o) => o.highlight), resumoL);
}
{
  // Para daqui a uma hora não se adivinha atrasos: só o horário
  const r = await P.planearViagem(O.lat, O.lon, D.lat, D.lon, 'Campanhã', new Date('2026-11-25T13:00:00Z'));
  ok('[mais tarde] num pedido para outra hora não há "pode ainda não ter passado"', !r.routes.some((o) => o.possivelAtraso), resumo(r));
}
{
  const fonte = fs.readFileSync(`${caminho}/src/components/OpcaoRota.tsx`, 'utf8');
  ok('[ecrã] o cartão explica a opção', /possivelAtraso/.test(fonte));
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
