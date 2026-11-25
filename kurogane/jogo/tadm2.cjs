// painel de administração: cabe no ecrã (deitado, ao alto, pequeno) e criar o veículo escolhido
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-testadm2'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3195', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'ignore' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
server.listen(0, async () => {
  const port = server.address().port, CODE = fs.readFileSync('/tmp/kg-admin-code.txt', 'utf8').trim();
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  try {
    let ctx, page, ev, errs = [];
    for (const [nm, w, h] of [['deitado', 844, 390], ['alto', 390, 844], ['pequeno', 360, 640]]) {
      if (ctx) { await page.setViewportSize({ width: w, height: h }); await W(800); await ev(() => G.ui.admOpen()); await W(600); }
      else { ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await ctx.addInitScript(() => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: 'p' + innerWidth, lista: [{ id: 'p' + innerWidth, nome: ({ 844: 'Ana', 390: 'Bia', 360: 'Cris' })[innerWidth] || 'Duda', criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3195/ws'); localStorage.setItem('kg.test', '1'); } catch (e) { } });
      page = await ctx.newPage(); ev = (f, a) => page.evaluate(f, a); page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true', null, { timeout: 240000 });
      await ev(() => G.dbgKit()); await W(2500); await ev(() => { G.p.x = 1000.5; G.p.z = 600.5; G.net.start(); }); await W(2500);
      await ev(c => G.net.admClaim(c), CODE); await W(1000);
      await ev(() => G.ui.admOpen()); await W(800); }
      const tabs = await ev(() => [...document.querySelectorAll('#admTabs button')].map(b => b.dataset.t));
      for (const t of tabs) {
        await ev(t => document.querySelector(`#admTabs button[data-t="${t}"]`).click(), t); await W(700);
        const over = await ev(() => { const out = []; const vw = innerWidth, vh = innerHeight; for (const e of document.querySelectorAll('#adm *')) { const r = e.getBoundingClientRect(); if (!r.width || !e.offsetParent) continue; if (r.right > vw + 1 || r.left < -1) out.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== 'auto' && getComputedStyle(e).overflowX !== 'scroll' && e.children.length) out.push('corta: ' + (e.id || e.className || e.tagName)); } return [...new Set(out)].slice(0, 8); });
        if (t === 'p') { await ev(() => { const r = document.querySelector('#admB .ap'); if (r) r.click(); }); await W(600); }
        console.log(nm, 'aba', t, over.length ? 'FORA: ' + over.join(' | ') : 'ok');
        await page.screenshot({ path: path.join(outDir, `adm-${nm}-${t}.png`) });
      }
      if (nm === 'deitado') {
        await ev(() => document.querySelector('#admTabs button[data-t="e"]').click()); await W(500);
        const opts = await ev(() => [...document.querySelectorAll('#admV option')].map(o => o.value));
        await ev(() => { const s = document.getElementById('admV'); s.value = 'heli'; s.dispatchEvent(new Event('change')); document.getElementById('admCar').click(); }); await W(1500);
        console.log('veículos no menu:', opts.join(','), '| criado:', await ev(() => JSON.stringify((G.net.cars ? [...(G.net.cars.values ? G.net.cars.values() : Object.values(G.net.cars))] : []).map(c => c.k).slice(-3))), await ev(() => document.getElementById('toast').textContent));
      }
      console.log(nm, 'erros:', errs.length);
    }
  } catch (e) { console.log('ERRO', e.stack || e); }
  await browser.close(); server.close(); gs.kill(); process.exit(0);
});
