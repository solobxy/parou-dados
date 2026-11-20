// Procura texto partido ou cortado em todos os ecrãs do jogo (pedido de 20/11: «ainda há textos cortados a meio»).
//   partida: uma palavra que muda de linha a meio (ex.: «Classific/ação»)
//   reticencias / cortado: texto que não cabe e fica com «…» ou escondido (overflow)
//   linhas: texto cortado por um limite de linhas (line-clamp)
// Uso (precisa de uma cidade de teste a correr e do Playwright):
//   node dev/textos-cortados.mjs <base> <cookie> <largura> <língua> [ecrãs...]   → JSON com o que encontrou, uma linha por ecrã
// Sem ecrãs, percorre todos os que o site tem (lidos de SCREENS em app.js).
// CLIQUES="seletor|seletor|…" toca nesses sítios antes de procurar (ex.: abrir uma folha: CLIQUES=".invg .invc:nth-child(11)").
import { createRequire } from 'node:module'; import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const [BASE, COOKIE, W, LANG, ...pedidos] = process.argv.slice(2);
const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sites', 'crime', 'js', 'app.js'), 'utf8');
const corpo = app.slice(app.indexOf('const SCREENS = {'), app.indexOf('};', app.indexOf('const SCREENS = {')));
const TABS = pedidos.length ? pedidos : [...corpo.matchAll(/[{,]\s*([a-z]+):/g)].map((m) => m[1]);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: +W, height: 900 } });
const [n, v] = COOKIE.split('='); await ctx.addCookies([{ name: n, value: v, url: BASE }]);
const p = await ctx.newPage();
function procurar() {
  const out = [], vistos = new Set();
  const caminho = (el) => { const s = []; for (let e = el; e && e !== document.body && s.length < 4; e = e.parentElement) s.unshift(e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : '')); return s.join(' > '); };
  const ver = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return !el.closest('.sr, [aria-hidden="true"]'); };
  const junta = (k, el, txt, w) => { const key = k + caminho(el) + (w || txt); if (vistos.has(key)) return; vistos.add(key); out.push({ k, onde: caminho(el), txt: txt.trim().replace(/\s+/g, ' ').slice(0, 70), w }); };
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), r = document.createRange();
  for (let nd; (nd = tw.nextNode());) {
    const el = nd.parentElement; if (!el || !nd.data.trim() || !ver(el)) continue;
    const re = /\S+/g; let m;
    while ((m = re.exec(nd.data))) {
      const w = m[0]; if (w.length < 3 || /[-/­·–—_]/.test(w.slice(0, -1))) continue;
      r.setStart(nd, m.index); r.setEnd(nd, m.index + w.length);
      const rs = [...r.getClientRects()].filter((x) => x.width > 0.5);
      if (rs.length > 1 && Math.abs(rs[0].top - rs[rs.length - 1].top) > 3) junta('partida', el, nd.data, w);
    }
  }
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes.length || !ver(el)) continue;
    const temTexto = [...el.childNodes].some((c) => c.nodeType === 3 && c.data.trim()); if (!temTexto) continue;
    const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 1 && (cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis')) junta(cs.textOverflow === 'ellipsis' ? 'reticencias' : 'cortado', el, el.textContent);
    if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 2) junta('linhas', el, el.textContent);
  }
  return out;
}
for (const tab of TABS) {
  await p.addInitScript(([l, t]) => { localStorage.setItem('cr.tab', JSON.stringify(t)); localStorage.setItem('cr.lang', l); }, [LANG, tab]);
  await p.goto(BASE + '/'); await p.waitForTimeout(+(process.env.ESPERA || 1500));
  for (const sel of (process.env.CLIQUES || '').split('|').filter(Boolean)) { await p.locator(sel).first().click(); await p.waitForTimeout(700); }
  const real = await p.evaluate(() => JSON.parse(localStorage.getItem('cr.tab') || '""'));
  const achados = await p.evaluate(procurar);
  console.log(JSON.stringify({ tab, real, W: +W, lang: LANG, achados }));
}
await b.close();
