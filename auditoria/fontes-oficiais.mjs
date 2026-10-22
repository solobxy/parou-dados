// Testa as fontes oficiais e o aviso de que a PAROU não é uma entidade governamental (src/utils/fontesOficiais.ts).
// A Google Play recusou a app (política de declarações enganosas) por falta de links claros para as fontes governamentais
// e de um aviso fácil de encontrar. Uso: APP=caminho-da-app node --import tsx auditoria/fontes-oficiais.mjs
const caminho = process.env.APP || '../app';
const F = await import(`${caminho}/src/utils/fontesOficiais.ts`).catch(() => ({}));
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

ok('existem FONTES_OFICIAIS e AVISO_NAO_GOVERNAMENTAL', Array.isArray(F.FONTES_OFICIAIS) && typeof F.AVISO_NAO_GOVERNAMENTAL === 'string');
if (Array.isArray(F.FONTES_OFICIAIS)) {
  const urls = F.FONTES_OFICIAIS.map((f) => f.url);
  ok('todas as fontes têm nome e link https', F.FONTES_OFICIAIS.every((f) => f.nome && /^https:\/\//.test(f.url)), urls.join(' '));
  ok('inclui ANEPC (prociv.gov.pt), IPMA (ipma.pt) e Fogos.pt', ['prociv.gov.pt', 'ipma.pt', 'fogos.pt'].every((d) => urls.some((u) => new URL(u).hostname.endsWith(d))));
  ok('sem links duplicados', new Set(urls).size === urls.length);
}
if (typeof F.AVISO_NAO_GOVERNAMENTAL === 'string') {
  const a = F.AVISO_NAO_GOVERNAMENTAL.toLowerCase();
  ok('aviso diz que não é entidade governamental', a.includes('não é uma entidade governamental'));
  ok('aviso nomeia a Proteção Civil e o IPMA', a.includes('proteção civil') && a.includes('ipma'));
}

if (falhas) { console.log(`\n${falhas} FALHA(S)`); process.exit(1); }
console.log('\nTodos os testes OK');
