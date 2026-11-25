// Arranque rápido: o primeiro ecrã (esqueleto) aparece sem esperar pelo CSS, e a app nunca aparece sem estilos.
//
// O que se mede: com o CSS principal atrasado 3 s, o esqueleto tem de estar pintado em menos de 1,5 s (antes esperava pelo CSS);
// quando a app substitui o esqueleto, o CSS já tem de estar aplicado. Sem atraso: a app arranca sem erros. Por fim, mede o
// primeiro ecrã num telemóvel simulado em 4G lenta (CPU 4x mais lenta), para comparar versões.
// Uso: BASE=http://127.0.0.1:3000 SAIDA=res node arranque-rapido.mjs   (CHROME=/caminho/do/chrome para usar outro browser)
import fs from 'fs';

let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('playwright-core')); }
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
async function pagina({ atrasoCss = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-PT', serviceWorkers: 'block' });
  await ctx.addInitScript({ content: `try{ localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); }catch(e){}
    window.__semCssAoMontar = null;
    new MutationObserver(function(m, o){ if (!document.getElementById('parou-arranque') && document.getElementById('root') && document.getElementById('root').children.length) {
      window.__semCssAoMontar = !Array.prototype.some.call(document.styleSheets, function(s){ return s.href && s.href.indexOf('/assets/index-') >= 0; });
      o.disconnect(); } }).observe(document, { childList: true, subtree: true });` });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  if (atrasoCss) await ctx.route(/\/assets\/index-[^/]+\.css/, async (r) => { await new Promise((s) => setTimeout(s, atrasoCss)); await r.continue(); });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  return { ctx, p, erros };
}
const fcp = (p) => p.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null);

{
  const r = await fetch(BASE + '/');
  const html = await r.text();
  const semNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  ok('[html] o CSS principal não trava o primeiro ecrã (preload, não stylesheet)', /<link rel="preload" as="style"[^>]*id="parou-css"/.test(html) && !/<link rel="stylesheet"[^>]*\/assets\/index-/.test(semNoscript));
  ok('[html] sem JavaScript, o CSS continua a entrar (noscript)', /<noscript><link rel="stylesheet"[^>]*\/assets\/index-/.test(html));
  ok('[html] o esqueleto está no HTML', /id="parou-arranque"/.test(html));
  const bloqueiam = [...html.matchAll(/<script\b([^>]*)\bsrc=([^>]*)>/g)].filter((m) => !/\b(defer|async)\b|type="module"/.test(m[0])).map((m) => m[0]);
  ok('[html] nenhum <script src> para a leitura da página (todos com defer, async ou module)', bloqueiam.length === 0, bloqueiam.join(' '));
}
{
  const { ctx, p, erros } = await pagina({ atrasoCss: 3000 });
  await p.goto(BASE + '/', { waitUntil: 'commit' });
  await p.waitForTimeout(1500);
  const primeiro = await fcp(p);
  const esqueleto = await p.locator('#parou-arranque').isVisible().catch(() => false);
  await p.screenshot({ path: `${SAIDA}/arranque-css-atrasado.png` });
  ok('[CSS atrasado 3 s] o esqueleto aparece em menos de 1,5 s', primeiro !== null && primeiro < 1500 && esqueleto, `primeiro ecrã: ${primeiro === null ? 'nenhum' : Math.round(primeiro) + ' ms'}`);
  await p.waitForFunction(() => window.__semCssAoMontar !== null, null, { timeout: 15000 }).catch(() => {});
  const semCss = await p.evaluate(() => window.__semCssAoMontar);
  ok('[CSS atrasado 3 s] a app só aparece com o CSS aplicado', semCss === false, String(semCss));
  ok('[CSS atrasado 3 s] sem erros', erros.length === 0, erros.join(' | '));
  await ctx.close();
}
{
  const { ctx, p, erros } = await pagina();
  await p.goto(BASE + '/', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__semCssAoMontar !== null, null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${SAIDA}/arranque-normal.png` });
  ok('[normal] a app arranca com estilos', (await p.evaluate(() => window.__semCssAoMontar)) === false);
  ok('[normal] sem erros', erros.length === 0, erros.join(' | '));
  await ctx.close();
}
{
  // Telemóvel simulado: 4G lenta (150 ms, 1,6 Mbit/s) e CPU 4x mais lenta, como o Lighthouse
  const { ctx, p } = await pagina();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await p.goto(BASE + '/', { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__semCssAoMontar !== null, null, { timeout: 60000 }).catch(() => {});
  const app = Date.now() - t0;
  const primeiro = await fcp(p);
  console.log(`NOTA    [4G lenta] primeiro ecrã ${primeiro === null ? '?' : Math.round(primeiro)} ms; app pronta ~${app} ms`);
  // Antes (25/11/2026) o esqueleto esperava ~2,4 s: o registo do service worker era um <script> que parava a leitura da página
  ok('[4G lenta] o primeiro ecrã aparece em menos de 1,5 s', primeiro !== null && primeiro < 1500, `${primeiro === null ? '?' : Math.round(primeiro)} ms`);
  await ctx.close();
}
await browser.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
