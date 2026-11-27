// Tiros entre jogadores numa encosta (de cima para baixo e de baixo para cima)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-sh'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3191', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const mk = async (nome, id) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3191/ws'); localStorage.setItem('kg.test', '1'); } catch (e) { } }, [nome, id]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 600)); });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    for (const P of [A, B]) await P.ev(() => G.dbgKit()); await W(2500);
    const sp = await A.ev(() => { const T = G.TER; let best = null; for (let k = 0; k < 8000; k++) { const x = (Math.random() * 2 - 1) * 3000, z = (Math.random() * 2 - 1) * 3000, a = Math.random() * 6.28, dx = Math.sin(a), dz = Math.cos(a); const d = T.at(x, z) - T.at(x + dx * 12, z + dz * 12); if (d > 1.2 && (!best || d > best[4])) best = [x, z, dx, dz, d]; } return best; });
    console.log('encosta', JSON.stringify(sp));
    for (const [dist, lab] of [[12, 'colina abaixo 12 m'], [-1, 'colina acima 12 m']]) {
      const [ax, az, bx, bz] = dist > 0 ? [sp[0], sp[1], sp[0] + sp[2] * 12, sp[1] + sp[3] * 12] : [sp[0] + sp[2] * 12, sp[1] + sp[3] * 12, sp[0], sp[1]];
      await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; if (!G.net.on) G.net.start(); }, [ax, az]); await B.ev(s => { G.p.x = s[0]; G.p.z = s[1]; G.p.hp = 100; G.inv.eq.vest = null; G.inv.eq.head = null; if (!G.net.on) G.net.start(); }, [bx, bz]); await W(4000);
      const hps = [];
      for (let i = 0; i < 3; i++) { await A.ev(() => { const r = [...G.net.R.values()][0]; if (!r) return; G.fp = false; G.aimS.Aw = new G.V3(r.x, (r.y || 0) + 1.42, r.z); G.p.reload = 0; G.p.cd = 0; const it = G.inv.belt[G.sel]; it.ammo = Math.max(it.ammo, 5); G.p.yaw = Math.atan2(r.x - G.p.x, r.z - G.p.z); return G.dbg.fire(); }); await W(700); hps.push(await B.ev(() => Math.round(G.p.hp))); }
      ok(hps[0] < 100, lab + ': o tiro acerta (' + hps.join(', ') + ')');
      await B.ev(() => { if (!G.p.alive) G.respawn(false); }); await W(1500);
    }
    // atrás de uma colina: não acerta
  } catch (e) { console.log('ERRO', e); fails++; }
  console.log(fails ? fails + ' FALHAS' : 'TUDO OK'); await browser.close(); server.close(); gs.kill(); process.exit(fails ? 1 : 0);
});
