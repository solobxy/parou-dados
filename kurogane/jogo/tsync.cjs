// Sincronização entre dois jogadores: portas (abrir, fechar, longe e perto) e atraso do movimento
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-test'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3191', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (nome, id, tok) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id, tok]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3191/ws'); localStorage.setItem('kg.test', '1'); if (tok) localStorage.setItem('kg.tok.' + id, tok); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id, tok]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 600)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    for (const P of [A, B]) await P.ev(() => { G.dbgKit(); G.applyGfx({ shadows: false, lowres: true }); G.dbgR.setPixelRatio(0.3); }); await W(2500);
    // perto de uma casa de Kitamura, os dois
    const di = await A.ev(() => { const L = G.dbgDoors(); let bi = -1, bd = 1e9; L.forEach((D, i) => { if (D.base || D.lock || D.lv) return; const d = Math.hypot(D.x + 165, D.z + 9); if (d < bd) { bd = d; bi = i; } }); const D = L[bi]; G.p.x = D.x + 3; G.p.z = D.z + 3; G.net.start(); return bi; });
    await B.ev(i => { const D = G.dbgDoors()[i]; G.p.x = D.x - 3; G.p.z = D.z + 4; G.net.start(); }, di); await W(4000);
    console.log('porta', di, JSON.stringify(await A.ev(i => { const D = G.dbgDoors()[i]; return [D.x, D.z, D.wid, D.target]; }, di)), 'WV', await A.ev(() => G.WV), await B.ev(() => G.WV));
    // tempo até o outro ver: abre no A, espera no B
    const lat = async (fA, fB, n) => { const t0 = Date.now(); await A.ev(fA); for (let i = 0; i < 150; i++) { if (await B.ev(fB)) return Date.now() - t0; await W(10); } return -1; };
    await A.ev(i => { window.__di = i; }, di); await B.ev(i => { window.__dib = i; }, di);
    for (let k = 0; k < 3; k++) {
      const tO = await lat(() => { G.dbgDoor(window.__di, 1); }, () => G.dbgDoors()[window.__dib].target === 1);
      await W(600); const tC = await lat(() => { G.dbgDoor(window.__di, 0); }, () => G.dbgDoors()[window.__dib].target === 0);
      await W(600); console.log('porta abrir/fechar no outro (ms):', tO, tC); ok(tO > 0 && tC > 0, 'a porta abre e fecha no ecrã do outro (' + tO + ' / ' + tC + ' ms)'); }
    // a porta abre-se e o outro entra e sai do raio: continua certa
    await A.ev(() => G.dbgDoor(window.__di, 1)); await W(500); await B.ev(() => { G.p.x += 400; }); await W(2500); await A.ev(() => G.dbgDoor(window.__di, 0)); await W(400); await A.ev(() => G.dbgDoor(window.__di, 1)); await W(400); await B.ev(() => { G.p.x -= 400; }); await W(2500);
    const far = await B.ev(() => G.dbgDoors()[window.__dib].target); ok(far === 1, 'mexida enquanto o outro estava longe: ao voltar está certa (' + far + ')');
    // atraso do movimento: o A dá um salto de 2 m; quanto tempo até o B o ver lá
    const ml = []; for (let k = 0; k < 6; k++) { const x0 = await A.ev(() => G.p.x); const t0 = Date.now(); await A.ev(() => { G.p.x += 2; }); let t = -1; for (let i = 0; i < 100; i++) { const rx = await B.ev(() => { const r = [...G.net.R.values()][0]; return r ? r.x : null; }); if (rx != null && Math.abs(rx - (x0 + 2)) < 0.25) { t = Date.now() - t0; break; } await W(5); } ml.push(t); await W(300); }
    console.log('movimento até o outro ver (ms):', JSON.stringify(ml), 'atraso de desenho:', await B.ev(() => { const r = [...G.net.R.values()][0]; return r ? Math.round(r.T.delay) : null; }));
    console.log('erros A:', A.errs.length, 'B:', B.errs.length);
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill();
});
