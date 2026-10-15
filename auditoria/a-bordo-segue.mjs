// Testa que, quando a pessoa está A BORDO de um autocarro, a bola do autocarro no mapa vai EM CIMA do ponto da sua localização, e não atrasada.
// O problema: o operador só envia a posição de 15 em 15 s (STCP de 30 em 30) e ela chega com 10 a 40 s de idade; a bola do autocarro seguia essa
// posição atrasada (uns 100 a 300 m para trás de um autocarro a 30 km/h) enquanto o ponto da pessoa, vindo do GPS, estava à frente.
// Mundo simulado: um autocarro (801) a andar a 8 m/s; a posição que o «operador» dá tem 12 a 22 s de idade; o GPS da pessoa vai no autocarro, em tempo real.
// Mede-se, no ecrã, a distância entre o centro da bola do autocarro «meu» e o centro do ponto da pessoa.
// Escala: com o painel «A bordo» aberto o mapa mostra a viagem inteira e 1 px ≈ 14 m (as paragens, a 350 m umas das outras, ficam a ~25 px).
// A app antiga (bola no sítio do operador) dá 12 a 16 px de distância = 170 a 230 m; em cima do ponto são 0 a 2 px.
// Os pedidos /api/transit/nearby, /veiculos e /a-bordo são simulados; o que se testa é a app. Não é num telemóvel a sério.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const res = { testes: [], notas: [] };
const ok = (nome, cond, extra = '') => { res.testes.push({ nome, ok: !!cond, extra: String(extra) }); console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const nota = (s) => { res.notas.push(s); console.log('NOTA   ', s); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const LAT0 = 41.1496, LON0 = -8.6109, M = 111320, COS = Math.cos(LAT0 * Math.PI / 180);
const ll = (x, y) => ({ lat: Math.round((LAT0 + y / M) * 1e5) / 1e5, lon: Math.round((LON0 + x / (M * COS)) * 1e5) / 1e5 });
const xDe = (lon) => (lon - LON0) * M * COS;
const SKEW_MS = 2500, VEL = 8;
const NOMES = ['Bolhão', 'Aliados', 'São Bento', 'Ribeira', 'Cais de Gaia', 'Jardim do Morro', 'Santo Ovídio', 'General Torres', 'Candal', 'Vila d’Este', 'Sandim', 'Lavadores'];
const PARAGENS = NOMES.map((nome, i) => ({ id: `P${i}`, nome, x: -600 + 350 * i }));
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gaussiana(r) { let u = 0; while (u === 0) u = r(); const v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

const mundo = { t0: null, xParado: 0 };
const xBus = (tRealMs) => (mundo.t0 === null ? mundo.xParado : mundo.xParado + Math.max(0, VEL * (tRealMs - mundo.t0) / 1000));
const veiculos = () => {
  const tm = Math.floor((Date.now() + SKEW_MS - 12000) / 10000) * 10000;     // medido há 12 a 22 s, em passos de 10 s
  const xa = xBus(tm - SKEW_MS), andar = mundo.t0 !== null && tm - SKEW_MS > mundo.t0;
  return [{ id: 'stcp:AAA', op: 'stcp', linha: '801', ...ll(xa, 4), ...(andar ? { rumo: 90, vel: 29 } : {}), t: tm / 1000, viagem: 'T801' }];
};
const hhmm = (ms) => new Date(ms).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });
function respostaABordo(completo) {
  const v = veiculos()[0];
  const xa = xDe(v.lon);
  let indice = PARAGENS.length - 1, naParagem = false, dist = 0;
  for (let i = 0; i < PARAGENS.length; i++) { const d = PARAGENS[i].x - xa; if (Math.abs(d) <= 25) { indice = i; naParagem = true; break; } if (d > 25) { indice = i; dist = d; break; } }
  const r = { veiculo: v, origem: 'viagem', linha: v.linha, cor: '#E4572E', destino: 'Lavadores', total: PARAGENS.length, indice, naParagem, distanciaProximaM: Math.round(dist), desvioM: 4, agora: Math.floor((Date.now() + SKEW_MS) / 1000) };
  if (completo) r.paragens = PARAGENS.map((p) => ({ id: p.id, nome: p.nome, ...ll(p.x, 0), hora: hhmm(Date.now() + ((p.x - xa) / VEL) * 1000) }));
  return r;
}
const dep = (extra) => ({ lineName: '', lineColor: '#E4572E', operatorName: 'STCP', operatorId: 'stcp', transportMode: 'Autocarro', ...extra });
const PARAGEM = {
  id: 'S1', name: 'Aliados', operatorId: 'stcp', operatorName: 'STCP', transportMode: 'Autocarro', latitude: LAT0 + 0.0003, longitude: LON0 + 0.0003,
  locality: 'Porto', district: 'Porto', distanceMeters: 40, formattedDistance: '40 m', walkingMinutes: 1,
  lines: [{ code: '801', name: '', color: '#E4572E', destination: '' }],
  nextDepartures: [dep({ lineCode: '801', destination: 'Lavadores', tripId: 'T801', routeId: 'R801', stopId: 'S1', departureTime: '4 min', displayText: '4 min', scheduledTime: '14:12', etaMinutes: 4, departureMinutes: 4, countdown_minutes: 4, isRealtime: true, state: 'TEMPO REAL', statusDescription: 'Em circulação ao vivo' })],
  activeAlerts: [],
};
// Velocidade e rumo do GPS (efeito Doppler, como num telemóvel a sério)
const DOPPLER = `(() => { const g = navigator.geolocation; if (!g) return; const w = g.watchPosition.bind(g), c = g.getCurrentPosition.bind(g);
  const mais = (cb) => (pos) => { const d = window.__dop; if (!d || typeof cb !== 'function') return cb(pos); const co = pos.coords;
    cb({ timestamp: pos.timestamp, coords: { latitude: co.latitude, longitude: co.longitude, accuracy: co.accuracy, altitude: co.altitude, altitudeAccuracy: co.altitudeAccuracy, speed: d.speed, heading: d.heading } }); };
  g.watchPosition = (ok, err, opt) => w(mais(ok), err, opt); g.getCurrentPosition = (ok, err, opt) => c(mais(ok), err, opt); })();`;

async function abrir(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', permissions: ['geolocation'],
    geolocation: { latitude: LAT0, longitude: LON0, accuracy: 10 }, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); localStorage.removeItem('parou_tema'); localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_localizacao_ok','1'); }catch(e){}` });
  await ctx.addInitScript({ content: DOPPLER });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (rt) => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route('**/api/transit/nearby**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stops: [PARAGEM], vehicles: [], alerts: [], radiusMeters: 500, timestamp: new Date().toISOString() }) }));
  await ctx.route('**/api/transit/stop/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ departures: [] }) }));
  await ctx.route('**/api/transit/veiculos**', (rt) => {
    const u = new URL(rt.request().url());
    const linhas = (u.searchParams.get('linhas') || '').split(',').filter(Boolean);
    const caixa = (u.searchParams.get('caixa') || '').split(',').map(Number);
    let lista = veiculos();
    if (caixa.length === 4 && caixa.every(Number.isFinite)) { const [s, w, n, e] = caixa; lista = lista.filter((v) => v.lat >= s && v.lat <= n && v.lon >= w && v.lon <= e); }
    if (linhas.length) lista = lista.filter((v) => linhas.includes(`${v.op}:${v.linha}`));
    return rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify({ veiculos: lista, agora: Math.floor((Date.now() + SKEW_MS) / 1000) }) });
  });
  await ctx.route('**/api/transit/a-bordo**', (rt) => {
    const u = new URL(rt.request().url());
    return rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(respostaABordo(u.searchParams.get('completo') === '1')) });
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|ERR_|net::/.test(m.text())) erros.push(m.text().slice(0, 240)); });
  p.on('pageerror', (e) => erros.push('PAGEERROR ' + String(e).slice(0, 240)));
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-teste="paragem-perto"]:visible', { timeout: 45000 });
  const fechar = p.locator('[data-teste="ponto-diario-fechar"]');
  if (await fechar.count()) await fechar.first().click({ timeout: 2000 }).catch(() => {});
  await p.waitForTimeout(500);
  return { ctx, p, erros };
}

async function fixar(ctx, p, lat, lon, acc, vel, rumo) {
  await p.evaluate((d) => { window.__dop = d; }, { speed: vel, heading: rumo });
  await ctx.setGeolocation({ latitude: lat, longitude: lon, accuracy: acc });
}

/** Distância (px, no ecrã) entre o centro da bola do autocarro «meu» e o centro do ponto da pessoa; null se não houver um dos dois */
const MEDIR = `(() => {
  const ponto = document.querySelector('.custom-user-marker-icon');
  const bola = document.querySelector('.bus-pin--meu .bus-pin__num');
  const qualquer = document.querySelector('.bus-pin__num');
  const c = (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  if (!ponto) return { erro: 'sem ponto da pessoa' };
  if (!bola) return { erro: 'sem bola «meu»', temBola: !!qualquer };
  const a = c(ponto), b = c(bola);
  return { px: Math.hypot(a[0] - b[0], a[1] - b[1]), dx: b[0] - a[0], dy: b[1] - a[1] };
})()`;
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const { ctx, p, erros } = await abrir(browser);
  const r = rng(11);
  let bx = 0, by = 0;
  /** Uma leitura de GPS da pessoa a bordo (com um erro de uns 2 m, como num telemóvel) */
  const gps = async (acc = 7) => {
    bx = 0.8 * bx + 0.6 * 2.5 * gaussiana(r); by = 0.8 * by + 0.6 * 2.5 * gaussiana(r);
    const pos = ll(xBus(Date.now()) + bx, 4 + by);
    await fixar(ctx, p, pos.lat, pos.lon, acc, mundo.t0 === null ? 0 : VEL, 90);
  };
  try {
    await p.waitForSelector('.bus-pin', { timeout: 30000 });
    for (let i = 0; i < 3; i++) { await gps(); await espera(1000); }
    // O autocarro arranca e a pessoa vai nele; passam-se uns segundos para o operador já ter dado posições em movimento
    mundo.t0 = Date.now();
    for (let i = 0; i < 28; i++) { await gps(); await espera(1000); }

    // Toca no autocarro (a bola que está no mapa) e diz que vai a bordo
    const caixa = await p.locator('.parou-bus-icone', { has: p.locator('.bus-pin__num', { hasText: '801' }) }).first().boundingBox();
    ok('[a bordo] o autocarro 801 está no mapa', !!caixa);
    await p.touchscreen.tap(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
    await p.waitForSelector('[data-teste="cartao-autocarro"]', { timeout: 8000 });
    await p.locator('[data-teste="estou-a-bordo"]').click({ timeout: 8000 });
    await p.waitForSelector('[data-teste="painel-a-bordo"]', { timeout: 10000 });
    for (let i = 0; i < 5; i++) { await gps(); await espera(1000); }
    ok('[a bordo] o autocarro fica marcado como «meu»', (await p.locator('.bus-pin--meu').count()) === 1);

    // Durante 20 s a andar: a bola do autocarro tem de estar em cima do ponto da pessoa
    const dist = [];
    let erro = null;
    for (let i = 0; i < 20; i++) {
      await gps();
      await espera(500);
      const m = await p.evaluate(MEDIR);
      if (m.erro) { erro = m.erro; continue; }
      dist.push(m.px);
      await espera(500);
    }
    await p.screenshot({ path: `${SAIDA}/a_bordo_segue.png` }).catch(() => {});
    nota(`distâncias medidas (px): ${dist.map((d) => Math.round(d)).join(' ')}`);
    ok('[a bordo] mediu-se a distância entre a bola e o ponto da pessoa', dist.length >= 15, erro || `${dist.length} medidas`);
    ok('[a bordo] a bola do autocarro está em cima do ponto da pessoa (mediana ≤ 3 px ≈ 40 m)', dist.length >= 15 && mediana(dist) <= 3, `mediana ${mediana(dist).toFixed(1)} px`);
    ok('[a bordo] e nunca se afasta mais de 6 px (≈ 85 m) — o atraso do operador era de 170 a 230 m', dist.length >= 15 && Math.max(...dist) <= 6, `máximo ${Math.max(...dist).toFixed(1)} px`);

    // Com o GPS fraco (±150 m) a bola não se agarra a uma posição má: volta à do operador (atrasada), nunca salta para um sítio duvidoso
    const fracas = [];
    for (let i = 0; i < 8; i++) { await gps(150); await espera(500); const m = await p.evaluate(MEDIR); if (!m.erro) fracas.push(m.px); await espera(500); }
    nota(`com GPS fraco (px): ${fracas.map((d) => Math.round(d)).join(' ')}`);
    ok('[GPS fraco] com precisão de 150 m a bola não segue o ponto (usa a posição do operador)', fracas.length >= 4 && mediana(fracas) > 8, `mediana ${mediana(fracas).toFixed(1)} px`);
    // O GPS volta ao normal: volta a seguir
    for (let i = 0; i < 6; i++) { await gps(); await espera(1000); }
    const depois = [];
    for (let i = 0; i < 6; i++) { await gps(); await espera(500); const m = await p.evaluate(MEDIR); if (!m.erro) depois.push(m.px); await espera(500); }
    ok('[GPS fraco] quando o GPS volta ao normal a bola volta a seguir a pessoa', depois.length >= 4 && mediana(depois) <= 3, `mediana ${mediana(depois).toFixed(1)} px`);

    // Já saí: a bola deixa de seguir a pessoa (já não vai lá dentro) e fica na posição do operador
    await p.locator('[data-teste="a-bordo-sair"]').click();
    await p.waitForTimeout(500);
    for (let i = 0; i < 6; i++) { await gps(); await espera(1000); }
    const bolaSaiu = await p.evaluate(() => {
      const ponto = document.querySelector('.custom-user-marker-icon'); const bola = [...document.querySelectorAll('.bus-pin__num')].find((n) => n.textContent.trim() === '801');
      if (!ponto || !bola) return null;
      const a = ponto.getBoundingClientRect(), b = bola.getBoundingClientRect();
      return Math.hypot(a.left + a.width / 2 - (b.left + b.width / 2), a.top + a.height / 2 - (b.top + b.height / 2));
    });
    ok('[já saí] depois de «Já saí» a bola volta à posição do operador (já não está em cima de mim)', bolaSaiu !== null && bolaSaiu > 8, bolaSaiu === null ? 'sem bola' : `${bolaSaiu.toFixed(1)} px`);
    ok('[tudo] sem erros de consola', erros.length === 0, erros.slice(0, 2).join(' | '));
  } catch (e) {
    ok('[a bordo] correu sem exceções', false, String(e).slice(0, 300));
    await p.screenshot({ path: `${SAIDA}/a_bordo_segue_erro.png` }).catch(() => {});
  }
  await ctx.close();
  fs.writeFileSync(`${SAIDA}/a-bordo-segue.json`, JSON.stringify(res, null, 1));
  const falhas = res.testes.filter((t) => !t.ok);
  console.log(`\n${res.testes.length - falhas.length}/${res.testes.length} testes OK`);
  for (const f of falhas) console.log('  FALHOU:', f.nome, '-', f.extra);
  await browser.close();
  process.exit(falhas.length ? 1 : 0);
})();
