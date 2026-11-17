// Capturas do separador dos golpes de rua (v72: bicicleta, multibanco e farmácia na lista, por nível).
// Uso: node dev/golpes-ui.mjs [cidade] [pasta] [largura] [língua]   (com o servidor da cidade de teste a correr)
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CID = process.argv[2] || '/tmp/cidade-p6b', OUT = process.argv[3] || '/tmp/cap-golpes', W = +(process.argv[4] || 390), LANG = process.argv[5] || 'pt';
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const erros = [];
for (const conta of ['Novato', 'Rico']) {
  const ctx = await browser.newContext({ viewport: { width: W, height: 860 }, deviceScaleFactor: 2 });
  const [n, v] = cookies[conta].split('=');
  await ctx.addCookies([{ name: n, value: v, url: base }]);
  await ctx.addInitScript(([lang]) => { localStorage.setItem('cr.tab', JSON.stringify('rob')); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); localStorage.removeItem('cr.robK'); }, [LANG]);
  await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(conta + ': ' + e.message));
  await p.goto(base + '/'); await p.waitForTimeout(1800);
  const nomes = await p.$$eval('.rows .rowi .nm', (xs) => xs.map((x) => x.textContent));
  console.log(conta, '→', nomes.join(' | '));
  await p.screenshot({ path: join(OUT, `golpes-${conta}-${LANG}-${W}.png`), fullPage: true });
  // escolhe o golpe novo mais alto que estiver aberto e mostra o cartão dele
  const alvo = conta === 'Rico' ? 2 : 1;
  const rows = p.locator('.rows button.rowi');
  for (let i = 0; i < await rows.count(); i++) { const t = await rows.nth(i).innerText(); if (/Farm|Pharm|bicicl|bikes/i.test(t) && (alvo === 2 ? /Farm|Pharm/i.test(t) : true)) { await rows.nth(i).click(); break; } }
  await p.waitForTimeout(700);
  await p.screenshot({ path: join(OUT, `golpe-novo-${conta}-${LANG}-${W}.png`) });
  await ctx.close();
}
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros na consola');
await browser.close();
