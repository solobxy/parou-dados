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
    for (const P of [A, B]) { await P.ev(() => G.dbgKit()); }
    await W(3000);
    const spot = await A.ev(() => [G.p.x, G.p.z]);
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; G.net.start(); }, spot);
    await B.ev(s => { G.p.x = s[0] + 6; G.p.z = s[1]; G.p.root = 0; G.net.start(); }, spot);
    await W(4000);
    // o Bruno anda a 2,5 m/s; a Ana mede quanto as pernas dele mexem por metro
    await B.ev(() => { window.__mv = setInterval(() => { G.p.z += 0.25; }, 100); });
    await W(1500);
    const s0 = await A.ev(() => { const r = [...G.net.R.values()][0]; return r ? [r.b.phase, r.x, r.z] : null; });
    await W(6000);
    const s1 = await A.ev(() => { const r = [...G.net.R.values()][0]; return r ? [r.b.phase, r.x, r.z] : null; });
    await B.ev(() => clearInterval(window.__mv));
    if (!s0 || !s1) { ok(false, 'a Ana vê o Bruno'); } else { const dist = Math.hypot(s1[1] - s0[1], s1[2] - s0[2]), rad = Math.abs(s1[0] - s0[0]); const pm = rad / Math.max(0.01, dist);
      console.log('andou ' + dist.toFixed(2) + ' m, pernas ' + rad.toFixed(1) + ' rad, ' + pm.toFixed(2) + ' rad/m (o jogador local faz 2,7)'); ok(dist > 0.3 && pm < 4.5, 'as pernas dos outros não disparam (ritmo preso à distância andada)'); }
    // ESP da equipa do jogo: caixa e nome do outro jogador, mesmo sem o ver
    await A.ev(() => { G.net.role = 'admin'; G.admF = { r: 'admin', esp: 1 }; }); await W(2500);
    console.log('dbg esp', await A.ev(() => JSON.stringify({ n: document.querySelectorAll('.esp').length, role: G.net.role, R: [...G.net.R.values()].map(r => [r.name, !!r.s1, r.x]) })));
    const esp = await A.ev(() => [...document.querySelectorAll('.esp')].filter(e => e.style.display !== 'none').map(e => e.textContent));
    await A.page.screenshot({ path: path.join(outDir, 'net-esp.png') });
    ok(esp.some(t => /Bruno/.test(t) && / m/.test(t)), 'ESP: aparece o Bruno com distância (' + esp.join(' | ') + ')');
    await A.ev(() => { G.admF.esp = 0; }); await W(1500); const off = await A.ev(() => [...document.querySelectorAll('.esp')].filter(e => e.style.display !== 'none').length); ok(off === 0, 'ESP desligado: some');
    await browser.close(); server.close(); gs.kill(); process.exit(fails ? 1 : 0);
  } catch (e) { console.log('ERRO', e); process.exit(1); }
});
