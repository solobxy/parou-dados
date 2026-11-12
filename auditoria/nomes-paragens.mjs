// Nomes de paragens e linhas como aparecem na app e nas páginas públicas.
// Erros apanhados antes da peça do DN Madeira: no Funchal aparecia «Cam Trapiche D2a (750b)» e no país todo
// as siglas e a numeração romana ficavam estragadas («D. João Ii», «(Gnr)», «Eb1/ji»).
// Uso: APP=caminho-da-app node --import tsx auditoria/nomes-paragens.mjs
import fs from 'node:fs';
const caminho = process.env.APP || '../app';
const F = await import(`${caminho}/src/utils/transitFormatter.ts`).catch((e) => ({ erro: e }));
const T = await import(`${caminho}/src/server/seo/texto.ts`).catch((e) => ({ erro: e }));
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
ok('existe formatTransitName', typeof F.formatTransitName === 'function', F.erro?.message || '');
ok('existem nomeBonito e nomeParaEndereco', typeof T.nomeBonito === 'function' && typeof T.nomeParaEndereco === 'function', T.erro?.message || '');

const casos = [
  // Horários do Funchal: abreviaturas por extenso, sem o código de posição (D, S1A...), número da paragem em maiúsculas
  ['CAM Trapiche  D2A (750B)', 'Caminho Trapiche (750B)'],
  ['Antes CZ Torrinha (444B)', 'Antes Cruzamento Torrinha (444B)'],
  ['Palácio S Lourenço (CF29A)', 'Palácio São Lourenço (CF29A)'],
  ['Largo da Fonte  T-20 (540)', 'Largo da Fonte T-20 (540)'],
  ['Rua João Paulo II  D1A (1162)', 'Rua João Paulo II (1162)'],
  ['R 31 Janeiro Finanças (9C)', 'Rua 31 Janeiro Finanças (9C)'],
  ['CAM do ENG Velho  Ford (38B)', 'Caminho do Engenho Velho Ford (38B)'],
  ['CAM Terça  Poços CMF  D (602)', 'Caminho Terça Poços CMF (602)'],
  ['ESTR CMDT C Freitas  D (100)', 'Estrada Comandante C Freitas (100)'],
  ['Centro - LEV STA Luzia', 'Centro - Levada Santa Luzia'],
  ['Centro - CAM Ferro', 'Centro - Caminho Ferro'],
  ['Centro - Teleférico JRD Botânico', 'Centro - Teleférico Jardim Botânico'],
  ['Funchal - CFreiras (via FJ Cardos)', 'Funchal - Curral das Freiras (via FJ Cardos)'],
  ['Galerias (31)', 'Galerias (31)'],
  // Siglas e numeração romana no resto do país
  ['Cç. Ajuda (GNR)', 'Cç. Ajuda (GNR)'],
  ['Av. João XXI', 'Av. João XXI'],
  ['D.JOÃO II (METRO)', 'D. João II (Metro)'],
  ['D. JOÃO IV', 'D. João IV'],
  ['Figueira (EB1)', 'Figueira (EB1)'],
  ['JI/EB1 Pontal 1', 'JI/EB1 Pontal 1'],
  ['R Lyon 4A', 'Rua Lyon 4A'],
  ['EB23/S Bemposta', 'EB23/S Bemposta'],
  ['S Martinho (Viaduto)', 'São Martinho (Viaduto)'],
  ['R. Manuel Martins Gomes Jnr - S António - Centro', 'R. Manuel Martins Gomes Jnr - Santo António - Centro'],
  ['Carcavelos - CascaiShopping IronMan', 'Carcavelos - CascaiShopping IronMan'],
  ['Frente ao RG3  T-48 (817A)', 'Frente ao RG3 T-48 (817A)'],
  // O que já estava bem não pode mudar
  ['AV.ALIADOS', 'Av. Aliados'],
  ['CORDOARIA-S.PEDRO DA COVA', 'Cordoaria - S. Pedro da Cova'],
  ['Cais do Sodré', 'Cais do Sodré'],
  ['VILA D\'ESTE', 'Vila d\'Este'],
  ['BOAVISTA - CABO DO MUNDO (Via MAR Shop.)', 'Boavista - Cabo do Mundo (Via Mar Shop.)'],
  ['HOSPITAL S. JOÃO', 'Hospital S. João'],
];
if (typeof F.formatTransitName === 'function') {
  for (const [entrada, esperado] of casos) {
    const r = F.formatTransitName(entrada);
    ok(`[app] «${entrada}» → «${esperado}»`, r === esperado, r === esperado ? '' : `(saiu «${r}»)`);
  }
}

// Páginas públicas: o nome mostrado melhora, mas o endereço já indexado não pode mudar
if (typeof T.nomeBonito === 'function') {
  ok('[páginas] nome do Funchal por extenso', T.nomeBonito('CAM Trapiche  D2A (750B)') === 'Caminho Trapiche (750B)', T.nomeBonito('CAM Trapiche  D2A (750B)'));
  ok('[páginas] endereço igual ao de antes', T.slug(T.nomeParaEndereco('CAM Trapiche  D2A (750B)'), 70) === 'cam-trapiche-d2a-750b', T.slug(T.nomeParaEndereco('CAM Trapiche  D2A (750B)'), 70));
  ok('[páginas] endereço de linha igual ao de antes', T.slug(`027 ${T.nomeParaEndereco('Centro - CAM Ferro').replace(/\s+-\s+/g, ' – ')}`, 70) === '027-centro-cam-ferro');
}

// Barreira: nada de lookbehind (?<= / (?<! nos ficheiros que correm no telemóvel — o Safari antes do iOS 16.4 não
// o conhece e a app inteira deixava de abrir nesses iPhones
for (const f of ['src/utils/abreviaturas.ts', 'src/utils/transitFormatter.ts', 'src/utils/zonasSemHorarios.ts']) {
  let txt = '';
  try { txt = fs.readFileSync(`${caminho}/${f}`, 'utf8'); } catch {}
  ok(`[iPhone antigo] ${f} sem lookbehind`, Boolean(txt) && !/\(\?<[=!]/.test(txt));
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes OK');
process.exit(falhas ? 1 : 0);
