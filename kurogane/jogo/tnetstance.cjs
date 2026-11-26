// agachado e deitado em rede: o outro vê a pose e a hitbox do servidor segue a postura
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
    await B.ev(s => { G.p.x = s[0] + 7; G.p.z = s[1]; G.p.root = 0; G.p.yaw = 0; G.net.start(); }, spot);
    for (let i = 0; i < 40 && !(await A.ev(() => G.net.on && G.net.R.size > 0)); i++) await W(500);
    await B.ev(() => { G.inv.eq.vest = null; G.inv.eq.head = null; G.p.hp = 100; });
    await A.ev(() => { for (let i = 0; i < 6; i++) if (G.inv.belt[i] && /pistola/.test(G.inv.belt[i].k)) { G.sel = i; return; } });
    const fireAt = (dy, dx = 0, dz = 0) => A.ev(([dy, dx, dz]) => { const r = [...G.net.R.values()][0]; G.fp = false; G.aimS.Aw = new G.V3(r.x + dx, (r.y || 0) + dy, r.z + dz); G.p.reload = 0; G.p.cd = 0; const it = G.inv.belt[G.sel]; it.ammo = Math.max(it.ammo, 5); G.p.yaw = Math.atan2(r.x + dx - G.p.x, r.z + dz - G.p.z); return G.dbg.fire(); }, [dy, dx, dz]);
    const hp = () => B.ev(() => Math.round(G.p.hp));
    // deitado
    await B.ev(() => G.stanceSet(2)); for (let i = 0; i < 20 && (await A.ev(() => ([...G.net.R.values()][0] || {}).sc || 0)) < 1.9; i++) await W(300);
    const scA = await A.ev(() => +([...G.net.R.values()][0].sc || 0).toFixed(2)); ok(scA > 1.9, 'a Ana vê o Bruno deitado (sc ' + scA + ')');
    await A.page.screenshot({ path: path.join(outDir, 'net-deitado.png') });
    const h0 = await hp(); await fireAt(1.15); await W(900); const h1 = await hp(); ok(h1 === h0, 'deitado: o tiro à altura do peito de quem está de pé passa por cima (' + h0 + '→' + h1 + ')');
    await fireAt(0.2); await W(900); const h2 = await hp(); ok(h2 < h1, 'deitado: o tiro no corpo no chão acerta (' + h1 + '→' + h2 + ')');
    // agachado
    await B.ev(() => { G.p.hp = 100; G.stanceSet(1); }); for (let i = 0; i < 20 && Math.abs((await A.ev(() => ([...G.net.R.values()][0] || {}).sc || 0)) - 1) > 0.1; i++) await W(300);
    const h3 = await hp(); await fireAt(1.62); await W(900); const h4 = await hp(); ok(h4 === h3, 'agachado: o tiro à altura da cabeça de quem está de pé passa por cima (' + h3 + '→' + h4 + ')');
    await fireAt(1.12); await W(900); const h5 = await hp(); ok(h5 < h4, 'agachado: o tiro na cabeça baixa acerta (' + h4 + '→' + h5 + ')');
    console.log('erros A:', A.errs.length, 'B:', B.errs.length);
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill();
});
