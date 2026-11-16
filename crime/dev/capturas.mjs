// Capturas dos ecrãs do passo 1 na cidade de teste (dev/cidade.mjs), num browser simulado (Chrome sem ecrã).
// Uso: node dev/capturas.mjs <pasta da cidade> <pasta das capturas>
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const CID = process.argv[2] || '/tmp/cidade-p1', OUT = process.argv[3] || '/tmp/capturas-p1';
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const quem = process.env.QUEM || 'Dinis_T';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const erros = [];
async function pagina(w, lang, tab) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const [n, v] = cookies[quem].split('=');
  await ctx.addCookies([{ name: n, value: v, url: base }]);
  await ctx.addInitScript(([tab, lang]) => { localStorage.setItem('cr.tab', JSON.stringify(tab)); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [tab, lang]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { if (!/Unexpected token '<'/.test(e.message)) erros.push(`${w} ${lang} ${tab}: ${e.message}`); });   // (o /_e.js das estatísticas só existe no servidor)
  p.on('console', (m) => { if (m.type() === 'error') erros.push(`${w} ${lang} ${tab} consola: ${m.text()}`); });
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  return { p, ctx };
}
const larguraOk = async (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
for (const lang of ['pt', 'en']) for (const w of [320, 390]) {
  // ranking: época na minha divisão
  let { p, ctx } = await pagina(w, lang, 'rank');
  await p.waitForSelector('.rklist');
  await p.screenshot({ path: join(OUT, `rank-epoca-${lang}-${w}.png`), fullPage: true });
  if (!(await larguraOk(p))) erros.push(`${w} ${lang} rank: deslize lateral`);
  // tocar noutra divisão (41–60) e depois no geral
  await p.locator('.rkdiv button').nth(2).click(); await p.waitForTimeout(500);
  await p.screenshot({ path: join(OUT, `rank-div3-${lang}-${w}.png`), fullPage: true });
  const pressed = await p.locator('.rkdiv button[aria-pressed="true"]').innerText();
  if (pressed !== '41–60') erros.push(`${w} ${lang}: a divisão tocada não ficou escolhida (${pressed})`);
  await p.locator('.seg:not(.rkdiv) button').nth(1).click(); await p.waitForTimeout(500);
  await p.screenshot({ path: join(OUT, `rank-geral-${lang}-${w}.png`), fullPage: true });
  if (await p.locator('.rkdiv').count()) erros.push(`${w} ${lang}: no geral não há divisões`);
  await ctx.close();
  // perfil (títulos e época)
  ({ p, ctx } = await pagina(w, lang, 'city'));
  await p.screenshot({ path: join(OUT, `cidade-${lang}-${w}.png`), fullPage: true });
  await p.locator('button.badge').click(); await p.waitForTimeout(600);
  await p.screenshot({ path: join(OUT, `perfil-${lang}-${w}.png`), fullPage: false });
  const sheet = p.locator('.ptits'); if (!(await sheet.count())) erros.push(`${w} ${lang}: perfil sem títulos`);
  await sheet.scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(300);
  await p.screenshot({ path: join(OUT, `perfil-titulos-${lang}-${w}.png`), fullPage: false });
  await ctx.close();
  // jornal
  ({ p, ctx } = await pagina(w, lang, 'news'));
  await p.screenshot({ path: join(OUT, `jornal-${lang}-${w}.png`), fullPage: false });
  await ctx.close();
}
await browser.close();
console.log(erros.length ? 'PROBLEMAS:\n' + erros.join('\n') : 'sem erros na página nem deslize lateral');
