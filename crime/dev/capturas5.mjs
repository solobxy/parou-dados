// Capturas dos ecrãs do passo 5 (golpes grandes, avença, lavagem e prisão) na cidade de teste (dev/cidade2.mjs), num browser simulado
// (Chrome sem ecrã), com toques a sério. Uso: node dev/capturas5.mjs <pasta da cidade> <pasta das capturas>
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
const semChaves = async (p, nome) => { const txt = await p.evaluate(() => document.body.innerText); const m = txt.match(/\b(?:lt|rf|deal|job|loot|lux|h|op|opsRow|st|stfx|ro|to|tj|jd|jb|av|lav|lw)[A-Z_][A-Za-z_]*\b|\b(?:lt_|ra_|r_|g_|it_|sl_|fx|op_|st_|stfx_|ro_|to_|tj_|j_|jd_|lw_)[a-z]+\b|\{[a-z]\}/g); if (m) erros.push(nome + ': texto por traduzir ' + [...new Set(m)].join(', ')); };


for (const lang of ['pt', 'en']) for (const w of [320, 390]) {   // a última volta é en-390: só aí se mexe nas contas
  const sx = `${lang}-${w}`, last = sx === 'en-390';
  let p, ctx;
  // golpes: a entrada dos golpes grandes (bloqueada no novato, aberta no assaltante, pronta no planeador)
  for (const quem of ['Novato', 'Assaltante', 'Planeador']) {
    ({ p, ctx } = await pagina(quem, w, lang, 'rob'));
    const row = p.locator('h2.sec', { hasText: /Golpes grandes|Big jobs/ });
    if (!(await row.count())) erros.push(`golpes ${quem} ${sx}: falta a entrada dos golpes grandes`);
    else { await row.first().evaluate((el) => el.scrollIntoView({ block: 'start' })); await p.waitForTimeout(500); await p.screenshot({ path: join(OUT, `golpes-entrada-${quem.toLowerCase()}-${sx}.png`) }); }
    await ctx.close();
  }
  // golpes grandes: escolher (assaltante, nível 30), preparar (rico), pronto mas a faltar material (planeador)
  ({ p, ctx } = await pagina('Assaltante', w, lang, 'ops'));
  await foto(p, `ops-assaltante-${sx}`); await semChaves(p, 'ops assaltante ' + sx);
  if (last && (await toca(p, p.locator('.jobp .btn.rob'), `preparar ${sx}`))) {
    await foto(p, `ops-preparar-${sx}`); if (!(await p.locator('.vlist.opl').count())) erros.push(`preparar ${sx}: não apareceram os passos`);
    if (await toca(p, p.locator('.vlist.opl .btn.ghost').first(), `reconhecimento ${sx}`)) await foto(p, `ops-passo-${sx}`, false);
  }
  await ctx.close();
  ({ p, ctx } = await pagina('Rico', w, lang, 'ops'));
  await foto(p, `ops-rico-${sx}`); await semChaves(p, 'ops rico ' + sx);
  await ctx.close();
  ({ p, ctx } = await pagina('Planeador', w, lang, 'ops'));
  await foto(p, `ops-planeador-${sx}`); await semChaves(p, 'ops planeador ' + sx);
  if (last) {
    await toca(p, p.locator('.vlist.opl .btn.ghost').filter({ hasText: /20/ }), `comprar pé-de-cabra ${sx}`);
    await toca(p, p.locator('.vlist.opl .btn.ghost').filter({ hasText: /25/ }), `comprar balas ${sx}`);
    await foto(p, `ops-comprou-${sx}`);
    if (await toca(p, p.locator('.jobp .btn.rob'), `avançar ${sx}`)) { await foto(p, `ops-avancou-${sx}`); if (!(await p.locator('.report').count())) erros.push(`avançar ${sx}: sem relatório`); }
  }
  await ctx.close();
  // prisão: o preso, com as coisas para fazer lá dentro
  ({ p, ctx } = await pagina('Preso', w, lang, 'jail'));
  await foto(p, `prisao-${sx}`); await semChaves(p, 'prisão ' + sx);
  if (last) {
    for (const [i, nome] of [[0, 'contrabando'], [1, 'oficina'], [2, 'pátio']]) await toca(p, p.locator('.jaill .vrow').nth(i).locator('.btn'), `${nome} ${sx}`);
    await toca(p, p.locator('.jaill .vrow').nth(3).locator('.btn').first(), `cartas ${sx}`);
    await toca(p, p.locator('.jaill .vrow').nth(4).locator('.btn').nth(1), `favor ${sx}`);
    await foto(p, `prisao-fez-${sx}`);
  }
  await ctx.close();
  ({ p, ctx } = await pagina('Preso', w, lang, 'rob'));
  await foto(p, `prisao-golpes-${sx}`, false);
  await ctx.close();
  ({ p, ctx } = await pagina('Planeador', w, lang, 'inv'));
  await foto(p, `inv-material-${sx}`); await semChaves(p, 'inventário material ' + sx);
  await ctx.close();
}
await browser.close();
if (notas.length) console.log('NOTAS:\n' + notas.join('\n'));
console.log(erros.length ? 'PROBLEMAS:\n' + erros.join('\n') : 'sem erros na página, sem textos por traduzir e sem deslize lateral');
