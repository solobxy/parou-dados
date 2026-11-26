// Versão nova com a PAROU já aberta (26/11/2026): o Chrome e a app da Play mantêm a página viva horas e a versão nova só
// entrava ao abrir de raiz, por isso correções publicadas não chegavam ao telemóvel do Dinis. Aqui: a página abre com o
// service worker a sério, passa o tempo de arranque, sai-se da app, publica-se uma versão nova (o sw.js muda no disco) e
// volta-se: a página tem de recarregar sozinha e logo. Se a pessoa já tocou no ecrã depois de voltar, não recarrega na cara
// dela: espera que saia da app.
// Uso: BASE=http://127.0.0.1:3000 APP=<pasta da app compilada> SAIDA=res node versao-nova.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const APP = process.env.APP || '../app';
const SW = path.join(APP, 'dist', 'sw.js');
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const original = fs.readFileSync(SW, 'utf8');
let versao = 0;
const publicarVersaoNova = () => { versao++; fs.writeFileSync(SW, `${original}\n// versao de teste ${Date.now()}-${versao}\n`); };
const visibilidade = (estado) => `(() => {
  Object.defineProperty(document, 'visibilityState', { get: () => '${estado}', configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => ${estado === 'hidden'}, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
})()`;

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
try {
  for (const tocar of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', hasTouch: true, isMobile: true, userAgent: UA, serviceWorkers: 'allow' });
    await ctx.addInitScript({ content: `try{ localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); }catch(e){}` });
    await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
    await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
    const controlada = await p.waitForFunction(() => Boolean(navigator.serviceWorker && navigator.serviceWorker.controller), null, { timeout: 45000 }).then(() => true).catch(() => false);
    ok(`[${tocar ? 'tocou' : 'sem toque'}] o service worker toma conta da página`, controlada);
    // quem já tinha a app: a página abre já com o service worker (na 1.ª visita a app não recarrega, de propósito)
    await p.reload({ waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => Boolean(navigator.serviceWorker && navigator.serviceWorker.controller), null, { timeout: 30000 }).catch(() => {});
    // passa o tempo de arranque (nos primeiros 20 s uma versão nova já recarregava)
    await p.waitForFunction(() => performance.now() > 21000, null, { timeout: 40000, polling: 500 });
    await p.evaluate(() => { window.__marca = 'pagina-antiga'; });
    // sai da app, publica-se uma versão nova, volta
    await p.evaluate(visibilidade('hidden'));
    await p.waitForTimeout(1500);
    publicarVersaoNova();
    let recarregou = false;
    p.once('load', () => { recarregou = true; });
    // volta à app; no caso «tocou», toca no ecrã logo a seguir, no mesmo instante (no CI a versão nova instala-se em menos
    // de 150 ms; um toque depois disso chegava tarde). O toque não carrega em nada que abra outra página.
    await p.evaluate(`${visibilidade('visible')}; ${tocar ? "document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))" : ''}`);
    const t0 = Date.now();
    await p.waitForFunction(() => window.__marca !== 'pagina-antiga', null, { timeout: tocar ? 9000 : 15000 }).catch(() => {});
    await p.waitForLoadState('load').catch(() => {});
    const ms = Date.now() - t0;
    const nova = await p.evaluate(() => window.__marca !== 'pagina-antiga').catch(() => true);
    if (!tocar) {
      ok('versão nova publicada com a app aberta: ao voltar à app, recarrega sozinha para a versão nova', recarregou || nova, `${ms} ms`);
      ok('e depressa (menos de 10 s depois de voltar)', (recarregou || nova) && ms < 10000, `${ms} ms`);
    } else {
      ok('se a pessoa já tocou no ecrã depois de voltar: não recarrega na cara dela', !recarregou && !nova);
      // sai da app: aí sim, recarrega
      let recarregouAoSair = false;
      p.once('load', () => { recarregouAoSair = true; });
      await p.evaluate(visibilidade('hidden')).catch(() => {});
      for (let i = 0; i < 40 && !recarregouAoSair; i++) await p.waitForTimeout(200);
      ok('ao sair da app, recarrega para a versão nova', recarregouAoSair);
    }
    ok(`[${tocar ? 'tocou' : 'sem toque'}] sem erros na página`, erros.length === 0, erros.join(' | '));
    await ctx.close();
  }
} finally {
  fs.writeFileSync(SW, original);
  await browser.close();
}
console.log();
console.log(falhas ? `${falhas} falha(s)` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
