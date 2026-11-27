// Greve em TODAS as listas de partidas (falha encontrada pelo Dinis a 27/11/2026: com a greve da Metro do Porto, o Perto
// mostrava o B «Póvoa de Varzim 6 min» no Estádio do Dragão como num dia normal; só o detalhe da paragem marcava a greve).
//  - linhas perto de ti (Horários e Favoritos), partidas de uma paragem no detalhe da linha e cartões do Perto:
//    cada partida leva o estado da greve;
//  - fora do que funciona = sem serviço; dentro do troço mas a seguir para fora dele = «só até <estação>»
//    (o B do Dragão para a Póvoa só vai até à Senhora da Hora); tudo dentro = serviço reduzido;
//  - barreira: cada rota do servidor que devolve partidas tem de marcar a greve.
// Uso: APP=<pasta da app> node --import tsx auditoria/greve-em-todas-as-listas.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const APP = process.env.APP || '../parou';
process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'greve-listas-'));
globalThis.fetch = async () => new Response('sem rede no teste', { status: 503 });
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const { createRequire } = await import('node:module');
const { DateTime } = createRequire(path.join(path.resolve(APP), 'package.json'))('luxon');
const P = await import(path.join(APP, 'src/server/grevesPlaneador.ts'));
const GP = await import(path.join(APP, 'src/server/grevesPartidas.ts'));
const B = await import(path.join(APP, 'src/server/db/gtfsDatabase.ts'));
const LE = await import(path.join(APP, 'src/server/linesEngine.ts'));

// ------------------------------------------------------------ base pequena: Metro do Porto à volta do Dragão
const db = B.getDatabase();
db.exec('CREATE TABLE IF NOT EXISTS stop_routes (stop_id TEXT, route_id TEXT, direction_id INTEGER, stop_sequence INTEGER)');
db.prepare(`INSERT OR IGNORE INTO feeds (id, operator_name, mode, feed_type, source_origin, url, status, lines_count, trips_count) VALUES ('metro_porto', 'Metro do Porto', 'Metro', 'gtfs', 'seed', 'x', 'OK', 3, 300)`).run();
const EST = {
  ED: ['Estádio do Dragão', 41.1617, -8.5837], CAM: ['Campanhã', 41.1488, -8.5856], TRI: ['Trindade', 41.1527, -8.6093],
  SH: ['Senhora da Hora', 41.1878, -8.6545], MT: ['Senhor de Matosinhos', 41.1870, -8.6880], PV: ['Póvoa de Varzim', 41.3780, -8.7590],
  FZ: ['Fânzeres', 41.1690, -8.5300],
};
for (const [k, [nome, la, lo]] of Object.entries(EST)) db.prepare(`INSERT INTO stops (stop_id, feed_id, stop_name, stop_lat, stop_lon) VALUES (?, 'metro_porto', ?, ?, ?)`).run(`metro_porto:${k}`, nome, la, lo);
const hoje = DateTime.now().setZone('Europe/Lisbon');
const ini = hoje.minus({ days: 2 }).toFormat('yyyyMMdd'), fim = hoje.plus({ days: 5 }).toFormat('yyyyMMdd');
db.prepare(`INSERT INTO calendar VALUES ('metro_porto', 'TODOS', 1,1,1,1,1,1,1, ?, ?)`).run(ini, fim);
const LINHAS = {
  A: [['ED', 'CAM', 'TRI', 'SH', 'MT'], 'Senhor de Matosinhos'],
  B: [['ED', 'CAM', 'TRI', 'SH', 'PV'], 'Póvoa de Varzim'],
  F: [['ED', 'FZ'], 'Fânzeres'],
  T: [['ED', 'CAM', 'TRI', 'SH'], 'Senhora da Hora'],
};
let nv = 0;
for (const [linha, [estacoes, destino]] of Object.entries(LINHAS)) {
  db.prepare(`INSERT INTO routes (route_id, feed_id, route_short_name, route_long_name, route_type) VALUES (?, 'metro_porto', ?, ?, 0)`).run(`metro_porto:${linha}`, linha, `Linha ${linha}`);
  estacoes.forEach((e, i) => db.prepare('INSERT INTO stop_routes VALUES (?, ?, 0, ?)').run(`metro_porto:${e}`, `metro_porto:${linha}`, i + 1));
  // uma viagem de 10 em 10 minutos, o dia todo (o teste corre a qualquer hora)
  for (let parte = 0; parte < 26 * 3600; parte += 600) {
    const trip = `metro_porto:${linha}-${nv++}`;
    db.prepare(`INSERT INTO trips (trip_id, feed_id, route_id, service_id, trip_headsign, direction_id) VALUES (?, 'metro_porto', ?, 'TODOS', ?, 0)`).run(trip, `metro_porto:${linha}`, destino);
    estacoes.forEach((e, i) => db.prepare(`INSERT INTO stop_times (trip_id, feed_id, stop_id, stop_sequence, arrival_secs, departure_secs) VALUES (?, 'metro_porto', ?, ?, ?, ?)`).run(trip, `metro_porto:${e}`, i + 1, parte + i * 240, parte + i * 240));
  }
}

// Greve de hoje e amanhã: só o tronco comum Senhora da Hora–Estádio do Dragão funciona, o dia todo
const aviso = {
  tipo: 'greve', status: 'Ativo', operador: 'Metro do Porto', título: 'Greve reduz serviço do Metro', source: 'Metro do Porto — avisos', source_url: 'https://www.metrodoporto.pt/x',
  start_datetime: hoje.startOf('day').toUTC().toISO(), end_datetime: hoje.plus({ days: 1 }).endOf('day').toUTC().toISO(),
  servico_na_greve: { linhas: [], trocos: [['senhora da hora', 'estadio do dragao']], frequencia: '15 min', horas: [0, 1440] },
};
const greves = P.grevesDosAvisos([aviso], Date.now());
ok('[preparar] o aviso conta como greve com o que funciona', greves.length === 1 && greves[0].servico?.trocos?.length === 1);

// ------------------------------------------------------------ partidas de uma paragem (detalhe da linha)
const p = await LE.LinesEngine.getStopDepartures('metro_porto:ED', 12);
GP.marcarGrevesPorOrigem(db, p.departures, greves);
const porLinha = (deps, campo = 'line_code') => Object.fromEntries(['A', 'B', 'F', 'T'].map((l) => [l, deps.find((d) => d[campo] === l)?.greve]));
const g1 = porLinha(p.departures);
ok('[paragem] há partidas das 4 linhas', ['A', 'B', 'F', 'T'].every((l) => p.departures.some((d) => d.line_code === l)), p.departures.map((d) => d.line_code).join(' '));
ok('[paragem] F (para Fânzeres, fora do troço) = sem serviço', g1.F?.estado === 'sem-servico', JSON.stringify(g1.F));
ok('[paragem] B para a Póvoa = só até à Senhora da Hora', g1.B?.estado === 'reduzido' && g1.B?.ate === 'Senhora da Hora', JSON.stringify(g1.B));
ok('[paragem] A para Matosinhos = só até à Senhora da Hora', g1.A?.estado === 'reduzido' && g1.A?.ate === 'Senhora da Hora', JSON.stringify(g1.A));
ok('[paragem] T (todo dentro do troço) = serviço reduzido, sem «só até»', g1.T?.estado === 'reduzido' && !g1.T?.ate, JSON.stringify(g1.T));
// serviço de N em N minutos: as horas do horário normal não valem; uma partida por destino real (27/11/2026)
{
  const fq = GP.frequenciaNaHora;
  const as = (h, m) => DateTime.fromObject({ year: 2026, month: 11, day: 27, hour: h, minute: m }, { zone: 'Europe/Lisbon' }).toMillis();
  const F = '15 min (7h–20h) · 30 min (6h–7h, 20h–0h)';
  ok('[frequência] 16h → 15 min; 6h30 → 30; 21h → 30; 3h → nada', fq(F, as(16, 0)) === 15 && fq(F, as(6, 30)) === 30 && fq(F, as(21, 0)) === 30 && fq(F, as(3, 0)) === undefined, [fq(F, as(16, 0)), fq(F, as(6, 30)), fq(F, as(21, 0)), fq(F, as(3, 0))].join(' '));
  ok('[frequência] sem horas = o dia todo', fq('15 min', as(10, 0)) === 15);
  const q = await LE.LinesEngine.getStopDepartures('metro_porto:ED', 20);
  GP.marcarGrevesPorOrigem(db, q.departures, greves);
  const visiveis = GP.semRepetidas(q.departures);
  const paraSH = visiveis.filter((d) => d.greve?.estado === 'reduzido');
  ok('[de 15 em 15] todas as partidas que funcionam levam «cada 15»', q.departures.filter((d) => d.greve?.estado === 'reduzido').every((d) => d.greve.cada === 15));
  ok('[de 15 em 15] fica UMA partida para a Senhora da Hora (A, B e T juntas)', paraSH.length === 1, visiveis.map((d) => `${d.line_code}→${d.greve?.ate || d.destination}:${d.greve?.estado}${d.greve?.repetida ? '(rep)' : ''}`).join(' '));
  ok('[de 15 em 15] as sem serviço: uma por linha e destino (riscada)', visiveis.filter((d) => d.greve?.estado === 'sem-servico').length === 1, String(visiveis.filter((d) => d.greve?.estado === 'sem-servico').length));
  ok('[de 15 em 15] a lista original (cache) não perde partidas', q.departures.length > visiveis.length);
}

// sem greve: as marcas antigas saem (a resposta vem da cache)
GP.marcarGrevesPorOrigem(db, p.departures, []);
ok('[paragem] sem greve as marcas saem', p.departures.every((d) => !d.greve));

// ------------------------------------------------------------ linhas perto de ti (Horários, Favoritos)
const [la, lo] = [EST.ED[1], EST.ED[2]];
const linhas = await LE.LinesEngine.getLinesNear(la, lo, 500);
for (const l of linhas) GP.marcarGrevesPorOrigem(db, l.departures || [], greves);
const daLinha = (c) => linhas.find((l) => l.code === c);
const estadoNaLinha = (c) => (daLinha(c)?.departures || []).map((d) => d.greve).find(Boolean);
ok('[perto] as linhas do Dragão aparecem', ['A', 'B', 'F'].every((c) => daLinha(c)), linhas.map((l) => l.code).join(' '));
ok('[perto] F = sem serviço', estadoNaLinha('F')?.estado === 'sem-servico', JSON.stringify(estadoNaLinha('F')));
ok('[perto] B = só até à Senhora da Hora', estadoNaLinha('B')?.estado === 'reduzido' && estadoNaLinha('B')?.ate === 'Senhora da Hora', JSON.stringify(estadoNaLinha('B')));
const json = JSON.stringify(linhas);
ok('[perto] a marca vai na resposta (JSON)', /"greve":\{"estado":"sem-servico"/.test(json));

// Partidas com tempo real não se marcam (o operador já diz o que circula)
const rt = { state: 'Tempo Real' };
GP.origemDaPartida.set(rt, { feed: 'metro_porto', partidaMs: Date.now() + 300000, trip: 'metro_porto:F-0', paragemId: 'metro_porto:ED', linha: 'F' });
GP.marcarGrevesPorOrigem(db, [rt], greves);
ok('[tempo real] não se marca', !rt.greve);

// ------------------------------------------------------------ barreira: todas as rotas do servidor com partidas marcam a greve
const srv = fs.readFileSync(path.join(APP, 'server.main.ts'), 'utf8');
const bloco = (rota) => { const i = srv.indexOf(rota); return i < 0 ? '' : srv.slice(i, i + 6000); };
ok('[servidor] Perto (/api/transit/nearby) marca a greve em cada paragem', /marcarGrevesNasPartidas\(/.test(bloco("app.get('/api/transit/nearby'")) && /greve: \(d as any\)\.greve\.estado/.test(bloco("app.get('/api/transit/nearby'")));
ok('[servidor] linhas perto (/api/lines?near) marcam a greve', /marcarGrevesNasLinhas\(lines\)/.test(bloco("app.get('/api/lines'")));
ok('[servidor] partidas de uma paragem (/api/stops/:id/departures) marcam a greve', /marcarGrevesPorOrigem\(/.test(bloco("app.get('/api/stops/:id/departures'")));
ok('[servidor] detalhe da paragem (/api/transit/stop/:id) continua a marcar', /comGreves\(/.test(srv.slice(srv.indexOf("app.get('/api/transit/stop/:id'"), srv.indexOf("app.get('/api/transit/stop/:id'") + 9000)));
// Nenhuma rota nova de partidas sem greve: cada sítio que pede partidas ao motor tem de marcar ali perto
const chamadas = [...srv.matchAll(/(DepartureEngine\.(nextDepartures|ultimasPorLinha)|LinesEngine\.(getLinesNear|getStopDepartures))\(/g)];
const semMarca = chamadas.filter((m) => !/marcarGreves|comGreves/.test(srv.slice(m.index, m.index + 900)));
ok('[servidor] todas as chamadas que dão partidas marcam a greve', semMarca.length === 0, semMarca.map((m) => `${m[1]} @${srv.slice(0, m.index).split('\n').length}`).join(', '));

// ------------------------------------------------------------ ecrã: os cartões mostram a greve
const perto = fs.readFileSync(path.join(APP, 'src/components/PertoView.tsx'), 'utf8');
const lc = fs.readFileSync(path.join(APP, 'src/components/LineCard.tsx'), 'utf8');
const ldm = fs.readFileSync(path.join(APP, 'src/components/LineDetailModal.tsx'), 'utf8');
ok('[ecrã] cartões do Perto: as sem serviço vão para o fim; destino real e etiqueta da greve nas 3 listas', /partidasDoCartao\(stopDeps\)/.test(perto) && (perto.match(/etiquetaGreve\(dep, destination\)/g) || []).length >= 3 && (perto.match(/destinoReal\(dep, destination\)/g) || []).length >= 3);
ok('[ecrã] cartão de linha (Horários/Favoritos): destino real e etiqueta da greve', /<EtiquetaGreve estado=\{greveProxima\.estado\}/.test(lc) && /greveProxima\.ate \? formatTransitName\(greveProxima\.ate\)/.test(lc));
ok('[ecrã] partidas no detalhe da linha: destino real e etiqueta da greve', /<EtiquetaGreve estado=\{dep\.greve\.estado\}/.test(ldm) && /dep\.greve\.ate \? formatTransitName\(dep\.greve\.ate\)/.test(ldm));
// texto da etiqueta: «Não vai até <destino de sempre> (greve)»
const GN = await import(path.join(APP, 'src/components/GreveNoHorario.tsx')).catch((e) => ({ erro: String(e) }));
if (GN.textoGreveDaPartida) {
  ok('[ecrã] texto: «Não vai até Fórum Maia (greve)»', GN.textoGreveDaPartida('reduzido', 'Senhora da Hora', 'Fórum Maia') === 'Não vai até Fórum Maia (greve)', GN.textoGreveDaPartida('reduzido', 'Senhora da Hora', 'Fórum Maia'));
  ok('[ecrã] texto: sem serviço', GN.textoGreveDaPartida('sem-servico') === 'Sem serviço (greve)');
  ok('[ecrã] destino real: Senhora da Hora em vez de Fórum Maia', GN.destinoNaGreve('reduzido', 'Senhora da Hora', 'Fórum Maia') === 'Senhora da Hora' && GN.destinoNaGreve(undefined, undefined, 'Fórum Maia') === 'Fórum Maia');
} else console.log('NOTA    não deu para importar o componente aqui:', GN.erro);

console.log(falhas ? `${falhas} FALHOU` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
