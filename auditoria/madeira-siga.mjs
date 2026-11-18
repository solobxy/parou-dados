// Rede SIGA (Madeira) na app a correr: as páginas da SIGA Rodoeste e da CAM, de uma linha e de uma paragem abrem com
// conteúdo, com os nomes certos (linhas juntas pelo número, sem o código de variante «Boqueirão0I»), e a página do
// Horários do Funchal continua igual. Só faz sentido com dados que já tenham a SIGA (dados-teste ou depois de publicada):
// se os dados não a têm, diz isso e não falha.
// Uso: BASE=http://127.0.0.1:3000 node auditoria/madeira-siga.mjs
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const pagina = async (c) => { const r = await fetch(BASE + c, { redirect: 'manual' }); return { status: r.status, html: await r.text() }; };
const ligacoes = (html, prefixo) => [...new Set([...html.matchAll(new RegExp(`href="(${prefixo}[^"#?]+)"`, 'g'))].map((m) => m[1]))];

const cam = await pagina('/linhas/cam-madeira');
if (cam.status === 404) {
  console.log('Os dados usados ainda não têm a Rede SIGA: nada a testar.');
  process.exit(0);
}
ok('página da CAM abre', cam.status === 200, String(cam.status));
ok('CAM: tem o Aerobus (500) e a 625 Camacha', /Aerobus/.test(cam.html) && /625/.test(cam.html) && /Camacha/.test(cam.html));
ok('CAM: nenhum nome com o código de variante (ex.: «Boqueirão0I», «CamachaAV»)', !/[a-zà-ÿ][0A-H][IV]\b/.test(cam.html.replace(/<[^>]+>/g, ' ')),
  (cam.html.replace(/<[^>]+>/g, ' ').match(/\S*[a-zà-ÿ][0A-H][IV]\b/g) || []).slice(0, 5).join(', '));
const linhasCam = ligacoes(cam.html, '/linhas/cam-madeira/');
ok('CAM: uma página por número de linha (53 linhas, sem repetidas «-2»)', linhasCam.length >= 40 && linhasCam.length <= 60 && !linhasCam.some((l) => /-\d+$/.test(l) && /boqueirao-\d/.test(l)),
  `${linhasCam.length} ligações`);

const rod = await pagina('/linhas/siga-rodoeste');
ok('página da SIGA Rodoeste abre', rod.status === 200, String(rod.status));
ok('Rodoeste: tem linhas para a Ribeira Brava e a Calheta', /Ribeira Brava/.test(rod.html) && /Calheta/.test(rod.html));
const linhasRod = ligacoes(rod.html, '/linhas/siga-rodoeste/');
ok('Rodoeste: ~107 linhas, uma por número', linhasRod.length >= 90 && linhasRod.length <= 115, `${linhasRod.length} ligações`);

const aerobus = linhasCam.find((l) => /\/500-/.test(l));
ok('existe a página da linha 500 (Aerobus)', Boolean(aerobus), aerobus || '');
if (aerobus) {
  const l = await pagina(aerobus);
  ok('linha 500 abre e tem as paragens do Aeroporto e da Praia Formosa', l.status === 200 && /Aeroporto/.test(l.html) && /Praia Formosa/.test(l.html), String(l.status));
  const paragem = ligacoes(l.html, '/paragens/cam-madeira/')[0];
  ok('a linha liga às paragens da CAM', Boolean(paragem), paragem || '');
  if (paragem) {
    const p = await pagina(paragem);
    ok('página de paragem da CAM abre', p.status === 200, `${paragem} ${p.status}`);
  }
}
const hf = await pagina('/linhas/horarios-do-funchal');
ok('Horários do Funchal continua a abrir', hf.status === 200 && ligacoes(hf.html, '/linhas/horarios-do-funchal/').length > 20, String(hf.status));
console.log(falhas ? `${falhas} falha(s)` : 'Madeira (SIGA): tudo OK');
process.exit(falhas ? 1 : 0);
