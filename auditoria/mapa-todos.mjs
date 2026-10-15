// Testa, num browser simulado (Chromium), que o mapa mostra TODOS os autocarros da zona que se vê, e não só os das linhas das paragens perto:
//   1. ao abrir, todos os autocarros que cabem no ecrã (de qualquer operador e linha) estão desenhados, e nenhum a mais;
//      o pedido ao servidor é por caixa do ecrã, sem lista de linhas;
//   2. ao arrastar o mapa (dedo, com toque), aparecem os autocarros da zona nova;
//   3. ao afastar o mapa (zoom) aparecem os de um raio maior, em pontos coloridos sem número;
//   4. com o mapa afastado de mais não pede nada (nunca uma caixa maior do que o servidor aceita) e diz para aproximar; ao aproximar voltam.
// O mapa antigo (só as linhas das 6 paragens mais perto, numa caixa fixa à volta da pessoa) falha este teste; é essa a prova de que o teste apanha o erro.
// Os pedidos /api/transit/nearby e /veiculos são simulados (o /veiculos simulado filtra como o servidor: por caixa e/ou linhas, e recusa caixas
// com mais de 0,6°); o que se testa é a app. Não é num telemóvel a sério.
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
const ll = (x, y) => ({ lat: Math.round((LAT0 + y / M) * 1e6) / 1e6, lon: Math.round((LON0 + x / (M * COS)) * 1e6) / 1e6 });
let semente = 987654;
const rnd = () => { semente = (semente * 1664525 + 1013904223) % 4294967296; return semente / 4294967296; };

// ---------------------------------------------------------------- o mundo: autocarros parados em sítios conhecidos (metros a este e a norte da pessoa)
const OPS = ['stcp', 'cm', 'tub'];
const mundo = { veiculos: [], pedidos: [], grandes: 0 };
const por = (id, op, linha, x, y) => mundo.veiculos.push({ id, op, linha, ...ll(x, y), x, y });
const LINHAS_DENTRO = ['300', '301', '205', '107', '902', '505', '203', '401', '602', '704', '4436', '2001', 'ZC', '45'];
LINHAS_DENTRO.forEach((l, i) => por(`d${i}`, OPS[i % 3], l, (rnd() - 0.5) * 300, (rnd() - 0.5) * 240));   // no ecrã inicial (±150 m × ±120 m)
por('s801', 'stcp', '801', 40, 30); por('s803', 'stcp', '803', -60, -20);                               // as duas linhas da paragem simulada
for (let i = 1; i <= 8; i++) por(`b${i}`, OPS[i % 3], `B${i}`, 420 + rnd() * 330, (rnd() - 0.5) * 200);  // a este, fora do ecrã inicial (só se vê ao arrastar)
for (let i = 0; i < 40; i++) {                                                                          // anel de 0,8 a 4 km (só se veem afastando o mapa)
  const ang = rnd() * 2 * Math.PI, r = 800 + rnd() * 3200;
  por(`l${i}`, OPS[i % 3], `L${i}`, Math.cos(ang) * r, Math.sin(ang) * r);
}
const ESPERADOS_INICIO = ['801', '803', ...LINHAS_DENTRO];

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

let zoomVisto = null;
async function abrir(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', permissions: ['geolocation'],
    geolocation: { latitude: LAT0, longitude: LON0, accuracy: 10 }, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); localStorage.removeItem('parou_tema'); localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_localizacao_ok','1'); }catch(e){}` });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (rt) => {
    const m = /\/(\d{1,2})\/\d+\/\d+\.png/.exec(rt.request().url());
    if (m) zoomVisto = Number(m[1]);
    return rt.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
  await ctx.route('**/api/transit/nearby**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stops: [PARAGEM], vehicles: [], alerts: [], radiusMeters: 500, timestamp: new Date().toISOString() }) }));
  await ctx.route('**/api/transit/stop/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ departures: [] }) }));
  // O servidor simulado: filtra como o verdadeiro (caixa e/ou linhas) e recusa caixas com mais de 0,6° de lado
  await ctx.route('**/api/transit/veiculos**', (rt) => {
    const u = new URL(rt.request().url());
    const linhas = (u.searchParams.get('linhas') || '').split(',').filter(Boolean);
    const cx = (u.searchParams.get('caixa') || '').split(',').map(Number);
    const temCaixa = cx.length === 4 && cx.every(Number.isFinite);
    mundo.pedidos.push({ t: Date.now(), linhas, caixa: temCaixa ? { sul: cx[0], oeste: cx[1], norte: cx[2], leste: cx[3] } : null, zoom: zoomVisto });
    if (!linhas.length && !temCaixa) return rt.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"Indica as linhas ou uma caixa do mapa."}' });
    if (temCaixa && (cx[2] - cx[0] > 0.6 + 1e-6 || cx[3] - cx[1] > 0.6 + 1e-6)) { mundo.grandes += 1; return rt.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"Caixa grande demais"}' }); }
    const agora = Math.floor(Date.now() / 1000);
    let lista = mundo.veiculos;
    if (temCaixa) lista = lista.filter((v) => v.lat >= cx[0] && v.lat <= cx[2] && v.lon >= cx[1] && v.lon <= cx[3]);
    if (linhas.length) lista = lista.filter((v) => linhas.includes(`${v.op}:${v.linha}`.toUpperCase()));
    const corpo = lista.map((v) => ({ id: v.id, op: v.op, linha: v.linha, lat: v.lat, lon: v.lon, t: agora - 10 }));
    return rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify({ veiculos: corpo, agora }) });
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

/** Projeção Web Mercator: onde fica no ecrã (px a partir do centro do mapa) um sítio, ao nível de zoom z, com o mapa centrado em (lat0, lon0) */
function projetar(lat, lon, z, lat0, lon0) {
  const mundoPx = 256 * 2 ** z;
  const xy = (la, lo) => [((lo + 180) / 360) * mundoPx, (0.5 - Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)) / (2 * Math.PI)) * mundoPx];
  const [x, y] = xy(lat, lon), [cx, cy] = xy(lat0, lon0);
  return [x - cx, y - cy];
}

/** Rodas/pontos desenhados que estão no ecrã do mapa: texto, operador (pela classe) e tamanho */
const LER = `(() => {
  const mapa = document.querySelector('.perto-mapa .leaflet-container') || document.querySelector('.leaflet-container');
  const r = mapa.getBoundingClientRect();
  const saida = [];
  document.querySelectorAll('.bus-pin').forEach((pin) => {
    const num = pin.querySelector('.bus-pin__num'); if (!num) return;
    const b = num.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const dentro = cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    saida.push({ txt: num.textContent.trim(), op: ['stcp', 'cm', 'tub'].find((o) => pin.classList.contains('bus-pin--' + o)), w: Math.round(b.width), fonte: getComputedStyle(num).fontSize, dentro, cx, cy });
  });
  const dica = document.querySelector('.bus-dica');
  return { rect: { l: r.left, t: r.top, w: r.width, h: r.height }, pinos: saida, dicaVisivel: !!dica && !dica.hidden && getComputedStyle(dica).display !== 'none', dicaTexto: dica ? dica.textContent : null, ponto: document.querySelector('.leaflet-container').classList.contains('mapa-bus-ponto') };
})()`;

async function arrastar(cdp, p, de, para) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: de[0], y: de[1] }] });
  const passos = 14;
  for (let k = 1; k <= passos; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: de[0] + ((para[0] - de[0]) * k) / passos, y: de[1] + ((para[1] - de[1]) * k) / passos }] });
    await p.waitForTimeout(30);
  }
  await p.waitForTimeout(350); // parado antes de largar: sem inércia
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const visiveis = (lido) => lido.pinos.filter((x) => x.dentro);
const mapaNaImagem = (lido, z, lat0, lon0) => (v) => { const [dx, dy] = projetar(v.lat, v.lon, z, lat0, lon0); return [lido.rect.l + lido.rect.w / 2 + dx, lido.rect.t + lido.rect.h / 2 + dy]; };

async function correr(browser) {
  const { ctx, p, erros } = await abrir(browser);
  const cdp = await ctx.newCDPSession(p);
  try {
    // ------------------------------------------------------------ 1. ao abrir
    await p.waitForSelector('.bus-pin__num', { timeout: 30000 });
    await p.waitForTimeout(3000);
    let lido = await p.evaluate(LER);
    const z0 = zoomVisto;
    nota(`mapa ao nível ${z0}; ecrã do mapa ${Math.round(lido.rect.w)}×${Math.round(lido.rect.h)} px; ${lido.pinos.length} marcadores desenhados`);
    const vis = visiveis(lido).map((x) => x.txt);
    const faltam = ESPERADOS_INICIO.filter((l) => !vis.includes(l));
    ok('[ao abrir] todos os autocarros do ecrã estão no mapa (16: as duas linhas da paragem e 14 de outras linhas)', faltam.length === 0, faltam.length ? `faltam ${faltam.length}: ${faltam.join(' ')}` : `${vis.length} à vista`);
    const demais = vis.filter((l) => !ESPERADOS_INICIO.includes(l));
    ok('[ao abrir] e nenhum a mais (os que estão fora do ecrã não aparecem à vista)', demais.length === 0, demais.join(' '));
    ok('[ao abrir] aparecem os três operadores (STCP, Carris Metropolitana e TUB)', ['stcp', 'cm', 'tub'].every((o) => visiveis(lido).some((x) => x.op === o)), [...new Set(visiveis(lido).map((x) => x.op))].join(','));
    ok('[ao abrir] com o zoom de perto cada autocarro é uma roda com número (≥ 30 px)', visiveis(lido).every((x) => x.w >= 30) && !lido.ponto, `${Math.min(...visiveis(lido).map((x) => x.w))} px`);
    const pr0 = mundo.pedidos.find((q) => q.caixa);
    ok('[ao abrir] o pedido é pela caixa do ecrã, sem lista de linhas', !!pr0 && pr0.linhas.length === 0, pr0 ? `linhas=[${pr0.linhas.join(',')}]` : 'sem pedidos com caixa');
    if (pr0) {
      const pad = (pr0.caixa.norte - pr0.caixa.sul) * 111320;
      ok('[ao abrir] a caixa cobre o ecrã com folga e não é exagerada (entre 0,5 e 3 km de altura)', pad > 500 && pad < 3000, `${Math.round(pad)} m de altura`);
    }
    await p.screenshot({ path: `${SAIDA}/todos_1_perto.png` }).catch(() => {});

    // ------------------------------------------------------------ 2. arrastar o mapa para este
    const caixaAntes = [...mundo.pedidos].reverse().find((q) => q.caixa)?.caixa;
    const cx = lido.rect.l + lido.rect.w / 2, cy = lido.rect.t + lido.rect.h / 2;
    const nPedidos = mundo.pedidos.length;
    await arrastar(cdp, p, [cx + 120, cy], [cx - 180, cy]); // o mapa anda 300 px para oeste: a vista vai ~540 m para este
    await p.waitForTimeout(2500);
    lido = await p.evaluate(LER);
    const visB = visiveis(lido).map((x) => x.txt);
    const bs = visB.filter((l) => /^B[1-8]$/.test(l));
    ok('[arrastar] ao arrastar o mapa para este aparecem os autocarros da zona nova (≥ 7 dos 8)', bs.length >= 7, `${bs.length} de 8 (${bs.join(' ')})`);
    ok('[arrastar] os da zona que saiu do ecrã já não estão à vista', !visB.includes('300') && !visB.includes('301'), visB.filter((l) => LINHAS_DENTRO.includes(l)).join(' '));
    const caixaDepois = [...mundo.pedidos].reverse().find((q) => q.caixa)?.caixa;
    ok('[arrastar] a app pediu uma caixa nova, mais a este', mundo.pedidos.length > nPedidos && caixaAntes && caixaDepois && caixaDepois.oeste - caixaAntes.oeste > 0.003, caixaAntes && caixaDepois ? `oeste ${caixaAntes.oeste.toFixed(4)} → ${caixaDepois.oeste.toFixed(4)}` : 'sem caixas');
    await p.screenshot({ path: `${SAIDA}/todos_2_arrastado.png` }).catch(() => {});
  } catch (e) {
    ok('[arrastar e ao abrir] correu sem exceções', false, String(e).slice(0, 300));
  }
  await ctx.close();

  // ------------------------------------------------------------ 3 e 4. afastar o mapa (página nova: o mapa volta a estar centrado na pessoa)
  const b = await abrir(browser);
  const p2 = b.p;
  try {
    await p2.waitForSelector('.bus-pin__num', { timeout: 30000 });
    await p2.waitForTimeout(2500);
    let lido = await p2.evaluate(LER);
    const cx = lido.rect.l + lido.rect.w / 2, cy = lido.rect.t + lido.rect.h / 2;
    await p2.mouse.move(cx, cy);
    const z0 = zoomVisto;
    await p2.mouse.wheel(0, 300); // ~3 níveis para longe
    await p2.waitForTimeout(3500);
    const z1 = zoomVisto;
    lido = await p2.evaluate(LER);
    nota(`zoom ${z0} → ${z1}; ${lido.pinos.length} marcadores; pontos: ${lido.ponto}`);
    ok('[afastar] o mapa afastou-se (pelo menos 2 níveis)', z0 !== null && z1 !== null && z0 - z1 >= 2, `${z0} → ${z1}`);
    const aImagem = mapaNaImagem(lido, z1, LAT0, LON0);
    const margem = 30;
    const dentroDoEcra = (v) => { const [x, y] = aImagem(v); return x >= lido.rect.l + margem && x <= lido.rect.l + lido.rect.w - margem && y >= lido.rect.t + margem && y <= lido.rect.t + lido.rect.h - margem; };
    const esperados = mundo.veiculos.filter(dentroDoEcra).map((v) => v.linha);
    const vis = visiveis(lido).map((x) => x.txt);
    const faltam = esperados.filter((l) => !vis.includes(l));
    ok(`[afastar] com o mapa afastado vêem-se todos os autocarros do ecrã maior (${esperados.length} esperados, mais que ao início)`, esperados.length >= 25 && faltam.length === 0, faltam.length ? `faltam ${faltam.length}: ${faltam.slice(0, 12).join(' ')}` : `${vis.length} à vista`);
    if (z1 !== null && z1 <= 14) {
      ok('[afastar] ao nível de zoom 14 ou menos os autocarros são pontos pequenos (≤ 20 px, sem número à vista)', lido.ponto && visiveis(lido).every((x) => x.w <= 20 && parseFloat(x.fonte) === 0), `${Math.max(...visiveis(lido).map((x) => x.w))} px; fonte ${visiveis(lido)[0]?.fonte}`);
    }
    ok('[afastar] os pontos continuam a ter a cor do operador', ['stcp', 'cm', 'tub'].every((o) => visiveis(lido).some((x) => x.op === o)));
    await p2.screenshot({ path: `${SAIDA}/todos_3_afastado.png` }).catch(() => {});

    // mais longe ainda: até aparecer o aviso (máx. 6 voltas)
    const grandesAntes = mundo.grandes;
    let zf = z1;
    for (let i = 0; i < 6 && !(await p2.evaluate(LER)).dicaVisivel; i++) { await p2.mouse.wheel(0, 100); await p2.waitForTimeout(2200); zf = zoomVisto; }
    lido = await p2.evaluate(LER);
    nota(`zoom ${zf}; aviso visível: ${lido.dicaVisivel}; marcadores: ${lido.pinos.length}`);
    ok('[muito longe] com o mapa muito afastado aparece o aviso para aproximar', lido.dicaVisivel && /aproxima/i.test(lido.dicaTexto || ''), lido.dicaTexto || 'sem aviso');
    ok('[muito longe] e não fica nenhum autocarro desenhado', lido.pinos.length === 0, `${lido.pinos.length} marcadores`);
    ok('[muito longe] a app nunca pediu uma caixa maior do que o servidor aceita', mundo.grandes === grandesAntes && mundo.grandes === 0, `${mundo.grandes} pedidos recusados`);
    await p2.screenshot({ path: `${SAIDA}/todos_4_longe.png` }).catch(() => {});
    // voltar a aproximar
    await p2.mouse.wheel(0, -600);
    await p2.waitForTimeout(3500);
    lido = await p2.evaluate(LER);
    ok('[aproximar] ao aproximar outra vez o aviso desaparece e os autocarros voltam', !lido.dicaVisivel && lido.pinos.length > 0, `${lido.pinos.length} marcadores, zoom ${zoomVisto}`);
    ok('[tudo] sem erros de consola', b.erros.length === 0, b.erros.slice(0, 2).join(' | '));
  } catch (e) {
    ok('[afastar] correu sem exceções', false, String(e).slice(0, 300));
  }
  await b.ctx.close();
  void erros;
}

(async () => {
  const cr = await chromium.launch({ args: ['--no-sandbox'] });
  await correr(cr);
  fs.writeFileSync(`${SAIDA}/todos.json`, JSON.stringify(res, null, 1));
  const falhas = res.testes.filter((t) => !t.ok);
  console.log(`\n${res.testes.length - falhas.length}/${res.testes.length} testes OK`);
  for (const f of falhas) console.log('  FALHOU:', f.nome, '-', f.extra);
  await cr.close();
  process.exit(falhas.length ? 1 : 0);
})();
