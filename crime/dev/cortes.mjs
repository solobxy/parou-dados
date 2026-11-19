// Procura texto cortado com reticências (scrollWidth maior que a largura visível) em cada separador.
// Uso: CONTA=Rico node dev/cortes.mjs <cidade> <largura> <língua> <separador> [separador…]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, W, LANG, ...TABS] = process.argv.slice(2);
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let total = 0;
for (const tab of TABS) {
  const ctx = await browser.newContext({ viewport: { width: +W, height: 860 } });
  const [n, v] = cookies[process.env.CONTA || 'Rico'].split('=');
  await ctx.addCookies([{ name: n, value: v, url: base }]);
  await ctx.addInitScript(([l, t]) => { localStorage.setItem('cr.tab', JSON.stringify(t)); localStorage.setItem('cr.lang', l); }, [LANG, tab]);
  await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
  const p = await ctx.newPage(); await p.goto(base + '/'); await p.waitForTimeout(1300);
  const out = await p.evaluate(() => {
    const res = [], main = document.querySelector('main'); if (!main) return res;
    for (const e of main.querySelectorAll('*')) {
      if (!e.offsetWidth || e.closest('[data-hscroll], .hscroll, .sr, .ntx')) continue;
      const own = [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()); if (!own) continue;
      const cs = getComputedStyle(e);
      if (cs.textOverflow !== 'ellipsis' && cs.overflow !== 'hidden') continue;
      if (e.scrollWidth > e.clientWidth + 1) res.push(`${e.tagName}.${(e.className || '').toString().slice(0, 24)} «${e.textContent.trim().slice(0, 44)}»`);
    }
    return [...new Set(res)].slice(0, 8);
  });
  if (out.length) { total += out.length; console.log(tab + ': ' + out.join(' | ')); }
  await ctx.close();
}
console.log(total ? 'total ' + total : 'nada cortado');
await browser.close();
