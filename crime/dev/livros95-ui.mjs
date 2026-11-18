// v95: os livros no ecrã — comprar da prateleira, ler (o efeito novo pede o segundo toque), e ler preso.
// Uso: node dev/livros95-ui.mjs <cidade> (Rico com livros guardados e nada a ler; Preso, preso, com dois livros)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CID = process.argv[2];
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const erros = [];
async function abrir(conta, tab) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, deviceScaleFactor: 2, hasTouch: true });
  const [n, v] = cookies[conta].split('=');
  await ctx.addCookies([{ name: n, value: v, url: base }]);
  await ctx.addInitScript((tab) => { localStorage.setItem('cr.tab', JSON.stringify(tab)); localStorage.setItem('cr.lang', 'pt'); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, tab);
  await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(conta + ': ' + e.message));
  await p.goto(base + '/'); await p.waitForTimeout(1200);
  return p;
}
const estado = (p) => p.evaluate(async () => (await (await fetch('/api/state')).json()).me);

// 1. Rico: a estante primeiro, a prateleira depois; compra o primeiro da prateleira e o botão passa a «Comprado hoje»
let p = await abrir('Rico', 'livros');
const prat = p.locator('.bkl').last();
assert.equal(await prat.locator('.vrow').count(), 4, '4 títulos na prateleira');
const c0 = (await estado(p)).cash;
await prat.locator('.btn').first().click(); await p.waitForTimeout(700);
let me = await estado(p);
assert.ok(c0 - me.cash > 0, 'pagou'); assert.equal(me.bk.bd.ids.length, 1);
assert.equal(await p.locator('.bkl').last().locator('.btn').count(), 3);
// o «Déjà lu» sem nada lido: diz que ainda não se leu nenhum e o botão está desligado
assert.match(await p.locator('.bkr:has-text("Déjà lu")').textContent(), /Ainda não leste nenhum/);
assert.equal(await p.locator('.bkr:has-text("Déjà lu") .btn').isDisabled(), true);
// lê o Músculo para preguiçosos: aparece o cartão «A ler» e os outros dizem «A ler outro»
await p.locator('.bkr:has-text("Músculo para preguiçosos") .btn').click(); await p.waitForTimeout(700);
me = await estado(p);
assert.equal(me.bk.rd.id, 'musculo');
assert.equal(await p.locator('.bknow').count(), 1);
assert.match(await p.locator('.bknow').textContent(), /A ler.*Músculo/);
assert.equal(await p.locator('.bkl').first().locator('.btn:not([disabled])').count(), 0, 'a ler: nada mais se lê');
assert.match(await p.locator('.bkl').first().locator('.btn').first().textContent(), /A ler outro/);
await p.close();

// 2. Preso: chega-se pela prisão; lê, mas não há prateleira
p = await abrir('Preso', 'jail');
await p.locator('.jbr:has(img[src*="livros"]) .btn').click(); await p.waitForTimeout(500);
assert.match(await p.locator("h1").first().textContent(), /Biblioteca/);
assert.equal(await p.locator(".bkl").count(), 1, "só a estante");
await p.locator('.bkr .btn').first().click(); await p.waitForTimeout(700);
assert.ok((await estado(p)).bk.rd, 'preso, lê');
await p.screenshot({ path: '/tmp/cap95/preso-livros.png', fullPage: true });
await p.locator('.back').click(); await p.waitForTimeout(400);
assert.ok(await p.locator('.jbr').count() > 0, 'volta à prisão');
await p.close();

console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'livros no ecrã: tudo certo');
await browser.close();
process.exit(erros.length ? 1 : 0);
