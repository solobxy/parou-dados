// Visita cada site como um telemóvel normal e confirma que as estatísticas chegam (/_e responde 204).
// As visitas levam utm_source=teste-estatisticas, para se poderem apagar da base de dados a seguir.
// Uso: SAIDA=../res node estatisticas-visita.mjs [url ...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const SAIDA = process.env.SAIDA || '.';
const H = '2-31-13-85.sslip.io';
const URLS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'https://parou.pt/', 'https://anjinho.pt/', 'https://jinxed.world/',
  `https://duaschaves.${H}/`, `https://dinissousa.${H}/`, `https://jaesta.${H}/`,
  `https://adribodypiercing.${H}/`, `https://goodman.${H}/`,
];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const b = await chromium.launch();
const resultado = [];
for (const base of URLS) {
  const ctx = await b.newContext({ userAgent: UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon' });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const p = await ctx.newPage();
  const envios = [], erros = [];
  p.on('response', (r) => { if (new URL(r.url()).pathname === '/_e') envios.push(r.status()); });
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  const url = base + (base.includes('?') ? '&' : '?') + 'utm_source=teste-estatisticas&utm_campaign=verificacao';
  const r = { url: base };
  try {
    await p.goto(url, { waitUntil: 'load', timeout: 45000 });
    await p.waitForTimeout(2500);
    r.temScript = await p.evaluate(() => !!document.querySelector('script[src="/_e.js"]'));
    r.ativo = await p.evaluate(() => !!window.__estat);
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    await p.waitForTimeout(800);
    await p.mouse.click(195, 400);
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await p.waitForTimeout(1500);
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await p.waitForTimeout(2000);
  } catch (e) { r.falha = String(e).slice(0, 200); }
  r.envios = envios; r.erros = erros;
  r.ok = !!r.temScript && envios.length >= 2 && envios.every((s) => s === 204);
  console.log(`${r.ok ? 'OK ' : 'FALHOU'} ${base} script=${r.temScript} envios=${JSON.stringify(envios)}${r.falha ? ' ' + r.falha : ''}`);
  resultado.push(r);
  await ctx.close();
}
await b.close();
fs.writeFileSync(`${SAIDA}/estatisticas-visita.json`, JSON.stringify(resultado, null, 1));
const ok = resultado.filter((r) => r.ok).length;
console.log(`${ok}/${resultado.length} sites a enviar estatísticas`);
fs.writeFileSync(`${SAIDA}/estatisticas-visita.txt`, resultado.map((r) => `${r.ok ? 'OK' : 'FALHOU'} ${r.url} envios=${JSON.stringify(r.envios)} ${r.falha || ''}`).join('\n') + `\n${ok}/${resultado.length} sites a enviar estatísticas\n`);
