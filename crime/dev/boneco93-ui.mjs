// v93: o boneco do inventário a sério — arrastar com o rato, arrastar com o dedo (segurar e arrastar), tirar do corpo e o toque.
// Uso: node dev/boneco93-ui.mjs <cidade> <pasta>   (conta Rico, com peças guardadas)
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const abrir = async (touch) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const [n, v] = cookies.Rico.split('='); await ctx.addCookies([{ name: n, value: v, url: base }]);
  await ctx.addInitScript(() => { localStorage.setItem('cr.tab', JSON.stringify('inv')); localStorage.setItem('cr.lang', 'pt'); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); });
  await ctx.route('**/_e.js', (r) => r.fulfill({ body: '' }));
  const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(base + '/'); await p.waitForTimeout(1500);
  return { ctx, p, erros };
};
const centro = async (p, sel) => { const b = await p.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const naSlot = (p, sl) => p.evaluate((sl) => document.querySelector(`.dslot[data-slot="${sl}"] img`)?.src.split('/').pop().split('.')[0] || null, sl);
const camada = (p, sl) => p.evaluate((sl) => document.querySelector(`.dfig img[data-layer="${sl}"]`)?.src.split('/').pop().split('.')[0] || null, sl);
const celula = (id) => `.invc:has(img[src*="/gear/${id}."])`;

// 1) rato: arrastar o casaco de cabedal para o tronco
{
  const { ctx, p, erros } = await abrir(false);
  await p.locator(celula('cabedal')).first().evaluate((e) => e.scrollIntoView({ block: 'center' }));   // ao meio: no fundo ficava por baixo da barra de baixo
  const a = await centro(p, celula('cabedal'));
  await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(a.x + 10, a.y - 10, { steps: 3 });
  await p.mouse.move(a.x, 60, { steps: 10 }); await p.waitForTimeout(900);   // perto do cimo: a página rola até ao boneco
  const b = await centro(p, '.dslot[data-slot="tronco"]');
  await p.mouse.move(b.x, b.y, { steps: 12 }); await p.waitForTimeout(150);
  await p.screenshot({ path: join(OUT, 'arrastar-rato.png') });
  await p.mouse.up(); await p.waitForTimeout(900);
  assert.equal(await naSlot(p, 'tronco'), 'cabedal', 'o casaco ficou vestido');
  assert.equal(await camada(p, 'tronco'), 'cabedal', 'e aparece no corpo');
  await p.screenshot({ path: join(OUT, 'depois-rato.png') });
  // 2) rato: tirar o capacete arrastando-o para a grelha
  await p.locator('.dslot[data-slot="cabeca"]').scrollIntoViewIfNeeded();
  const c = await centro(p, '.dslot[data-slot="cabeca"]');
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 20, c.y + 20, { steps: 3 });
  await p.mouse.move(c.x, 820, { steps: 12 }); await p.waitForTimeout(1200);   // perto do fundo: rola até à grelha
  const g = await centro(p, '.invc.vazio'); await p.mouse.move(g.x, g.y, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(900);
  assert.equal(await naSlot(p, 'cabeca'), null, 'a cabeça ficou vazia');
  assert.ok(await p.locator(celula('capacete')).count(), 'o capacete voltou para a grelha');
  // 3) um toque abre a folha e o botão veste
  await p.locator(celula('capatatico')).first().evaluate((e) => e.scrollIntoView({ block: 'center' }));   // ao meio: no fundo ficava por baixo da barra de baixo await p.waitForTimeout(500);
  await p.locator(celula('capatatico')).first().click(); await p.waitForTimeout(400);
  await p.screenshot({ path: join(OUT, 'folha.png') });
  await p.locator('.sheet .btn.buy').first().click(); await p.waitForTimeout(900);
  assert.equal(await naSlot(p, 'cabeca'), 'capatatico');
  assert.deepEqual(erros, []);
  await ctx.close();
}
// 4) dedo: segurar e arrastar as luvas táticas para as mãos; deslizar sem segurar não arrasta (é mexer a página)
{
  const { ctx, p, erros } = await abrir(true);
  const cdp = await ctx.newCDPSession(p);
  const toque = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await p.locator(celula('luvastaticas')).first().evaluate((e) => e.scrollIntoView({ block: 'center' }));   // ao meio: no fundo ficava por baixo da barra de baixo await p.waitForTimeout(400);
  const a = await centro(p, celula('luvastaticas'));
  // deslizar logo: não arrasta
  await toque('touchStart', a.x, a.y); for (let k = 1; k <= 6; k++) await toque('touchMove', a.x, a.y - k * 12); await toque('touchEnd'); await p.waitForTimeout(300);
  assert.notEqual(await naSlot(p, 'maos'), 'luvastaticas', 'deslizar não veste');
  await p.locator(celula('luvastaticas')).first().evaluate((e) => e.scrollIntoView({ block: 'center' }));   // ao meio: no fundo ficava por baixo da barra de baixo await p.waitForTimeout(400);
  const a2 = await centro(p, celula('luvastaticas'));
  await toque('touchStart', a2.x, a2.y); await p.waitForTimeout(400);
  for (let k = 1; k <= 10; k++) await toque('touchMove', a2.x, a2.y + ((60 - a2.y) * k) / 10);
  await p.waitForTimeout(1000);
  const b2 = await centro(p, '.dslot[data-slot="maos"]');
  for (let k = 1; k <= 10; k++) await toque('touchMove', a2.x + ((b2.x - a2.x) * k) / 10, 60 + ((b2.y - 60) * k) / 10);
  await p.waitForTimeout(100); await p.screenshot({ path: join(OUT, 'arrastar-dedo.png') });
  await toque('touchEnd'); await p.waitForTimeout(900);
  assert.equal(await naSlot(p, 'maos'), 'luvastaticas', 'segurar e arrastar veste');
  assert.deepEqual(erros, []);
  await p.screenshot({ path: join(OUT, 'depois-dedo.png') });
  await ctx.close();
}
console.log('ok');
await browser.close();
