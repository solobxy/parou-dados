// porta da base online: construir, abrir e entrar a correr (como no telemóvel)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-test4'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3191', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
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
  const pk = (P, k) => P.ev(k => { const Q = G.base.pieces.get(k); return Q ? [Q.t, Q.tier, Math.round(Q.hp), Q.door ? Q.door.target : null] : null; }, k);
  try {
    const A = await mk('Ana', 'pa');
    await A.ev(() => G.dbgKit()); await W(3000);
    const X = 1000.5, Z = 600.5;
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; G.gain('madeira', 900); G.gain('pedraR', 400); G.net.start(); }, [X, Z]); await W(4000);
    await A.ev(() => { G.p.yaw = 0; G.base.setMode('fund'); G.base.place(); }); await W(1500);
    const F = await A.ev(() => [...G.base.pieces.keys()].find(k => k[0] === 'f')); const [, fi, fj] = F.split(':').map(Number);
    const kk = (t, a, b) => t + ':' + a + ':' + b, door = kk('h', fi, fj);
    for (const [k, t] of [[kk('h', fi, fj + 1), 'parede'], [kk('v', fi, fj), 'parede'], [kk('v', fi + 1, fj), 'parede'], [door, 'porta']]) { await A.ev(([k, t]) => G.net.raw({ t: 'bp', k, tt: t }), [k, t]); await W(700); }
    const D = await A.ev(k => { const P = G.base.pieces.get(k); return P && P.door ? [P.door.x, P.door.z, P.door.target] : null; }, door);
    console.log('fundação', F, 'porta', door, JSON.stringify(D)); ok(!!D, 'a porta existe');
    // fora, de frente para a porta, e a correr para dentro (a porta abre sozinha ao chegar, ou com o botão)
    await A.ev(([x, z]) => { Object.assign(G.p, { x, z: z - 2.4, vx: 0, vz: 0 }); }, D); await W(1500);
    const pr = await A.ev(() => G.prompt ? G.prompt.label : 'nada'); console.log('aviso:', pr);
    await A.ev(() => G.interact()); await W(1500);
    console.log('aberta?', await A.ev(k => G.base.pieces.get(k).door.target, door));
    const run = async (yaw, ms) => { await A.ev(y => { const p = G.p; p.yaw = p.root = p.aim = y; p.vx = Math.sin(y) * 0.1; p.vz = Math.cos(y) * 0.1; G.autoYaw = y; G.autoRun = true; }, yaw); await W(ms); await A.ev(() => G.setAuto(false)); await W(500); return A.ev(() => [+G.p.x.toFixed(2), +G.p.z.toFixed(2), +G.p.y.toFixed(2)]); };
    const p1 = await run(0, 6000); console.log('depois de correr para dentro:', JSON.stringify(p1), '(fundação z de', fj * 3, 'a', fj * 3 + 3, ')');
    ok(p1[1] > fj * 3 + 0.4, 'entra na base pela porta');
    const p2 = await run(Math.PI, 6000); console.log('depois de correr para fora:', JSON.stringify(p2)); ok(p2[1] < fj * 3 - 0.4, 'sai da base pela porta');
    // porta fechada: com a porta fechada não se passa
    await A.ev(([x, z]) => { Object.assign(G.p, { x, z: z - 1.2 }); }, D); await W(1000); await A.ev(() => G.interact()); await W(1200);
    console.log('fechada?', await A.ev(k => G.base.pieces.get(k).door.target, door));
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill();
});
