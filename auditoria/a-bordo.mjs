// Testa os autocarros em direto no mapa e o «A bordo» (Chromium e WebKit), com um mundo simulado:
//  - um autocarro (801) que arranca ao mesmo tempo que o GPS da pessoa, outro (803) a 300 m em paralelo e um da Carris Metropolitana parado longe;
//  - o servidor responde com a posição medida há ~12 s (atrasada, em passos de 10 s) e com o relógio 2,5 s adiantado;
//  - a pessoa vai no 801: a app tem de perguntar «Estás no autocarro 801?» (e não no 803), mostrar o painel, avançar de paragem e sair;
//  - a pé (1,4 m/s) nunca pergunta nem sequer pede os autocarros da zona; «Não» não volta a perguntar pelo mesmo autocarro;
//  - tocar num autocarro no mapa → «Estou a bordo» → painel, nos 4 temas e em 320, 390 e 1280 px (sem scroll lateral, alvos ≥ 44 px, contraste).
// Os pedidos /api/transit/nearby, /veiculos e /a-bordo são simulados; o que se testa é a app.
import { chromium, webkit, devices } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
const RAPIDO = process.env.RAPIDO === '1'; // só a matriz de temas (sem as simulações de 2 minutos)
fs.mkdirSync(SAIDA, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const res = { testes: [], notas: [] };
const ok = (nome, cond, extra = '') => { res.testes.push({ nome, ok: !!cond, extra: String(extra) }); console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const nota = (s) => { res.notas.push(s); console.log('NOTA   ', s); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------------------------- mundo simulado
const LAT0 = 41.1496, LON0 = -8.6109, M = 111320, COS = Math.cos(LAT0 * Math.PI / 180);
const ll = (x, y) => ({ lat: Math.round((LAT0 + y / M) * 1e5) / 1e5, lon: Math.round((LON0 + x / (M * COS)) * 1e5) / 1e5 });
const xDe = (lon) => (lon - LON0) * M * COS;
const SKEW_MS = 2500; // o relógio do servidor está adiantado em relação ao do telemóvel
const VEL = 8; // m/s do autocarro (≈ 29 km/h)
const NOMES = ['Bolhão', 'Aliados', 'São Bento', 'Ribeira', 'Cais de Gaia', 'Jardim do Morro', 'Santo Ovídio', 'General Torres', 'Candal', 'Vila d’Este', 'Sandim', 'Lavadores'];
const PARAGENS = NOMES.map((nome, i) => ({ id: `P${i}`, nome, x: -600 + 350 * i }));

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gaussiana(r) { let u = 0; while (u === 0) u = r(); const v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/** Mundo de uma simulação. `t0`: instante (relógio do telemóvel, ms) em que o autocarro arranca; antes disso está parado em `xParado`. */
function criarMundo({ xParado = 0 } = {}) {
  const m = { t0: null, pedidosDetecao: 0, pedidosMapa: 0, pedidosABordo: 0, aBordoFalha: false };
  const servidor = () => Date.now() + SKEW_MS;
  const xBus = (tRealMs) => (m.t0 === null ? xParado : xParado + Math.max(0, VEL * (tRealMs - m.t0) / 1000));
  /** Posição do autocarro A à hora real `tRealMs` (a que a pessoa também vai) */
  m.xUtilizador = (tRealMs) => xBus(tRealMs);
  m.veiculos = () => {
    const tm = Math.floor((servidor() - 12000) / 10000) * 10000; // medido há 12 a 22 s, em passos de 10 s
    const tReal = tm - SKEW_MS;
    const xa = xBus(tReal);
    const andar = m.t0 !== null && tReal > m.t0;
    return [
      { id: 'stcp:AAA', op: 'stcp', linha: '801', ...ll(xa, 4), ...(andar ? { rumo: 90, vel: 29 } : {}), t: tm / 1000, viagem: 'T801' },
      { id: 'stcp:BBB', op: 'stcp', linha: '803', ...ll(xa + 40, 300), ...(andar ? { rumo: 90, vel: 29 } : {}), t: tm / 1000 },
      { id: 'cm:CCC', op: 'cm', linha: '4436', ...ll(2200, -150), t: tm / 1000 },
    ];
  };
  return m;
}

const dep = (extra) => ({ lineName: '', lineColor: '#E4572E', operatorName: 'STCP', operatorId: 'stcp', transportMode: 'Autocarro', ...extra });
const DEPS = [
  dep({ lineCode: '801', destination: 'Lavadores', tripId: 'T801', routeId: 'R801', stopId: 'S1', departureTime: '4 min', displayText: '4 min', scheduledTime: '14:12', etaMinutes: 4, departureMinutes: 4, countdown_minutes: 4, isRealtime: true, state: 'TEMPO REAL', statusDescription: 'Em circulação ao vivo' }),
  dep({ lineCode: '803', destination: 'Sandim', routeId: 'R803', stopId: 'S1', departureTime: '14:35 · Programado', displayText: '14:35 · Programado', scheduledTime: '14:35', etaMinutes: 23, departureMinutes: 23, countdown_minutes: 23, isRealtime: false, state: 'PROGRAMADO', statusDescription: 'Horário oficial programado' }),
];
const PARAGEM = {
  id: 'S1', name: 'Aliados', operatorId: 'stcp', operatorName: 'STCP', transportMode: 'Autocarro', latitude: LAT0 + 0.0003, longitude: LON0 + 0.0003,
  locality: 'Porto', district: 'Porto', distanceMeters: 40, formattedDistance: '40 m', walkingMinutes: 1,
  lines: [{ code: '801', name: '', color: '#E4572E', destination: '' }, { code: '803', name: '', color: '#E4572E', destination: '' }],
  nextDepartures: DEPS, activeAlerts: [],
};

const hhmm = (ms) => new Date(ms).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });

function respostaABordo(mundo, id, completo) {
  const v = mundo.veiculos().find((x) => x.id === id);
  if (!v) return null;
  const xa = xDe(v.lon);
  let indice = PARAGENS.length - 1, naParagem = false, dist = 0;
  for (let i = 0; i < PARAGENS.length; i++) {
    const d = PARAGENS[i].x - xa;
    if (Math.abs(d) <= 25) { indice = i; naParagem = true; dist = 0; break; }
    if (d > 25) { indice = i; dist = d; break; }
  }
  const base = Date.now();
  const r = {
    veiculo: v, origem: 'viagem', linha: v.linha, cor: '#E4572E', destino: 'Lavadores', total: PARAGENS.length,
    indice, naParagem, distanciaProximaM: Math.round(dist), desvioM: 4, agora: Math.floor((Date.now() + SKEW_MS) / 1000),
  };
  if (completo) r.paragens = PARAGENS.map((p) => ({ id: p.id, nome: p.nome, ...ll(p.x, 0), hora: hhmm(base + ((p.x - xa) / VEL) * 1000) }));
  return r;
}

// Velocidade e rumo do GPS (efeito Doppler, como num telemóvel a sério), acrescentados à leitura do Chromium
const DOPPLER = `(() => { const g = navigator.geolocation; if (!g) return; const w = g.watchPosition.bind(g), c = g.getCurrentPosition.bind(g);
  const mais = (cb) => (pos) => { const d = window.__dop; if (!d || typeof cb !== 'function') return cb(pos); const co = pos.coords;
    cb({ timestamp: pos.timestamp, coords: { latitude: co.latitude, longitude: co.longitude, accuracy: co.accuracy, altitude: co.altitude, altitudeAccuracy: co.altitudeAccuracy, speed: d.speed, heading: d.heading } }); };
  g.watchPosition = (ok, err, opt) => w(mais(ok), err, opt); g.getCurrentPosition = (ok, err, opt) => c(mais(ok), err, opt); })();`;

async function abrir(browser, { tema = 'claro', largura = 390, altura = 780, aparelho = null, mundo }) {
  const base = aparelho ? devices[aparelho] : { viewport: { width: largura, height: altura }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' };
  const ctx = await browser.newContext({
    ...base, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', permissions: ['geolocation'], geolocation: { latitude: LAT0, longitude: LON0, accuracy: 10 },
    serviceWorkers: 'block', // o Playwright não intercepta pedidos que passam pelo service worker
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); localStorage.setItem('parou_tema','${tema}'); localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_localizacao_ok','1'); }catch(e){}` });
  await ctx.addInitScript({ content: DOPPLER });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (rt) => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route('**/api/transit/nearby**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stops: [PARAGEM], vehicles: [], alerts: [], radiusMeters: 500, timestamp: new Date().toISOString() }) }));
  await ctx.route('**/api/transit/stop/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ departures: [] }) }));
  await ctx.route('**/api/transit/veiculos**', (rt) => {
    const u = new URL(rt.request().url());
    const linhas = (u.searchParams.get('linhas') || '').split(',').filter(Boolean);
    if (linhas.length) mundo.pedidosMapa += 1; else mundo.pedidosDetecao += 1;
    const caixa = (u.searchParams.get('caixa') || '').split(',').map(Number);
    let lista = mundo.veiculos();
    if (caixa.length === 4 && caixa.every(Number.isFinite)) {
      const [s, w, n, e] = caixa;
      lista = lista.filter((v) => v.lat >= s && v.lat <= n && v.lon >= w && v.lon <= e);
    }
    if (linhas.length) lista = lista.filter((v) => linhas.includes(`${v.op}:${v.linha}`));
    return rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify({ veiculos: lista, agora: Math.floor((Date.now() + SKEW_MS) / 1000) }) });
  });
  await ctx.route('**/api/transit/a-bordo**', (rt) => {
    mundo.pedidosABordo += 1;
    const u = new URL(rt.request().url());
    const r = mundo.aBordoFalha ? null : respostaABordo(mundo, u.searchParams.get('veiculo'), u.searchParams.get('completo') === '1');
    if (!r) return rt.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Sem sinal deste autocarro.' }) });
    return rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(r) });
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

/** Contraste de todos os textos dentro de `seletor` (cor do texto contra o fundo que o rodeia) */
const contrasteDe = (p, seletor) => p.evaluate((sel) => {
  const raizes = [...document.querySelectorAll(sel)];
  const analisar = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return [r, g, b, a]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const mistura = (topo, fundo) => { const a = topo[3]; return [topo[0] * a + fundo[0] * (1 - a), topo[1] * a + fundo[1] * (1 - a), topo[2] * a + fundo[2] * (1 - a), 1]; };
  const fundoDe = (el) => {
    const camadas = [];
    for (let e = el; e; e = e.parentElement) {
      const c = analisar(getComputedStyle(e).backgroundColor);
      if (c && c[3] > 0) { camadas.push(c); if (c[3] >= 1) break; }
    }
    let f = [255, 255, 255, 1];
    for (let i = camadas.length - 1; i >= 0; i--) f = mistura(camadas[i], f);
    return f;
  };
  let pior = { r: 99, txt: '', cor: '', fundo: '' }; let n = 0;
  for (const raiz of raizes) {
    const els = [raiz, ...raiz.querySelectorAll('*')];
    for (const el of els) {
      const proprio = [...el.childNodes].filter((x) => x.nodeType === 3 && x.textContent.trim()).map((x) => x.textContent.trim()).join(' ');
      if (!proprio) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
      const fundo = fundoDe(el);
      let cor = analisar(cs.color); if (!cor) continue;
      cor = mistura([cor[0], cor[1], cor[2], cor[3] * op], fundo);
      const L1 = lum(cor), L2 = lum(fundo);
      const r = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const px = parseFloat(cs.fontSize), negrito = Number(cs.fontWeight) >= 700;
      const minimo = px >= 24 || (px >= 18.66 && negrito) ? 3 : 4.5;
      const folga = r / minimo; // < 1 = falha
      n += 1;
      if (folga < pior.r) pior = { r: folga, razao: r, txt: proprio.slice(0, 40), cor: cs.color, fundo: `rgb(${fundo.slice(0, 3).map(Math.round)})`, px };
    }
  }
  return { n, pior };
}, seletor);

const semScrollLateral = (p) => p.evaluate(() => {
  const w = window.innerWidth;
  return { ok: document.documentElement.scrollWidth <= w + 1 && document.body.scrollWidth <= w + 1, sw: document.documentElement.scrollWidth, w };
});

const alturaMinimaBotoes = (p, seletor) => p.evaluate((sel) => {
  const falhas = [];
  for (const raiz of document.querySelectorAll(sel)) {
    for (const b of raiz.querySelectorAll('button, a[href], [role="button"]')) {
      const r = b.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      // Só conta o que se vê (dentro do ecrã ou da lista deslizante)
      if (r.height < 43.5 || r.width < 43.5) falhas.push(`${(b.textContent || b.getAttribute('aria-label') || '?').trim().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  return falhas;
}, seletor);

// ---------------------------------------------------------------------------------------------------------------- 0) servidor real
async function testarServidor() {
  const j = async (u) => { const r = await fetch(BASE + u); let corpo = null; try { corpo = await r.json(); } catch {} return { status: r.status, corpo, cache: r.headers.get('cache-control') }; };
  const a = await j('/api/transit/veiculos');
  ok('servidor: /veiculos sem filtro → 400', a.status === 400, a.status);
  const b = await j('/api/transit/veiculos?caixa=41.14,-8.62,41.16,-8.60');
  ok('servidor: /veiculos com caixa → 200 e lista', b.status === 200 && Array.isArray(b.corpo?.veiculos) && Number.isFinite(b.corpo?.agora), `${b.status} ${b.corpo?.veiculos?.length} veículos`);
  ok('servidor: /veiculos não vai para cache', /no-store/.test(b.cache || ''), b.cache);
  const c = await j('/api/transit/veiculos?caixa=30,-20,50,10');
  ok('servidor: caixa gigante → 400', c.status === 400, c.status);
  const d = await j('/api/transit/veiculos?linhas=' + encodeURIComponent('STCP:801,CM:4436,LIXO;DROP'));
  ok('servidor: /veiculos com linhas → 200', d.status === 200 && Array.isArray(d.corpo?.veiculos), d.status);
  const e = await j('/api/transit/a-bordo?veiculo=stcp:NAOEXISTE');
  ok('servidor: /a-bordo de um autocarro desconhecido → 404', e.status === 404, e.status);
  const f = await j('/api/transit/a-bordo');
  ok('servidor: /a-bordo sem veículo → 400 ou 404', f.status === 400 || f.status === 404, f.status);
  for (const v of (b.corpo?.veiculos || []).slice(0, 3)) {
    ok(`servidor: veículo ${v.id} só traz o necessário (sem campos a mais)`, Object.keys(v).every((k) => ['id', 'op', 'linha', 'lat', 'lon', 'rumo', 'vel', 't', 'viagem'].includes(k)), Object.keys(v).join(','));
  }
  // As partidas reais das paragens perto dão chaves de linha ("stcp:803", "cm:4436") que batem com os autocarros em direto?
  const chaveTeste = (d, paragem) => {
    const pre = String(d.routeId || '').toLowerCase();
    const nome = (x) => String(x || '').toLowerCase();
    const op = pre.startsWith('stcp:') ? 'stcp' : (pre.startsWith('cm:') || pre.startsWith('cmh:')) ? 'cm'
      : nome(d.operatorId || paragem.operatorId).includes('stcp') ? 'stcp' : /carris metropolitana/.test(nome(d.operatorId || paragem.operatorId)) ? 'cm'
      : nome(d.operatorName || paragem.operatorName).includes('stcp') ? 'stcp' : /carris metropolitana/.test(nome(d.operatorName || paragem.operatorName)) ? 'cm' : null;
    const linha = String(d.lineCode || '').replace(/\[[^\]]*\]/g, '').trim().toUpperCase();
    return op && linha ? `${op}:${linha}` : null;
  };
  for (const [zona, lat, lon] of [['Porto (STCP)', 41.1496, -8.6109], ['Amadora (Carris Metropolitana)', 38.754, -9.23], ['Sintra (Carris Metropolitana)', 38.797, -9.388]]) {
    const n = await j(`/api/transit/nearby?lat=${lat}&lon=${lon}&radius=700`);
    const paragens = (n.corpo?.stops || []).slice(0, 6);
    const chaves = new Set(); const semChave = new Set(); const operadores = new Set();
    for (const s of paragens) for (const d of s.nextDepartures || []) {
      operadores.add(`${d.operatorId || s.operatorId}/${d.operatorName || s.operatorName}`);
      const k = chaveTeste(d, s);
      if (k) chaves.add(k); else semChave.add(`${d.operatorId || s.operatorId}|${d.operatorName || s.operatorName}|${String(d.routeId || '').slice(0, 8)}`);
    }
    const v = await j(`/api/transit/veiculos?linhas=${encodeURIComponent([...chaves].join(','))}&caixa=${(lat - 0.008).toFixed(4)},${(lon - 0.011).toFixed(4)},${(lat + 0.008).toFixed(4)},${(lon + 0.011).toFixed(4)}`);
    nota(`reais ${zona}: ${paragens.length} paragens; operadores ${[...operadores].slice(0, 4).join(' ; ') || '-'}; ${chaves.size} linhas com chave (${[...chaves].slice(0, 8).join(', ')}); sem chave: ${[...semChave].slice(0, 4).join(' ; ') || '-'}; autocarros em direto nessas linhas e zona: ${v.corpo?.veiculos?.length ?? '-'} (${(v.corpo?.veiculos || []).slice(0, 5).map((x) => `${x.op}:${x.linha}`).join(', ')})`);
  }
  // Com um autocarro real, se houver
  const primeiro = (b.corpo?.veiculos || [])[0];
  if (primeiro) {
    const g = await j('/api/transit/a-bordo?completo=1&veiculo=' + encodeURIComponent(primeiro.id));
    nota(`servidor: /a-bordo de ${primeiro.id} (linha ${primeiro.linha}) → ${g.status}; paragens ${g.corpo?.paragens?.length ?? '-'}; origem ${g.corpo?.origem ?? '-'}; índice ${g.corpo?.indice ?? '-'}`);
    ok('servidor: /a-bordo de um autocarro real responde 200 ou 404 (sem erro 500)', g.status === 200 || g.status === 404, g.status);
  } else nota('servidor: sem autocarros reais na caixa de teste (fora de horas ou sem rede); /a-bordo real não testado');
}

// ---------------------------------------------------------------------------------------------------------------- 1) a viajar no 801
async function viajar({ browser, tema, ficha, completo }) {
  const rot = `[viagem ${tema}]`;
  const mundo = criarMundo();
  const { ctx, p, erros } = await abrir(browser, { tema, mundo });
  const r = rng(7);
  const foto = (s) => p.screenshot({ path: `${SAIDA}/viagem_${tema}_${s}.png` }).catch(() => {});
  try {
    // Autocarros no mapa (antes de andar)
    await p.waitForSelector('.bus-pin', { timeout: 30000 }).catch(() => {});
    const pinos = await p.locator('.bus-pin__num').allInnerTexts();
    ok(`${rot} o mapa mostra os autocarros das linhas da paragem (801 e 803)`, pinos.includes('801') && pinos.includes('803'), pinos.join(','));
    ok(`${rot} não mostra autocarros de linhas que não são desta zona (4436 é de outra zona)`, !pinos.includes('4436'), pinos.join(','));
    await foto('0_parado');

    // 4 s parado
    for (let i = 0; i < 4; i++) { await fixar(ctx, p, LAT0, LON0, 8, 0, null); await espera(1000); }
    ok(`${rot} parado não pergunta`, (await p.locator('[data-teste="pergunta-a-bordo"]').count()) === 0);
    mundo.t0 = Date.now();
    const inicio = Date.now();
    let visto = null;
    let bx = 0, by = 0;
    while (Date.now() - inicio < 150000) {
      const x = mundo.xUtilizador(Date.now());
      bx = 0.8 * bx + 0.6 * 2.5 * gaussiana(r); by = 0.8 * by + 0.6 * 2.5 * gaussiana(r);
      const pos = ll(x + bx, 4 + by);
      await fixar(ctx, p, pos.lat, pos.lon, 6 + Math.round(Math.abs(gaussiana(r)) * 4), VEL, 90);
      if (await p.locator('[data-teste="pergunta-a-bordo"]').isVisible().catch(() => false)) { visto = (Date.now() - inicio) / 1000; break; }
      await espera(1000);
    }
    ok(`${rot} a app pergunta se vai a bordo (em menos de 2 min e meio)`, visto !== null, visto === null ? 'nunca perguntou' : `${visto.toFixed(0)} s depois de arrancar`);
    if (visto === null) { await foto('1_sem_pergunta'); ok(`${rot} sem erros de consola`, erros.length === 0, erros.slice(0, 2).join(' | ')); return; }
    nota(`${rot} perguntou ao fim de ${visto.toFixed(0)} s (${mundo.pedidosDetecao} pedidos de deteção)`);
    const texto = await p.locator('[data-teste="pergunta-a-bordo"]').innerText();
    ok(`${rot} pergunta pelo 801`, /801/.test(texto), texto.replace(/\n/g, ' | '));
    ok(`${rot} não pergunta pelo 803 (vai a 300 m, noutra rua)`, !/803/.test(texto));
    ok(`${rot} só uma pergunta (os dois autocarros não estão lado a lado)`, (await p.locator('[data-teste="a-bordo-sim"]').count()) === 1);
    await espera(400);
    await foto('1_pergunta');
    const alturas = await alturaMinimaBotoes(p, '[data-teste="pergunta-a-bordo"]');
    ok(`${rot} botões da pergunta com 44 px ou mais`, alturas.length === 0, alturas.join('; '));
    const cPergunta = await contrasteDe(p, '[data-teste="pergunta-a-bordo"]');
    ok(`${rot} contraste da pergunta ≥ 4,5:1 (3:1 em texto grande)`, cPergunta.pior.r >= 1, `${cPergunta.n} textos; pior «${cPergunta.pior.txt}» ${cPergunta.pior.razao?.toFixed(2)}:1 ${cPergunta.pior.cor} sobre ${cPergunta.pior.fundo}`);
    const lateral1 = await semScrollLateral(p);
    ok(`${rot} sem scroll lateral com a pergunta`, lateral1.ok, `${lateral1.sw} de ${lateral1.w}`);

    // Sim
    await p.locator('[data-teste="a-bordo-sim"]').first().click();
    await p.waitForSelector('[data-teste="painel-a-bordo"]', { timeout: 10000 });
    await p.waitForSelector('[data-teste="a-bordo-proxima"]', { timeout: 15000 }).catch(() => {});
    ok(`${rot} depois de «Sim», mostra o painel «A bordo»`, await p.locator('[data-teste="painel-a-bordo"]').isVisible());
    ok(`${rot} a pergunta desaparece`, (await p.locator('[data-teste="pergunta-a-bordo"]').count()) === 0);
    const proxima = await p.locator('[data-teste="a-bordo-proxima"]').innerText().catch(() => '');
    ok(`${rot} mostra a próxima paragem com a distância em metros`, /(Aliados|São Bento|Bolh)/i.test(proxima) && /\d+ ?m\b/.test(proxima), proxima.replace(/\n/g, ' | '));
    ok(`${rot} mostra o horário da paragem, identificado como «horário» (não inventa tempo real)`, /horário \d\d:\d\d/.test(proxima), proxima.replace(/\n/g, ' | '));
    const linhasLista = await p.locator('[data-teste="a-bordo-paragens"] ol li').count();
    ok(`${rot} lista as paragens que faltam`, linhasLista >= 8, linhasLista);
    await p.waitForTimeout(1500);
    const tracos = await p.evaluate(() => document.querySelectorAll('.leaflet-overlay-pane path').length);
    ok(`${rot} o percurso fica desenhado no mapa`, tracos >= 2, tracos);
    const pinosABordo = await p.locator('.bus-pin__num').allInnerTexts();
    ok(`${rot} a bordo, o mapa só mostra autocarros da linha 801`, pinosABordo.length > 0 && pinosABordo.every((x) => x === '801'), pinosABordo.join(','));
    await foto('2_painel');
    const alturasPainel = await alturaMinimaBotoes(p, '[data-teste="painel-a-bordo"]');
    ok(`${rot} botões do painel com 44 px ou mais`, alturasPainel.length === 0, alturasPainel.slice(0, 4).join('; '));
    const cPainel = await contrasteDe(p, '[data-teste="painel-a-bordo"]');
    ok(`${rot} contraste do painel ≥ 4,5:1 (3:1 em texto grande)`, cPainel.pior.r >= 1, `${cPainel.n} textos; pior «${cPainel.pior.txt}» ${cPainel.pior.razao?.toFixed(2)}:1 ${cPainel.pior.cor} sobre ${cPainel.pior.fundo}`);
    const lateral2 = await semScrollLateral(p);
    ok(`${rot} sem scroll lateral com o painel`, lateral2.ok, `${lateral2.sw} de ${lateral2.w}`);

    if (completo) {
      // Continua a andar: a próxima paragem muda
      const antes = (await p.locator('[data-teste="a-bordo-proxima"] .font-condensada').first().innerText().catch(() => '')).trim();
      const t1 = Date.now();
      let depois = antes;
      while (Date.now() - t1 < 90000) {
        const x = mundo.xUtilizador(Date.now());
        const pos = ll(x, 4);
        await fixar(ctx, p, pos.lat, pos.lon, 7, VEL, 90);
        depois = (await p.locator('[data-teste="a-bordo-proxima"] .font-condensada').first().innerText().catch(() => '')).trim();
        if (depois && depois !== antes) break;
        await espera(1000);
      }
      ok(`${rot} a próxima paragem avança sozinha (de «${antes}» para «${depois}»)`, depois && depois !== antes, `${((Date.now() - t1) / 1000).toFixed(0)} s`);
      ok(`${rot} as paragens passadas ficam recolhidas («N paragem já passada»)`, /já passada/i.test(await p.locator('[data-teste="painel-a-bordo"]').innerText()));
      await foto('3_depois');

      // Sem sinal do autocarro
      mundo.aBordoFalha = true;
      for (let i = 0; i < 12; i++) { const pos = ll(mundo.xUtilizador(Date.now()), 4); await fixar(ctx, p, pos.lat, pos.lon, 7, VEL, 90); await espera(1000); }
      const semSinal = await p.locator('[data-teste="painel-a-bordo"]').innerText();
      ok(`${rot} sem sinal: avisa e mostra a última posição`, /Sem sinal do autocarro/i.test(semSinal), semSinal.replace(/\n/g, ' | ').slice(0, 120));
      await foto('4_sem_sinal');
      mundo.aBordoFalha = false;
      for (let i = 0; i < 10; i++) { const pos = ll(mundo.xUtilizador(Date.now()), 4); await fixar(ctx, p, pos.lat, pos.lon, 7, VEL, 90); await espera(1000); }
      ok(`${rot} o sinal volta e o aviso desaparece`, !/Sem sinal do autocarro/i.test(await p.locator('[data-teste="painel-a-bordo"]').innerText()));

      // Já saí
      await p.locator('[data-teste="a-bordo-sair"]').click();
      await p.waitForTimeout(500);
      ok(`${rot} «Já saí» fecha o painel`, (await p.locator('[data-teste="painel-a-bordo"]').count()) === 0);
      let perguntouOutraVez = false;
      for (let i = 0; i < 45; i++) {
        const pos = ll(mundo.xUtilizador(Date.now()), 4);
        await fixar(ctx, p, pos.lat, pos.lon, 7, VEL, 90);
        if (await p.locator('[data-teste="pergunta-a-bordo"]').isVisible().catch(() => false)) { perguntouOutraVez = true; break; }
        await espera(1000);
      }
      ok(`${rot} depois de «Já saí» não volta a perguntar pelo mesmo autocarro`, !perguntouOutraVez);
    }
    ok(`${rot} sem erros de consola`, erros.length === 0, erros.slice(0, 2).join(' | '));
  } catch (e) {
    ok(`${rot} correu sem exceções`, false, String(e).slice(0, 300));
    await foto('erro');
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------------------------------------------- 2) a pé
async function aPe(browser) {
  const rot = '[a pé]';
  const mundo = criarMundo();
  const { ctx, p, erros } = await abrir(browser, { tema: 'claro', mundo });
  const r = rng(11);
  try {
    mundo.t0 = Date.now(); // o autocarro anda ao lado, mas a pessoa vai a pé
    const inicio = Date.now();
    let perguntou = false;
    let bx = 0, by = 0;
    while (Date.now() - inicio < 80000) {
      const x = 1.4 * (Date.now() - inicio) / 1000;
      bx = 0.8 * bx + 0.6 * 2.5 * gaussiana(r); by = 0.8 * by + 0.6 * 2.5 * gaussiana(r);
      const pos = ll(x + bx, 4 + by);
      await fixar(ctx, p, pos.lat, pos.lon, 8, 1.4, 90);
      if (await p.locator('[data-teste="pergunta-a-bordo"]').isVisible().catch(() => false)) { perguntou = true; break; }
      await espera(1000);
    }
    ok(`${rot} a andar a pé ao lado de um autocarro não pergunta nada`, !perguntou);
    ok(`${rot} a pé não pede ao servidor os autocarros da zona (0 pedidos de deteção)`, mundo.pedidosDetecao === 0, mundo.pedidosDetecao);
    await p.screenshot({ path: `${SAIDA}/a_pe.png` }).catch(() => {});
    ok(`${rot} sem erros de consola`, erros.length === 0, erros.slice(0, 2).join(' | '));
  } catch (e) { ok(`${rot} correu sem exceções`, false, String(e).slice(0, 300)); } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------------------------------------------- 3) «Não»
async function recusar(browser) {
  const rot = '[recusar]';
  const mundo = criarMundo();
  const { ctx, p, erros } = await abrir(browser, { tema: 'claro', mundo });
  const r = rng(5);
  try {
    mundo.t0 = Date.now();
    const inicio = Date.now();
    let visto = false;
    while (Date.now() - inicio < 150000) {
      const pos = ll(mundo.xUtilizador(Date.now()), 4 + 2 * gaussiana(r));
      await fixar(ctx, p, pos.lat, pos.lon, 8, VEL, 90);
      if (await p.locator('[data-teste="pergunta-a-bordo"]').isVisible().catch(() => false)) { visto = true; break; }
      await espera(1000);
    }
    ok(`${rot} perguntou`, visto);
    if (!visto) return;
    await p.locator('[data-teste="a-bordo-nao"]').click();
    await p.waitForTimeout(400);
    ok(`${rot} «Não» fecha a pergunta`, (await p.locator('[data-teste="pergunta-a-bordo"]').count()) === 0);
    ok(`${rot} «Não» não abre o painel`, (await p.locator('[data-teste="painel-a-bordo"]').count()) === 0);
    let voltou = false;
    const t1 = Date.now();
    while (Date.now() - t1 < 50000) {
      const pos = ll(mundo.xUtilizador(Date.now()), 4);
      await fixar(ctx, p, pos.lat, pos.lon, 8, VEL, 90);
      if (await p.locator('[data-teste="pergunta-a-bordo"]').isVisible().catch(() => false)) { voltou = true; break; }
      await espera(1000);
    }
    ok(`${rot} depois de «Não» não volta a perguntar pelo mesmo autocarro`, !voltou);
    ok(`${rot} sem erros de consola`, erros.length === 0, erros.slice(0, 2).join(' | '));
  } catch (e) { ok(`${rot} correu sem exceções`, false, String(e).slice(0, 300)); } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------------------------------------------- 4) «Não perguntar mais»
async function desligar(browser) {
  const rot = '[desligar]';
  const mundo = criarMundo();
  const { ctx, p, erros } = await abrir(browser, { tema: 'claro', mundo });
  const r = rng(3);
  try {
    mundo.t0 = Date.now();
    const inicio = Date.now();
    let visto = false;
    while (Date.now() - inicio < 150000) {
      const pos = ll(mundo.xUtilizador(Date.now()), 4 + 2 * gaussiana(r));
      await fixar(ctx, p, pos.lat, pos.lon, 8, VEL, 90);
      if (await p.locator('[data-teste="pergunta-a-bordo"]').isVisible().catch(() => false)) { visto = true; break; }
      await espera(1000);
    }
    ok(`${rot} perguntou`, visto);
    if (!visto) return;
    await p.locator('[data-teste="a-bordo-desligar"]').click();
    await p.waitForTimeout(400);
    ok(`${rot} «Não perguntar mais» fecha a pergunta`, (await p.locator('[data-teste="pergunta-a-bordo"]').count()) === 0);
    const guardado = await p.evaluate(() => { try { return localStorage.getItem('parou_abordo_desligado'); } catch { return 'erro'; } });
    ok(`${rot} a escolha fica guardada no telemóvel`, guardado === '1', guardado);
    const antes = mundo.pedidosDetecao;
    for (let i = 0; i < 40; i++) { const pos = ll(mundo.xUtilizador(Date.now()), 4); await fixar(ctx, p, pos.lat, pos.lon, 8, VEL, 90); await espera(1000); }
    ok(`${rot} desligado, deixa de pedir os autocarros para deteção`, mundo.pedidosDetecao === antes, `${mundo.pedidosDetecao - antes} pedidos`);
    ok(`${rot} sem erros de consola`, erros.length === 0, erros.slice(0, 2).join(' | '));
  } catch (e) { ok(`${rot} correu sem exceções`, false, String(e).slice(0, 300)); } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------------------------------------------- 5) tocar no autocarro → «Estou a bordo» (temas e tamanhos)
async function manual(browser, { tema, largura = 390, altura = 780, aparelho = null, etiqueta }) {
  const rot = `[manual ${etiqueta || `${tema} ${largura}`}]`;
  const nomeFicheiro = `manual_${tema}_${etiqueta || largura}`;
  const mundo = criarMundo({ xParado: 70 }); // parado, à direita da pessoa
  const { ctx, p, erros } = await abrir(browser, { tema, largura, altura, aparelho, mundo });
  const foto = (s) => p.screenshot({ path: `${SAIDA}/${nomeFicheiro}_${s}.png` }).catch(() => {});
  try {
    const temaAtivo = await p.evaluate(() => document.documentElement.getAttribute('data-tema') || 'claro');
    ok(`${rot} tema ativo = ${tema}`, temaAtivo === tema, temaAtivo);
    await p.waitForSelector('.bus-pin', { timeout: 30000 });
    await p.waitForTimeout(1800); // deixa os marcadores assentarem
    await foto('1_mapa');
    const lateral0 = await semScrollLateral(p);
    ok(`${rot} sem scroll lateral no Perto com autocarros`, lateral0.ok, `${lateral0.sw} de ${lateral0.w}`);
    const cPin = await contrasteDe(p, '.bus-pin');
    ok(`${rot} número da linha legível no marcador do autocarro (≥ 4,5:1)`, cPin.pior.r >= 1, `${cPin.n} textos; pior «${cPin.pior.txt}» ${cPin.pior.razao?.toFixed(2)}:1 ${cPin.pior.cor} sobre ${cPin.pior.fundo}`);
    const pino = p.locator('.parou-bus-icone', { has: p.locator('.bus-pin__num', { hasText: '801' }) }).first();
    const caixa = await pino.boundingBox();
    ok(`${rot} marcador do autocarro com 44 px de toque`, caixa && caixa.width >= 43.5 && caixa.height >= 43.5, caixa ? `${Math.round(caixa.width)}x${Math.round(caixa.height)}` : 'sem caixa');
    await pino.click({ timeout: 8000 });
    await p.waitForSelector('[data-teste="estou-a-bordo"]', { timeout: 8000 });
    await p.waitForTimeout(400);
    await foto('2_popup');
    const popup = await p.locator('.pp-bus').first().innerText();
    ok(`${rot} o popup diz a linha e a idade da posição`, /Linha 801/.test(popup) && /(há \d+ s|agora mesmo)/.test(popup), popup.replace(/\n/g, ' | '));
    const alturasPopup = await alturaMinimaBotoes(p, '.pp-bus');
    ok(`${rot} botão «Estou a bordo» com 44 px`, alturasPopup.length === 0, alturasPopup.join('; '));
    const cPopup = await contrasteDe(p, '.pp-bus');
    ok(`${rot} contraste do popup ≥ 4,5:1`, cPopup.pior.r >= 1, `${cPopup.n} textos; pior «${cPopup.pior.txt}» ${cPopup.pior.razao?.toFixed(2)}:1 ${cPopup.pior.cor} sobre ${cPopup.pior.fundo}`);
    await p.locator('[data-teste="estou-a-bordo"]').click();
    await p.waitForSelector('[data-teste="painel-a-bordo"]', { timeout: 10000 });
    await p.waitForSelector('[data-teste="a-bordo-proxima"]', { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1800);
    await foto('3_painel');
    const proxima = await p.locator('[data-teste="a-bordo-proxima"]').innerText().catch(() => '');
    ok(`${rot} painel com a próxima paragem`, /Próxima paragem|Na paragem/i.test(proxima) && /\S/.test(proxima), proxima.replace(/\n/g, ' | '));
    const lateral = await semScrollLateral(p);
    ok(`${rot} sem scroll lateral com o painel`, lateral.ok, `${lateral.sw} de ${lateral.w}`);
    const alturas = await alturaMinimaBotoes(p, '[data-teste="painel-a-bordo"]');
    ok(`${rot} botões do painel com 44 px ou mais`, alturas.length === 0, alturas.slice(0, 4).join('; '));
    const cPainel = await contrasteDe(p, '[data-teste="painel-a-bordo"]');
    ok(`${rot} contraste do painel ≥ 4,5:1 (3:1 em texto grande)`, cPainel.pior.r >= 1, `${cPainel.n} textos; pior «${cPainel.pior.txt}» ${cPainel.pior.razao?.toFixed(2)}:1 ${cPainel.pior.cor} sobre ${cPainel.pior.fundo}`);
    // O painel cabe no ecrã
    const caixaPainel = await p.locator('[data-teste="painel-a-bordo"]').boundingBox();
    const vh = p.viewportSize().height;
    ok(`${rot} o painel está dentro do ecrã`, caixaPainel && caixaPainel.y >= -1 && caixaPainel.y + caixaPainel.height <= vh + 2, caixaPainel ? `${Math.round(caixaPainel.y)}..${Math.round(caixaPainel.y + caixaPainel.height)} de ${vh}` : 'sem caixa');
    // Texto da próxima paragem não passa da largura
    const corta = await p.evaluate(() => {
      const el = document.querySelector('[data-teste="a-bordo-proxima"]'); if (!el) return 'sem bloco';
      const r = el.getBoundingClientRect(); return el.scrollWidth > r.width + 1 ? `scrollWidth ${el.scrollWidth} > ${Math.round(r.width)}` : 'ok';
    });
    ok(`${rot} a próxima paragem cabe na largura`, corta === 'ok', corta);
    await p.locator('[data-teste="a-bordo-sair"]').click();
    await p.waitForTimeout(400);
    ok(`${rot} «Já saí» fecha o painel`, (await p.locator('[data-teste="painel-a-bordo"]').count()) === 0);
    await foto('4_saiu');
    ok(`${rot} sem erros de consola`, erros.length === 0, erros.slice(0, 2).join(' | '));
  } catch (e) {
    ok(`${rot} correu sem exceções`, false, String(e).slice(0, 300));
    await foto('erro');
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------------------------------------------- 6) seletor de temas
async function seletor(browser) {
  const rot = '[temas]';
  const mundo = criarMundo({ xParado: 70 });
  const { ctx, p, erros } = await abrir(browser, { tema: 'claro', mundo });
  try {
    await p.locator('[data-teste="botao-tema"]:visible').first().click();
    await p.waitForSelector('[data-teste="menu-tema"]', { timeout: 5000 });
    for (const id of ['claro', 'escuro', 'ambar', 'porto']) ok(`${rot} o seletor tem «${id}»`, (await p.locator(`[data-teste="tema-${id}"]`).count()) === 1);
    await p.screenshot({ path: `${SAIDA}/seletor_temas.png` }).catch(() => {});
    await p.locator('[data-teste="tema-porto"]').click();
    await p.waitForTimeout(500);
    ok(`${rot} escolher «Azul Porto» aplica o tema`, (await p.evaluate(() => document.documentElement.getAttribute('data-tema'))) === 'porto');
    ok(`${rot} a escolha fica guardada`, (await p.evaluate(() => localStorage.getItem('parou_tema'))) === 'porto');
    const barra = await p.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '');
    ok(`${rot} a barra do telemóvel fica branca no Azul Porto`, /^#?fff(fff)?$/i.test(barra.replace('#', '')), barra);
    const cor = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    nota(`${rot} fundo do corpo no Azul Porto: ${cor}`);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(800);
    ok(`${rot} depois de recarregar continua Azul Porto (sem piscar para o claro)`, (await p.evaluate(() => document.documentElement.getAttribute('data-tema'))) === 'porto');
    ok(`${rot} sem erros de consola`, erros.length === 0, erros.slice(0, 2).join(' | '));
  } catch (e) { ok(`${rot} correu sem exceções`, false, String(e).slice(0, 300)); } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------------------------------------------- execução
(async () => {
  await testarServidor();
  const cr = await chromium.launch({ args: ['--no-sandbox'] });
  let wk = null;
  try { wk = await webkit.launch(); } catch (e) { nota('WebKit indisponível: ' + String(e).slice(0, 120)); }

  // Matriz de temas e tamanhos (rápida)
  for (const tema of ['claro', 'escuro', 'ambar', 'porto']) {
    for (const [largura, altura] of [[320, 640], [390, 780], [1280, 800]]) await manual(cr, { tema, largura, altura });
  }
  if (wk) for (const tema of ['claro', 'porto']) await manual(wk, { tema, aparelho: 'iPhone 13 Mini', etiqueta: 'iphone' });
  await seletor(cr);

  if (!RAPIDO) {
    // Simulações longas: duas de cada vez
    await Promise.all([viajar({ browser: cr, tema: 'claro', completo: true }), aPe(cr)]);
    await Promise.all([viajar({ browser: cr, tema: 'porto' }), recusar(cr)]);
    await Promise.all([viajar({ browser: cr, tema: 'escuro' }), desligar(cr)]);
    await viajar({ browser: cr, tema: 'ambar' });
  }

  fs.writeFileSync(`${SAIDA}/resultado.json`, JSON.stringify(res, null, 1));
  const falhas = res.testes.filter((t) => !t.ok);
  console.log(`\n${res.testes.length - falhas.length}/${res.testes.length} testes OK`);
  for (const f of falhas) console.log('  FALHOU:', f.nome, '-', f.extra);
  await cr.close();
  if (wk) await wk.close();
})();
