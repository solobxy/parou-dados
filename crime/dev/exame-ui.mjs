// O exame do curso de ponta a ponta num browser simulado: abre o exame, responde (uma errada de propósito) e entrega.
// Capturas: antes, com o exame aberto e as escolhas feitas, e depois do chumbo. Uso: node dev/exame-ui.mjs <cidade> <pasta> <largura> <língua>
// (a conta CONTA tem de estar num curso com o exame aberto; ver dev/exame-cidade.mjs)
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, OUT, W, LANG] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: 860 }, deviceScaleFactor: 2 });
const [n, v] = cookies[process.env.CONTA || 'Assaltante'].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([lang]) => { localStorage.setItem('cr.tab', JSON.stringify('job')); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage(); const erros = [];
p.on('pageerror', (e) => erros.push(e.message));
await p.goto(base + '/'); await p.waitForTimeout(1500);
const shot = async (nome) => { await p.addStyleTag({ content: '.tabs{display:none!important}' }); await p.screenshot({ path: join(OUT, `exame-${nome}-${LANG}-${W}.png`), fullPage: true }); };
await shot('1antes');
await p.locator('.exam .btn.buy').first().click(); await p.waitForTimeout(800);
const qs = p.locator('.exq'); const nq = await qs.count();
for (let k = 0; k < nq; k++) await qs.nth(k).locator('.exo').nth(k === 1 ? 3 : 0).click();   // escolhas quaisquer
await p.waitForTimeout(300); await shot('2aberto');
await p.locator('.exam .btn.buy').first().click(); await p.waitForTimeout(1200);
await shot('3depois');
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros', nq, 'perguntas');
await browser.close();
