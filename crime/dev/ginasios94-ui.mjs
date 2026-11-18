// v94: o ginásio no ecrã — mudar de ginásio, pagar a entrada do seguinte, treinar preso no pátio.
// Uso: node dev/ginasios94-ui.mjs <cidade> (contas Rico, com o Ferro Velho e 9 800 de energia gasta, e Preso, preso)
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

// 1. Rico: «Mudar» abre a lista no escalão do próximo a abrir; paga a entrada do Krav Maga e passa a treinar lá
let p = await abrir('Rico', 'gym');
assert.match(await p.locator('.gymc b').textContent(), /Ferro Velho/);
await p.locator('.gymc .btn').click(); await p.waitForTimeout(500);
assert.equal(await p.locator('.gyseg [aria-pressed="true"]').textContent(), 'Médios', 'abre no escalão do próximo');
const c0 = (await estado(p)).cash;
await p.locator('.gyrow .btn.buy').first().click(); await p.waitForTimeout(700);
let me = await estado(p);
assert.equal(me.gym, 'krav'); assert.ok(me.gyms.includes('krav')); assert.equal(c0 - me.cash, 200000, 'entrada paga');
assert.match(await p.locator('.gyrow.on b').first().textContent(), /Krav/);
// volta ao Ferro Velho com «Treinar aqui»
await p.locator('.gyrow:has-text("Ferro Velho") .btn').click(); await p.waitForTimeout(600);
assert.equal((await estado(p)).gym, 'ferro');
// os de elite: a vermelho só o que já se pode fazer (aqui ainda nada)
await p.locator('.gyseg button:has-text("Elite")').click(); await p.waitForTimeout(300);
assert.equal(await p.locator('.gyrow .c-red').count(), 0);
assert.equal(await p.locator('.gyrow:has-text("✗")').count() + await p.locator('.gyrow:has-text("✓")').count(), 6, 'os seis dizem se as stats chegam');
// de volta ao ginásio: cada série custa 10 por repetição
await p.locator('.back').click(); await p.waitForTimeout(400);
assert.match(await p.locator('[data-gym="F5"] .gy-e').textContent(), /50/);
await p.close();

// 2. Preso: abre na prisão; pela linha «Ginásio» chega-se ao ginásio, que é o pátio, sem «Mudar»; Inteligência e Carisma sem botões
p = await abrir('Preso', 'gym');
assert.equal(await p.locator('.gymc').count(), 0, 'preso, abre-se na prisão');
await p.locator('.jbr:has(img[src*="ginasio"]) .btn').click(); await p.waitForTimeout(500);
assert.match(await p.locator('.gymc b').textContent(), /Ginásio da prisão/);
assert.equal(await p.locator('.gymc .btn').count(), 0);
assert.equal(await p.locator('[data-gym="I5"]').count(), 0);
assert.equal(await p.locator('.gyi').count(), 2, 'só Força e Tolerância');
assert.match(await p.locator('.gyoff').textContent(), /Inteligência · Carisma/);
await p.locator('[data-gym="F5"]').click(); await p.waitForTimeout(500);
assert.equal(await p.locator('.gym-on').count(), 1, 'a série começou');
await p.locator('.gy-x').click(); await p.waitForTimeout(1800);
assert.equal(await p.locator('.gymc').count(), 1, 'depois da série fica no ginásio');
await p.screenshot({ path: '/tmp/cap94/preso-gym.png', fullPage: true });
await p.locator('.back').click(); await p.waitForTimeout(400);
assert.equal(await p.locator('.jbr').count() > 0, true, 'o voltar leva à prisão');
await p.close();

console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'ginásios no ecrã: tudo certo');
await browser.close();
process.exit(erros.length ? 1 : 0);
