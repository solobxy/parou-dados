// Prisão no browser simulado (v75): preso, só se vê a prisão; joga cartas, pátio, contrabando, oficina e fuga com toques
// a sério e tira capturas a meio e no fim de cada cena. Uso: node dev/prisao-ui.mjs <cidade> <capturas> [largura] [língua]
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CID = process.argv[2] || '/tmp/cidade-p6b', OUT = process.argv[3] || '/tmp/cap-prisao', W = +(process.argv[4] || 390), LANG = process.argv[5] || 'pt';
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: W, height: 860 }, deviceScaleFactor: 2 });
const [n, v] = cookies[process.env.CONTA || 'Novato'].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([lang]) => { localStorage.setItem('cr.tab', JSON.stringify('casino')); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
await p.goto(base + '/'); await p.waitForTimeout(1200);
const shot = (nome, full = false) => p.screenshot({ path: join(OUT, `${nome}-${LANG}-${W}.png`), fullPage: full });
// pediu o casino, mas está preso: tem de aparecer a prisão, sem a barra de baixo
const tab = await p.evaluate(() => ({ preso: document.body.classList.contains('preso'), h1: document.querySelector('.phead h1')?.textContent, tabs: getComputedStyle(document.querySelector('.tabs')).transform }));
console.log('preso:', JSON.stringify(tab));
await shot('cela', true);
async function cena(nome, clicar) {
  await clicar();
  await p.waitForSelector('.jsc.in', { timeout: 8000 });
  await p.waitForTimeout(700); await shot(nome + '-meio');
  await p.waitForSelector('.jsc-foot.on', { timeout: 8000 });
  await p.waitForTimeout(300); await shot(nome + '-fim');
  console.log(nome, '→', (await p.locator('.jsc-foot').innerText()).replace(/\s+/g, ' '));
  await p.locator('.jsc .btn.ghost, .jsc .btn.buy').last().click(); await p.waitForTimeout(400);
}
const linha = (i) => p.locator('.jaill .vrow').nth(i);
await cena('cartas', () => linha(3).locator('button').first().click());
await cena('patio', () => linha(2).locator('button').click());
await cena('contrabando', () => linha(0).locator('button').click());
await cena('oficina', () => linha(1).locator('button').click());
// a fuga pede confirmação (segundo toque)
await cena('fuga', async () => { const b = linha(5).locator('button'); await b.click(); await p.waitForTimeout(150); await linha(5).locator('button').click(); });
await p.waitForTimeout(800); await shot('depois', true);
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros na consola');
await browser.close();
