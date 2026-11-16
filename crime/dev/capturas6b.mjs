// Capturas dos ecrãs do passo 6, parte 2 (regiões, armazéns, mercado, transporte; o porto e o jornal com as regiões) na cidade de
// teste (dev/cidade2.mjs), num browser simulado (Chrome sem ecrã), com toques a sério. Uso: node dev/capturas6b.mjs <cidade> <capturas>
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const CID = process.argv[2] || '/tmp/cidade-p6b', OUT = process.argv[3] || '/tmp/cap-p6b';
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const erros = [], notas = [];
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
  if (full) { await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); }); await p.waitForTimeout(400); }
  if (full) await p.evaluate(() => { const b = document.querySelector('.tabs'); if (b) b.style.visibility = 'hidden'; });
  await p.screenshot({ path: join(OUT, nome + '.png'), fullPage: full });
  if (full) await p.evaluate(() => { const b = document.querySelector('.tabs'); if (b) b.style.visibility = ''; });
  if (!(await larguraOk(p))) erros.push(nome + ': deslize lateral');
};
async function toca(p, loc, nome) {
  if (!(await loc.count())) { erros.push(nome + ': botão não existe'); return false; }
  await loc.first().scrollIntoViewIfNeeded();
  if (!(await loc.first().isEnabled())) { notas.push(nome + ': botão desligado'); return false; }
  await loc.first().click({ timeout: 5000 }); await p.waitForTimeout(1000); return true;
}
const semChaves = async (p, nome) => { const txt = await p.evaluate(() => document.body.innerText); const m = txt.match(/\b(?:rg|wh|mk|ts|fam|ev|port|ct|lx|ed|ar|tMk|tWh)[A-Z_][A-Za-z_]*\b|\b(?:rg_|rgd_|ev_|fam_|whUp_)[a-z]+\b|\{[a-z]\}|undefined|NaN|null/g); if (m) erros.push(nome + ': texto por traduzir ' + [...new Set(m)].join(', ')); };

for (const lang of ['pt', 'en']) for (const w of [320, 390]) {
  const sx = `${lang}-${w}`, last = sx === 'pt-390';
  let p, ctx;
  // as regiões (Rico: três armazéns, carga a caminho, uma apreensão e uma rusga)
  ({ p, ctx } = await pagina('Rico', w, lang, 'stash'));
  await foto(p, `regioes-${sx}`); await semChaves(p, 'regiões ' + sx);
  if (await toca(p, p.locator('.rgrow').nth(1), `alentejo ${sx}`)) {
    await foto(p, `alentejo-${sx}`); await semChaves(p, 'alentejo ' + sx);
    // a coca guardada no Alentejo: a folha abre em vender; depois mudar para Lisboa
    if (await toca(p, p.locator('.vrow.tap').filter({ hasText: /Coca|Coke|Cocaine/i }).first(), `coca ${sx}`)) {
      await foto(p, `folha-vender-${sx}`, false); await semChaves(p, 'folha vender ' + sx);
      if (await toca(p, p.locator('.sheet .seg button').nth(2), `mudar ${sx}`)) {
        await p.fill('#tsamt', '500'); await p.waitForTimeout(300);
        await foto(p, `folha-mudar-${sx}`, false); await semChaves(p, 'folha mudar ' + sx);
        if (last) { await toca(p, p.locator('.sheet .btn.block.big'), `mandar ${sx}`); await foto(p, `mandou-${sx}`, false); }
      }
    }
  }
  await ctx.close();
  // o Algarve com o festival, e comprar haxixe lá
  ({ p, ctx } = await pagina('Rico', w, lang, 'stash'));
  if (await toca(p, p.locator('.rgrow').nth(2), `algarve ${sx}`)) {
    await foto(p, `algarve-${sx}`); await semChaves(p, 'algarve ' + sx);
    if (await toca(p, p.locator('.mkrow').filter({ hasText: /Haxixe|Hash/i }).first(), `haxixe ${sx}`)) {
      if (await toca(p, p.locator('.sheet .seg button').nth(0), `comprar ${sx}`)) {
        await p.fill('#tsamt', '2000'); await p.waitForTimeout(300); await foto(p, `folha-comprar-${sx}`, false); await semChaves(p, 'folha comprar ' + sx);
        if (last) { await toca(p, p.locator('.sheet .btn.block.big'), `comprou ${sx}`); await foto(p, `comprou-${sx}`, false); }
      }
    }
  }
  await ctx.close();
  // sem armazém: o Planeador (nível 40) e o Novato (nível 1)
  ({ p, ctx } = await pagina('Planeador', w, lang, 'stash'));
  await foto(p, `regioes-sem-${sx}`);
  if (await toca(p, p.locator('.rgrow').nth(2), `algarve sem ${sx}`)) { await foto(p, `algarve-sem-${sx}`); await semChaves(p, 'algarve sem ' + sx); if (last) { await toca(p, p.locator('.btn.buy.block.big'), `comprar armazém ${sx}`); await foto(p, `armazem-comprado-${sx}`, false); } }
  await ctx.close();
  ({ p, ctx } = await pagina('Novato', w, lang, 'stash'));
  await foto(p, `regioes-novato-${sx}`); await semChaves(p, 'novato ' + sx);
  await ctx.close();
  // o porto: a folha da lancha (descarrega no Algarve; os quatro números lado a lado)
  ({ p, ctx } = await pagina('Planeador', w, lang, 'port'));
  if (await toca(p, p.locator('.rowi').nth(1), `lancha ${sx}`)) {
    await toca(p, p.locator('.sheet .seg button').nth(1), `em droga ${sx}`);
    await foto(p, `porto-lancha-${sx}`, false); await semChaves(p, 'porto ' + sx);
  }
  await ctx.close();
  // o jornal: País com as regiões e a primeira página com o boletim
  for (const [pg, nome] of [['front', 'frente'], ['country', 'pais']]) {
    ({ p, ctx } = await pagina('Rico', w, lang, 'news'));
    await toca(p, p.locator('.ppg button').nth(['front', 'country', 'street', 'econ', 'live'].indexOf(pg)), `jornal ${nome} ${sx}`);
    await foto(p, `jornal-${nome}-${sx}`); await semChaves(p, `jornal ${nome} ${sx}`);
    await ctx.close();
  }
}
await browser.close();
if (notas.length) console.log('NOTAS:\n' + notas.join('\n'));
console.log(erros.length ? 'PROBLEMAS:\n' + erros.join('\n') : 'sem erros na página, sem textos por traduzir e sem deslize lateral');
