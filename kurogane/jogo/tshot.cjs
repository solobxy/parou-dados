// Dois jogadores no mesmo servidor: ver-se, disparar, morrer, mochila, clã e quem dorme
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
    for (const P of [A, B]) await P.ev(() => { G.dbgKit(); const O = WebSocket; window.WebSocket = function (u) { const w = new O(u); w.addEventListener('message', e => { if (/"t":"(hit|hitc)"/.test(e.data)) (window.__h = window.__h || []).push([Date.now() % 100000, e.data.slice(0, 120)]); }); const s0 = w.send.bind(w); w.send = d => { if (/"t":"shot"/.test(d)) (window.__s = window.__s || []).push([Date.now() % 100000, d.slice(0, 300)]); s0(d); }; return w; }; window.WebSocket.prototype = O.prototype; });
    await W(2500);
    const spot = await A.ev(() => [G.p.x, G.p.z]);
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; G.net.start(); }, spot);
    await B.ev(s => { G.p.x = s[0] + 6; G.p.z = s[1]; G.p.root = 0; G.net.start(); }, spot);
    await W(5000);
    await B.ev(() => { G.inv.eq.vest = null; G.inv.eq.head = null; G.p.hp = 100; }); await W(600);
    for (let i = 0; i < 3; i++) {
      const r0 = await A.ev(() => { const r = [...G.net.R.values()][0]; G.fp = false; G.aimS.Aw = new G.V3(r.x, (r.y || 0) + 1.42, r.z); G.p.reload = 0; G.p.cd = 0; const it = G.inv.belt[G.sel]; it.ammo = Math.max(it.ammo, 5); G.p.yaw = Math.atan2(r.x - G.p.x, r.z - G.p.z); const f = G.dbg.fire(); return [f, r.x, r.y, r.z, r.b.root.visible, Math.round(r.rt), Math.round(r.T.delay), G.p.x, G.p.z, Date.now() % 100000]; });
      await W(900); console.log('tiro', i, JSON.stringify(r0), 'B:', JSON.stringify(await B.ev(() => [Math.round(G.p.hp), G.p.x, G.p.z, G.p.y, window.__h || []])));
    }
    console.log('A shots', JSON.stringify(await A.ev(() => window.__s || [])));
    console.log('A recebeu', JSON.stringify(await A.ev(() => window.__h || [])));
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  await browser.close(); server.close(); gs.kill();
});
