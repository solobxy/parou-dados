// Capturas da PAROU nas ilhas (telemóvel), para verificar o que um leitor vê
import { chromium } from 'playwright';
import fs from 'node:fs';
fs.mkdirSync('res/capturas', { recursive: true });
const locais = JSON.parse(fs.readFileSync('locais.json', 'utf8'));
const escolher = ['funchal-centro', 'funchal-monte', 'machico', 'santana', 'porto-santo', 'ponta-delgada', 'angra'];
const comAlertas = ['funchal-centro', 'santana', 'porto-santo', 'ponta-delgada', 'angra'];
const browser = await chromium.launch();
const log = [];
async function limpar(page) {
  for (const txt of ['Aceitar', 'Concordo', 'Continuar', 'Começar', 'Entendi', 'OK', 'Fechar', 'Agora não', 'Saltar']) {
    const b = page.getByRole('button', { name: txt, exact: false }).first();
    try { if (await b.isVisible({ timeout: 400 })) { await b.click({ timeout: 1000 }); await page.waitForTimeout(500); } } catch {}
  }
  await page.keyboard.press('Escape').catch(() => {});
}
for (const l of locais.filter((x) => escolher.includes(x.id))) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    geolocation: { latitude: l.lat, longitude: l.lon }, permissions: ['geolocation'], locale: 'pt-PT', timezoneId: l.tz,
  });
  for (const [nome, caminho, espera] of [['perto', '/perto', 12000], ['alertas', '/alertas', 9000]]) {
    if (nome === 'alertas' && !comAlertas.includes(l.id)) continue;
    const page = await ctx.newPage();
    const erros = [];
    page.on('pageerror', (e) => erros.push(e.message));
    try {
      await page.goto('https://parou.pt' + caminho, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000); await limpar(page);
      await page.waitForTimeout(espera); await limpar(page);
      await page.screenshot({ path: `res/capturas/${l.id}-${nome}.png` });
      fs.writeFileSync(`res/capturas/${l.id}-${nome}.txt`, (await page.innerText('body')).slice(0, 6000));
      log.push(`${l.id} ${nome}: ok${erros.length ? ' ERROS: ' + erros.join(' | ') : ''}`);
    } catch (e) { log.push(`${l.id} ${nome}: erro ${e.message}`); }
    await page.close();
  }
  await ctx.close();
}
fs.writeFileSync('res/capturas/log.txt', log.join('\n'));
await browser.close();
