// Capturas dos ecrãs do passo 6 (jornal com o País e a mesa da bolsa, bolsa com empresas, risco na rua) na cidade de teste
// (dev/cidade2.mjs), num browser simulado (Chrome sem ecrã), com toques a sério. Uso: node dev/capturas6.mjs <pasta da cidade> <pasta das capturas>
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
  // na captura inteira a barra de baixo (fixa) ficava por cima do meio da página: esconde-se só para a fotografia
  if (full) await p.evaluate(() => { const b = document.querySelector('.tabs'); if (b) b.style.visibility = 'hidden'; });
  await p.screenshot({ path: join(OUT, nome + '.png'), fullPage: full });
  if (full) await p.evaluate(() => { const b = document.querySelector('.tabs'); if (b) b.style.visibility = ''; }); if (!(await larguraOk(p))) erros.push(nome + ': deslize lateral'); };
// toca num botão só se estiver ligado; se não estiver, regista uma nota (estado da conta, não erro do site)
const notas = [];
async function toca(p, loc, nome) {
  if (!(await loc.count())) { erros.push(nome + ': botão não existe'); return false; }
  await loc.first().scrollIntoViewIfNeeded();
  if (!(await loc.first().isEnabled())) { notas.push(nome + ': botão desligado (conta presa, ocupada ou sem stamina)'); return false; }
  await loc.first().click({ timeout: 5000 }); await p.waitForTimeout(1000); return true;
}
const semChaves = async (p, nome) => { const txt = await p.evaluate(() => document.body.innerText); const m = txt.match(/\b(?:lt|rf|deal|job|loot|lux|h|op|opsRow|st|stfx|ro|to|tj|jd|jb|av|lav|lw|lx|ed|ar|sto|stoOk|stoBad)[A-Z_][A-Za-z_]*\b|\b(?:lt_|ra_|r_|g_|it_|sl_|fx|op_|st_|stfx_|ro_|to_|tj_|j_|jd_|lw_|ar_|sto_|stoOk_|stoBad_)[a-z]+\b|\{[a-z]\}/g); if (m) erros.push(nome + ': texto por traduzir ' + [...new Set(m)].join(', ')); };



const pagina2 = async (quem, w, lang, tab, extra) => { const r = await pagina(quem, w, lang, tab); if (extra) { await r.p.evaluate(extra); await r.p.waitForTimeout(700); } return r; };
for (const lang of ['pt', 'en']) for (const w of [320, 390]) {
  const sx = `${lang}-${w}`, last = sx === 'en-390';
  let p, ctx;
  // jornal: primeira página, País e Economia
  for (const [pg, nome] of [['front', 'frente'], ['country', 'pais'], ['econ', 'economia']]) {
    ({ p, ctx } = await pagina('Rico', w, lang, 'news'));
    const b = p.locator('.ppg button').nth(['front', 'country', 'street', 'econ', 'live'].indexOf(pg));
    await toca(p, b, `jornal ${nome} ${sx}`);
    await foto(p, `jornal-${nome}-${sx}`); await semChaves(p, `jornal ${nome} ${sx}`);
    await ctx.close();
  }
  // bolsa: a lista e a Farma (com notícia pendente, rumores, investigação e dividendo)
  ({ p, ctx } = await pagina('Rico', w, lang, 'bolsa'));
  await foto(p, `bolsa-${sx}`); await semChaves(p, 'bolsa ' + sx);
  if (await toca(p, p.locator('.strow').nth(1), `farma ${sx}`)) {
    await foto(p, `bolsa-farma-${sx}`); await semChaves(p, 'bolsa farma ' + sx);
    if (!(await p.locator('.sts').count())) erros.push(`bolsa ${sx}: falta a notícia da empresa`);
    if (last) { await p.fill('#bamt', '20000'); await p.waitForTimeout(300); await foto(p, `bolsa-compra-${sx}`, false); await toca(p, p.locator('.btn.block.big.buy'), `comprar ${sx}`); await foto(p, `bolsa-comprou-${sx}`, false); }
  }
  await ctx.close();
  // golpes: a frase do risco com a pressão de Lisboa
  ({ p, ctx } = await pagina('Assaltante', w, lang, 'rob'));
  await foto(p, `golpes-risco-${sx}`, false);
  const txt = await p.evaluate(() => document.querySelector('.jrisk')?.textContent || '');
  if (!/Lisboa|Lisbon/.test(txt)) erros.push(`golpes ${sx}: a frase do risco não fala da pressão`);
  await ctx.close();
}
await browser.close();
if (notas.length) console.log('NOTAS:\n' + notas.join('\n'));
console.log(erros.length ? 'PROBLEMAS:\n' + erros.join('\n') : 'sem erros na página, sem textos por traduzir e sem deslize lateral');
