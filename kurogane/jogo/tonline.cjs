// só online: sem servidor não entra; com servidor entra; se a ligação cair, para e volta ao menu
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-testonl'; fs.rmSync(ST, { recursive: true, force: true });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms)); let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port; let gs = null;
  const startSrv = () => { gs = spawn('node', [process.env.KG_SERVER], { env: { ...process.env, PORT: '3196', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'ignore' }); };
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: 'po', lista: [{ id: 'po', nome: 'Olga', criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3196/ws'); localStorage.setItem('kg.test', '1'); } catch (e) { } });
    const page = await ctx.newPage(); const ev = (f, a) => page.evaluate(f, a);
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true', null, { timeout: 240000 });
    ok(await ev(() => document.getElementById('sCont').hidden && !document.getElementById('sPlay').hidden), 'menu: só «Jogar» (sem «Continuar» de jogo guardado no aparelho)');
    await ev(() => document.getElementById('sPlay').click()); await W(9500);
    ok(await ev(() => !G.playing && !document.getElementById('start').hidden), 'sem servidor: não entra no jogo');
    console.log('   aviso:', await ev(() => document.getElementById('mnote').textContent));
    startSrv(); await W(1500);
    await ev(() => document.getElementById('sPlay').click()); await W(6000);
    ok(await ev(() => G.playing && G.net.on), 'com servidor: entra e fica ligado');
    gs.kill(); await W(2500);
    ok(await ev(() => G.paused && !document.getElementById('netLost').hidden), 'ligação caiu: o jogo para e mostra «Sem ligação ao servidor»');
    await page.screenshot({ path: path.join(outDir, 'onl-caiu.png') });
    startSrv(); await W(9000);
    ok(await ev(() => G.net.on && !G.paused && document.getElementById('netLost').hidden), 'o servidor voltou: continua o jogo');
    gs.kill(); await W(40000);
    ok(await ev(() => !G.playing && !document.getElementById('start').hidden), 'sem servidor durante muito tempo: volta ao menu');
    console.log('   aviso:', await ev(() => document.getElementById('toast').textContent));
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? 'falhas: ' + fails : 'tudo bem'); await browser.close(); server.close(); if (gs) gs.kill(); process.exit(0);
});
