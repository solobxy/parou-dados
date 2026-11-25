// Garante que a UNIR entra no planeador de viagens com horários (GTFS da TMP), como as outras linhas.
//
// O problema que isto impede: a maior rede de autocarros da Área Metropolitana do Porto ficava fora dos percursos normais.
// Sem horários na base, o servidor só propunha a UNIR "estimada" (uma espera média) e o telemóvel ia pedir as horas à AMP;
// as paragens da UNIR nem contavam como sítio de partida ou chegada.
//
// Monta uma base pequena como a da produção: paragens e linhas da UNIR (feed "unir", "unir:<código>") e os horários da TMP
// no feed "unirh" (viagens "unirh:<código da TMP>", paragens "unirh:<código da UNIR>"). Serve previsões GTFS-Realtime da TMP.
// Uso: APP=caminho-da-app tsx auditoria/planeador-unir.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-unir-'));
process.env.PAROU_DATA_DIR = dir; // tem de ser antes de importar a app
const caminho = process.env.APP || '../app';

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

// ---------------------------------------------------------------- GTFS-Realtime (protobuf) feito à mão
const varint = (n) => { const o = []; let v = BigInt.asUintN(64, BigInt(n)); do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; o.push(b); } while (v); return o; };
const campoV = (n, v) => [...varint(n * 8), ...varint(v)];
const campoB = (n, bytes) => [...varint(n * 8 + 2), ...varint(bytes.length), ...bytes];
const campoT = (n, s) => campoB(n, [...Buffer.from(s, 'utf8')]);
function ficheiroRt(viagens, horaFicheiro) {
  const out = [...campoB(1, [...campoT(1, '2.0'), ...campoV(3, horaFicheiro)])];
  viagens.forEach((v, i) => {
    const tu = [...campoB(1, [...campoT(1, v.id)])];
    for (const s of v.paragens) tu.push(...campoB(2, [...campoV(1, s.seq), ...campoB(2, campoV(2, s.hora)), ...campoT(4, s.paragem)]));
    out.push(...campoB(2, [...campoT(1, `e${i}`), ...campoB(3, tu)]));
  });
  return new Uint8Array(out);
}

let RT = null;
try { RT = await import(`${caminho}/src/server/tempoRealPlaneador.ts`); } catch { /* versão sem tempo real */ }
let ficheiroUnir = ficheiroRt([], Math.floor(Date.now() / 1000));
globalThis.fetch = async (url) => {
  if (RT?.URL_PREVISOES_UNIR && String(url) === RT.URL_PREVISOES_UNIR) return new Response(ficheiroUnir, { status: 200 });
  return new Response('sem rede no teste', { status: 503 });
};

const B = await import(`${caminho}/src/server/db/gtfsDatabase.ts`);
const P = await import(`${caminho}/src/server/planeador.ts`);
const I = await import(`${caminho}/src/server/planeadorIndice.ts`);

const AGORA = new Date('2026-11-25T08:00:00Z'); // quarta-feira, 08:00 em Lisboa
const M0 = Math.floor(new Date('2026-11-25T00:00:00Z').getTime() / 1000);
const db = B.getDatabase();
db.exec('CREATE TABLE IF NOT EXISTS stop_routes (feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0, stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id))');
B.upsertFeed({ id: 'unir', operator_name: 'UNIR', mode: 'Autocarro', feed_type: 'amp', source_origin: 'seed', url: '', status: 'OK', progress: 'OK', lines_count: 1, stops_count: 3, trips_count: 0, realtime_entities: 'Nenhum' });
B.batchInsertCalendar([{ feed_id: 'unirh', service_id: '[PLAGF][KJTOU]ut1:A-U', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: '20200101', end_date: '20991231' }]);

const KM_LAT = 1 / 111, KM_LON = 1 / 84;
const C0 = { lat: 41.2, lon: -8.6 };
const ponto = (n, e) => ({ lat: C0.lat + n * KM_LAT, lon: C0.lon + e * KM_LON });
const PARAGENS = [['mai:1', 'Sete Bicas', ponto(0.05, 0)], ['mai:2', 'Meio', ponto(3, 0)], ['mai:3', 'Fim', ponto(6.05, 0)]];
B.batchInsertStops(PARAGENS.map(([c, n, p]) => ({ stop_id: `unir:${c}`, feed_id: 'unir', stop_name: n, stop_lat: p.lat, stop_lon: p.lon })));
B.batchInsertRoutes([{ route_id: 'unir:5101', feed_id: 'unir', route_short_name: '5101', route_long_name: 'Sete Bicas – Fim', route_type: 3, route_color: 'CE9926' }]);
// a UNIR na tabela das linhas por paragem (como em produção: é dela que saíam as linhas "estimadas")
for (const [i, [c]] of PARAGENS.entries()) db.prepare('INSERT INTO stop_routes VALUES (?, ?, ?, ?, ?)').run('unir', `unir:${c}`, 'unir:5101', 1, i + 1);
const trips = [], sts = [];
const viagem = (m) => `[PLAGF][KJTOU]A-U:5101:0:1:${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`;
for (let m = 6 * 60 + 5; m < 22 * 60; m += 20) {
  const t = `unirh:${viagem(m)}`;
  trips.push({ trip_id: t, feed_id: 'unirh', route_id: 'unirh:5101', service_id: '[PLAGF][KJTOU]ut1:A-U', trip_headsign: 'Fim' });
  PARAGENS.forEach(([c], i) => sts.push({ feed_id: 'unirh', trip_id: t, stop_id: `unirh:${c}`, arrival_secs: (m + i * 9) * 60, departure_secs: (m + i * 9) * 60, stop_sequence: i + 1 }));
}
B.batchInsertTrips(trips);
B.batchInsertStopTimes(sts);

for (let i = 0; i < 400 && !I.indicePronto(); i++) await new Promise((r) => setTimeout(r, 50));
ok('o motor em memória do planeador ficou pronto', !!I.indicePronto(), I.estadoIndice);

const O = ponto(0, 0), D = ponto(6, 0);
const transito = (o) => o.legs.filter((l) => l.mode === 'TRANSIT');
const resumo = (r) => r.routes.map((o) => `${o.id === 'a-pe' ? 'a pé' : transito(o).map((l) => `${l.lineCode}@${l.departureTime}${l.isRealtime ? '*' : ''}`).join('>')}→${o.arrivalTime}`).join(' | ') + ` [unir:${r.unir.length} híbridas:${r.hibridas?.length || 0} pontes:${r.pontes?.length || 0} duplas:${r.duplas?.length || 0}]`;

{
  const r = await P.planearViagem(O.lat, O.lon, D.lat, D.lon, 'Fim', AGORA);
  const op = r.routes.find((o) => transito(o).some((l) => l.lineCode === '5101'));
  const l = op && transito(op)[0];
  ok('[horários] a UNIR 5101 aparece nos percursos normais', !!op, resumo(r));
  ok('[horários] com a hora do horário da TMP (08:05) e a chegada (08:23)', l?.departureTime === '08:05' && l?.arrivalTime === '08:23', resumo(r));
  ok('[horários] operador UNIR, linha 5101 com a cor da UNIR', l?.operatorName === 'UNIR' && /ce9926/i.test(l?.lineColor || ''), JSON.stringify({ op: l?.operatorName, cor: l?.lineColor }));
  ok('[horários] entra e sai nas paragens da UNIR (nomes da AMP)', l?.fromStopName === 'Sete Bicas' && l?.toStopName === 'Fim', JSON.stringify({ de: l?.fromStopName, para: l?.toStopName }));
  ok('[horários] o troço tem os pontos das paragens para o mapa', (l?.pontos || []).length >= 2, String((l?.pontos || []).length));
  ok('[horários] sem pesquisas à parte da UNIR pela AMP (já vem com horas)', !r.unir.length && !(r.hibridas || []).length && !(r.pontes || []).length && !(r.duplas || []).length && !(r.cadeias || []).length, resumo(r));
  ok('[horários] o índice sabe que a UNIR tem horários', I.indicePronto()?.unirComHorarios === true);
  ok('[horários] não há linhas da UNIR "estimadas" no índice', !I.indicePronto()?.padroes.some((p) => p.freq));
}

// tempo real da TMP: a viagem das 08:05 vai com 7 min de atraso
if (RT?.URL_PREVISOES_UNIR) {
  ficheiroUnir = ficheiroRt([{ id: viagem(6 * 60 + 5 + 20 * 6), paragens: [{ seq: 1, paragem: '100001', hora: M0 + (8 * 60 + 12) * 60 }, { seq: 3, paragem: '100003', hora: M0 + (8 * 60 + 30) * 60 }] }], Math.floor(Date.now() / 1000));
  RT.limparTempoRealPlaneador();
  const r = await P.planearViagem(O.lat, O.lon, D.lat, D.lon, 'Fim', AGORA);
  const l = r.routes.map((o) => transito(o)[0]).find((x) => x?.lineCode === '5101');
  ok('[tempo real] a 5101 das 08:05 aparece às 08:12, em direto, com 7 min de atraso', l?.departureTime === '08:12' && l?.isRealtime === true && l?.atrasoMinutos === 7, resumo(r));
} else ok('[tempo real] o planeador lê as previsões da TMP (URL_PREVISOES_UNIR)', false);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
