// Testa, num browser simulado (Chromium), que os autocarros em direto se mexem no mapa de forma suave:
//   - o servidor simulado envia a posição de um autocarro de 15 em 15 s (como a Carris Metropolitana), com 12 a 27 s de idade,
//     e o relógio do servidor 2,5 s adiantado; o autocarro anda a 4 m/s sempre na mesma direção (este);
//   - mede-se a posição da roda «801» no ecrã a cada imagem durante 50 s e vê-se: anda quase sempre (e não 1,6 s de 15 em 15 s),
//     nunca dá saltos, a velocidade não varia muito, e a ponta aponta para este;
//   - repete-se com a posição anterior vinda do servidor («ant»): já anda desde o primeiro instante.
// O mapa antigo (desliza 1,6 s e fica parado) falha este teste; é essa a prova de que o teste apanha o problema.
// Os pedidos /api/transit/nearby e /veiculos são simulados; o que se testa é a app. Não é num telemóvel a sério.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const res = { testes: [], notas: [] };
const ok = (nome, cond, extra = '') => { res.testes.push({ nome, ok: !!cond, extra: String(extra) }); console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const nota = (s) => { res.notas.push(s); console.log('NOTA   ', s); };

const LAT0 = 41.1496, LON0 = -8.6109, M = 111320, COS = Math.cos(LAT0 * Math.PI / 180);
const ll = (x, y) => ({ lat: Math.round((LAT0 + y / M) * 1e5) / 1e5, lon: Math.round((LON0 + x / (M * COS)) * 1e5) / 1e5 });
const SKEW_MS = 2500; // o relógio do servidor está adiantado em relação ao do telemóvel
const VEL = 4; // m/s (14 km/h)
const CADA_MS = 15_000;

/** Mundo: o autocarro 801 anda para este desde `T0` (relógio do telemóvel); o 803 vai ao lado, 80 m a norte (serve para medir a escala do mapa) */
function criarMundo(T0, comAnt) {
  const x = (tRealMs) => -250 + VEL * (tRealMs - T0) / 1000;
  const m = { pedidos: 0 };
  m.veiculos = () => {
    const tm = Math.floor((Date.now() + SKEW_MS - 12_000) / CADA_MS) * CADA_MS; // medido há 12 a 27 s
    const fix = (tServ) => ({ t: tServ / 1000, x: x(tServ - SKEW_MS) });
    const f = fix(tm), a = fix(tm - CADA_MS);
    const um = (id, linha, dx, y) => ({ id, op: 'stcp', linha, ...ll(f.x + dx, y), t: f.t, ...(comAnt ? { ant: { ...ll(a.x + dx, y), t: a.t } } : {}) });
    return [um('stcp:AAA', '801', 0, 4), um('stcp:BBB', '803', 0, 80)];
  };
  return m;
}

const dep = (extra) => ({ lineName: '', lineColor: '#E4572E', operatorName: 'STCP', operatorId: 'stcp', transportMode: 'Autocarro', ...extra });
const PARAGEM = {
  id: 'S1', name: 'Aliados', operatorId: 'stcp', operatorName: 'STCP', transportMode: 'Autocarro', latitude: LAT0 + 0.0003, longitude: LON0 + 0.0003,
  locality: 'Porto', district: 'Porto', distanceMeters: 40, formattedDistance: '40 m', walkingMinutes: 1,
  lines: [{ code: '801', name: '', color: '#E4572E', destination: '' }, { code: '803', name: '', color: '#E4572E', destination: '' }],
  nextDepartures: [
    dep({ lineCode: '801', destination: 'Lavadores', tripId: 'T801', routeId: 'R801', stopId: 'S1', departureTime: '4 min', displayText: '4 min', scheduledTime: '14:12', etaMinutes: 4, departureMinutes: 4, countdown_minutes: 4, isRealtime: true, state: 'TEMPO REAL', statusDescription: 'Em circulação ao vivo' }),
    dep({ lineCode: '803', destination: 'Sandim', routeId: 'R803', stopId: 'S1', departureTime: '14:35 · Programado', displayText: '14:35 · Programado', scheduledTime: '14:35', etaMinutes: 23, departureMinutes: 23, countdown_minutes: 23, isRealtime: false, state: 'PROGRAMADO', statusDescription: 'Horário oficial programado' }),
  ],
  activeAlerts: [],
};

async function abrir(browser, mundo) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', permissions: ['geolocation'],
    geolocation: { latitude: LAT0, longitude: LON0, accuracy: 10 }, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); localStorage.removeItem('parou_tema'); localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_localizacao_ok','1'); }catch(e){}` });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (rt) => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route('**/api/transit/nearby**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stops: [PARAGEM], vehicles: [], alerts: [], radiusMeters: 500, timestamp: new Date().toISOString() }) }));
  await ctx.route('**/api/transit/stop/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ departures: [] }) }));
  await ctx.route('**/api/transit/veiculos**', (rt) => {
    const u = new URL(rt.request().url());
    const linhas = (u.searchParams.get('linhas') || '').split(',').filter(Boolean);
    if (linhas.length) mundo.pedidos += 1;
    let lista = mundo.veiculos();
    if (linhas.length) lista = lista.filter((v) => linhas.includes(`${v.op}:${v.linha}`));
    return rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify({ veiculos: lista, agora: Math.floor((Date.now() + SKEW_MS) / 1000) }) });
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|ERR_|net::/.test(m.text())) erros.push(m.text().slice(0, 240)); });
  p.on('pageerror', (e) => erros.push('PAGEERROR ' + String(e).slice(0, 240)));
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-teste="paragem-perto"]:visible', { timeout: 45000 });
  const fechar = p.locator('[data-teste="ponto-diario-fechar"]');
  if (await fechar.count()) await fechar.first().click({ timeout: 2000 }).catch(() => {});
  return { ctx, p, erros };
}

const pct = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

/** Regista, a cada imagem desenhada, o centro das rodas 801 e 803 no ecrã e o rumo da ponta */
const GRAVAR = `(() => {
  window.__reg = { amostras: [], fim: false };
  const centro = (txt) => { const n = [...document.querySelectorAll('.bus-pin__num')].find((e) => e.textContent.trim() === txt); if (!n) return null; const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const seta = (txt) => { const n = [...document.querySelectorAll('.bus-pin__num')].find((e) => e.textContent.trim() === txt); const s = n && n.parentElement.querySelector('.bus-pin__seta'); return s ? { transform: s.style.transform, oculta: s.classList.contains('bus-pin__seta--oculta') } : null; };
  const passo = (t) => { if (window.__reg.fim) return; window.__reg.amostras.push({ t, a: centro('801'), b: centro('803') }); window.__reg.seta = seta('801'); requestAnimationFrame(passo); };
  requestAnimationFrame(passo);
})();`;

async function medir(browser, rot, comAnt) {
  const T0 = Date.now() - 20_000; // o autocarro já anda há 20 s quando a página abre
  const mundo = criarMundo(T0, comAnt);
  const { ctx, p, erros } = await abrir(browser, mundo);
  try {
    await p.waitForSelector('.bus-pin__num', { timeout: 30000 });
    const espera = comAnt ? 4000 : 28000; // sem «ant» só há uma posição até chegar a seguinte (≤ 15 s) + recuperar
    await p.waitForTimeout(espera);
    await p.evaluate(GRAVAR);
    await p.waitForTimeout(50_000);
    const reg = await p.evaluate(() => { window.__reg.fim = true; return window.__reg; });
    await p.screenshot({ path: `${SAIDA}/suave_${comAnt ? 'com_ant' : 'sem_ant'}.png` }).catch(() => {});
    const am = reg.amostras.filter((s) => s.a && s.b);
    ok(`${rot} o 801 e o 803 estão no mapa durante os 50 s`, am.length > 1000, `${am.length} imagens`);
    if (am.length < 100) return;
    // escala do mapa: o 803 está 76 m a norte do 801
    const dpx = Math.hypot(am[0].b[0] - am[0].a[0], am[0].b[1] - am[0].a[1]);
    const pxPorM = dpx / 76;
    nota(`${rot} escala: ${pxPorM.toFixed(2)} px por metro; o autocarro a ${VEL} m/s anda ${(VEL * pxPorM).toFixed(1)} px/s`);
    // deslocamento entre imagens e janelas de 1 s
    const passos = [];
    for (let k = 1; k < am.length; k++) passos.push(Math.hypot(am[k].a[0] - am[k - 1].a[0], am[k].a[1] - am[k - 1].a[1]));
    const maxPasso = Math.max(...passos);
    const janela = (s) => {
      const out = [];
      let j = 0;
      for (let k = 0; k < am.length; k++) {
        while (am[k].t - am[j].t > s * 1000) j++;
        if (am[k].t - am[j].t >= s * 1000 * 0.95) out.push(Math.hypot(am[k].a[0] - am[j].a[0], am[k].a[1] - am[j].a[1]));
      }
      return out;
    };
    const w1 = janela(1);
    const w2 = janela(2);
    const esperado1s = VEL * pxPorM;
    const parado = w1.filter((d) => d < 0.15 * esperado1s).length / w1.length;
    const max1s = pct(w1, 0.99), med1s = pct(w1, 0.5);
    nota(`${rot} janelas de 1 s: mediana ${med1s.toFixed(1)} px, p99 ${max1s.toFixed(1)} px, esperado ${esperado1s.toFixed(1)} px; parado ${(parado * 100).toFixed(0)}% do tempo; maior passo entre imagens ${maxPasso.toFixed(2)} px`);
    ok(`${rot} anda quase sempre (parado menos de 10% do tempo; o mapa antigo ficava parado ~85%)`, parado < 0.10, `${(parado * 100).toFixed(0)}%`);
    ok(`${rot} nenhum salto entre imagens (≤ 3 px no máximo, e menos de 3× o passo normal + 1 px)`, maxPasso <= Math.max(3, 3 * esperado1s / 30 + 1), `${maxPasso.toFixed(2)} px`);
    ok(`${rot} velocidade regular (em qualquer segundo anda no máximo 2,2× o esperado)`, max1s <= 2.2 * esperado1s + 2, `${max1s.toFixed(1)} px contra ${esperado1s.toFixed(1)} px esperados`);
    ok(`${rot} velocidade média parecida com a real (mediana de 1 s entre 0,6× e 1,5×)`, med1s >= 0.6 * esperado1s && med1s <= 1.5 * esperado1s, `${med1s.toFixed(1)} px contra ${esperado1s.toFixed(1)}`);
    const total = Math.hypot(am[am.length - 1].a[0] - am[0].a[0], am[am.length - 1].a[1] - am[0].a[1]);
    ok(`${rot} o 801 anda para este (direita) e não para trás`, am[am.length - 1].a[0] - am[0].a[0] > 0.5 * VEL * pxPorM * 40 && total > 0, `${(am[am.length - 1].a[0] - am[0].a[0]).toFixed(0)} px para a direita`);
    const sx = reg.seta;
    const grau = sx && /rotate\((-?\d+)deg\)/.exec(sx.transform);
    const rumo = grau ? ((Number(grau[1]) % 360) + 360) % 360 : null;
    ok(`${rot} a ponta do 801 aponta para este (90° ± 25°)`, rumo !== null && !sx.oculta && Math.abs(rumo - 90) <= 25, `rumo ${rumo}° ${sx?.oculta ? '(escondida)' : ''}`);
    void w2;
    ok(`${rot} sem erros de consola`, erros.length === 0, erros.slice(0, 2).join(' | '));
  } catch (e) {
    ok(`${rot} correu sem exceções`, false, String(e).slice(0, 300));
  } finally {
    await ctx.close();
  }
}

(async () => {
  const cr = await chromium.launch({ args: ['--no-sandbox'] });
  await Promise.all([medir(cr, '[mapa suave]', false), medir(cr, '[mapa suave com «ant»]', true)]);
  fs.writeFileSync(`${SAIDA}/suave.json`, JSON.stringify(res, null, 1));
  const falhas = res.testes.filter((t) => !t.ok);
  console.log(`\n${res.testes.length - falhas.length}/${res.testes.length} testes OK`);
  for (const f of falhas) console.log('  FALHOU:', f.nome, '-', f.extra);
  await cr.close();
  process.exit(falhas.length ? 1 : 0);
})();
