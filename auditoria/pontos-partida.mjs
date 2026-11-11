// Primeiro ecrã sem localização: em vez de cartões vazios, a lista «Ou começa por uma estação» mostra pontos de partida
// reais. Tocar num deles tem de pôr a app a mostrar os transportes perto dessa estação.
// O problema que isto impede: quem chega pela primeira vez (Google, Reddit) via só um pedido de localização por cima de
// cartões cinzentos vazios, e quem não quisesse dar a localização não via nada da app.
// Uso: BASE=http://127.0.0.1:3000 SAIDA=res node pontos-partida.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const UA_TEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

let falhas = 0, total = 0;
const ok = (nome, cond, extra = '') => { total++; if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const browser = await chromium.launch();
for (const [nome, vw, vh] of [['telemovel', 390, 844], ['computador', 1280, 800]]) {
  console.log(`== ${nome}: sem localização`);
  const ctx = await browser.newContext({
    viewport: { width: vw, height: vh }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon',
    ...(nome === 'telemovel' ? { hasTouch: true, isMobile: true, userAgent: UA_TEL, deviceScaleFactor: 2 } : {}),
    permissions: [],
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); }catch(e){}
    try{ localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); }catch(e){}` });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  const lista = p.locator('[data-teste="pontos-partida"]');
  await lista.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  ok(`${nome}: aparece «Ou começa por uma estação»`, await lista.isVisible().catch(() => false));
  const n = await lista.locator('button').count().catch(() => 0);
  ok(`${nome}: tem pontos de partida`, n >= 4, `(${n})`);
  await p.screenshot({ path: `${SAIDA}/pontos-partida-${nome}.png` });
  if (n) {
    await lista.locator('button', { hasText: 'Cais do Sodré' }).first().click();
    // a lista de paragens perto do Cais do Sodré tem de aparecer (cartões com a distância, «46 metros»)
    let viu = false;
    for (let i = 0; i < 40 && !viu; i++) {
      await p.waitForTimeout(1000);
      viu = (await p.locator('[data-teste="pontos-partida"]').count()) === 0 && await p.locator('text=/\\d+ metros/').first().isVisible().catch(() => false);
    }
    ok(`${nome}: tocar em Cais do Sodré mostra os transportes de lá`, viu);
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${SAIDA}/pontos-partida-${nome}-depois.png` });
  }
  ok(`${nome}: sem erros na página`, erros.length === 0, erros.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(`${total - falhas}/${total} testes OK`);
process.exit(falhas ? 1 : 0);
