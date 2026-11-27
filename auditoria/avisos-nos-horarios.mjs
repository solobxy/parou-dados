// Avisos do dia a dia nos horários e nos trajetos (pedido de 27/11/2026: «os avisos mostram nos horários e nas rotas?»).
// Um aviso com linhas e prazo (supressão, interrupção, desvio) marca só as partidas dessas linhas, nas horas do aviso:
//  - supressão/interrupção → «pode não se realizar» (e conta como «pode não circular» na escolha dos trajetos);
//  - desvio/alteração de percurso → «percurso alterado» (a viagem faz-se; não muda a escolha);
//  - uma greve do mesmo operador manda; um aviso sem fim ou de notícia não marca horários; códigos «072» = «72».
// Uso: APP=<pasta da app> node --import tsx auditoria/avisos-nos-horarios.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const APP = process.env.APP || '../parou';
process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'avisos-horarios-'));
globalThis.fetch = async () => new Response('sem rede no teste', { status: 503 });
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const P = await import(path.join(APP, 'src/server/grevesPlaneador.ts'));
const GP = await import(path.join(APP, 'src/server/grevesPartidas.ts'));
const E = await import(path.join(APP, 'src/utils/escolhaOpcoes.ts'));
const L = (s) => new Date(s).getTime();

const aviso = (o) => ({ status: 'Futuro', source: 'Operadores — avisos oficiais', source_url: 'https://stcp.pt/x', operador: 'STCP', paragens: [], ...o });
const alertas = [
  aviso({ tipo: 'cancelamento', título: 'SUPRESSÃO DA LINHA - INAUGURAÇÃO DAS LUZES DE NATAL', linhas: ['22'], start_datetime: '2026-11-28T15:30:00.000Z', end_datetime: '2026-11-29T06:00:00.000Z' }),
  aviso({ tipo: 'alteração de percurso', título: 'ALTERAÇÃO DE PERCURSO - OBRAS - R. EGAS MONIZ', linhas: ['402'], start_datetime: '2026-11-27T22:00:00.000Z', end_datetime: '2026-11-28T06:00:00.000Z' }),
  aviso({ tipo: 'alteração de percurso', título: 'Sem fim', linhas: ['500'], start_datetime: '2026-11-27T00:00:00.000Z', end_datetime: null }),
  aviso({ tipo: 'cancelamento', título: 'De uma notícia', source: 'Notícias — greves', linhas: ['600'], start_datetime: '2026-11-27T00:00:00.000Z', end_datetime: '2026-11-29T00:00:00.000Z' }),
  aviso({ operador: 'Horários do Funchal', tipo: 'alteração de horário', título: 'Carreira nº: 003 (3)', linhas: ['3'], start_datetime: '2026-12-02T00:00:00.000Z', end_datetime: '2027-01-01T00:00:00.000Z' }),
  aviso({ operador: 'SMTUC', tipo: 'alteração de percurso', título: 'Linhas 072 e 6F', linhas: ['72', '6F'], start_datetime: '2026-11-27T00:00:00.000Z', end_datetime: '2026-12-27T00:00:00.000Z', status: 'Ativo' }),
];
const agora = L('2026-11-27T12:00:00Z');
const g = P.grevesDosAvisos(alertas, agora);
ok('entram só os avisos com linhas, prazo e de fonte oficial (3)', g.length === 3 && g.every((x) => x.efeito), g.map((x) => x.titulo).join(' | '));
ok('alteração de horário não marca partidas (o horário já é o novo)', !g.some((x) => /Carreira/.test(x.titulo)));
const t = (feed, quando, linha) => P.greveDoTroco(feed, L(quando), g, { linha });
ok('linha 22 às 16h00 de 28/11: «pode não se realizar»', GP.estadoDaGreve(t('stcp', '2026-11-28T16:00:00Z', '22'))?.estado === 'incerta' && t('stcp', '2026-11-28T16:00:00Z', '22')?.aviso === 'suprimido');
ok('linha 22 às 15h00 (antes das 15h30): sem marca', t('stcp', '2026-11-28T15:00:00Z', '22') === undefined);
ok('linha 23 à mesma hora: sem marca', t('stcp', '2026-11-28T16:00:00Z', '23') === undefined);
ok('linha 402 às 23h00 de 27/11: «percurso alterado»', GP.estadoDaGreve(t('stcp', '2026-11-27T23:00:00Z', '402'))?.estado === 'desvio');
ok('linha 402 às 7h00 de 28/11 (já acabou às 6h): sem marca', t('stcp', '2026-11-28T07:00:00Z', '402') === undefined);
ok('aviso sem fim (linha 500) não marca horários', t('stcp', '2026-11-27T15:00:00Z', '500') === undefined);
ok('aviso de notícia (linha 600) não marca horários', t('stcp', '2026-11-27T15:00:00Z', '600') === undefined);
ok('códigos: «072» do aviso = linha «72»; «6f» = «6F»', P.codigoLinha('072') === '72' && GP.estadoDaGreve(t('smtuc', '2026-11-28T10:00:00Z', '072'))?.estado === 'desvio' && t('smtuc', '2026-11-28T10:00:00Z', '6f')?.aviso === 'desvio');
ok('outro operador não é afetado', t('metro_porto', '2026-11-28T16:00:00Z', '22') === undefined);
// greve do mesmo operador manda
const comGreve = P.grevesDosAvisos([...alertas, { tipo: 'greve', status: 'Ativo', operador: 'STCP', título: 'Greve STCP', source: 'STCP', source_url: '', start_datetime: '2026-11-28T00:00:00.000Z', end_datetime: '2026-11-28T23:59:00.000Z' }], agora);
const tg = P.greveDoTroco('stcp', L('2026-11-28T16:00:00Z'), comGreve, { linha: '22' });
ok('com greve no mesmo dia, manda a greve', tg && !tg.aviso && tg.titulo === 'Greve STCP');
// resumo e escolha de trajetos
const r = GP.resumoDaGreve(null, 'stcp', g.find((x) => x.efeito === 'suprimido'), false);
ok('resumo do aviso: «aviso: suprimido», dia 28/11', r.aviso === 'suprimido' && r.dia === '2026-11-28');
const opc = (gr) => ({ legs: [{ mode: 'TRANSIT', greve: gr }] });
ok('trajetos: desvio não muda a escolha; supressão conta como «pode não circular»', E.greveNaOpcao(opc({ aviso: 'desvio', titulo: '', url: '', operador: 'STCP' })) === 0 && E.greveNaOpcao(opc({ aviso: 'suprimido', titulo: '', url: '', operador: 'STCP' })) === 2);
// partidas de uma paragem
const deps = [
  { feed_id: 'stcp', route_short_name: '22', dep_epoch_secs: L('2026-11-28T16:10:00Z') / 1000, trip_id: 'x1', stop_id: 's1' },
  { feed_id: 'stcp', route_short_name: '22', dep_epoch_secs: L('2026-11-28T14:10:00Z') / 1000, trip_id: 'x2', stop_id: 's1' },
  { feed_id: 'stcp', route_short_name: '207', dep_epoch_secs: L('2026-11-28T16:10:00Z') / 1000, trip_id: 'x3', stop_id: 's1' },
];
const resumos = GP.marcarGrevesNasPartidas(null, deps, g, () => undefined);
ok('paragem: só a partida da linha 22 depois das 15h30 fica marcada', deps[0].greve?.estado === 'incerta' && !deps[1].greve && !deps[2].greve, JSON.stringify(deps.map((d) => d.greve)));
ok('paragem: um resumo, do aviso da linha 22', resumos.length === 1 && resumos[0].aviso === 'suprimido');

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
