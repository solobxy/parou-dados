// Testa, num browser simulado (Chromium), as imagens dos posts da Comunidade (novidades da PAROU):
//   1. tocar numa imagem abre-a DENTRO da app (ecrã grande), sem abrir outra página nem sair do endereço;
//   2. fecha com o X, com o fundo escuro, com Esc e com o gesto de voltar do telemóvel (sem sair da Comunidade);
//   3. com duas imagens, passa de uma para a outra (botões, setas do teclado e deslizar o dedo);
//   4. com o service worker ligado (como na app instalada), abrir o ficheiro de uma imagem devolve a imagem e não a app com «Página não encontrada».
// Erro que isto impede: tocar na imagem do post abria o ficheiro como página; o service worker respondia com a app, que arrancava de novo no
// endereço da imagem e mostrava «Página não encontrada».
// Uso: BASE=http://127.0.0.1:3000 SAIDA=pasta node auditoria/post-imagem.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const IMAGENS = ['/novidades/todos-autocarros-1.jpg', '/novidades/todos-autocarros-2.jpg'];
const POST = {
  id: 'pub-teste', titulo: 'Todos os autocarros no mapa', texto: 'O mapa do Perto agora mostra todos os autocarros que estão no ecrã.', tipo: 'novidade', imagens: IMAGENS,
  comLocalizacao: false, criado: Date.now() - 300000, pontos: 0, respostas: 0, estado: 'visivel', meuVoto: 0, meu: false, denunciei: false,
  autor: { nome: 'Dinis Sousa', avatar: { personagem: 'paro', cor: 'laranja' }, pioneiro: false, criador: true, pontos: 9 },
};

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const INICIO = `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_localizacao_ok','1'); }catch(e){}`;

async function abrirComunidade(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', userAgent: UA, serviceWorkers: 'block' });
  await ctx.addInitScript({ content: INICIO });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (rt) => rt.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64') }));
  await ctx.route('**/api/comunidade/conversas?**', (rt) => rt.request().method() === 'GET' ? rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ itens: [POST], proxima: null }) }) : rt.continue());
  await ctx.route('**/api/comunidade/conversas', (rt) => rt.request().method() === 'GET' ? rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ itens: [POST], proxima: null }) }) : rt.continue());
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  const abertas = [];
  ctx.on('page', (np) => { if (np !== p) abertas.push(np.url()); });
  await p.goto(BASE + '/comunidade', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('[data-teste="imagens-post"]', { timeout: 30000 });
  return { ctx, p, erros, abertas };
}

const aberta = (p) => p.locator('[data-teste="imagem-grande"]').isVisible().catch(() => false);
const primeira = (p) => p.locator('[data-teste="imagens-post"] [aria-label^="Abrir imagem"]').first();

(async () => {
  const br = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    // ------------------------------------------------------------ 1-3: a imagem abre dentro da app
    {
      const { ctx, p, erros, abertas } = await abrirComunidade(br);
      const url0 = new URL(p.url()).pathname;
      await primeira(p).click();
      await p.waitForTimeout(900);
      ok('[imagem] tocar na imagem não abre outra página', abertas.length === 0, abertas.join(','));
      ok('[imagem] o endereço não muda', new URL(p.url()).pathname === url0, p.url());
      ok('[imagem] abre-se o ecrã grande da imagem', await aberta(p));
      const img = p.locator('[data-teste="imagem-grande"] img').first();
      const src = await img.getAttribute('src').catch(() => '');
      ok('[imagem] mostra a primeira imagem', (src || '').endsWith(IMAGENS[0]), src);
      await p.waitForFunction(() => { const i = document.querySelector('[data-teste="imagem-grande"] img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => {});
      ok('[imagem] a imagem carregou', await img.evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false));
      const caixa = await img.boundingBox().catch(() => null);
      ok('[imagem] cabe no ecrã (390×780)', !!caixa && caixa.x >= -1 && caixa.x + caixa.width <= 391 && caixa.y >= -1 && caixa.y + caixa.height <= 781, caixa ? JSON.stringify(caixa) : 'sem caixa');
      const cont = (await p.locator('[data-teste="imagem-contador"]').innerText().catch(() => '')).replace(/\s+/g, '');
      ok('[imagem] diz «1/2»', /^1(\/|de)2$/.test(cont), cont);
      await p.screenshot({ path: `${SAIDA}/post_imagem_aberta.png` }).catch(() => {});
      // outra imagem: botão, teclado, deslizar
      await p.locator('[data-teste="imagem-seguinte"]').click().catch(() => {});
      await p.waitForTimeout(300);
      ok('[imagem] «seguinte» mostra a segunda', ((await img.getAttribute('src').catch(() => '')) || '').endsWith(IMAGENS[1]));
      await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(250);
      ok('[imagem] seta esquerda volta à primeira', ((await img.getAttribute('src').catch(() => '')) || '').endsWith(IMAGENS[0]));
      const c = await img.boundingBox().catch(() => null);
      if (c) {
        const cdp = await ctx.newCDPSession(p);
        const y = c.y + c.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 320, y }] });
        for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 320 - k * 30, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await p.waitForTimeout(400);
        ok('[imagem] deslizar o dedo para a esquerda passa à segunda', ((await img.getAttribute('src').catch(() => '')) || '').endsWith(IMAGENS[1]));
      }
      // fechar: X
      await p.locator('[data-teste="imagem-fechar"]').click(); await p.waitForTimeout(300);
      ok('[imagem] o X fecha', !(await aberta(p)));
      ok('[imagem] depois de fechar continua na Comunidade', new URL(p.url()).pathname === url0);
      // fechar: Esc
      await primeira(p).click(); await p.waitForTimeout(500);
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      ok('[imagem] Esc fecha', !(await aberta(p)));
      // fechar: fundo escuro
      await primeira(p).click(); await p.waitForTimeout(500);
      const caixaImg = await p.locator('[data-teste="imagem-grande"] img').first().boundingBox().catch(() => null);
      await p.mouse.click(195, caixaImg ? Math.min(caixaImg.y + caixaImg.height + 30, 700) : 650); await p.waitForTimeout(300);
      ok('[imagem] tocar no fundo escuro fecha', !(await aberta(p)));
      // fechar: voltar do telemóvel
      await primeira(p).click(); await p.waitForTimeout(500);
      await p.goBack().catch(() => {}); await p.waitForTimeout(600);
      ok('[imagem] o gesto de voltar fecha a imagem', !(await aberta(p)));
      ok('[imagem] e não sai da Comunidade', new URL(p.url()).pathname === url0 && (await p.locator('[data-teste="imagens-post"]').count()) > 0, p.url());
      const corpo = await p.locator('body').innerText();
      ok('[imagem] nunca aparece «Página não encontrada»', !/Página não encontrada/.test(corpo));
      ok('[imagem] sem erros na consola', erros.length === 0, erros.slice(0, 2).join(' | '));
      await ctx.close();
    }
    // ------------------------------------------------------------ 4: service worker ligado (app instalada)
    {
      const ctx = await br.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, locale: 'pt-PT', userAgent: UA, serviceWorkers: 'allow' });
      await ctx.addInitScript({ content: INICIO });
      const p = await ctx.newPage();
      await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      const temSw = await p.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return 'sem';
        const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 20000))]);
        return reg ? 'ativo' : 'nao-ativou';
      }).catch(() => 'erro');
      console.log('NOTA    service worker:', temSw);
      if (temSw === 'ativo') {
        await p.reload({ waitUntil: 'domcontentloaded' });
        await p.waitForTimeout(1500);
        const controlado = await p.evaluate(() => !!navigator.serviceWorker.controller);
        console.log('NOTA    a página é controlada pelo service worker:', controlado);
        for (const caminho of IMAGENS.concat(['/icon-192.png', '/favicon.svg'])) {
          const q = await ctx.newPage();
          const r = await q.goto(BASE + caminho, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
          const tipo = r ? (r.headers()['content-type'] || '') : '';
          const html = await q.content().catch(() => '');
          ok(`[service worker] abrir ${caminho} devolve a imagem (não a app)`, !!r && /^image\//.test(tipo) && !/id="root"/.test(html), tipo);
          await q.close();
        }
      } else {
        ok('[service worker] o service worker da app ativa-se', false, temSw);
      }
      await ctx.close();
    }
  } catch (e) {
    ok('[imagem] o teste correu sem exceções', false, String(e).slice(0, 300));
  } finally {
    await br.close();
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nAs imagens dos posts abrem dentro da app e nunca levam a «Página não encontrada».');
  process.exit(falhas ? 1 : 0);
})();
