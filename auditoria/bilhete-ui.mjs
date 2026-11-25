// Bilhete Andante nas opções de viagem: o preço aparece no resumo (como no Google Maps) e o título, quanto tempo vale, o cartão
// Azul e as ligações oficiais aparecem ao abrir a opção. Opções sem tarifa não mostram nada. Tem de caber em 320, 390 e
// 1280 px, nos temas Claro, Escuro e Âmbar, sem scroll para o lado e sem o preço ficar por cima das linhas.
// A resposta do servidor é simulada (o cálculo testa-se em tarifa-andante.mjs); o que se testa é o ecrã.
// Uso: BASE=http://127.0.0.1:3000 SAIDA=res node bilhete-ui.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const UA_TEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const CAMPANHA = { latitude: 41.15054, longitude: -8.586245 };
const DESTINO = { id: 'teste:trindade', title: 'Estação da Trindade', subtitle: 'Porto', latitude: 41.15228, longitude: -8.609299, type: 'PLACE' };
const FONTE = 'https://andante.pt/comprar/andante-azul/';

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const aPe = (min, m) => ({ mode: 'WALK', instruction: 'A pé', durationMinutes: min, distanceMeters: m });
const troco = (codigo, cor, de, para, sai, chega, modo = 'Metro', op = 'Metro do Porto') => ({
  mode: 'TRANSIT', instruction: '', transportMode: modo, lineCode: codigo, lineName: codigo, lineColor: cor, operatorName: op,
  fromStopName: de, toStopName: para, stopsCount: 4, durationMinutes: 8, departureTime: sai, arrivalTime: chega,
});
const tarifa = (zonas, preco, duracaoMin) => ({ sistema: 'andante', zonas, preco, preco24h: 5.35, cartao: 0.6, duracaoMin, emVigorDesde: '2026-01-01', fonte: FONTE });
const opcao = (id, legs, extra = {}) => ({
  id, type: 'fastest', title: '', badgeLabel: '', totalDurationMinutes: 14, departureTime: '10:02', arrivalTime: '10:16',
  walkingDistanceMeters: 300, walkingMinutes: 4, transfersCount: legs.filter((l) => l.mode === 'TRANSIT').length - 1,
  legs, realtimeStatus: 'PROGRAMADO', realtimeLabel: 'Horário', relevantAlerts: [], ...extra,
});
const RESPOSTA = {
  routes: [
    opcao('m1', [aPe(2, 150), troco('F', '#F57F17', 'Campanhã', 'Trindade', '10:04', '10:12'), aPe(2, 120)], { highlight: 'melhor', badgeLabel: 'Melhor opção', tarifa: tarifa(2, 1.4, 60) }),
    // cadeia comprida (a quebrar linha em 320 px) e Z10 inexistente não: Z3 com transbordo
    opcao('m2', [aPe(4, 300), troco('205', '#1565C0', 'Campanhã (Estação)', 'Bolhão', '10:05', '10:11', 'Autocarro', 'STCP'), aPe(3, 200),
      troco('D', '#FBC02D', 'Bolhão', 'Trindade', '10:15', '10:17'), troco('A', '#1E88E5', 'Trindade', 'Senhora da Hora', '10:20', '10:31'), aPe(5, 380)],
    { totalDurationMinutes: 33, arrivalTime: '10:35', tarifa: tarifa(3, 1.85, 60) }),
    opcao('c1', [aPe(1, 60), troco('CP', '#111111', 'Porto Campanhã', 'Porto São Bento', '10:08', '10:13', 'Comboio', 'CP'), aPe(9, 700)],
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
  const nome = `bilhete_${largura}_${tema}`;
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
    const precos = await p.locator('[data-teste="preco-rota"]:visible').allInnerTexts();
    ok(`[${largura} ${tema}] preço no resumo das duas opções Andante, não na da CP`, precos.length === 2 && /1,40\s*€/.test(precos[0]) && /1,85\s*€/.test(precos[1]), JSON.stringify(precos));
    const cartaoCp = cartoes.filter({ hasText: 'Porto Campanhã' });
    const semPreco = await cartaoCp.locator('[data-teste="preco-rota"]').count();
    ok(`[${largura} ${tema}] opção sem tarifa (CP) não mostra preço`, (await cartaoCp.count()) === 1 && semPreco === 0);
    // o preço fica dentro do cartão e não por cima das linhas
    const sobreposto = await p.evaluate(() => {
      const res = [];
      for (const c of document.querySelectorAll('[data-teste="opcao-rota"]')) {
        const pr = c.querySelector('[data-teste="preco-rota"]');
        if (!pr) continue;
        const a = pr.getBoundingClientRect(), cc = c.getBoundingClientRect();
        if (a.right > cc.right + 0.5 || a.left < cc.left - 0.5) res.push('fora do cartão');
        for (const o of pr.parentElement.children) {
          if (o === pr) continue;
          const b = o.getBoundingClientRect();
          if (b.width && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) res.push('por cima de ' + (o.textContent || o.tagName).slice(0, 12));
        }
      }
      return res;
    });
    ok(`[${largura} ${tema}] preço dentro do cartão e sem tapar as linhas`, sobreposto.length === 0, sobreposto.join(', '));
    await p.screenshot({ path: `${SAIDA}/${nome}_lista.png` });

    await cartoes.first().click();
    const bilhete = p.locator('[data-teste="bilhete-rota"]:visible').first();
    await bilhete.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    const txt = (await bilhete.innerText().catch(() => '')).replace(/\s+/g, ' ');
    ok(`[${largura} ${tema}] ao abrir: título e preço`, /Andante Z2 · 1,40\s*€/.test(txt), txt.slice(0, 160));
    ok(`[${largura} ${tema}] quanto tempo vale e o cartão Azul`, /vale 1 h desde a 1\.ª validação/.test(txt) && /0,60\s*€/.test(txt));
    const href = await p.locator('[data-teste="bilhete-fonte"]:visible').first().getAttribute('href').catch(() => '');
    ok(`[${largura} ${tema}] ligação ao tarifário oficial`, href === FONTE, String(href));
    const alturaLigacoes = await bilhete.locator('a').evaluateAll((as) => as.map((a) => Math.round(a.getBoundingClientRect().height)));
    ok(`[${largura} ${tema}] ligações com alvo de toque de 40 px`, alturaLigacoes.length === 2 && alturaLigacoes.every((h) => h >= 40), JSON.stringify(alturaLigacoes));
    const lateral = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`[${largura} ${tema}] sem scroll para o lado`, lateral <= 0, `${lateral}px`);
    // contraste do texto secundário do bilhete (4,5:1)
    const contraste = await bilhete.evaluate((el) => {
      const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
      const fundo = (n) => { while (n) { const b = getComputedStyle(n).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; n = n.parentElement; } return 'rgb(255,255,255)'; };
      const p2 = el.querySelectorAll('p')[1];
      const a = lum(getComputedStyle(p2).color), b = lum(fundo(p2));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    ok(`[${largura} ${tema}] texto secundário com contraste ≥ 4,5:1`, contraste >= 4.5, contraste.toFixed(2));
    await bilhete.scrollIntoViewIfNeeded().catch(() => {});
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
