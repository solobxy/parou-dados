// Capturas do parou.pt (produção) para o kit de imprensa e para os emails a parceiros: telemóvel com ecrã de alta resolução,
// localização simulada em Lisboa e no Porto, dados reais do momento. Não altera nada no site.
import { chromium } from 'playwright';
import fs from 'fs';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const browser = await chromium.launch();
const cenas = [
  { nome: '1-lisboa-perto', url: '/', geo: { latitude: 38.7253, longitude: -9.1500 } },
  { nome: '2-porto-perto', url: '/', geo: { latitude: 41.1525, longitude: -8.6093 } },
  { nome: '3-alertas', url: '/alertas', geo: { latitude: 38.7253, longitude: -9.1500 } },
  { nome: '4-greves', url: '/greves', geo: { latitude: 38.7253, longitude: -9.1500 } },
  { nome: '5-linhas', url: '/linhas', geo: { latitude: 41.1525, longitude: -8.6093 } },
];
for (const c of cenas) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    permissions: ['geolocation'], geolocation: { ...c.geo, accuracy: 15 }, colorScheme: 'light',
  });
  await ctx.addInitScript({ content: `try{localStorage.setItem('parou_aviso_instalar','1');localStorage.setItem('parou_bemvindo','visto');localStorage.setItem('parou_localizacao_ok','1');localStorage.setItem('parou_tema','claro');}catch(e){}` });
  const p = await ctx.newPage();
  try {
    await p.goto('https://parou.pt' + c.url, { waitUntil: 'load', timeout: 60000 });
    await p.waitForTimeout(9000);
    await p.screenshot({ path: `${SAIDA}/${c.nome}.png` });
    console.log('ok', c.nome);
  } catch (e) { console.log('falhou', c.nome, String(e).slice(0, 200)); }
  await ctx.close();
}
await browser.close();
