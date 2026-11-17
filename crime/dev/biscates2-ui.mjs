// Joga os biscates da v68 (oficina, mudanças, desmanche) num browser e tira capturas.
// Corre com: node dev/biscates2-ui.mjs [cidade] [pasta] [largura] [língua]   (com o servidor da cidade de teste a correr)
// A conta é a «Rico» (nível alto), para os três estarem abertos. Joga bem e confere o resultado.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const CID = process.argv[2] || '/tmp/cidade-p6b', OUT = process.argv[3] || '/tmp/cap-bisc2', W = +(process.argv[4] || 390), LANG = process.argv[5] || 'pt';
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: W, height: 860 }, deviceScaleFactor: 2, hasTouch: false });
const [n, v] = cookies[process.env.CONTA || 'Rico'].split('=');
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
async function resultado(nome) {
  await p.waitForSelector('.tk-res', { timeout: 30000 });
  await p.waitForTimeout(400); await shot(nome + '-fim', true);
  const txt = await p.locator('.tk-res').innerText(); console.log(nome, '→', txt.replace(/\s+/g, ' '));
  await p.locator('.tk-res .btn.ghost').click(); await p.waitForSelector('.tk-list');
}
const abre = async (id) => { const i = await p.$$eval('.tk-gig', (bs, id) => bs.findIndex((b) => b.querySelector('img') && b.querySelector('img').src.includes('/gigs/' + id)), id); await p.locator('.tk-gig').nth(i).click(); };

// 1) oficina: tirar as porcas, depois apertar em estrela até ao binário
await abre('oficina'); await p.waitForSelector('.tk-oficina');
await p.waitForTimeout(300); await shot('oficina-inicio');
for (let j = 0; j < 5; j++) { await p.locator('.tk-nut').nth(j).click(); await p.waitForTimeout(120); }
await p.waitForSelector('.tk-nut.loose', { timeout: 5000 }); await p.waitForTimeout(500); await shot('oficina-roda-nova');
const alvo = await p.$eval('.tk-oficina .tk-read small', (s) => parseInt(s.textContent.replace(/\D+/g, '')));
for (const k of [0, 2, 4, 1, 3]) {
  const [x, y] = await centro(p.locator('.tk-nut').nth(k));
  await p.mouse.move(x, y); await p.mouse.down();
  await p.waitForFunction((a) => parseInt(document.querySelector('.tk-oficina .tk-read b').textContent) >= a, alvo, { polling: 'raf', timeout: 10000 });
  if (k === 4) await shot('oficina-a-apertar');
  await p.mouse.up(); await p.waitForTimeout(600);
}
await resultado('oficina');

// 2) mudanças: lê as peças do ecrã, resolve a arrumação e põe-nas (uma a arrastar, as outras com dois toques)
await abre('mudancas'); await p.waitForSelector('.tk-mudancas');
await p.waitForTimeout(300); await shot('mudancas-inicio', true);
const pcs = await p.$$eval('.tk-tile', (ts) => ts.map((tl) => { const s = tl.querySelector('.shape').style; return { w: +s.getPropertyValue('--w'), h: +s.getPropertyValue('--h'), heavy: tl.classList.contains('heavy'), fragile: tl.classList.contains('fragile') }; }));
const GW = 3, GH = 4, g = Array(GW * GH).fill(-1), sol = pcs.map(() => null);
const fits = (x, y, w, h) => { if (x + w > GW || y + h > GH) return false; for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (g[yy * GW + xx] >= 0) return false; return true; };
const put = (x, y, w, h, val) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy * GW + xx] = val; };
const resolve = (i) => {
  if (i === pcs.length) return true;
  const q = pcs[i];
  for (const r of q.w === q.h ? [0] : [0, 1]) { const w = r ? q.h : q.w, h = r ? q.w : q.h;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if ((q.heavy && y !== 0) || (q.fragile && y + h !== GH) || !fits(x, y, w, h)) continue;
      put(x, y, w, h, i); sol[i] = [x, y, r]; if (resolve(i + 1)) return true; put(x, y, w, h, -1); sol[i] = null;
    } }
  return false;
};
if (!resolve(0)) throw new Error('sem arrumação');
for (let i = 0; i < pcs.length; i++) {
  const [x, y, r] = sol[i], tile = p.locator(`.tk-tile[data-i="${i}"]`), cell = p.locator(`.tk-van .cell[data-c="${y * GW + x}"]`);
  if (i === 0 && !r) {   // a primeira vai arrastada, com o fantasma por cima da grelha
    const [x0, y0] = await centro(tile); const cb = await cell.boundingBox(), c = cb.width, q = pcs[i];
    const tx = cb.x + (q.w * c) / 2, ty = cb.y + (q.h * c) / 2;
    await p.mouse.move(x0, y0); await p.mouse.down();
    for (let k = 1; k <= 10; k++) await p.mouse.move(x0 + ((tx - x0) * k) / 10, y0 + ((ty - y0) * k) / 10);
    await shot('mudancas-a-arrastar');
    await p.mouse.up(); await p.waitForTimeout(300); continue;
  }
  await tile.click(); await p.waitForTimeout(80);
  if (r) await p.locator('.tk-mudancas .tk-actbar .btn.sm').click();
  await cell.click(); await p.waitForTimeout(220);
  if (i === 2) await shot('mudancas-meio');
}
await shot('mudancas-cheia');
await p.locator('.tk-mudancas .tk-actbar .btn.big').click();
await resultado('mudancas');

// 3) desmanche: o melhor conjunto de peças que cabe em 80% do tempo da patrulha, e fugir
await abre('desmanche'); await p.waitForSelector('.tk-desmanche');
await p.waitForTimeout(300); await shot('desmanche-inicio', true);
const win = await p.$eval('.tk-patrol b', (b) => parseFloat(b.textContent.replace(',', '.')) * 1000);
const parts = await p.$$eval('.tk-part', (rs) => rs.map((r) => ({ need: parseFloat(r.querySelector('.tm').textContent.replace(',', '.')) * 1000, v: r.querySelectorAll('.val i.on').length })));
let best = 0, bm = 0;
for (let m = 1; m < 1 << parts.length; m++) { let tt = 0, vv = 0; parts.forEach((x, i) => { if (m & (1 << i)) { tt += x.need; vv += x.v; } }); if (tt <= win * 0.8 && vv > best) { best = vv; bm = m; } }
let first = true;
for (let i = 0; i < parts.length; i++) {
  if (!(bm & (1 << i))) continue;
  await p.locator('.tk-part').nth(i).evaluate((el) => el.scrollIntoView({ block: 'center' }));   // a barra presa em baixo pode tapar as últimas
  const [x, y] = await centro(p.locator('.tk-part').nth(i));
  await p.mouse.move(x, y); await p.mouse.down();
  await p.waitForFunction((k) => document.querySelectorAll('.tk-part')[k].classList.contains('got'), i, { polling: 'raf', timeout: 10000 });
  await p.mouse.up();
  if (first) { await shot('desmanche-a-tirar'); first = false; }
}
await p.locator('.tk-desmanche .tk-actbar .btn').click();
await resultado('desmanche');
await shot('lista-depois', true);
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros na consola');
await browser.close();
