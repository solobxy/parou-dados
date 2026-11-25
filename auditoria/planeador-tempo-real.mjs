// Garante que o planeador de viagens usa o TEMPO REAL no cálculo, e não só o horário.
//
// O problema que isto impede: o planeador propunha autocarros suprimidos, transbordos que já não davam por causa de um
// atraso e autocarros que já tinham passado na paragem (o horário dizia que ainda vinham). É a queixa mais repetida de quem
// usa as apps de transportes ("o autocarro aparecia e nunca passou").
//
// Monta uma base GTFS pequena com as funções da própria app (Carris Metropolitana como na produção: viagens "cmh:" com
// paragens "cm:"; e TUB) e serve previsões GTFS-Realtime feitas aqui (protobuf a sério) no lugar da TML e da TUB.
// Uso: APP=caminho-da-app tsx auditoria/planeador-tempo-real.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-rt-'));
process.env.PAROU_DATA_DIR = dir; // tem de ser antes de importar a app
const caminho = process.env.APP || '../app';

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

// ---------------------------------------------------------------- GTFS-Realtime (protobuf) feito à mão
const varint = (n) => { const o = []; let v = BigInt.asUintN(64, BigInt(n)); do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; o.push(b); } while (v); return o; };
const campoV = (n, v) => [...varint(n * 8), ...varint(v)];
const campoB = (n, bytes) => [...varint(n * 8 + 2), ...varint(bytes.length), ...bytes];
const campoT = (n, s) => campoB(n, [...Buffer.from(s, 'utf8')]);
/** viagens: [{ id, cancelada?, paragens: [{ seq, paragem, hora? (epoch), atraso?, salta? }] }] */
function ficheiroRt(viagens, horaFicheiro) {
  const out = [...campoB(1, [...campoT(1, '2.0'), ...campoV(3, horaFicheiro)])];
  viagens.forEach((v, i) => {
    const trip = [...campoT(1, v.id), ...(v.cancelada ? campoV(4, 3) : [])];
    const tu = [...campoB(1, trip)];
    for (const s of v.paragens || []) {
      const ev = [...(s.atraso !== undefined ? campoV(1, s.atraso) : []), ...(s.hora ? campoV(2, s.hora) : [])];
      tu.push(...campoB(2, [...campoV(1, s.seq), ...(ev.length ? campoB(2, ev) : []), ...campoT(4, s.paragem), ...(s.salta ? campoV(5, 1) : [])]));
    }
    out.push(...campoB(2, [...campoT(1, `e${i}`), ...campoB(3, tu)]));
  });
  return new Uint8Array(out);
}

// ---------------------------------------------------------------- previsões servidas no lugar da TML e da TUB
const RT = await import(`${caminho}/src/server/tempoRealPlaneador.ts`);
const TUB = await import(`${caminho}/src/server/tubTempoReal.ts`);
let ficheiroCm = new Uint8Array(0), ficheiroTub = new Uint8Array(0);
const pedidos = { cm: 0, tub: 0 };
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u === RT.URL_PREVISOES_CM) { pedidos.cm++; return new Response(ficheiroCm, { status: 200 }); }
  if (u === TUB.URL_VIAGENS_TUB) { pedidos.tub++; return new Response(ficheiroTub, { status: 200 }); }
  if (u === TUB.URL_POSICOES_TUB) return new Response(ficheiroRt([], Math.floor(Date.now() / 1000)), { status: 200 });
  return new Response('sem rede no teste', { status: 503 });
};

const B = await import(`${caminho}/src/server/db/gtfsDatabase.ts`);
const P = await import(`${caminho}/src/server/planeador.ts`);
const I = await import(`${caminho}/src/server/planeadorIndice.ts`);

// ---------------------------------------------------------------- base de teste
const AGORA = new Date('2026-10-14T12:00:00+01:00'); // quarta-feira, meio-dia em Lisboa
const M0 = Math.floor(new Date('2026-10-14T00:00:00+01:00').getTime() / 1000); // meia-noite do dia de serviço
B.getDatabase().exec('CREATE TABLE IF NOT EXISTS stop_routes (feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0, stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id))');
const feed = (id, nome) => B.upsertFeed({ id, operator_name: nome, mode: 'Autocarro', feed_type: 'gtfs', source_origin: 'seed', url: '', status: 'OK', progress: 'OK', lines_count: 1, stops_count: 1, trips_count: 1, realtime_entities: 'Nenhum' });
feed('carris_metropolitana', 'Carris Metropolitana');
feed('cmh', 'Carris Metropolitana');
feed('tub_braga', 'TUB');
for (const f of ['cmh', 'tub_braga']) B.batchInsertCalendar([{ feed_id: f, service_id: 'todos', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: '20200101', end_date: '20991231' }]);

const KM_LAT = 1 / 111, KM_LON = 1 / 84;
const CIDADE = (n) => ({ lat: 41.15, lon: -8.6 + n * 50 * KM_LON });
const ponto = (c, dkmN, dkmE) => ({ lat: c.lat + dkmN * KM_LAT, lon: c.lon + dkmE * KM_LON });
const paragens = [];
/** rede "cm" (Carris Metropolitana: paragem cm:X na API, cmh:X nos horários) ou "tub" */
function paragem(rede, n, nome, p) {
  const id = `${n}${nome}`;
  paragens.push({ stop_id: rede === 'cm' ? `cm:${id}` : `tub_braga:${id}`, feed_id: rede === 'cm' ? 'carris_metropolitana' : 'tub_braga', stop_name: `${nome} ${n}`, stop_lat: p.lat, stop_lon: p.lon });
  return id;
}
/** Linha com uma viagem a cada `cada` min (das 05:00+desf às 23:00); ps = [[paragem, minutos]]. Devolve o código da viagem de cada hora. */
function linha(rede, codigo, ps, cada, desf = 0) {
  const feedId = rede === 'cm' ? 'cmh' : 'tub_braga';
  const rota = rede === 'cm' ? `cmh:${codigo}` : `tub_braga:${codigo}`;
  B.batchInsertRoutes([rede === 'cm'
    ? { route_id: `cm:${codigo}`, feed_id: 'carris_metropolitana', route_short_name: codigo, route_long_name: `${codigo} teste`, route_type: 3 }
    : { route_id: rota, feed_id: feedId, route_short_name: codigo, route_long_name: `${codigo} teste`, route_type: 3 }]);
  const trips = [], sts = [];
  for (let m = 5 * 60 + desf; m < 23 * 60; m += cada) {
    const t = `${rota}:${m}`;
    trips.push({ trip_id: t, feed_id: feedId, route_id: rota, service_id: 'todos', trip_headsign: 'Fim' });
    ps.forEach(([id, min], i) => sts.push({ feed_id: feedId, trip_id: t, stop_id: rede === 'cm' ? `cmh:${id}` : `tub_braga:${id}`, arrival_secs: (m + min) * 60, departure_secs: (m + min) * 60, stop_sequence: i + 1 }));
  }
  B.batchInsertTrips(trips);
  B.batchInsertStopTimes(sts);
  return (hh, mm) => `${codigo}:${hh * 60 + mm}`; // código como vem no GTFS-Realtime (sem o prefixo da base)
}
const hora = (hh, mm) => M0 + (hh * 60 + mm) * 60;

const C = {};
// 0) Viagem suprimida (Carris Metropolitana): o 1A das 12:05 foi suprimido; o 1B (mais lento) passa a ser o melhor
{
  const c = CIDADE(0), O = ponto(c, 0, 0), D = ponto(c, 6, 0);
  const a = paragem('cm', 0, 'O', ponto(c, 0.05, 0)), b = paragem('cm', 0, 'D', ponto(c, 6.05, 0));
  const a2 = paragem('cm', 0, 'O2', ponto(c, 0.07, 0.02)), b2 = paragem('cm', 0, 'D2', ponto(c, 6.07, 0.02));
  C.suprimida = { O, D, v1A: linha('cm', '1A', [[a, 0], [b, 20]], 15, 5), v1B: linha('cm', '1B', [[a2, 0], [b2, 26]], 15, 7) };
}
// 1) Atraso (TUB): o 7 das 12:05 vai com 12 min de atraso; o 9 das 12:08 chega primeiro
{
  const c = CIDADE(1), O = ponto(c, 0, 0), D = ponto(c, 5, 0);
  const a = paragem('tub', 1, 'O', ponto(c, 0.05, 0)), b = paragem('tub', 1, 'D', ponto(c, 5.05, 0));
  const a2 = paragem('tub', 1, 'O2', ponto(c, 0.07, 0.02)), b2 = paragem('tub', 1, 'D2', ponto(c, 5.07, 0.02));
  C.atraso = { O, D, v7: linha('tub', '7', [[a, 0], [b, 15]], 10, 5), v9: linha('tub', '9', [[a2, 0], [b2, 20]], 10, 8) };
}
// 2) Atraso pequeno (TUB): o 17 das 12:05 vai com 3 min de atraso; continua a ser o melhor, com a hora em direto
{
  const c = CIDADE(2), O = ponto(c, 0, 0), D = ponto(c, 5, 0);
  const a = paragem('tub', 2, 'O', ponto(c, 0.05, 0)), b = paragem('tub', 2, 'D', ponto(c, 5.05, 0));
  C.atrasoPequeno = { O, D, v17: linha('tub', '17', [[a, 0], [b, 15]], 30, 5) };
}
// 3) Transbordo perdido (Carris Metropolitana): o A das 12:05 chega ao H com 6 min de atraso e já não apanha o B das 12:24
{
  const c = CIDADE(3), O = ponto(c, 0, 0), D = ponto(c, 8, 0);
  const a = paragem('cm', 3, 'O', ponto(c, 0.05, 0)), h = paragem('cm', 3, 'H', ponto(c, 4, 0)), h2 = paragem('cm', 3, 'H2', ponto(c, 4.03, 0.01));
  const d = paragem('cm', 3, 'D', ponto(c, 8.05, 0)), ao = paragem('cm', 3, 'OC', ponto(c, 0.07, 0.02)), ad = paragem('cm', 3, 'DC', ponto(c, 8.07, 0.02));
  C.transbordo = { O, D, vA: linha('cm', 'A3', [[a, 0], [h, 15]], 30, 5), vB: linha('cm', 'B3', [[h2, 0], [d, 10]], 30, 24), vC: linha('cm', 'C3', [[ao, 0], [ad, 50]], 60, 10) };
}
// 4) Já passou (TUB): o 27 das 12:03 já saiu da paragem de origem (só há previsão para a paragem seguinte, adiantado)
{
  const c = CIDADE(4), O = ponto(c, 0, 0), D = ponto(c, 5, 0);
  const a = paragem('tub', 4, 'O', ponto(c, 0.05, 0)), b = paragem('tub', 4, 'D', ponto(c, 5.05, 0));
  C.jaPassou = { O, D, v27: linha('tub', '27', [[a, 0], [b, 15]], 10, 3) };
}
B.batchInsertStops(paragens);

for (let i = 0; i < 400 && !I.indicePronto(); i++) await new Promise((r) => setTimeout(r, 50));
ok('o motor em memória do planeador ficou pronto', !!I.indicePronto(), I.estadoIndice);

const agoraS = () => Math.floor(Date.now() / 1000);
const previsoesCm = (horaFicheiro) => ficheiroRt([
  { id: C.suprimida.v1A(12, 5), cancelada: true },
  { id: C.transbordo.vA(12, 5), paragens: [{ seq: 1, paragem: '3O', hora: hora(12, 11) }, { seq: 2, paragem: '3H', hora: hora(12, 26) }] },
], horaFicheiro);
const previsoesTub = () => ficheiroRt([
  { id: C.atraso.v7(12, 5), paragens: [{ seq: 1, paragem: '1O', hora: hora(12, 17) }, { seq: 2, paragem: '1D', hora: hora(12, 32) }] },
  { id: C.atrasoPequeno.v17(12, 5), paragens: [{ seq: 1, paragem: '2O', atraso: 180 }] },
  { id: C.jaPassou.v27(12, 3), paragens: [{ seq: 2, paragem: '4D', hora: hora(12, 16) }] },
], agoraS());

const transito = (o) => o.legs.filter((l) => l.mode === 'TRANSIT');
const resumo = (r) => r.routes.map((o) => `${o.id === 'a-pe' ? 'a pé' : transito(o).map((l) => `${l.lineCode}@${l.departureTime}${l.isRealtime ? '*' : ''}`).join('>')}→${o.arrivalTime}`).join(' | ');
const plano = (nome) => P.planearViagem(C[nome].O.lat, C[nome].O.lon, C[nome].D.lat, C[nome].D.lon, 'Destino', AGORA);
const minutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const maisCedo = (r) => r.routes.filter((o) => o.id !== 'a-pe').reduce((a, b) => (!a || minutos(b.arrivalTime) < minutos(a.arrivalTime) ? b : a), null);

// ---------------------------------------------------------------- 0) sem previsões: o horário (controlo)
ficheiroCm = ficheiroRt([], agoraS()); ficheiroTub = ficheiroRt([], agoraS());
RT.limparTempoRealPlaneador();
{
  const r = await plano('suprimida');
  ok('[controlo] sem previsões, o 1A das 12:05 é o melhor', maisCedo(r)?.id.includes(`cmh:${C.suprimida.v1A(12, 5)}`), resumo(r));
  const t = await plano('transbordo');
  ok('[controlo] sem previsões, A3 + B3 das 12:24 é o melhor', transito(maisCedo(t) || { legs: [] }).map((l) => `${l.lineCode}@${l.departureTime}`).join('>') === 'A3@12:05>B3@12:24', resumo(t));
  const p = await plano('jaPassou');
  ok('[controlo] sem previsões, o 27 das 12:03 é o melhor', transito(maisCedo(p) || { legs: [] })[0]?.departureTime === '12:03', resumo(p));
  ok('[controlo] sem previsões, nada aparece como "em direto"', !r.routes.some((o) => o.realtimeStatus === 'TEMPO_REAL'));
}

// ---------------------------------------------------------------- com previsões frescas
ficheiroCm = previsoesCm(agoraS()); ficheiroTub = previsoesTub();
RT.limparTempoRealPlaneador();
await new Promise((r) => setTimeout(r, 12_000)); // a TUB guarda o último ficheiro 11 s: espera pelo novo
{
  const r = await plano('suprimida');
  ok('[suprimida] o 1A das 12:05 (suprimido) não aparece', !r.routes.some((o) => o.id.includes(`cmh:${C.suprimida.v1A(12, 5)}`)), resumo(r));
  const m = maisCedo(r);
  ok('[suprimida] o melhor passa a ser o 1B das 12:07', transito(m || { legs: [] }).map((l) => `${l.lineCode}@${l.departureTime}`).join('>') === '1B@12:07', resumo(r));
}
{
  const r = await plano('atraso');
  const m = maisCedo(r);
  ok('[atraso] o 9 das 12:08 passa a ser o que chega primeiro', transito(m || { legs: [] }).map((l) => `${l.lineCode}@${l.departureTime}`).join('>') === '9@12:08', resumo(r));
  ok('[atraso] o 7 nunca aparece às 12:05 (vai às 12:17)', !r.routes.some((o) => transito(o).some((l) => l.lineCode === '7' && l.departureTime === '12:05')), resumo(r));
}
{
  const r = await plano('atrasoPequeno');
  const m = maisCedo(r);
  const l = transito(m || { legs: [] })[0];
  ok('[atraso pequeno] o 17 sai às 12:08 (hora em direto)', l?.lineCode === '17' && l.departureTime === '12:08' && m.arrivalTime >= '12:23', resumo(r));
  ok('[atraso pequeno] a viagem vem marcada como em direto, com 3 min de atraso', l?.isRealtime === true && l?.atrasoMinutos === 3 && m.realtimeStatus === 'TEMPO_REAL', JSON.stringify({ isRealtime: l?.isRealtime, atraso: l?.atrasoMinutos, estado: m?.realtimeStatus }));
}
{
  const r = await plano('transbordo');
  ok('[transbordo] não propõe o B3 das 12:24 (com o A3 atrasado já não dá)', !r.routes.some((o) => transito(o).some((l) => l.lineCode === 'B3' && l.departureTime === '12:24')), resumo(r));
  const m = maisCedo(r);
  ok('[transbordo] o melhor passa a ser o C3 direto (chega às 13:00 e pouco)', transito(m || { legs: [] }).map((l) => l.lineCode).join('>') === 'C3', resumo(r));
}
{
  const r = await plano('jaPassou');
  ok('[já passou] não manda apanhar o 27 das 12:03, que já saiu da paragem', !r.routes.some((o) => transito(o).some((l) => l.lineCode === '27' && l.departureTime === '12:03')), resumo(r));
  ok('[já passou] o melhor é o 27 das 12:13', transito(maisCedo(r) || { legs: [] })[0]?.departureTime === '12:13', resumo(r));
}
ok('as previsões foram pedidas poucas vezes (um pedido partilhado)', pedidos.cm >= 1 && pedidos.cm <= 3, JSON.stringify(pedidos));

// ---------------------------------------------------------------- previsões velhas (10 min): fica o horário
ficheiroCm = previsoesCm(agoraS() - 600);
RT.limparTempoRealPlaneador();
{
  const r = await plano('suprimida');
  ok('[velhas] com previsões de há 10 min, volta o horário (o 1A das 12:05)', maisCedo(r)?.id.includes(`cmh:${C.suprimida.v1A(12, 5)}`), resumo(r));
}

// ---------------------------------------------------------------- ecrã: o cartão mostra o "em direto"
{
  const fonte = fs.readFileSync(`${caminho}/src/components/OpcaoRota.tsx`, 'utf8');
  ok('[ecrã] o cartão do percurso mostra o sinal de "em direto" na primeira linha', /data-teste="em-direto"/.test(fonte) && /primeira\?\.isRealtime/.test(fonte));
  ok('[ecrã] o passo a passo diz o atraso em direto', /textoDireto\(leg\.atrasoMinutos\)/.test(fonte));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
