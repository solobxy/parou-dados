// Mapa mais cedo: o index.html pede logo os quadrados do mapa do Perto (antes de a app arrancar). Têm de ser exatamente os que o
// mapa vai mostrar: um quadrado a mais é rede gasta à toa (e compete com a app), um a menos não ganha nada.
// Casos: sem posição guardada (centro de Lisboa, zoom 15) e com a última posição guardada (Porto, zoom 16), em dois ecrãs.
// Uso: BASE=http://127.0.0.1:3000 node mapa-cedo.mjs   (CHROME=/caminho/do/chrome para usar outro browser)
import fs from 'fs';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('playwright-core')); }
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
fs.mkdirSync(process.env.SAIDA || 'res', { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const casos = [
  { nome: 'sem posição, 390x844', vp: { width: 390, height: 844 }, guardada: null },
  { nome: 'Porto guardado, 390x844', vp: { width: 390, height: 844 }, guardada: { latitude: 41.1496, longitude: -8.6109 } },
  { nome: 'Porto guardado, 412x915', vp: { width: 412, height: 915 }, guardada: { latitude: 41.1579, longitude: -8.6291 } },
  { nome: 'Faro guardado, 360x740', vp: { width: 360, height: 740 }, guardada: { latitude: 37.0194, longitude: -7.9304 } },
];
for (const c of casos) {
  // quem tem a posição guardada já deu licença de localização (o GPS volta a dar a mesma posição)
  const ctx = await browser.newContext({ viewport: c.vp, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'pt-PT',
    ...(c.guardada ? { permissions: ['geolocation'], geolocation: { latitude: c.guardada.latitude, longitude: c.guardada.longitude, accuracy: 20 } } : {}) });
  const g = c.guardada ? `localStorage.setItem('parou_localizacao_ok','1');localStorage.setItem('parou_ultima_posicao',JSON.stringify({latitude:${c.guardada.latitude},longitude:${c.guardada.longitude},accuracy:20,timestamp:Date.now(),source:'gps'}));` : '';
  await ctx.addInitScript({ content: `try{localStorage.setItem('parou_aviso_instalar','1');localStorage.setItem('parou_bemvindo','visto');${g}}catch(e){}` });
  const pedidos = new Set();
  await ctx.route(/tile\.openstreetmap\.org/, (r) => { pedidos.add(r.request().url()); r.fulfill({ status: 200, contentType: 'image/png', body: PNG }); });
  // a app (JavaScript principal) chega 2,5 s depois, para se ver o esqueleto sozinho
  await ctx.route(/\/assets\/index-[^/]+\.js/, async (r) => { await new Promise((x) => setTimeout(x, 2500)); await r.continue(); });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
  const posicoes = (sel) => p.evaluate((sel) => Object.fromEntries([...document.querySelectorAll(sel)].map((i) => { const r = i.getBoundingClientRect(); return [i.src, [r.left, r.top, r.width]]; })), sel);
  await p.goto(BASE + '/', { waitUntil: 'commit' });
  await p.waitForTimeout(1200);
  const noEsqueleto = await posicoes('img[data-mapa-arranque]');
  if (c.nome.startsWith('Porto guardado, 390')) await p.screenshot({ path: `${process.env.SAIDA || 'res'}/mapa-esqueleto.png` }).catch(() => {});
  await p.waitForSelector('img.leaflet-tile', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const naApp = await posicoes('img.leaflet-tile');
  const comuns = Object.keys(noEsqueleto).filter((u) => naApp[u]);
  if (process.env.DIAG) { const u = comuns[0]; console.log('DIAG', c.nome, u && u.split('.org/')[1], JSON.stringify(noEsqueleto[u]), JSON.stringify(naApp[u]), await p.evaluate(() => { const w = document.querySelector('.leaflet-container')?.parentElement; return w ? getComputedStyle(w).transform + ' ' + getComputedStyle(w).filter : '-'; })); }
  const desvio = Math.max(0, ...comuns.map((u) => Math.max(Math.abs(noEsqueleto[u][0] - naApp[u][0]), Math.abs(noEsqueleto[u][1] - naApp[u][1]), Math.abs(noEsqueleto[u][2] - naApp[u][2]))));
  ok(`[${c.nome}] o esqueleto já mostra o mapa`, Object.keys(noEsqueleto).length >= 2, `${Object.keys(noEsqueleto).length} quadrados`);
  ok(`[${c.nome}] no mesmo sítio onde a app os põe (sem saltos)`, comuns.length >= 2 && desvio <= 6, `${comuns.length} em comum, desvio máx. ${desvio.toFixed(1)} px`);
  const pre = await p.evaluate(() => [...document.querySelectorAll('link[rel=preload][as=image]')].map((l) => l.href).filter((h) => h.includes('tile.openstreetmap.org')));
  // os quadrados que o mapa (Leaflet) pôs no ecrã (a área do mapa pode passar um pouco das bordas do ecrã)
  const noMapa = await p.evaluate(() => [...document.querySelectorAll('img.leaflet-tile')].map((i) => i.src));
  const aMais = pre.filter((u) => !noMapa.includes(u));
  const usados = pre.filter((u) => noMapa.includes(u));
  ok(`[${c.nome}] pede logo os quadrados do mapa`, pre.length >= 2 && pre.length <= 9, `${pre.length} pedidos cedo`);
  ok(`[${c.nome}] todos são os que o mapa mostra`, aMais.length === 0, aMais.map((u) => u.split('.org/')[1]).join(' '));
  ok(`[${c.nome}] cobrem a maior parte do mapa`, usados.length >= Math.ceil(noMapa.length * 0.6), `${usados.length} de ${noMapa.length} do mapa`);
  ok(`[${c.nome}] sem erros`, erros.length === 0, erros.join(' | '));
  await ctx.close();
}
{
  // Noutras páginas (ex.: /horarios) não se gasta rede com o mapa do Perto
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const p = await ctx.newPage();
  await p.goto(BASE + '/horarios', { waitUntil: 'domcontentloaded' });
  const pre = await p.evaluate(() => document.querySelectorAll('link[rel=preload][as=image][href*="tile.openstreetmap"]').length);
  ok('[outras páginas] não pede quadrados do mapa', pre === 0, String(pre));
  await ctx.close();
}
await browser.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
