// Procura o que sai para o lado num ecrã (cidade de teste local). Uso: node dev/largo.mjs <conta> <largura> <língua>  (abre as Viagens)
import { createRequire } from 'node:module'; import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url); const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { base, cookies } = JSON.parse(readFileSync('/tmp/cidade-p6b/contas.json', 'utf8'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: +process.argv[3], height: 860 } });
const [n, v] = cookies[process.argv[2]].split('='); await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript((l) => { localStorage.setItem('cr.tab', JSON.stringify('viagens')); localStorage.setItem('cr.lang', l); }, process.argv[4]);
const p = await ctx.newPage(); await p.goto(base + '/'); await p.waitForTimeout(1500);
console.log(await p.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5).slice(0, 8).map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right) + ' ' + (e.textContent || '').slice(0, 40)).join('\n')));
await b.close();
