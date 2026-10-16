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
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes OK');
process.exit(falhas ? 1 : 0);
