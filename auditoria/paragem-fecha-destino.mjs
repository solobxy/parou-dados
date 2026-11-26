// Com uma paragem aberta, escolher um destino na pesquisa fecha a paragem e mostra as opções de viagem.
//
// O problema que isto impede (queixa real, 26/11/2026): a paragem ficava aberta por cima das opções e era preciso fechá-la à
// mão para ver como chegar. Testa-se em 320 e 390 px (no computador a paragem ocupa o lugar da pesquisa). As paragens perto vêm do servidor a sério;
// a pesquisa e o cálculo da viagem são simulados (o que se testa é o ecrã).
// Também: a duração mostrada é a da viagem (05:45 → 06:36 = 51 min), não o tempo desde agora (às 01:56 eram «4 h 40 min»).
// Uso: BASE=http://127.0.0.1:3000 SAIDA=res node paragem-fecha-destino.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const UA_TEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const CAMPANHA = { latitude: 41.14871, longitude: -8.58483 };
const DESTINO = { id: 'teste:trindade', title: 'Estação da Trindade', subtitle: 'Porto', latitude: 41.15228, longitude: -8.609299, type: 'PLACE' };
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const RESPOSTA = {
  routes: [{
    id: 'm1', type: 'fastest', title: '', badgeLabel: 'Melhor opção', highlight: 'melhor', totalDurationMinutes: 280, departureTime: '05:45', arrivalTime: '06:36', // pedido às 01:56
    walkingDistanceMeters: 300, walkingMinutes: 4, transfersCount: 0, realtimeStatus: 'PROGRAMADO', realtimeLabel: 'Horário', relevantAlerts: [],
    legs: [{ mode: 'WALK', instruction: 'A pé', durationMinutes: 2, distanceMeters: 150 },
      { mode: 'TRANSIT', instruction: '', transportMode: 'Metro', lineCode: 'F', lineName: 'F', lineColor: '#F57F17', operatorName: 'Metro do Porto', fromStopName: 'Campanhã', toStopName: 'Trindade', stopsCount: 4, durationMinutes: 8, departureTime: '05:48', arrivalTime: '06:32' },
      { mode: 'WALK', instruction: 'A pé', durationMinutes: 2, distanceMeters: 120 }],
  }],
  unir: [], originCoords: { lat: CAMPANHA.latitude, lon: CAMPANHA.longitude }, destCoords: { lat: DESTINO.latitude, lon: DESTINO.longitude }, destName: DESTINO.title,
};

async function ecra(browser, largura) {
  const tel = largura < 700;
  const ctx = await browser.newContext({
    viewport: { width: largura, height: tel ? 800 : 900 }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', hasTouch: tel, isMobile: tel,
    userAgent: tel ? UA_TEL : undefined, geolocation: CAMPANHA, permissions: ['geolocation'],
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); }catch(e){}
    try{ localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); }catch(e){}` });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route('**/api/transit/destinations**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: [DESTINO] }) }));
  await ctx.route('**/api/transit/plan-route**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESPOSTA) }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  try {
    await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
    const paragem = p.locator('[data-teste="paragem-perto"]:visible').first();
    await paragem.waitFor({ state: 'visible', timeout: 40000 });
    await paragem.click();
    const painel = p.locator('.painel-paragem');
    await painel.first().waitFor({ state: 'visible', timeout: 10000 });
    ok(`[${largura}] a paragem abriu`, (await painel.count()) === 1);
    const campo = p.locator('input[placeholder="Para onde vais?"]:visible').first();
    await campo.click({ timeout: 8000 });
    await campo.fill('trindade');
    const sugestao = p.locator(`button:visible:has-text("${DESTINO.title}")`).first();
    await sugestao.waitFor({ state: 'visible', timeout: 10000 });
    await sugestao.click();
    await p.locator('[data-teste="opcao-rota"]').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(800);
    ok(`[${largura}] ao escolher o destino a paragem fecha`, (await painel.count()) === 0);
    ok(`[${largura}] as opções de viagem ficam à vista`, await p.locator('[data-teste="opcao-rota"]').first().isVisible().catch(() => false));
    const cartao = (await p.locator('[data-teste="opcao-rota"]').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    ok(`[${largura}] a duração é a da viagem (51 min), não desde agora (4 h 40)`, /^51 min/.test(cartao) && !/4 h/.test(cartao), cartao.slice(0, 60));
    await p.screenshot({ path: `${SAIDA}/paragem-fecha-destino_${largura}.png` });
    ok(`[${largura}] continua na app (o voltar da paragem não saiu da página)`, new URL(p.url()).origin === new URL(BASE).origin);
    ok(`[${largura}] sem erros na página`, erros.length === 0, erros.join(' | '));
  } catch (e) {
    ok(`[${largura}] o ecrã abriu`, false, String(e).slice(0, 200));
    await p.screenshot({ path: `${SAIDA}/paragem-fecha-destino_${largura}_erro.png` }).catch(() => {});
  }
  await ctx.close();
}

const browser = await chromium.launch();
for (const l of [320, 390]) await ecra(browser, l);
await browser.close();
console.log();
console.log(falhas ? `${falhas} falha(s)` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
