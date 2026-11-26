// O aviso no topo do Perto (greve de um operador que serve as paragens à volta) abre os Alertas ao tocar, diz «Greve» e
// tem alvo de toque de 40 px, em 320 e 390 px. As paragens vêm do servidor a sério; o aviso junta-se à resposta (simulado).
// Uso: BASE=http://127.0.0.1:3000 SAIDA=res node aviso-perto.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const UA_TEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const CAMPANHA = { latitude: 41.14871, longitude: -8.58483 };
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const GREVE = {
  id: 'noticia-greve-metro-do-porto-2026-11-27', external_id: 'x', tipo: 'greve', título: 'Greve dos maquinistas reduz serviço do Metro do Porto na sexta-feira',
  descrição: 'Fonte: RTP Notícias (o operador ainda não publicou aviso no site).', operador: 'Metro do Porto', linhas: [], paragens: [], região: 'Área Metropolitana do Porto',
  municípios: ['Porto'], start_datetime: '2026-11-27T00:00:00Z', end_datetime: '2026-11-27T23:59:59Z', published_datetime: '2026-11-25T18:53:00Z',
  source: 'Notícia — RTP Notícias', source_url: 'https://www.rtp.pt/x', last_update: '2026-11-26T00:00:00Z', status: 'Futuro', severity: 'Grave',
};

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
for (const largura of [320, 390]) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: 800 }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', hasTouch: true, isMobile: true, userAgent: UA_TEL, geolocation: CAMPANHA, permissions: ['geolocation'] });
  await ctx.addInitScript({ content: `try{ localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); }catch(e){}` });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route('**/api/transit/nearby**', async (r) => {
    const resp = await r.fetch();
    const j = await resp.json().catch(() => ({}));
    j.alerts = [GREVE, ...(j.alerts || [])];
    await r.fulfill({ response: resp, body: JSON.stringify(j), headers: { ...resp.headers(), 'content-type': 'application/json' } });
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  try {
    await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
    const aviso = p.locator('[data-teste="aviso-perto"]:visible').first();
    await aviso.waitFor({ state: 'visible', timeout: 40000 });
    const txt = (await aviso.innerText()).replace(/\s+/g, ' ');
    ok(`[${largura}] o aviso da greve aparece no topo do Perto e diz «Greve»`, /Metro do Porto/.test(txt) && /GREVE|Greve/.test(txt), txt);
    const h = await aviso.evaluate((e) => Math.round(e.getBoundingClientRect().height));
    ok(`[${largura}] alvo de toque ≥ 40 px`, h >= 40, `${h}px`);
    const lateral = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`[${largura}] sem scroll para o lado`, lateral <= 0, `${lateral}px`);
    await p.screenshot({ path: `${SAIDA}/aviso-perto_${largura}.png` });
    await aviso.click();
    await p.waitForURL(/\/alertas/, { timeout: 8000 }).catch(() => {});
    ok(`[${largura}] tocar no aviso abre os Alertas`, /\/alertas/.test(p.url()), p.url());
    ok(`[${largura}] sem erros na página`, erros.length === 0, erros.join(' | '));
  } catch (e) {
    ok(`[${largura}] o ecrã abriu`, false, String(e).slice(0, 200));
    await p.screenshot({ path: `${SAIDA}/aviso-perto_${largura}_erro.png` }).catch(() => {});
  }
  await ctx.close();
}
await browser.close();
console.log();
console.log(falhas ? `${falhas} falha(s)` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
