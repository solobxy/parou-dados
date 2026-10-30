// Visita real ao parou.pt como quem chega do Google (telemóvel, 390 px, sem cookies):
// abre páginas públicas (paragem, linha, cidade, greves) e a app, mede tempos (TTFB, FCP, LCP, CLS),
// regista janelas/avisos que aparecem por cima, erros de consola e pedidos falhados, e tira capturas.
// Não altera nada no site. Uso: SAIDA=res node visita-real.mjs
import { chromium } from 'playwright';
import fs from 'fs';
const BASE = process.env.BASE || 'https://parou.pt';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const linhas = [];
const log = (...a) => { const s = a.join(' '); linhas.push(s); console.log(s); };

const browser = await chromium.launch();
async function visitar(nome, caminho, { tema = 'claro', depois } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon',
    colorScheme: tema === 'escuro' ? 'dark' : 'light',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    extraHTTPHeaders: { Referer: 'https://www.google.com/' },
  });
  await ctx.addInitScript({ content: `Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true});
    window.__lcp=0; window.__cls=0;
    try{ new PerformanceObserver(l=>{for(const e of l.getEntries()) window.__lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});
         new PerformanceObserver(l=>{for(const e of l.getEntries()) if(!e.hadRecentInput) window.__cls+=e.value}).observe({type:'layout-shift',buffered:true}); }catch(e){}` });
  const p = await ctx.newPage();
  const erros = []; const falhados = [];
  p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text().slice(0, 160)); });
  p.on('pageerror', (e) => erros.push('pageerror: ' + String(e).slice(0, 160)));
  p.on('requestfailed', (r) => falhados.push(`${r.failure()?.errorText} ${r.url().slice(0, 100)}`));
  p.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) falhados.push(`${r.status()} ${r.url().slice(0, 100)}`); });
  const t0 = Date.now();
  const resp = await p.goto(BASE + caminho, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => { log(nome, 'ERRO goto', e.message); return null; });
  await p.waitForTimeout(6000);
  const nav = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const f = performance.getEntriesByName('first-contentful-paint')[0]; return { ttfb: n ? Math.round(n.responseStart) : null, fcp: f ? Math.round(f.startTime) : null, lcp: Math.round(window.__lcp), cls: Number(window.__cls.toFixed(3)), bytes: n ? n.transferSize : null }; }).catch(() => ({}));
  // O que está por cima do conteúdo (diálogos, folhas, faixas fixas)
  const sobre = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (!['fixed', 'sticky'].includes(cs.position) && el.getAttribute('role') !== 'dialog' && el.tagName !== 'DIALOG') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 40 || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const txt = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 110);
      if (!txt) continue;
      out.push(`${el.getAttribute('role') === 'dialog' || el.tagName === 'DIALOG' ? 'DIÁLOGO' : cs.position} ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.top)}: ${txt}`);
    }
    return out.slice(0, 12);
  }).catch(() => []);
  const ecraTapado = await p.evaluate(() => { let t = 0; for (const el of document.querySelectorAll('[role="dialog"], dialog[open]')) { const r = el.getBoundingClientRect(); t = Math.max(t, (r.width * r.height) / (innerWidth * innerHeight)); } return Math.round(t * 100); }).catch(() => 0);
  log(`\n== ${nome} ${caminho} (${tema}) estado ${resp?.status()} em ${Date.now() - t0} ms`);
  log(`   tempos: TTFB ${nav.ttfb} ms · FCP ${nav.fcp} ms · LCP ${nav.lcp} ms · CLS ${nav.cls} · ${nav.bytes} B`);
  log(`   diálogos ocupam ${ecraTapado}% do ecrã`);
  for (const s of sobre) log('   por cima:', s);
  for (const e of erros.slice(0, 8)) log('   consola:', e);
  for (const f of falhados.slice(0, 8)) log('   falhou:', f);
  await p.screenshot({ path: `${SAIDA}/${nome}-${tema}.png` });
  if (depois) await depois(p, nome, tema);
  await ctx.close();
}

// Escolhe páginas reais do sitemap
const sm = async (u) => [...(await (await fetch(BASE + u)).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(BASE, ''));
const paragens = await sm('/sitemap-paragens-1.xml');
const linhasSm = (await sm('/sitemap-linhas.xml')).filter((u) => u.split('/').length === 4);
const escolhe = (lista, re) => lista.find((u) => re.test(u)) || lista[0];

await visitar('paragem-stcp', escolhe(paragens, /\/paragens\/stcp\//), {
  depois: async (p, nome, tema) => {
    const b = p.getByRole('link', { name: /tempo real/i }).first();
    if (await b.count()) { await b.click().catch(() => {}); await p.waitForTimeout(7000); await p.screenshot({ path: `${SAIDA}/${nome}-app-depois-do-botao.png` }); log('   depois de "Ver em tempo real":', p.url().replace(BASE, '')); }
  },
});
await visitar('paragem-cm', escolhe(paragens, /carris-metropolitana/));
await visitar('linha-carris', escolhe(linhasSm, /\/linhas\/carris\//));
await visitar('cidade-lisboa', '/cidade/lisboa');
await visitar('greves', '/greves');
await visitar('app-inicio', '/');
await visitar('app-inicio', '/', { tema: 'escuro' });
await visitar('app-horarios', '/transportes');
await browser.close();
fs.writeFileSync(`${SAIDA}/visita-real.txt`, linhas.join('\n') + '\n');
