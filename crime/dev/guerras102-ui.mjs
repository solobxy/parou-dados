// v102: carregar mesmo nos botões da guerra (cidade de teste local): o subchefe declara (dois toques) e depois espanca um inimigo.
// Uso: FASE=lista dev/guerras102-cidade.sh, e depois node dev/guerras102-ui.mjs /tmp/cidade-p6b
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID] = process.argv.slice(2);
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const abre = async (conta) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  const [n, v] = cookies[conta].split('='); await ctx.addCookies([{ name: n, value: v, url: base }]);
  await ctx.addInitScript(() => { localStorage.setItem('cr.tab', JSON.stringify('gang')); localStorage.setItem('cr.lang', 'pt'); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); });
  await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
  const p = await ctx.newPage(), erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(base + '/'); await p.waitForTimeout(1800); return { p, erros };
};
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const gang = async (p) => (await (await p.request.get(base + '/api/gang')).json());
const { p, erros } = await abre('Gasto');
const row = p.locator('.wrow', { hasText: 'Tubarões' });
await row.locator('button').click(); await p.waitForTimeout(300);
ok(await row.locator('button').textContent().then((x) => /Declarar guerra\?|Declare war\?/.test(x)), 'pede confirmação');
await row.locator('button').click(); await p.waitForTimeout(1500);
const g = await gang(p);
ok(g.mine.war.war && g.mine.war.war.vs.tag === 'TUB', 'declarou guerra aos Tubarões');
ok(await p.locator('.wcard').isVisible(), 'o cartão da guerra aparece em cima');
// a guerra começa (a hora passa) e espanca-se um inimigo
const db = new DatabaseSync(join(CID, 'dados', 'jogo.db'));
db.exec('UPDATE guerras SET inicio = inicio - 7200000 WHERE fim = 0'); db.close();
console.log('(recomeçar o servidor para ler a guerra mexida)');
ok(!erros.length, 'sem erros na página ' + erros.join(' | '));
await browser.close();
