// Greves anunciadas só por comunicado às redações (sem aviso no site do operador) passam a aviso e entram nos trajetos.
//
// O problema que isto impede (26/11/2026): a Metro do Porto anunciou na quarta-feira, por comunicado (Lusa, RTP, SAPO…),
// que na sexta-feira 27/11 só funcionavam a linha Amarela e Sra. da Hora–Dragão, e que na quinta o serviço acabava às 23h.
// O site da Metro do Porto continuava a dizer "Ok" e a PAROU não avisava nada.
// Uso: APP=caminho-da-app tsx auditoria/greves-noticias.mjs
const caminho = process.env.APP || '../app';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const G = await import(`${caminho}/src/server/grevesNoticias.ts`);
const P = await import(`${caminho}/src/server/grevesPlaneador.ts`);
const { DateTime } = await import(`${caminho}/node_modules/luxon/src/luxon.js`).catch(() => import('luxon'));

const AGORA = new Date('2026-11-26T02:30:00Z'); // quinta-feira de madrugada
const L = (iso) => DateTime.fromISO(iso, { zone: 'Europe/Lisbon' });
const rtp = {
  titulo: 'Greve dos maquinistas reduz serviço do Metro do Porto na sexta-feira',
  resumo: 'O Metro do Porto vai reduzir o serviço na sexta-feira, com impactos já na quinta-feira, operando apenas na linha Amarela e entre Senhora da Hora e Estádio do Dragão, devido à greve dos maquinistas, foi hoje divulgado. Os efeitos desta paragem começam a fazer-se sentir já amanhã, com o serviço a terminar por volta das 23h00 (e não à 01h00, conforme acontece normalmente).',
  fonte: 'RTP Notícias', url: 'https://www.rtp.pt/noticias/economia/greve-dos-maquinistas-reduz-servico-do-metro-do-porto-na-sexta-feira_n1781632', data: '2026-11-25T18:53:00Z',
};
const sapo = { ...rtp, titulo: 'Atenção utentes do Metro do Porto. Greve dos maquinistas reduz serviço na sexta-feira', fonte: 'SAPO 24', url: 'https://24noticias.sapo.pt/x', data: '2026-11-25T20:42:00Z' };
const cpNoticia = { titulo: 'Greve dos maquinistas da CP cancela 75% dos comboios previstos até às 19:00', resumo: 'A CP suprimiu 797 dos 1.063 comboios programados entre as 00:00 e as 19:00 de hoje.', fonte: 'RTP Notícias', url: 'https://www.rtp.pt/noticias/economia/cp', data: '2026-11-25T19:30:00Z' };
const medicos = { titulo: 'Greve dos médicos na sexta-feira', resumo: 'Hospitais do Porto com serviços mínimos', fonte: 'Público', url: 'https://www.publico.pt/m', data: '2026-11-25T10:00:00Z' };
const unirVerbo = { titulo: 'Sindicatos querem unir esforços para greve geral na sexta-feira', resumo: '', fonte: 'Público', url: 'https://www.publico.pt/u', data: '2026-11-25T10:00:00Z' };
const antiga = { ...rtp, url: 'https://x/antiga', data: '2026-11-10T10:00:00Z', titulo: 'Greve no Metro do Porto na sexta-feira' };

const a = G.grevesDasNoticias([rtp, sapo, cpNoticia, medicos, unirVerbo, antiga], AGORA);
const mp = a.filter((x) => x.operador === 'Metro do Porto');
ok('cria um aviso de greve da Metro do Porto (e um só, com duas notícias)', mp.length === 1, JSON.stringify(a.map((x) => [x.operador, x.start_datetime])));
const g = mp[0] || {};
ok('dia da greve: sexta-feira 27/11 até ao fim do dia', g.end_datetime && L(g.end_datetime).toISODate() === '2026-11-27' && L(g.end_datetime).hour === 23, g.end_datetime);
ok('a greve começa na sexta 00:00', g.start_datetime && L(g.start_datetime).toFormat('yyyy-MM-dd HH:mm') === '2026-11-27 00:00', g.start_datetime);
ok('véspera: serviço a acabar mais cedo desde quinta às 22:00 (últimas partidas ~23h)', g.vespera_desde && L(g.vespera_desde).toFormat('yyyy-MM-dd HH:mm') === '2026-11-26 22:00', g.vespera_desde);
const semHora = G.grevesDasNoticias([{ ...rtp, resumo: 'Com impactos já na quinta-feira.' }], AGORA)[0];
ok('véspera sem hora no texto: 22:00 (o habitual)', semHora && L(semHora.vespera_desde).toFormat('HH:mm') === '22:00', semHora && semHora.vespera_desde);
ok('a fonte é a notícia (dito como tal), com ligação para ela', /^Notícia — RTP Notícias$/.test(g.source || '') && g.source_url === rtp.url && /Fonte: notícia de RTP Notícias \(também SAPO 24\)/.test(g.descrição || ''), g.source);
ok('tipo greve, gravidade grave, região do Porto', g.tipo === 'greve' && g.severity === 'Grave' && g.região === 'Área Metropolitana do Porto');
ok('greve noutro setor (médicos) não cria aviso', !a.some((x) => /medic/i.test(x.título)));
ok('"unir" (verbo) não é a UNIR', !a.some((x) => x.operador === 'UNIR'));
ok('notícia com mais de 10 dias não conta', !a.some((x) => x.source_url === 'https://x/antiga'));
ok('a notícia da CP sem dia na manchete usa "hoje" (25/11) e já passou → nada', !a.some((x) => x.operador === 'CP'), JSON.stringify(a.filter((x) => x.operador === 'CP').map((x) => x.start_datetime)));

// Com aviso oficial do operador para o mesmo dia, fica o oficial
const oficial = { tipo: 'greve', operador: 'Metro do Porto', status: 'Futuro', start_datetime: '2026-11-27T00:00:00Z', end_datetime: '2026-11-27T23:59:00Z' };
ok('com aviso oficial para o mesmo dia, a notícia não duplica', G.grevesDasNoticias([rtp], AGORA, [oficial]).length === 0);

// Desconvocada: não cria aviso e anula o anterior do mesmo dia
const desconv = { titulo: 'Greve no Metro do Porto de sexta-feira foi desconvocada', resumo: 'O SMAQ desconvocou a greve.', fonte: 'Observador', url: 'https://observador.pt/d', data: '2026-11-26T01:00:00Z' };
ok('greve desconvocada: sem aviso', G.grevesDasNoticias([rtp, desconv], AGORA).length === 0);

// Intervalos e datas com o mês
const stcp = { titulo: 'Greve na STCP de 1 a 3 de dezembro', resumo: '', fonte: 'Jornal de Notícias', url: 'https://www.jn.pt/s', data: '2026-11-25T10:00:00Z' };
const s = G.grevesDasNoticias([stcp], AGORA)[0];
ok('"de 1 a 3 de dezembro": do início de 1 ao fim de 3', s && L(s.start_datetime).toISODate() === '2026-12-01' && L(s.end_datetime).toISODate() === '2026-12-03', s && `${s.start_datetime} ${s.end_datetime}`);
const ml = { titulo: 'Metro de Lisboa: greve parcial a 2 e 4 de dezembro', resumo: '', fonte: 'Público', url: 'https://www.publico.pt/ml', data: '2026-11-25T10:00:00Z' };
const m = G.grevesDasNoticias([ml], AGORA)[0];
ok('Metro de Lisboa reconhecido, dias 2 e 4 de dezembro', m && m.operador === 'Metro de Lisboa' && L(m.start_datetime).toISODate() === '2026-12-02');
ok('dia da semana: "na sexta-feira" numa notícia de quarta → 27/11', G.diasDaGreve('greve na sexta-feira', DateTime.fromISO('2026-11-25T18:00:00Z'))[0]?.toISODate() === '2026-11-27');
ok('"amanhã" numa notícia de quarta → 26/11', G.diasDaGreve('greve amanhã', DateTime.fromISO('2026-11-25T18:00:00Z'))[0]?.toISODate() === '2026-11-26');
ok('"esta sexta-feira" numa notícia de sexta → o próprio dia', G.diasDaGreve('greve esta sexta-feira', DateTime.fromISO('2026-11-27T07:00:00Z'))[0]?.toISODate() === '2026-11-27');
ok('dezembro → janeiro: "5 de janeiro" numa notícia de dezembro é do ano seguinte', G.diasDaGreve('greve a 5 de janeiro', DateTime.fromISO('2026-12-20T10:00:00Z'))[0]?.toISODate() === '2027-01-05');

// RSS com CDATA e entidades
const xml = `<rss><channel><item><title><![CDATA[Greve dos maquinistas reduz serviço do Metro do Porto na sexta-feira]]></title><link>https://www.rtp.pt/n1</link><description><![CDATA[<p>O Metro do Porto vai reduzir o servi&ccedil;o&#8230;</p>]]></description><pubDate>Wed, 25 Nov 2026 18:53:00 +0000</pubDate></item><item><title>Benfica ganha</title><link>https://x</link><pubDate>Wed, 25 Nov 2026 18:53:00 +0000</pubDate></item></channel></rss>`;
const lidas = G.noticiasDoRss(xml, 'RTP Notícias');
ok('RSS: lê a notícia de greve (CDATA) e ignora as outras', lidas.length === 1 && lidas[0].url === 'https://www.rtp.pt/n1' && lidas[0].data === '2026-11-25T18:53:00.000Z', JSON.stringify(lidas));
ok('RSS: entidades HTML («&ccedil;») passam a letras', /serviço…$/.test(lidas[0]?.resumo || ''), lidas[0]?.resumo);

// Nos trajetos: o troço do metro na sexta-feira leva a greve, marcada como notícia
const greves = P.grevesDosAvisos(a, AGORA.getTime());
const sexta10h = L('2026-11-27T10:00').toMillis();
const t = P.greveDoTroco('metro_porto', sexta10h, greves);
ok('troço do metro na sexta às 10h: greve, com a notícia como fonte', t && t.operador === 'Metro do Porto' && t.noticia === true && t.url === rtp.url, JSON.stringify(t));
const vesp = P.greveDoTroco('metro_porto', L('2026-11-26T23:30').toMillis(), greves);
ok('quinta às 23h30: perturbação prevista (o serviço acaba às 23h), não greve', vesp && vesp.previsto === true && vesp.noticia === true, JSON.stringify(vesp));
ok('quinta às 10h não', !P.greveDoTroco('metro_porto', L('2026-11-26T10:00').toMillis(), greves));
ok('autocarro da STCP na sexta não leva a greve do metro', !P.greveDoTroco('stcp', sexta10h, greves));

// O que continua a funcionar: linha Amarela e Sra. da Hora–Dragão (textos reais da Lusa e da Fama Rádio)
const sv = G.servicoNaGreve(rtp.resumo + ' Segundo a Metro do Porto, as frequências de passagem em ambas as ligações serão de 15 minutos entre as 07h00 e as 20h00 e de 30 minutos entre as 06h00 e as 07h00.');
ok('serviço na greve: linha Amarela, troço Senhora da Hora–Estádio do Dragão, 15 min das 7h às 20h',
  sv && sv.linhas.join() === 'amarela' && sv.trocos.length === 1 && sv.trocos[0][0] === 'senhora da hora' && sv.trocos[0][1] === 'estadio do dragao' && sv.frequencia === '15 min (7h–20h)', JSON.stringify(sv));
const sv2 = G.servicoNaGreve('Na sexta-feira, os comboios vão circular exclusivamente entre a Sra. da Hora e o Estádio do Dragão, no tronco comum da rede, e no percurso da Linha Amarela (D), entre o Hospital de S. João e Santo Ovídio.');
ok('serviço na greve com "Sra." e "S. João": dois troços', sv2 && sv2.trocos.length === 2 && sv2.trocos[0][0] === 'senhora da hora' && sv2.trocos[1][0] === 'hospital de sao joao' && sv2.trocos[1][1] === 'santo ovidio', JSON.stringify(sv2));
ok('"entre as 07h00 e as 20h00" não é um troço', !(sv?.trocos || []).some(([x]) => /\d/.test(x)));
ok('o aviso leva o serviço que funciona', !!g.servico_na_greve && g.servico_na_greve.linhas.includes('amarela'), JSON.stringify(g.servico_na_greve));

// No trajeto: Dragão → Campanhã (linha B, no tronco comum) funciona com menos viagens; Trindade → Fânzeres (linha F,
// fora do tronco a partir do Dragão) pode não circular; linha D (Amarela) funciona
const ESTACOES_B = ['Póvoa de Varzim', 'Senhora da Hora', 'Sete Bicas', 'Trindade', 'Bolhão', 'Campanhã', 'Estádio do Dragão'];
const viagem = (estacoes) => (a, b, de, para) => {
  // como o planeador: sem acentos e sem "de/do/da", todas as palavras procuradas no nome da estação
  const limpo = (x) => ` ${x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(de|do|da|dos|das|o|a)\b/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const i = (n) => estacoes.findIndex((x) => limpo(n).trim().split(' ').every((w) => limpo(x).includes(` ${w} `)));
  const ia = i(a), ib = i(b), id = estacoes.indexOf(de), ip = estacoes.indexOf(para);
  // (simplificado: o troço anunciado está nesta lista de estações; no planeador é qualquer viagem do operador)
  const passa = ia >= 0 && ib >= 0;
  return { passa, dentro: passa && id >= Math.min(ia, ib) && ip <= Math.max(ia, ib) };
};
const grevesSv = P.grevesDosAvisos(a.map((x) => ({ ...x, servico_na_greve: sv2 })), AGORA.getTime());
const noTronco = P.greveDoTroco('metro_porto', sexta10h, grevesSv, { linha: 'B', dentroDe: (x, y) => viagem(ESTACOES_B)(x, y, 'Estádio do Dragão', 'Campanhã') });
ok('Dragão → Campanhã (linha B, tronco comum): funciona, com serviço reduzido', noTronco && noTronco.reduzido === true, JSON.stringify(noTronco));
const ESTACOES_F = ['Senhora da Hora', 'Trindade', 'Campanhã', 'Estádio do Dragão', 'Contumil', 'Fânzeres'];
const foraF = P.greveDoTroco('metro_porto', sexta10h, grevesSv, { linha: 'F', dentroDe: (x, y) => viagem(ESTACOES_F)(x, y, 'Estádio do Dragão', 'Fânzeres') });
ok('Dragão → Fânzeres (linha F, fora do tronco): pode não circular', foraF && !foraF.reduzido, JSON.stringify(foraF));
const amarela = P.greveDoTroco('metro_porto', sexta10h, P.grevesDosAvisos(a.map((x) => ({ ...x, servico_na_greve: { linhas: ['amarela'], trocos: [] } })), AGORA.getTime()), { linha: 'D' });
ok('linha D (Amarela) anunciada inteira: funciona com serviço reduzido', amarela && amarela.reduzido === true);
const ESTACOES_D = ['Hospital São João', 'Trindade', 'Aliados', 'Santo Ovídio', 'Vila d\'Este'];
const dFora = P.greveDoTroco('metro_porto', sexta10h, grevesSv, { linha: 'D', dentroDe: (x, y) => viagem(ESTACOES_D)(x, y, 'Santo Ovídio', 'Vila d\'Este') });
ok('linha D só entre H. S. João e Santo Ovídio: Santo Ovídio → Vila d\'Este pode não circular', dFora && !dFora.reduzido, JSON.stringify(dFora));
const dDentro = P.greveDoTroco('metro_porto', sexta10h, grevesSv, { linha: 'D', dentroDe: (x, y) => viagem(ESTACOES_D)(x, y, 'Trindade', 'Aliados') });
ok('linha D: Trindade → Aliados funciona', dDentro && dDentro.reduzido === true);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
