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

async function abrir(browser, { tema = 'claro', largura = 390, altura = 780, aparelho = null, mundo, tiles = false }) {
  const base = aparelho ? devices[aparelho] : { viewport: { width: largura, height: altura }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' };
  const ctx = await browser.newContext({
    ...base, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', permissions: ['geolocation'], geolocation: { latitude: LAT0, longitude: LON0, accuracy: 10 },
    serviceWorkers: 'block', // o Playwright não intercepta pedidos que passam pelo service worker
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); if(!sessionStorage.getItem('__teste_ini')){ sessionStorage.setItem('__teste_ini','1'); ${tema === 'claro' ? "localStorage.removeItem('parou_tema');" : `localStorage.setItem('parou_tema','${tema}');`} } localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_localizacao_ok','1'); }catch(e){}` });
  await ctx.addInitScript({ content: DOPPLER });
  if (!tiles) await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (rt) => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route('**/api/transit/nearby**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stops: [PARAGEM], vehicles: [], alerts: [], radiusMeters: 500, timestamp: new Date().toISOString() }) }));
  await ctx.route('**/api/transit/stop/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ departures: [] }) }));
  await ctx.route('**/api/transit/veiculos**', (rt) => {
    const u = new URL(rt.request().url());
    const linhas = (u.searchParams.get('linhas') || '').split(',').filter(Boolean);
    // A app diz quem pede (cabeçalho X-Parou-Origem): o mapa, ou a deteção do «A bordo». Versões antigas não diziam: sem linhas era a deteção.
    const origem = rt.request().headers()['x-parou-origem'];
    if (origem ? origem === 'deteccao' : !linhas.length) mundo.pedidosDetecao += 1; else mundo.pedidosMapa += 1;
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
    ok(`servidor: veículo ${v.id} só traz o necessário (sem campos a mais)`, Object.keys(v).every((k) => ['id', 'op', 'linha', 'lat', 'lon', 'rumo', 'vel', 't', 'ant', 'viagem'].includes(k)), Object.keys(v).join(','));
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

// ---------------------------------------------------------------------------------------------------------------- 0b) Braga (TUB) com dados reais
async function testarBraga() {
  const j = async (u) => { const r = await fetch(BASE + u); let corpo = null; try { corpo = await r.json(); } catch {} return { status: r.status, corpo }; };
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const caixa = '41.50,-8.48,41.60,-8.36';
  const a = await j(`/api/transit/veiculos?caixa=${caixa}`);
  ok('Braga: /veiculos na caixa de Braga → 200 e lista', a.status === 200 && Array.isArray(a.corpo?.veiculos), a.status);
  const tub = (a.corpo?.veiculos || []).filter((v) => v.op === 'tub');
  nota(`Braga: ${tub.length} autocarros da TUB no mapa (${tub.slice(0, 8).map((v) => `${v.linha}${typeof v.rumo === 'number' ? '↑' + v.rumo : ''}`).join(', ')})`);
  if (!tub.length) { nota('Braga: sem autocarros da TUB agora (fora de horas ou a TUB sem dados): o resto não foi testado'); return; }
  ok('Braga: os autocarros têm id "tub:…" e linha curta (até 5 caracteres)', tub.every((v) => /^tub:/.test(v.id) && v.linha && v.linha.length <= 5), tub.filter((v) => !/^tub:/.test(v.id) || v.linha.length > 5).map((v) => `${v.id}/${v.linha}`).slice(0, 3).join(' '));
  ok('Braga: as posições têm menos de 2 minutos', tub.every((v) => a.corpo.agora - v.t <= 120 && a.corpo.agora - v.t >= -30), tub.map((v) => a.corpo.agora - v.t).slice(0, 6).join(','));
  ok('Braga: cada autocarro diz a viagem', tub.every((v) => typeof v.viagem === 'string' && v.viagem.length > 0), tub.filter((v) => !v.viagem).length + ' sem viagem');
  const so = tub[0].linha;
  const filtrado = await j(`/api/transit/veiculos?linhas=${encodeURIComponent('TUB:' + so)}&caixa=${caixa}`);
  ok(`Braga: pedir só a linha tub:${so} devolve só essa linha`, filtrado.status === 200 && filtrado.corpo.veiculos.length > 0 && filtrado.corpo.veiculos.every((v) => v.op === 'tub' && v.linha === so), `${filtrado.corpo?.veiculos?.length} autocarros`);

  // Rumo: a TUB não o envia; o servidor calcula-o pelo caminho. Duas leituras com 25 s de intervalo.
  await dormir(25000);
  const b = await j(`/api/transit/veiculos?caixa=${caixa}`);
  const tub2 = (b.corpo?.veiculos || []).filter((v) => v.op === 'tub');
  const aAndar = tub2.filter((v) => (v.vel ?? 0) >= 10);
  const comRumo = aAndar.filter((v) => typeof v.rumo === 'number');
  nota(`Braga: 2.ª leitura: ${tub2.length} autocarros, ${aAndar.length} a andar (≥ 10 km/h), ${comRumo.length} com rumo`);
  ok('Braga: os autocarros que andam têm rumo (calculado pelo caminho)', aAndar.length === 0 || comRumo.length > 0, `${comRumo.length}/${aAndar.length}`);

  // Partidas perto dos autocarros: devem trazer a hora em direto da TUB
  let rt = 0, total = 0; const exemplos = []; const incoerentes = [];
  for (const v of tub2.slice(0, 8)) {
    const n = await j(`/api/transit/nearby?lat=${v.lat}&lon=${v.lon}&radius=350`);
    for (const s of n.corpo?.stops || []) for (const d of s.nextDepartures || []) {
      if (!/tub/i.test(`${d.operatorId || s.operatorId}`)) continue;
      total++;
      if (d.isRealtime && d.state === 'TEMPO REAL') {
        rt++;
        if (exemplos.length < 4) exemplos.push(`${d.lineCode} ${s.name || s.stopName || ''} ${d.scheduledTime}→${d.displayText} «${d.statusDescription}»`);
        // A API (/nearby) dá a hora prevista (expectedTime), o atraso (delaySeconds) e a hora do horário (scheduledTime)
        const dif = Math.abs(d.delaySeconds);
        if (!/TUB/.test(d.statusDescription || '') || !Number.isFinite(d.delaySeconds) || dif > 3 * 3600 || !/^\d\d:\d\d$/.test(d.expectedTime || '') || !/^\d\d:\d\d$/.test(d.scheduledTime || '')) incoerentes.push(`${d.lineCode} atraso=${d.delaySeconds}s horário ${d.scheduledTime} previsto ${d.expectedTime} «${d.statusDescription}»`);
      }
    }
  }
  nota(`Braga: ${total} partidas da TUB perto dos autocarros, ${rt} com hora em direto; exemplos: ${exemplos.join(' | ') || '-'}`);
  ok('Braga: há partidas da TUB com a hora em direto perto dos autocarros', rt > 0, `${rt}/${total}`);
  ok('Braga: as horas em direto são coerentes (dizem «TUB», hora prevista e atraso ≤ 3 h do horário)', incoerentes.length === 0, incoerentes.slice(0, 3).join(' ; '));

  // A bordo num autocarro da TUB
  const alvo = tub2.find((v) => v.viagem && (v.vel ?? 0) >= 3) || tub2[0];
  const g = await j('/api/transit/a-bordo?completo=1&veiculo=' + encodeURIComponent(alvo.id));
  nota(`Braga: /a-bordo de ${alvo.id} (linha ${alvo.linha}) → ${g.status}; paragens ${g.corpo?.paragens?.length ?? '-'}; origem ${g.corpo?.origem ?? '-'}; índice ${g.corpo?.indice ?? '-'}; destino ${g.corpo?.destino ?? '-'}; previstas ${g.corpo?.previstas ? Object.keys(g.corpo.previstas).length : 0}`);
  ok('Braga: /a-bordo de um autocarro da TUB → 200 com percurso', g.status === 200 && (g.corpo?.paragens?.length ?? 0) >= 4, `${g.status} ${g.corpo?.paragens?.length}`);
  ok('Braga: o percurso é o da viagem do autocarro (com as horas do horário)', g.corpo?.origem === 'viagem' && g.corpo.paragens.every((p) => /^\d\d:\d\d$/.test(p.hora || '')), g.corpo?.origem);
  if (g.corpo?.previstas) {
    const idx = Object.keys(g.corpo.previstas).map(Number).sort((x, y) => x - y);
    const mins = idx.map((i) => { const [h, m] = g.corpo.previstas[i].split(':').map(Number); return h * 60 + m; });
    const crescente = mins.every((m, k) => k === 0 || m >= mins[k - 1] - 1 || mins[k - 1] - m > 600); // tolera a passagem da meia-noite
    ok('Braga: horas previstas em formato HH:MM, só das paragens que faltam e por ordem', idx.every((i) => i >= g.corpo.indice) && g.corpo.previstas[idx[0]].match(/^\d\d:\d\d$/) && crescente, idx.slice(0, 6).map((i) => `${i}:${g.corpo.previstas[i]}`).join(' '));
    const prox = g.corpo.previstas[g.corpo.indice];
    const horario = g.corpo.paragens[g.corpo.indice]?.hora;
    nota(`Braga: próxima paragem «${g.corpo.paragens[g.corpo.indice]?.nome}»: horário ${horario}, previsto ${prox ?? '-'}`);
  } else nota('Braga: este autocarro não tinha previsões por paragem nesta altura');
  ok('Braga: pedido sem veículo desconhecido continua a dar 404', (await j('/api/transit/a-bordo?veiculo=tub:NAOEXISTE')).status === 404);
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
    // O mapa mostra TODOS os autocarros do ecrã (qualquer linha); o 4436 está a 2,2 km e por isso não está no ecrã
    const noEcra = await p.evaluate(() => { const m = document.querySelector('.leaflet-container').getBoundingClientRect(); return [...document.querySelectorAll('.bus-pin__num')].filter((n) => { const b = n.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2; return x >= m.left && x <= m.right && y >= m.top && y <= m.bottom; }).map((n) => n.textContent.trim()); });
    ok(`${rot} só se vêem os autocarros que estão no ecrã do mapa (o 4436 está a 2,2 km, fora do ecrã)`, !noEcra.includes('4436') && noEcra.includes('801'), noEcra.join(','));
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
    const caixaPergunta = await p.locator('[data-teste="pergunta-a-bordo"]').boundingBox();
    ok(`${rot} a pergunta é compacta (não tapa o mapa todo): ≤ 130 px de altura`, caixaPergunta && caixaPergunta.height <= 130, caixaPergunta ? Math.round(caixaPergunta.height) : 'sem caixa');
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
    ok(`${rot} mostra a próxima paragem com a distância em metros`, /(Bolh|Aliados|S[aã]o Bento|Ribeira|Cais de Gaia|Jardim do Morro|Santo Ov|General Torres|Candal|Vila d|Sandim|Lavadores)/i.test(proxima) && /\d+ ?m\b/.test(proxima), proxima.replace(/\n/g, ' | '));
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
    // Uma roda azul com o número lá dentro (801 no 801), em todos os temas
    const roda = await p.evaluate(() => {
      const n = [...document.querySelectorAll('.bus-pin__num')].find((e) => e.textContent.trim() === '801');
      if (!n) return null;
      const r = n.getBoundingClientRect(); const cs = getComputedStyle(n);
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cs.backgroundColor) || [];
      return { w: r.width, h: r.height, raio: cs.borderTopLeftRadius, fundo: [Number(m[1]), Number(m[2]), Number(m[3])], cabe: n.scrollWidth <= n.clientWidth + 1, texto: n.textContent.trim() };
    });
    ok(`${rot} o autocarro é uma roda (círculo) com o número dentro`, !!roda && Math.abs(roda.w - roda.h) < 1 && roda.w >= 32 && (roda.raio === '50%' || parseFloat(roda.raio) >= roda.w / 2 - 1) && roda.cabe, roda ? `${Math.round(roda.w)}x${Math.round(roda.h)} raio ${roda.raio} «${roda.texto}» ${roda.cabe ? 'cabe' : 'não cabe'}` : 'sem marcador');
    ok(`${rot} a roda é azul`, !!roda && roda.fundo[2] > 140 && roda.fundo[2] > roda.fundo[0] + 60 && roda.fundo[2] > roda.fundo[1] + 30, roda ? `rgb(${roda.fundo.join(',')})` : '');
    const longos = await p.evaluate(() => [['4436', 'bus-pin__num--4'], ['2A', ''], ['ZC', ''], ['10001', 'bus-pin__num--5']].map(([t, c]) => {
      const d = document.createElement('div'); d.className = 'bus-pin'; d.style.cssText = 'position:fixed;left:-300px;top:0';
      d.innerHTML = `<b class="bus-pin__num ${c}">${t}</b>`; document.body.appendChild(d);
      const n = d.firstChild; const r = [t, n.scrollWidth <= n.clientWidth + 1]; d.remove(); return r;
    }));
    ok(`${rot} números de 2, 4 e 5 caracteres (ZC, 4436, 10001) cabem dentro da roda`, longos.every(([, cabe]) => cabe), longos.map(([t, c]) => `${t}:${c ? 'ok' : 'corta'}`).join(' '));
    // Cada operador com a sua cor: STCP azul, Carris Metropolitana amarelo, TUB vermelho (fáceis de distinguir e com o número legível)
    const cores = await p.evaluate(() => {
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const saida = {};
      for (const op of ['stcp', 'cm', 'tub']) {
        const d = document.createElement('div'); d.className = `bus-pin bus-pin--${op}`; d.style.cssText = 'position:fixed;left:-300px;top:0';
        d.innerHTML = '<b class="bus-pin__num">801</b>'; document.body.appendChild(d);
        const cs = getComputedStyle(d.firstChild); const f = rgb(cs.backgroundColor), t = rgb(cs.color);
        const [a, b] = [lum(f), lum(t)];
        saida[op] = { fundo: f, razao: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }; d.remove();
      }
      return saida;
    });
    // Fotografia das três rodas por cima do mapa (para ver as cores de cada tema)
    await p.evaluate(() => {
      const d = document.createElement('div'); d.id = '__rodas'; d.style.cssText = 'position:fixed;left:8px;top:150px;z-index:99999;display:flex;gap:0';
      d.innerHTML = [['stcp', '801', 90], ['cm', '4436', 200], ['tub', '45', 310]].map(([op, n, rumo]) => `<div class="bus-pin bus-pin--${op}"><i class="bus-pin__seta" style="transform:rotate(${rumo}deg)"></i><b class="bus-pin__num${n.length >= 3 ? ` bus-pin__num--${n.length}` : ''}">${n}</b></div>`).join('');
      document.body.appendChild(d);
    });
    await p.screenshot({ path: `${SAIDA}/${nomeFicheiro}_0_rodas.png`, clip: { x: 0, y: 130, width: Math.min(200, largura), height: 90 } }).catch(() => {});
    await p.evaluate(() => document.getElementById('__rodas')?.remove());
    const dist = (x, y) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    ok(`${rot} a roda de cada operador tem o seu azul (STCP), amarelo (Carris Metropolitana) e vermelho (TUB)`, cores.stcp.fundo[2] > cores.stcp.fundo[0] + 60 && cores.cm.fundo[0] > 200 && cores.cm.fundo[1] > 160 && cores.cm.fundo[2] < 80 && cores.tub.fundo[0] > 150 && cores.tub.fundo[1] < 60 && cores.tub.fundo[2] < 90, JSON.stringify(Object.fromEntries(Object.entries(cores).map(([k, v]) => [k, v.fundo.join(',')]))));
    ok(`${rot} as três cores distinguem-se bem (distância ≥ 180)`, dist(cores.stcp.fundo, cores.cm.fundo) >= 180 && dist(cores.stcp.fundo, cores.tub.fundo) >= 150 && dist(cores.cm.fundo, cores.tub.fundo) >= 150, `stcp-cm ${Math.round(dist(cores.stcp.fundo, cores.cm.fundo))}, stcp-tub ${Math.round(dist(cores.stcp.fundo, cores.tub.fundo))}, cm-tub ${Math.round(dist(cores.cm.fundo, cores.tub.fundo))}`);
    ok(`${rot} o número é legível em qualquer operador (≥ 4,5:1)`, Object.values(cores).every((c) => c.razao >= 4.5), Object.entries(cores).map(([k, v]) => `${k} ${v.razao.toFixed(1)}:1`).join(' '));
    const centroPino = await pino.boundingBox();
    await pino.click({ timeout: 8000 });
    await p.waitForSelector('[data-teste="cartao-autocarro"]', { timeout: 8000 });
    await p.waitForTimeout(400);
    await foto('2_cartao');
    const cartao = await p.locator('[data-teste="cartao-autocarro"]').innerText();
    ok(`${rot} o cartão diz a linha e a idade da posição`, /Linha 801/.test(cartao) && /(há \d+ s|agora)/.test(cartao), cartao.replace(/\n/g, ' | '));
    const caixaCartao = await p.locator('[data-teste="cartao-autocarro"]').boundingBox();
    const cx = centroPino ? centroPino.x + centroPino.width / 2 : -1, cy = centroPino ? centroPino.y + centroPino.height / 2 : -1;
    ok(`${rot} o cartão não tapa o autocarro em que tocaste`, caixaCartao && !(cx >= caixaCartao.x && cx <= caixaCartao.x + caixaCartao.width && cy >= caixaCartao.y && cy <= caixaCartao.y + caixaCartao.height), caixaCartao ? `cartão ${Math.round(caixaCartao.y)}..${Math.round(caixaCartao.y + caixaCartao.height)}, autocarro y=${Math.round(cy)}` : 'sem cartão');
    ok(`${rot} o cartão é baixo (≤ 72 px)`, caixaCartao && caixaCartao.height <= 72, caixaCartao ? Math.round(caixaCartao.height) : 'sem caixa');
    const alturasPopup = await alturaMinimaBotoes(p, '[data-teste="cartao-autocarro"]');
    ok(`${rot} botões do cartão com 44 px`, alturasPopup.length === 0, alturasPopup.join('; '));
    const cPopup = await contrasteDe(p, '[data-teste="cartao-autocarro"]');
    ok(`${rot} contraste do cartão ≥ 4,5:1`, cPopup.pior.r >= 1, `${cPopup.n} textos; pior «${cPopup.pior.txt}» ${cPopup.pior.razao?.toFixed(2)}:1 ${cPopup.pior.cor} sobre ${cPopup.pior.fundo}`);
    const lateralCartao = await semScrollLateral(p);
    ok(`${rot} sem scroll lateral com o cartão`, lateralCartao.ok, `${lateralCartao.sw} de ${lateralCartao.w}`);
    const tapado = await p.evaluate(() => {
      const b = document.querySelector('[data-teste="estou-a-bordo"]'); if (!b) return 'sem botão';
      const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) return 'fora do ecrã';
      const h = document.elementFromPoint(x, y); return h && (b === h || b.contains(h)) ? 'ok' : 'tapado por ' + (h ? h.tagName + '.' + String(h.className).slice(0, 50) : 'nada');
    });
    ok(`${rot} o botão «Estou a bordo» fica à vista (não tapado por nada)`, tapado === 'ok', tapado);
    await p.locator('[data-teste="estou-a-bordo"]').click({ timeout: 8000 });
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

// ---------------------------------------------------------------------------------------------------------------- 5b) Braga com dados reais no browser (rodas vermelhas da TUB)
async function bragaReal(browser, tema) {
  const rot = `[Braga real ${tema}]`;
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    permissions: ['geolocation'], geolocation: { latitude: 41.5518, longitude: -8.4229, accuracy: 10 },
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); ${tema === 'claro' ? "localStorage.removeItem('parou_tema');" : `localStorage.setItem('parou_tema','${tema}');`} localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_localizacao_ok','1'); }catch(e){}` });
  const p = await ctx.newPage();
  const erros = [];
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|ERR_|net::/.test(m.text())) erros.push(m.text().slice(0, 240)); });
  p.on('pageerror', (e) => erros.push('PAGEERROR ' + String(e).slice(0, 240)));
  try {
    await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('[data-teste="paragem-perto"]:visible', { timeout: 60000 }).catch(() => {});
    const fechar = p.locator('[data-teste="ponto-diario-fechar"]');
    if (await fechar.count()) await fechar.first().click({ timeout: 2000 }).catch(() => {});
    await p.waitForSelector('.bus-pin--tub', { timeout: 45000 }).catch(() => {});
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${SAIDA}/braga_${tema}_1_mapa.png` }).catch(() => {});
    const rodas = await p.locator('.bus-pin--tub .bus-pin__num').allInnerTexts();
    nota(`${rot}: ${rodas.length} rodas da TUB no mapa (${rodas.slice(0, 10).join(', ')}); paragem: ${(await p.locator('[data-teste="paragem-perto"]').first().innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 160)}`);
    // Fora do horário da TUB (de madrugada) não há autocarros em direto: não é falha da app.
    // Confirma no servidor se há algum veículo da TUB perto do centro de Braga antes de exigir rodas no mapa.
    if (!rodas.length) {
      const v = await fetch(`${BASE}/api/transit/veiculos?caixa=41.50,-8.48,41.60,-8.37`).then((r) => r.json()).catch(() => ({ veiculos: [] }));
      const tub = (v.veiculos || []).filter((x) => /tub/i.test(String(x.op || x.operador || x.feed || x.id || '')));
      if (!tub.length) {
        nota(`${rot}: a TUB não tem autocarros em direto agora (${new Date().toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' })}); teste das rodas saltado`);
        return;
      }
    }
    ok(`${rot} aparecem rodas da TUB no mapa do Perto`, rodas.length > 0, rodas.length);
    if (rodas.length) {
      const cor = await p.evaluate(() => { const n = document.querySelector('.bus-pin--tub .bus-pin__num'); return n ? getComputedStyle(n).backgroundColor : ''; });
      ok(`${rot} a roda da TUB é vermelha`, /rgb\(200, 16, 46\)/.test(cor), cor);
      // Uma roda da TUB à vista (não tapada pela pesquisa, pelos botões ou pela folha de baixo)
      const alvo = await p.evaluate(() => {
        for (const e of [...document.querySelectorAll('.parou-bus-icone')].filter((x) => x.querySelector('.bus-pin--tub'))) {
          const n = e.querySelector('.bus-pin__num'); const r = n.getBoundingClientRect();
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          if (x < 24 || x > 330 || y < 125 || y > 295) continue;
          const topo = document.elementFromPoint(x, y);
          if (topo && e.contains(topo)) return { x, y, linha: n.textContent.trim() };
        }
        return null;
      });
      ok(`${rot} há uma roda da TUB à vista para tocar`, !!alvo, alvo ? `linha ${alvo.linha}` : 'nenhuma à vista');
      if (!alvo) throw new Error('sem roda à vista');
      await p.mouse.click(alvo.x, alvo.y);
      await p.waitForSelector('[data-teste="cartao-autocarro"]', { timeout: 8000 });
      const cartao = (await p.locator('[data-teste="cartao-autocarro"]').innerText()).replace(/\n/g, ' | ');
      await p.screenshot({ path: `${SAIDA}/braga_${tema}_2_cartao.png` }).catch(() => {});
      ok(`${rot} o cartão diz a linha e que é da TUB`, /Linha \S+/.test(cartao) && /TUB/.test(cartao), cartao);
      await p.locator('[data-teste="estou-a-bordo"]').click();
      await p.waitForSelector('[data-teste="a-bordo-paragens"], [data-teste="painel-a-bordo"]', { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(2500);
      await p.screenshot({ path: `${SAIDA}/braga_${tema}_3_painel.png` }).catch(() => {});
      const prox = (await p.locator('[data-teste="a-bordo-proxima"]').innerText({ timeout: 8000 }).catch(() => '')).replace(/\n/g, ' | ');
      nota(`${rot}: próxima paragem no painel «${prox}»`);
      ok(`${rot} o painel «A bordo» abre com a próxima paragem e a hora (horário ou previsto)`, /(PRÓXIMA PARAGEM|NA PARAGEM|ÚLTIMA PARAGEM|FIM DE LINHA)/i.test(prox) && /(horário|previsto) \d\d:\d\d/.test(prox), prox);
    }
    ok(`${rot} sem erros de consola`, erros.length === 0, erros.slice(0, 2).join(' || '));
  } catch (e) {
    ok(`${rot} correu sem exceções`, false, String(e).slice(0, 200));
  } finally {
    await ctx.close();
  }
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
    ok(`${rot} o tema azul chama-se só «Azul»`, ((await p.locator('[data-teste="tema-porto"]').innerText()).split('\n')[0] || '').trim() === 'Azul', (await p.locator('[data-teste="tema-porto"]').innerText()).split('\n')[0]);
    await p.locator('[data-teste="tema-porto"]').click();
    await p.waitForTimeout(500);
    ok(`${rot} escolher «Azul» aplica o tema`, (await p.evaluate(() => document.documentElement.getAttribute('data-tema'))) === 'porto');
    ok(`${rot} a escolha fica guardada`, (await p.evaluate(() => localStorage.getItem('parou_tema'))) === 'porto');
    const barra = await p.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '');
    ok(`${rot} a barra do telemóvel fica branca no Azul`, /^#?fff(fff)?$/i.test(barra.replace('#', '')), barra);
    const cor = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    nota(`${rot} fundo do corpo no Azul: ${cor}`);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(800);
    ok(`${rot} depois de recarregar continua Azul (sem piscar para o claro)`, (await p.evaluate(() => document.documentElement.getAttribute('data-tema'))) === 'porto');
    ok(`${rot} sem erros de consola`, erros.length === 0, erros.slice(0, 2).join(' | '));
  } catch (e) { ok(`${rot} correu sem exceções`, false, String(e).slice(0, 300)); } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------------------------------------------- 7) mapa com mosaicos reais (aspeto dos 4 temas)
async function mosaicosReais(browser, tema) {
  const rot = `[mosaicos ${tema}]`;
  const mundo = criarMundo({ xParado: 70 });
  const { ctx, p, erros } = await abrir(browser, { tema, mundo, tiles: true });
  try {
    await p.waitForSelector('.bus-pin', { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(5000);
    const n = await p.evaluate(() => document.querySelectorAll('img.leaflet-tile-loaded').length);
    nota(`${rot} mosaicos carregados: ${n}`);
    await p.screenshot({ path: `${SAIDA}/mosaicos_${tema}.png` }).catch(() => {});
    ok(`${rot} sem erros de consola`, erros.length === 0, erros.slice(0, 2).join(' | '));
  } catch (e) { ok(`${rot} correu sem exceções`, false, String(e).slice(0, 300)); } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------------------------------------------- execução
(async () => {
  await testarServidor();
  await testarBraga();
  const cr = await chromium.launch({ args: ['--no-sandbox'] });
  let wk = null;
  try { wk = await webkit.launch(); } catch (e) { nota('WebKit indisponível: ' + String(e).slice(0, 120)); }

  // Matriz de temas e tamanhos (rápida)
  for (const tema of ['claro', 'escuro', 'ambar', 'porto']) {
    for (const [largura, altura] of [[320, 640], [390, 780], [1280, 800]]) await manual(cr, { tema, largura, altura });
  }
  if (wk) for (const tema of ['claro', 'porto']) await manual(wk, { tema, aparelho: 'iPhone 13 Mini', etiqueta: 'iphone' });
  await seletor(cr);
  for (const tema of ['claro', 'porto']) await bragaReal(cr, tema);
  for (const tema of ['claro', 'escuro', 'ambar', 'porto']) await mosaicosReais(cr, tema);

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
