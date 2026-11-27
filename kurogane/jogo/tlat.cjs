// Atraso de rede: quanto tempo passa entre o Ana estar num sítio e o Bruno a ver lá (média e pior), no mesmo computador
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = process.env.KG_ROOT || path.join(__dirname, 'dist');
const ST = '/tmp/kgsrv-lat'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3191', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const mk = async (nome, id) => { const ctx = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3191/ws'); localStorage.setItem('kg.test', '1'); } catch (e) { } }, [nome, id]);
    const page = await ctx.newPage(); await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 }); return { page, ev: (f, a) => page.evaluate(f, a) }; };
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    for (const P of [A, B]) await P.ev(() => G.dbgKit()); await W(2500);
    const spot = await A.ev(() => [G.p.x, G.p.z]); await A.ev(() => G.net.start()); await B.ev(s => { G.p.x = s[0] + 5; G.p.z = s[1]; G.net.start(); }, spot); await W(6000);
    const tA = await A.ev(() => performance.timeOrigin);
    const L = []; let del = 0, jit = 0;
    for (let i = 0; i < 80; i++) { const r = await B.ev(tA => { const r = [...G.net.R.values()].find(q => q.name === 'Ana'); if (!r || r.rt == null) return null; return [performance.timeOrigin + performance.now() - tA - r.rt, r.T.delay, r.T.jit]; }, tA); if (r) { L.push(r[0]); del += r[1]; jit += r[2]; } await W(100); }
    L.sort((a, b) => a - b); const avg = L.reduce((a, b) => a + b, 0) / L.length;
    console.log(`ATRASO média ${avg.toFixed(0)} ms · mediana ${L[L.length >> 1].toFixed(0)} · 90% ${L[Math.floor(L.length * 0.9)].toFixed(0)} · interp ${(del / L.length).toFixed(0)} ms · jitter ${(jit / L.length).toFixed(0)} ms · n=${L.length}`);
  } catch (e) { console.log('ERRO', e); }
  await browser.close(); server.close(); gs.kill(); process.exit(0);
});
