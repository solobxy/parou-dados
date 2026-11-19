// v111: a cave, separador das máquinas: nenhum botão desligado sem motivo (bancada ocupada, prisão) e todas as máquinas com imagem e texto.
// Uso: CONTA=Rico node dev/cave111-ui.mjs <cidade> <pasta> <largura> <língua>
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
await ctx.addInitScript(([l]) => { localStorage.setItem('cr.tab', JSON.stringify('cave')); localStorage.setItem('cr.lang', l); localStorage.setItem('cr.chatSeen', '1'); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base + '/'); await p.waitForTimeout(1500);
const seg = await p.$$('.cvseg button'); await seg[3].click(); await p.waitForTimeout(600);
// cada linha: o nome, se o botão está desligado e se há um motivo à vista; imagens que não carregaram; chaves de texto por traduzir
const rows = await p.$$eval('.cvr', (rs) => rs.map((r) => ({ nome: r.querySelector('b')?.textContent, off: !!r.querySelector('.cva button[disabled]'), motivo: r.querySelector('.cva span')?.textContent || '', linha: r.querySelector('.cvd')?.innerText.replace(/\n/g, ' | '), img: !!r.querySelector('img.vth, .vth img, img') })));
for (const r of rows) console.log((r.img ? '' : '[SEM IMAGEM] ') + r.nome + ' · ' + (r.off ? 'DESLIGADO' : 'ok') + ' · ' + r.motivo + ' · ' + r.linha);
// as imagens são lazy: desce a página toda e confere que cada máquina tem imagem carregada
for (let y = 0; y < 8000; y += 500) { await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(120); }
await p.waitForTimeout(800);
const semImg = await p.$$eval('.cvr', (rs) => rs.filter((r) => { const i = r.querySelector('img'); return !i || !i.complete || !i.naturalWidth; }).map((r) => r.querySelector('b')?.textContent));
console.log(semImg.length ? 'SEM IMAGEM: ' + semImg.join(', ') : 'todas as máquinas com imagem');
const chaves = await p.evaluate(() => (document.body.innerText.match(/\b(cv|mq)[A-Z_][A-Za-z_]*\b/g) || []));
console.log(chaves.length ? 'CHAVES SEM TEXTO: ' + chaves.join(', ') : 'sem chaves por traduzir');
await p.screenshot({ path: join(OUT, `cave-maq-${quem}-${LANG}-${W}.png`), fullPage: true });
console.log(errs.length ? 'ERROS: ' + errs.join(' | ') : 'sem erros');
await b.close();
