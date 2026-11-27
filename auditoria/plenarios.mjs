// Plenários de trabalhadores nos horários (lista do que faltava, 27/11/2026: «plenários e interrupções»).
// Os operadores anunciam plenários no site («Plenário TTSL | 7 mai.»: «preveem-se constrangimentos … entre as 13h15 e as
// 18h15»; MTS «Plenário de operadores de condução – 24 de Setembro»: «perturbações … entre as 10h30 e as 14h30»). Não são
// greves: o aviso fica como perturbação, e as partidas nessas horas ficam «pode não se realizar», com o banner «Plenário na …».
// Desconvocado («realizado na devida normalidade») → Cancelado. Páginas reais em fixtures/plenarios.
// Uso: APP=<pasta da app> node --import tsx auditoria/plenarios.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const APP = process.env.APP || '../parou';
process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'plenarios-'));
globalThis.fetch = async () => new Response('sem rede no teste', { status: 503 });
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const { createRequire } = await import('node:module');
const { DateTime } = createRequire(path.join(path.resolve(APP), 'package.json'))('luxon');
const A = await import(path.join(APP, 'src/server/avisosOperadores.ts'));
const P = await import(path.join(APP, 'src/server/grevesPlaneador.ts'));
const GP = await import(path.join(APP, 'src/server/grevesPartidas.ts'));
const L = (s) => DateTime.fromISO(s, { zone: 'Europe/Lisbon' }).toMillis();
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/plenarios');
const html = (n) => fs.readFileSync(path.join(DIR, `${n}.html`), 'utf8');
const site = (o) => A.SITES_OPERADORES.find((s) => s.operador === o);

// ------------------------------------------------------------ leitura das páginas
const ttsl = A.avisoDoSite(site('Transtejo Soflusa'), 'https://ttsl.pt/avisos/plenario-ttsl-7-mai/', html('plenario-ttsl-7-mai'), new Date('2026-05-06T15:00:00Z'));
ok('TTSL: título com o dia («Plenário TTSL | 7 mai»)', /7 mai/.test(ttsl?.título || ''), ttsl?.título);
ok('TTSL: não é greve, é plenário', ttsl?.tipo !== 'greve' && ttsl?.plenario === true);
ok('TTSL: das 13:15 às 18:15 de 7/5/2026', ttsl?.start_datetime === new Date(L('2026-05-07T13:15')).toISOString() && ttsl?.end_datetime === new Date(L('2026-05-07T18:15')).toISOString(), `${ttsl?.start_datetime} ${ttsl?.end_datetime}`);
ok('TTSL: data de publicação lida («6 Maio, 2026» sem «de»)', String(ttsl?.published_datetime).startsWith('2026-05-06'));
ok('TTSL: anunciado na véspera fica «Futuro»', ttsl?.status === 'Futuro');
const anulado = A.avisoDoSite(site('Transtejo Soflusa'), 'https://ttsl.pt/avisos/plenario-ttsl-30-abr/', html('plenario-ttsl-30-abr'), new Date('2026-04-29T20:00:00Z'));
ok('TTSL desconvocado («realizado na devida normalidade»): Cancelado', anulado?.status === 'Cancelado', anulado?.status);
const mts = A.avisoDoSite(site('Metro Sul do Tejo'), 'https://www.mts.pt/plenario-de-operadores-de-conducao-24-de-setembro/', html('plenario-de-operadores-de-conducao-24-de-setembro'), new Date('2026-09-23T15:00:00Z'));
ok('MTS: 24/9/2026 das 10:30 às 14:30', mts?.plenario && mts.start_datetime === new Date(L('2026-09-24T10:30')).toISOString() && mts.end_datetime === new Date(L('2026-09-24T14:30')).toISOString(), `${mts?.start_datetime} ${mts?.end_datetime}`);
ok('aviso antigo (já passou) não entra', A.avisoDoSite(site('Transtejo Soflusa'), 'https://ttsl.pt/avisos/plenario-ttsl-7-mai/', html('plenario-ttsl-7-mai'), new Date('2026-11-27T02:00:00Z')) === null);

// ------------------------------------------------------------ nas partidas
const greves = P.grevesDosAvisos([ttsl, anulado], L('2026-05-07T08:00'));
ok('só o plenário em vigor conta (o desconvocado não)', greves.length === 1 && greves[0].plenario === true);
const g = (feed, q) => P.greveDoTroco(feed, L(q), greves, {});
ok('barco às 14:00: perturbação prevista (plenário)', (() => { const x = g('transtejo_soflusa', '2026-05-07T14:00'); return x?.previsto && x?.plenario && !x.semServico; })());
ok('barco às 12:00 e às 18:30: sem marca', g('transtejo_soflusa', '2026-05-07T12:00') === undefined && g('transtejo_soflusa', '2026-05-07T18:30') === undefined);
ok('outro operador não é afetado', g('metro_lisboa', '2026-05-07T14:00') === undefined);
ok('estado da partida: «pode não se realizar»', GP.estadoDaGreve(g('transtejo_soflusa', '2026-05-07T14:00'))?.estado === 'incerta');
const r = GP.resumoDaGreve(null, 'transtejo_soflusa', greves[0], false);
ok('resumo: plenário das 13:15 às 18:15', r.plenario?.das === '13:15' && r.plenario?.as === '18:15', JSON.stringify(r.plenario));

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
