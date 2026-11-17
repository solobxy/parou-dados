// Capturas do contentor do porto (reveal.js) com as fotografias: fechado, a abrir e aberto com notas, caixotes e a fita da polícia.
// Não precisa de carga no porto: monta a cena diretamente na página, com um resultado inventado.
// Uso: node dev/contentor-ui.mjs [cidade] [pasta] [largura] [língua]   (com o servidor da cidade de teste a correr)
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const CID = process.argv[2] || '/tmp/cidade-p6b', OUT = process.argv[3] || '/tmp/cap-ct', W = +(process.argv[4] || 390), LANG = process.argv[5] || 'pt';
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: W, height: 780 }, deviceScaleFactor: 2 });
const [n, v] = cookies.Rico.split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([lang]) => { localStorage.setItem('cr.tab', JSON.stringify('port')); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
await p.goto(base + '/'); await p.waitForTimeout(1200);
const shot = (nome) => p.screenshot({ path: join(OUT, `${nome}-${LANG}-${W}.png`) });
const cores = [['MARALTO', '#3f7f93', 'cash'], ['NOTURNA', '#c4621d', 'goods'], ['ABISSAL', '#4b5565', 'lost']];
for (const [marca, cor, tom] of cores) {
  await p.evaluate(([marca, cor, tom]) => import('/js/reveal.js').then((RV) => {
    window.__fim = RV.caixa({
      pele: RV.contentor({ cor, marca, codigo: [marca.slice(0, 3) + 'U', '123 456'] }),
      fundo: '/img/cenas/porto-g.webp?16', passo: '', titulo: 'Contentor', sub: 'Enviaste 5 000 €', toque: 'Toca para abrir', aCortar: 'A cortar o cadeado…', rotulo: 'Abrir', sair: 'Fechar',
      pedir: async () => ({ ok: true }),
      mostrar: () => ({ tom, de: 0, ate: 7400, fmt: (x) => Math.round(x) + ' €', linha: tom === 'lost' ? 'A polícia ficou com a carga' : 'Chegou tudo', notas: 9, fita: 'POLÍCIA', img: null }),
      botoes: () => [{ texto: 'Fechar', cls: 'btn buy', fazer: () => {} }],
    });
  }), [marca, cor, tom]);
  await p.waitForTimeout(700); await shot('ct-' + tom + '-fechado');
  await p.click('.rv-stage'); await p.waitForTimeout(1100); await shot('ct-' + tom + '-a-abrir');
  await p.waitForTimeout(1800); await shot('ct-' + tom + '-aberto');
  await p.click('.rv-btns .btn'); await p.waitForTimeout(400);
}
console.log(erros.length ? 'ERROS ' + erros.join(' | ') : 'sem erros na consola');
await browser.close();
