// v92: mede o texto corrido (parágrafos) de cada ecrã, para encontrar onde há explicação a mais.
// Uso: node dev/texto92.mjs <cidade> <língua> <separador…>
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, LANG, ...TABS] = process.argv.slice(2);
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const res = [];
for (const tab of TABS) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  const [n, v] = cookies[process.env.CONTA || 'Rico'].split('=');
  await ctx.addCookies([{ name: n, value: v, url: base }]);
  await ctx.addInitScript(([lang, tab]) => { localStorage.setItem('cr.tab', JSON.stringify(tab)); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [LANG, tab]);
  await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
  const p = await ctx.newPage();
  await p.goto(base + '/'); await p.waitForTimeout(1300);
  const r = await p.evaluate(() => {
    const ps = [...document.querySelectorAll('main p, #main p, .main p')].filter((x) => x.offsetParent && !x.closest('.hud') && !x.closest('details:not([open])'));
    const txt = ps.map((x) => x.textContent.trim()).filter((x) => x.length > 0);
    return { total: txt.reduce((s, x) => s + x.length, 0), n: txt.length, longos: txt.filter((x) => x.length > 90).map((x) => x.slice(0, 140)) };
  });
  res.push({ tab, ...r });
  await ctx.close();
}
res.sort((a, b) => b.total - a.total);
for (const r of res) { console.log(`${r.tab}: ${r.total} letras em ${r.n} parágrafos`); for (const l of r.longos) console.log('   · ' + l); }
await browser.close();
