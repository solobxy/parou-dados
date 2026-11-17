// A série do ginásio num browser simulado, com toques a sério (page.tap num ecrã tátil) ou com o teclado.
// 1.ª série: 5 repetições, com 2 toques nervosos na contagem e a 4.ª fora do ritmo; capturas na contagem, a meio e no resumo.
// 2.ª série: desiste-se com Esc depois do 2.º topo (só se cobram 2 repetições).
// Uso: node dev/ginasio-ui.mjs <cidade> <pasta> <largura> <língua> [rm|kb]
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, OUT, W, LANG, MODO] = process.argv.slice(2);
const RM = MODO === 'rm', KB = MODO === 'kb';
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: 780 }, deviceScaleFactor: 2, hasTouch: !KB, isMobile: !KB, reducedMotion: RM ? 'reduce' : 'no-preference' });
const [n, v] = cookies[process.env.CONTA || 'Novato'].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([lang]) => {
  localStorage.setItem('cr.tab', JSON.stringify('gym')); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false');
  // quando aparece o ecrã da série, guarda a hora (o relógio da página) para os toques saírem no tempo certo
  new MutationObserver(() => { if (document.querySelector('.gym-on') && !window.__gy0) window.__gy0 = performance.now(); if (!document.querySelector('.gym-on')) window.__gy0 = 0; }).observe(document, { childList: true, subtree: true });
}, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage(); const erros = [];
p.on('pageerror', (e) => erros.push(e.message));
await p.goto(base + '/'); await p.waitForTimeout(1500);
const sfx = (RM ? '-rm' : '') + (KB ? '-kb' : '');
const largo = await p.evaluate((w) => Math.max(document.documentElement.scrollWidth, innerWidth) - w, +W);   // > 0 = a página sai para o lado
await p.screenshot({ path: join(OUT, `gym-antes-${LANG}-${W}${sfx}.png`) });
const cfg = await p.evaluate(() => fetch('/api/config').then((r) => r.json()).then((c) => c.train.set));
// diferença entre o relógio daqui e o da página
const sync = async () => { const a = Date.now(), pn = await p.evaluate(() => performance.now()), b = Date.now(); return (a + b) / 2 - pn; };
const toque = async () => (KB ? p.keyboard.press(' ') : p.locator('.gy-pad').tap({ timeout: 2000 }));
async function serie(alvos, fotos = {}) {
  if (KB) { await p.locator('.gymr .btn.buy').first().focus(); await p.keyboard.press('Enter'); } else await p.locator('.gymr .btn.buy').first().tap();
  await p.waitForFunction(() => window.__gy0 > 0);
  const off = await sync(), g0 = await p.evaluate(() => window.__gy0);
  for (const [k, ms] of alvos.entries()) {
    const quando = off + g0 + ms - 25;   // o toque sai uns ms depois de pedido
    await p.waitForTimeout(Math.max(0, quando - Date.now()));
    if (ms === 'esc') { await p.keyboard.press('Escape'); continue; }
    await toque();
    if (fotos[k]) await p.screenshot({ path: join(OUT, `gym-${fotos[k]}-${LANG}-${W}${sfx}.png`) });
  }
}
const L = cfg.lead, B = cfg.beat;
await serie([700, 1500, L + 20, L + B - 30, L + 2 * B + 40, L + 3 * B + 400, L + 4 * B - 10], { 1: 'contagem', 4: 'serie' });
await p.waitForSelector('.gy-sum', { timeout: 5000 });
await p.screenshot({ path: join(OUT, `gym-resumo-${LANG}-${W}${sfx}.png`) });
const resumo = await p.locator('.gy-sum').innerText();
await p.waitForSelector('.gym-on', { state: 'detached', timeout: 5000 });
await p.waitForTimeout(400);
const foco = await p.evaluate(() => document.activeElement?.dataset?.gym || document.activeElement?.className);
await p.screenshot({ path: join(OUT, `gym-depois-${LANG}-${W}${sfx}.png`) });
// desistir com Esc depois do 2.º topo
await p.evaluate(() => { window.__gy0 = 0; });
await serie([L + 10, L + B + 20, L + B + 600]);
await p.keyboard.press('Escape');
await p.waitForSelector('.gy-sum', { timeout: 5000 });
const desistir = await p.locator('.gy-sum').innerText();
await p.screenshot({ path: join(OUT, `gym-desistir-${LANG}-${W}${sfx}.png`) });
console.log(JSON.stringify({ resumo, desistir, foco, largo }));
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros');
await browser.close();
