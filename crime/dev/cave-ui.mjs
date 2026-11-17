// A cave num browser simulado, com toques a sério: os 4 separadores das receitas (página inteira), fazer 3 chapas (na hora),
// pôr um pé-de-cabra na bancada e ver a bancada a correr. Diz se a página sai para o lado.
// Uso: node dev/cave-ui.mjs <cidade> <pasta> <largura> <língua>   (antes: node dev/cave-cidade.mjs <dados> livre, com o servidor parado)
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, OUT, W, LANG] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const [n, v] = cookies[process.env.CONTA || 'Rico'].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([lang]) => { localStorage.setItem('cr.tab', JSON.stringify('cave')); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage(); const erros = [], largo = {};
p.on('pageerror', (e) => erros.push(e.message));
await p.goto(base + '/'); await p.waitForSelector('.cvl'); await p.waitForTimeout(800);
await p.addStyleTag({ content: '.tabs{display:none!important}' });   // página inteira: a barra de baixo ficava a meio
const shot = async (nome) => {
  largo[nome] = await p.evaluate((w) => Math.max(document.documentElement.scrollWidth, innerWidth) - w, +W);
  // texto de uma receita que passa por cima do botão (ou sai da linha)
  const sob = await p.evaluate(() => [...document.querySelectorAll('.cvr')].flatMap((row) => {
    const a = row.querySelector('.cva')?.getBoundingClientRect(), R = row.getBoundingClientRect();
    return [...row.querySelectorAll('.cvh *, .cvd span')].map((el) => el.getBoundingClientRect()).filter((r) => r.width && (r.right > R.right + 1 || (a && r.right > a.left + 1 && r.bottom > a.top + 1 && r.top < a.bottom - 1))).map(() => row.querySelector('b').textContent);
  }));
  if (sob.length) largo[nome + ':sobreposto'] = [...new Set(sob)].join(', ');
  await p.evaluate(() => { document.querySelector('.toasts')?.replaceChildren(); document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; }); });
  await p.waitForTimeout(500); await p.screenshot({ path: join(OUT, `cave-${nome}-${LANG}-${W}.png`), fullPage: true });
};
const toca = async (loc) => { await loc.scrollIntoViewIfNeeded(); await p.waitForTimeout(150); await loc.tap(); await p.waitForTimeout(350); };
const sep = (k) => toca(p.locator('.cvseg button').nth(k));
const dep = async (k) => +(await p.locator('.cvm').nth(k).locator('.cvn').innerText());
await shot('comp');
for (const [k, nome] of [[1, 'tool'], [2, 'gun'], [3, 'maq']]) { await sep(k); await shot(nome); }
// 3 chapas de uma vez: entram logo no depósito (a chapa é o 7.º do depósito: 6 materiais e depois os componentes)
await sep(0);
if (await p.locator('.cvr').first().locator('.btn').isDisabled()) {   // depósito vazio: só as capturas
  console.log(JSON.stringify({ largo, vazio: true })); console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros'); await browser.close(); process.exit(0);
}
await toca(p.locator('.cvqty .seg button').nth(2)); await shot('comp5');
await toca(p.locator('.cvqty .seg button').nth(1));
const chapa0 = await dep(6), sucata0 = await dep(3);
await toca(p.locator('.cvr').first().locator('.btn'));
const feito = await p.locator('.toast').first().innerText().catch(() => '');
const chapa1 = await dep(6), sucata1 = await dep(3);
await shot('feito');
// um maçarico na bancada
await sep(1); await toca(p.locator('.cvr').first().locator('.btn'));
await p.waitForSelector('.cvnow', { timeout: 5000 });
const bancada = await p.locator('.toast').first().innerText().catch(() => '');
await p.evaluate(() => scrollTo(0, 0)); await shot('bancada');
console.log(JSON.stringify({ largo, feito, chapa: [chapa0, chapa1], sucata: [sucata0, sucata1], bancada, bloco: (await p.locator('.cvnow').innerText()).replace(/\s+/g, ' ') }));
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros');
await browser.close();
