// v105: na cave, tocar num material básico em falta leva aos biscates, com o biscate certo marcado e à vista.
// Uso: node dev/cave105-ui.mjs <cidade> <conta> <língua>   (a conta precisa de ter 0 aparelhos avariados)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, CONTA, LANG] = process.argv.slice(2);
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 320, height: 760 } });
const [n, v] = cookies[CONTA].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([l]) => { localStorage.setItem('cr.tab', JSON.stringify('cave')); localStorage.setItem('cr.lang', l); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(String(e)));
await p.goto(base + '/'); await p.waitForTimeout(1500);
const bt = p.locator('button.cvgo', { hasText: LANG === 'pt' ? 'aparelho' : 'gadget' }).first();
if (!(await bt.count())) { console.log('FALHA: não há botão para o material básico'); process.exit(1); }
await bt.click(); await p.waitForTimeout(1200);
const r = await p.evaluate(() => { const e = document.querySelector('.tk-gig.gkhi'); if (!e) return null; const q = e.getBoundingClientRect(); return { id: e.id, dentro: q.top >= 0 && q.bottom <= innerHeight, tab: JSON.parse(localStorage.getItem('cr.tab')) }; });
console.log(JSON.stringify(r), erros.length ? 'erros: ' + erros.join(' | ') : 'sem erros');
await p.screenshot({ path: '/tmp/rev/cave105-' + LANG + '.png' });
await b.close();
process.exit(r && r.dentro && r.id === 'gk-entregas' && !erros.length ? 0 : 1);
