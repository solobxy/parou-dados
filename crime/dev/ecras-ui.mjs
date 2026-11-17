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
  await p.screenshot({ path: join(OUT, `${tab}-${LANG}-${W}.png`) });
  await ctx.close();
}
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros');
await browser.close();
