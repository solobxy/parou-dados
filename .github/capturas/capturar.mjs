// Capturas da app PAROU no Funchal (telemóvel, tema claro), para imprensa.
import { chromium } from 'playwright';
import fs from 'node:fs';
fs.mkdirSync('res', { recursive: true });
const FUNCHAL = { latitude: 32.6478, longitude: -16.9105 }; // Av. do Mar, centro do Funchal
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  geolocation: FUNCHAL, permissions: ['geolocation'], colorScheme: 'light', locale: 'pt-PT', timezoneId: 'Atlantic/Madeira',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
});
const log = [];
async function limpar(page) {
  for (const txt of ['Aceitar', 'Concordo', 'Continuar', 'Começar', 'Entendi', 'OK', 'Fechar', 'Agora não', 'Saltar']) {
    const b = page.getByRole('button', { name: txt, exact: false }).first();
    try { if (await b.isVisible({ timeout: 500 })) { await b.click({ timeout: 1000 }); log.push('clicou ' + txt); await page.waitForTimeout(600); } } catch {}
  }
  await page.keyboard.press('Escape').catch(() => {});
}
async function captura(nome, url, espera = 9000) {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000); await limpar(page);
    await page.waitForTimeout(espera); await limpar(page);
    await page.screenshot({ path: `res/${nome}.png` });
    log.push(`${nome}: ok ${page.url()}`);
    fs.writeFileSync(`res/${nome}.txt`, (await page.innerText('body')).slice(0, 4000));
  } catch (e) { log.push(`${nome}: erro ${e.message}`); }
  await page.close();
}
await captura('1-perto-funchal', 'https://parou.pt/perto', 12000);
await captura('2-mapa-funchal', 'https://parou.pt/mapa', 12000);
await captura('3-horarios', 'https://parou.pt/horarios', 8000);
await captura('4-cobertura', 'https://parou.pt/cobertura', 8000);
fs.writeFileSync('res/log.txt', log.join('\n'));
await browser.close();
