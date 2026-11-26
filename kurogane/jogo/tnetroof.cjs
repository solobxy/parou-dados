// Online: helicóptero pousado num telhado fica lá em cima (o servidor guarda a altura do telhado)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-testrf'; fs.rmSync(ST, { recursive: true, force: true }); fs.mkdirSync(ST, { recursive: true });
// uma porta antiga (de antes das fechaduras): tem de ficar trancada só para o dono e o clã
let gs = null;
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (nome, id) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3195/ws'); localStorage.setItem('kg.test', '1'); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 700)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader|CORS|ERR_FAILED|404/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3195', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
    await W(800); for (const P of [A, B]) await P.ev(() => G.dbgKit()); await W(2500);
    const R = await A.ev(() => { const W0 = G.W; for (const C of W0.cuts.filter(C => C.roofY && C.ix1 - C.ix0 > 6.5 && C.iz1 - C.iz0 > 6.5)) { for (let k = 0; k < 200; k++) { const x = C.ix0 + 2.3 + Math.random() * (C.ix1 - C.ix0 - 4.6), z = C.iz0 + 2.3 + Math.random() * (C.iz1 - C.iz0 - 4.6); if (!W0.rects.some(r => r.lv === C.n && r.roof && x + 2.3 > r.x0 && x - 2.3 < r.x1 && z + 2.3 > r.z0 && z - 2.3 < r.z1)) return { id: C.id, x, z, y: C.roofY }; } } });
    await A.ev(() => { G.p.x = 210; G.p.z = -182; G.net.start(); }); await W(2500);
    await B.ev(() => { G.p.x = 215; G.p.z = -186; G.net.start(); }); await W(2500);
    const hid = await A.ev(() => { const c = G.cars.list.find(q => q.k === 'heli' && Math.hypot(q.x - 208, q.z + 182) < 8); G.cars.enter(c); return c && c.id; }); await W(1500);
    ok(await A.ev(() => !!G.car), 'a Ana entrou no helicóptero');
    await A.ev(R => { const c = G.car; c.x = R.x; c.z = R.z; c.air = true; c.rot = 1; c.alt = R.y + 6; c.uAlt = R.y + 6; c.vx = c.vz = 0; G.p.x = R.x; G.p.z = R.z; G.dbgDrive = { kb: true, t: -1, s: 0 }; }, R);
    for (let i = 0; i < 40; i++) { await W(1000); if (!(await A.ev(() => G.car.air))) break; }
    console.log('pousou:', JSON.stringify(await A.ev(() => [+G.car.alt.toFixed(2), +(G.car.pad || 0).toFixed(2)])), 'telhado', R.y.toFixed(2));
    await A.ev(() => { G.dbgDrive = { kb: true, t: 0, s: 0 }; }); await W(1500);
    await A.ev(() => G.cars.exit()); await W(2500);
    ok(await A.ev(() => !G.car && G.p.lv > 0), 'a Ana saiu para o telhado');
    const bAlt = await B.ev(id => { const c = G.cars.list.find(q => q.id === id); return c ? +(c.alt || 0).toFixed(2) : null; }, hid);
    console.log('o Bruno vê o heli a', bAlt);
    ok(bAlt !== null && Math.abs(bAlt - R.y) < 0.6, 'para os outros, o helicóptero fica em cima do telhado');
    const aAlt = await A.ev(id => +(G.cars.list.find(q => q.id === id).alt || 0).toFixed(2), hid);
    ok(Math.abs(aAlt - R.y) < 0.6, 'para a Ana também (depois da resposta do servidor): ' + aAlt);
    console.log('erros', A.errs.length, B.errs.length);
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  if (gs) gs.kill(); await browser.close(); server.close(); console.log(fails ? 'FALHAS: ' + fails : 'TUDO OK'); process.exit(fails ? 1 : 0);
});
