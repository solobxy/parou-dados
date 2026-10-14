// Testa a posição no mapa do Perto com GPS simulado (Chromium): autocarro a 12 m/s com ruído, paragem com ruído,
// saltos de GPS. Mede, fotograma a fotograma, como o ponto se mexe no mapa (a transformação do marcador dá a posição
// "no mundo", que não depende do mapa estar a deslizar atrás).
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const res = { testes: [], notas: [] };
const ok = (nome, cond, extra = '') => { res.testes.push({ nome, ok: !!cond, extra: String(extra) }); console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const r = rng(12345);
const gauss = () => { let u = 0; while (u === 0) u = r(); const v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

const LAT0 = 41.1496, LON0 = -8.6109, M = 111320, COS = Math.cos(LAT0 * Math.PI / 180);
const llDe = (x, y) => ({ latitude: LAT0 + y / M, longitude: LON0 + x / (M * COS) });

async function novaPagina(browser, tema = 'claro', w = 390, h = 780) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    permissions: ['geolocation'], geolocation: { ...llDe(0, 0), accuracy: 10 },
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); localStorage.setItem('parou_tema','${tema}'); localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_localizacao_ok','1'); }catch(e){}` });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (rt) => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const p = await ctx.newPage();
  const consola = [];
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|ERR_/.test(m.text())) consola.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => consola.push('PAGEERROR ' + String(e).slice(0, 200)));
  return { ctx, p, consola };
}

// Regista, a cada fotograma, a posição do ponto "no mundo" (transformação do marcador) e no ecrã
const gravar = (p) => p.evaluate(() => {
  window.__rastro = [];
  const tick = () => {
    const el = document.querySelector('.custom-user-marker-icon');
    const mapa = document.querySelector('.leaflet-container');
    if (el && mapa) {
      const m = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(el.style.transform || '');
      const b = el.getBoundingClientRect(), c = mapa.getBoundingClientRect();
      if (m) window.__rastro.push({ t: performance.now(), x: Number(m[1]), y: Number(m[2]), sx: b.left + b.width / 2 - (c.left + c.width / 2), sy: b.top + b.height / 2 - (c.top + c.height / 2) });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const rastro = (p) => p.evaluate(() => window.__rastro);
const metrosPorPixel = (p) => p.evaluate((lat) => {
  // zoom atual pelos mosaicos desenhados (src termina em /z/x/y.png); o mais frequente
  const cont = {};
  document.querySelectorAll('img.leaflet-tile').forEach((i) => { const m = /\/(\d+)\/(\d+)\/(\d+)\.png/.exec(i.src || ''); if (m) cont[m[1]] = (cont[m[1]] || 0) + 1; });
  const z = Number(Object.entries(cont).sort((a, b) => b[1] - a[1])[0]?.[0]) || 16;
  return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
}, LAT0);

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  // ---- 1) Autocarro a 12 m/s para leste, GPS a 1 Hz com ruído (sem velocidade/rumo: o Chromium não os simula)
  for (const [tema, w, h] of [['claro', 390, 780], ['escuro', 390, 780]]) {
    const { ctx, p, consola } = await novaPagina(browser, tema, w, h);
    await p.goto(BASE + '/', { waitUntil: 'load' });
    await p.waitForTimeout(2500);
    await ctx.setGeolocation({ ...llDe(0, 0), accuracy: 10 });
    await p.waitForSelector('.custom-user-marker-icon', { timeout: 15000 }).catch(() => {});
    ok(`[${tema}] o ponto da localização aparece no mapa`, (await p.locator('.custom-user-marker-icon').count()) === 1);
    await gravar(p);
    let x = 0, y = 0, bx = 0, by = 0;
    for (let i = 1; i <= 40; i++) {
      x += 12; // m
      bx = 0.9 * bx + 0.44 * 5 * gauss(); by = 0.9 * by + 0.44 * 5 * gauss();
      const salto = (i === 17 || i === 18) ? 70 : 0; // dois segundos de GPS a mentir
      const ll = llDe(x + bx + salto, y + by);
      await ctx.setGeolocation({ ...ll, accuracy: 6 + Math.round(Math.abs(gauss()) * 5) });
      await p.waitForTimeout(1000);
    }
    const pts = await rastro(p);
    const mpp = await metrosPorPixel(p);
    res.notas.push(`[${tema}] fotogramas: ${pts.length}, m/px: ${mpp.toFixed(2)}`);
    // passo por fotograma em metros (posição "no mundo")
    const passos = [];
    for (let i = 1; i < pts.length; i++) passos.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) * mpp);
    const maxPasso = Math.max(...passos);
    const andou = Math.hypot(pts.at(-1).x - pts[0].x, pts.at(-1).y - pts[0].y) * mpp;
    // marcha atrás: fotogramas em que o ponto recua >0,3 m na direção do trajeto (leste = +x)
    const recuos = pts.slice(1).filter((q, i) => (q.x - pts[i].x) * mpp < -0.3).length;
    // o mapa segue o ponto: distância do ponto ao centro do mapa (px, ecrã)
    const longe = pts.slice(Math.floor(pts.length * 0.3)).map((q) => Math.hypot(q.sx, q.sy));
    const maxLonge = Math.max(...longe);
    res.notas.push(`[${tema}] andou ${andou.toFixed(0)} m em ${(pts.at(-1).t - pts[0].t) / 1000}s; maior passo por fotograma ${maxPasso.toFixed(2)} m; recuos ${recuos}; ponto longe do centro até ${maxLonge.toFixed(0)} px`);
    console.log(res.notas.at(-1));
    ok(`[${tema}] o ponto avança de forma contínua (maior passo por fotograma < 1,5 m)`, maxPasso < 1.5, maxPasso.toFixed(2));
    ok(`[${tema}] o ponto não anda para trás`, recuos <= 3, recuos);
    ok(`[${tema}] o ponto percorre o trajeto (±30%) em vez de ficar parado`, andou > 0.7 * 12 * 40 * 0.9 && andou < 1.3 * 12 * 40, andou.toFixed(0));
    ok(`[${tema}] o mapa segue o ponto (fica a menos de 40 px do centro)`, maxLonge < 40, maxLonge.toFixed(0));
    await p.screenshot({ path: `${SAIDA}/gps_${tema}_andar.png` });
    ok(`[${tema}] sem erros de consola`, consola.length === 0, consola.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ---- 2) Parado, com GPS a "tremer" (8 m): o ponto não deve andar à roda
  {
    const { ctx, p, consola } = await novaPagina(browser, 'claro');
    await p.goto(BASE + '/', { waitUntil: 'load' });
    await p.waitForTimeout(2500);
    await ctx.setGeolocation({ ...llDe(0, 0), accuracy: 10 });
    await p.waitForSelector('.custom-user-marker-icon', { timeout: 15000 }).catch(() => {});
    await gravar(p);
    let bx = 0, by = 0;
    for (let i = 0; i < 30; i++) {
      bx = 0.85 * bx + 0.53 * 8 * gauss(); by = 0.85 * by + 0.53 * 8 * gauss();
      await ctx.setGeolocation({ ...llDe(bx, by), accuracy: 9 });
      await p.waitForTimeout(1000);
    }
    const pts = (await rastro(p)).filter((q) => q.t > 0);
    const mpp = await metrosPorPixel(p);
    const dep = pts.slice(Math.floor(pts.length * 0.4)); // depois de assentar
    const mx = dep.reduce((s, q) => s + q.x, 0) / dep.length, my = dep.reduce((s, q) => s + q.y, 0) / dep.length;
    const disp = Math.sqrt(dep.reduce((s, q) => s + (q.x - mx) ** 2 + (q.y - my) ** 2, 0) / dep.length) * mpp;
    res.notas.push(`[parado] dispersão do ponto: ${disp.toFixed(2)} m (GPS cru ~11 m)`);
    console.log(res.notas.at(-1));
    ok('[parado] o ponto fica quase quieto (dispersão < 4 m com GPS a variar ~11 m)', disp < 4, disp.toFixed(2));
    ok('[parado] sem erros de consola', consola.length === 0, consola.slice(0, 2).join(' | '));
    await p.screenshot({ path: `${SAIDA}/gps_parado.png` });
    await ctx.close();
  }

  // ---- 3) Posição à mão continua a funcionar (não é arrastada pelo GPS)
  fs.writeFileSync(`${SAIDA}/resultado.json`, JSON.stringify(res, null, 1));
  const falhas = res.testes.filter((t) => !t.ok);
  console.log(`\n${res.testes.length - falhas.length}/${res.testes.length} testes OK`);
  await browser.close();
})();
