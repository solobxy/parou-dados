// Carros online: os mesmos carros, conduzir com passageiro, ficam onde se deixam
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-test5'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3191', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
const saude = () => new Promise(r => http.get('http://127.0.0.1:3191/saude', res => { let b = ''; res.on('data', d => b += d); res.on('end', () => r(JSON.parse(b))); }));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (nome, id) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3191/ws'); localStorage.setItem('kg.test', '1'); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 700)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader|CORS|ERR_FAILED|404/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    for (const P of [A, B]) await P.ev(() => G.dbgKit());
    await W(3000);
    await A.ev(() => { G.p.x = -186; G.p.z = 4; G.net.start(); }); await W(2500);
    await B.ev(() => { G.p.x = -184; G.p.z = 6; G.net.start(); }); await W(3000);
    const h = await saude(); console.log('servidor:', JSON.stringify(h)); ok(h.carros > 10, 'o servidor tem ' + h.carros + ' carros');
    const cars = await Promise.all([A, B].map(P => P.ev(() => G.cars.list.map(c => c.id + '@' + Math.round(c.x) + ',' + Math.round(c.z)).sort().join(' '))));
    console.log('carros perto (Ana | Bruno):', cars[0], '|', cars[1]); ok(cars[0] && cars[0] === cars[1], 'os dois veem os mesmos carros');
    // a Ana conduz; o Bruno entra como passageiro
    const cid = await A.ev(() => { const c = G.cars.nearest(G.p, 60); G.p.x = c.x + Math.cos(c.yaw) * 1.6; G.p.z = c.z - Math.sin(c.yaw) * 1.6; return c.id; }); await W(700);
    await A.ev(i => { const c = G.cars.list.find(q => q.id === i); G.cars.enter(c); }, cid); await W(900);
    await B.ev(i => { const c = G.cars.list.find(q => q.id === i); G.p.x = c.x - Math.cos(c.yaw) * 1.6; G.p.z = c.z + Math.sin(c.yaw) * 1.6; }, cid); await W(700);
    await B.ev(i => { const c = G.cars.list.find(q => q.id === i); G.cars.enter(c); }, cid); await W(900);
    const st = await Promise.all([A.ev(() => [!!G.car, G.carSeat]), B.ev(() => [!!G.car, G.carSeat])]); console.log('lugares (Ana, Bruno):', JSON.stringify(st)); ok(st[0][0] && st[0][1] === 0 && st[1][0] && st[1][1] === 1, 'a Ana conduz e o Bruno vai ao lado');
    const p0 = await B.ev(i => { const c = G.cars.list.find(q => q.id === i); return [c.x, c.z]; }, cid);
    await A.page.keyboard.down('KeyW'); await W(6000); await A.page.keyboard.up('KeyW'); await W(1500);
    const pa = await A.ev(() => [G.car.x, G.car.z]), pb = await B.ev(i => { const c = G.cars.list.find(q => q.id === i); return [c.x, c.z, G.p.x, G.p.z]; }, cid);
    const moved = Math.hypot(pa[0] - p0[0], pa[1] - p0[1]), diff = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
    console.log('o carro andou', moved.toFixed(1), 'm · diferença entre o que a Ana e o Bruno veem', diff.toFixed(2), 'm · o Bruno vai dentro:', Math.hypot(pb[2] - pb[0], pb[3] - pb[1]).toFixed(1), 'm do centro');
    ok(moved > 1 && diff < 1.5, 'o Bruno vê o carro onde a Ana o leva');
    // os dois saem; o carro fica ali para os dois
    await A.ev(() => G.cars.exit()); await B.ev(() => G.cars.exit()); await W(1500);
    const fin = await Promise.all([A, B].map(P => P.ev(i => { const c = G.cars.list.find(q => q.id === i); return [Math.round(c.x), Math.round(c.z), c.seats.join(), !!G.car]; }, cid)));
    console.log('depois de sair (Ana | Bruno):', JSON.stringify(fin)); ok(JSON.stringify(fin[0]) === JSON.stringify(fin[1]) && fin[0][2] === '0,0,0,0', 'o carro ficou no mesmo sítio para os dois, vazio');
    await A.page.screenshot({ path: path.join(outDir, 'net-carro-A.png') });
    console.log('erros A:', A.errs.length, 'B:', B.errs.length);
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill();
});
