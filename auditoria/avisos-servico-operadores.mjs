// Avisos do serviço nos sites dos operadores (não só greves): desvios, alterações de percurso e de horário, supressões,
// paragens desativadas (pedido de 27/11/2026: «ler também os desvios e os horários nesses 12 sites»).
// fixtures/avisos-servico-2026-11-27.json.gz: páginas reais desse dia (STCP «Alterações de serviço», SMTUC, Horários do
// Funchal, MTS). Verifica dias, linhas, tipo, e que páginas fixas (horários, serviços) e notícias antigas ficam de fora.
// Uso: APP=<pasta da app> node --import tsx auditoria/avisos-servico-operadores.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const APP = process.env.APP || '../parou';
process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'avisos-servico-'));
globalThis.fetch = async () => new Response('sem rede no teste', { status: 503 });
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const A = await import(path.join(APP, 'src/server/avisosOperadores.ts'));
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const P = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, 'avisos-servico-2026-11-27.json.gz'))).toString('utf8'));
const agora = new Date('2026-11-27T12:00:00Z');
const site = (o) => A.SITES_OPERADORES.find((s) => s.operador === o);
const ler = (o) => {
  const s = site(o);
  const base = s.paginas.find((p) => P[p]);
  const links = [...new Set([...A.ligacoesDeGreve(P[base], base), ...A.ligacoesDeServico(P[base], base)])];
  return links.filter((u) => P[u]).map((u) => A.avisoDoSite(s, u, P[u], agora)).filter((a) => a && !('anulada' in a));
};
const dia = (iso) => String(iso || '').slice(0, 10);

// ------------------------------------------------------------ STCP («Alterações de serviço»)
ok('STCP: lê a página «Alterações de serviço»', site('STCP').paginas[0] === 'https://stcp.pt/pt/alteracoes-de-servico');
const stcp = ler('STCP');
const por = (lista, re) => lista.find((a) => re.test(a.título));
ok('STCP: 9 avisos', stcp.length === 9, stcp.map((a) => a.título.slice(0, 40)).join(' | '));
const egas = por(stcp, /EGAS MONIZ/);
ok('Egas Moniz: linha 402, dia 27/11 (noite, até às 6h de 28), alteração de percurso', JSON.stringify(egas?.linhas) === '["402"]' && dia(egas?.start_datetime) === '2026-11-27' && egas?.tipo === 'alteração de percurso' && egas?.status === 'Ativo', `${egas?.linhas} ${egas?.start_datetime} ${egas?.end_datetime}`);
const sup = por(stcp, /SUPRESS/);
ok('Supressão da linha 22 «No dia 28» (sem mês): 28/11, cancelamento, Futuro', JSON.stringify(sup?.linhas) === '["22"]' && dia(sup?.start_datetime) === '2026-11-28' && sup?.tipo === 'cancelamento' && sup?.status === 'Futuro', `${sup?.linhas} ${sup?.start_datetime} ${sup?.tipo}`);
const silv = por(stcp, /SILVESTRE/);
ok('Corrida S. Silvestre: linhas 7xx, a 1/12', silv?.linhas.includes('704') && dia(silv?.start_datetime) === '2026-12-01');
ok('Paragem Marquês: paragem encerrada', por(stcp, /MARQU/)?.tipo === 'paragem encerrada');
ok('STCP: todos com fim (nada fica para sempre)', stcp.every((a) => a.end_datetime && Date.parse(a.end_datetime) > Date.parse(a.start_datetime)));

// ------------------------------------------------------------ SMTUC
const smtuc = ler('SMTUC');
const celas = por(smtuc, /Celas/);
ok('SMTUC Celas: alteração de percurso com as linhas citadas (4, 6F, 19A…)', celas?.tipo === 'alteração de percurso' && ['4', '6F', '19A'].every((l) => celas.linhas.includes(l)), JSON.stringify(celas?.linhas));
const l204 = por(smtuc, /Linha 204/);
ok('SMTUC Linha 204 «a partir desta 6ª feira»: linha 204, ativo (mudança que fica: 30 dias)', JSON.stringify(l204?.linhas) === '["204"]' && l204?.status === 'Ativo');
ok('SMTUC: a greve do STAL (já passou) não vira «aviso do serviço»', !smtuc.some((a) => /STAL/.test(a.título)));
ok('páginas fixas («Rede e Horários», «Linha Azul») não são avisos', !por(smtuc, /^Rede e Hor|^Linha Azul|Bot[aâ]nico/));

// ------------------------------------------------------------ Horários do Funchal
const hf = ler('Horários do Funchal');
const c3 = por(hf, /Carreira nº: 003/);
ok('Funchal «Carreira nº: 003 (3)»: linha 3, começa a 2/12 (data do aviso à frente)', JSON.stringify(c3?.linhas) === '["3"]' && dia(c3?.start_datetime) === '2026-12-02' && c3?.status === 'Futuro', `${c3?.linhas} ${c3?.start_datetime}`);
const varias = por(hf, /Carreiras nºs: 031/);
ok('Funchal «Carreiras nºs: 031, 032 … 131»: 7 linhas sem zeros', JSON.stringify(varias?.linhas) === '["31","32","34","37","38","39","131"]', JSON.stringify(varias?.linhas));
ok('Funchal: notícias de março e julho (antigas) ficam de fora', !por(hf, /Nova numera|015 \(15\)/));

// ------------------------------------------------------------ MTS
ok('MTS: a página fixa «Horários» não é um aviso', !por(ler('Metro Sul do Tejo'), /^Hor[aá]rios$/));

// ------------------------------------------------------------ peças
ok('linhas citadas: «Carreira(s) 149 e 150», «linhas 072, 073», «402 . IDA»', JSON.stringify(A.linhasCitadas('Carreira(s) 149 e 150')) === '["149","150"]' && JSON.stringify(A.linhasCitadas('linhas 072, 073')) === '["72","73"]' && JSON.stringify(A.linhasCitadas('402 . IDA . R. Serpa Pinto')) === '["402"]');

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
