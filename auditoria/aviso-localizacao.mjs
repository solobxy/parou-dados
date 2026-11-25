// Android + Chrome com a localização do telemóvel desligada (25/11/2026). O aviso do Android «Ligar a localização?»
// é aberto pelo Chrome, não pelo site, e só quando: (1) o pedido de localização nasce de um toque; (2) o Chrome não
// está na pausa que faz depois de alguém recusar esse aviso (7, 30, 90 dias, em todos os sites).
// O Blink só manda ao Chrome o «houve toque» quando abre uma ligação nova de localização: se já houver um pedido
// pendente ou um seguimento ligado no momento do toque, o pedido do toque aproveita essa ligação e o aviso nunca aparece.
// Aqui simula-se esse comportamento do Chrome e confirma-se que:
//  - o pedido do toque abre uma ligação nova, com o toque;
//  - quando o Chrome recusa logo (pausa), a PAROU explica de imediato como ligar e como recuperar o aviso;
//  - quando o aviso aparece e a pessoa diz que não, ou ao abrir a app sem toque, essa explicação não aparece.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

// Imitação do Chrome no Android: uma ligação partilhada por todos os pedidos; o toque só conta ao abri-la.
const CHROME = (modo) => `(() => {
  const G = { ligada: null, pend: new Set(), watches: new Map(), id: 1, log: [] };
  window.__geo = G;
  const erro = { code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'User denied Geolocation' };
  function pedir(n) {
    G.pend.add(n);
    if (G.ligada) { G.log.push({ t: performance.now(), nova: false }); return; }
    const gesto = !!(navigator.userActivation && navigator.userActivation.isActive);
    const lig = { gesto };
    G.ligada = lig;
    G.log.push({ t: performance.now(), nova: true, gesto, pendentesAntes: G.pend.size - 1 });
    // ${modo}: 'pausa' = o Chrome recusa logo (sem aviso); 'aviso' = com toque o aviso aparece e a pessoa diz «Não» ao fim de 2,5 s
    const atraso = ('${modo}' === 'aviso' && gesto) ? 2500 : 30;
    setTimeout(() => {
      if (G.ligada !== lig) return;
      G.ligada = null;
      const todos = [...G.pend]; G.pend.clear(); G.watches.clear();
      for (const x of todos) try { x.err && x.err(erro); } catch (e) {}
    }, atraso);
  }
  const geo = {
    getCurrentPosition(okf, err) { pedir({ okf, err }); },
    watchPosition(okf, err) { const n = { okf, err }; const id = G.id++; G.watches.set(id, n); pedir(n); return id; },
    clearWatch(id) { const n = G.watches.get(id); if (n) { G.watches.delete(id); G.pend.delete(n); } if (G.pend.size === 0) G.ligada = null; },
  };
  Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => geo, configurable: true });
  const q = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (d) => (d && d.name === 'geolocation') ? Promise.resolve({ state: 'granted', onchange: null }) : q(d);
  try { localStorage.setItem('parou_aviso_instalar', '1'); localStorage.setItem('parou_bemvindo', 'visto'); localStorage.setItem('parou_localizacao_ok', '1'); } catch (e) {}
})();`;

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
async function cenario(modo, ua) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', hasTouch: true, isMobile: true, userAgent: ua, serviceWorkers: 'block' });
  await ctx.addInitScript({ content: CHROME(modo) });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (rt) => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-teste="ativar-localizacao"]:visible', { timeout: 45000 });
  await p.waitForTimeout(800);
  const antes = await p.locator('[data-teste="sem-aviso-android"]').count();
  const nLog = await p.evaluate(() => window.__geo.log.length);
  const tToque = await p.evaluate(() => performance.now());
  await p.locator('[data-teste="ativar-localizacao"]:visible').first().tap();
  await p.waitForTimeout(modo === 'aviso' ? 3500 : 600);
  const log = await p.evaluate((n) => window.__geo.log.slice(n), nLog);
  const depois = await p.locator('[data-teste="sem-aviso-android"]:visible').count();
  const texto = depois ? await p.locator('[data-teste="sem-aviso-android"]').innerText() : '';
  // O cartão não pode ficar tapado: «Escolher um local» tem de estar à vista e ser o elemento por cima do seu centro
  const localVisivel = await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Escolher um local' && x.getBoundingClientRect().width > 0);
    if (!b) return false;
    const r = b.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!e && (e === b || b.contains(e));
  });
  await p.screenshot({ path: `${SAIDA}/aviso-localizacao-${modo}-${/iPhone/.test(ua) ? 'iphone' : 'android'}.png` });
  await ctx.close();
  return { antes, log, depois, texto, erros, tToque, localVisivel };
}
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

{
  const r = await cenario('pausa', ANDROID);
  ok('[abrir] ao abrir a app (sem toque) não aparece a explicação do aviso em falta', r.antes === 0);
  const primeira = r.log.find((x) => x.nova);
  ok('[toque] o toque abre uma ligação de localização nova', !!primeira && r.log[0]?.nova === true, JSON.stringify(r.log.slice(0, 3)));
  ok('[toque] essa ligação leva o toque (o Chrome pode mostrar o aviso)', primeira?.gesto === true, JSON.stringify(primeira));
  ok('[toque] não havia nenhum pedido pendente a ocupar a ligação', primeira?.pendentesAntes === 0, JSON.stringify(primeira));
  ok('[pausa] o Chrome recusou logo: a PAROU explica de imediato', r.depois === 1);
  ok('[pausa] a explicação diz como ligar e como recuperar o aviso', /Desliza o dedo/.test(r.texto) && /repõe as permissões/.test(r.texto) && /Ativar localização/.test(r.texto), r.texto.slice(0, 160));
  ok('[pausa] «Escolher um local» continua à vista (o cartão não fica tapado)', r.localVisivel);
  ok('[pausa] sem erros de JavaScript', r.erros.length === 0, r.erros.join(' | '));
}
{
  const r = await cenario('aviso', ANDROID);
  ok('[aviso] o aviso apareceu e a pessoa disse «Não»: não se fala de aviso em falta', r.depois === 0, r.texto.slice(0, 80));
  ok('[aviso] o toque abriu a ligação com o toque', r.log.find((x) => x.nova)?.gesto === true);
}
{
  const r = await cenario('pausa', IPHONE);
  ok('[iPhone] não há aviso do Android: a explicação não aparece', r.depois === 0);
}
await browser.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
