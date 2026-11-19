// v116: captura da folha da sentença (abre sozinha ao entrar no ecrã da prisão) e, com APELAR=1, o toque em «Recorrer».
// Uso: CONTA=Preso node dev/sentenca-ecra.mjs <cidade> <pasta> <largura> <língua> [nome]
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, OUT, W, LANG, NOME = 'sentenca'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: +(process.env.H || 1500) }, deviceScaleFactor: 2, reducedMotion: process.env.RM ? 'reduce' : 'no-preference' });
const [n, v] = cookies[process.env.CONTA || 'Preso'].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript((lang) => { localStorage.setItem('cr.tab', JSON.stringify('jail')); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, LANG);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage(), erros = [];
p.on('pageerror', (e) => erros.push(e.message));
await p.goto(base + '/'); await p.waitForTimeout(2200);
const aberta = await p.locator('.sheet .srp').count();
if (!aberta) erros.push('a folha não abriu sozinha');
const lado = await p.evaluate(() => { const s = document.querySelector('.sheet'); return s ? s.scrollWidth - s.clientWidth : 0; });
if (lado > 0) erros.push('a folha sai ' + lado + ' px para o lado');
await p.locator('.sheet').screenshot({ path: join(OUT, `${NOME}-${LANG}-${W}.png`) });
if (process.env.APELAR) {
  const b = p.locator('.sheet .srbt .btn').first();
  console.log('botão:', await b.innerText());
  await b.click(); await p.waitForTimeout(1600);
  const t = await p.evaluate(() => [document.querySelector('.toasts')?.innerText || '', document.querySelector('.sheet .sra')?.innerText || '']);
  console.log('depois:', JSON.stringify(t));
  await p.locator('.sheet').screenshot({ path: join(OUT, `${NOME}-apelo-${LANG}-${W}.png`) });
}
// fechar e ver o aviso do ecrã da prisão com a ligação
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await p.screenshot({ path: join(OUT, `${NOME}-ecra-${LANG}-${W}.png`) });
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros');
await browser.close();
