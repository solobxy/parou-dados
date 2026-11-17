// Capturas da loja de equipamento, separador da defesa (v73: 16 peças novas com fotografia).
// Uso: node dev/armas-ui.mjs [cidade] [pasta] [largura] [língua]   (com o servidor da cidade de teste a correr)
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CID = process.argv[2] || '/tmp/cidade-p6b', OUT = process.argv[3] || '/tmp/cap-armas', W = +(process.argv[4] || 390), LANG = process.argv[5] || 'pt';
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: W, height: 860 }, deviceScaleFactor: 2 });
const [n, v] = cookies[process.env.CONTA || 'Novato'].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([lang]) => { localStorage.setItem('cr.tab', JSON.stringify('arms')); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
await p.goto(base + '/'); await p.waitForTimeout(1500);
await p.locator('.armseg button').nth(1).click(); await p.waitForTimeout(800);
const partidas = await p.$$eval('img', (xs) => xs.filter((x) => x.complete && x.naturalWidth === 0).map((x) => x.src));
console.log('imagens partidas:', partidas.length ? partidas.join(' ') : 'nenhuma');
await p.screenshot({ path: join(OUT, `armas-def-${LANG}-${W}.png`), fullPage: true });
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros na consola');
await browser.close();
