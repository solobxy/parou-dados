// O planeador tem de dar o que uma pessoa que conhece a zona escolheria, não só o que chega um minuto antes.
//
// Caso real (Parque Nascente → Parque Maia, Porto): quem conhece a zona desce à estação da Levada e vai só de metro (F e
// depois C). A PAROU mostrava, ao domingo, só "autocarro 205 + metro C" (o metro sozinho chegava mais tarde e era descartado
// como "pior em tudo") e, à semana, "autocarro + comboio + autocarro, 21 min a pé" em primeiro e com "Mais rápido", à frente
// de "metro F + C, 6 min a pé" que chega 6 min depois.
//
// Regras que isto garante:
//  1. Um percurso sem autocarros (só metro, comboio, barco) não é descartado por um com autocarro que chega antes, desde que
//     não obrigue a andar muito mais nem a mais transbordos.
//  2. A lista vem pela "melhor opção" (tempo de porta a porta mais o esforço: minutos a pé, transbordos, autocarros), não só
//     pela hora de chegada; a que chega primeiro continua marcada como "Mais rápido".
// Uso: APP=caminho-da-app tsx auditoria/planeador-preferencias.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-pref-'));
process.env.PAROU_DATA_DIR = dir; // tem de ser antes de importar a app
const caminho = process.env.APP || '../app';
const B = await import(`${caminho}/src/server/db/gtfsDatabase.ts`);
const P = await import(`${caminho}/src/server/planeador.ts`);
const I = await import(`${caminho}/src/server/planeadorIndice.ts`);
const U = await import(`${caminho}/src/utils/escolhaOpcoes.ts`);

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const AGORA = new Date('2026-10-14T12:00:00+01:00'); // quarta-feira, meio-dia em Lisboa
const FEEDS = {
  bus: { id: 'bus_p', mode: 'Autocarro', nome: 'Autocarros P' },
  metro: { id: 'metro_p', mode: 'Metro', nome: 'Metro P' },
  cp: { id: 'cp_p', mode: 'Comboio', nome: 'Comboios P' },
};
B.getDatabase().exec('CREATE TABLE IF NOT EXISTS stop_routes (feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0, stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id))');
for (const f of Object.values(FEEDS)) {
  B.upsertFeed({ id: f.id, operator_name: f.nome, mode: f.mode, feed_type: 'gtfs', source_origin: 'seed', url: '', status: 'OK', progress: 'OK', lines_count: 1, stops_count: 1, trips_count: 1, realtime_entities: 'Nenhum' });
  B.batchInsertCalendar([{ feed_id: f.id, service_id: 'todos', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: '20200101', end_date: '20991231' }]);
}
const KM_LAT = 1 / 111, KM_LON = 1 / 84;
const ponto = (c, dkmN, dkmE) => ({ lat: c.lat + dkmN * KM_LAT, lon: c.lon + dkmE * KM_LON });
const CIDADE = (n) => ({ lat: 41.15, lon: -8.6 + n * 50 * KM_LON });
const paragens = [];
const novaParagem = (feed, id, nome, p) => { paragens.push({ stop_id: id, feed_id: feed.id, stop_name: nome, stop_lat: p.lat, stop_lon: p.lon }); return id; };
/** Linha com uma viagem a cada `cada` min (a primeira às 05:00 + desfasamento); `ps` = [[paragem, minutos desde a primeira]] */
function linha(feed, tipo, codigo, ps, cada, desfasamento = 0) {
  const rota = `${feed.id}:${codigo}`;
  B.batchInsertRoutes([{ route_id: rota, feed_id: feed.id, route_short_name: codigo, route_long_name: `${codigo} teste`, route_type: tipo }]);
  const trips = [], sts = [];
  for (let m = 5 * 60 + desfasamento; m < 23 * 60 + 50; m += cada) {
    const t = `${rota}:${m}`;
    trips.push({ trip_id: t, feed_id: feed.id, route_id: rota, service_id: 'todos', trip_headsign: 'Fim' });
    ps.forEach(([id, min], i) => sts.push({ feed_id: feed.id, trip_id: t, stop_id: id, arrival_secs: (m + min) * 60, departure_secs: (m + min) * 60, stop_sequence: i + 1 }));
  }
  B.batchInsertTrips(trips);
  B.batchInsertStopTimes(sts);
}

const CENARIOS = {};
// 1. Domingo: "autocarro 205 + metro C" chega 15 min antes de "metro F + metro C", com os mesmos minutos a pé e transbordos
{
  const c = CIDADE(0);
  const bO = novaParagem(FEEDS.bus, 'b0:O', 'Vila Cova', ponto(c, 0.05, 0));
  const bX = novaParagem(FEEDS.bus, 'b0:X', 'Senhora da Penha', ponto(c, 3, -3));
  const mL = novaParagem(FEEDS.metro, 'm0:L', 'Levada', ponto(c, 0.3, 0));
  const mC = novaParagem(FEEDS.metro, 'm0:C', 'Campanhã', ponto(c, 1, -1.5));
  const mN = novaParagem(FEEDS.metro, 'm0:N', 'NorteShopping', ponto(c, 3.2, -3));
  const mP = novaParagem(FEEDS.metro, 'm0:P', 'Parque Maia', ponto(c, 6, -6));
  linha(FEEDS.bus, 3, '205', [[bO, 0], [bX, 25]], 20, 3);
  linha(FEEDS.metro, 1, 'F', [[mL, 0], [mC, 10]], 20, 8);
  linha(FEEDS.metro, 1, 'C', [[mC, 0], [mN, 18], [mP, 30]], 15, 1);
  CENARIOS.domingo = { O: ponto(c, 0, 0), D: ponto(c, 6.05, -6) };
}
// 2. Semana: dois autocarros (20 min a pé, 1 transbordo) chegam uns minutos antes do metro direto (5 min a pé)
{
  const c = CIDADE(1);
  const bA = novaParagem(FEEDS.bus, 'b1:A', 'Rua Longe', ponto(c, 0.6, 0));
  const bB = novaParagem(FEEDS.bus, 'b1:B', 'Cruzamento', ponto(c, 3, -3));
  const bB2 = novaParagem(FEEDS.bus, 'b1:B2', 'Cruzamento (outro lado)', ponto(c, 3.05, -3));
  const bD = novaParagem(FEEDS.bus, 'b1:D', 'Fim do autocarro', ponto(c, 6, -6));
  const mA = novaParagem(FEEDS.metro, 'm1:A', 'Estação ao lado', ponto(c, 0.25, 0));
  const mZ = novaParagem(FEEDS.metro, 'm1:Z', 'Estação do destino', ponto(c, 6.45, -6));
  linha(FEEDS.bus, 3, 'L1', [[bA, 0], [bB, 10]], 10, 3);
  linha(FEEDS.bus, 3, 'L2', [[bB2, 0], [bD, 5]], 10, 8);
  linha(FEEDS.metro, 1, 'M', [[mA, 0], [mZ, 42]], 10, 5);
  CENARIOS.semana = { O: ponto(c, 0, 0), D: ponto(c, 6.5, -6) };
}
B.batchInsertStops(paragens);
for (let i = 0; i < 400 && !I.indicePronto(); i++) await new Promise((r) => setTimeout(r, 50));
ok('o motor em memória do planeador ficou pronto', !!I.indicePronto(), I.estadoIndice);

const modos = (o) => o.legs.filter((l) => l.mode === 'TRANSIT').map((l) => l.transportMode);
const soMetro = (o) => o.id !== 'a-pe' && modos(o).length > 0 && modos(o).every((m) => m === 'Metro');
const resumo = (r) => r.routes.map((o) => `${o.id === 'a-pe' ? 'a pé' : modos(o).join('>')} ${o.totalDurationMinutes}min pé${o.walkingMinutes} [${o.badgeLabel}]`).join(' | ');
const plano = (n) => P.planearViagem(CENARIOS[n].O.lat, CENARIOS[n].O.lon, CENARIOS[n].D.lat, CENARIOS[n].D.lon, 'Destino', AGORA);

{
  const r = await plano('domingo');
  const bus = r.routes.find((o) => modos(o).includes('Autocarro') && modos(o).includes('Metro'));
  const metro = r.routes.find(soMetro);
  ok('[domingo] autocarro + metro aparece', !!bus, resumo(r));
  ok('[domingo] o percurso só de metro (F + C) também aparece', !!metro, resumo(r));
  if (bus && metro) ok('[domingo] o cenário é o difícil: o só de metro chega mais tarde', metro.totalDurationMinutes > bus.totalDurationMinutes, `${metro.totalDurationMinutes} > ${bus.totalDurationMinutes}`);
  if (bus) ok('[domingo] o que chega antes está marcado "Mais rápido"', /^Mais rápido/.test(bus.badgeLabel), bus.badgeLabel);
}
{
  const r = await plano('semana');
  const bus = r.routes.find((o) => o.id !== 'a-pe' && modos(o).every((m) => m === 'Autocarro'));
  const metro = r.routes.find(soMetro);
  ok('[semana] os dois autocarros aparecem', !!bus, resumo(r));
  ok('[semana] o metro direto aparece', !!metro, resumo(r));
  if (bus && metro) ok('[semana] o cenário é o difícil: o metro chega depois dos autocarros', metro.totalDurationMinutes > bus.totalDurationMinutes, `${metro.totalDurationMinutes} > ${bus.totalDurationMinutes}`);
  ok('[semana] o metro direto vem em primeiro (melhor opção)', r.routes[0] === metro, resumo(r));
  if (metro) ok('[semana] o metro está marcado "Melhor opção"', metro.badgeLabel === 'Melhor opção' && metro.highlight === 'melhor', `${metro.badgeLabel} ${metro.highlight}`);
  if (bus) ok('[semana] os autocarros, que chegam antes, ficam marcados "Mais rápido"', /^Mais rápido/.test(bus.badgeLabel) && bus.highlight === 'mais_rapido', `${bus.badgeLabel} ${bus.highlight}`);
}

// ---------------------------------------------------------------- a mesma regra na app (ordem da lista)
const opc = (id, min, modosLeg, pe, extra = {}) => ({
  id, type: 'fastest', title: id, badgeLabel: '', totalDurationMinutes: min, departureTime: '12:00', arrivalTime: '12:30', walkingDistanceMeters: 0, walkingMinutes: pe,
  transfersCount: Math.max(0, modosLeg.length - 1), realtimeStatus: 'PROGRAMADO', realtimeLabel: '', relevantAlerts: [],
  legs: modosLeg.map((m, i) => ({ mode: 'TRANSIT', transportMode: m, lineCode: `L${i}`, instruction: '' })), ...extra,
});
ok('[app] existe a regra comum de ordenação (custoDaOpcao)', typeof U.custoDaOpcao === 'function');
if (typeof U.custoDaOpcao === 'function') {
  const c = U.custoDaOpcao;
  ok('[app] autocarro + comboio + autocarro com 21 min a pé custa mais do que metro + metro com 6 min a pé (6 min depois)',
    c(opc('x', 55, ['Autocarro', 'Comboio', 'Autocarro'], 21)) > c(opc('m', 61, ['Metro', 'Metro'], 6)));
  ok('[app] um autocarro direto 8 min mais rápido continua à frente de um metro com transbordo',
    c(opc('b', 30, ['Autocarro'], 4)) < c(opc('m', 38, ['Metro', 'Metro'], 4)));
  ok('[app] com o mesmo esforço, ganha a que chega primeiro', c(opc('a', 30, ['Metro'], 3)) < c(opc('b', 31, ['Metro'], 3)));
  ok('[app] ir a pé conta só o tempo', c(opc('a-pe', 12, [], 12)) === 12);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* sem importância */ }
process.exit(falhas ? 1 : 0);
