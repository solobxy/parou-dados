// Atrasos medidos pelo servidor (atrasosMedidos.ts): o que se lê das previsões em direto, como se guarda e a janela do
// "pode ainda não ter passado" que sai daí para cada operador.
// Uso: APP=caminho-da-app tsx auditoria/atrasos-medidos.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-atrasos-'));
const caminho = process.env.APP || '../app';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

// GTFS-Realtime mínimo (o mesmo formato do teste planeador-tempo-real)
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

const AGORA = new Date('2026-10-14T12:00:00+01:00'); // quarta-feira, meio-dia em Lisboa
const M0 = Math.floor(new Date('2026-10-14T00:00:00+01:00').getTime() / 1000);
const realNow = Date.now; const t0 = realNow();
Date.now = () => AGORA.getTime() + (realNow() - t0);
const hora = (hh, mm) => M0 + (hh * 60 + mm) * 60;

const RT = await import(`${caminho}/src/server/tempoRealPlaneador.ts`);
let ficheiroCm = new Uint8Array(0);
globalThis.fetch = async (url) => (String(url) === RT.URL_PREVISOES_CM ? new Response(ficheiroCm, { status: 200 }) : new Response('sem rede no teste', { status: 503 }));

const B = await import(`${caminho}/src/server/db/gtfsDatabase.ts`);
const I = await import(`${caminho}/src/server/planeadorIndice.ts`);
const A = await import(`${caminho}/src/server/atrasosMedidos.ts`);
const { DateTime } = createRequire(path.resolve(caminho, 'package.json'))('luxon');

B.getDatabase().exec('CREATE TABLE IF NOT EXISTS stop_routes (feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0, stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id))');
const feed = (id, nome) => B.upsertFeed({ id, operator_name: nome, mode: 'Autocarro', feed_type: 'gtfs', source_origin: 'seed', url: '', status: 'OK', progress: 'OK', lines_count: 1, stops_count: 1, trips_count: 1, realtime_entities: 'Nenhum' });
feed('carris_metropolitana', 'Carris Metropolitana');
feed('cmh', 'Carris Metropolitana');
B.batchInsertCalendar([{ feed_id: 'cmh', service_id: 'todos', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: '20200101', end_date: '20991231' }]);
B.batchInsertStops(['X', 'Y', 'Z'].map((n, i) => ({ stop_id: `cm:${n}`, feed_id: 'carris_metropolitana', stop_name: n, stop_lat: 38.7 + i * 0.02, stop_lon: -9.1 })));
B.batchInsertRoutes([{ route_id: 'cm:1000', feed_id: 'carris_metropolitana', route_short_name: '1000', route_long_name: '1000', route_type: 3 }]);
const trips = [], sts = [];
for (let m = 10 * 60; m < 14 * 60; m += 10) {
  const t = `cmh:1000:${m}`;
  trips.push({ trip_id: t, feed_id: 'cmh', route_id: 'cmh:1000', service_id: 'todos', trip_headsign: 'Z' });
  ['X', 'Y', 'Z'].forEach((n, i) => sts.push({ feed_id: 'cmh', trip_id: t, stop_id: `cmh:${n}`, arrival_secs: (m + i * 10) * 60, departure_secs: (m + i * 10) * 60, stop_sequence: i + 1 }));
}
B.batchInsertTrips(trips); B.batchInsertStopTimes(sts);
for (let i = 0; i < 400 && !I.indicePronto(); i++) await new Promise((r) => setTimeout(r, 50));
ok('o motor em memória ficou pronto', !!I.indicePronto(), I.estadoIndice);

// Previsões às 12:00: o das 11:50 vai na Y com 4 min de atraso (passa às 12:04); o das 12:00 sai da X com 2 min (12:02);
// o das 11:40 já só tem a Z com 1 min (12:01); o das 13:50 (sai daqui a quase 2 h) não conta
ficheiroCm = ficheiroRt([
  { id: '1000:710', paragens: [{ seq: 2, paragem: 'Y', hora: hora(12, 4) }, { seq: 3, paragem: 'Z', hora: hora(12, 14) }] },
  { id: '1000:720', paragens: [{ seq: 1, paragem: 'X', hora: hora(12, 2) }, { seq: 2, paragem: 'Y', hora: hora(12, 12) }] },
  { id: '1000:700', paragens: [{ seq: 3, paragem: 'Z', hora: hora(12, 1) }] },
  { id: '1000:830', paragens: [{ seq: 1, paragem: 'X', hora: hora(13, 50) }] },
], hora(12, 0));
await RT.atualizarTempoReal(3000);
const agora = DateTime.fromJSDate(AGORA).setZone('Europe/Lisbon');
const am = A.amostrasAgora(agora);
const atrasos = am.map((x) => x.atrasoS).sort((a, b) => a - b);
ok('[medição] uma amostra por viagem a andar (a que sai daqui a 2 h não conta)', am.length === 3, JSON.stringify(am));
ok('[medição] o atraso é o da próxima paragem (1, 2 e 4 min)', JSON.stringify(atrasos) === JSON.stringify([60, 120, 240]), JSON.stringify(atrasos));
ok('[medição] cada amostra traz o feed e a linha', am.every((x) => x.feed === 'cmh' && x.linha === 'cmh:1000'), JSON.stringify(am[0]));

// Sem medições: a janela por omissão (2 min)
ok('[janela] sem medições, 2 min', A.janelaTalvez('cmh', agora) === A.JANELA_SEM_DADOS_S, String(A.janelaTalvez('cmh', agora)));

// 400 amostras da Carris Metropolitana às 12h: 40% com 4+ min de atraso → janela de 4 min
const muitas = [];
for (let i = 0; i < 400; i++) muitas.push({ feed: 'cmh', linha: 'cmh:1000', atrasoS: i < 160 ? 250 : i < 240 ? 90 : 10 });
A.registarAmostras(muitas, agora.minus({ days: 1 }));
ok('[janela] 40% com 4+ min de atraso: janela de 4 min', A.janelaTalvez('cmh', agora) === 240, String(A.janelaTalvez('cmh', agora)));
ok('[janela] a hora conta (às 3 da manhã não há medições: 2 min)', A.janelaTalvez('cmh', agora.set({ hour: 3 })) === A.JANELA_SEM_DADOS_S, String(A.janelaTalvez('cmh', agora.set({ hour: 3 }))));
// Um operador sem previsões (ex.: STCP) usa o que se mede nos outros
ok('[janela] operador sem previsões usa os outros', A.janelaTalvez('stcp', agora) === 240, String(A.janelaTalvez('stcp', agora)));
// Medições com mais de 14 dias não contam
const velhas = [];
for (let i = 0; i < 400; i++) velhas.push({ feed: 'unirh', linha: 'unirh:1', atrasoS: 0 });
A.registarAmostras(velhas, agora.minus({ days: 20 }));
ok('[janela] medições com mais de 14 dias não contam', A.janelaTalvez('unirh', agora) === 240, String(A.janelaTalvez('unirh', agora)));
// Autocarros que vêm a horas: sem janela (não se diz "pode ainda não ter passado")
const pontuais = [];
for (let i = 0; i < 400; i++) pontuais.push({ feed: 'tub_braga', linha: 'tub_braga:7', atrasoS: i < 40 ? 70 : 0 });
A.registarAmostras(pontuais, agora.minus({ days: 2 }));
ok('[janela] operador pontual (10% com 1+ min): sem janela', A.janelaTalvez('tub_braga', agora) === 0, String(A.janelaTalvez('tub_braga', agora)));
ok('[janela] o cálculo: 50% com 2+ min, 36% com 3+, 20% com 4+ → 3 min',
  A.janelaDe([{ minuto: 0, n: 30 }, { minuto: 1, n: 20 }, { minuto: 2, n: 14 }, { minuto: 3, n: 16 }, { minuto: 4, n: 20 }]) === 180);
ok('[janela] nunca mais de 5 min', A.janelaDe([{ minuto: 12, n: 100 }]) === 300);
ok('[resumo] o resumo por operador funciona', A.resumoAtrasos(30).length >= 2, JSON.stringify(A.resumoAtrasos(30)));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
