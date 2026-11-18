// Capturas de vários separadores de uma vez (para comparar antes e depois de uma mudança de estilo).
// Uso: node dev/ecras-ui.mjs <cidade> <pasta> <largura> <língua> <separador> [separador…]
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, OUT, W, LANG, ...TABS] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const erros = [];
for (const tab of TABS) {
  const ctx = await browser.newContext({ viewport: { width: +W, height: 860 }, deviceScaleFactor: 2 });
  const [n, v] = cookies[process.env.CONTA || 'Novato'].split('=');
  await ctx.addCookies([{ name: n, value: v, url: base }]);
  await ctx.addInitScript(([lang, tab]) => { localStorage.setItem('cr.tab', JSON.stringify(tab)); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [LANG, tab]);
  await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(tab + ': ' + e.message));
  await p.goto(base + '/'); await p.waitForTimeout(1500);
  if (process.env.TEMA) { await p.addStyleTag({ path: process.env.TEMA }); await p.waitForTimeout(300); }   // v92: experimentar um tema (folha de estilo por cima da do jogo)
  if (process.env.CLICK) { await p.locator(process.env.CLICK).first().click(); await p.waitForTimeout(600); }   // ex.: CLICK='.ppg button >> nth=1'
  if (process.env.CLICK2) { await p.locator(process.env.CLICK2).first().click(); await p.waitForTimeout(700); }   // um segundo toque (abrir uma folha depois de mudar de separador)
  if (process.env.FILL) { const [sel, v] = process.env.FILL.split('='); await p.locator(sel).first().pressSequentially(v); await p.waitForTimeout(300); }
  if (process.env.FULL) await p.addStyleTag({ content: '.tabs{display:none!important}' });   // a página inteira: a barra de baixo ficava a meio
  if (process.env.FULL) {   // as imagens que carregam ao chegar perto: descer a página toda antes da captura
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
    await p.waitForTimeout(700);
  }
  const lado = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);   // nada pode sair para o lado
  if (lado > 0) erros.push(tab + ': a página sai ' + lado + ' px para o lado');
  await p.screenshot({ path: join(OUT, `${tab}-${LANG}-${W}${process.env.TEMA ? '-' + process.env.TEMA.split('/').pop().replace('.css', '') : ''}.png`), fullPage: !!process.env.FULL });
  await ctx.close();
}
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros');
await browser.close();
