// Testa as páginas das cidades à volta do Tejo e do Douro (pedido no Reddit, 24/11/2026): /cidade/lisboa contava como
// Lisboa 6 paragens do Metro Sul do Tejo (Cacilhas, na outra margem), e o Porto contava o Cais de Gaia (e Gaia, São Bento).
// Cada cidade só conta as paragens da sua margem (linhas dos rios do OpenStreetMap).
// Uso: APP=<pasta da app> [BASE=http://127.0.0.1:3000] tsx auditoria/cidades-margens.mjs
const APP = process.env.APP || '../parou';
const BASE = process.env.BASE || '';
const C = await import(`${APP}/src/data/cidades.ts`);
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const cid = (s) => C.CIDADES.find((c) => c.slug === s);
const lx = cid('lisboa'), al = cid('almada');

const sul = { 'Cacilhas (MTS)': [38.6876, -9.1476], 'Almada': [38.6790, -9.1569], 'Pragal': [38.6687, -9.1720], 'Cova da Piedade': [38.6680, -9.1600], 'Barreiro': [38.6560, -9.0820], 'Seixal': [38.6430, -9.1010] };
const norte = { 'Cais do Sodré': [38.7058, -9.1458], 'Terreiro do Paço': [38.7075, -9.1365], 'Alcântara-Mar': [38.7034, -9.1760], 'Santa Apolónia': [38.7140, -9.1225], 'Xabregas': [38.7270, -9.1060], 'Marquês de Pombal': [38.7253, -9.1500] };
for (const [n, [la, lo]] of Object.entries(sul)) ok(`[margem] ${n} fica a sul do Tejo e não conta como Lisboa`, C.aSulDoTejo(la, lo) && !C.naCidade(lx, la, lo));
for (const [n, [la, lo]] of Object.entries(norte)) ok(`[margem] ${n} conta como Lisboa e não como Almada`, !C.aSulDoTejo(la, lo) && C.naCidade(lx, la, lo) && !C.naCidade(al, la, lo));
ok('[margem] Cacilhas conta como Almada', C.naCidade(al, 38.6876, -9.1476));
ok('[margem] Belém fica a norte do Tejo', !C.aSulDoTejo(38.6976, -9.2063));
ok('[margem] o centro do Montijo conta como Montijo (estuário)', C.naCidade(cid('montijo'), 38.7067, -8.9739));
ok('[margem] Trafaria não conta como Oeiras', !C.naCidade(cid('oeiras'), 38.672, -9.238) && C.aSulDoTejo(38.672, -9.238));
const po = cid('porto'), ga = cid('vila-nova-de-gaia');
const gaia = { 'Cais de Gaia': [41.1372, -8.614], 'General Torres': [41.129, -8.606], 'Jardim do Morro': [41.1376, -8.6093], 'Afurada': [41.1435, -8.6455], 'Oliveira do Douro': [41.118, -8.585] };
const porto = { 'São Bento': [41.1456, -8.6105], 'Ribeira': [41.1406, -8.6131], 'Campanhã': [41.1488, -8.5856], 'Aliados': [41.1486, -8.6110] };
for (const [n, [la, lo]] of Object.entries(gaia)) ok(`[douro] ${n} é Gaia e não Porto`, C.aSulDoDouro(la, lo) && !C.naCidade(po, la, lo) && C.naCidade(ga, la, lo));
for (const [n, [la, lo]] of Object.entries(porto)) ok(`[douro] ${n} é Porto e não Gaia`, !C.aSulDoDouro(la, lo) && C.naCidade(po, la, lo) && !C.naCidade(ga, la, lo));
ok('[douro] Avintes (Gaia) não conta como Gondomar', !C.naCidade(cid('gondomar'), 41.1065, -8.5520));
ok('[douro] Valbom conta como Gondomar', C.naCidade(cid('gondomar'), 41.1300, -8.5580));
ok('[outras] Porto não muda (fora do Tejo)', C.naCidade(cid('porto'), 41.1496, -8.6110));

if (BASE) {
  const obter = async (u) => (await fetch(BASE + u, { headers: { 'x-forwarded-for': '198.51.100.202' } })).text();
  const h = await obter('/cidade/lisboa');
  const corpo = h.slice(h.indexOf('<main>'), h.indexOf('</main>'));
  ok('[página] /cidade/lisboa não tem a secção do Metro Sul do Tejo', !/<h2>Metro Sul do Tejo em Lisboa<\/h2>/.test(corpo), (corpo.match(/<h2>[^<]*Sul do Tejo[^<]*<\/h2>/) || [''])[0]);
  ok('[página] /cidade/lisboa não lista paragens do Metro Sul do Tejo', !/href="\/paragens\/metro-sul-do-tejo\//.test(corpo));
  ok('[página] /cidade/lisboa tem o Metro de Lisboa', /\/linhas\/metro-de-lisboa/.test(corpo));
  const a = await obter('/cidade/almada');
  const ca = a.slice(a.indexOf('<main>'), a.indexOf('</main>'));
  ok('[página] /cidade/almada tem o Metro Sul do Tejo', /\/linhas\/metro-sul-do-tejo/.test(ca));
  ok('[página] /cidade/almada não lista paragens do Metro de Lisboa', !/href="\/paragens\/metro-de-lisboa\//.test(ca));
  const g = await obter('/cidade/vila-nova-de-gaia');
  const cg = g.slice(g.indexOf('<main>'), g.indexOf('</main>'));
  ok('[página] /cidade/vila-nova-de-gaia não lista São Bento, Aliados nem Trindade', !/>(S\.? ?Bento|São Bento|Aliados|Trindade)</i.test(cg), (cg.match(/>[^<]*(Bento|Aliados|Trindade)[^<]*</) || [''])[0]);
  ok('[página] /cidade/vila-nova-de-gaia tem o Metro do Porto (lado de Gaia)', /\/linhas\/metro-do-porto/.test(cg));
  const ml = await obter('/linhas/metro-sul-do-tejo');
  ok('[página] /linhas/metro-sul-do-tejo não diz que é de Lisboa (cidades)', !/href="\/cidade\/lisboa"/.test(ml.slice(ml.indexOf('<main>'), ml.indexOf('</main>'))));
}

console.log(falhas ? `${falhas} testes falharam` : 'Todos os testes passaram');
process.exit(falhas ? 1 : 0);
