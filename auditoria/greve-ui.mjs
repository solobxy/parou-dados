// Greve oficial num troço do trajeto: o resumo da opção avisa logo («Greve na CP · pode não circular») e, ao abrir,
// o troço do comboio explica e liga ao aviso oficial. Opções sem greve não mostram nada. Em 320, 390 e 1280 px, nos temas
// Claro, Escuro e Âmbar, sem scroll para o lado. A resposta do servidor é simulada (a regra testa-se em greve-trajeto.mjs).
// Uso: BASE=http://127.0.0.1:3000 SAIDA=res node greve-ui.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const UA_TEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const CAMPANHA = { latitude: 41.15054, longitude: -8.586245 };
const DESTINO = { id: 'teste:trindade', title: 'Estação da Trindade', subtitle: 'Porto', latitude: 41.15228, longitude: -8.609299, type: 'PLACE' };
const AVISO = 'https://www.cp.pt/pt/detalhe-aviso/greve-23a27-nov';

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const aPe = (min, m) => ({ mode: 'WALK', instruction: 'A pé', durationMinutes: min, distanceMeters: m });
const troco = (codigo, cor, de, para, sai, chega, modo = 'Metro', op = 'Metro do Porto') => ({
  mode: 'TRANSIT', instruction: '', transportMode: modo, lineCode: codigo, lineName: codigo, lineColor: cor, operatorName: op,
  fromStopName: de, toStopName: para, stopsCount: 4, durationMinutes: 8, departureTime: sai, arrivalTime: chega,
});
const GREVE = { titulo: 'Greve - serviços mínimos', url: AVISO, operador: 'CP' };
const opcao = (id, legs, extra = {}) => ({
  id, type: 'fastest', title: '', badgeLabel: '', totalDurationMinutes: 14, departureTime: '10:02', arrivalTime: '10:16',
  walkingDistanceMeters: 300, walkingMinutes: 4, transfersCount: legs.filter((l) => l.mode === 'TRANSIT').length - 1,
  legs, realtimeStatus: 'PROGRAMADO', realtimeLabel: 'Horário', relevantAlerts: [], ...extra,
});
const RESPOSTA = {
  routes: [
    opcao('m1', [aPe(2, 150), troco('F', '#F57F17', 'Campanhã', 'Trindade', '10:04', '10:12'), aPe(2, 120)], { highlight: 'melhor', badgeLabel: 'Melhor opção' }),
    // cadeia comprida (a quebrar linha em 320 px) e Z10 inexistente não: Z3 com transbordo
    opcao('m2', [aPe(4, 300), troco('205', '#1565C0', 'Campanhã (Estação)', 'Bolhão', '10:05', '10:11', 'Autocarro', 'STCP'), aPe(3, 200),
      troco('D', '#FBC02D', 'Bolhão', 'Trindade', '10:15', '10:17'), troco('A', '#1E88E5', 'Trindade', 'Senhora da Hora', '10:20', '10:31'), aPe(5, 380)],
    { totalDurationMinutes: 33, arrivalTime: '10:35' }),
    opcao('c1', [aPe(1, 60), { ...troco('CP', '#111111', 'Porto Campanhã', 'Porto São Bento', '10:08', '10:13', 'Comboio', 'CP'), greve: GREVE }, aPe(9, 700)],
      { totalDurationMinutes: 20, arrivalTime: '10:22' }),
  ],
  unir: [], originCoords: { lat: CAMPANHA.latitude, lon: CAMPANHA.longitude }, destCoords: { lat: DESTINO.latitude, lon: DESTINO.longitude }, destName: DESTINO.title,
};

async function ecra(browser, largura, tema) {
  const tel = largura < 700;
  const ctx = await browser.newContext({
    viewport: { width: largura, height: tel ? 800 : 900 }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', hasTouch: tel, isMobile: tel,
    userAgent: tel ? UA_TEL : undefined, geolocation: CAMPANHA, permissions: ['geolocation'], deviceScaleFactor: 2,
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); }catch(e){}
    try{ localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_tema', ${JSON.stringify(tema)}); }catch(e){}` });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route('**/api/transit/destinations**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: [DESTINO] }) }));
  await ctx.route('**/api/transit/plan-route**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESPOSTA) }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  const nome = `greve_${largura}_${tema}`;
  try {
    await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForTimeout(4000);
    const campo = p.locator('input[placeholder="Para onde vais?"]:visible').first();
    await campo.click({ timeout: 8000 });
    await campo.fill('trindade');
    const sugestao = p.locator(`button:visible:has-text("${DESTINO.title}")`).first();
    await sugestao.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await sugestao.click({ timeout: 8000 });
    await p.locator('[data-teste="opcao-rota"]').first().waitFor({ state: 'visible', timeout: 15000 });
    await p.waitForTimeout(800);

    const cartoes = p.locator('[data-teste="opcao-rota"]');
    const cartaoCp = cartoes.filter({ hasText: 'Porto Campanhã' });
    const resumo = (await cartaoCp.locator('[data-teste="greve-rota"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
    ok(`[${largura} ${tema}] o resumo da opção com CP avisa da greve`, /Greve na CP · pode não circular/.test(resumo), resumo);
    const outras = await p.locator('[data-teste="greve-rota"]:visible').count();
    ok(`[${largura} ${tema}] só a opção com greve avisa`, outras === 1, String(outras));
    await p.screenshot({ path: `${SAIDA}/${nome}_lista.png` });
    await cartaoCp.click();
    const troco = p.locator('[data-teste="greve-troco"]:visible').first();
    await troco.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    const txt = (await troco.innerText().catch(() => '')).replace(/\s+/g, ' ');
    ok(`[${largura} ${tema}] no troço do comboio: explicação e aviso oficial`, /Greve na CP à hora desta viagem: pode não circular/.test(txt) && /Aviso oficial/.test(txt), txt);
    const href = await troco.locator('a').first().getAttribute('href').catch(() => '');
    ok(`[${largura} ${tema}] ligação ao aviso oficial da CP`, href === AVISO, String(href));
    const alvo = await troco.locator('a').first().evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => 0);
    ok(`[${largura} ${tema}] ligação com alvo de toque de 40 px`, alvo >= 40, String(alvo));
    const lateral = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`[${largura} ${tema}] sem scroll para o lado`, lateral <= 0, `${lateral}px`);
    const contraste = await troco.evaluate((el) => {
      const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
      const fundo = (n) => { while (n) { const b = getComputedStyle(n).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; n = n.parentElement; } return 'rgb(255,255,255)'; };
      const a = lum(getComputedStyle(el).color), b = lum(fundo(el));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    ok(`[${largura} ${tema}] texto do aviso com contraste ≥ 4,5:1`, contraste >= 4.5, contraste.toFixed(2));
    await troco.scrollIntoViewIfNeeded().catch(() => {});
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${SAIDA}/${nome}_aberta.png` });
    ok(`[${largura} ${tema}] sem erros na página`, erros.length === 0, erros.join(' | '));
  } catch (e) {
    ok(`[${largura} ${tema}] o ecrã abriu`, false, String(e).slice(0, 200));
    await p.screenshot({ path: `${SAIDA}/${nome}_erro.png` }).catch(() => {});
  }
  await ctx.close();
}

const browser = await chromium.launch();
for (const [largura, tema] of [[320, 'claro'], [390, 'claro'], [390, 'escuro'], [390, 'ambar'], [1280, 'claro'], [320, 'escuro']]) {
  await ecra(browser, largura, tema);
}
await browser.close();
console.log();
console.log(falhas ? `${falhas} falha(s)` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
