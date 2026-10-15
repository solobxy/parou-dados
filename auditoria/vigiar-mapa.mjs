// Sonda de produção: abre o site VERDADEIRO num browser (Chromium), com a localização numa cidade, e confere com os dados reais
// que o mapa mostra TODOS os autocarros que o servidor tem na zona que se vê:
//   1. o pedido que a app faz é por caixa do ecrã, sem lista de linhas (nunca «só as linhas das paragens perto»);
//   2. o servidor devolve nessa caixa tudo o que tem na lista completa dos operadores (STCP, Carris Metropolitana, TUB);
//   3. o que está dentro do ecrã do mapa está desenhado (e nada a mais).
// Mostra o erro que o Dinis viu em Campanhã: com muitos autocarros no servidor, o mapa mostrava 1.
// Uso: SITE=https://… SAIDA=pasta node auditoria/vigiar-mapa.mjs   (falha com exit 1 se alguma cidade falhar)
import { chromium } from 'playwright';
import fs from 'fs';

const SITE = (process.env.SITE || 'https://2-31-13-85.sslip.io').replace(/\/$/, '');
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const nota = (s) => console.log('NOTA   ', s);

// Onde a pessoa está e que operador se espera ver por perto (pelo menos há autocarros deste operador na lista completa)
const CIDADES = [
  { nome: 'Porto (Campanhã)', lat: 41.1485, lon: -8.5855 },
  { nome: 'Porto (Aliados)', lat: 41.1496, lon: -8.6109 },
  { nome: 'Matosinhos', lat: 41.1844, lon: -8.6963 },
  { nome: 'Amadora (Carris Metropolitana)', lat: 38.7538, lon: -9.2308 },
  { nome: 'Almada (Carris Metropolitana)', lat: 38.6790, lon: -9.1569 },
  { nome: 'Setúbal (Carris Metropolitana)', lat: 38.5244, lon: -8.8882 },
  { nome: 'Braga (TUB)', lat: 41.5503, lon: -8.4278 },
];

const LIMITES_OPERADORES = new Set(['STCP', 'Carris Metropolitana', 'TUB']);

function projetar(lat, lon, z, lat0, lon0) {
  const mundoPx = 256 * 2 ** z;
  const xy = (la, lo) => [((lo + 180) / 360) * mundoPx, (0.5 - Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)) / (2 * Math.PI)) * mundoPx];
  const [x, y] = xy(lat, lon), [cx, cy] = xy(lat0, lon0);
  return [x - cx, y - cy];
}

const LER = `(() => {
  const m = document.querySelector('.leaflet-container'); if (!m) return null;
  const r = m.getBoundingClientRect();
  const pinos = [...document.querySelectorAll('.bus-pin__num')].map((n) => { const b = n.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2; return { txt: n.textContent.trim(), cx, cy, dentro: cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom }; });
  return { rect: { l: r.left, t: r.top, w: r.width, h: r.height }, pinos };
})()`;

async function cidade(browser, c) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', permissions: ['geolocation'],
    geolocation: { latitude: c.lat, longitude: c.lon, accuracy: 10 }, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); localStorage.removeItem('parou_tema'); localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_localizacao_ok','1'); }catch(e){}` });
  await ctx.route(/(tile\.openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (rt) => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const p = await ctx.newPage();
  const pedidos = [];
  p.on('request', (r) => { if (r.url().includes('/api/transit/veiculos')) pedidos.push(r.url()); });
  const rot = `[${c.nome}]`;
  try {
    await p.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForSelector('.leaflet-container', { timeout: 60000 });
    await p.waitForTimeout(15000); // GPS, voo do mapa, primeiro pedido e desenho
    const comCaixa = pedidos.filter((u) => /caixa=/.test(u));
    ok(`${rot} a app pede os autocarros ao servidor`, comCaixa.length > 0, `${pedidos.length} pedidos`);
    if (!comCaixa.length) return;
    const url = comCaixa[comCaixa.length - 1];
    const qs = new URL(url).searchParams;
    ok(`${rot} o pedido é pela caixa do ecrã, sem lista de linhas`, !qs.get('linhas'), `linhas=${qs.get('linhas') || '-'}`);
    const [sul, oeste, norte, leste] = qs.get('caixa').split(',').map(Number);
    // servidor: o que a API devolve na caixa contra a lista completa
    const leve = await (await fetch(url, { headers: { 'X-Parou-Origem': 'sonda' } })).json();
    const crua = await (await fetch(`${SITE}/api/transit/vehicles`)).json();
    const cruaNaCaixa = (crua.vehicles || []).filter((v) => LIMITES_OPERADORES.has(v.operator) && v.lat >= sul && v.lat <= norte && v.lon >= oeste && v.lon <= leste);
    const porOp = {}; for (const v of leve.veiculos || []) porOp[v.op] = (porOp[v.op] || 0) + 1;
    nota(`${rot} na caixa do ecrã: servidor devolve ${leve.veiculos?.length ?? 0} (${Object.entries(porOp).map(([k, n]) => `${k} ${n}`).join(', ') || 'nenhum'}); lista completa tem ${cruaNaCaixa.length}`);
    // Se a lista completa mudou entre os dois pedidos pode haver 1 ou 2 de diferença
    ok(`${rot} o servidor devolve todos os autocarros que tem na caixa (diferença ≤ 3)`, Math.abs((leve.veiculos?.length ?? 0) - cruaNaCaixa.length) <= 3, `${leve.veiculos?.length ?? 0} contra ${cruaNaCaixa.length}`);
    // mapa: o que está dentro do ecrã está desenhado
    const lido = await p.evaluate(LER);
    const desenhados = lido.pinos.filter((x) => x.dentro).length;
    const mx = lido.rect.l + lido.rect.w / 2, my = lido.rect.t + lido.rect.h / 2;
    const dentroDoEcra = (v, margem) => { const [dx, dy] = projetar(v.lat, v.lon, 16, c.lat, c.lon); const x = mx + dx, y = my + dy; return x >= lido.rect.l + margem && x <= lido.rect.l + lido.rect.w - margem && y >= lido.rect.t + margem && y <= lido.rect.t + lido.rect.h - margem; };
    const certos = (leve.veiculos || []).filter((v) => dentroDoEcra(v, 28)).length;   // claramente dentro
    const possiveis = (leve.veiculos || []).filter((v) => dentroDoEcra(v, -28)).length; // dentro ou quase
    nota(`${rot} ecrã do mapa ${Math.round(lido.rect.w)}×${Math.round(lido.rect.h)} px (nível 16); servidor tem ${certos}–${possiveis} no ecrã; desenhados à vista: ${desenhados}`);
    ok(`${rot} o mapa mostra todos os autocarros que estão no ecrã (não menos de ${Math.max(0, certos - 2)})`, desenhados >= certos - 2, `${desenhados} desenhados, esperados ≥ ${certos}`);
    ok(`${rot} e não mostra a mais (não mais de ${possiveis + 2})`, desenhados <= possiveis + 2, `${desenhados} desenhados, esperados ≤ ${possiveis}`);
    await p.screenshot({ path: `${SAIDA}/vigiar_${c.nome.replace(/[^a-z0-9]+/gi, '_')}.png` }).catch(() => {});
  } catch (e) {
    ok(`${rot} correu sem exceções`, false, String(e).slice(0, 300));
  } finally {
    await ctx.close();
  }
}

(async () => {
  const cr = await chromium.launch({ args: ['--no-sandbox'] });
  for (const c of CIDADES) await cidade(cr, c);
  await cr.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodas as cidades mostram todos os autocarros do ecrã.');
  process.exit(falhas ? 1 : 0);
})();
