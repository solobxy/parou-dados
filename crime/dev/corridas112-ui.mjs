// v112: capturas das corridas a tocar nos botões: o ecrã, uma corrida de rua (a repetição a meio e no fim) e a sala a dinheiro.
// Uso: CONTA=Rico node dev/corridas112-ui.mjs <cidade> <pasta> <largura> <língua>
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, OUT, W, LANG] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: +W, height: 780 }, deviceScaleFactor: 2 });
const quem = process.env.CONTA || 'Rico', [n, v] = cookies[quem].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([l]) => { if (!sessionStorage.getItem('t0')) { sessionStorage.setItem('t0', '1'); localStorage.setItem('cr.tab', JSON.stringify('corridas')); } localStorage.setItem('cr.lang', l); localStorage.setItem('cr.chatSeen', '1'); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base + '/'); await p.waitForTimeout(1500);
const nome = (s) => join(OUT, `${s}-${quem}-${LANG}-${W}.png`);
await p.screenshot({ path: nome('ecra'), fullPage: true });
const go = await p.$('.rcstreet .btn.rob');
if (go && !(await go.isDisabled())) {
  await go.click(); await p.waitForTimeout(3500); await p.screenshot({ path: nome('repeticao-meio') });
  await p.waitForTimeout(8000); await p.screenshot({ path: nome('repeticao-fim') });
  const tab = await p.$('.rptab:not([hidden])'); console.log('repetição:', tab ? 'tabela no fim' : 'SEM tabela');
} else console.log('corrida de rua: botão desligado');
console.log(errs.length ? 'ERROS: ' + errs.join(' | ') : 'sem erros');
await b.close();
