// Fase 4: mudar de mapa não apaga bases (só o que calha em cima de estrada/casa nova), não se constrói na água, lançamento aéreo
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-testdrop'; fs.rmSync(ST, { recursive: true, force: true }); fs.mkdirSync(ST, { recursive: true });
let gs = null;
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (nome, id) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3194/ws'); localStorage.setItem('kg.test', '1'); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 700)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader|CORS|ERR_FAILED|ERR_CONNECTION_REFUSED|404/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  try {
    const A = await mk('Ana', 'pa');
    // estado antigo: mapa de outra versão, uma base na floresta e outra onde agora passa a estrada do aeroporto (com um baú cheio)
    const road = [2500.5, -2519.5], fx = Math.floor(road[0] / 3), fz = Math.floor(road[1] / 3), wood = [2700.5, 600.5], gx = Math.floor(wood[0] / 3), gz = Math.floor(wood[1] / 3);
    const P = (u) => ({ t: 'fund', tier: 0, hp: 250, o: 0, u, tok: 'tok' + u });
    fs.writeFileSync(path.join(ST, 'estado.json'), JSON.stringify({ w: { wv: 'mapa-velho', base: { p: { ['f:' + fx + ':' + fz]: P('uEstrada'), ['f:' + gx + ':' + gz]: P('uFloresta') }, d: { b1: { k: 'bau', x: road[0], z: road[1], y: 0, u: 'uEstrada', tok: 'tokuEstrada', hp: 300 } } }, ct: { db1: { it: [{ k: 'madeira', n: 50 }], next: 0 } } } }));
    gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3194', STATE_DIRECTORY: ST, KG_TEST: '1', KG_DROP_MS: '135000' }, stdio: 'inherit' });
    await W(900);
    await A.ev(() => G.dbgKit()); await W(2500);
    await A.ev(() => { G.p.x = 2700; G.p.z = 590; G.net.start(); }); await W(3500);
    const keys = await A.ev(() => [...G.base.pieces.keys()]);
    ok(keys.includes('f:' + gx + ':' + gz), 'mapa novo: a base na floresta ficou');
    ok(!keys.includes('f:' + fx + ':' + fz), 'mapa novo: a fundação que calhava na estrada nova saiu');
    const bags = await A.ev(() => G.bags.map(b => [Math.round(b.x), Math.round(b.z)]));
    ok(bags.some(([x, z]) => Math.abs(x - 2500) < 3 && Math.abs(z + 2519) < 3), 'o que estava no baú ficou num saco no chão (' + JSON.stringify(bags) + ')');
    // construir na água: o servidor recusa
    const lake = await A.ev(() => { const L = G.W.water.lakes[0]; return [L.x, L.z]; });
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; }, lake); await W(1500);
    await A.ev(() => G.gain('madeira', 60)); await W(2500); await A.ev(() => { document.getElementById('toast').textContent = ''; }); await A.ev(s => G.net.raw({ t: 'bp', k: 'f:' + Math.floor(s[0] / 3) + ':' + Math.floor(s[1] / 3), tt: 'fund' }), lake); await W(900);
    const t1 = await A.ev(() => document.getElementById('toast').textContent); ok(/água/i.test(t1), 'na água não se constrói (' + t1 + ')');
    ok(await A.ev(() => !!G.p.swim), 'no meio do lago: a nadar');
    // lançamento aéreo (o servidor de teste avisa 10 s depois de arrancar e deixa cair 90 s depois)
    let warn = null; for (let i = 0; i < 40 && !warn; i++) { await W(1000); warn = await A.ev(() => G.drop.warn); }
    ok(!!warn, 'aviso do avião chegou: ' + JSON.stringify(warn));
    await A.ev(() => document.getElementById('bMap').click()); await W(700); await A.page.screenshot({ path: path.join(outDir, 'net-drop-aviso.png') }); await A.ev(() => document.getElementById('bMap').click());
    let cur = null; for (let i = 0; i < 110 && !cur; i++) { await W(1000); cur = await A.ev(() => G.drop.cur); }
    ok(!!cur, 'o avião caiu: ' + JSON.stringify(cur));
    await A.ev(s => { G.p.x = s[0] + 18; G.p.z = s[1]; }, [cur.x, cur.z]); await W(3500);
    const near = await A.ev(() => ({ crates: G.bags.filter(b => b.crate).map(b => [Math.round(b.x), Math.round(b.z)]), zs: G.zs.filter(z => Math.hypot(z.x - G.p.x, z.z - G.p.z) < 60 && z.kind === 'mil').length }));
    ok(near.crates.length === 3, 'três caixas do avião (' + JSON.stringify(near.crates) + ')'); ok(near.zs >= 6, 'soldados zombies à volta: ' + near.zs);
    await A.page.screenshot({ path: path.join(outDir, 'net-drop-aviao.png') });
    const c0 = await A.ev(() => { const c = G.bags.find(b => b.crate); G.p.x = c.x + 1; G.p.z = c.z; return [c.x, c.z]; }); await W(1200);
    await A.ev(() => { const c = G.bags.find(b => b.crate); G.prompt = c; G.interact(); }); await W(1500);
    console.log('dbg caixa:', JSON.stringify(await A.ev(() => ({ p: [G.p.x, G.p.z], box: !!G.box, t: document.getElementById('toast').textContent }))));
    const items = await A.ev(() => G.box && G.box.grid ? G.box.grid.list.map(e => e.it.k) : null);
    ok(items && items.length >= 4, 'caixa com loot: ' + JSON.stringify(items));
    console.log('erros:', A.errs.length, JSON.stringify(A.errs).slice(0, 400));
    ok(A.errs.length === 0, 'sem erros no jogo');
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs && gs.kill();
});
