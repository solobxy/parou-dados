// Favoritos por sentido, num browser simulado (Chromium) contra a app com a base de teste do CI:
//   - no detalhe de uma linha com dois sentidos, a estrela guarda o sentido que está à vista;
//   - os dois sentidos ficam como dois favoritos separados e aparecem como duas linhas em «Favoritas», cada uma com o seu destino;
//   - tocar na linha «→ destino B» abre o detalhe já nesse sentido;
//   - tirar um sentido na lista deixa o outro;
//   - favorito antigo (linha inteira): tirar um sentido deixa o outro guardado;
//   - 320 px sem scroll lateral; capturas a 320/390 px. Não é num telemóvel a sério.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const nota = (s) => console.log('NOTA   ', s);
let proximoIp = 60;
const novoIp = () => `198.51.100.${proximoIp++}`;
const IP_API = novoIp();
const obter = (url) => fetch(url, { headers: { 'x-forwarded-for': IP_API } });
const simples = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// 1. Linha real com dois sentidos e destinos diferentes
let escolha = null;
for (const pagina of [1, 2]) {
  const lista = ((await (await obter(`${BASE}/api/lines?page=${pagina}`)).json()).lines || []).filter((l) => !String(l.id).startsWith('unir:'));
  for (const l of lista.slice(0, 30)) {
    const det = await (await obter(`${BASE}/api/lines/${encodeURIComponent(l.id)}`)).json().catch(() => null);
    const dirs = (det?.directions || []).filter((d) => d.headsign && (d.stops || []).length >= 2);
    if (dirs.length >= 2 && simples(dirs[0].headsign) !== simples(dirs[1].headsign)) { escolha = { linha: l, dirs }; break; }
  }
  if (escolha) break;
}
ok('[preparar] há uma linha real com dois sentidos', !!escolha, escolha ? `${escolha.linha.id}: ${escolha.dirs.map((d) => `${d.direction_id} → ${d.headsign}`).join(' | ')}` : '');
if (!escolha) { console.log('1 FALHOU'); process.exit(1); }
const { linha, dirs } = escolha;
const [A, B] = dirs;

const browser = await chromium.launch();
async function abrir({ largura = 390, favoritos = null } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: largura, height: 844 }, hasTouch: true, isMobile: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  const extra = favoritos
    ? `localStorage.setItem('parou_user_favorites', ${JSON.stringify(JSON.stringify(favoritos.itens))}); localStorage.setItem('parou_favorite_line_ids', ${JSON.stringify(JSON.stringify(favoritos.ids))});`
    : '';
  await ctx.addInitScript({ content: `try{ if(!sessionStorage.getItem('__ini')){ sessionStorage.setItem('__ini','1'); localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); ${extra} } }catch(e){}` });
  const ip = novoIp();
  await ctx.route(/\/api\//, (rt) => rt.continue({ headers: { ...rt.request().headers(), 'x-forwarded-for': ip } }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  return { ctx, p, erros };
}
const estrela = (p) => p.locator('[data-teste="estrela-linha"]');
const premida = async (p) => (await estrela(p).getAttribute('aria-pressed').catch(() => null)) === 'true';
const guardados = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('parou_user_favorites') || '[]').map((f) => ({ id: f.id, sentido: f.sentido, destino: f.destino })));
const aba = (p, d) => p.locator(`button[data-sentido="${d.direction_id}"]`).first();
async function abrirLinha(p) {
  await p.goto(`${BASE}/transportes?linha=${encodeURIComponent(linha.id)}`, { waitUntil: 'domcontentloaded' });
  return estrela(p).waitFor({ timeout: 30000 }).then(() => aba(p, A).waitFor({ timeout: 20000 })).then(() => true).catch(() => false);
}
async function fechar(p) {
  await p.getByRole('button', { name: 'Fechar' }).first().click({ timeout: 5000 }).catch((e) => nota('fechar: ' + String(e).slice(0, 80)));
  await p.waitForTimeout(600);
}
const idA = `line-${linha.id}~s${A.direction_id}`;
const idB = `line-${linha.id}~s${B.direction_id}`;

// 2. Guardar os dois sentidos no detalhe
{
  const { ctx, p, erros } = await abrir();
  const abriu = await abrirLinha(p);
  ok('[detalhe] a linha abre com a estrela e os sentidos', abriu);
  ok('[detalhe] sem nada guardado a estrela está apagada', !(await premida(p)));
  await aba(p, A).click();
  await estrela(p).click();
  await p.waitForTimeout(400);
  ok(`[detalhe] a estrela acende no sentido «${A.headsign}»`, await premida(p));
  const rotulo = await estrela(p).getAttribute('aria-label');
  ok('[detalhe] o rótulo da estrela diz o destino', simples(rotulo).includes(simples(A.headsign)), rotulo);
  let g = await guardados(p);
  ok('[detalhe] guardou só este sentido, com o destino', g.length === 1 && g[0].id === idA && g[0].destino === A.headsign, JSON.stringify(g));
  await aba(p, B).click();
  await p.waitForTimeout(300);
  ok(`[detalhe] no outro sentido «${B.headsign}» a estrela está apagada`, !(await premida(p)));
  await estrela(p).click();
  await p.waitForTimeout(400);
  g = await guardados(p);
  ok('[detalhe] os dois sentidos ficam como dois favoritos', g.length === 2 && g.some((x) => x.id === idA) && g.some((x) => x.id === idB), JSON.stringify(g));
  const ids = await p.evaluate(() => JSON.parse(localStorage.getItem('parou_favorite_line_ids') || '[]'));
  ok('[detalhe] a lista das linhas dos Horários tem a linha uma só vez, sem sufixo', ids.filter((x) => x === linha.id).length === 1 && !ids.some((x) => String(x).includes('~s')), JSON.stringify(ids));
  const marcas = await p.locator('button[data-sentido] svg[aria-label="Nos favoritos"]').count();
  ok('[detalhe] os dois sentidos mostram a estrelinha', marcas === 2, String(marcas));
  await p.screenshot({ path: `${SAIDA}/favoritos-sentido-detalhe_390.png` });

  // 3. Favoritas: duas linhas, uma por sentido
  await fechar(p);
  const linhaA = p.locator(`[data-linha="${linha.id}"][data-sentido="${A.direction_id}"]`);
  const linhaB = p.locator(`[data-linha="${linha.id}"][data-sentido="${B.direction_id}"]`);
  const ha = await linhaA.first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  ok('[favoritas] aparece o sentido A', ha);
  ok('[favoritas] aparece o sentido B', await linhaB.count() === 1);
  const tA = await linhaA.first().innerText().catch(() => '');
  const tB = await linhaB.first().innerText().catch(() => '');
  ok('[favoritas] a linha A diz o destino A', simples(tA).includes(simples(A.headsign)), tA.replace(/\s+/g, ' '));
  ok('[favoritas] a linha B diz o destino B', simples(tB).includes(simples(B.headsign)), tB.replace(/\s+/g, ' '));
  await p.screenshot({ path: `${SAIDA}/favoritos-sentido-lista_390.png` });

  // 4. Tocar na linha B abre o detalhe já no sentido B
  await linhaB.first().click();
  await estrela(p).waitFor({ timeout: 20000 }).catch(() => {});
  await aba(p, B).waitFor({ timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(300);
  ok('[favoritas] tocar em «→ B» abre o sentido B', (await aba(p, B).getAttribute('aria-pressed')) === 'true');
  ok('[favoritas] e a estrela está acesa', await premida(p));
  await fechar(p);

  // 5. Tirar o sentido A na lista: fica o B
  await linhaA.first().getByRole('button', { name: /Remover dos favoritos/ }).click();
  await p.waitForTimeout(800);
  g = await guardados(p);
  ok('[favoritas] tirar A deixa só B', g.length === 1 && g[0].id === idB, JSON.stringify(g));
  ok('[favoritas] a linha A sai da lista e a B fica', (await linhaA.count()) === 0 && (await linhaB.count()) === 1);
  ok('[sem erros de página]', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

// 6. Favorito antigo (linha inteira): tirar um sentido deixa o outro
{
  const antigo = { id: `line-${linha.id}`, type: 'linha', category: 'transportes', title: linha.name || linha.code, lineCode: linha.code, operatorName: linha.operator, addedAt: Date.now() };
  const { ctx, p, erros } = await abrir({ favoritos: { itens: [antigo], ids: [linha.id] } });
  await abrirLinha(p);
  await aba(p, A).click();
  ok('[antigo] linha inteira guardada: a estrela está acesa no sentido A', await premida(p));
  await aba(p, B).click();
  ok('[antigo] e no sentido B', await premida(p));
  await aba(p, A).click();
  await estrela(p).click();
  await p.waitForTimeout(500);
  const g = await guardados(p);
  ok('[antigo] tirar A deixa B guardado (e a linha inteira sai)', g.length === 1 && g[0].id === idB, JSON.stringify(g));
  ok('[antigo] a estrela de A apaga', !(await premida(p)));
  await aba(p, B).click();
  ok('[antigo] a de B continua acesa', await premida(p));
  ok('[antigo] sem erros de página', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

// 7. 320 px: sem scroll lateral, alvos de toque
{
  const ids = [linha.id];
  const itens = [A, B].map((d) => ({ id: `line-${linha.id}~s${d.direction_id}`, type: 'linha', category: 'transportes', title: d.headsign, lineCode: linha.code, operatorName: linha.operator, sentido: d.direction_id, destino: d.headsign, addedAt: Date.now() }));
  const { ctx, p } = await abrir({ largura: 320, favoritos: { itens, ids } });
  await p.goto(`${BASE}/transportes`, { waitUntil: 'domcontentloaded' });
  await p.locator(`[data-linha="${linha.id}"][data-sentido]`).first().waitFor({ timeout: 25000 }).catch(() => {});
  const n = await p.locator(`[data-linha="${linha.id}"][data-sentido]`).count();
  ok('[320] as duas linhas favoritas aparecem', n === 2, String(n));
  const lateral = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('[320] sem scroll lateral', lateral <= 1, String(lateral));
  await p.screenshot({ path: `${SAIDA}/favoritos-sentido-lista_320.png` });
  await p.locator(`[data-linha="${linha.id}"][data-sentido]`).first().click();
  await estrela(p).waitFor({ timeout: 20000 }).catch(() => {});
  const caixa = await estrela(p).boundingBox();
  ok('[320] a estrela tem pelo menos 44 px', !!caixa && caixa.width >= 44 && caixa.height >= 44, caixa ? `${caixa.width}x${caixa.height}` : '');
  const lateral2 = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('[320] detalhe sem scroll lateral', lateral2 <= 1, String(lateral2));
  await p.screenshot({ path: `${SAIDA}/favoritos-sentido-detalhe_320.png` });
  await ctx.close();
}

await browser.close();
console.log(falhas ? `${falhas} FALHOU` : 'tudo OK');
process.exit(falhas ? 1 : 0);
