// Imagens dos avisos do canal (pedido do Dinis, 27/11/2026: «uma imagem mais temática de cada cidade ou zona … se for
// sobre autocarros aparecer atrás do aviso, metro algo do metro, avarias…»): zona, transporte, tipo, datas e destaque,
// e o texto da SMTUC sem a lista de categorias do blogue no início. Uso: APP=<pasta da app> tsx auditoria/cartaz-aviso.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = process.env.APP || path.resolve('..', 'parou');
const C = await import(pathToFileURL(path.join(APP, 'src/utils/cartazAviso.ts')).href);
const O = await import(pathToFileURL(path.join(APP, 'src/server/avisosOperadores.ts')).href);
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const av = (o) => ({ id: 'x', tipo: 'outros alertas oficiais', 'título': '', 'descrição': '', operador: '', linhas: [], paragens: [], 'região': '', 'municípios': [], start_datetime: '', status: 'Ativo', ...o });

// zona
const z = (o) => C.zonaDoAviso(av(o)).nome;
ok('Metro do Porto -> PORTO', z({ operador: 'Metro do Porto', 'região': 'Área Metropolitana do Porto' }) === 'PORTO');
ok('STCP -> PORTO', z({ operador: 'STCP' }) === 'PORTO');
ok('Carris Metropolitana -> LISBOA', z({ operador: 'Carris Metropolitana', 'região': 'Área Metropolitana de Lisboa', 'municípios': ['Loures'] }) === 'LISBOA');
ok('MobiCascais com região errada (Cávado) continua LISBOA', z({ operador: 'MobiCascais', 'região': 'Cávado / Minho', 'municípios': ['Braga'] }) === 'LISBOA');
ok('TUB -> BRAGA e TUBA -> BARCELOS', z({ operador: 'TUB' }) === 'BRAGA' && z({ operador: 'TUBA Barcelos' }) === 'BARCELOS');
ok('SMTUC -> COIMBRA', z({ operador: 'SMTUC', 'região': 'Coimbra' }) === 'COIMBRA');
ok('Horários do Funchal -> MADEIRA', z({ operador: 'Horários do Funchal', 'região': 'Madeira' }) === 'MADEIRA');
ok('AzoresBus -> AÇORES', z({ operador: 'AzoresBus' }) === 'AÇORES');
ok('CP nacional -> PORTUGAL', z({ operador: 'CP', 'região': 'Nacional', 'municípios': ['Portugal'] }) === 'PORTUGAL');
ok('CP na área do Porto -> PORTO', z({ operador: 'CP', 'região': 'Área Metropolitana do Porto', 'municípios': ['Porto', 'Braga'] }) === 'PORTO');
ok('CP na região de Coimbra -> COIMBRA', z({ operador: 'CP', 'região': 'Região de Coimbra', 'municípios': ['Coimbra'] }) === 'COIMBRA');
ok('CP nacional só com Lisboa e Cascais -> LISBOA', z({ operador: 'CP', 'região': 'Nacional', 'municípios': ['Cascais', 'Oeiras'] }) === 'LISBOA');
ok('Vamus -> ALGARVE', z({ operador: 'Vamus Algarve' }) === 'ALGARVE');

// transporte
const m = (o) => C.modoDoAviso(av(o));
ok('metro / comboio / barco / autocarro', m({ operador: 'Metro do Porto' }) === 'metro' && m({ operador: 'CP' }) === 'comboio'
  && m({ operador: 'Fertagus' }) === 'comboio' && m({ operador: 'Transtejo Soflusa' }) === 'barco' && m({ operador: 'STCP' }) === 'autocarro');
ok('Metro Mondego é autocarro (metrobus)', m({ operador: 'SMTUC', 'título': 'Obras do Metro Mondego desviam linhas' }) === 'autocarro');

// tipo
const t = (o, cat) => C.tipoDoCartaz(av(o), cat).rotulo;
ok('greve', t({ tipo: 'greve', 'título': 'Greve reduz serviço do Metro' }) === 'GREVE');
ok('avaria pelo texto', t({ tipo: 'interrupção', 'título': 'Avaria na catenária interrompe circulação' }) === 'AVARIA');
ok('serviço normal pelo título', t({ tipo: 'outros alertas oficiais', 'título': 'Circulação normalizada na Linha de Sintra' }) === 'SERVIÇO NORMAL');
ok('greve desconvocada', t({ tipo: 'greve', 'título': 'Greve na CP', status: 'Cancelado' }) === 'GREVE DESCONVOCADA');
ok('obras, desvio, mau tempo', t({ tipo: 'obras', 'título': 'Obras na avenida' }) === 'OBRAS' && t({ tipo: 'desvio', 'título': 'Linha 4 desviada' }) === 'DESVIO'
  && t({ 'título': 'Aviso amarelo de chuva forte' }) === 'MAU TEMPO');
ok('escolha à mão no painel manda', t({ tipo: 'interrupção', 'título': 'Avaria no elevador' }, 'obras') === 'OBRAS');

// datas: sempre com o dia escrito (a imagem fica no canal e na Comunidade; «hoje» deixava de ser verdade amanhã)
const agora = new Date('2026-11-27T21:50:00Z');
const q = (o) => C.quandoCurto(av(o), agora);
const v1 = q({ status: 'Ativo', start_datetime: '2026-11-27T00:00:00Z', end_datetime: '2026-11-27T23:59:00Z' });
ok('em curso, só hoje: o dia escrito', v1 === 'SEX 27/11', v1);
ok('dia futuro', q({ status: 'Futuro', start_datetime: '2026-12-02T00:00:00Z', end_datetime: '2026-12-02T23:59:00Z' }) === 'QUA 02/12');
const v2 = q({ status: 'Futuro', start_datetime: '2026-11-28T06:00:00Z', end_datetime: '2026-11-28T14:00:00Z' });
ok('amanhã também com o dia e a hora do fim (nunca «amanhã»)', v2 === 'SÁB 28/11 ATÉ 14:00', v2);
ok('vários dias (fim à meia-noite conta o dia anterior)', q({ status: 'Futuro', start_datetime: '2026-12-08T00:00:00Z', end_datetime: '2026-12-11T00:00:00Z' }) === '08/12 → 10/12');
ok('em curso sem fim', q({ status: 'Ativo', start_datetime: '2026-11-27T20:00:00Z', end_datetime: null }) === 'EM CURSO');
ok('em curso até outro dia', q({ status: 'Ativo', start_datetime: '2026-11-26T20:00:00Z', end_datetime: '2026-11-30T20:00:00Z' }) === 'ATÉ SEG 30/11');

// destaque
const d1 = C.destaqueDoAviso({ linhas: [], servico_na_greve: { linhas: [], trocos: [['Senhora da Hora', 'Estádio do Dragão'], ['Hospital São João', 'Santo Ovídio']] } });
ok('greve: o que funciona, um troço por linha', d1 && d1.etiqueta === 'SÓ FUNCIONA' && d1.texto === 'Senhora da Hora ↔ Estádio do Dragão\nHospital São João ↔ Santo Ovídio', JSON.stringify(d1));
const d2 = C.destaqueDoAviso({ linhas: ['201', '203', '502'] });
ok('linhas afetadas', d2 && d2.etiqueta === 'LINHAS' && d2.texto === '201, 203, 502');
ok('nome do ficheiro', C.nomeDoCartaz({ zona: { nome: 'AÇORES' }, tipo: { rotulo: 'MAU TEMPO' } }) === 'aviso-acores-mau-tempo.jpg');

// texto da SMTUC
ok('SMTUC: tira «. em Avisos , Dicas , Novidades .»', O.semCategoriasNoInicio('. em Avisos , Dicas , Novidades . Os Serviços Municipalizados') === 'Os Serviços Municipalizados');
ok('SMTUC: tira a lista comprida', O.semCategoriasNoInicio('. em Avisos , Eventos , Linhas , Metro Mondego , Novidades , Obras . Os SMTUC informam') === 'Os SMTUC informam');
ok('frase normal fica', O.semCategoriasNoInicio('Em Coimbra, a greve vai afetar as linhas. Os SMTUC') === 'Em Coimbra, a greve vai afetar as linhas. Os SMTUC'
  && O.semCategoriasNoInicio('Em Coimbra, Braga e Porto. Os') === 'Em Coimbra, Braga e Porto. Os');

// Comunidade: zona por lugares, publicações automáticas com imagem própria e validação do que vem da base
ok('lugares: um concelho -> a cidade', C.zonaDosLugares(['Braga']).nome === 'BRAGA');
ok('lugares: distritos do Norte -> NORTE', C.zonaDosLugares(['Vila Real', 'Bragança']).nome === 'NORTE');
ok('lugares: Porto e Lisboa -> PORTUGAL', C.zonaDosLugares(['Porto', 'Lisboa']).nome === 'PORTUGAL');
ok('lugares: Évora e Beja -> ALENTEJO', C.zonaDosLugares(['Évora', 'Beja']).nome === 'ALENTEJO');
ok('lugares: Funchal -> MADEIRA', C.zonaDosLugares(['Madeira - Funchal']).nome === 'MADEIRA');
ok('dia curto de AAAA-MM-DD', C.diaCurto('2026-12-08') === 'TER 08/12');
const T = await import(pathToFileURL(path.join(APP, 'src/server/comunidade/avisosTextos.ts')).href);
const pi = T.postIncendios([{ concelho: 'Arouca', distrito: 'Aveiro', humanos: 320, terrestres: 90, aereos: 6 }]);
ok('incêndio: imagem própria (AROUCA, desenho do Centro, INCÊNDIO, meios)', pi.cartaz && pi.cartaz.zona.nome === 'AROUCA' && pi.cartaz.zona.silhueta === 'centro' && pi.cartaz.tipo.rotulo === 'INCÊNDIO' && pi.cartaz.modo === null
  && /320 operacionais · 6 meios aéreos/.test(pi.cartaz.destaque.texto), JSON.stringify(pi.cartaz));
const pv = T.postAvisoVermelho({ distritos: ['Viana do Castelo', 'Braga'], tipos: ['Vento', 'Precipitação'] });
ok('aviso vermelho: NORTE, AVISO VERMELHO, tipos', pv.cartaz && pv.cartaz.zona.nome === 'NORTE' && pv.cartaz.tipo.rotulo === 'AVISO VERMELHO' && pv.cartaz.destaque.texto === 'Vento · Precipitação', JSON.stringify(pv.cartaz));
const pf = T.postFeriado({ nome: 'Imaculada Conceição', diaSemana: 'terça-feira', data: '2026-12-08' });
ok('feriado: PORTUGAL, FERIADO, dia escrito', pf.cartaz && pf.cartaz.zona.nome === 'PORTUGAL' && pf.cartaz.tipo.rotulo === 'FERIADO' && pf.cartaz.quando === 'TER 08/12');
const cg = C.dadosDoCartaz(av({ tipo: 'greve', 'título': 'Greve no Metro', operador: 'Metro do Porto', 'região': 'Área Metropolitana do Porto', start_datetime: '2026-12-04T00:00:00Z', end_datetime: '2026-12-04T23:59:00Z', status: 'Futuro' }));
const pg = T.postGreve({ titulo: 'Greve · Metro do Porto', corpo: 'Greve no Metro', cartaz: cg });
ok('greve: a imagem própria passa para a publicação', pg.cartaz && pg.cartaz.zona.nome === 'PORTO' && pg.cartaz.modo === 'metro');
ok('validação: dados certos passam (com o troço por linha)', JSON.stringify(C.cartazValido(JSON.parse(JSON.stringify({ ...cg, destaque: { etiqueta: 'SÓ FUNCIONA', texto: 'A ↔ B\nC ↔ D' } })))) === JSON.stringify({ ...cg, destaque: { etiqueta: 'SÓ FUNCIONA', texto: 'A ↔ B\nC ↔ D' } }));
ok('validação: cor, ícone ou zona inventados não passam', C.cartazValido({ ...cg, tipo: { ...cg.tipo, cor: 'red' } }) === null
  && C.cartazValido({ ...cg, tipo: { ...cg.tipo, icone: '<script>' } }) === null && C.cartazValido({ ...cg, zona: { nome: 'X', silhueta: 'marte' } }) === null && C.cartazValido('x') === null);
ok('validação: textos compridos cortados', C.cartazValido({ ...cg, titulo: 'a'.repeat(500) }).titulo.length === 160);

console.log(falhas ? `\n${falhas} FALHAS` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
