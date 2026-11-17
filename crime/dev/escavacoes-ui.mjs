// As escavações num browser simulado, com toques a sério: a lista de sítios, começar em Briteiros, três pazadas, sair; e o museu
// com os conjuntos novos. Capturas de cada passo e se a página sai para o lado.
// Uso: node dev/escavacoes-ui.mjs <cidade> <pasta> <largura> <língua>   (antes: node dev/escavacoes-cidade.mjs <dados> livre)
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, OUT, W, LANG] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const [n, v] = cookies[process.env.CONTA || 'Rico'].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([lang]) => { localStorage.setItem('cr.tab', JSON.stringify('dig')); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage(); const erros = [], largo = {}, toasts = {};
p.on('pageerror', (e) => erros.push(e.message));
await p.goto(base + '/'); await p.waitForSelector('.vrow.dgs'); await p.waitForTimeout(800);
await p.addStyleTag({ content: '.tabs{display:none!important}' });
const shot = async (nome, full = true) => {
  largo[nome] = await p.evaluate((w) => Math.max(document.documentElement.scrollWidth, innerWidth) - w, +W);
  await p.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; })); await p.waitForTimeout(300);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 5000 }).catch(() => {});
  await p.screenshot({ path: join(OUT, `dig-${nome}-${LANG}-${W}.png`), fullPage: full });
};
const toca = async (loc) => { await loc.scrollIntoViewIfNeeded(); await p.waitForTimeout(150); await loc.tap(); await p.waitForTimeout(450); };
const toast = async (k) => { toasts[k] = await p.locator('.toast').last().innerText().catch(() => ''); await p.evaluate(() => document.querySelector('.toasts')?.replaceChildren()); };
const sep = (k) => toca(p.locator('.seg').first().locator('button').nth(k));
await shot('sitios');
await toca(p.locator('.vrow.dgs').first().locator('.btn')); await toast('comecar');
await p.waitForSelector('.dgb'); await shot('grelha');
for (const i of [0, 14, 21]) { await toca(p.locator('.dgb > *').nth(i)); await p.waitForTimeout(300); await toast('pazada' + i); }
await shot('pazadas');
await toca(p.locator('.dgnow .btn.block')); await toast('sair');
await p.waitForSelector('.vrow.dgs'); await shot('depois');
console.log(JSON.stringify({ largo, toasts }));
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros');
await browser.close();
