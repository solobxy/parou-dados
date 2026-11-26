// Localização do telemóvel desligada ao abrir a PAROU (o site já está autorizado): quando a pessoa a liga nas definições
// rápidas (puxar a barra de cima, sem sair da app), a PAROU tem de mostrar logo onde ela está, sem tocar em nada
// (pedido do Dinis, 25/11/2026; antes era preciso tocar em «Tentar outra vez» ou «Ativar localização»).
// Simula-se o Chrome no Android: com a localização desligada, cada pedido dá erro logo; ligada, dá a posição.
// Confirma também que a quem nunca autorizou o site a app não pergunta sozinha (só com um toque), e que com a página
// escondida não se fazem pedidos.
// Uso: BASE=http://127.0.0.1:3000 SAIDA=res node localizacao-automatica.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

// estado: 'granted' (site autorizado, e o browser di-lo sempre), 'prompt' (nunca perguntado), ou como o Chrome real no
// Android (lido no código do Chromium, geolocation_permission_context_android.cc): com a localização do telemóvel
// desligada, o Chrome responde que a autorização de um site JÁ autorizado está «por pedir» ('chrome-aviso', quando ainda
// pode mostrar o aviso «Ligar a localização?») ou «recusada» ('chrome-pausa', na pausa depois de alguém fechar esse
// aviso), e só volta a «autorizado» quando a pessoa liga a localização. 'prompt-ja-deu': a pessoa já deu a localização
// à PAROU mas a autorização do site foi retirada entretanto (um pedido sem toque abre a pergunta do Chrome, que fica à espera).
// 'chrome-sempre-por-pedir': como o telemóvel do Dinis na app da Play (registo de 26/11/2026, 16:43): o Chrome diz «por
// pedir» com a localização desligada e continua a dizê-lo depois de ligada, mas dá a posição sem perguntar nada.
const TELEMOVEL = (estado) => `(() => {
  const G = { ligada: false, pedidos: 0, entregues: 0, consultas: 0, watches: new Map(), id: 1, toqueEm: 0 };
  addEventListener('pointerdown', () => { G.toqueEm = Date.now(); }, true);
  window.__geo = G;
  const erro = { code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'User denied Geolocation' };
  const pos = () => ({ coords: { latitude: 41.15054, longitude: -8.586245, accuracy: 12, heading: null, speed: null, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() });
  // como no Chrome (Blink): um seguimento que recebe «recusado» deixa de receber posições, mesmo que a localização volte
  const responder = (n, id) => setTimeout(() => { try {
    // autorização retirada: com a localização ligada e sem toque, o Chrome abre a pergunta e não responde (fica à espera
    // da pessoa); com a localização desligada recusa logo (Chromium: IsLocationAccessPossible sem toque)
    // (toque = toque real no ecrã há menos de 5 s; o userActivation não serve aqui, o Playwright marca-o em cada evaluate)
    if ('${estado}' === 'prompt-ja-deu' && G.ligada && !(G.toqueEm && Date.now() - G.toqueEm < 5000)) { G.perguntas = (G.perguntas || 0) + 1; return; }
    if (G.ligada) { G.entregues++; n.okf(pos()); } else { if (id) G.watches.delete(id); n.err && n.err(erro); }
  } catch (e) {} }, 30);
  const geo = {
    getCurrentPosition(okf, err) { G.pedidos++; responder({ okf, err }); },
    watchPosition(okf, err) { G.pedidos++; const n = { okf, err }; const id = G.id++; G.watches.set(id, n); responder(n, id); return id; },
    clearWatch(id) { G.watches.delete(id); },
  };
  // quando a localização liga, os seguimentos abertos voltam a receber posições (como no telemóvel)
  setInterval(() => { if (G.ligada) for (const n of G.watches.values()) try { n.okf(pos()); } catch (e) {} }, 1000);
  Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => geo, configurable: true });
  const q = navigator.permissions.query.bind(navigator.permissions);
  const MODO = '${estado}';
  const autorizacao = () => MODO === 'chrome-aviso' ? (G.ligada ? 'granted' : 'prompt') : MODO === 'chrome-pausa' ? (G.ligada ? 'granted' : 'denied') : MODO === 'prompt-ja-deu' || MODO === 'chrome-sempre-por-pedir' ? 'prompt' : MODO;
  navigator.permissions.query = (d) => (d && d.name === 'geolocation') ? (G.consultas++, Promise.resolve({ state: autorizacao(), onchange: null })) : q(d);
  try {
    localStorage.setItem('parou_aviso_instalar', '1'); localStorage.setItem('parou_bemvindo', 'visto');
    if (MODO !== 'prompt') localStorage.setItem('parou_localizacao_ok', '1');
  } catch (e) {}
})();`;

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
async function contexto(estado) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', hasTouch: true, isMobile: true, userAgent: UA, serviceWorkers: 'block' });
  await ctx.addInitScript({ content: TELEMOVEL(estado) });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (rt) => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
  return { ctx, p, erros };
}

{ // site autorizado, localização do telemóvel desligada → a pessoa liga-a e não toca em nada
  const { ctx, p, erros } = await contexto('granted');
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-teste="ativar-localizacao"]:visible', { timeout: 45000 }).catch(() => {});
  const pedeParaLigar = await p.locator('[data-teste="ativar-localizacao"]:visible').count();
  ok('localização desligada: a app pede para a ligar', pedeParaLigar > 0);
  await p.screenshot({ path: `${SAIDA}/localizacao-automatica-1-desligada.png` });
  // sem tocar em nada: a app não pode ficar a pedir sem parar (no máximo ~1 por segundo e meio)
  const a = await p.evaluate(() => window.__geo.pedidos);
  await p.waitForTimeout(6000);
  const b = await p.evaluate(() => window.__geo.pedidos);
  // (a cada 0,3 s: num Android real a recusa chega em ~3 ms e não liga o GPS)
  ok('enquanto está desligada, pergunta em silêncio sem exagerar (≤ 1 pedido a cada 0,3 s)', b - a >= 8 && b - a <= 22, `${b - a} pedidos em 6 s`);
  // a pessoa liga a localização nas definições rápidas (a página continua visível)
  const t0 = Date.now();
  await p.evaluate(() => { window.__geo.ligada = true; });
  const apareceu = await p.waitForFunction(() => ![...document.querySelectorAll('[data-teste="ativar-localizacao"]')].some((e) => e.getBoundingClientRect().width > 0),
    null, { timeout: 8000 }).then(() => true).catch(() => false);
  const ms = Date.now() - t0;
  ok('ao ligar a localização, a app mostra onde a pessoa está sem tocar em nada', apareceu, `${ms} ms`);
  ok('e fá-lo depressa (menos de 1 s)', apareceu && ms < 1000, `${ms} ms`);
  const entregues = await p.evaluate(() => window.__geo.entregues);
  ok('a app pediu e recebeu a posição do telemóvel', entregues > 0, `${entregues} posições`);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${SAIDA}/localizacao-automatica-2-ligada.png` });
  ok('sem erros na página', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

{ // localização do telemóvel desligada e o Chrome nem responde (os pedidos ficam pendurados): a app mostra «Liga a
  // localização»; quando a pessoa a liga, tem de aparecer sozinha, sem tocar em «Tentar outra vez» (pedido de 26/11/2026)
  const { ctx, p, erros } = await contexto('granted');
  await p.addInitScript({ content: `(() => {
    const G = window.__geo; G.ligada = false;
    const pos = () => ({ coords: { latitude: 41.15054, longitude: -8.586245, accuracy: 15, heading: null, speed: null, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() });
    const geo = {
      // desligada: nunca responde (nem erro); ligada: responde aos pedidos novos
      getCurrentPosition(okf) { G.pedidos++; if (G.ligada) setTimeout(() => { G.entregues++; okf(pos()); }, 40); },
      watchPosition(okf) { G.pedidos++; const ligadaAoPedir = G.ligada; if (ligadaAoPedir) setTimeout(() => { G.entregues++; okf(pos()); }, 40); return 1; },
      clearWatch() {},
    };
    Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => geo, configurable: true });
  })();` });
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-teste="ativar-localizacao"]:visible', { timeout: 45000 }).catch(() => {});
  ok('pedidos pendurados: ao fim de pouco tempo a app pede para ligar a localização', await p.locator('[data-teste="ativar-localizacao"]:visible').count() > 0);
  const t0 = Date.now();
  await p.evaluate(() => { window.__geo.ligada = true; });
  const apareceu = await p.waitForFunction(() => ![...document.querySelectorAll('[data-teste="ativar-localizacao"]')].some((e) => e.getBoundingClientRect().width > 0),
    null, { timeout: 10000 }).then(() => true).catch(() => false);
  const ms = Date.now() - t0;
  ok('pedidos pendurados: ao ligar a localização, aparece sozinha e depressa (menos de 4 s)', apareceu && ms < 4000, `${ms} ms`);
  ok('sem erros na página (pendurados)', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

{ // sem sinal de GPS (dentro de casa): o telemóvel só dá a posição guardada (sempre a mesma) e o GPS nunca responde.
  // A app não pode ficar presa em «A localizar…» a recomeçar sem parar (aconteceu a 26/11/2026, logo depois de publicar).
  const { ctx, p, erros } = await contexto('granted');
  await p.addInitScript({ content: `(() => {
    const G = window.__geo; G.ligada = true; G.watchs = 0;
    const T0 = Date.now() - 30000;
    const pos = () => ({ coords: { latitude: 41.15054, longitude: -8.586245, accuracy: 900, heading: null, speed: null, altitude: null, altitudeAccuracy: null }, timestamp: T0 });
    const tempo = { code: 3, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'Timeout expired' };
    const geo = {
      getCurrentPosition(okf, err, o) { G.pedidos++; setTimeout(() => { if (o && o.enableHighAccuracy) err && err(tempo); else okf(pos()); }, 40); },
      watchPosition(okf, err) { G.pedidos++; G.watchs++; setTimeout(() => err && err(tempo), 40); return G.watchs; },
      clearWatch() {},
    };
    Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => geo, configurable: true });
  })();` });
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(4000);
  const a = await p.evaluate(() => window.__geo.watchs);
  await p.waitForTimeout(8000);
  const b = await p.evaluate(() => window.__geo.watchs);
  const preso = await p.evaluate(() => [...document.querySelectorAll('body *')].some((e) => e.childElementCount === 0 && /A localizar…/.test(e.textContent || '') && e.getBoundingClientRect().width > 0));
  await p.screenshot({ path: `${SAIDA}/localizacao-automatica-3-sem-sinal.png` });
  ok('sem sinal de GPS: não recomeça a localização sem parar', b - a <= 1, `${b - a} recomeços em 8 s`);
  ok('sem sinal de GPS: não fica preso em «A localizar…»', !preso);
  ok('sem erros na página (sem sinal)', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

{ // posição aproximada dá, mas a precisa é recusada (permissão só «aproximada» ou GPS bloqueado): a verificação silenciosa
  // não pode pôr a app a recomeçar a localização sem parar («A localizar…» infinito)
  const { ctx, p, erros } = await contexto('granted');
  await p.addInitScript({ content: `(() => {
    const G = window.__geo; G.watchs = 0;
    const pos = () => ({ coords: { latitude: 41.15054, longitude: -8.586245, accuracy: 1200, heading: null, speed: null, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() });
    const negado = { code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'User denied Geolocation' };
    const geo = {
      getCurrentPosition(okf, err, o) { G.pedidos++; setTimeout(() => { if (o && o.enableHighAccuracy) err && err(negado); else okf(pos()); }, 40); },
      watchPosition(okf, err) { G.pedidos++; G.watchs++; setTimeout(() => err && err(negado), 60); return G.watchs; },
      clearWatch() {},
    };
    Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => geo, configurable: true });
  })();` });
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(3000);
  const a = await p.evaluate(() => window.__geo.watchs);
  await p.waitForTimeout(10000);
  const b = await p.evaluate(() => window.__geo.watchs);
  ok('só a posição aproximada dá: não entra num ciclo de recomeços', b - a <= 2, `${b - a} recomeços em 10 s`);
  ok('sem erros na página (aproximada)', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

// GPS lento: o 1.º GPS só chega ao fim de 20 s (como no telemóvel do Dinis com «precisão baixa», 26/11/2026: a PAROU
// demorava ~20 s e o Google Maps e a Moovit menos de 1 s). Os pedidos com tempo-limite mais curto dão «tempo esgotado».
const GPS_LENTO = (ligadaAoAbrir) => `(() => {
  const G = window.__geo; G.ligada = ${ligadaAoAbrir}; G.lento = 20000;
  const pos = () => ({ coords: { latitude: 41.14232, longitude: -8.496067, accuracy: 40, heading: null, speed: null, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() });
  const negado = { code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'User denied Geolocation' };
  const tempo = { code: 3, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'Timeout expired' };
  const pedido = (okf, err, o) => {
    G.pedidos++;
    if (!G.ligada) { setTimeout(() => err && err(negado), 30); return; }
    const espera = Math.max(0, G.lento - (Date.now() - (G.ligadaEm || 0)));
    const limite = o && Number.isFinite(o.timeout) ? o.timeout : Infinity;
    if (espera > limite) setTimeout(() => err && err(tempo), limite);
    else setTimeout(() => { G.entregues++; okf(pos()); }, espera);
  };
  const geo = { getCurrentPosition: pedido, watchPosition(okf, err) { pedido(okf, () => {}, {}); return 1; }, clearWatch() {} };
  Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => geo, configurable: true });
  if (G.ligada) G.ligadaEm = Date.now();
  // última posição conhecida, de ontem (a app guardou-a da última vez)
  localStorage.setItem('parou_ultima_posicao', JSON.stringify({ latitude: 41.1423, longitude: -8.4961, accuracy: 25, timestamp: Date.now() - 20 * 3600_000, source: 'gps_high' }));
})();`;
const semAtivar = () => ![...document.querySelectorAll('[data-teste="ativar-localizacao"]')].some((e) => e.getBoundingClientRect().width > 0);
const temParagens = () => [...document.querySelectorAll('[data-teste="paragem-perto"]')].some((e) => e.getBoundingClientRect().width > 0);
const aLocalizar = () => [...document.querySelectorAll('body *')].some((e) => e.childElementCount === 0 && /A localizar…/.test(e.textContent || '') && e.getBoundingClientRect().width > 0);

{ // abrir a app com a localização ligada mas o GPS lento: aparece logo a última posição conhecida e as paragens
  const { ctx, p, erros } = await contexto('granted');
  await p.addInitScript({ content: GPS_LENTO(true) });
  const t0 = Date.now();
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  const tCarregou = Date.now() - t0;
  const apareceu = await p.waitForFunction(temParagens, null, { timeout: 15000 }).then(() => true).catch(() => false);
  const ms = Date.now() - t0;
  await p.screenshot({ path: `${SAIDA}/localizacao-automatica-4-gps-lento.png` });
  ok('GPS lento (20 s) ao abrir: as paragens aparecem muito antes do GPS (última posição conhecida)', apareceu && ms < 12000, `${ms} ms (página carregada aos ${tCarregou} ms)`);
  ok('GPS lento ao abrir: não fica em «A localizar…»', !(await p.evaluate(aLocalizar)));
  ok('GPS lento ao abrir: diz que está a afinar a posição', await p.evaluate(() => /a afinar a posição/.test(document.body.innerText)));
  ok('sem erros na página (GPS lento)', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

{ // localização desligada ao abrir (o browser recusa); a pessoa liga-a e o GPS demora 20 s: a app não espera pelo GPS
  const { ctx, p, erros } = await contexto('granted');
  await p.addInitScript({ content: GPS_LENTO(false) });
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-teste="ativar-localizacao"]:visible', { timeout: 45000 }).catch(() => {});
  ok('desligada: a app pede para a ligar (e não mostra a posição antiga)', await p.locator('[data-teste="ativar-localizacao"]:visible').count() > 0);
  await p.waitForTimeout(2000);
  const t0 = Date.now();
  await p.evaluate(() => { window.__geo.ligada = true; window.__geo.ligadaEm = Date.now(); });
  const apareceu = await p.waitForFunction(semAtivar, null, { timeout: 15000 }).then(() => true).catch(() => false);
  const ms = Date.now() - t0;
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${SAIDA}/localizacao-automatica-5-ligada-gps-lento.png` });
  ok('ligada com GPS lento: mostra onde está em menos de 5 s (sem esperar os 20 s do GPS)', apareceu && ms < 5000, `${ms} ms`);
  ok('ligada com GPS lento: não fica em «A localizar…»', !(await p.evaluate(aLocalizar)));
  ok('sem erros na página (ligada, GPS lento)', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

// ---- Chrome real no Android (26/11/2026: no telemóvel do Dinis era preciso tocar em «Ativar localização» depois de
// ligar a localização, e na Moovit aparecia em 1 s; nos cenários de cima o browser diz sempre «autorizado», o que o
// Chrome real não faz com a localização do telemóvel desligada).
const convite = () => [...document.querySelectorAll('[data-teste="ativar-localizacao"]')].some((e) => e.getBoundingClientRect().width > 0);
// o telemóvel já entregou a posição à app e o convite saiu do ecrã
const comPosicao = () => window.__geo.entregues > 0 && ![...document.querySelectorAll('[data-teste="ativar-localizacao"]')].some((e) => e.getBoundingClientRect().width > 0);
{ // o Chrome diz «por pedir» enquanto a localização está desligada: a app fica no convite, sem pedidos; ao ligar, aparece sozinha
  const { ctx, p, erros } = await contexto('chrome-aviso');
  // registos de diagnóstico que a app manda ao servidor (26/11/2026: num telemóvel real ficava no convite e não chegava nada)
  const registos = [];
  p.on('request', (r) => { if (/\/api\/erros/.test(r.url())) { try { registos.push(r.postData() || String(r.postDataBuffer() || '')); } catch (e) { registos.push(''); } } });
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-teste="ativar-localizacao"]:visible', { timeout: 45000 }).catch(() => {});
  ok('Chrome real («por pedir»), desligada: a app mostra o convite para ligar', await p.evaluate(convite));
  await p.waitForTimeout(1500);
  const c0 = await p.evaluate(() => window.__geo.consultas);
  await p.waitForTimeout(3000);
  const c1 = await p.evaluate(() => window.__geo.consultas);
  const pedidos = await p.evaluate(() => window.__geo.pedidos);
  // pode perguntar ao GPS em silêncio (com a localização desligada e sem toque o Chrome recusa logo, sem pergunta nenhuma),
  // mas sem exagerar
  ok('Chrome real, desligada: no máximo um pedido silencioso a cada 0,3 s', pedidos <= 17, `${pedidos} pedidos em ~4,5 s`);
  ok('Chrome real, desligada: vai lendo a autorização, sem exagerar (4 a 16 vezes em 3 s)', c1 - c0 >= 4 && c1 - c0 <= 16, `${c1 - c0} leituras`);
  const t0 = Date.now();
  await p.evaluate(() => { window.__geo.ligada = true; });
  const apareceu = await p.waitForFunction(comPosicao, null, { timeout: 8000 }).then(() => true).catch(() => false);
  const ms = Date.now() - t0;
  ok('Chrome real («por pedir»): ao ligar a localização, a app pede e recebe a posição sem ninguém tocar em nada', apareceu, `${ms} ms`);
  ok('Chrome real («por pedir»): e fá-lo depressa (menos de 2 s)', apareceu && ms < 2000, `${ms} ms`);
  await p.waitForTimeout(1200);
  ok('Chrome real («por pedir»): fica com a posição (não volta ao convite nem fica em «A localizar…»)', await p.evaluate(semAtivar) && !(await p.evaluate(aLocalizar)));
  await p.screenshot({ path: `${SAIDA}/localizacao-automatica-6-chrome-real.png` });
  // já com a posição no ecrã, deixa de ler a autorização
  const c2 = await p.evaluate(() => window.__geo.consultas);
  await p.waitForTimeout(3000);
  const c3 = await p.evaluate(() => window.__geo.consultas);
  ok('Chrome real: com a posição no ecrã, deixa de ler a autorização', c3 - c2 <= 1, `${c3 - c2} leituras em 3 s`);
  await p.waitForTimeout(1800);
  const parada = registos.find((x) => /"tipo":"gps"/.test(x) && /parada há \d+ s/.test(x)) || '';
  ok('diagnóstico: parada no convite, a app conta ao servidor o estado (autorização, marcas guardadas), sem a posição',
    /permissão prompt/.test(parada) && /já deu 1/.test(parada) && /desligada na app 0/.test(parada) && !/41\.1|8\.58/.test(parada), parada.slice(0, 160));
  const ligou = registos.find((x) => /"tipo":"gps"/.test(x) && /ligou depois de \d+ s parada/.test(x)) || '';
  ok('diagnóstico: depois de ligar sozinha, manda os tempos de cada passo', /perm:granted/.test(ligou) && /auto:autorizacao/.test(ligou) && /st:active/.test(ligou) && !/41\.1|8\.58/.test(ligou), ligou.slice(0, 120));
  ok('sem erros na página (Chrome real, por pedir)', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

{ // o Chrome diz «recusada» enquanto a localização está desligada (pausa do aviso): ao ligar, aparece sozinha e depressa
  const { ctx, p, erros } = await contexto('chrome-pausa');
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-teste="ativar-localizacao"]:visible', { timeout: 45000 }).catch(() => {});
  ok('Chrome real («recusada»), desligada: a app pede para ligar a localização', await p.evaluate(convite));
  await p.waitForTimeout(2500);
  const t0 = Date.now();
  await p.evaluate(() => { window.__geo.ligada = true; });
  const apareceu = await p.waitForFunction(comPosicao, null, { timeout: 15000 }).then(() => true).catch(() => false);
  const ms = Date.now() - t0;
  ok('Chrome real («recusada»): ao ligar a localização, aparece sozinha em menos de 2 s', apareceu && ms < 2000, `${ms} ms`);
  await p.waitForTimeout(1200);
  ok('Chrome real («recusada»): fica com a posição (não volta ao pedido nem fica em «A localizar…»)', await p.evaluate(semAtivar) && !(await p.evaluate(aLocalizar)));
  ok('sem erros na página (Chrome real, recusada)', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

{ // Chrome real, GPS lento (20 s) e uma posição conhecida de ontem: ao ligar a localização, essa posição e as paragens
  // aparecem logo, sem o ecrã passar por «A localizar…» (26/11/2026: já ligava sozinha, mas a Moovit era muito mais rápida)
  const { ctx, p, erros } = await contexto('chrome-aviso');
  await p.addInitScript({ content: GPS_LENTO(false) });
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-teste="ativar-localizacao"]:visible', { timeout: 45000 }).catch(() => {});
  ok('Chrome real, GPS lento: desligada, a app mostra o convite', await p.evaluate(convite));
  await p.waitForTimeout(2000);
  // a cada fotograma depois de ligar: «A localizar…» esteve no ecrã? quando apareceram as paragens?
  await p.evaluate(() => {
    const G = window.__geo; G.viuALocalizar = false; G.tParagens = 0;
    const visto = (re) => [...document.querySelectorAll('body *')].some((e) => e.childElementCount === 0 && re.test(e.textContent || '') && e.getBoundingClientRect().width > 0);
    const passo = () => {
      if (visto(/A localizar…/)) G.viuALocalizar = true;
      if ([...document.querySelectorAll('[data-teste="paragem-perto"]')].some((e) => e.getBoundingClientRect().width > 0)) { G.tParagens = Date.now() - G.ligadaEm; return; }
      requestAnimationFrame(passo);
    };
    G.ligadaEm = Date.now(); G.ligada = true;
    requestAnimationFrame(passo);
  });
  await p.waitForFunction(() => window.__geo.tParagens > 0, null, { timeout: 10000 }).catch(() => {});
  const r = await p.evaluate(() => ({ t: window.__geo.tParagens, viu: window.__geo.viuALocalizar, entregues: window.__geo.entregues }));
  await p.screenshot({ path: `${SAIDA}/localizacao-automatica-7-chrome-real-gps-lento.png` });
  ok('Chrome real, GPS lento: ao ligar, as paragens da última posição conhecida aparecem em menos de 1 s (sem esperar pelo GPS)', r.t > 0 && r.t < 1000 && r.entregues === 0, `${r.t} ms`);
  ok('Chrome real, GPS lento: o ecrã não passa por «A localizar…»', r.t > 0 && !r.viu);
  ok('Chrome real, GPS lento: diz que está a afinar a posição', await p.evaluate(() => /a afinar a posição/.test(document.body.innerText)));
  ok('sem erros na página (Chrome real, GPS lento)', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

{ // a pessoa sai da app para ligar a localização nas Definições e volta: com a página escondida nada acontece; ao voltar, aparece
  const { ctx, p, erros } = await contexto('chrome-aviso');
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-teste="ativar-localizacao"]:visible', { timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(800);
  const c0 = await p.evaluate(() => window.__geo.consultas);
  const p0 = await p.evaluate(() => window.__geo.pedidos);
  await p.evaluate(() => { window.__geo.ligada = true; });
  await p.waitForTimeout(3000);
  const escondida = await p.evaluate(() => ({ consultas: window.__geo.consultas, pedidos: window.__geo.pedidos }));
  ok('página escondida: não lê a autorização nem faz pedidos', escondida.consultas - c0 <= 1 && escondida.pedidos - p0 === 0, `${escondida.consultas - c0} leituras, ${escondida.pedidos - p0} pedidos`);
  const t0 = Date.now();
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const apareceu = await p.waitForFunction(comPosicao, null, { timeout: 8000 }).then(() => true).catch(() => false);
  const ms = Date.now() - t0;
  ok('de volta à app com a localização já ligada: aparece sozinha em menos de 2 s', apareceu && ms < 2000, `${ms} ms`);
  ok('sem erros na página (voltar das Definições)', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

{ // o site está autorizado no Chrome mas a marca «já deu a localização» não está no telemóvel (dados do site apagados):
  // ao ligar a localização, liga sozinha na mesma (passar a «autorizado» já prova que o site está autorizado)
  const { ctx, p, erros } = await contexto('chrome-aviso');
  await p.addInitScript({ content: `try { localStorage.removeItem('parou_localizacao_ok'); } catch (e) {}` });
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-teste="ativar-localizacao"]:visible', { timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(2500);
  ok('sem a marca guardada: desligada, nenhum pedido de localização', await p.evaluate(() => window.__geo.pedidos === 0));
  const t0 = Date.now();
  await p.evaluate(() => { window.__geo.ligada = true; });
  const apareceu = await p.waitForFunction(comPosicao, null, { timeout: 8000 }).then(() => true).catch(() => false);
  const ms = Date.now() - t0;
  ok('sem a marca guardada: ao ligar a localização, liga sozinha em menos de 3 s', apareceu && ms < 3000, `${ms} ms`);
  ok('sem erros na página (sem a marca guardada)', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

{ // telemóvel do Dinis (app da Play): o Chrome diz sempre «por pedir», mesmo com a localização ligada, mas dá a posição sem
  // perguntar. Ao ligar a localização, a app tem de mostrar onde ele está sozinha (26/11/2026, 16:43: ficava no convite)
  const { ctx, p, erros } = await contexto('chrome-sempre-por-pedir');
  const registos = [];
  p.on('request', (r) => { if (/\/api\/erros/.test(r.url())) { try { registos.push(r.postData() || String(r.postDataBuffer() || '')); } catch (e) { registos.push(''); } } });
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-teste="ativar-localizacao"]:visible', { timeout: 45000 }).catch(() => {});
  ok('sempre «por pedir», desligada: a app mostra o convite', await p.evaluate(convite));
  await p.waitForTimeout(3000);
  const t0 = Date.now();
  await p.evaluate(() => { window.__geo.ligada = true; });
  const apareceu = await p.waitForFunction(comPosicao, null, { timeout: 8000 }).then(() => true).catch(() => false);
  const ms = Date.now() - t0;
  ok('sempre «por pedir»: ao ligar a localização, mostra onde ele está sem tocar em nada (menos de 0,8 s)', apareceu && ms < 800, `${ms} ms`);
  await p.waitForTimeout(1500);
  ok('sempre «por pedir»: fica com a posição (não volta ao convite)', await p.evaluate(semAtivar) && !(await p.evaluate(aLocalizar)));
  await p.waitForTimeout(5000);
  const ligou = registos.find((x) => /ligou depois de/.test(x)) || '';
  ok('sempre «por pedir»: o registo de diagnóstico mostra a sonda a passar de «recusado» a «posição»', /sonda:erro1-por-pedir/.test(ligou) && /sonda:ok-por-pedir/.test(ligou), ligou.slice(0, 160));
  ok('sem erros na página (sempre por pedir)', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

{ // já deu a localização à PAROU, mas a autorização do site foi retirada: ligar a localização do telemóvel pode levar a, no
  // máximo, UMA pergunta do browser sem toque (para quem já a deu), nunca a perguntas repetidas
  const { ctx, p, erros } = await contexto('prompt-ja-deu');
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-teste="ativar-localizacao"]:visible', { timeout: 45000 }).catch(() => {});
  await p.evaluate(() => { window.__geo.ligada = true; });
  await p.waitForTimeout(9000);
  const perguntas = await p.evaluate(() => window.__geo.perguntas || 0);
  ok('autorização do site retirada: no máximo uma pergunta do browser sem toque (nunca em ciclo)', perguntas <= 1, `${perguntas} perguntas em 9 s`);
  ok('autorização do site retirada: continua o convite', await p.evaluate(convite));
  ok('sem erros na página (autorização retirada)', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

{ // nunca autorizou o site: a app não pergunta sozinha (a pergunta do browser só com um toque)
  const { ctx, p, erros } = await contexto('prompt');
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-teste="ativar-localizacao"]:visible', { timeout: 45000 }).catch(() => {});
  await p.evaluate(() => { window.__geo.ligada = true; });
  await p.waitForTimeout(5000);
  const pedidos = await p.evaluate(() => window.__geo.pedidos);
  ok('site nunca autorizado: nenhum pedido de localização sem um toque', pedidos === 0, `${pedidos} pedidos`);
  const consultas = await p.evaluate(() => window.__geo.consultas);
  ok('site nunca autorizado: lê a autorização devagar (no máximo ~1 vez por segundo)', consultas <= 9, `${consultas} leituras`);
  ok('sem erros na página (sem autorização)', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

{ // página escondida (outra app à frente): não se pergunta
  const { ctx, p } = await contexto('granted');
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-teste="ativar-localizacao"]:visible', { timeout: 45000 }).catch(() => {});
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(500);
  const a = await p.evaluate(() => window.__geo.pedidos);
  await p.waitForTimeout(5000);
  const b = await p.evaluate(() => window.__geo.pedidos);
  ok('com a página escondida não se fazem pedidos', b === a, `${b - a} pedidos`);
  await ctx.close();
}

await browser.close();
console.log();
console.log(falhas ? `${falhas} falha(s)` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
