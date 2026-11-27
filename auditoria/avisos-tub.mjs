// Avisos da TUB (Braga) a partir do feed oficial cedido pela TUB a 27/11/2026 (https://tub.pt/core/request.php?action=getavisos).
// fixtures/tub-avisos-2026-11-27.json é a resposta real desse dia (19 avisos publicados).
//  - ficam só os avisos do serviço (percursos, horários, paragens, linhas); campanhas, concursos, jogo, WhatsApp, carregamentos,
//    passe x 2, taxas de estacionamento e o mapa da rede ficam de fora;
//  - as linhas saem do título («Linhas 72 e 92», «LINHA 09» → 9, listas longas com «e»);
//  - sem data de fim; o aviso de amanhã fica «Futuro»; operador «TUB» e chave de linha igual à das linhas guardadas (tub|72).
// Uso: APP=<pasta da app> node --import tsx auditoria/avisos-tub.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const APP = process.env.APP || '../parou';
process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'avisos-tub-'));
globalThis.fetch = async () => new Response('sem rede no teste', { status: 503 });
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const C = await import(path.join(APP, 'src/server/centralAlertsEngine.ts'));
const AE = await import(path.join(APP, 'src/server/alertasEngine.ts'));
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const feed = JSON.parse(fs.readFileSync(path.join(DIR, 'tub-avisos-2026-11-27.json'), 'utf8'));
const agora = '2026-11-27T10:00:00.000Z';
const avisos = feed.result.map((i) => C.avisoDaTub(i, agora)).filter(Boolean);
const por = (re) => avisos.find((a) => re.test(a.título));

ok('feed real: 19 avisos publicados', feed.status === 'success' && feed.result.length === 19);
ok('ficam só os do serviço (10 a 13)', avisos.length >= 10 && avisos.length <= 13, `${avisos.length}: ${avisos.map((a) => a.título.slice(0, 40)).join(' | ')}`);
for (const fora of [/Concurso Postal/, /jogo TUB/, /whatsapp/i, /Multibanco/, /Passe x 2/, /Taxas/, /Mapa da rede/]) ok(`fica de fora: ${fora}`, !por(fora));
const l7292 = por(/Linhas 72 e 92/);
ok('«Linhas 72 e 92»: linhas 72 e 92, alteração de percurso', JSON.stringify(l7292?.linhas) === '["72","92"]' && /percurso/.test(l7292?.tipo || ''), `${l7292?.linhas} ${l7292?.tipo}`);
const l9 = por(/LINHA 09/);
ok('«LINHA 09 | Novos horários»: linha 9 (sem o zero), novo horário', JSON.stringify(l9?.linhas) === '["9"]' && /hor[aá]rio/.test(l9?.tipo || ''), `${l9?.linhas} ${l9?.tipo}`);
const longa = por(/Linhas 7, 14, 21/);
ok('lista longa: 13 linhas, com a 907 e a 933', longa?.linhas.length === 13 && longa.linhas.includes('907') && longa.linhas.includes('933'), JSON.stringify(longa?.linhas));
const amanha = por(/Conselheiro Torres de Almeida/);
ok('aviso publicado para amanhã (28/11): «Futuro»', amanha?.status === 'Futuro', amanha?.status);
ok('avisos de hoje para trás: «Ativo», sem data de fim', l7292?.status === 'Ativo' && l7292?.end_datetime === null);
ok('operador TUB, Braga, fonte oficial', avisos.every((a) => a.operador === 'TUB' && a.região === 'Braga' && a.source === C.FONTE_AVISOS_TUB));
ok('ids estáveis (o mesmo aviso não se duplica)', new Set(avisos.map((a) => a.external_id)).size === avisos.length && l7292.external_id === 'tub-1764');
ok('chave de linha igual à da linha guardada na app (tub_braga 72 → tub|72)', AE.chaveLinha('TUB', '72') === 'tub|72' && AE.chaveLinha('tub_braga', '72') === 'tub|72', `${AE.chaveLinha('TUB', '72')} ${AE.chaveLinha('tub_braga', '72')}`);
ok('formato desconhecido não dá avisos', C.avisoDaTub({ foo: 1 }, agora) === null);

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
