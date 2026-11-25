// CP: uma greve só dos serviços a bordo (cafetaria e bar do concessionário) não é uma greve dos comboios.
// Caso real (25/11/2026): «Serviço de Cafetaria e Bar - Alfa Pendular e Intercidades» aparecia nas greves desde fevereiro.
// Uso: APP=pasta-da-app tsx auditoria/cp-greve-servicos.mjs
const caminho = process.env.APP || '../app';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
globalThis.fetch = async () => new Response('sem rede no teste', { status: 503 });
const C = await import(`${caminho}/src/server/centralAlertsEngine.ts`);
const item = (titulo, lead, texto, inicio, fim) => ({ friendlyUrlPath: titulo.toLowerCase().replace(/\W+/g, '-'), contentFields: [
  { name: 'Text48691729', label: 'Título', contentFieldValue: { data: titulo } },
  { name: 'Campo69402820', label: 'Lead', contentFieldValue: { data: lead } },
  { name: 'RichText98970637', label: 'Texto', contentFieldValue: { data: texto } },
  { name: 'Date35268359', label: 'Data de início', contentFieldValue: { data: inicio } },
  ...(fim ? [{ name: 'Field40441023', label: 'Data de fim', contentFieldValue: { data: fim } }] : []),
] });
const cafe = C.avisoDaCp(item('Serviço de Cafetaria e Bar - Alfa Pendular e Intercidades', 'Greve desde dia 7 de fevereiro',
  'Os trabalhadores do concessionário ITAU - Instituto Técnico de Alimentação Humana S.A., que prestam os serviços de cafetaria e bar nos comboios Alfa Pendular e Intercidades, convocaram greve desde dia 7 de fevereiro, o que poderá causar perturbações na prestação dos referidos serviços.', '2026-02-07'));
ok('[cafetaria] a greve do bar a bordo não é uma greve dos comboios', !!cafe && cafe.tipo !== 'greve', cafe?.tipo);
ok('[cafetaria] fica como aviso informativo', !!cafe && cafe.tipo === 'outros alertas oficiais' && cafe.severity !== 'Grave', `${cafe?.tipo} ${cafe?.severity}`);
const greve = C.avisoDaCp(item('Greve - serviços mínimos a 24 e 25 de novembro', 'Greve convocada pelos sindicatos',
  'Devido à greve convocada por organizações sindicais, preveem-se perturbações na circulação e supressões de comboios. Foram decretados serviços mínimos.', '2026-11-23', '2026-11-25'));
ok('[greve real] a greve dos ferroviários continua greve', !!greve && greve.tipo === 'greve', greve?.tipo);
const bar = C.avisoDaCp(item('Greve no bar - comboios suprimidos', 'Greve', 'Greve dos trabalhadores do bar e da CP; comboios suprimidos em várias linhas.', '2026-11-30'));
ok('[misto] se há comboios suprimidos, é greve', !!bar && bar.tipo === 'greve', bar?.tipo);
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
