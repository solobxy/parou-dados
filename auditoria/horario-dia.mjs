// Horários dos próximos dias (pedido de um passageiro, 20/11/2026: «não consigo ver os horários de amanhã»).
// A janela de cada linha passa a deixar escolher o dia (hoje, amanhã e os 5 seguintes) numa paragem.
// Testa a função do servidor com uma base pequena:
//  - dia útil e sábado com horários diferentes; dia sem serviço; viagem depois da meia-noite (fica no fim, como 00:15);
//  - não conta a última paragem de cada viagem nem paragens só de saída (pickup_type = 1);
//  - destinos diferentes na mesma linha vêm com o destino de cada partida;
//  - dia ainda não publicado pelo operador: usa o mesmo dia da semana mais perto e diz «previsto»;
//  - última paragem do sentido e linha que não passa ali têm estado próprio;
//  - datas fora do intervalo (antes de ontem, mais de 14 dias à frente, texto inválido) são recusadas.
// Uso: APP=<pasta da app> tsx auditoria/horario-dia.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const APP = process.env.APP || '../parou';
process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'horario-dia-'));
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };

const B = await import(path.join(APP, 'src/server/db/gtfsDatabase.ts'));
const db = B.getDatabase();
db.exec('CREATE TABLE IF NOT EXISTS stop_routes (stop_id TEXT, route_id TEXT, direction_id INTEGER, stop_sequence INTEGER)');
const { DateTime } = await import('luxon');

// Base: linha t:7 com 3 paragens (A → B → C) no sentido 0 e o inverso no sentido 1.
// Serviço DU (seg–sex) até 30/11/2026; SAB (sábados) até 30/11/2026; feriado 1/12 sem nada publicado depois de 30/11.
db.prepare(`INSERT INTO feeds (id, operator_name, mode, feed_type, source_origin, url, status) VALUES ('t', 'Teste', 'Autocarro', 'gtfs', 'seed', 'x', 'OK')`).run();
db.prepare(`INSERT INTO routes (route_id, feed_id, route_short_name, route_long_name) VALUES ('t:7', 't', '7', 'A - C')`).run();
for (const [id, nome] of [['t:A', 'Paragem A'], ['t:B', 'Paragem B'], ['t:C', 'Paragem C']]) {
  db.prepare(`INSERT INTO stops (stop_id, feed_id, stop_name, stop_lat, stop_lon) VALUES (?, 't', ?, 41.1, -8.6)`).run(id, nome);
}
db.prepare(`INSERT INTO calendar VALUES ('t', 'DU', 1,1,1,1,1,0,0, '20261101', '20261130')`).run();
db.prepare(`INSERT INTO calendar VALUES ('t', 'SAB', 0,0,0,0,0,1,0, '20261101', '20261130')`).run();
const hora = (h, m) => h * 3600 + m * 60;
const viagens = [
  // id, serviço, sentido, destino, partida em A
  ['du1', 'DU', 0, 'Paragem C', hora(7, 5)], ['du2', 'DU', 0, 'Paragem C', hora(7, 35)], ['du3', 'DU', 0, 'Paragem C via Escola', hora(8, 10)],
  ['du4', 'DU', 0, 'Paragem C', hora(23, 50)], // passa em B às 24:05 (00:05 do dia seguinte, ainda deste dia de serviço)
  ['sab1', 'SAB', 0, 'Paragem C', hora(9, 0)], ['sab2', 'SAB', 0, 'Paragem C', hora(13, 0)],
  ['volta1', 'DU', 1, 'Paragem A', hora(8, 0)],
];
for (const [id, sv, dir, dest, ini] of viagens) {
  db.prepare(`INSERT INTO trips (trip_id, feed_id, route_id, service_id, trip_headsign, direction_id) VALUES (?, 't', 't:7', ?, ?, ?)`).run(`t:${id}`, sv, dest, dir);
  const seq = dir === 0 ? ['t:A', 't:B', 't:C'] : ['t:C', 't:B', 't:A'];
  seq.forEach((p, i) => db.prepare(`INSERT INTO stop_times (feed_id, trip_id, stop_id, arrival_secs, departure_secs, stop_sequence, pickup_type) VALUES ('t', ?, ?, ?, ?, ?, ?)`)
    .run(`t:${id}`, p, ini + i * 900, ini + i * 900, i + 1, id === 'du2' && p === 't:B' ? 1 : 0));
}

const H = await import(path.join(APP, 'src/server/horarioDoDia.ts'));
const dia = (iso) => DateTime.fromISO(iso, { zone: 'Europe/Lisbon' });

// Dia útil (sexta 20/11) em B: 07:20, 08:25 (via Escola) e 00:05 do fim do serviço; 07:50 não (só saída)
let r = H.horarioDoDia('t:7', 't:B', 0, dia('2026-11-20'));
ok('dia útil: estado ok e não previsto', r.estado === 'ok' && r.previsto === false, JSON.stringify({ estado: r.estado, previsto: r.previsto }));
ok('dia útil: 07:20, 08:25 e 00:05 por esta ordem', JSON.stringify(r.partidas.map((p) => p.hora)) === JSON.stringify(['07:20', '08:25', '00:05']), JSON.stringify(r.partidas.map((p) => p.hora)));
ok('não conta a partida onde não se pode entrar (pickup_type 1)', !r.partidas.some((p) => p.hora === '07:50'));
ok('cada partida traz o destino (variante «via Escola»)', r.partidas.find((p) => p.hora === '08:25')?.destino === 'Paragem C via Escola');

// Sábado 21/11 em A: 09:00 e 13:00
r = H.horarioDoDia('t:7', 't:A', 0, dia('2026-11-21'));
ok('sábado: 09:00 e 13:00', JSON.stringify(r.partidas.map((p) => p.hora)) === JSON.stringify(['09:00', '13:00']), JSON.stringify(r.partidas.map((p) => p.hora)));

// Domingo 22/11: publicado, sem serviço
r = H.horarioDoDia('t:7', 't:A', 0, dia('2026-11-22'));
ok('domingo sem serviço: sem partidas (e não previsto)', r.estado === 'sem-partidas' && r.partidas.length === 0 && r.previsto === false, JSON.stringify(r));

// Quinta 3/12: o operador ainda não publicou; usa a quinta mais perto publicada (26/11) e diz previsto
r = H.horarioDoDia('t:7', 't:A', 0, dia('2026-12-03'));
ok('dia por publicar: previsto, com a quinta 26/11 como referência', r.previsto === true && r.dataReferencia === '2026-11-26', JSON.stringify({ previsto: r.previsto, ref: r.dataReferencia }));
ok('dia por publicar: horário de dia útil', JSON.stringify(r.partidas.map((p) => p.hora)) === JSON.stringify(['07:05', '07:35', '08:10', '23:50']), JSON.stringify(r.partidas.map((p) => p.hora)));

// Última paragem do sentido (C no sentido 0): estado próprio
r = H.horarioDoDia('t:7', 't:C', 0, dia('2026-11-20'));
ok('última paragem do sentido: estado «ultima-paragem»', r.estado === 'ultima-paragem', r.estado);
// Sentido 1 em C (aí é a primeira): 08:00
r = H.horarioDoDia('t:7', 't:C', 1, dia('2026-11-20'));
ok('outro sentido: 08:00 em C', JSON.stringify(r.partidas.map((p) => p.hora)) === JSON.stringify(['08:00']), JSON.stringify(r.partidas.map((p) => p.hora)));
// Paragem por onde a linha não passa
r = H.horarioDoDia('t:7', 't:Z', 0, dia('2026-11-20'));
ok('paragem fora da linha: estado «sem-dados»', r.estado === 'sem-dados', r.estado);

// Datas pedidas: só de ontem até 14 dias à frente
const hoje = dia('2026-11-20');
ok('data de amanhã aceite', H.lerDataPedida('2026-11-21', hoje)?.toISODate() === '2026-11-21');
ok('data de ontem aceite', H.lerDataPedida('2026-11-19', hoje)?.toISODate() === '2026-11-19');
ok('anteontem recusado', H.lerDataPedida('2026-11-18', hoje) === null);
ok('15 dias à frente recusado', H.lerDataPedida('2026-12-05', hoje) === null);
ok('texto inválido recusado', H.lerDataPedida('amanha', hoje) === null && H.lerDataPedida(undefined, hoje) === null && H.lerDataPedida('2026-13-40', hoje) === null);
console.log(falhas ? `${falhas} FALHOU` : 'tudo OK');
process.exit(falhas ? 1 : 0);
