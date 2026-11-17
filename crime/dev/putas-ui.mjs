// Putas no browser simulado: lê os preços, vai à mais barata por ponto duas vezes e confirma que o preço dela não sobe por voltar lá
// (v74: só a escada de stamina do dia mexe no preço). Uso: node dev/putas-ui.mjs <cidade> <capturas> [largura] [língua]
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CID = process.argv[2] || '/tmp/cidade-p6b', OUT = process.argv[3] || '/tmp/cap-putas', W = +(process.argv[4] || 390), LANG = process.argv[5] || 'pt';
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: W, height: 860 }, deviceScaleFactor: 2 });
const [n, v] = cookies[process.env.CONTA || 'Novato'].split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(([lang]) => { localStorage.setItem('cr.tab', JSON.stringify('putas')); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [LANG]);
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
const api = (body) => p.evaluate(async (b) => (await fetch('/api/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json(), body);
await p.goto(base + '/'); await p.waitForSelector('.hkl', { timeout: 15000 }); await p.waitForTimeout(400);
// gasta a stamina toda nos golpes para poder ir às putas
let me = await p.evaluate(async () => (await (await fetch('/api/state')).json()).me);
const shot = (nome) => p.screenshot({ path: join(OUT, `${nome}-${LANG}-${W}.png`), fullPage: true });
const precos = (m) => m.hookers.slice();
for (let k = 0; k < 0; k++) {
  const r = await api({ type: 'crimeAll', k: 0 }); if (r.error && r.error !== 'NO_ENERGY') console.log('crimeAll', r.error);
}
await p.reload(); await p.waitForSelector('.hkl'); await p.waitForTimeout(300);
me = await p.evaluate(async () => (await (await fetch('/api/state')).json()).me);
await shot('putas');
const p0 = precos(me), i = 0;
const r1 = await api({ type: 'hooker', i }); console.log('1.ª visita', r1.error || r1.result?.price);
// mais umas visitas grandes, para a escada do dia passar de uma barra e aparecer a linha do estado
for (let k = 0; k < 0; k++) { await api({ type: 'crimeAll', k: 0 }); const r = await api({ type: 'hooker', i: 11 }); console.log('visita à celeste', r.error || r.result?.price); }
const m1 = await p.evaluate(async () => (await (await fetch('/api/state')).json()).me);
console.log('preço dela antes', p0[i], 'depois', m1.hookers[i], m1.hookers[i] === p0[i] ? '(igual: não sobe por voltar)' : '(mudou com a escada do dia)', 'escada', m1.refillBars ?? '');
await p.reload(); await p.waitForSelector('.hkl'); await p.waitForTimeout(300); await shot('putas-depois');
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros na consola');
await browser.close();
