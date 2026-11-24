// Testa as greves (pedidos no Reddit, verificados no site a 24/11/2026):
//  - os avisos oficiais da CP (https://www.cp.pt/avisos) entram: a greve do SMAQ de 23 a 27/11 é «greve» com as datas
//    certas (do início do dia 23 ao fim do dia 27, hora de Lisboa) e os outros dias com perturbações vão à parte;
//  - um plenário (ex.: Alsa Todi) ou «possíveis constrangimentos» não leva o selo de greve, mesmo com a causa STRIKE;
//  - a página /greves mostra a CP como greve (não «Notícias de greve»), com as datas na grelha, e os plenários noutra secção;
//  - o HTML nunca traz «hoje»/«amanhã» escritos (as páginas ficam em cache e no Google): só datas por extenso num <time>,
//    que o browser troca na hora de mostrar;
//  - as descrições (meta description) ficam inteiras, até 155 caracteres, sem reticências.
// Uso: APP=<pasta da app> tsx auditoria/greves-avisos.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-greves-')); // antes de importar a app
const APP = process.env.APP || '../parou';
const C = await import(`${APP}/src/server/centralAlertsEngine.ts`);
const P = await import(`${APP}/src/server/seo/paginas.ts`);
const T = await import(`${APP}/src/server/seo/texto.ts`);
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
// Datas em Lisboa sem bibliotecas (o teste corre fora da pasta da app)
const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const partes = (d) => Object.fromEntries(FMT.formatToParts(d).map((x) => [x.type, x.value]));
const emLisboa = (iso) => { const p = partes(new Date(iso)); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; };
/** Hora h:m de hoje + dias, em Lisboa, como ISO (UTC) */
function lisboa(dias, h = 0, m = 0) {
  const p = partes(new Date());
  const base = Date.UTC(+p.year, +p.month - 1, +p.day + dias, h, m);
  const q = partes(new Date(base));
  const desvio = Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute) - base;
  return new Date(base - desvio).toISOString();
}
const diaIso = (dias) => lisboa(dias, 12).slice(0, 10);

// --- 1. Plenários e possíveis constrangimentos não são greves
ok('[tipo] plenário com a causa STRIKE não é greve',
  C.classifyAlertType('Plenário de trabalhadores na Alsa Todi', 'Poderão ocorrer constrangimentos no serviço entre as 10h e as 12h.', 'STRIKE') !== 'greve',
  C.classifyAlertType('Plenário de trabalhadores na Alsa Todi', 'Poderão ocorrer constrangimentos no serviço entre as 10h e as 12h.', 'STRIKE'));
ok('[tipo] «possíveis constrangimentos» não é greve', C.classifyAlertType('Possíveis constrangimentos na área 4', 'Devido a plenário de trabalhadores.') !== 'greve');
ok('[tipo] greve continua a ser greve', C.classifyAlertType('Greve - serviços mínimos a 24 e 25 de novembro', 'Por motivo de greve convocada pelo SMAQ') === 'greve');
ok('[tipo] greve com plenário no texto continua greve (o título diz greve)', C.classifyAlertType('Greve na Carris', 'Haverá também um plenário.') === 'greve');

// --- 2. Avisos reais da CP
const fixture = JSON.parse(fs.readFileSync(path.join(aqui, 'fixtures/cp-avisos.json'), 'utf8'));
const avisos = fixture.item.map((x) => C.avisoDaCp(x, '2026-11-24T20:00:00Z'));
const greve = avisos.find((a) => a && a.external_id === 'greve-23a27-nov');
ok('[cp] o aviso da greve do SMAQ é lido', !!greve, JSON.stringify(avisos.map((a) => a && a.external_id)));
if (greve) {
  ok('[cp] é uma greve', greve.tipo === 'greve', greve.tipo);
  ok('[cp] título do aviso', greve.título === 'Greve - serviços mínimos a 24 e 25 de novembro', greve.título);
  ok('[cp] operador CP', greve.operador === 'CP');
  ok('[cp] começa no início do dia 23/11 (Lisboa)', emLisboa(greve.start_datetime) === '2026-11-23 00:00', greve.start_datetime);
  ok('[cp] acaba no fim do dia 27/11 (Lisboa)', emLisboa(greve.end_datetime) === '2026-11-27 23:59', greve.end_datetime);
  ok('[cp] liga ao aviso oficial', greve.source_url === 'https://www.cp.pt/pt/detalhe-aviso/greve-23a27-nov', greve.source_url);
  ok('[cp] o resumo diz quem convocou', /SMAQ/.test(greve.descrição), greve.descrição.slice(0, 80));
}
const plataformas = avisos.find((a) => a && a.external_id === 'plataformas-intercidades-23-27-novembro');
ok('[cp] mudança de plataformas não é greve', plataformas && plataformas.tipo !== 'greve', plataformas && plataformas.tipo);
ok('[cp] aviso sem datas (validação obrigatória) fica de fora', !avisos.find((a) => a && a.external_id === 'validacao-obrigatoria'));

// Outros dias com perturbações ("22 e 28") escritos no aviso
{
  const item = JSON.parse(JSON.stringify(fixture.item.find((x) => x.friendlyUrlPath === 'greve-23a27-nov')));
  const texto = item.contentFields['pt-PT'].find((f) => f.name === 'RichText98970637');
  texto.contentFieldValue.data += '\n<p>Poderão ainda ocorrer perturbações na circulação nos dias 22 e 28 de novembro.</p>';
  const a = C.avisoDaCp(item, '2026-11-24T20:00:00Z');
  ok('[cp] dias de perturbação fora da greve: 22 e 28/11', JSON.stringify(a?.dias_perturbacao) === '["2026-11-22","2026-11-28"]', JSON.stringify(a?.dias_perturbacao));
  const sem = C.avisoDaCp(fixture.item.find((x) => x.friendlyUrlPath === 'greve-23a27-nov'), '2026-11-24T20:00:00Z');
  ok('[cp] sem esses dias no texto, não inventa', !sem?.dias_perturbacao, JSON.stringify(sem?.dias_perturbacao));
}

// --- 3. Página /greves
const g = (o) => ({ id: o.id, titulo: o.titulo, resumo: o.resumo || '', operador: o.operador || '', inicio: o.inicio ?? null, fim: o.fim ?? null, aDecorrer: !!o.aDecorrer, url: o.url || '', fonte: o.fonte || 'Operador', origem: o.origem || 'operador', publicada: o.publicada ?? null, chaves: o.chaves, geral: false, tipo: o.tipo || 'greve', perturbacoes: o.perturbacoes || [] });
P._paginas.semearGreves([
  g({ id: 'oficial:cp', titulo: 'Greve - serviços mínimos a 24 e 25 de novembro', operador: 'CP', chaves: ['cp'], aDecorrer: true,
    inicio: lisboa(-1), fim: lisboa(3, 23, 59), url: 'https://www.cp.pt/pt/detalhe-aviso/greve-23a27-nov',
    perturbacoes: [diaIso(-2), diaIso(4)] }),
  g({ id: 'oficial:mts', titulo: 'Greve no Metro Sul do Tejo', operador: 'Metro Sul do Tejo', chaves: ['mts'], aDecorrer: false,
    inicio: lisboa(1, 5), fim: lisboa(1, 23) }),
  g({ id: 'oficial:alsa', titulo: 'Plenário de trabalhadores na Alsa Todi', operador: 'Carris Metropolitana', chaves: ['carris-metropolitana'], tipo: 'constrangimento',
    aDecorrer: false, inicio: lisboa(1, 10), fim: lisboa(1, 12) }),
  g({ id: 'noticia:x', titulo: 'Maquinistas da CP em greve esta semana', origem: 'noticia', fonte: 'RTP Notícias', chaves: ['cp'], publicada: new Date(Date.now() - 5 * 3600_000).toISOString(), url: 'https://www.rtp.pt/x' }),
], true);
const h = await P._paginas.paginaGreves();
const corpo = h.slice(h.indexOf('<main>'), h.indexOf('</main>'));
const celula = (nome) => (new RegExp(`<a href="/greves/[^"]+"><b>${nome}</b><small>([^<]*)</small>`).exec(corpo) || [])[1] || '';
ok('[página] CP na grelha como greve (não «Notícias de greve»)', /^Greve a decorrer/.test(celula('CP')), celula('CP'));
ok('[página] CP na grelha com a data do fim', /até \d\d\/\d\d/.test(celula('CP')), celula('CP'));
ok('[página] Metro Sul do Tejo: «Greve anunciada» com a data', /^Greve anunciada · \d\d\/\d\d/.test(celula('Metro Sul do Tejo')), celula('Metro Sul do Tejo'));
ok('[página] plenário: a Carris Metropolitana não leva selo de greve', !/Greve/.test(celula('Carris Metropolitana')), celula('Carris Metropolitana'));
const iPlen = corpo.indexOf('Plenários e possíveis constrangimentos');
const iOf = corpo.indexOf('Anunciadas pelos operadores');
ok('[página] há uma secção de plenários e possíveis constrangimentos', iPlen > 0);
ok('[página] o plenário está nessa secção e não nas greves', iPlen > 0 && corpo.indexOf('Alsa Todi') > iPlen && !corpo.slice(iOf, iPlen).includes('Alsa Todi'));
ok('[página] a greve da CP liga ao aviso oficial', corpo.includes('https://www.cp.pt/pt/detalhe-aviso/greve-23a27-nov'));
ok('[página] os outros dias com perturbações aparecem', /prevê perturbações também a/.test(corpo), (corpo.match(/prevê perturbações também a[^<]*/) || [''])[0]);
// Datas: nunca «hoje»/«amanhã»/«ontem» escritos no HTML (só no browser)
const semScripts = h.replace(/<script[\s\S]*?<\/script>/g, '');
ok('[datas] o HTML não tem «amanhã», «hoje às» nem «ontem»', !/amanhã|hoje às|\bontem\b/i.test(semScripts.replace(/Greves nos transportes hoje|Greves de transportes hoje|Há greve hoje\?|hoje e próximas/g, '')),
  (semScripts.match(/.{30}(amanhã|hoje às|ontem).{30}/i) || [''])[0]);
ok('[datas] as datas vão num <time datetime> para o browser', /<time datetime="[^"]+" data-quando="[^"]*">[^<]+<\/time>/.test(corpo));
ok('[datas] a página traz o script que as troca', /time\[data-quando\]/.test(h));
// O script do browser: corre-o num documento simulado e vê que troca para «amanhã às 05:00»
{
  const script = (h.match(/<script>(\(function\(\)\{var L=[\s\S]*?)<\/script>/) || [])[1];
  ok('[datas] script encontrado', !!script);
  if (script) {
    const el = { attrs: { datetime: lisboa(1, 5), 'data-quando': '05:00' }, textContent: 'x', getAttribute(n) { return this.attrs[n]; } };
    const longe = { attrs: { datetime: lisboa(5, 9), 'data-quando': '' }, textContent: 'por extenso', getAttribute(n) { return this.attrs[n]; } };
    const documento = { documentElement: { lang: 'pt-PT' }, querySelectorAll: () => [el, longe] };
    new Function('document', script)(documento);
    ok('[datas] no browser, amanhã às 05:00 lê-se «amanhã às 05:00»', el.textContent === 'amanhã às 05:00', el.textContent);
    ok('[datas] datas longe ficam por extenso', longe.textContent === 'por extenso', longe.textContent);
  }
}
const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
ok('[descrição] /greves inteira, até 155, sem reticências', desc.length <= 155 && !/…|\.\.\.$/.test(desc), `${desc} (${desc.length})`);

// Página da CP
{
  const cp = P.OPERADORES_GREVE.find((x) => x.slug === 'cp');
  const hc = await P._paginas.paginaGrevesOperador(cp);
  ok('[cp] página /greves/cp diz greve a decorrer', /Greve a decorrer/.test(hc));
  const d = (hc.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  ok('[cp] descrição sem «amanhã»/«hoje às» e sem reticências', !/amanhã|hoje às|…/.test(d) && d.length <= 155, `${d} (${d.length})`);
  const faq = (hc.match(/"@type":"FAQPage"[\s\S]*?<\/script>/) || [''])[0];
  ok('[cp] perguntas frequentes (Google) sem «amanhã»/«hoje às»', !/amanhã|hoje às/.test(faq));
  const cm = P.OPERADORES_GREVE.find((x) => x.slug === 'carris-metropolitana');
  const hm = await P._paginas.paginaGrevesOperador(cm);
  ok('[plenário] /greves/carris-metropolitana não diz que há greve', !/Greve a decorrer|Greve anunciada/.test(hm.slice(hm.indexOf('<main>'), hm.indexOf('<h2>'))), '');
  ok('[plenário] /greves/carris-metropolitana mostra o plenário à parte', /Plenários e possíveis constrangimentos[\s\S]*Alsa Todi/.test(hm));
}

// --- 3b. Textos que ficam guardados (publicações automáticas da comunidade, posts do canal do WhatsApp): datas por extenso
{
  const A = await import(`${APP}/src/server/alertasEngine.ts`);
  const t = A.quandoFixo(lisboa(1, 7));
  ok('[canal] data por extenso, sem «amanhã»', /^[a-zçáéíóú]+, \d{1,2} de [a-zç]+ às 07:00$/.test(t) && !/amanh|hoje|ontem/.test(t), t);
  const fonte = (await import('node:fs')).readFileSync(`${APP}/src/server/alertasEngine.ts`, 'utf8');
  const corpoCanal = fonte.slice(fonte.indexOf('export async function candidatosPush'), fonte.indexOf('export async function candidatosPush') + 9000);
  ok('[canal] no canal, as datas dos avisos do IPMA e das greves usam quandoFixo', (corpoCanal.match(/canal \? quandoFixo/g) || []).length >= 3);
}

// --- 4. Descrições inteiras
const longa = 'Há greve hoje? Greves anunciadas no metro de Lisboa e do Porto, na CP e nos comboios, na Carris, na STCP, na Fertagus e noutros transportes, com datas, serviços mínimos e notícias. Atualizado sempre.';
const d1 = T.descricaoInteira(longa);
ok('[descrição] texto longo fica com frases inteiras, sem reticências', d1.length <= 155 && !d1.includes('…') && /[.!?]$/.test(d1), `${d1} (${d1.length})`);
const d2 = T.descricaoInteira('Horários de autocarro, metro, comboio e barco em Portugal: Carris Metropolitana, Carris, Metro de Lisboa, CP, STCP, Metro do Porto e mais 24 operadores e muitas outras coisas que não cabem');
ok('[descrição] frase única longa: corta na vírgula e fecha com ponto', d2.length <= 155 && !d2.includes('…') && d2.endsWith('.') && !/\s(e|de|com)\.$/.test(d2), `${d2} (${d2.length})`);
ok('[descrição] texto curto fica igual', T.descricaoInteira('Curta.') === 'Curta.');

console.log(falhas ? `${falhas} testes falharam` : 'Todos os testes passaram');
process.exit(falhas ? 1 : 0);
