// Testa a fonte do SMTUC (Coimbra): o endereço oficial do GTFS estático é o gtfs-api.smtuc.pt (pedido do SMTUC, 23/10/2026),
// e a app identifica o SMTUC como fonte com o texto que o SMTUC pediu. Não há tempo real do SMTUC: nada disso se mostra.
// Uso: APP=caminho-da-app node --import tsx auditoria/smtuc-fonte.mjs
const caminho = process.env.APP || '../app';
const R = await import(`${caminho}/src/server/gtfsSeedRegistry.ts`).catch(() => ({}));
const A = await import(`${caminho}/src/utils/atribuicoes.ts`).catch(() => ({}));
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const smtuc = (R.SEED_FEEDS || []).find((f) => f.id === 'smtuc_coimbra');
ok('existe o feed smtuc_coimbra', !!smtuc);
if (smtuc) {
  ok('endereço do GTFS é o oficial do SMTUC', smtuc.url === 'https://gtfs-api.smtuc.pt/api/static/', smtuc.url);
  ok('último endereço igual ao oficial', smtuc.latest_url === smtuc.url, smtuc.latest_url);
  ok('licença aponta para a página do SMTUC', /gtfs\.smtuc\.pt/.test(smtuc.license_url || ''), smtuc.license_url);
  ok('o SMTUC não tem tempo real integrado', /não integrado/i.test(smtuc.realtime_entities || ''), smtuc.realtime_entities);
}

ok('existe atribuicaoDaFonte', typeof A.atribuicaoDaFonte === 'function');
if (typeof A.atribuicaoDaFonte === 'function') {
  ok('SMTUC tem a atribuição pedida', A.atribuicaoDaFonte('smtuc_coimbra') === 'Fonte: Serviços Municipalizados de Transportes Urbanos de Coimbra (SMTUC)');
  ok('outra fonte sem atribuição especial → null', A.atribuicaoDaFonte('stcp_porto') === null);
}

if (falhas) { console.log(`\n${falhas} FALHA(S)`); process.exit(1); }
console.log('\nTodos os testes OK');
