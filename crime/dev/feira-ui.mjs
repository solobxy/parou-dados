// A Feira da Ladra num browser simulado, com toques a sério: levantar, ver um artigo e comprar 2, licitar num leilão,
// pôr à venda (preço fixo) e ver «os meus». Capturas de cada passo e se a página sai para o lado. Revisão da v84: voltar a
// pôr à venda o que não se vendeu, a banda de preços (fora dela fica a vermelho e o botão desliga), trocar fixo/leilão limpa o preço.
// Uso: node dev/feira-ui.mjs <cidade> <pasta> <largura> <língua>   (antes: node dev/feira-cidade.mjs <dados>, com o servidor parado)
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, OUT, W, LANG] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const [n, v] = cookies[process.env.CONTA || 'Rico'].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([lang]) => { localStorage.setItem('cr.tab', JSON.stringify('feira')); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage(); const erros = [], largo = {}, toasts = {};
p.on('pageerror', (e) => erros.push(e.message));
await p.goto(base + '/'); await p.waitForSelector('.vrow.fr'); await p.waitForTimeout(800);
await p.addStyleTag({ content: '.tabs{display:none!important}' });
const shot = async (nome, full = true) => {
  largo[nome] = await p.evaluate((w) => Math.max(document.documentElement.scrollWidth, innerWidth) - w, +W);
  await p.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; })); await p.waitForTimeout(300);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 5000 }).catch(() => {});
  await p.screenshot({ path: join(OUT, `feira-${nome}-${LANG}-${W}.png`), fullPage: full });
};
const toca = async (loc) => { await loc.scrollIntoViewIfNeeded(); await p.waitForTimeout(150); await loc.tap(); await p.waitForTimeout(450); };
const toast = async (k) => { toasts[k] = await p.locator('.toast').last().innerText().catch(() => ''); await p.evaluate(() => document.querySelector('.toasts')?.replaceChildren()); };
const sep = (k) => toca(p.locator('.seg').first().locator('button').nth(k));
await shot('inicio');
// levantar o que se ganhou
await toca(p.locator('.cnow .btn.buy').first()); await toast('levantar');
// voltar a pôr à venda o que não se vendeu (fica a preço fixo, dentro da banda)
await toca(p.locator('.cnow .btn.ghost').first()); await p.waitForSelector('.sheet #fpr');
await p.locator('.sheet #fpr').fill('30'); await p.locator('.sheet #fpr').dispatchEvent('input'); await p.waitForTimeout(600); await shot('revender', false);
await toca(p.locator('.sheet .btn.buy')); await toast('revender');
// comprar 2 motores
await toca(p.locator('.vrow.fr.tap').filter({ hasText: 'Motor' }).first());
await p.waitForSelector('.fback'); await p.waitForTimeout(300); await shot('artigo');
await toca(p.locator('.card.vlist .vrow.fr .btn').first()); await p.waitForSelector('.sheet .fqty');
for (let k = 0; k < 10; k++) await p.locator('.sheet .fqty .btn').first().tap();   // desce até 1
await p.locator('.sheet .fqty .btn').nth(1).tap();   // 2
await p.waitForTimeout(200); await shot('comprar', false);
await toca(p.locator('.sheet .btn.buy')); await toast('comprar');
// licitar
await toca(p.locator('.fback')); await sep(1); await shot('leiloes');
if (await p.locator('.fgrp > .vrow').count()) { await toca(p.locator('.fgrp > .vrow').first()); await shot('leiloes-grupo'); await toca(p.locator('.fgrp > .vrow').first()); }   // (com «muitos»)
await toca(p.locator('.card.vlist .vrow.fr').filter({ has: p.locator('.btn') }).first().locator('.btn'));
await p.waitForSelector('.sheet #fbid'); await shot('licitar', false);
await toca(p.locator('.sheet .btn.buy')); await toast('licitar');
// vender 3 de sucata a 50 €
await sep(2); await shot('vender');
await toca(p.locator('.card.vlist .vrow.fr').filter({ hasText: LANG === 'pt' ? 'Sucata' : 'Scrap metal' }).first().locator('.btn'));
await p.waitForSelector('.sheet #fpr'); await p.locator('.sheet #fpr').fill('500'); await p.locator('.sheet #fpr').dispatchEvent('input');
await p.waitForTimeout(700); await shot('fora-da-banda', false);
const desligado = await p.locator('.sheet .btn.buy').isDisabled();
await p.locator('.sheet .seg button').nth(1).tap(); await p.waitForTimeout(200);
const limpo = await p.locator('.sheet #fpr').inputValue();
await p.locator('.sheet .seg button').nth(0).tap(); await p.waitForTimeout(200);
await p.locator('.sheet #fpr').fill('50'); await p.locator('.sheet #fpr').dispatchEvent('input');
await p.waitForTimeout(300); await shot('por-a-venda', false);
await toca(p.locator('.sheet .btn.buy')); await toast('vender');
await sep(3); await shot('meus');
console.log(JSON.stringify({ largo, toasts, foraDaBandaDesliga: desligado, trocarLimpa: limpo === '' }));
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros');
await browser.close();
