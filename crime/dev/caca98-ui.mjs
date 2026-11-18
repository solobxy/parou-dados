// v98: a caça no browser (simulado). Lista das reservas (licença e furtiva), troféus, uma saída com mira, tiro, aproximar, procurar e sair.
// Uso: node dev/caca98-ui.mjs <cidade> <pasta> <largura> <língua>   (CONTA=Rico)
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, OUT, W, LANG] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const erros = [];
const ctx = await browser.newContext({ viewport: { width: +W, height: 860 }, deviceScaleFactor: 2 });
const [n, v] = cookies[process.env.CONTA || 'Rico'].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([lang]) => { localStorage.setItem('cr.tab', JSON.stringify('hunt')); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sfx', 'false'); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage();
p.on('pageerror', (e) => erros.push('erro: ' + e.message));
await p.goto(base + '/'); await p.waitForTimeout(1500);
await p.addStyleTag({ content: '.tabs{display:none!important}' });
const lado = async (nome) => { const x = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (x > 0) erros.push(nome + ': sai ' + x + ' px para o lado'); };
// textos cortados: elementos com texto mais largos do que a caixa
const cortes = async (nome) => { const c = await p.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => e.children.length === 0 && !e.closest('.sr') && e.textContent.trim() && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map((e) => e.textContent.trim().slice(0, 30))); if (c.length) erros.push(nome + ': cortados ' + c.slice(0, 4).join(' | ')); };
const foto = async (nome) => { await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } scrollTo(0, 0); }); await p.waitForTimeout(1200); await lado(nome); await cortes(nome); await p.screenshot({ path: join(OUT, `caca-${nome}-${LANG}-${W}.png`), fullPage: true }); };
await foto('1lista');
const FUR = '.seg button:has-text("Furtiva"), .seg button:has-text("Poaching")', TR = '.seg button:has-text("Troféus"), .seg button:has-text("Trophies")';
await p.locator(FUR).first().click(); await p.waitForTimeout(400); await foto('2furtiva');
await p.locator(TR).first().click(); await p.waitForTimeout(500); await foto('3trofeus');
await p.locator(FUR).first().click(); await p.waitForTimeout(300);   // furtiva (sem licenças gastas)
const ir = p.locator('.hsr .hgo:not([disabled])').first();
if (!(await ir.count())) erros.push('nenhuma reserva para ir'); else { await ir.click(); await p.waitForTimeout(1200); }
await foto('4mira');
const tem = await p.locator('.hscope').count(); if (!tem) erros.push('sem mira');
// a mira mexe-se: duas leituras da posição diferentes
const x1 = await p.evaluate(() => getComputedStyle(document.querySelector('.hscope')).getPropertyValue('--hx'));
await p.waitForTimeout(170);
const x2 = await p.evaluate(() => getComputedStyle(document.querySelector('.hscope')).getPropertyValue('--hx'));
if (x1 === x2) erros.push('a mira não se mexe (' + x1 + ')');
// esperar pela cruz no centro e disparar
await p.waitForFunction(() => document.querySelector('.hscope')?.dataset.q === 'perf', null, { timeout: 8000 }).catch(() => erros.push('nunca ficou perfeita'));
const shoot = p.locator('.hshoot');
if (await shoot.isDisabled()) { await p.locator('.hmoves .btn >> nth=0').click(); await p.waitForTimeout(900); }
await p.locator('.hshoot').click({ timeout: 3000 }).catch(() => erros.push('não deu para disparar'));
await p.waitForTimeout(1200); await foto('5tiro');
const res = await p.locator('.hres, .hend').first().textContent().catch(() => ''); if (!res) erros.push('sem resultado do tiro');
// procurar ou aproximar, se der
const look = (await p.locator('.hscope.empty').count()) ? p.locator('.hshoot') : p.locator('.hmoves .btn >> nth=1');
if (await look.count() && !(await look.isDisabled())) { await look.click(); await p.waitForTimeout(900); await foto('6procurar'); }
// sair
const sair = p.locator('.hleave');
if (await sair.count()) { await sair.click(); await p.waitForTimeout(1200); }
await foto('7fim');
if (!(await p.locator('.hend').count())) erros.push('sem cartão do fim');
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros');
await browser.close();
