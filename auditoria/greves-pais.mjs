// Greves no país todo e nas ilhas (pedido do Dinis, 26/11/2026: «estas lógicas têm de funcionar para o país todo, todas as
// operadoras, linhas, rotas, greves, TUDO, mesmo o país todo e ilhas»; e «as informações deviam atualizar-se sozinhas e
// deixar de aparecer quando deixam de estar em vigor»).
//  - sites dos operadores (leitor genérico): aviso real da MTS (pré-aviso do SMAQ, serviços mínimos só na Linha 3 entre as
//    7h e as 9h e as 17h e as 19h) e um aviso tipo SMTUC (sem data nos metadados, «25 de Novembro, 2026» no texto);
//    ligações de greve na lista (mesmo site, sem páginas de categoria);
//  - todos os operadores da app (continente e ilhas) ligam-se aos nomes dos avisos e das notícias; Metro de Lisboa pelas cores;
//  - serviços mínimos por número de linha e por janelas de horas;
//  - fontes em falha: aviso sem data de fim tirado ao fim de 30 min sem confirmação, os que têm data ficam;
//  - fim escrito no texto dos avisos da CP («até 31 de dezembro»).
// Uso: APP=<pasta da app> node --import tsx auditoria/greves-pais.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const APP = process.env.APP || '../parou';
process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'greves-pais-'));
globalThis.fetch = async () => new Response('sem rede no teste', { status: 503 });
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const { createRequire } = await import('node:module');
const { DateTime } = createRequire(path.join(path.resolve(APP), 'package.json'))('luxon');
const AO = await import(path.join(APP, 'src/server/avisosOperadores.ts'));
const G = await import(path.join(APP, 'src/server/grevesNoticias.ts'));
const P = await import(path.join(APP, 'src/server/grevesPlaneador.ts'));
const C = await import(path.join(APP, 'src/server/centralAlertsEngine.ts'));
const L = (s) => DateTime.fromISO(s, { zone: 'Europe/Lisbon' }).toMillis();
const AQUI = path.dirname(new URL(import.meta.url).pathname);

// ------------------------------------------------------------ MTS (aviso real de 13/11/2026)
const MTS = AO.SITES_OPERADORES.find((s) => s.operador === 'Metro Sul do Tejo');
const html = fs.readFileSync(path.join(AQUI, 'fixtures/mts-greve-smaq.html'), 'utf8');
const art = AO.artigoGenerico(html);
ok('MTS: título sem o nome do site, data dos metadados e texto do aviso', art && art.titulo === 'MTS CONFRONTADA COM NOVO PRÉ-AVISO DE GREVE DO SMAQ' && art.publicada === '2026-11-13T12:13:47+00:00' && /Linha 3/.test(art.texto) && !/Todos os direitos/.test(art.texto), JSON.stringify([art?.titulo, art?.publicada]));
const a = AO.avisoDoSite(MTS, 'https://www.mts.pt/mts-confrontada-com-novo-pre-aviso-de-greve-do-smaq/', html, new Date('2026-11-14T10:00:00Z'));
ok('MTS: greve de 16 a 22 de novembro, oficial', a && a.tipo === 'greve' && a.operador === 'Metro Sul do Tejo' && a.start_datetime.startsWith('2026-11-16') && a.end_datetime.startsWith('2026-11-22') && a.source === AO.FONTE_AVISOS_OPERADORES, JSON.stringify([a?.start_datetime, a?.end_datetime, a?.source]));
const sv = a?.servico_na_greve;
ok('MTS: serviços mínimos só na Linha 3, das 7h às 9h e das 17h às 19h', sv && sv.linhas.includes('3') && JSON.stringify(sv.janelas) === '[[420,540],[1020,1140]]', JSON.stringify(sv));
const gm = P.grevesDosAvisos([a], L('2026-11-14T10:00'));
const t3a = P.greveDoTroco('mts', L('2026-11-17T08:00'), gm, { linha: '3' });
const t3b = P.greveDoTroco('mts', L('2026-11-17T12:00'), gm, { linha: '3' });
const t1 = P.greveDoTroco('mts', L('2026-11-17T08:00'), gm, { linha: '1' });
ok('MTS: Linha 3 às 8h = serviço reduzido; às 12h = sem serviço; Linha 1 = sem serviço', t3a?.reduzido && !t3a?.semServico && t3b?.semServico && t1?.semServico, JSON.stringify([t3a, t3b, t1].map((x) => x && (x.reduzido ? 'reduzido' : x.semServico ? 'sem' : 'greve'))));
ok('MTS: aviso de uma greve que já acabou não aparece', AO.avisoDoSite(MTS, 'u', html, new Date('2026-11-26T10:00:00Z')) === null);

// ------------------------------------------------------------ SMTUC (WordPress, data só no texto)
const SMTUC = AO.SITES_OPERADORES.find((s) => s.operador === 'SMTUC');
const lista = `<html><body><nav><a href="https://www.smtuc.pt/category/avisos/">Avisos</a></nav>
  <article><h2><a href="https://www.smtuc.pt/novidades/fesinap-convoca-greve-para-a-proxima-4a-feira/">02/12: GREVE FESINAP</a></h2></article>
  <article><h2><a href="https://www.smtuc.pt/novidades/alteracao-linha-7/">Alteração na linha 7</a></h2></article>
  <a href="https://outro-site.pt/greve-geral">Greve geral (noutro site)</a>
  <a href="https://www.smtuc.pt/category/greve/">Categoria greve</a></body></html>`;
const ligs = AO.ligacoesDeGreve(lista, 'https://www.smtuc.pt/category/avisos/');
ok('lista de avisos: só a ligação da greve, do mesmo site, sem páginas de categoria', JSON.stringify(ligs) === '["https://www.smtuc.pt/novidades/fesinap-convoca-greve-para-a-proxima-4a-feira/"]', JSON.stringify(ligs));
const artigoSmtuc = `<html><head><title>FESINAP convoca greve para a próxima 4ª feira - SMTUC</title></head><body><header><nav>Menu</nav></header>
  <article><h1>FESINAP convoca greve para a próxima 4ª feira</h1><div class="entry-content"><p>25 de Novembro, 2026 em Avisos, Destaques, Notícias</p>
  <p>Os Serviços Municipalizados de Transportes Urbanos de Coimbra (SMTUC) informam que na próxima quarta-feira, dia 2 de dezembro, a rede de transportes poderá sofrer perturbações em resultado da greve convocada pela Federação Nacional dos Sindicatos Independentes da Administração Pública e de Entidades com Fins Públicos (FESINAP).</p>
  <p>Os SMTUC lamentam os incómodos que possam ocorrer devido à greve.</p></div></article><footer>© SMTUC</footer></body></html>`;
const s = AO.avisoDoSite(SMTUC, ligs[0], artigoSmtuc, new Date('2026-11-26T22:00:00Z'));
ok('SMTUC: greve a 2 de dezembro (data da página no texto)', s && s.tipo === 'greve' && s.operador === 'SMTUC' && s.start_datetime.startsWith('2026-12-02') && s.status === 'Futuro', JSON.stringify([s?.start_datetime, s?.status]));
const gs = P.grevesDosAvisos([s], L('2026-11-26T22:00'));
const ts = P.greveDoTroco('smtuc', L('2026-12-02T09:00'), gs, { linha: '7' });
ok('SMTUC: autocarro da SMTUC a 2/12 leva a greve (pode não circular)', ts && !ts.reduzido && !ts.semServico && ts.operador === 'SMTUC', JSON.stringify(ts));
ok('SMTUC: Metro Mondego (outro operador de Coimbra) não leva a greve da SMTUC', !P.greveDoTroco('metro_mondego', L('2026-12-02T09:00'), gs, { linha: 'U1' }));
const semDataRelativa = AO.avisoDoSite(SMTUC, 'u', artigoSmtuc.replace('25 de Novembro, 2026 em', 'Em').replace(', dia 2 de dezembro', ''), new Date('2026-11-26T22:00:00Z'));
ok('aviso sem data na página e só com «quarta-feira»: não cria greve (podia ser qualquer quarta)', semDataRelativa === null, JSON.stringify(semDataRelativa && semDataRelativa.start_datetime));

// página real da SMTUC (26/11/2026): o 1.º <h1> é «Blog», a data aparece como «25 de Novembro, 2026» no topo e no fim
const real = fs.readFileSync(path.join(AQUI, 'fixtures/smtuc-greve-fesinap.html'), 'utf8');
const ar = AO.artigoGenerico(real);
ok('SMTUC (página real): o título é o do aviso, não «Blog»', ar && ar.titulo === 'FESINAP convoca greve para a próxima 4ª feira', ar?.titulo);
const sr = AO.avisoDoSite(SMTUC, 'https://www.smtuc.pt/novidades/fesinap-convoca-greve-para-a-proxima-4a-feira/', real, new Date('2026-11-26T23:50:00Z'));
ok('SMTUC (página real): greve só a 2 de dezembro (a data da página não é dia de greve)', sr && sr.start_datetime.startsWith('2026-12-02') && sr.end_datetime.startsWith('2026-12-02') && sr.título === 'FESINAP convoca greve para a próxima 4ª feira', JSON.stringify(sr && [sr.título, sr.start_datetime, sr.end_datetime]));
// STAL (SMTUC, 16/11/2026): «próxima sexta-feira e sábado, dias 20 e 21», com a data de alteração «26 de Novembro, 2026» no fim
const stal = `<html><head><title>STAL convoca greve para esta 6ª feira e sábado &#8211; SMTUC</title></head><body><header><h1>Blog </h1></header><article><h2>STAL convoca greve para esta 6ª feira e sábado</h2>
  <p>16 de Novembro, 2026 em Avisos , Dicas , Eventos</p><p>Os Serviços Municipalizados de Transportes Urbanos de Coimbra (SMTUC) informam que o Sindicato Nacional dos Trabalhadores da Administração Local e Regional (STAL) convocou uma jornada de greve para a próxima sexta-feira e sábado, dias 20 e 21 respetivamente.</p>
  <p>Os SMTUC lamentam eventuais transtornos.</p><p>26 de Novembro, 2026 PARTILHAR</p></article></body></html>`;
ok('carimbo de alteração no fim («26 de Novembro, 2026»): não cria uma greve a 26/11', AO.avisoDoSite(SMTUC, 'u-stal', stal, new Date('2026-11-26T23:50:00Z')) === null);
const st2 = AO.avisoDoSite(SMTUC, 'u-stal', stal, new Date('2026-11-17T10:00:00Z'));
ok('STAL: «6ª feira e sábado» publicado a 16/11 → greve de 20 a 21/11', st2 && st2.start_datetime.startsWith('2026-11-20') && st2.end_datetime.startsWith('2026-11-21'), JSON.stringify(st2 && [st2.start_datetime, st2.end_datetime]));
ok('«4ª feira» lê-se quarta-feira', G.diasDaGreve('greve na próxima 4ª feira', DateTime.fromISO('2026-11-26T10:00:00Z'))[0]?.toISODate() === '2026-12-02');

// ------------------------------------------------------------ todos os operadores da app (manifesto dos dados)
const manif = (() => { try { return JSON.parse(fs.readFileSync(path.join(AQUI, '../manifest.json'), 'utf8')); } catch { return []; } })();
const feeds = (Array.isArray(manif) ? manif : manif.feeds || []).map((f) => f.id).filter(Boolean);
const semNome = feeds.filter((f) => P.nomesDoOperador(f).length === 0 && !/^tld-/.test(f));
ok(`todos os operadores da app (${feeds.length}, continente e ilhas) têm nomes para ligar às greves`, feeds.length >= 20 && semNome.length === 0, semNome.join(', '));
const norm = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
for (const [feed, nome] of [['horarios_funchal', 'Horários do Funchal'], ['siga_rodoeste', 'Rodoeste'], ['cam_madeira', 'CAM'], ['tub_braga', 'TUB'], ['guimabus', 'Guimabus'], ['vamus', 'Vamus Algarve'], ['proximo_faro', 'Próximo'], ['tcb_barreiro', 'TCB Barreiro'], ['mdb-1272', 'MobiCascais'], ['transtejo_soflusa', 'Transtejo Soflusa'], ['carris_metropolitana', 'Carris Metropolitana']]) {
  ok(`greve «${nome}» chega ao operador ${feed}`, P.nomesDoOperador(feed).includes(norm(nome)), JSON.stringify(P.nomesDoOperador(feed)));
}
// notícias regionais e das ilhas: o título reconhece o operador
const noticia = (titulo) => ({ titulo, resumo: '', fonte: 'RTP Notícias', url: `https://x/${encodeURIComponent(titulo)}`, data: '2026-11-26T10:00:00Z' });
const nr = G.grevesDasNoticias([noticia('Greve nos Horários do Funchal a 3 de dezembro'), noticia('Atlânticoline: greve dos marítimos a 4 de dezembro'), noticia('Guimabus em greve a 5 de dezembro'), noticia('Greve na Infraestruturas de Portugal a 9 de dezembro pára comboios')], new Date('2026-11-26T12:00:00Z'));
ok('notícias: Madeira, Açores, Guimarães e Infraestruturas de Portugal (comboios da CP)', JSON.stringify(nr.map((x) => x.operador).sort()) === JSON.stringify(['Atlânticoline', 'CP', 'Guimabus', 'Horários do Funchal']), JSON.stringify(nr.map((x) => x.operador)));
ok('fontes de notícias regionais (Coimbra, Minho, Algarve, Leiria, Aveiro)', ['Notícias de Coimbra', 'O Minho', 'Postal do Algarve', 'Região de Leiria', 'Diário de Aveiro'].every((n) => G.FONTES_RSS_GREVES.some((f) => f.nome === n)));

// Metro de Lisboa: linhas pelas cores (códigos Az, Am, Vd, Vm na base)
const ml = P.grevesDosAvisos([{ tipo: 'greve', status: 'Futuro', operador: 'Metro de Lisboa', título: 'Greve no Metro', source_url: 'u', start_datetime: '2026-12-10T00:00:00Z', end_datetime: '2026-12-10T23:59:59Z', source: 'x', servico_na_greve: { linhas: ['azul'], trocos: [] } }], L('2026-11-26T12:00'));
const az = P.greveDoTroco('metro_lisboa', L('2026-12-10T10:00'), ml, { linha: 'Az' });
const vd = P.greveDoTroco('metro_lisboa', L('2026-12-10T10:00'), ml, { linha: 'Vd' });
ok('Metro de Lisboa: «só a Linha Azul» → Az funciona (reduzido), Vd sem serviço', az?.reduzido && vd?.semServico, JSON.stringify([az, vd].map((x) => x && (x.reduzido ? 'reduzido' : x.semServico ? 'sem' : 'greve'))));
const sv2 = G.servicoNaGreve('Durante a greve funcionam apenas as carreiras 201, 205 e 300.');
ok('serviço por números de carreira («apenas as carreiras 201, 205 e 300»)', sv2 && JSON.stringify(sv2.linhas) === '["201","205","300"]', JSON.stringify(sv2));

// ------------------------------------------------------------ fontes em falha e fim dos avisos
const agora = Date.parse('2026-11-26T22:00:00Z');
const falhasMap = new Map();
C.atualizarFalhas(falhasMap, new Set(['Metro do Porto — estado das linhas']), ['Metro do Porto — estado das linhas', 'CP — avisos oficiais'], agora - 31 * 60_000);
const alertas = [
  { source: 'Metro do Porto — estado das linhas', status: 'Ativo', end_datetime: null, título: 'Linha D interrompida' },
  { source: 'Metro do Porto — estado das linhas', status: 'Ativo', end_datetime: '2026-11-30T23:59:59Z', título: 'Obras' },
  { source: 'CP — avisos oficiais', status: 'Ativo', end_datetime: null, título: 'Obras de modernização' },
];
const n = C.retirarSemConfirmacao(alertas, falhasMap, agora);
ok('fonte sem responder há 31 min: o aviso sem data de fim sai (sem confirmação); o que tem data fica; outra fonte fica', n === 1 && alertas[0].status === 'Terminado' && alertas[0].sem_confirmacao && alertas[1].status === 'Ativo' && alertas[2].status === 'Ativo', JSON.stringify(alertas.map((x) => x.status)));
const f2 = new Map(); C.atualizarFalhas(f2, new Set(['A']), ['A'], agora - 10 * 60_000);
const al2 = [{ source: 'A', status: 'Ativo', end_datetime: null }];
ok('fonte sem responder há só 10 min: o aviso fica (uma falha curta não apaga nada)', C.retirarSemConfirmacao(al2, f2, agora) === 0 && al2[0].status === 'Ativo');
C.atualizarFalhas(f2, new Set(), ['A'], agora);
ok('a fonte volta a responder: deixa de estar em falha', !f2.has('A'));
const ini = DateTime.fromISO('2026-11-13', { zone: 'Europe/Lisbon' });
ok('CP sem «Data de fim»: «até 31 de dezembro» no texto dá o fim', C.fimNoTexto('Obras na Linha de Cascais até 31 de dezembro.', ini)?.toISODate() === '2026-12-31');
ok('CP: «até ao dia 15 de janeiro de 2027»', C.fimNoTexto('Transbordo rodoviário até ao dia 15 de janeiro de 2027', ini)?.toISODate() === '2027-01-15');
ok('CP: texto sem fim escrito → sem fim (fica enquanto a CP o mostrar)', C.fimNoTexto('A partir de 8 de novembro de 2026, entraram em vigor novos horários.', ini) === null);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
