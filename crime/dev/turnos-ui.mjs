// Joga um turno de cada tarefa de emprego num browser simulado (a conta «Novato» muda de emprego entre cada um) e tira capturas.
// Uso: node dev/turnos-ui.mjs <cidade> <capturas> [largura] [língua]   (o servidor da cidade é arrancado e parado aqui)
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CID = process.argv[2] || '/tmp/cidade-p6b', OUT = process.argv[3] || '/tmp/cap-turnos', W = +(process.argv[4] || 390), LANG = process.argv[5] || 'pt';
mkdirSync(OUT, { recursive: true });
const { base, cookies } = JSON.parse(readFileSync(join(CID, 'contas.json'), 'utf8'));
const RAIZ = new URL('../..', import.meta.url).pathname;
let srv = null;
const arrancar = async () => {
  srv = spawn(process.execPath, [join(RAIZ, 'crime/server.mjs')], { env: { ...process.env, PORT: new URL(base).port, DATA: join(CID, 'dados'), STATIC: join(RAIZ, 'sites/crime'), COOKIE_INSEGURO: '1', ATOS_3S: '100000', ATOS_MIN: '1000000' }, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base + '/api/saude')).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
};
const parar = async () => { if (srv) { srv.kill(); await new Promise((r) => srv.once('exit', r)); srv = null; } };
function mexer(fn) {
  const db = new DatabaseSync(join(CID, 'dados', 'jogo.db'));
  const [n, v] = cookies.Novato.split('=');
  const rows = db.prepare('SELECT conta, estado FROM jogadores').all();
  const row = rows.find((r) => JSON.parse(r.estado).cls && JSON.parse(r.estado).respect < 200 && JSON.parse(r.estado).peakRespect < 200) || rows[0];
  const e = JSON.parse(row.estado); fn(e); db.prepare('UPDATE jogadores SET estado = ? WHERE conta = ?').run(JSON.stringify(e), row.conta); db.close();
}
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const erros = [];
const centro = async (el) => { const b = await el.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
for (const [job, task] of [[2, 'entradas'], [4, 'doses'], [5, 'contrato'], [1, 'camiao']]) {
  await parar();
  mexer((e) => { e.job = job; e.done = ['vigilante', 'pesados', 'licenciatura', 'especializacao']; e.vigor = 100; e.vigorT = Date.now(); e.sh = null; e.tk = null; e.jailUntil = 0; e.hospUntil = 0; });
  await arrancar();
  const ctx = await browser.newContext({ viewport: { width: W, height: 860 }, deviceScaleFactor: 2 });
  const [n, v] = cookies.Novato.split('=');
  await ctx.addCookies([{ name: n, value: v, url: base }]);
  await ctx.addInitScript(([lang]) => { localStorage.setItem('cr.tab', JSON.stringify('job')); localStorage.setItem('cr.lang', lang); localStorage.setItem('cr.music', 'false'); localStorage.setItem('cr.sound', 'false'); }, [LANG]);
  await ctx.route('**/_e.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(task + ': ' + e.message));
  await p.goto(base + '/'); await p.waitForSelector('.jbc', { timeout: 15000 }); await p.waitForTimeout(300);
  await p.screenshot({ path: join(OUT, `${task}-emprego-${LANG}-${W}.png`) });
  await p.locator('.jbc .btn.rob').click();
  await p.waitForSelector('.tk-stage', { timeout: 10000 }); await p.waitForTimeout(300);
  await p.screenshot({ path: join(OUT, `${task}-inicio-${LANG}-${W}.png`), fullPage: true });
  if (task === 'entradas' || task === 'contrato') {
    // marca as linhas erradas lendo a disposição que o servidor mandou
    const me = await p.evaluate(async () => (await (await fetch('/api/state')).json()).me.work.tk.layout);
    const bad = me.rows.map((r, i) => (task === 'entradas' ? !me.guests.includes(r.n) : r.v !== me.ficha[r.f]) ? i : -1).filter((i) => i >= 0);
    for (const i of bad) { await p.locator('.tk-mark').nth(i).click(); await p.waitForTimeout(120); }
    await p.screenshot({ path: join(OUT, `${task}-marcado-${LANG}-${W}.png`), fullPage: true });
    await p.locator('.tk-marcar .btn.buy').click();
  } else if (task === 'doses') {
    for (let k = 0; k < 3; k++) {
      const want = await p.locator('.tk-read small').textContent(); const alvo = parseFloat(want.replace(/[^\d,.]/g, '').replace(',', '.'));
      const [x, y] = await centro(p.locator('.tk-hold')); await p.mouse.move(x, y); await p.mouse.down();
      await p.waitForFunction((a) => parseFloat(document.querySelector('.tk-read b').textContent.replace(',', '.')) >= a - 0.02, alvo, { polling: 'raf', timeout: 10000 });
      if (k === 0) await p.screenshot({ path: join(OUT, `${task}-a-encher-${LANG}-${W}.png`) });
      await p.mouse.up(); await p.waitForTimeout(700);
    }
  } else if (task === 'camiao') {
    const kgs = await p.$$eval('.tk-truck .tk-box', (bs) => bs.map((b) => parseInt(b.textContent)));
    const ordem = kgs.map((k, i) => [k, i]).sort((a, b) => b[0] - a[0]);
    for (let j = 0; j < 6; j++) { await p.locator('.tk-truck .tk-box').filter({ hasText: new RegExp('^' + ordem[j][0] + ' kg$') }).first().click(); await p.locator(`.tk-slot[data-k="${j}"]`).click(); await p.waitForTimeout(250); }
  }
  await p.waitForSelector('.tk-res', { timeout: 30000 }); await p.waitForTimeout(400);
  await p.screenshot({ path: join(OUT, `${task}-fim-${LANG}-${W}.png`), fullPage: true });
  console.log(task, '→', (await p.locator('.tk-res').innerText()).replace(/\s+/g, ' '));
  await ctx.close();
}
await parar();
console.log(erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros na consola');
await browser.close();
