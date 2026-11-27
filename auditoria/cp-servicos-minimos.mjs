// Comboios dos serviços mínimos nas greves da CP (lista do que faltava, 27/11/2026: «CP — comboios dos serviços mínimos»).
// Nas greves, o aviso da CP liga PDFs com os comboios garantidos em cada dia (Alfa/Intercidades, Regional, Urbanos de Lisboa,
// Porto e Coimbra). Os textos em fixtures/cp-minimos são o pdftotext -layout dos PDFs reais da greve de 23 a 27/11/2026.
//  - leitura: dias do documento, colunas por dia com «SM» (o 520 só a 25, o 126 só a 24), tabelas sem colunas (todos os dias);
//  - ligações aos PDFs dentro do aviso (JSON da CP);
//  - na app: comboio na lista → «serviço mínimo» (realiza-se); fora da lista → «pode não se realizar»; depois da meia-noite
//    conta a lista do dia anterior; outros operadores e dias sem lista ficam como antes.
// Uso: APP=<pasta da app> node --import tsx auditoria/cp-servicos-minimos.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const APP = process.env.APP || '../parou';
process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-minimos-'));
globalThis.fetch = async () => new Response('sem rede no teste', { status: 503 });
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const { createRequire } = await import('node:module');
const { DateTime } = createRequire(path.join(path.resolve(APP), 'package.json'))('luxon');
const S = await import(path.join(APP, 'src/server/cpServicosMinimos.ts'));
const P = await import(path.join(APP, 'src/server/grevesPlaneador.ts'));
const GP = await import(path.join(APP, 'src/server/grevesPartidas.ts'));
const L = (s) => DateTime.fromISO(s, { zone: 'Europe/Lisbon' }).toMillis();

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/cp-minimos');
const ler = (n) => S.comboiosDoTexto(fs.readFileSync(path.join(DIR, `servicos-minimos-${n}-24e25nov.txt`), 'utf8'), 2026);

// ------------------------------------------------------------ leitura dos PDFs
const lc = ler('lc'), reg = ler('reg'), lx = ler('urb-lx'), pt = ler('urb-pt'), coi = ler('urb-coi');
ok('dias do documento: 24 e 25/11/2026', JSON.stringify(S.diasDoDocumento(fs.readFileSync(path.join(DIR, 'servicos-minimos-lc-24e25nov.txt'), 'utf8'), 2026)) === '["2026-11-24","2026-11-25"]');
ok('Alfa/IC: 180 (Porto–Faro) nos dois dias', lc['2026-11-24']?.includes('180') && lc['2026-11-25']?.includes('180'));
ok('Alfa/IC: 520 só a 25 (coluna do dia 25)', !lc['2026-11-24']?.includes('520') && lc['2026-11-25']?.includes('520'), JSON.stringify(lc['2026-11-24']));
ok('Alfa/IC: 126 e 121 só a 24', lc['2026-11-24']?.includes('126') && !lc['2026-11-25']?.includes('126') && lc['2026-11-24']?.includes('121') && !lc['2026-11-25']?.includes('121'));
ok('Alfa/IC: 529 (chega à 01:43) nos dois dias', lc['2026-11-24']?.includes('529') && lc['2026-11-25']?.includes('529'));
ok('Regional: 3000 Valença–Porto e 850 (com espaço antes do número)', reg['2026-11-24']?.includes('3000') && reg['2026-11-25']?.includes('850'));
ok('Regional: mais de 60 comboios por dia', reg['2026-11-24']?.length > 60, String(reg['2026-11-24']?.length));
ok('Urbanos de Lisboa: 16001 e 18054 (cabeçalho na mesma linha e noutra)', lx['2026-11-24']?.includes('16001') && lx['2026-11-25']?.includes('18054'));
ok('Urbanos do Porto (sem colunas por dia): 15153 nos dois dias', pt['2026-11-24']?.includes('15153') && pt['2026-11-25']?.includes('15153'));
ok('Urbanos do Porto: 71 comboios', pt['2026-11-24']?.length === 71, String(pt['2026-11-24']?.length));
ok('Urbanos de Coimbra: 8 comboios (16801…16831)', coi['2026-11-24']?.length === 8 && coi['2026-11-25']?.includes('16831'));
ok('horas e números de página não viram comboios', !Object.values({ ...lc, ...reg, ...lx, ...pt, ...coi }).flat().some((c) => Number(c) < 100));
const tudo = S.juntarComboios([lc, reg, lx, pt, coi]);
ok('juntar: cada dia com os comboios de todos os documentos', tudo['2026-11-24'].includes('180') && tudo['2026-11-24'].includes('15153') && tudo['2026-11-24'].includes('16001'));

// ------------------------------------------------------------ ligações aos PDFs no aviso
const item = { contentFields: [{ name: 'RichText98970637', contentFieldValue: { data: '<p>Consulte os <a href="https://www.cp.pt/info/documents/d/cp/servicos-minimos-lc-24e25nov">Alfa e IC</a>, <a href="/info/documents/d/cp/servicos-minimos-urb-pt-24e25nov">Urbanos do Porto</a> e <a href="https://www.cp.pt/pt/outra">outra</a>.</p>' } }] };
const pdfs = S.ligacoesServicosMinimos(item);
ok('ligações: as duas dos serviços mínimos, com o endereço completo', pdfs.length === 2 && pdfs.every((u) => u.startsWith('https://www.cp.pt/info/documents/d/cp/servicos-minimos-')), JSON.stringify(pdfs));
ok('número do comboio da viagem (cp:15153_20251226 → 15153)', S.numeroDoComboio('cp:15153_20251226') === '15153' && S.numeroDoComboio('stcp:1_x') === null);

// ------------------------------------------------------------ na app
const alerta = { tipo: 'greve', status: 'Ativo', operador: 'CP', título: 'Greve 23 a 27 nov', source: 'CP — avisos oficiais', source_url: 'https://www.cp.pt/pt/detalhe-aviso/greve-23a27-nov', start_datetime: '2026-11-23T00:00:00.000Z', end_datetime: '2026-11-27T23:59:59.000Z', comboios_minimos: tudo };
const greves = P.grevesDosAvisos([alerta], L('2026-11-24T08:00'));
ok('o aviso leva a lista para o planeador', !!greves[0]?.comboiosMinimos?.['2026-11-24']?.length);
const g = (viagem, quando, feed = 'cp') => P.greveDoTroco(feed, L(quando), greves, { viagem });
ok('180 às 05:40 de 24/11: serviço mínimo', g('cp:180_20260719', '2026-11-24T05:40')?.garantido === true);
ok('520 a 24/11 (só a 25): pode não se realizar', (() => { const x = g('cp:520_20260719', '2026-11-24T06:45'); return x && !x.garantido && !x.semServico && !x.reduzido; })());
ok('520 a 25/11: serviço mínimo', g('cp:520_20260719', '2026-11-25T06:45')?.garantido === true);
ok('529 depois da meia-noite (01:00 de 26): lista de 25', g('cp:529_20260719', '2026-11-26T01:00')?.garantido === true);
ok('dia da greve sem lista (23/11): como antes (pode não se realizar)', (() => { const x = g('cp:180_20260719', '2026-11-23T05:40'); return x && !x.garantido; })());
ok('sem número de comboio: como antes', (() => { const x = g(undefined, '2026-11-24T05:40'); return x && !x.garantido; })());
ok('outro operador não é afetado', g('cp:180_20260719', '2026-11-24T05:40', 'metro_porto') === undefined);
ok('estado na partida: «garantido» e «incerta»', GP.estadoDaGreve(g('cp:180_20260719', '2026-11-24T05:40'))?.estado === 'garantido' && GP.estadoDaGreve(g('cp:520_20260719', '2026-11-24T06:45'))?.estado === 'incerta');
ok('partida de uma paragem (greveDaPartida) usa o número da viagem', GP.greveDaPartida(null, { feed: 'cp', partidaMs: L('2026-11-25T07:20'), trip: 'cp:15153_20251226' }, greves)?.garantido === true);
ok('resumo do aviso diz que há serviços mínimos', GP.resumoDaGreve(null, 'cp', greves[0], false).minimos === true);

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
