// Partilhar a viagem, no ecrã: «Partilhar a viagem» nos detalhes da opção cria a ligação (sem folha de partilha, copia-a),
// aparece a faixa «A partilhar…» com «Parar», a página da ligação mostra o destino, a hora de chegada, os transportes e a
// posição, e depois de «Parar» diz que acabou. Em 320, 390 e 1280 px. O planeador é simulado; a partilha é a do servidor.
// Uso: BASE=http://127.0.0.1:3000 SAIDA=res node partilha-ui.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const UA_TEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const CAMPANHA = { latitude: 41.15054, longitude: -8.586245 };
const DESTINO = { id: 'teste:trindade', title: 'Estação da Trindade', subtitle: 'Porto', latitude: 41.15228, longitude: -8.609299, type: 'PLACE' };
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const hm = (ms) => new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' }).format(ms);
const SAI = hm(Date.now() + 5 * 60_000), CHEGA = hm(Date.now() + 25 * 60_000);
const RESPOSTA = {
  routes: [{
    id: 'm1', type: 'fastest', title: '', badgeLabel: 'Melhor opção', highlight: 'melhor', totalDurationMinutes: 20, departureTime: SAI, arrivalTime: CHEGA,
    walkingDistanceMeters: 300, walkingMinutes: 4, transfersCount: 0, realtimeStatus: 'PROGRAMADO', realtimeLabel: 'Horário', relevantAlerts: [],
    legs: [{ mode: 'WALK', instruction: '', durationMinutes: 2, distanceMeters: 150 },
      { mode: 'TRANSIT', instruction: '', transportMode: 'Metro', lineCode: 'F', lineColor: '#F57F17', operatorName: 'Metro do Porto', fromStopName: 'Campanhã', toStopName: 'Trindade', stopsCount: 4, durationMinutes: 8, departureTime: SAI, arrivalTime: CHEGA },
      { mode: 'WALK', instruction: '', durationMinutes: 2, distanceMeters: 120 }],
  }],
  unir: [], originCoords: { lat: CAMPANHA.latitude, lon: CAMPANHA.longitude }, destCoords: { lat: DESTINO.latitude, lon: DESTINO.longitude }, destName: DESTINO.title,
};

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', hasTouch: true, isMobile: true, userAgent: UA_TEL,
  geolocation: CAMPANHA, permissions: ['geolocation', 'clipboard-read', 'clipboard-write'], deviceScaleFactor: 2,
});
await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); }catch(e){}
  try{ Object.defineProperty(Navigator.prototype,'share',{value:undefined,configurable:true}); }catch(e){}
  try{ localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); }catch(e){}` });
await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await ctx.route('**/api/transit/destinations**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: [DESTINO] }) }));
await ctx.route('**/api/transit/plan-route**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESPOSTA) }));
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
let url = '';
try {
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(4000);
  const campo = p.locator('input[placeholder="Para onde vais?"]:visible').first();
  await campo.click({ timeout: 8000 });
  await campo.fill('trindade');
  await p.locator(`button:visible:has-text("${DESTINO.title}")`).first().click({ timeout: 10000 });
  await p.locator('[data-teste="opcao-rota"]').first().click({ timeout: 15000 });
  const botao = p.locator('[data-teste="partilhar-viagem"]:visible').first();
  await botao.waitFor({ state: 'visible', timeout: 8000 });
  const alvo = await botao.evaluate((el) => Math.round(el.getBoundingClientRect().height));
  ok('o botão «Partilhar a viagem» aparece nos detalhes da opção, com alvo de 40 px', alvo >= 40, String(alvo));
  await botao.click();
  await p.locator('[data-teste="partilha-em-curso"]:visible').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  ok('aparece a faixa «A partilhar a viagem…»', await p.locator('[data-teste="partilha-em-curso"]:visible').count() === 1);
  const copiado = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  url = (copiado.match(/https:\/\/parou\.pt\/v\/[a-z0-9]{12}/) || [''])[0];
  ok('sem folha de partilha, a mensagem com a ligação fica copiada', !!url && copiado.includes(`chego por volta das ${CHEGA}`), copiado);
  ok('o botão sai enquanto a partilha está ativa', await p.locator('[data-teste="partilhar-viagem"]:visible').count() === 0);
  await p.locator('[data-teste="partilha-em-curso"]').first().scrollIntoViewIfNeeded().catch(() => {});
  await p.screenshot({ path: `${SAIDA}/partilha-1-telemovel.png` });
} catch (e) {
  ok('o ecrã da partilha abriu', false, String(e).slice(0, 200));
  await p.screenshot({ path: `${SAIDA}/partilha-erro.png` }).catch(() => {});
}

// A página da ligação, em vários tamanhos
const caminho = url.replace('https://parou.pt', '');
for (const largura of [320, 390, 1280]) {
  const v = await ctx.newPage();
  await v.setViewportSize({ width: largura, height: largura < 700 ? 800 : 900 });
  try {
    await v.goto(BASE + caminho, { waitUntil: 'load', timeout: 60000 });
    await v.locator('[data-teste="viagem-partilhada"]').waitFor({ state: 'visible', timeout: 15000 });
    await v.waitForTimeout(1500);
    const txt = (await v.locator('[data-teste="viagem-partilhada"]').innerText()).replace(/\s+/g, ' ');
    ok(`[${largura}] página da ligação: destino e hora de chegada`, txt.includes('Estação da Trindade') && txt.includes(`Chegada prevista às ${CHEGA}`), txt.slice(0, 120));
    ok(`[${largura}] página da ligação: o transporte`, txt.includes('Campanhã') && txt.includes('Trindade'));
    ok(`[${largura}] página da ligação: a posição está atualizada`, /Posição atualizada há/.test(txt));
    const lateral = await v.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`[${largura}] sem scroll para o lado`, lateral <= 0, `${lateral}px`);
    await v.screenshot({ path: `${SAIDA}/partilha-2-pagina-${largura}.png` });
  } catch (e) {
    ok(`[${largura}] a página da ligação abriu`, false, String(e).slice(0, 200));
    await v.screenshot({ path: `${SAIDA}/partilha-2-pagina-${largura}-erro.png` }).catch(() => {});
  }
  await v.close();
}

// Parar
try {
  await p.locator('[data-teste="parar-partilha"]:visible').first().click({ timeout: 8000 });
  await p.waitForTimeout(1000);
  ok('«Parar» tira a faixa', await p.locator('[data-teste="partilha-em-curso"]:visible').count() === 0);
  const v = await ctx.newPage();
  await v.goto(BASE + caminho, { waitUntil: 'load', timeout: 60000 });
  await v.locator('[data-teste="viagem-acabou"]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  ok('depois de parar, a ligação diz que a partilha acabou', await v.locator('[data-teste="viagem-acabou"]').count() === 1);
  await v.screenshot({ path: `${SAIDA}/partilha-3-acabou.png` });
} catch (e) {
  ok('parar a partilha', false, String(e).slice(0, 200));
}
ok('sem erros na página', erros.length === 0, erros.join(' | '));
await browser.close();
console.log();
console.log(falhas ? `${falhas} falha(s)` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
