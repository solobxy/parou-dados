// Procura o que sai do cartão ou da margem (o que o scroll da página não apanha, porque os cartões cortam o que sai).
// Uso: CONTA=Rico node dev/transborda.mjs <cidade> <largura> <língua> <separador> [separador…]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, W, LANG, ...TABS] = process.argv.slice(2);
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let total = 0;
for (const tab of TABS) {
  const ctx = await browser.newContext({ viewport: { width: +W, height: 860 } });
  const [n, v] = cookies[process.env.CONTA || 'Rico'].split('=');
  await ctx.addCookies([{ name: n, value: v, url: base }]);
  await ctx.addInitScript(([l, t]) => { localStorage.setItem('cr.tab', JSON.stringify(t)); localStorage.setItem('cr.lang', l); }, [LANG, tab]);
  await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
  const p = await ctx.newPage(); await p.goto(base + '/'); await p.waitForTimeout(1300);
  const out = await p.evaluate(() => {
    const res = [], main = document.querySelector('main'); if (!main) return res;
    const mr = main.getBoundingClientRect(), mpad = parseFloat(getComputedStyle(main).paddingRight) || 0;
    for (const e of main.querySelectorAll('button, input, select, b, span, p, small, div, h2, h3, a, label')) {
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (e.closest('[data-hscroll], .qbar, .hscroll, .psub, .honb')) continue;   // o subtítulo e as honras saem de propósito (fundo a toda a largura, realce)
      let skip = false; for (let a = e.parentElement; a && a !== main; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') { skip = true; break; } }
      if (skip) continue;
      const own = [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) || /^(BUTTON|INPUT|SELECT)$/.test(e.tagName); if (!own) continue;
      const card = e.parentElement.closest('.card, .item, .tile, .gear, .job, .tgt, .biz, .hlink, .fence');
      const lim = card ? card.getBoundingClientRect().right : mr.right - mpad;
      if (r.right > lim + 1.5) res.push(`${e.tagName}.${(e.className || '').toString().slice(0, 30)} +${Math.round(r.right - lim)}px «${(e.textContent || e.value || '').trim().slice(0, 40)}»`);
    }
    return [...new Set(res)].slice(0, 6);
  });
  if (out.length) { total += out.length; console.log(tab + ': ' + out.join(' | ')); }
  await ctx.close();
}
console.log(total ? 'total ' + total : 'nada sai');
await browser.close();
