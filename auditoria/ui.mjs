// Auditoria visual e de acessibilidade da PAROU: percorre os ecrãs em vários tamanhos, temas e idiomas
// e regista erros de consola, scroll horizontal, acessibilidade (axe), alvos de toque, textos por traduzir e desempenho.
import { chromium } from 'playwright';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'ui-resultado';
fs.mkdirSync(SAIDA, { recursive: true });
const LARG = { 320: [320, 640], 390: [390, 844], 768: [768, 1024], 1280: [1280, 800] };
const TEMAS = ['claro', 'escuro', 'ambar'];
const APP = ['/', '/transportes', '/mapa', '/alertas', '/comunidade', '/favoritos', '/cobertura', '/atrasos', '/greves'];
const PUBL = ['/sobre', '/privacidade', '/termos', '/contactar', '/apagar-conta', '/linhas', '/linhas/stcp', '/linha/stcp:801', '/paragem/stcp:PSL1', '/greves/stcp', '/incendios', '/cidades', '/pesquisa?q=801', '/404'];
const lerLote = (a, n) => a.slice(0, n);

const initTpl = (tema, idioma) => `
try{localStorage.setItem('parou_tema','${tema}');localStorage.setItem('parou_aviso_instalar','1');localStorage.setItem('parou_idioma','${idioma}');}catch(e){}
try{document.cookie='parou_idioma=${idioma};path=/;max-age=3600';}catch(e){}
window.__lcp=0;window.__cls=0;
try{new PerformanceObserver(function(l){for(var e of l.getEntries())window.__lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true})}catch(e){}
window.__shifts=[];
window.__mut=[];
try{var __mo=new MutationObserver(function(rs){for(var r of rs){if(window.__mut.length>=30)return;var t=Math.round(performance.now());
if(r.type==='childList'){for(var n of r.removedNodes){if(n.nodeType===1&&/^(SECTION|DIV|MAIN|FOOTER|NAV|HEADER)$/.test(n.tagName)&&(n.textContent||'').length>20){window.__mut.push({t:t,k:'-',n:n.tagName+'.'+String(n.className||'').slice(0,40)+' "'+(n.textContent||'').trim().slice(0,20)+'"',p:(r.target.tagName||'')+'.'+String(r.target.className||'').slice(0,40)})}}}
else if(r.type==='attributes'&&r.attributeName==='class'){var cc=String(r.target.className||'');var oo=String(r.oldValue||'');if(/(^| )hidden( |$)/.test(cc)!==/(^| )hidden( |$)/.test(oo)){window.__mut.push({t:t,k:'cls',n:r.target.tagName+' "'+(r.target.textContent||'').trim().slice(0,20)+'"',o:oo.slice(0,60),c:cc.slice(0,60)})}}
else if(r.type==='attributes'&&r.attributeName==='style'){var s=r.target.getAttribute('style')||'';if(/display/.test(s))window.__mut.push({t:t,k:'style',n:r.target.tagName+'.'+String(r.target.className||'').slice(0,40),s:s.slice(0,60)})}}});
__mo.observe(document,{childList:true,subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['style','class']})}catch(e){}
try{new PerformanceObserver(function(l){for(var e of l.getEntries())if(!e.hadRecentInput){window.__cls+=e.value;if(e.value>0.02&&window.__shifts.length<6){var d=function(n){if(!n)return '?';var c=(n.className&&n.className.baseVal!==undefined?n.className.baseVal:n.className)||'';var hid='';try{for(var a=n;a;a=a.parentElement){if(getComputedStyle(a).display==='none'){hid=' HID<'+a.tagName+'.'+String(a.className||'').slice(0,50)+'>';break}}}catch(e){}return (n.tagName||'#').toLowerCase()+'.'+String(c).slice(0,60)+' "'+((n.textContent||'').trim().slice(0,24))+'"'+(n.isConnected?'':' DESLIGADO')+hid};window.__shifts.push({v:+e.value.toFixed(3),t:Math.round(e.startTime),s:(e.sources||[]).slice(0,3).map(function(s){return d(s.node)+' y '+Math.round(s.previousRect.y)+'>'+Math.round(s.currentRect.y)+' h '+Math.round(s.currentRect.height)}) })}}}).observe({type:'layout-shift',buffered:true})}catch(e){}
`;

const medir = `(() => {
  const vw = window.innerWidth, vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const out = { titulo: document.title, lang: document.documentElement.lang, h1: document.querySelectorAll('h1').length,
    desc: !!document.querySelector('meta[name=description]'), canonical: (document.querySelector('link[rel=canonical]') || {}).href || '',
    scrollW: document.documentElement.scrollWidth, vw, lcp: Math.round(window.__lcp || 0), cls: +(window.__cls || 0).toFixed(3), shifts: window.__shifts || [], mut: window.__mut || [] };
  out.transbordam = [...document.querySelectorAll('body *')].filter((e) => { if (!vis(e)) return false; const r = e.getBoundingClientRect(); return r.right > vw + 1 && !e.closest('.leaflet-container,[data-rolagem],.overflow-x-auto,.overflow-auto,.scroll-x,[class*="overflow-x"]'); }).slice(0, 5).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).slice(0, 50) + ' "' + (e.textContent || '').trim().slice(0, 30) + '" r=' + Math.round(e.getBoundingClientRect().right));
  const alvos = [...document.querySelectorAll('a[href],button,[role=button],[role=tab],input:not([type=hidden]),select,textarea,summary')].filter(vis);
  out.nAlvos = alvos.length;
  out.alvosPequenos = alvos.filter((e) => { const r = e.getBoundingClientRect(); return (r.width < 24 || r.height < 24) && !e.closest('.leaflet-container'); }).slice(0, 8).map((e) => e.tagName.toLowerCase() + ' "' + ((e.getAttribute('aria-label') || e.textContent || e.getAttribute('title') || '').trim().slice(0, 25)) + '" ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height));
  out.alvosAbaixo44 = alvos.filter((e) => { const r = e.getBoundingClientRect(); return (r.width < 44 || r.height < 44) && !e.closest('.leaflet-container'); }).length;
  out.semNome = alvos.filter((e) => { const t = (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.textContent || e.getAttribute('title') || e.getAttribute('alt') || '').trim(); if (t) return false; if (e.tagName === 'INPUT' && (e.labels && e.labels.length || e.placeholder)) return false; if (e.querySelector('img[alt]:not([alt=""])')) return false; return true; }).slice(0, 5).map((e) => e.outerHTML.slice(0, 100));
  out.imgSemAlt = [...document.images].filter((i) => !i.hasAttribute('alt')).slice(0, 5).map((i) => i.src.slice(-50));
  out.imgQuebradas = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !/tile|openstreetmap|arcgis|cartocdn/.test(i.src)).slice(0, 5).map((i) => i.src.slice(-60));
  out.textoMiudo = [...document.querySelectorAll('body *')].filter((e) => { if (!vis(e) || !e.childNodes.length) return false; const t = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length > 2); if (!t.length) return false; return parseFloat(getComputedStyle(e).fontSize) < 11 && !e.closest('.leaflet-container'); }).length;
  const chrome = [...document.querySelectorAll('nav a, nav button, header button, header a, h1, h2, h3, label, button, [role=tab], [placeholder], [aria-label]')].filter(vis).flatMap((e) => [(e.children.length < 3 ? e.textContent : '').trim(), e.getAttribute('placeholder') || '', e.getAttribute('aria-label') || '']).filter((t) => t && t.length > 2 && t.length < 70);
  out.textosUI = [...new Set(chrome)].slice(0, 220);
  return out;
})()`;

const PT = /(\bnão\b|\bpara\b|\bperto\b|horário|\bcom\b.*\bde\b|ções?\b|\bhoje\b|amanhã|\bentrar\b|\bsair\b|\bguardar\b|\bcancelar\b|\bpesquisar\b|\bmostrar\b|\bfechar\b|\bvoltar\b|\bnenhum|\bsem\b|\bseguinte|\bpróxim|\bdisponível|\bcarregar|\bconta\b|\bpartilh|\bdenunci|\bbloquear|\bresposta|\bpublicar|\bdistrito\b|\bgrátis|\bgratuit|\btempo real\b|\batras|\bparagem|\blinha\b|\bavisos?\b|\bnotícia)/i;

async function pagina(browser, { caminho, w, h, tema, idioma, axe, perf }) {
  const [W, H] = LARG[w] || [w, h];
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: idioma === 'pt' ? 'pt-PT' : idioma, timezoneId: 'Europe/Lisbon', geolocation: { latitude: 41.1496, longitude: -8.6109, accuracy: 120 }, permissions: ['geolocation'], hasTouch: W < 1024, isMobile: W < 700 });
  await ctx.addInitScript({ content: initTpl(tema, idioma) });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64') }));
  const p = await ctx.newPage();
  const reg = { caminho, w, tema, idioma, consola: [], erros: [], falhas: [], http: [] };
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) { const t = m.text(); if (!/Failed to load resource|favicon|ERR_BLOCKED|net::ERR_FAILED/.test(t)) reg.consola.push(m.type() + ': ' + t.slice(0, 180)); } });
  p.on('pageerror', (e) => reg.erros.push(String(e).slice(0, 220)));
  p.on('requestfailed', (r) => { if (!/tile|openstreetmap|arcgis|cartocdn|googletagmanager|gstatic/.test(r.url())) reg.falhas.push(r.url().slice(0, 100) + ' ' + (r.failure() || {}).errorText); });
  p.on('response', (r) => { const u = r.url(); if (u.startsWith(BASE) && r.status() >= 400 && !/favicon/.test(u)) reg.http.push(r.status() + ' ' + u.replace(BASE, '').slice(0, 90)); });
  const t0 = Date.now();
  let resp = null;
  try { resp = await p.goto(BASE + caminho, { waitUntil: 'load', timeout: 45000 }); } catch (e) { reg.erros.push('goto: ' + String(e).slice(0, 150)); }
  reg.estado = resp ? resp.status() : 0;
  await p.waitForTimeout(perf ? 3500 : 2200);
  try {
    const m = await p.evaluate(medir);
    Object.assign(reg, m);
    if (perf) {
      reg.recursos = await p.evaluate(`(() => { const r = performance.getEntriesByType('resource'); const js = r.filter((x) => /\\.js(\\?|$)/.test(x.name)); const css = r.filter((x) => /\\.css(\\?|$)/.test(x.name)); const img = r.filter((x) => x.initiatorType === 'img' || /\\.(png|jpe?g|webp|svg)/.test(x.name)); const s = (a, k) => Math.round(a.reduce((t, x) => t + (x[k] || 0), 0) / 1024); return { pedidos: r.length, jsKB: s(js, 'transferSize'), jsKBdescomp: s(js, 'decodedBodySize'), cssKB: s(css, 'transferSize'), imgKB: s(img, 'transferSize'), totalKB: s(r, 'transferSize') }; })()`);
      const nav = await p.evaluate(`(() => { const n = performance.getEntriesByType('navigation')[0]; return n ? { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null; })()`);
      reg.nav = nav;
    }
    if (axe) {
      await p.evaluate(axeSrc);
      const r = await p.evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] }).then((r) => r.violations.map((v) => ({ id: v.id, impacto: v.impact, n: v.nodes.length, ajuda: v.help, nos: v.nodes.slice(0, 3).map((n) => ({ alvo: n.target.join(' ').slice(0, 90), html: n.html.slice(0, 130), resumo: (n.any[0] || n.all[0] || n.none[0] || {}).message || '' })) })))`);
      reg.axe = r;
    }
    if (idioma !== 'pt') reg.suspeitosPT = (reg.textosUI || []).filter((t) => PT.test(t)).slice(0, 25);
  } catch (e) { reg.erros.push('medir: ' + String(e).slice(0, 150)); }
  reg.ms = Date.now() - t0;
  if (process.env.CAPTURAS === '1' && (tema === 'claro' || w === 390)) { try { await p.screenshot({ path: `${SAIDA}/${w}_${tema}_${idioma}_${caminho.replace(/[^a-z0-9]+/gi, '_')}.png` }); } catch {} }
  await ctx.close();
  return reg;
}

async function paralelo(tarefas, n, fn) {
  const res = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tarefas.length) { const k = i++; try { res[k] = await fn(tarefas[k]); } catch (e) { res[k] = { erro: String(e).slice(0, 200), ...tarefas[k] }; } } }));
  return res;
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const tarefas = [];
  // A) ecrãs da app em 4 larguras × 3 temas (português); axe só no tema claro e escuro a 390 e 1280
  for (const c of APP) for (const w of [320, 390, 768, 1280]) for (const tema of TEMAS) tarefas.push({ caminho: c, w, tema, idioma: 'pt', axe: (w === 390 || w === 1280) && tema !== 'ambar' || (w === 390 && tema === 'ambar'), perf: false });
  // B) páginas públicas e de informação: 2 larguras × 3 temas
  for (const c of PUBL) for (const w of [390, 1280]) for (const tema of TEMAS) tarefas.push({ caminho: c, w, tema, idioma: 'pt', axe: w === 390 || tema === 'claro', perf: false });
  // C) idiomas: en, de, fr a 390 (claro) e 1280 (escuro) em todos os ecrãs
  for (const idioma of ['en', 'de', 'fr']) for (const c of [...APP, ...PUBL.filter((x) => !/404|pesquisa/.test(x))]) for (const [w, tema] of [[390, 'claro'], [1280, 'escuro']]) tarefas.push({ caminho: c, w, tema, idioma, axe: false, perf: false });
  // D) desempenho: 8 ecrãs a 390 claro, uma de cada vez
  const perfTarefas = ['/', '/transportes', '/mapa', '/alertas', '/comunidade', '/linhas', '/linha/stcp:801', '/paragem/stcp:PSL1'].map((c) => ({ caminho: c, w: 390, tema: 'claro', idioma: 'pt', axe: false, perf: true }));
  console.log('páginas a testar:', tarefas.length, '+ desempenho:', perfTarefas.length);
  const t0 = Date.now();
  const res = await paralelo(tarefas, 4, (t) => pagina(browser, t));
  console.log('tempo:', Math.round((Date.now() - t0) / 1000), 's');
  const resPerf = await paralelo(perfTarefas, 1, (t) => pagina(browser, t));
  fs.writeFileSync(`${SAIDA}/ui.json`, JSON.stringify({ res, resPerf }, null, 1));
  await browser.close();
})();
