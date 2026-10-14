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


// Define a posição do GPS simulado. Com CDP dá também velocidade e rumo (efeito Doppler, como num telemóvel real);
// sem CDP só dá a posição (o que o Playwright oferece).
async function fixar(ctx, cdp, ll, acc, vel, rumo) {
  if (cdp) {
    const par = { latitude: ll.latitude, longitude: ll.longitude, accuracy: acc };
    if (vel !== undefined && vel !== null) par.speed = vel;
    if (rumo !== undefined && rumo !== null) par.heading = rumo;
    await cdp.send('Emulation.setGeolocationOverride', par);
  } else {
    await ctx.setGeolocation({ ...ll, accuracy: acc });
  }
}
const lerGps = (p) => p.evaluate(() => new Promise((res) => navigator.geolocation.getCurrentPosition((q) => res({ s: q.coords.speed, h: q.coords.heading }), () => res(null), { maximumAge: 0, timeout: 6000 })));

// Deslocamento do ponto numa janela de 'ms' milissegundos, em metros (reduz o efeito dos pixéis inteiros do Leaflet,
// que no zoom 16 valem ~1,8 m cada)
function janelas(pts, mpp, ms) {
  const out = [];
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    while (j < pts.length && pts[j].t - pts[i].t < ms) j++;
    if (j >= pts.length) break;
    out.push({ dx: (pts[j].x - pts[i].x) * mpp, dy: (pts[j].y - pts[i].y) * mpp, i, j });
  }
  return out;
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  let dopplerDisponivel = null;

  // ---- 1) Autocarro a 12 m/s para leste, GPS a 1 Hz com ruído; sem e com velocidade/rumo do GPS
  for (const [tema, doppler] of [['claro', false], ['escuro', false], ['claro', true]]) {
    const rot = `${tema}${doppler ? ', com Doppler' : ''}`;
    const { ctx, p, consola } = await novaPagina(browser, tema, 390, 780);
    const cdp = doppler ? await ctx.newCDPSession(p) : null;
    await p.goto(BASE + '/', { waitUntil: 'load' });
    await p.waitForTimeout(2500);
    await fixar(ctx, cdp, llDe(0, 0), 10, doppler ? 12 : undefined, doppler ? 90 : undefined);
    if (doppler) {
      const g = await lerGps(p);
      dopplerDisponivel = !!(g && g.s !== null && Number.isFinite(g.s));
      res.notas.push(`Chromium passa velocidade/rumo: ${dopplerDisponivel} ${JSON.stringify(g)}`);
      console.log(res.notas.at(-1));
      if (!dopplerDisponivel) { await ctx.close(); continue; }
    }
    await p.waitForSelector('.custom-user-marker-icon', { timeout: 15000 }).catch(() => {});
    ok(`[${rot}] o ponto da localização aparece no mapa`, (await p.locator('.custom-user-marker-icon').count()) === 1);
    await gravar(p);
    let x = 0, y = 0, bx = 0, by = 0;
    for (let i = 1; i <= 40; i++) {
      x += 12; // m
      bx = 0.9 * bx + 0.44 * 5 * gauss(); by = 0.9 * by + 0.44 * 5 * gauss();
      const salto = (i === 17 || i === 18) ? 70 : 0; // dois segundos de GPS a mentir
      const ll = llDe(x + bx + salto, y + by);
      await fixar(ctx, cdp, ll, 6 + Math.round(Math.abs(gauss()) * 5), doppler ? 12 + 0.3 * gauss() : undefined, doppler ? 90 : undefined);
      await p.waitForTimeout(1000);
    }
    const pts = await rastro(p);
    const mpp = await metrosPorPixel(p);
    res.notas.push(`[${rot}] fotogramas: ${pts.length}, m/px: ${mpp.toFixed(2)}`);
    // janelas de 0,25 s: o ponto "no mundo" nunca deve dar um salto grande (autocarro a 12 m/s = 3 m em 0,25 s)
    const j250 = janelas(pts, mpp, 250);
    const maxJanela = Math.max(...j250.map((w) => Math.hypot(w.dx, w.dy)));
    // marcha atrás: soma do recuo (para oeste) em janelas de 0,5 s
    const j500 = janelas(pts, mpp, 500).filter((_, k) => k % 30 === 0);
    const recuoTotal = j500.reduce((s, w) => s + Math.max(0, -w.dx), 0);
    const andou = Math.hypot(pts.at(-1).x - pts[0].x, pts.at(-1).y - pts[0].y) * mpp;
    const longe = pts.slice(Math.floor(pts.length * 0.3)).map((q) => Math.hypot(q.sx, q.sy));
    const maxLonge = Math.max(...longe);
    res.notas.push(`[${rot}] andou ${andou.toFixed(0)} m; maior deslocamento em 0,25 s ${maxJanela.toFixed(1)} m; recuo total ${recuoTotal.toFixed(1)} m; ponto longe do centro até ${maxLonge.toFixed(0)} px`);
    console.log(res.notas.at(-1));
    ok(`[${rot}] o ponto avança de forma contínua (< 6 m em 0,25 s; o autocarro faz 3 m)`, maxJanela < 6, maxJanela.toFixed(1));
    ok(`[${rot}] o ponto não anda para trás (recuo total < ${doppler ? 3 : 8} m)`, recuoTotal < (doppler ? 3 : 8), recuoTotal.toFixed(1));
    ok(`[${rot}] o ponto percorre o trajeto (±30%) em vez de ficar parado`, andou > 0.7 * 12 * 40 * 0.9 && andou < 1.3 * 12 * 40, andou.toFixed(0));
    ok(`[${rot}] o mapa segue o ponto (fica a menos de 40 px do centro)`, maxLonge < 40, maxLonge.toFixed(0));
    await p.screenshot({ path: `${SAIDA}/gps_${tema}${doppler ? '_doppler' : ''}_andar.png` });
    ok(`[${rot}] sem erros de consola`, consola.length === 0, consola.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ---- 2) Parado, com GPS a "tremer" (8 m): o ponto não deve andar à roda
  for (const doppler of [false, true]) {
    if (doppler && !dopplerDisponivel) continue;
    const rot = doppler ? 'parado, com Doppler' : 'parado';
    const { ctx, p, consola } = await novaPagina(browser, 'claro');
    const cdp = doppler ? await ctx.newCDPSession(p) : null;
    await p.goto(BASE + '/', { waitUntil: 'load' });
    await p.waitForTimeout(2500);
    await fixar(ctx, cdp, llDe(0, 0), 10, doppler ? 0 : undefined, undefined);
    await p.waitForSelector('.custom-user-marker-icon', { timeout: 15000 }).catch(() => {});
    await gravar(p);
    let bx = 0, by = 0;
    for (let i = 0; i < 30; i++) {
      bx = 0.85 * bx + 0.53 * 8 * gauss(); by = 0.85 * by + 0.53 * 8 * gauss();
      await fixar(ctx, cdp, llDe(bx, by), 9, doppler ? 0 : undefined, undefined);
      await p.waitForTimeout(1000);
    }
    const pts = (await rastro(p)).filter((q) => q.t > 0);
    const mpp = await metrosPorPixel(p);
    const dep = pts.slice(Math.floor(pts.length * 0.4)); // depois de assentar
    const mx = dep.reduce((s, q) => s + q.x, 0) / dep.length, my = dep.reduce((s, q) => s + q.y, 0) / dep.length;
    const disp = Math.sqrt(dep.reduce((s, q) => s + (q.x - mx) ** 2 + (q.y - my) ** 2, 0) / dep.length) * mpp;
    const lim = doppler ? 2.5 : 7;
    res.notas.push(`[${rot}] dispersão do ponto: ${disp.toFixed(2)} m (GPS cru ~11 m)`);
    console.log(res.notas.at(-1));
    ok(`[${rot}] o ponto fica quase quieto (dispersão < ${lim} m com GPS a variar ~11 m)`, disp < lim, disp.toFixed(2));
    ok(`[${rot}] sem erros de consola`, consola.length === 0, consola.slice(0, 2).join(' | '));
    await p.screenshot({ path: `${SAIDA}/gps_${doppler ? 'parado_doppler' : 'parado'}.png` });
    await ctx.close();
  }

  fs.writeFileSync(`${SAIDA}/resultado.json`, JSON.stringify(res, null, 1));
  const falhas = res.testes.filter((t) => !t.ok);
  console.log(`\n${res.testes.length - falhas.length}/${res.testes.length} testes OK`);
  await browser.close();
})();
