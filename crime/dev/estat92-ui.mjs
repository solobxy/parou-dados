// v92: o jogo manda ao painel de estatísticas um evento por ecrã aberto (uma vez por visita).
// Uso: node dev/estat92-ui.mjs <cidade>
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [CID] = process.argv.slice(2);
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
const [n, v] = cookies.Rico.split('=');
await ctx.addCookies([{ name: n, value: v, url: base }]);
await ctx.addInitScript(() => { localStorage.setItem('cr.tab', JSON.stringify('city')); localStorage.setItem('cr.lang', 'pt'); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); window.estat = (a, b) => (window.__ev ||= []).push([a, b]); });
await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
const p = await ctx.newPage();
const erros = []; p.on('pageerror', (e) => erros.push(e.message));
await p.goto(base + '/'); await p.waitForTimeout(1200);
for (const tab of ['gym', 'rob', 'gym', 'city', 'rob']) { await p.locator(`.tabs [data-tab="${tab}"], .tabs button:has-text("${{ gym: 'Ginásio', rob: 'Golpes', city: 'Cidade' }[tab]}")`).first().click(); await p.waitForTimeout(300); }
const ev = await p.evaluate(() => window.__ev || []);
console.log(JSON.stringify(ev));
assert.deepEqual(ev.filter((e) => e[0] === 'ecra').map((e) => e[1]), ['city', 'gym', 'rob']);
assert.equal(erros.length, 0, erros.join(' | '));
console.log('ok');
await browser.close();
