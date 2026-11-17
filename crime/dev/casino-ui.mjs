// Capturas das slots do casino (Zeus, Doce, Rebuçado, clássica) para conferir os botões. Uso: node dev/casino-ui.mjs [cidade] [pasta] [largura] [língua]
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CID = process.argv[2] || '/tmp/cidade-p6b', OUT = process.argv[3] || '/tmp/cap-casino', W = +(process.argv[4] || 390), LANG = process.argv[5] || 'pt';
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const erros = [];
for (const tab of (process.env.SO || 'zeus,doce,rebucado,slot').split(',')) {
  const ctx = await browser.newContext({ viewport: { width: W, height: +(process.env.H || 860) }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const [n, v] = cookies[process.env.CONTA || 'Rico'].split('=');
  await ctx.addCookies([{ name: n, value: v, url: base }]);
  await ctx.addInitScript(([tab, lang]) => { localStorage.setItem('cr.tab', JSON.stringify(tab)); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [tab, LANG]);
  await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(tab + ': ' + e.message));
  await p.goto(base + '/'); await p.waitForTimeout(2500);
  await p.screenshot({ path: join(OUT, `${tab}-${LANG}-${W}.png`) });
  await p.screenshot({ path: join(OUT, `${tab}-${LANG}-${W}-tudo.png`), fullPage: true });
  // os botões que se veem e se dá para lhes tocar (o que está por cima no centro de cada um)
  const bts = await p.$$eval('button', (bs) => bs.filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return `${(b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 30)} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}]${top && (top === b || b.contains(top)) ? '' : ' TAPADO'}`; }));
  console.log(tab, '→', bts.join(' | '));
  await ctx.close();
}
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros na consola');
await browser.close();
