// v111: capturas das empresas a tocar nos botões: o dono contrata quem pediu; quem lá trabalha começa um turno no Emprego.
// Uso: node dev/empresas111-ui.mjs <cidade> <pasta> <largura> <língua> <dono> <empregado>
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, OUT, W, LANG, DONO, EMP] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errs = [];
async function abre(quem, tab) {
  const ctx = await b.newContext({ viewport: { width: +W, height: 780 }, deviceScaleFactor: 2 });
  const [n, v] = cookies[quem].split('=');
  await ctx.addCookies([{ name: n, value: v, url: base }]);
  await ctx.addInitScript(([l, t]) => { if (!sessionStorage.getItem('t0')) { sessionStorage.setItem('t0', '1'); localStorage.setItem('cr.tab', JSON.stringify(t)); } localStorage.setItem('cr.lang', l); localStorage.setItem('cr.chatSeen', '1'); }, [LANG, tab]);
  await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(quem + ': ' + e.message));
  await p.goto(base + '/'); await p.waitForTimeout(1500);
  return p;
}
const nome = (s) => join(OUT, `${s}-${LANG}-${W}.png`);
// o dono contrata o primeiro pedido
let p = await abre(DONO, 'empresas');
const hire = await p.$('.btn.buy.sm:has-text("' + (LANG === 'pt' ? 'Contratar' : 'Hire') + '")');
if (hire) { await hire.scrollIntoViewIfNeeded(); await hire.click(); await p.waitForTimeout(1200); console.log('contratar:', (await p.$('.btn.buy.sm:has-text("' + (LANG === 'pt' ? 'Contratar' : 'Hire') + '")')) ? 'o pedido continua lá' : 'pedido aceite'); }
await p.screenshot({ path: nome('dono-depois'), fullPage: true });
// quem lá trabalha começa um turno no Emprego
p = await abre(EMP, 'job');
const go = await p.$('.jbc .btn.rob');
if (go && !(await go.isDisabled())) { await go.click(); await p.waitForTimeout(1500); console.log('turno:', (await p.$('.tk-wrap')) ? 'tarefa aberta' : 'SEM tarefa'); }
else console.log('turno: botão desligado');
await p.screenshot({ path: nome('turno') });
console.log(errs.length ? 'ERROS: ' + errs.join(' | ') : 'sem erros');
await b.close();
