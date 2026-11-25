// Garante que a app mostra, com link, todas as fontes oficiais da informação do Estado que usa, e o aviso de que não é uma
// entidade governamental. A Google Play rejeitou a app (23/10/2026, política de declarações enganosas) por faltarem links
// claros para as fontes originais: a lista tem de bater com a descrição da loja.
// Uso: APP=caminho-da-app tsx auditoria/fontes-oficiais.mjs
import fs from 'node:fs';
const caminho = process.env.APP || '../app';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const F = await import(`${caminho}/src/utils/fontesOficiais.ts`);
const urls = F.FONTES_OFICIAIS.map((f) => f.url);
for (const [nome, url] of [['ANEPC', 'https://prociv.gov.pt'], ['IPMA', 'https://www.ipma.pt'], ['Fogos.pt', 'https://fogos.pt'],
  ['IMT (Ponto de Acesso Nacional)', 'https://nap-portugal.imt-ip.pt'], ['dados.gov.pt', 'https://dados.gov.pt'], ['Diário da República (feriados)', 'https://diariodarepublica.pt']]) {
  ok(`a lista tem ${nome} (${url})`, urls.includes(url), urls.join(' '));
}
ok('todos os links são https completos', urls.every((u) => /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}/.test(u)));
ok('o aviso diz que a PAROU não é uma entidade governamental e manda ligar 112', /não é uma entidade governamental/.test(F.AVISO_NAO_GOVERNAMENTAL) && /112/.test(F.AVISO_NAO_GOVERNAMENTAL));
const ecra = fs.readFileSync(`${caminho}/src/components/AlertasView.tsx`, 'utf8');
ok('os Alertas mostram a lista com links e o aviso', /FONTES_OFICIAIS\.map/.test(ecra) && /href=\{f\.url\}/.test(ecra) && /AVISO_NAO_GOVERNAMENTAL/.test(ecra));
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
