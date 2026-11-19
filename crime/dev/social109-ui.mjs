// v109: capturas do chat da cidade e do perfil público (toca no botão do chat, depois num nome, depois na vitrine das honras).
// Uso: CONTA=Rico node dev/social109-ui.mjs <cidade> <pasta> <largura> <língua>
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, OUT, W, LANG] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: +W, height: 780 }, deviceScaleFactor: 2 });
const [n, v] = cookies[process.env.CONTA || 'Rico'].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([l]) => { if (!sessionStorage.getItem('t0')) { sessionStorage.setItem('t0', '1'); localStorage.setItem('cr.tab', JSON.stringify('city')); } localStorage.setItem('cr.lang', l); if (!localStorage.getItem('cr.chatSeen')) localStorage.setItem('cr.chatSeen', '1'); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base + '/'); await p.waitForTimeout(1200);
const nome = (s) => join(OUT, `${s}-${LANG}-${W}.png`);
await p.screenshot({ path: nome('fab') });
await p.click('.chatbtn'); await p.waitForTimeout(900);
await p.screenshot({ path: nome('chat') });
const alvo = await p.$('.cmsg:not(.me) .plink') || await p.$('.cmsg .plink');
if (alvo) { await alvo.click(); await p.waitForTimeout(900); await p.screenshot({ path: nome('perfil') }); }
await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.evaluate(() => { localStorage.setItem('cr.tab', JSON.stringify('honras')); });
await p.goto(base + '/'); await p.waitForTimeout(1000);
const seg = await p.$$('.honmode button'); if (seg[1]) { await seg[1].click(); await p.waitForTimeout(500); }
for (let i = 0; i < 3; i++) { const x = await p.$('.honb:not(.on)'); if (!x) break; await x.click(); await p.waitForTimeout(800); }
await p.screenshot({ path: nome('vitrine') });
await p.click('.badge'); await p.waitForTimeout(600);
const mine = await p.$('text=' + (LANG === 'pt' ? 'Ver o meu perfil público' : 'See my public profile'));
if (mine) { await mine.click(); await p.waitForTimeout(900); await p.screenshot({ path: nome('meu'), fullPage: false }); }
console.log(errs.length ? 'ERROS: ' + errs.join(' | ') : 'sem erros');
await b.close();
