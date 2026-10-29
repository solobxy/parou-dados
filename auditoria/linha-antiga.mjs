// Testa o endereço antigo de uma linha (src/utils/linhaAntiga.ts): quando a base de horários muda, o nome do percurso
// muda e o endereço antigo (ex.: /linhas/carris/729-belem-r-bica-marques) deixa de existir. Deve ir para a linha atual com o mesmo número.
// Uso: APP=caminho-da-app node --import tsx auditoria/linha-antiga.mjs
const caminho = process.env.APP || '../app';
const M = await import(`${caminho}/src/utils/linhaAntiga.ts`).catch(() => ({}));
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

ok('existe escolherLinhaAtual', typeof M.escolherLinhaAtual === 'function');
if (typeof M.escolherLinhaAtual === 'function') {
  const f = M.escolherLinhaAtual;
  const carris729 = [
    { slug: '729-b-calhariz-benfica-palacio-nacional-ajuda' },
    { slug: '729-b-padre-cruz-alges' },
    { slug: '729-belem-cc-ajuda-palacio-nacional-ajuda' },
    { slug: '729-cc-ajuda-r-gen-joao-almeida-lg-princesa' },
  ];
  ok('729 «belem r bica marques» → variante com «belem»', f(carris729, '729-belem-r-bica-marques') === '729-belem-cc-ajuda-palacio-nacional-ajuda');
  const carris706 = [
    { slug: '706-cais-sodre-estacao-sta-apolonia' },
    { slug: '706-pc-chile-alameda-d-a-henriques' },
    { slug: '706-pc-chile-av-almirante-reis-vale-escuro' },
  ];
  ok('706 «r jose estevao vale escuro» → variante com «vale escuro»', f(carris706, '706-r-jose-estevao-vale-escuro') === '706-pc-chile-av-almirante-reis-vale-escuro');
  const carris708 = [
    { slug: '708-av-alm-gago-coutinho-sacavem-urb-real-forte' },
    { slug: '708-martim-moniz-sacavem-urb-real-forte' },
  ];
  ok('708 sem nome em comum → primeira variante do mesmo número', f(carris708, '708-pc-joao-rio-av-peregrinacao') === '708-av-alm-gago-coutinho-sacavem-urb-real-forte');
  ok('número que já não existe → null', f(carris708, '799-colegio-militar-metro-alfragide-norte') === null);
  ok('linha sem número (metro «linha-azul») → null', f([{ slug: 'linha-azul-odivelas' }], 'linha-azul-x') === null);
  ok('lista vazia → null', f([], '729-belem-r-bica-marques') === null);
}

if (falhas) { console.log(`\n${falhas} FALHA(S)`); process.exit(1); }
console.log('\nTodos os testes OK');
