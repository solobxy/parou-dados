// Vê no parou.pt (produção, mapa a sério) como fica desenhado um percurso: pesquisa o destino a partir de uma localização,
// abre a primeira opção e fotografa cada troço a pé de perto, com os pedidos do caminho a pé. Não altera nada no site.
// Uso: LAT=41.1488 LON=-8.5856 DESTINO="Rua da Picaria" SAIDA=res node ver-percurso-real.mjs
import { chromium } from 'playwright';
import fs from 'fs';
const BASE = process.env.BASE || 'https://parou.pt';
const SAIDA = process.env.SAIDA || 'res';
const LAT = Number(process.env.LAT || 41.1488), LON = Number(process.env.LON || -8.5856);
const DESTINO = process.env.DESTINO || 'Rua da Picaria';
fs.mkdirSync(SAIDA, { recursive: true });
const log = (...a) => console.log(a.join(' '));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5, locale: 'pt-PT', timezoneId: 'Europe/Lisbon',
  geolocation: { latitude: LAT, longitude: LON }, permissions: ['geolocation'],
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
});
await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true});
  localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_tema','claro'); }catch(e){}` });
const p = await ctx.newPage();
const respostas = [];
p.on('response', async (r) => {
  if (!r.url().includes('/api/transit/caminho-a-pe')) return;
  const j = await r.json().catch(() => null);
  respostas.push({ url: r.url().replace(BASE, ''), status: r.status(), metros: j?.metros ?? null, caminho: j?.caminho ?? null });
});
p.on('pageerror', (e) => log('PAGEERROR', String(e).slice(0, 200)));
await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
await p.waitForTimeout(6000);
const campo = p.locator('input[placeholder="Para onde vais?"]:visible').first();
await campo.click();
await campo.fill(DESTINO);
await p.waitForTimeout(2500);
await p.screenshot({ path: `${SAIDA}/1_pesquisa.png` });
const sug = p.locator('button:visible', { hasText: DESTINO.split(' ').slice(-1)[0] }).first();
await sug.click({ timeout: 8000 }).catch(async () => { await p.keyboard.press('Enter'); });
await p.waitForTimeout(8000);
await p.screenshot({ path: `${SAIDA}/2_opcoes.png` });
await p.locator('[data-teste="opcao-rota"]').first().click({ timeout: 8000 }).catch(() => log('sem opção para abrir'));
await p.waitForTimeout(5000);
await p.screenshot({ path: `${SAIDA}/3_opcao.png` });
log('pedidos do caminho a pé:', JSON.stringify(respostas.map((r) => ({ url: r.url, status: r.status, metros: r.metros }))));
fs.writeFileSync(`${SAIDA}/respostas.json`, JSON.stringify(respostas, null, 1));
const trocos = await p.evaluate(() => [...document.querySelectorAll('.leaflet-container svg path')]
  .filter((e) => /^1[ ,]+9$/.test((e.getAttribute('stroke-dasharray') || '').trim()))
  .map((e) => { const r = e.getBoundingClientRect(); return { d: (e.getAttribute('d') || '').slice(0, 400), x: r.x, y: r.y, w: r.width, h: r.height }; }));
log('troços a pé no mapa:', trocos.length, JSON.stringify(trocos.map((t) => ({ pontos: (t.d.match(/[ML]/g) || []).length, w: Math.round(t.w), h: Math.round(t.h) }))));
// De perto: um troço de cada vez (recarrega a opção para voltar ao enquadramento do percurso)
for (let i = 0; i < trocos.length; i++) {
  const t = (await p.evaluate(() => [...document.querySelectorAll('.leaflet-container svg path')]
    .filter((e) => /^1[ ,]+9$/.test((e.getAttribute('stroke-dasharray') || '').trim()))
    .map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })))[i];
  if (!t) break;
  await p.mouse.move(t.x + t.w / 2, t.y + t.h / 2);
  for (let k = 0; k < 3; k++) { await p.mouse.wheel(0, -300); await p.waitForTimeout(600); }
  await p.waitForTimeout(3500); // mosaicos do mapa
  await p.screenshot({ path: `${SAIDA}/4_troco_${i + 1}.png` });
  for (let k = 0; k < 3; k++) { await p.mouse.wheel(0, 300); await p.waitForTimeout(600); }
  await p.waitForTimeout(1500);
}
await browser.close();
