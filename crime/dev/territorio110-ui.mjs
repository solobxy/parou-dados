// v110: capturas do território (o mapa, a ficha de um bairro em disputa, a de um bairro da rua e o «tomar» com confirmação).
// Uso: CONTA=Rico node dev/territorio110-ui.mjs <cidade> <pasta> <largura> <língua> [tomar]
//      com «tomar», toca duas vezes no botão de um bairro da rua (a cidade de teste fica com esse assalto).
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID, OUT, W, LANG, TOMAR] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: +W, height: 780 }, deviceScaleFactor: 2 });
const quem = process.env.CONTA || 'Rico', [n, v] = cookies[quem].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([l]) => { if (!sessionStorage.getItem('t0')) { sessionStorage.setItem('t0', '1'); localStorage.setItem('cr.tab', JSON.stringify('bairros')); } localStorage.setItem('cr.lang', l); localStorage.setItem('cr.chatSeen', '1'); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base + '/'); await p.waitForTimeout(1500);
const nome = (s) => join(OUT, `${s}-${quem}-${LANG}-${W}.png`);
const fecha = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(400); };
await p.$eval('.bxmap', (el) => el.scrollIntoView({ block: 'start' })); await p.waitForTimeout(300);
await p.screenshot({ path: nome('mapa') });
const disputa = await p.$('.bxz.fight');
if (disputa) { await disputa.click(); await p.waitForTimeout(700); await p.screenshot({ path: nome('ficha-disputa') }); await fecha(); }
const meu = await p.$('.bxz.mine');
if (meu) { await meu.click(); await p.waitForTimeout(700); await p.screenshot({ path: nome('ficha-vosso') }); await fecha(); }
const livre = await p.$$('.bxz.free');
if (livre.length) {
  await livre[livre.length > 6 ? 6 : 0].click(); await p.waitForTimeout(700); await p.screenshot({ path: nome('ficha-rua') });
  const bt = await p.$('.bxsh .btn.buy');
  if (TOMAR && bt) {
    await bt.click(); await p.waitForTimeout(300); await p.screenshot({ path: nome('ficha-confirmar') });
    await p.click('.bxsh .btn.danger'); await p.waitForTimeout(1500); await p.screenshot({ path: nome('ficha-tomado') });
    console.log('tomar:', (await p.$('.bxsh .bxsc')) ? 'assalto a decorrer na ficha' : 'SEM assalto na ficha');
  }
  await fecha();
}
await p.screenshot({ path: nome('depois'), fullPage: true });
console.log(errs.length ? 'ERROS: ' + errs.join(' | ') : 'sem erros');
await b.close();
