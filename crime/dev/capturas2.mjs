// Capturas dos ecrãs do passo 2 na cidade de teste (dev/cidade2.mjs), num browser simulado (Chrome sem ecrã), com toques a sério.
// Uso: node dev/capturas2.mjs <pasta da cidade> <pasta das capturas>
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const CID = process.argv[2] || '/tmp/cidade-p2', OUT = process.argv[3] || '/tmp/capturas-p2';
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const erros = [];
async function pagina(quem, w, lang, tab) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const [n, v] = cookies[quem].split('=');
  await ctx.addCookies([{ name: n, value: v, url: base }]);
  await ctx.addInitScript(([tab, lang]) => { localStorage.setItem('cr.tab', JSON.stringify(tab)); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [tab, lang]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { if (!/Unexpected token '<'/.test(e.message)) erros.push(`${quem} ${w} ${lang} ${tab}: ${e.message}`); });
  p.on('console', (m) => { if (m.type() === 'error' && !/_e\.js|404/.test(m.text())) erros.push(`${quem} ${w} ${lang} ${tab} consola: ${m.text()}`); });
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  return { p, ctx };
}
const larguraOk = async (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const foto = async (p, nome, full = true) => {
  // as imagens carregam só quando entram no ecrã (loading=lazy): percorrer a página antes da captura inteira
  if (full) { await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); }); await p.waitForTimeout(400); }
  await p.screenshot({ path: join(OUT, nome + '.png'), fullPage: full }); if (!(await larguraOk(p))) erros.push(nome + ': deslize lateral'); };
// toca num botão só se estiver ligado; se não estiver, regista uma nota (estado da conta, não erro do site)
const notas = [];
async function toca(p, loc, nome) {
  if (!(await loc.count())) { erros.push(nome + ': botão não existe'); return false; }
  await loc.first().scrollIntoViewIfNeeded();
  if (!(await loc.first().isEnabled())) { notas.push(nome + ': botão desligado (conta presa, ocupada ou sem stamina)'); return false; }
  await loc.first().click({ timeout: 5000 }); await p.waitForTimeout(1000); return true;
}
const semChaves = async (p, nome) => { const txt = await p.evaluate(() => document.body.innerText); const m = txt.match(/\b(?:lt|rf|deal|job|loot|lux|h)[A-Z_][A-Za-z_]*\b|\b(?:lt_|ra_|r_)[a-z]+\b|\{[a-z]\}/g); if (m) erros.push(nome + ': texto por traduzir ' + [...new Set(m)].join(', ')); };

for (const lang of ['pt', 'en']) for (const w of [320, 390]) {
  const sx = `${lang}-${w}`;
  // golpes: o novato
  let { p, ctx } = await pagina('Novato', w, lang, 'rob');
  await foto(p, `golpes-novato-${sx}`); await semChaves(p, 'golpes novato ' + sx);
  if (await toca(p, p.locator('button.btn.rob'), `golpes novato ${sx}`)) {
    await foto(p, `golpes-novato-roubou-${sx}`, false);
    if (!(await p.locator('.report').count())) erros.push(`golpes ${sx}: tocar em roubar não mostrou o relatório`);
  }
  await ctx.close();
  // golpes: o assaltante (rua quente, pistola, venda de droga)
  ({ p, ctx } = await pagina('Assaltante', w, lang, 'rob'));
  await foto(p, `golpes-assaltante-${sx}`); await semChaves(p, 'golpes assaltante ' + sx);
  if (await toca(p, p.locator('.vrow.deal .btn.buy'), `vender ${sx}`)) await foto(p, `golpes-vendeu-${sx}`, false);
  await ctx.close();
  // discoteca: stamina à barra
  ({ p, ctx } = await pagina('Assaltante', w, lang, 'club'));
  await foto(p, `discoteca-${sx}`); await semChaves(p, 'discoteca ' + sx);
  if (await toca(p, p.locator('.refillc .btn.buy'), `encher ${sx}`)) await foto(p, `discoteca-encheu-${sx}`, false);
  await ctx.close();
  // ginásio (energia), casa, armas e a cidade com as duas barras
  for (const [quem, tab] of [['Assaltante', 'gym'], ['Novato', 'casa'], ['Rico', 'casa'], ['Assaltante', 'arms'], ['Assaltante', 'city'], ['Rico', 'lux'], ['Rico', 'empire'], ['Rico', 'biz'], ['Assaltante', 'putas']]) {
    ({ p, ctx } = await pagina(quem, w, lang, tab));
    await foto(p, `${tab}-${quem.toLowerCase()}-${sx}`, tab !== 'city'); await semChaves(p, `${tab} ${quem} ${sx}`);
    await ctx.close();
  }
}
await browser.close();
if (notas.length) console.log('NOTAS:\n' + notas.join('\n'));
console.log(erros.length ? 'PROBLEMAS:\n' + erros.join('\n') : 'sem erros na página, sem textos por traduzir e sem deslize lateral');
