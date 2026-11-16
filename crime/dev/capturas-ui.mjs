// Capturas de muitos ecrãs de uma vez (para rever a interface toda), na cidade de teste (dev/cidade2.mjs), num browser simulado.
// Uso: node dev/capturas-ui.mjs <cidade> <capturas> [larguras, ex.: 390,320] [línguas, ex.: pt]
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const CID = process.argv[2] || '/tmp/cidade-p6b', OUT = process.argv[3] || '/tmp/cap-ui';
const LARG = (process.argv[4] || '390').split(',').map(Number), LANGS = (process.argv[5] || 'pt').split(',');
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const erros = [];
// [conta, separador, nome]
const ECRAS = [
  ['Rico', 'city', 'cidade'], ['Rico', 'empire', 'imperio'], ['Assaltante', 'rob', 'golpes'], ['Rico', 'putas', 'putas'], ['Rico', 'club', 'discoteca'],
  ['Rico', 'casino', 'casino'], ['Rico', 'inv', 'inventario'], ['Rico', 'bank', 'banco'], ['Rico', 'job', 'emprego'], ['Rico', 'arms', 'armas'],
  ['Rico', 'fights', 'lutas'], ['Rico', 'gang', 'gangue'], ['Rico', 'stash', 'armazens'], ['Rico', 'bolsa', 'bolsa'], ['Rico', 'news', 'jornal'],
  ['Planeador', 'ops', 'operacoes'], ['Preso', 'jail', 'prisao'], ['Rico', 'port', 'porto'], ['Rico', 'casa', 'casa'], ['Novato', 'city', 'novato'],
];
const so = process.env.SO ? process.env.SO.split(',') : null;
for (const lang of LANGS) for (const w of LARG) for (const [quem, tab, nome] of ECRAS) {
  if (so && !so.includes(nome)) continue;
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const [n, v] = cookies[quem].split('=');
  await ctx.addCookies([{ name: n, value: v, url: base }]);
  await ctx.addInitScript(([tab, lang]) => { localStorage.setItem('cr.tab', JSON.stringify(tab)); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [tab, lang]);
  await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));   // estatísticas: só existem no servidor verdadeiro
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(`${nome} ${w} ${lang}: ${e.message}`));
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(OUT, `${nome}-${lang}-${w}.png`), fullPage: false });   // o que se vê ao abrir (o primeiro ecrã)
  await p.evaluate(() => { const b = document.querySelector('.tabs'); if (b) b.style.visibility = 'hidden'; });
  await p.screenshot({ path: join(OUT, `${nome}-${lang}-${w}-tudo.png`), fullPage: true });
  if (!(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))) erros.push(`${nome} ${w} ${lang}: deslize lateral`);
  await ctx.close();
}
await browser.close();
console.log(erros.length ? 'PROBLEMAS:\n' + erros.join('\n') : 'feito');
