// v101: carregar mesmo nos botões das viagens (cidade de teste local): voar com o contacto, comprar lá fora, alugar a arma,
// voltar e vender a mala que chegou. Uso: node dev/viagens101-ui.mjs <cidade> <fase: casa|fora|chegou> <conta>
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, FASE, CONTA] = process.argv.slice(2);
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, deviceScaleFactor: 1 });
const [n, v] = cookies[CONTA].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(() => { localStorage.setItem('cr.tab', JSON.stringify('viagens')); localStorage.setItem('cr.lang', 'pt'); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); });
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage(), erros = [];
p.on('pageerror', (e) => erros.push(e.message));
await p.goto(base + '/'); await p.waitForTimeout(1500);
const me = async () => (await (await p.request.get(base + '/api/state')).json()).me;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
if (FASE === 'casa') {
  await p.locator('.airr', { hasText: 'Tânger' }).click(); await p.waitForTimeout(400);
  await p.locator('.trx .seg button', { hasText: 'Contacto' }).click(); await p.waitForTimeout(300);
  const c0 = await me();
  await p.locator('.trdest .btn.buy').click(); await p.waitForTimeout(1200);
  const c1 = await me();
  ok(c1.tr && c1.tr.st === 'out' && c1.tr.to === 'ma', 'voou para Tânger');
  ok(c0.cash + c0.bank - c1.cash - c1.bank === 80 + c0.trCc || c1.tr.arm === false, 'pagou o bilhete e o contacto (' + (c0.cash + c0.bank - c1.cash - c1.bank) + ')');
  ok(await p.locator('.airfl').isVisible(), 'o ecrã mostra o voo');
  await p.locator('.tab[data-tab="rob"]').click(); await p.waitForTimeout(500);
  ok(await p.locator('.airfl').isVisible(), 'a voar, os golpes mostram a viagem');
}
if (FASE === 'fora') {
  const c0 = await me();
  await p.locator('.trgw', { hasText: 'Limoncello' }).locator('.btn.buy').click(); await p.waitForTimeout(1000);
  const c1 = await me();
  ok(Object.values(c1.tr.bag).reduce((a, b) => a + b, 0) === 25, 'encheu a mala (' + JSON.stringify(c1.tr.bag) + ')');
  await p.locator('.trgun .btn').click(); await p.waitForTimeout(800);
  ok((await me()).tr.gun === 'pistola', 'alugou a pistola');
  await p.locator('.trgo .btn').click(); await p.waitForTimeout(1000);
  const c2 = await me();
  ok(c2.tr.st === 'back', 'a voltar'); ok(c2.tr.sz === undefined, 'a alfândega não se vê antes de aterrar');
  ok(c0.cash + c0.bank - c2.cash - c2.bank === 17 * 80 + 260, 'pagou a mercadoria e a arma');
}
if (FASE === 'chegou') {
  const c0 = await me();
  await p.locator('.trland .btn.buy').click(); await p.waitForTimeout(1200);
  const c1 = await me();
  ok(!c1.trL, 'vendeu a mala'); ok(c1.bank > c0.bank && c1.cash === c0.cash, 'o legal foi para o banco e o apreendido não pagou nada');
  ok(c1.honv['trips:ma'] === 1, 'contou a viagem para as honras');
}
ok(!erros.length, 'sem erros na página ' + erros.join(' | '));
await browser.close();
