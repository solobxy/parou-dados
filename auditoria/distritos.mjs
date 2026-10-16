// Testa o nome do distrito (src/utils/distritos.ts): «Bragança» não pode virar «Braga» (a palavra «braga» está dentro de «bragança»).
// Erro apanhado por um leitor no Reddit: ocorrências de Macedo de Cavaleiros e Bragança apareciam no distrito de Braga.
// Uso: APP=caminho-da-app node --import tsx auditoria/distritos.mjs
const caminho = process.env.APP || '../app';
const D = await import(`${caminho}/src/utils/distritos.ts`).catch(() => ({}));
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
ok('existem normalizeDistrict e distritoNoTexto', typeof D.normalizeDistrict === 'function' && typeof D.distritoNoTexto === 'function');
if (typeof D.normalizeDistrict === 'function') {
  const n = D.normalizeDistrict;
  for (const [entrada, esperado] of [
    ['Bragança', 'Bragança'], ['BRAGANÇA', 'Bragança'], ['braganca', 'Bragança'], ['Distrito de Bragança', 'Bragança'],
    ['Braga', 'Braga'], ['braga', 'Braga'], ['Distrito de Braga', 'Braga'],
    ['Lisboa', 'Lisboa'], ['Porto', 'Porto'], ['Setúbal', 'Setúbal'], ['setubal', 'Setúbal'], ['Évora', 'Évora'], ['evora', 'Évora'],
    ['Vila Real', 'Vila Real'], ['Viana do Castelo', 'Viana do Castelo'], ['Castelo Branco', 'Castelo Branco'], ['Santarém', 'Santarém'],
    ['Faro', 'Faro'], ['Guarda', 'Guarda'], ['Região Autónoma da Madeira', 'Região Autónoma da Madeira'], ['Madeira', 'Região Autónoma da Madeira'], ['Açores', 'Região Autónoma dos Açores'],
  ]) ok(`[distrito] «${entrada}» → ${esperado}`, n(entrada) === esperado, n(entrada));
  ok('[distrito] vazio → Lisboa', n('') === 'Lisboa' && n(undefined) === 'Lisboa');
  ok('[distrito] desconhecido fica como veio', n('Xpto') === 'Xpto');
  const t = D.distritoNoTexto;
  ok('[texto] «Macedo de Cavaleiros, Bragança» → Bragança', t('queda de elementos em macedo de cavaleiros, bragança') === 'Bragança');
  ok('[texto] «acidente na A11 em Braga» → Braga', t('acidente na a11 em braga') === 'Braga');
  ok('[texto] «Bragança» sozinho nunca dá Braga', t('autocarros em bragança') === 'Bragança');
  ok('[texto] sem distrito → null', t('greve geral') === null);
}

// Outras cidades: o nome de uma cidade dentro de outra palavra não pode ser confundido
ok('existem temPalavra e distritoDaDescricaoANEPC', typeof D.temPalavra === 'function' && typeof D.distritoDaDescricaoANEPC === 'function');
if (typeof D.temPalavra === 'function') {
  const w = D.temPalavra;
  ok('[palavra] «aeroporto» não é Porto', !w('obras no aeroporto', 'porto'));
  ok('[palavra] «Porto» é Porto', w('greve no Porto hoje', 'porto'));
  ok('[palavra] «Porto Santo» não conta como Porto sozinho? (conta como palavra)', w('porto santo', 'porto'));
  ok('[palavra] «Bragança» não é Braga', !w('Macedo de Cavaleiros, Bragança', 'braga'));
  ok('[palavra] «Farol»/«Faroleiro» não é Faro', !w('luz do farol e faroleiro', 'faro'));
  ok('[palavra] acentos: «Setúbal» = setubal', w('Setúbal: greve', 'setubal'));
  ok('[palavra] «Guimarães» = guimaraes', w('comboio para Guimarães', 'guimaraes'));
  ok('[palavra] «Almadares» não é Almada', !w('rua dos almadares', 'almada'));
}
if (typeof D.distritoDaDescricaoANEPC === 'function') {
  const f = D.distritoDaDescricaoANEPC;
  ok('[ANEPC] Macedo de Cavaleiros → Bragança', f('Ocorrência da Proteção Civil (ANEPC) em Rua X, Macedo De Cavaleiros, Bragança. Estado: Em Curso. Meios: 3') === 'Bragança');
  ok('[ANEPC] Braga → Braga', f('Ocorrência da Proteção Civil (ANEPC) em A11, Braga, Braga. Estado: Em Curso.') === 'Braga');
  ok('[ANEPC] descrição de outra fonte → null', f('Greve no Porto') === null);
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes OK');
process.exit(falhas ? 1 : 0);
