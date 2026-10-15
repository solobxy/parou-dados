// Captura REAL (site verdadeiro, mapas verdadeiros, autocarros verdadeiros) do mapa do Perto, com a localização no Porto,
// em vários níveis de afastamento, para a prova visual das novidades. Conta também o que está desenhado no ecrã.
// Uso: SITE=https://… SAIDA=pasta node auditoria/captura-mapa.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const SITE = (process.env.SITE || 'https://2-31-13-85.sslip.io').replace(/\/$/, '');
const SAIDA = process.env.SAIDA || 'res';
const LAT = Number(process.env.LAT || 41.1496), LON = Number(process.env.LON || -8.6109);
const TEMA = process.env.TEMA || '';
fs.mkdirSync(SAIDA, { recursive: true });

const LER = `(() => {
  const m = document.querySelector('.leaflet-container'); if (!m) return null;
  const r = m.getBoundingClientRect();
  const dentro = (e) => { const b = e.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2; return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; };
  const rodas = [...document.querySelectorAll('.bus-pin__num')].filter(dentro).length;
  const pontos = [...document.querySelectorAll('.mapa-bus-ponto')].filter(dentro).length;
  return { w: Math.round(r.width), h: Math.round(r.height), rodas, pontos, hora: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' }) };
})()`;

(async () => {
  const br = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await br.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon',
    permissions: ['geolocation'], geolocation: { latitude: LAT, longitude: LON, accuracy: 12 }, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); ${TEMA ? `localStorage.setItem('parou_tema','${TEMA}');` : `localStorage.removeItem('parou_tema');`} localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_localizacao_ok','1'); }catch(e){}` });
  const p = await ctx.newPage();
  const lista = [];
  await p.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.leaflet-container', { timeout: 60000 });
  await p.waitForTimeout(16000);
  const grande = p.locator('[aria-label="Aumentar o mapa"]').first();
  if (await grande.count()) { await grande.click().catch(() => {}); await p.waitForTimeout(3000); }
  // O aviso «Sem sinal de GPS» vem do GPS simulado do browser de testes (num telemóvel a sério há sinal): fica fora da imagem.
  await p.addStyleTag({ content: '[data-teste="aviso-precisao-mapa"]{display:none!important}' });
  const caixa = await p.evaluate(() => { const r = document.querySelector('.leaflet-container').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.move(caixa.x, caixa.y);
  for (let n = 0; n <= 5; n++) {
    if (n > 0) await p.mouse.wheel(0, 60); // um nível para longe
    await p.waitForTimeout(n === 0 ? 4000 : 9000); // o mapa assenta, pede ao servidor e desenha
    const lido = await p.evaluate(LER);
    lista.push({ passo: n, ...lido });
    console.log(`passo ${n}:`, JSON.stringify(lido));
    await p.screenshot({ path: `${SAIDA}/captura_${n}.png` });
  }
  fs.writeFileSync(`${SAIDA}/captura.json`, JSON.stringify({ site: SITE, lat: LAT, lon: LON, tema: TEMA || 'claro', passos: lista }, null, 2));
  await br.close();
})().catch((e) => { console.error(e); process.exit(1); });
