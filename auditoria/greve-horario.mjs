// Greves nos horários (pedido do Dinis, 26/11/2026: «nos horários do dia não tiveste em conta a greve nem as alterações de
// horário por causa da greve; devia ser automático e sempre atualizado»).
//  - aviso oficial da Metro do Porto (página de notícias do site, texto real de 25/11/2026): dia da greve, véspera a acabar às
//    23h, o que funciona (tronco comum Senhora da Hora–Estádio do Dragão e eixo Hospital São João–Santo Ovídio da Linha
//    Amarela), frequências e horas com serviço;
//  - cada partida do horário do dia e das partidas de uma paragem leva o estado: sem serviço (fora do que funciona, fora
//    das horas, depois do fim na véspera), pode não se realizar (véspera perto do fim; greve sem dizer o que funciona) ou
//    serviço reduzido (na parte que funciona); com o resumo do aviso (nomes das estações como na base);
//  - partidas com tempo real não se marcam; na ponta do troço, no sentido de sair dele, já não há viagem.
// Uso: APP=<pasta da app> node --import tsx auditoria/greve-horario.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const APP = process.env.APP || '../parou';
process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'greve-horario-'));
globalThis.fetch = async () => new Response('sem rede no teste', { status: 503 });
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const { createRequire } = await import('node:module');
const { DateTime } = createRequire(path.join(path.resolve(APP), 'package.json'))('luxon');
const C = await import(path.join(APP, 'src/server/centralAlertsEngine.ts'));
const G = await import(path.join(APP, 'src/server/grevesNoticias.ts'));
const P = await import(path.join(APP, 'src/server/grevesPlaneador.ts'));
const H = await import(path.join(APP, 'src/server/horarioDoDia.ts'));
const GP = await import(path.join(APP, 'src/server/grevesPartidas.ts'));
const B = await import(path.join(APP, 'src/server/db/gtfsDatabase.ts'));
const L = (s) => DateTime.fromISO(s, { zone: 'Europe/Lisbon' });

// ------------------------------------------------------------ aviso oficial (HTML real do site, só a parte que conta)
const INICIO = `<ul class="slides"><li><a target="_blank" href="https://www.metrodoporto.pt/pages/630?news_id=658"><h4>Greve 28 novembro</h4></a></li></ul>
<div class="news"><a href="https://www.metrodoporto.pt/pages/630?news_id=658">Greve reduz serviço do …</a><a href="/pages/630?news_id=655">Outra</a></div>`;
const NOTICIA = `<html><head><meta name="published_at" content="2026-11-25T18:35:57.174Z"><meta property="og:title" content="Greve reduz serviço do Metro esta sexta-feira"></head><body>
<h1 class="pageTitle">Greve reduz serviço do Metro esta sexta-feira</h1> <div class="central_AREA"> <div id="news_detail_49" class="widget news_detail">
<div class="date widget_field "><div class="widget_value"><div><span class="dia">25</span> <span class="mes_extenso">Novembro</span> <span class="ano">2026</span></div></div></div>
<div class="title widget_field "><div class="widget_value"><h3>Greve reduz serviço do Metro esta sexta-feira</h3></div></div>
<div class="text widget_field "><div class="widget_value"><div class="writer_text"><h4>Serviço apenas na Linha Amarela e entre a Senhora da Hora e o Dragão</h4> <p>De acordo com informação prestada pela Via Porto, concessionária da Operação e Manutenção do Sistema do Metro Ligeiro da Área Metropolitana do Porto, devido à greve convocada pelo SMAQ (Sindicato Nacional dos Maquinistas dos Caminhos de Ferro Portugueses), para o dia 27 de novembro, esta sexta-feira, o Metro do Porto vai ter a sua operação afetada, podendo mesmo ser impedida na maioria das linhas.&nbsp;</p> <p>Os efeitos desta paragem começam a fazer-se sentir já amanhã, com o serviço a terminar por volta das 23h00 (e não à 01h00, conforme acontece normalmente). Na sexta-feira, realizar-se-ão viagens apenas pelo tronco comum (entre a Senhora da Hora e o Estádio do Dragão) e no eixo Hospital São João-Santo Ovídio, da Linha Amarela (D). As frequências de passagem em ambas as ligações serão de 15 minutos entre as 7h00 e as 20h00 e de 30 minutos entre as 6h00 e as 7h00, assim como entre as 20h00 e as 00h00.</p> <p>A Metro do Porto lamenta o transtorno causado aos seus clientes.&nbsp;</p> <p>&nbsp;</p><div class="writer_text_clear"></div></div></div></div></div></div></body></html>`;

ok('página inicial: notícias ligadas (sem repetidos)', JSON.stringify(C.noticiasNaPaginaMetroPorto(INICIO)) === '["658","655"]', JSON.stringify(C.noticiasNaPaginaMetroPorto(INICIO)));
const n = C.noticiaMetroPorto(NOTICIA);
ok('notícia: título, data e texto (sem HTML)', n && n.titulo === 'Greve reduz serviço do Metro esta sexta-feira' && n.publicada.startsWith('2026-11-25') && /lamenta o transtorno causado aos seus clientes\.$/.test(n.texto) && !/[<>]/.test(n.texto), n && n.texto.slice(-60));
const AGORA = new Date('2026-11-26T21:00:00Z');
const a = G.avisoGreveOficial({ operador: 'Metro do Porto', regiao: 'AMP', municipios: ['Porto'], titulo: n.titulo, texto: n.texto, publicada: n.publicada, url: 'https://www.metrodoporto.pt/pages/630?news_id=658', fonte: 'Metro do Porto — avisos' }, AGORA);
ok('aviso: greve a 27/11 (dia inteiro), oficial (não notícia)', a && a.tipo === 'greve' && a.start_datetime === '2026-11-27T00:00:00.000Z' && /^Metro do Porto/.test(a.source) && a.status === 'Futuro', JSON.stringify([a?.start_datetime, a?.source, a?.status]));
ok('aviso: véspera («já amanhã», a acabar por volta das 23h00)', a && a.vespera_fim === '2026-11-26T23:00:00.000Z' && a.vespera_desde === '2026-11-26T22:00:00.000Z', JSON.stringify([a?.vespera_desde, a?.vespera_fim]));
const sv = a?.servico_na_greve;
ok('aviso: o que funciona = tronco comum e eixo Hospital São João–Santo Ovídio', sv && sv.trocos.some(([x, y]) => x === 'senhora da hora' && y === 'estadio do dragao') && sv.trocos.some(([x, y]) => x === 'hospital sao joao' && y === 'santo ovidio'), JSON.stringify(sv?.trocos));
ok('aviso: frequências das duas faixas e horas com serviço (6h–24h)', sv && sv.frequencia === '15 min (7h–20h) · 30 min (6h–7h, 20h–0h)' && JSON.stringify(sv.horas) === '[360,1440]', JSON.stringify([sv?.frequencia, sv?.horas]));
const anulada = G.avisoGreveOficial({ operador: 'Metro do Porto', regiao: 'AMP', municipios: [], titulo: 'Greve desconvocada: Metro com serviço normal esta sexta-feira', texto: 'A greve marcada para 27 de novembro foi desconvocada.', publicada: '2026-11-26T15:00:00Z', url: 'u', fonte: 'f' }, AGORA);
ok('aviso de greve desconvocada: anula esse dia', anulada && Array.isArray(anulada.anulada) && anulada.anulada[0] === '2026-11-27', JSON.stringify(anulada));
ok('notícia sem greve: nada', G.avisoGreveOficial({ operador: 'Metro do Porto', regiao: '', municipios: [], titulo: 'Novos horários de Natal', texto: 'Mais viagens a 24 de dezembro.', publicada: '2026-11-26T15:00:00Z', url: 'u', fonte: 'f' }, AGORA) === null);

// ------------------------------------------------------------ base pequena com o Metro do Porto
const db = B.getDatabase();
db.exec('CREATE TABLE IF NOT EXISTS stop_routes (stop_id TEXT, route_id TEXT, direction_id INTEGER, stop_sequence INTEGER)');
db.prepare(`INSERT OR IGNORE INTO feeds (id, operator_name, mode, feed_type, source_origin, url, status) VALUES ('metro_porto', 'Metro do Porto', 'Metro', 'gtfs', 'seed', 'x', 'OK')`).run();
const EST = { HSJ: 'Hospital São João', TRI: 'Trindade', SO: 'Santo Ovídio', VE: "Vila d'Este", FZ: 'Fânzeres', ED: 'Estádio do Dragão', SH: 'Senhora da Hora', MT: 'Senhor de Matosinhos' };
for (const [k, nome] of Object.entries(EST)) db.prepare(`INSERT INTO stops (stop_id, feed_id, stop_name, stop_lat, stop_lon) VALUES (?, 'metro_porto', ?, 41.1, -8.6)`).run(`metro_porto:${k}`, nome);
for (const r of ['A', 'D', 'F']) db.prepare(`INSERT INTO routes (route_id, feed_id, route_short_name, route_long_name) VALUES (?, 'metro_porto', ?, ?)`).run(`metro_porto:${r}`, r, r);
db.prepare(`INSERT INTO calendar VALUES ('metro_porto', 'TODOS', 1,1,1,1,1,1,1, '20261101', '20261231')`).run();
const hora = (h, m) => h * 3600 + m * 60;
const VIAGENS = {
  D: [['HSJ', 'TRI', 'SO', 'VE'], "Vila d'Este"],
  F: [['FZ', 'ED', 'TRI', 'SH'], 'Senhora da Hora'],
  A: [['ED', 'TRI', 'SH', 'MT'], 'Senhor de Matosinhos'],
};
let nv = 0;
for (const [linha, [estacoes, destino]] of Object.entries(VIAGENS)) {
  for (const parte of [hora(5, 30), hora(10, 0), hora(22, 30), hora(23, 30), hora(24, 20)]) {
    const trip = `metro_porto:${linha}-${nv++}`;
    db.prepare(`INSERT INTO trips (trip_id, feed_id, route_id, service_id, trip_headsign, direction_id) VALUES (?, 'metro_porto', ?, 'TODOS', ?, 0)`).run(trip, `metro_porto:${linha}`, destino);
    estacoes.forEach((e, i) => db.prepare(`INSERT INTO stop_times (trip_id, feed_id, stop_id, stop_sequence, arrival_secs, departure_secs) VALUES (?, 'metro_porto', ?, ?, ?, ?)`).run(trip, `metro_porto:${e}`, i + 1, parte + i * 300, parte + i * 300));
  }
}
const greves = P.grevesDosAvisos([a], AGORA.getTime());
const dia = (linha, est, data) => H.horarioDoDia(`metro_porto:${linha}`, `metro_porto:${est}`, 0, L(data), undefined, greves);
const estados = (h) => h.partidas.map((p) => `${p.hora}${p.greve ? `:${p.greve}` : ''}`).join(' ');

const d27tri = dia('D', 'TRI', '2026-11-27');
ok('sexta: Linha Amarela em Trindade (no eixo que funciona) = serviço reduzido; antes das 6h e depois da meia-noite, sem serviço', estados(d27tri) === '05:35:sem-servico 10:05:reduzido 22:35:reduzido 23:35:reduzido 00:25:sem-servico', estados(d27tri));
const d27so = dia('D', 'SO', '2026-11-27');
ok('sexta: Santo Ovídio no sentido de Vila d\'Este (sai do eixo) = sem serviço', d27so.partidas.every((p) => p.greve === 'sem-servico'), estados(d27so));
const f27 = dia('F', 'FZ', '2026-11-27');
ok('sexta: Linha Laranja em Fânzeres (fora do tronco comum) = sem serviço', f27.partidas.length === 5 && f27.partidas.every((p) => p.greve === 'sem-servico'), estados(f27));
const f27tri = dia('F', 'TRI', '2026-11-27');
ok('sexta: Linha Laranja em Trindade a caminho da Senhora da Hora (tronco comum) = serviço reduzido às 10h', f27tri.partidas.find((p) => p.hora === '10:10')?.greve === 'reduzido', estados(f27tri));
const a27sh = dia('A', 'SH', '2026-11-27');
ok('sexta: Senhora da Hora a caminho de Matosinhos (ponta do tronco, a sair dele) = sem serviço', a27sh.partidas.every((p) => p.greve === 'sem-servico'), estados(a27sh));
const d26 = dia('D', 'TRI', '2026-11-26');
ok('quinta (véspera): 10h normal, 22h35 pode não se realizar, 23h35 e 00h25 sem serviço', estados(d26) === '05:35 10:05 22:35:incerta 23:35:sem-servico 00:25:sem-servico', estados(d26));
ok('quinta: o resumo é só o da véspera (com a hora do fim), não o da greve de sexta', d26.greves?.length === 1 && d26.greves[0].vespera === true && d26.greves[0].fimVespera === '23:00', JSON.stringify(d26.greves));
const r27 = d27tri.greves?.[0];
ok('sexta: resumo com o que funciona (nomes das estações como na base) e frequências', r27 && !r27.vespera && JSON.stringify(r27.funciona) === JSON.stringify(['Senhora da Hora – Estádio do Dragão', 'Hospital São João – Santo Ovídio']) && r27.frequencia === '15 min (7h–20h) · 30 min (6h–7h, 20h–0h)' && r27.url.includes('news_id=658') && !r27.noticia, JSON.stringify(r27));
const d25 = dia('D', 'TRI', '2026-11-25');
ok('dia sem greve: nenhuma marca nem resumo', !d25.greves && d25.partidas.every((p) => !p.greve), estados(d25));
const semGreves = H.horarioDoDia('metro_porto:D', 'metro_porto:TRI', 0, L('2026-11-27'));
ok('sem avisos de greve: o horário fica como estava', !semGreves.greves && semGreves.partidas.every((p) => !p.greve));

// greve sem dizer o que funciona (ex.: «Estado das Linhas» só com «greve»): pode não se realizar
const geral = P.grevesDosAvisos([{ tipo: 'greve', status: 'Futuro', operador: 'Metro do Porto', título: 'Greve no Metro do Porto', source_url: 'u2', start_datetime: '2026-12-04T00:00:00Z', end_datetime: '2026-12-04T23:59:59Z', source: 'Metro do Porto — estado das linhas' }], AGORA.getTime());
const g4 = H.horarioDoDia('metro_porto:F', 'metro_porto:FZ', 0, L('2026-12-04'), undefined, geral);
ok('greve sem o que funciona: as partidas do dia ficam «pode não se realizar», com o resumo', g4.partidas.every((p) => p.greve === 'incerta') && g4.greves?.length === 1 && !g4.greves[0].funciona, estados(g4));

// ------------------------------------------------------------ partidas de uma paragem (resposta da API)
const ep = (s) => Math.round(L(s).toMillis() / 1000);
const deps = [
  { trip_id: 'metro_porto:F-5', feed_id: 'metro_porto', route_short_name: 'F', stop_id: 'metro_porto:FZ', dep_epoch_secs: ep('2026-11-27T10:00'), state: 'PROGRAMADO' },
  { trip_id: 'metro_porto:D-1', feed_id: 'metro_porto', route_short_name: 'D', stop_id: 'metro_porto:TRI', dep_epoch_secs: ep('2026-11-27T10:05'), state: 'PROGRAMADO' },
  { trip_id: 'metro_porto:D-1', feed_id: 'metro_porto', route_short_name: 'D', stop_id: 'metro_porto:TRI', dep_epoch_secs: ep('2026-11-27T10:05'), state: 'TEMPO REAL', is_realtime: true },
  { trip_id: 'x', feed_id: 'stcp', route_short_name: '801', stop_id: 'stcp:X', dep_epoch_secs: ep('2026-11-27T10:00'), state: 'PROGRAMADO' },
];
const nome = (id) => db.prepare('SELECT stop_name AS n FROM stops WHERE stop_id = ?').get(id)?.n;
const res = GP.marcarGrevesNasPartidas(db, deps, greves, nome);
ok('paragem: Fânzeres sem serviço, Trindade serviço reduzido', deps[0].greve?.estado === 'sem-servico' && deps[1].greve?.estado === 'reduzido', JSON.stringify(deps.map((d) => d.greve)));
ok('paragem: partida com tempo real não leva marca (o metro está mesmo a circular)', !deps[2].greve);
ok('paragem: outro operador (STCP) não leva a greve do metro', !deps[3].greve);
ok('paragem: resumo do aviso', res.length === 1 && res[0].operador === 'Metro do Porto' && res[0].funciona?.length === 2, JSON.stringify(res));
const res2 = GP.marcarGrevesNasPartidas(db, deps, [], nome);
ok('paragem: sem greves, as marcas antigas saem (resposta em cache)', res2.length === 0 && deps.every((d) => !d.greve));

// ------------------------------------------------------------ trajetos: «sem serviço» e fim da véspera
const t1 = P.greveDoTroco('metro_porto', L('2026-11-26T23:30').toMillis(), greves);
ok('trajeto quinta às 23h30: sem serviço (já passou o fim anunciado)', t1 && t1.previsto === true && t1.semServico === true, JSON.stringify(t1));
const t2 = P.greveDoTroco('metro_porto', L('2026-11-26T22:30').toMillis(), greves);
ok('trajeto quinta às 22h30: perturbação prevista (ainda há serviço)', t2 && t2.previsto === true && !t2.semServico, JSON.stringify(t2));
const E = await import(path.join(APP, 'src/utils/escolhaOpcoes.ts'));
ok('opção de rota com troço sem serviço conta como greve «pode não circular» (2)', E.greveNaOpcao({ legs: [{ mode: 'TRANSIT', greve: { previsto: true, semServico: true } }] }) === 2);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
