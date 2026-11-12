// Capturas da app nova (servidor local) na Madeira e nos Açores: nomes do Funchal e aviso onde não há horários
import { chromium } from 'playwright';
import fs from 'node:fs';
const B = process.env.BASE || 'http://127.0.0.1:3000';
fs.mkdirSync('res', { recursive: true });
const sitios = [
  ['funchal-centro', 32.6478, -16.9105, 'Atlantic/Madeira'],
  ['funchal-monte', 32.6747, -16.9027, 'Atlantic/Madeira'],
  ['machico', 32.7166, -16.7666, 'Atlantic/Madeira'],
  ['ponta-delgada', 37.74, -25.668, 'Atlantic/Azores'],
];
const browser = await chromium.launch();
const log = [];
for (const [id, lat, lon, tz] of sitios) {
  for (const [tema, largura] of [['claro', 390], ['escuro', 390], ['claro', 320]]) {
    if (largura === 320 && id === 'funchal-monte') continue;
    const ctx = await browser.newContext({ viewport: { width: largura, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      geolocation: { latitude: lat, longitude: lon }, permissions: ['geolocation'], locale: 'pt-PT', timezoneId: tz });
    await ctx.addInitScript({ content: `try{ ${tema === 'claro' ? "localStorage.removeItem('parou_tema');" : `localStorage.setItem('parou_tema','${tema}');`} localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_localizacao_ok','1'); }catch(e){}` });
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    try {
      await p.goto(`${B}/perto`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(14000);
      const nome = `${id}-${tema}-${largura}`;
      await p.screenshot({ path: `res/${nome}.png` });
      const txt = await p.innerText('body');
      fs.writeFileSync(`res/${nome}.txt`, txt.slice(0, 5000));
      const largo = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      log.push(`${nome}: ok${largo ? ' SCROLL LATERAL' : ''}${erros.length ? ' ERROS: ' + erros.join(' | ') : ''}`);
    } catch (e) { log.push(`${id}: erro ${e.message}`); }
    await ctx.close();
  }
}
fs.writeFileSync('res/log.txt', log.join('\n'));
await browser.close();
