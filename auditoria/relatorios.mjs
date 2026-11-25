// Relatórios (relatorios.ts) e horários de cada dia (horariosArquivo.ts): os números saem certos dos dados guardados.
// Uso: APP=pasta-da-app tsx auditoria/relatorios.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-relatorios-'));
process.env.PAROU_DATA_DIR = dir;
process.env.PAROU_PONTUALIDADE = path.join(dir, 'pont');
const caminho = process.env.APP || '../app';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
globalThis.fetch = async () => new Response('sem rede no teste', { status: 503 });
const { DateTime } = createRequire(path.resolve(caminho, 'package.json'))('luxon');
const R = await import(`${caminho}/src/server/relatorios.ts`);
const A = await import(`${caminho}/src/server/atrasosMedidos.ts`);
const H = await import(`${caminho}/src/server/historico.ts`);
const HA = await import(`${caminho}/src/server/horariosArquivo.ts`);
const B = await import(`${caminho}/src/server/db/gtfsDatabase.ts`);
const I = await import(`${caminho}/src/server/planeadorIndice.ts`);
const Z = 'Europe/Lisbon';
const ontem = DateTime.fromISO('2026-11-24T12:00', { zone: Z }); // relatório que acaba a 24/11

// Atrasos: 300 amostras da UNIR a 23/11 às 8h (100 com 6 min), 100 da TUB às 9h (a horas)
const am = []; for (let i = 0; i < 300; i++) am.push({ feed: 'unirh', linha: 'unirh:8019', atrasoS: i < 100 ? 360 : 30 });
A.registarAmostras(am, DateTime.fromISO('2026-11-23T08:10', { zone: Z }));
const tb = []; for (let i = 0; i < 100; i++) tb.push({ feed: 'tub_braga', linha: 'tub_braga:7', atrasoS: 0 });
A.registarAmostras(tb, DateTime.fromISO('2026-11-23T09:10', { zone: Z }));
A.registarAmostras(am, DateTime.fromISO('2026-10-01T08:10', { zone: Z })); // fora da semana
// Pontualidade: dois dias de resumos
fs.mkdirSync(path.join(dir, 'pont', 'dias'), { recursive: true });
const dia = (d, n, ah) => fs.writeFileSync(path.join(dir, 'pont', 'dias', `${d}.json`), JSON.stringify({ dia: d, carris_metropolitana: { passagens: { n, a_horas_pct: ah, atrasado_pct: 30, muito_atrasado_pct: 10, adiantado_pct: 20, mediana_min: 2 } } }));
dia('2026-11-23', 1000, 50); dia('2026-11-24', 3000, 70); dia('2026-11-01', 9999, 0);
// Avisos: uma greve na semana, uma obra antiga já acabada
H.arquivarAvisos([{ id: 'cp:g1', tipo: 'greve', título: 'Greve CP', descrição: 'x', operador: 'CP', start_datetime: '2026-11-24T00:00:00Z', end_datetime: '2026-11-25T23:59:00Z', status: 'Ativo' },
  { id: 'cm:o1', tipo: 'obras', título: 'Obras antigas', descrição: 'x', operador: 'Carris Metropolitana', start_datetime: '2026-09-01T00:00:00Z', end_datetime: '2026-09-10T00:00:00Z', status: 'Terminado' }]);
H.arquivarNoticias([{ id: 'n1', fonte: 'RTP', categoria: 'greve', titulo: 'Greve', url: 'https://x', data: '2026-11-24T10:00:00Z' }]);
// Viagens: semana anterior 100/dia na linha 8019, esta semana 60/dia
const ins = H.baseHistorico().prepare('INSERT INTO horarios_dia (dia, feed, linha, nome, viagens, primeira, ultima) VALUES (?, ?, ?, ?, ?, ?, ?)');
for (let i = 0; i < 14; i++) { const d = DateTime.fromISO('2026-11-11').plus({ days: i }).toFormat('yyyy-MM-dd'); ins.run(d, 'unirh', 'unirh:8019', '8019', d >= '2026-11-18' ? 60 : 100, 21600, 82800); }

const r = R.gerarRelatorio('semana', ontem);
ok('[período] a semana vai de 18 a 24/11', r.desde === '2026-11-18' && r.ate === '2026-11-24', `${r.desde} a ${r.ate}`);
const unir = r.atrasos.find((x) => x.feed === 'unirh');
ok('[atrasos] UNIR: 300 amostras da semana (as de outubro não contam)', unir?.amostras === 300, String(unir?.amostras));
ok('[atrasos] UNIR: 33,3% com 5+ min', unir?.pct_5min_ou_mais === 33.3, String(unir?.pct_5min_ou_mais));
ok('[atrasos] UNIR: pior hora às 8h', unir?.pior_hora?.hora === 8, JSON.stringify(unir?.pior_hora));
ok('[atrasos] TUB a horas', r.atrasos.find((x) => x.feed === 'tub_braga')?.pct_5min_ou_mais === 0);
const cm = r.pontualidade.find((x) => x.operador === 'Carris Metropolitana');
ok('[pontualidade] soma os dias da semana pesados pelas passagens (65% a horas)', cm?.passagens === 4000 && cm?.a_horas_pct === 65, JSON.stringify(cm));
ok('[avisos] a greve da semana entra, a obra de setembro não', r.avisos.greves.length === 1 && r.avisos.total === 1, JSON.stringify(r.avisos.por_tipo));
const v = r.viagens.por_operador.find((x) => x.feed === 'unirh');
ok('[viagens] UNIR 60 por dia, antes 100 (-40%)', v?.viagens_dia === 60 && v?.antes === 100 && v?.variacao_pct === -40, JSON.stringify(v));
ok('[viagens] a 8019 aparece nas linhas que perderam viagens', r.viagens.linhas_que_perderam_viagens[0]?.linha === '8019', JSON.stringify(r.viagens.linhas_que_perderam_viagens[0]));
ok('[notícias] conta as da semana', r.noticias.greve === 1, JSON.stringify(r.noticias));
const sempre = R.gerarRelatorio('sempre', ontem);
ok('[sempre] inclui as medições de outubro', sempre.atrasos.find((x) => x.feed === 'unirh')?.amostras === 600);
ok('[períodos] terça 1 de dezembro fecha o dia e o mês (não a semana)', JSON.stringify(R.periodosQueFecham(DateTime.fromISO('2026-12-01', { zone: Z }))) === JSON.stringify(['dia', 'sempre', 'mes']));
const p1 = R.periodosQueFecham(DateTime.fromISO('2027-01-01', { zone: Z }));
ok('[períodos] 1 de janeiro fecha mês, trimestre e anos', ['mes', 'trimestre', 'ano', '2anos', '3anos'].every((x) => p1.includes(x)), p1.join(','));
const feitos = R.guardarRelatoriosDeHoje(DateTime.fromISO('2026-11-30', { zone: Z })); // segunda-feira
ok('[guardar] guarda o do dia, o da semana e o de sempre', feitos.includes('dia/2026-11-29.json') && feitos.includes('semana/2026-11-29.json') && feitos.includes('sempre/ultimo.json'), feitos.join(', '));
ok('[guardar] os ficheiros existem', fs.existsSync(path.join(dir, 'relatorios', 'semana', '2026-11-29.json')));

// Horários de cada dia, a partir do motor em memória
B.getDatabase().exec('CREATE TABLE IF NOT EXISTS stop_routes (feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0, stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id))');
B.upsertFeed({ id: 'teste', operator_name: 'Teste', mode: 'Autocarro', feed_type: 'gtfs', source_origin: 'seed', url: '', status: 'OK', progress: 'OK', lines_count: 1, stops_count: 2, trips_count: 1, realtime_entities: 'Nenhum' });
B.batchInsertCalendar([{ feed_id: 'teste', service_id: 'uteis', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 0, sunday: 0, start_date: '20200101', end_date: '20991231' },
  { feed_id: 'teste', service_id: 'domingo', monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 1, start_date: '20200101', end_date: '20991231' }]);
B.batchInsertStops([{ stop_id: 'teste:A', feed_id: 'teste', stop_name: 'A', stop_lat: 41.1, stop_lon: -8.6 }, { stop_id: 'teste:B', feed_id: 'teste', stop_name: 'B', stop_lat: 41.2, stop_lon: -8.6 }]);
B.batchInsertRoutes([{ route_id: 'teste:L1', feed_id: 'teste', route_short_name: 'L1', route_long_name: 'Linha 1', route_type: 3 }]);
const trips = [], sts = [];
[[7 * 60, 'uteis'], [8 * 60, 'uteis'], [9 * 60, 'uteis'], [10 * 60, 'domingo']].forEach(([m, s], i) => {
  trips.push({ trip_id: `teste:t${i}`, feed_id: 'teste', route_id: 'teste:L1', service_id: s, trip_headsign: 'B' });
  sts.push({ feed_id: 'teste', trip_id: `teste:t${i}`, stop_id: 'teste:A', arrival_secs: m * 60, departure_secs: m * 60, stop_sequence: 1 }, { feed_id: 'teste', trip_id: `teste:t${i}`, stop_id: 'teste:B', arrival_secs: (m + 20) * 60, departure_secs: (m + 20) * 60, stop_sequence: 2 });
});
B.batchInsertTrips(trips); B.batchInsertStopTimes(sts);
for (let i = 0; i < 400 && !I.indicePronto(); i++) await new Promise((x) => setTimeout(x, 50));
const util = HA.horariosDoDia(I.indicePronto(), DateTime.fromISO('2026-11-25', { zone: Z })); // quarta
const dom = HA.horariosDoDia(I.indicePronto(), DateTime.fromISO('2026-11-29', { zone: Z })); // domingo
const l = util.find((x) => x.linha === 'teste:L1');
ok('[horários] quarta: 3 viagens da L1, das 07:00 às 09:20', l?.viagens === 3 && l?.primeira === 7 * 3600 && l?.ultima === 9 * 3600 + 20 * 60 && l?.nome === 'L1', JSON.stringify(l));
ok('[horários] domingo: 1 viagem', dom.find((x) => x.linha === 'teste:L1')?.viagens === 1);
const n = HA.arquivarHorariosDoDia(DateTime.fromISO('2026-11-25T06:00', { zone: Z }));
const guardado = H.baseHistorico().prepare("SELECT viagens FROM horarios_dia WHERE dia = '2026-11-25' AND linha = 'teste:L1'").get();
ok('[horários] o dia fica guardado no histórico', n >= 1 && guardado?.viagens === 3, JSON.stringify(guardado));
// No servidor o relatório corre num processo à parte (somar anos de dados não pode parar a app)
const t0 = Date.now();
const aParte = await R.relatorioAParte('sempre').catch((e) => ({ erro: String(e?.message || e) }));
ok('[à parte] o relatório feito noutro processo dá o mesmo', aParte?.atrasos?.find?.((x) => x.feed === 'unirh')?.amostras === 600, JSON.stringify(aParte).slice(0, 160));
console.log(`NOTA    relatório à parte em ${Date.now() - t0} ms`);
const fonte = fs.readFileSync(`${caminho}/server.main.ts`, 'utf8');
ok('[ligação] o servidor arranca o arquivo dos horários e os relatórios', /iniciarArquivoHorarios\(\)/.test(fonte) && /iniciarRelatorios\(\)/.test(fonte));
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
