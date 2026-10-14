// Testa "tocar num autocarro mostra o percurso e as paragens que faz", também para partidas só com horário (sem tempo real).
// A API de paragens perto e o percurso são simulados (para não depender dos dados do dia); o que se testa é a app:
//  - cada partida do cartão da lista é um botão com seta, e tocar abre a paragem E o percurso dessa linha
//  - partida sem viagem identificada (só linha + paragem) pede o percurso pela linha e o destino
//  - o percurso mostra todas as paragens por ordem, desenha a linha no mapa e cabe no ecrã (telemóvel pequeno, 3 temas, ecrã grande)
//  - "Partidas" volta à lista da paragem; tocar numa partida do painel também abre o percurso
//  - partida sem dados para abrir percurso não finge ser botão; percurso indisponível mostra a frase certa
import { chromium, webkit, devices } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const res = { testes: [], notas: [] };
const ok = (nome, cond, extra = '') => { res.testes.push({ nome, ok: !!cond, extra: String(extra) }); console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const LAT = 41.1496, LON = -8.6109;
const ALVOS = [
  ['iPhone SE', 'webkit', 'claro'],
  ['iPhone 13 Mini', 'webkit', 'claro'],
  ['iPhone 13 Mini', 'webkit', 'escuro'],
  ['iPhone 13 Mini', 'webkit', 'ambar'],
  ['Pixel 5', 'chromium', 'claro'],
  ['Galaxy S9+', 'chromium', 'claro'],
  ['Desktop', 'chromium', 'claro', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }],
];

// Percurso simulado: 7 paragens ao longo de uma rua; o ponto de partida é a 2.ª
const NOMES = ['Bolhão', 'Aliados', 'São Bento', 'Ribeira', 'Cais de Gaia', 'Jardim do Morro', 'Santo Ovídio'];
const percursoSim = (comHoras) => ({
  fonte: 'horarios', linha: '205', cor: '#E4572E', destino: 'Santo Ovídio', indice: 1,
  paragens: NOMES.map((n, i) => ({ id: `P${i}`, nome: n, lat: LAT + i * 0.0012, lon: LON + i * 0.0016, ...(comHoras ? { hora: `14:${String(10 + i * 3).padStart(2, '0')}` } : {}) })),
});

const dep = (extra) => ({
  lineName: '', lineColor: '#E4572E', operatorName: 'STCP', operatorId: 'stcp', transportMode: 'Autocarro', ...extra,
});
const DEPS_PERTO = [
  dep({ lineCode: '205', destination: 'Santo Ovídio', tripId: 'T205', routeId: 'R205', stopId: 'S1', departureTime: '5 min', displayText: '5 min', scheduledTime: '14:12', etaMinutes: 5, departureMinutes: 5, countdown_minutes: 5, isRealtime: true, state: 'TEMPO REAL', statusDescription: 'Em circulação ao vivo' }),
  // Só horário e sem viagem identificada (só linha, paragem e destino)
  dep({ lineCode: '706', destination: 'Matosinhos Sul', routeId: 'R706', stopId: 'S1', departureTime: '14:35 · Programado', displayText: '14:35 · Programado', scheduledTime: '14:35', etaMinutes: 23, departureMinutes: 23, countdown_minutes: 23, isRealtime: false, state: 'PROGRAMADO', statusDescription: 'Horário oficial programado' }),
  // Sem nada com que abrir o percurso: não é botão
  dep({ lineCode: '999', destination: 'Sem dados', departureTime: '14:50 · Programado', displayText: '14:50 · Programado', scheduledTime: '14:50', etaMinutes: 38, departureMinutes: 38, countdown_minutes: 38, isRealtime: false, state: 'PROGRAMADO', statusDescription: 'Horário oficial programado' }),
];
const PARAGEM = {
  id: 'S1', name: 'Aliados', operatorId: 'stcp', operatorName: 'STCP', transportMode: 'Autocarro', latitude: LAT + 0.0003, longitude: LON + 0.0003,
  locality: 'Porto', district: 'Porto', distanceMeters: 40, formattedDistance: '40 m', walkingMinutes: 1,
  lines: [{ code: '205', name: '', color: '#E4572E', destination: '' }, { code: '706', name: '', color: '#E4572E', destination: '' }],
  nextDepartures: DEPS_PERTO, activeAlerts: [],
};
const brutas = [
  { trip_id: 'T205', route_id: 'R205', route_short_name: '205', route_long_name: '', route_color: 'E4572E', headsign: 'Santo Ovídio', operator_name: 'STCP', feed_id: 'stcp', stop_id: 'S1', display_text: '5 min', scheduled_time: '14:12', state: 'TEMPO REAL', is_realtime: true, dep_epoch_secs: Math.floor(Date.now() / 1000) + 300, realtime_epoch_secs: Math.floor(Date.now() / 1000) + 300 },
  { trip_id: 'T706', route_id: 'R706', route_short_name: '706', route_long_name: '', route_color: 'E4572E', headsign: 'Matosinhos Sul', operator_name: 'STCP', feed_id: 'stcp', stop_id: 'S1', display_text: '14:35 · Programado', scheduled_time: '14:35', state: 'PROGRAMADO', is_realtime: false, dep_epoch_secs: Math.floor(Date.now() / 1000) + 1380 },
];

async function correr(browser, nome, motor, tema, custom) {
  const base = custom ? {} : devices[nome];
  if (!custom && !base) { console.log('AVISO  aparelho desconhecido', nome); return; }
  const ctx = await browser.newContext({
    ...(custom || base), ...(custom ? { locale: 'pt-PT' } : {}), locale: 'pt-PT', timezoneId: 'Europe/Lisbon',
    permissions: ['geolocation'], geolocation: { latitude: LAT, longitude: LON, accuracy: 10 },
    serviceWorkers: 'block', // o Playwright não intercepta pedidos que passam pelo service worker (WebKit)
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); localStorage.setItem('parou_tema','${tema}'); localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_localizacao_ok','1'); }catch(e){}` });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (rt) => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const pedidos = [];
  let percursoMode = 'ok';
  await ctx.route('**/api/transit/nearby**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stops: [PARAGEM], vehicles: [], alerts: [], radiusMeters: 500, timestamp: new Date().toISOString() }) }));
  await ctx.route('**/api/transit/stop/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ departures: brutas }) }));
  await ctx.route('**/api/transit/percurso**', (rt) => {
    const u = new URL(rt.request().url());
    pedidos.push(u.search);
    if (percursoMode === 'indisponivel') return rt.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Percurso indisponível para esta linha.' }) });
    // Sem viagem identificada o servidor não tem horas
    return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(percursoSim(u.searchParams.has('trip'))) });
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  const rot = `[${nome} ${tema}]`;
  const foto = (s) => p.screenshot({ path: `${SAIDA}/${nome.replace(/[^\w]+/g, '_')}_${tema}_${s}.png` }).catch(() => {});

  try {
    await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const fecharPonto = p.locator('[data-teste="ponto-diario-fechar"]');
    await p.waitForSelector('[data-teste="paragem-perto"]:visible', { timeout: 45000 });
    if (await fecharPonto.count()) await fecharPonto.first().click({ timeout: 2000 }).catch(() => {});
    await p.waitForTimeout(600);

    const linhas = p.locator('[data-teste="partida-perto"]:visible');
    ok(`${rot} cartão mostra as partidas`, (await linhas.count()) === 3, await linhas.count());
    const botoes = p.locator('[data-teste="partida-perto"][role="button"]:visible');
    ok(`${rot} só as partidas com percurso são botões (2 de 3)`, (await botoes.count()) === 2, await botoes.count());
    ok(`${rot} botões têm seta`, (await botoes.first().locator('svg').count()) >= 1);
    const alvo = await botoes.first().boundingBox();
    ok(`${rot} alvo de toque ≥ 44 px de altura`, alvo && alvo.height >= 44, alvo ? Math.round(alvo.height) : 'sem caixa');
    await foto('1_cartao');

    // 1) Partida só com horário, sem viagem identificada
    await p.locator('[data-teste="partida-perto"][role="button"]:visible', { hasText: '706' }).first().click();
    await p.waitForSelector('[data-teste="percurso-linha"]:visible', { timeout: 10000 });
    await p.waitForFunction(() => document.querySelectorAll('[data-teste="percurso-linha"] ol li').length >= 7, null, { timeout: 10000 }).catch(() => {});
    const n = await p.locator('[data-teste="percurso-linha"] ol li').count();
    ok(`${rot} só horário: tocar abre o percurso com as ${NOMES.length} paragens`, n === NOMES.length, n);
    const ult = pedidos[pedidos.length - 1] || '';
    ok(`${rot} só horário: pede o percurso pela linha, paragem e destino`, /rota=R706/.test(ult) && /stop=S1/.test(ult) && /dest=Matosinhos/.test(ult) && !/trip=/.test(ult), ult);
    const nomesVistos = await p.locator('[data-teste="percurso-linha"] ol li').allInnerTexts();
    ok(`${rot} paragens por ordem (Bolhão … Santo Ovídio)`, /Bolh/.test(nomesVistos[0]) && /Ovídio/i.test(nomesVistos[n - 1]), nomesVistos.map((x) => x.split('\n')[0]).join(' > ').slice(0, 120));
    ok(`${rot} sem horas de passagem para partida só com horário`, !/\b14:\d\d\b/.test(nomesVistos.join(' ')), '');
    ok(`${rot} avisa que as horas não estão disponíveis`, /horas de passagem não estão disponíveis/i.test(await p.locator('[data-teste="percurso-linha"]').innerText()));
    await p.waitForTimeout(900);
    const linhaMapa = await p.evaluate(() => document.querySelectorAll('.leaflet-overlay-pane path').length);
    ok(`${rot} linha do percurso desenhada no mapa`, linhaMapa >= 2, linhaMapa);
    const cab = await p.locator('[data-teste="percurso-linha"] >> text=Santo Ovídio').first().isVisible().catch(() => false);
    ok(`${rot} cabeçalho mostra a linha e o destino`, (await p.locator('[data-teste="percurso-linha"]').innerText()).includes('706') || cab);
    await foto('2_percurso_so_horario');
    // a lista do percurso cabe no ecrã (não passa do fundo) e dá para deslizar até ao fim
    const caixa = await p.locator('[data-teste="percurso-linha"]').boundingBox();
    const vh = p.viewportSize().height;
    ok(`${rot} percurso dentro do ecrã`, caixa && caixa.y >= -1 && caixa.y + caixa.height <= vh + 2, caixa ? `${Math.round(caixa.y)}..${Math.round(caixa.y + caixa.height)} de ${vh}` : 'sem caixa');
    const sobreposto = await p.evaluate(() => {
      const l = document.querySelector('[data-teste="percurso-linha"] ol li:last-child button'); if (!l) return 'sem última';
      l.scrollIntoView({ block: 'nearest' });
      const r = l.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const h = document.elementFromPoint(x, y); return h && (l === h || l.contains(h)) ? 'ok' : 'tapada por ' + (h ? h.tagName + '.' + String(h.className).slice(0, 40) : 'nada');
    });
    ok(`${rot} última paragem do percurso alcançável (não tapada)`, sobreposto === 'ok', sobreposto);

    // 2) "Partidas" volta à lista da paragem
    await p.getByRole('button', { name: /Partidas|Voltar às partidas/ }).first().click();
    await p.waitForTimeout(500);
    ok(`${rot} "Partidas" volta à lista da paragem`, (await p.locator('[data-teste="percurso-linha"]:visible').count()) === 0);

    // 3) Tocar numa partida do painel (com viagem) também abre o percurso, agora com horas
    await p.waitForTimeout(500);
    const painel = p.locator('aside [role="button"]:not([data-teste="partida-perto"])[aria-label*="Ver o percurso da linha 205"]:visible').first();
    ok(`${rot} painel da paragem tem a partida 205 como botão`, (await painel.count()) === 1);
    await painel.click();
    await p.waitForSelector('[data-teste="percurso-linha"]:visible', { timeout: 10000 });
    await p.waitForFunction(() => document.querySelectorAll('[data-teste="percurso-linha"] ol li').length >= 7, null, { timeout: 10000 }).catch(() => {});
    const u2 = pedidos[pedidos.length - 1] || '';
    ok(`${rot} painel: partida com viagem pede pelo trip_id`, /trip=T205/.test(u2) && /rota=R205/.test(u2), u2);
    ok(`${rot} painel: o percurso traz as horas`, /14:1\d/.test(await p.locator('[data-teste="percurso-linha"]').innerText()));
    await foto('3_percurso_com_horas');

    // 4) Voltar à lista de paragens e abrir pelo teclado (Enter) a partir do cartão
    await p.getByRole('button', { name: /Partidas|Voltar às partidas/ }).first().click();
    await p.waitForTimeout(300);
    if (tema === 'claro' && nome === 'iPhone 13 Mini') {
      percursoMode = 'indisponivel';
      await p.evaluate(() => window.history.back());
      await p.waitForTimeout(700);
      const volta = await p.locator('[data-teste="paragem-perto"]:visible').count();
      ok(`${rot} "voltar" do telemóvel fecha a paragem e mostra a lista`, volta >= 1, volta);
      if (volta >= 1) {
        const b = p.locator('[data-teste="partida-perto"][role="button"]:visible', { hasText: '205' }).first();
        await b.focus();
        await p.keyboard.press('Enter');
        await p.waitForSelector('[data-teste="percurso-linha"]:visible', { timeout: 10000 });
        await p.waitForTimeout(500);
        ok(`${rot} teclado (Enter) abre o percurso; sem dados diz "indisponível"`, /Percurso indisponível/.test(await p.locator('[data-teste="percurso-linha"]').innerText()));
        await foto('4_indisponivel');
      }
    }
  } catch (e) {
    ok(`${rot} fluxo sem exceções`, false, String(e).slice(0, 300));
    await foto('erro');
  }
  ok(`${rot} sem erros de JavaScript`, erros.length === 0, erros.slice(0, 2).join(' | '));
  await ctx.close();
}

for (const [nome, motor, tema, custom] of ALVOS) {
  const b = await (motor === 'webkit' ? webkit : chromium).launch();
  try { await correr(b, nome, motor, tema, custom); } finally { await b.close(); }
}
const falhas = res.testes.filter((t) => !t.ok);
console.log(`\n${res.testes.length - falhas.length}/${res.testes.length} OK; ${falhas.length} falhas`);
fs.writeFileSync(`${SAIDA}/resultado.json`, JSON.stringify(res, null, 1));
