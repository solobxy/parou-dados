// Testa a fonte da Transtejo Soflusa: a TTSL confirmou por email que os dados são oficiais e pediu que a fonte apareça
// assim: «Fonte — Transtejo Soflusa (TTSL)». Tem de estar na página /linhas/transtejo-soflusa (e em /en, /de, /fr), nas
// páginas das linhas e paragens da TTSL, e na app por baixo dos horários e do tempo real da TTSL. Os outros operadores
// não ganham esta linha.
// Uso: APP=<pasta da app> [BASE=http://127.0.0.1:3000] tsx auditoria/ttsl-fonte.mjs
const APP = process.env.APP || '../parou';
const BASE = process.env.BASE || '';
const A = await import(`${APP}/src/utils/atribuicoes.ts`);
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const TEXTO = 'Fonte — Transtejo Soflusa (TTSL)';

ok('[texto] é exatamente o que a TTSL pediu', A.atribuicaoDaFonte('transtejo_soflusa') === TEXTO, A.atribuicaoDaFonte('transtejo_soflusa'));
ok('[texto] entra na lista de créditos', A.todasAsAtribuicoes().includes(TEXTO));
ok('[línguas] inglês: «Source — Transtejo Soflusa (TTSL)»', A.atribuicaoNaLingua('transtejo_soflusa', 'en') === 'Source — Transtejo Soflusa (TTSL)', A.atribuicaoNaLingua('transtejo_soflusa', 'en'));
ok('[línguas] alemão: «Quelle — …»', A.atribuicaoNaLingua('transtejo_soflusa', 'de') === 'Quelle — Transtejo Soflusa (TTSL)');
ok('[línguas] francês: «Source — …»', A.atribuicaoNaLingua('transtejo_soflusa', 'fr') === 'Source — Transtejo Soflusa (TTSL)');
ok('[línguas] o SMTUC continua com o texto dele', A.atribuicaoDaFonte('smtuc_coimbra') === 'Fonte: Serviços Municipalizados de Transportes Urbanos de Coimbra (SMTUC)');
ok('[outros] a Carris não ganha atribuição', A.atribuicaoNaLingua('carris', 'pt') === null);

// Componente da app (sem browser): os textos que mostra para os operadores no ecrã
const F = await import(`${APP}/src/components/FonteOperador.tsx`).catch((e) => ({ erro: String(e).slice(0, 160) }));
ok('[app] o componente carrega', typeof F.textosFonte === 'function', F.erro || '');
if (typeof F.textosFonte === 'function') {
  ok('[app] paragem da TTSL: mostra a fonte uma só vez', JSON.stringify(F.textosFonte(['transtejo_soflusa', 'transtejo_soflusa', undefined], 'pt')) === JSON.stringify([TEXTO]));
  ok('[app] paragem só da Carris: sem fonte', F.textosFonte(['carris', 'metro_lisboa'], 'pt').length === 0);
  ok('[app] em inglês', F.textosFonte(['transtejo_soflusa'], 'en')[0] === 'Source — Transtejo Soflusa (TTSL)');
}

if (BASE) {
  const obter = async (u) => { const r = await fetch(BASE + u, { headers: { 'x-forwarded-for': '198.51.100.201' } }); return { s: r.status, h: await r.text() }; };
  const tem = (h, t) => h.includes(t.replace(/&/g, '&amp;'));
  for (const [pre, t] of [['', TEXTO], ['/en', 'Source — Transtejo Soflusa (TTSL)'], ['/de', 'Quelle — Transtejo Soflusa (TTSL)'], ['/fr', 'Source — Transtejo Soflusa (TTSL)']]) {
    const r = await obter(`${pre}/linhas/transtejo-soflusa`);
    ok(`[página${pre || ' pt'}] /linhas/transtejo-soflusa mostra «${t}»`, r.s === 200 && tem(r.h, t), String(r.s));
  }
  const op = await obter('/linhas/transtejo-soflusa');
  const linha = (op.h.match(/href="(\/linhas\/transtejo-soflusa\/[^"]+)"/) || [])[1];
  if (linha) {
    const r = await obter(linha);
    ok('[página] linha da TTSL mostra a fonte', r.s === 200 && tem(r.h, TEXTO), linha);
  } else ok('[página] há linhas da TTSL na página', false);
  const par = await obter('/paragens/transtejo-soflusa');
  const paragem = (par.h.match(/href="(\/paragens\/transtejo-soflusa\/[^"]+)"/) || [])[1];
  if (paragem) {
    const r = await obter(paragem);
    ok('[página] paragem da TTSL mostra a fonte', r.s === 200 && tem(r.h, TEXTO), paragem);
  } else console.log('NOTA    sem paragens da TTSL na lista');
  const carris = await obter('/linhas/carris');
  ok('[página] /linhas/carris não mostra a fonte da TTSL', carris.s === 200 && !tem(carris.h, TEXTO));
}

console.log(falhas ? `${falhas} testes falharam` : 'Todos os testes passaram');
process.exit(falhas ? 1 : 0);
