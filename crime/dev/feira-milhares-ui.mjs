// O campo de euros da Feira da Ladra separa os milhares enquanto se escreve («15 000» em PT, «15,000» em EN) e o cursor fica
// no sítio certo ao apagar no meio. Uso: node dev/feira-milhares-ui.mjs <cidade> <língua>
//   (antes: node dev/feira-cidade.mjs <dados>, com o servidor parado; depois arrancar o servidor da cidade)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, LANG] = process.argv.slice(2);
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
const [n, v] = cookies.Rico.split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([lang]) => { localStorage.setItem('cr.tab', JSON.stringify('feira')); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage(), erros = [];
p.on('pageerror', (e) => erros.push(e.message));
await p.goto(base + '/'); await p.waitForSelector('.vrow.fr'); await p.waitForTimeout(800);
await p.locator('.cnow .btn.ghost').first().tap(); await p.waitForSelector('.sheet #fpr');
const f = p.locator('.sheet #fpr');
await f.focus(); await p.keyboard.type('15000');
const norm = (s) => s.replace(/[\u00a0\u202f ,]/g, '_');   // o separador (espaço em PT, vírgula em EN) vira «_»
const v1 = await f.inputValue();
// apagar o «5» (cursor logo a seguir ao 5, posição 2) e escrever um 2: «12 000», com o cursor outra vez depois do 2
await f.evaluate((el) => el.setSelectionRange(2, 2)); await p.keyboard.press('Backspace'); await p.keyboard.type('2');
const v2 = await f.inputValue(), pos = await f.evaluate((el) => el.selectionStart);
const ok = norm(v1) === '15_000' && norm(v2) === '12_000' && pos === 2 && !erros.length;
console.log(JSON.stringify({ v1, v2, pos, erros }), ok ? 'OK' : 'FALHOU');
await browser.close();
process.exit(ok ? 0 : 1);
