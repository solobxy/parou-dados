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
// Duas greves ao mesmo tempo (26/11/2026): a da CP a decorrer e a do Metro do Porto no dia seguinte, com o serviço a acabar
// mais cedo nessa noite. Só aparecia a primeira da lista (CP). Agora aparecem as duas, cada uma a dizer quando é; uma
// terceira, daqui a 5 dias, não entra.
{
  const agora = Date.now();
  const diaLx = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' });
  // meia-noite de amanhã em Lisboa (inverno: UTC+0; o teste corre em qualquer data, por isso procura-se a hora certa)
  let amanha = Date.parse(diaLx(agora + 86_400_000) + 'T00:00:00Z');
  while (diaLx(amanha - 1) === diaLx(amanha)) amanha -= 3600_000;
  while (diaLx(amanha) !== diaLx(agora + 86_400_000)) amanha += 3600_000;
  const CP = { ...GREVE, id: 'alert-cp-greve', título: 'Greve - Perturbações na circulação - 23 a 27 de novembro', operador: 'CP', status: 'Ativo', start_datetime: new Date(agora - 3 * 86_400_000).toISOString(), end_datetime: new Date(agora + 86_400_000).toISOString(), source: 'CP — avisos oficiais' };
  const MP = { ...GREVE, start_datetime: new Date(amanha).toISOString(), end_datetime: new Date(amanha + 86_399_000).toISOString(), vespera_desde: new Date(agora - 10 * 60_000).toISOString(), status: 'Futuro' };
  const LONGE = { ...GREVE, id: 'longe', título: 'Greve na STCP daqui a cinco dias', operador: 'STCP', status: 'Futuro', start_datetime: new Date(agora + 5 * 86_400_000).toISOString(), end_datetime: new Date(agora + 5.5 * 86_400_000).toISOString() };
  for (const largura of [320, 390]) {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 800 }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', hasTouch: true, isMobile: true, userAgent: UA_TEL, geolocation: CAMPANHA, permissions: ['geolocation'] });
    await ctx.addInitScript({ content: `try{ localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); }catch(e){}` });
    await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await ctx.route('**/api/transit/nearby**', async (r) => {
      const resp = await r.fetch();
      const j = await resp.json().catch(() => ({}));
      j.alerts = [CP, LONGE, MP];
      await r.fulfill({ response: resp, body: JSON.stringify(j), headers: { ...resp.headers(), 'content-type': 'application/json' } });
    });
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
    try {
      await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
      await p.locator('[data-teste="aviso-perto"]:visible').first().waitFor({ state: 'visible', timeout: 40000 });
      await p.waitForTimeout(500);
      const linhas = await p.$$eval('[data-teste="aviso-perto"]', (els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.replace(/\s+/g, ' ')));
      ok(`[${largura}] duas greves: aparecem as duas (CP e Metro do Porto), e não a de daqui a 5 dias`, linhas.length === 2 && linhas.some((x) => /CP|Perturbações/.test(x)) && linhas.some((x) => /Metro do Porto/.test(x)) && !linhas.some((x) => /STCP/.test(x)), JSON.stringify(linhas));
      ok(`[${largura}] a do Metro (véspera a decorrer) vem primeiro e diz «Hoje»`, /Metro do Porto/.test(linhas[0] || '') && /HOJE|Hoje/.test(linhas[0] || ''), linhas[0]);
      ok(`[${largura}] a da CP (a decorrer) diz «Greve»`, /GREVE|Greve/.test(linhas[1] || ''), linhas[1]);
      const alturas = await p.$$eval('[data-teste="aviso-perto"]', (els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().height)));
      ok(`[${largura}] duas greves: cada aviso com alvo de toque ≥ 40 px`, alturas.length === 2 && alturas.every((h) => h >= 40), JSON.stringify(alturas));
      const lateral = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(`[${largura}] duas greves: sem scroll para o lado`, lateral <= 0, `${lateral}px`);
      await p.screenshot({ path: `${SAIDA}/aviso-perto-duas_${largura}.png` });
      ok(`[${largura}] sem erros na página (duas greves)`, erros.length === 0, erros.join(' | '));
    } catch (e) {
      ok(`[${largura}] duas greves: o ecrã abriu`, false, String(e).slice(0, 200));
    }
    await ctx.close();
  }
}

await browser.close();
console.log();
console.log(falhas ? `${falhas} falha(s)` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
