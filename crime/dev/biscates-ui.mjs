// Joga os três biscates num browser simulado, com toques e arrastos a sério, e tira capturas pelo caminho.
// Uso: node dev/biscates-ui.mjs <cidade> <capturas> [largura] [língua]
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CID = process.argv[2] || '/tmp/cidade-p6b', OUT = process.argv[3] || '/tmp/cap-bisc', W = +(process.argv[4] || 390), LANG = process.argv[5] || 'pt';
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: W, height: 860 }, deviceScaleFactor: 2, hasTouch: false });
const [n, v] = cookies[process.env.CONTA || 'Novato'].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([lang]) => { localStorage.setItem('cr.tab', JSON.stringify('gigs')); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
await p.goto(base + '/'); await p.waitForSelector('.tk-list', { timeout: 15000 });
await p.waitForTimeout(400);
const shot = (nome, full = false) => p.screenshot({ path: join(OUT, `${nome}-${LANG}-${W}.png`), fullPage: full });
await shot('lista', true);
const centro = async (el) => { const b = await el.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
async function arrasta(de, para) {
  await de.scrollIntoViewIfNeeded();
  const [x0, y0] = await centro(de); const [x1, y1] = await centro(para);
  await p.mouse.move(x0, y0); await p.mouse.down();
  for (let k = 1; k <= 8; k++) await p.mouse.move(x0 + ((x1 - x0) * k) / 8, y0 + ((y1 - y0) * k) / 8);
  await p.mouse.up(); await p.waitForTimeout(260);
}
async function resultado(nome) {
  await p.waitForSelector('.tk-res', { timeout: 30000 });
  await p.waitForTimeout(300); await shot(nome + '-fim', true);
  const txt = await p.locator('.tk-res').innerText(); console.log(nome, '→', txt.replace(/\s+/g, ' '));
  await p.locator('.tk-res .btn.ghost').click(); await p.waitForSelector('.tk-list');
}
const linha = (i) => p.locator('.tk-gig').nth(i);

// 1) camião: as três mais pesadas em baixo
await linha(0).click(); await p.waitForSelector('.tk-camiao');
await p.waitForTimeout(300); await shot('camiao-inicio');
const kgs = await p.$$eval('.tk-truck .tk-box', (bs) => bs.map((b) => parseInt(b.textContent)));
const ordem = kgs.map((k, i) => [k, i]).sort((a, b) => b[0] - a[0]);
for (let j = 0; j < 6; j++) {
  const box = p.locator('.tk-truck .tk-box').filter({ hasText: new RegExp('^' + ordem[j][0] + ' kg$') }).first();
  const slot = p.locator(`.tk-slot[data-k="${j}"]`);
  if (j === 1) { const [x, y] = await centro(box); await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 40, y - 120); await p.mouse.move(x + 60, y - 200); await p.mouse.up(); await p.waitForTimeout(450); if (j === 1) await shot('camiao-caiu'); }   // uma que cai
  if (j === 3) { await box.click(); await p.waitForTimeout(120); await shot('camiao-escolhida'); await slot.click(); await p.waitForTimeout(300); continue; }   // dois toques
  await arrasta(box, slot);
  if (j === 4) await shot('camiao-meio');
}
await resultado('camiao');

// 2) entregas: encomendas na mochila e as portas por ordem A, B, C, D
await linha(1).click(); await p.waitForSelector('.tk-entregas');
await p.waitForTimeout(300); await shot('entregas-inicio');
for (let j = 0; j < 4; j++) { await arrasta(p.locator('.tk-counter .tk-parcel').first(), p.locator('.tk-bag')); }
await p.waitForSelector('.tk-map', { state: 'visible' }); await p.waitForTimeout(400); await shot('entregas-mapa');
for (let j = 0; j < 4; j++) { await p.locator('.tk-map .pin').nth(j).click(); await p.waitForTimeout(j === 2 ? 900 : 700); if (j === 1) await shot('entregas-rota'); }
await resultado('entregas');

// 3) laboratório: comprimidos, triturar no verde, encher até 1,00 g
await linha(2).click(); await p.waitForSelector('.tk-lab');
await p.waitForTimeout(300); await shot('lab-inicio');
const npills = await p.locator('.tk-tray .tk-pill').count();
for (let j = 0; j < npills; j++) { await arrasta(p.locator('.tk-tray .tk-pill').first(), p.locator('.tk-grinder')); if (j === 2) await shot('lab-meio'); }
await p.waitForSelector('.tk-gauge', { state: 'visible' }); await p.waitForTimeout(300); await shot('lab-triturar');
for (let j = 0; j < 3; j++) {
  await p.waitForFunction(() => { const n = document.querySelector('.tk-gauge .needle'), z = document.querySelector('.tk-gauge .zone'); const x = parseFloat(n.style.left), a = parseFloat(z.style.left), w = parseFloat(z.style.width); return x > a + w * 0.3 && x < a + w * 0.7; }, null, { polling: 'raf', timeout: 10000 });
  await p.locator('.tk-lab .btn.buy:not(.tk-hold)').dispatchEvent('pointerdown');
  await p.waitForTimeout(250);
}
await p.waitForSelector('.tk-scale', { state: 'visible' }); await p.waitForTimeout(300); await shot('lab-sacos');
for (let j = 0; j < 3; j++) {
  const btn = p.locator('.tk-hold'); const [x, y] = await centro(btn);
  await p.mouse.move(x, y); await p.mouse.down();
  await p.waitForFunction(() => parseFloat(document.querySelector('.tk-scale .lcd b').textContent.replace(',', '.')) >= 0.995, null, { polling: 'raf', timeout: 10000 });
  if (j === 0) await shot('lab-a-encher');
  await p.mouse.up(); await p.waitForTimeout(650);
}
await resultado('laboratorio');
await shot('lista-depois', true);
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros na consola');
await browser.close();
