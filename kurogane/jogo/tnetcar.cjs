// Fase 5: tipos de veículo, tiros em veículos (o blindado protege), disparar da janela
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-testcar'; fs.rmSync(ST, { recursive: true, force: true }); fs.mkdirSync(ST, { recursive: true });
let gs = null;
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (nome, id) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3192/ws'); localStorage.setItem('kg.test', '1'); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 700)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader|CORS|ERR_FAILED|ERR_CONNECTION_REFUSED|404/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    const wv = await A.ev(() => G.WV); fs.writeFileSync(path.join(ST, 'estado.json'), JSON.stringify({ w: { wv } }));
    gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3192', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
    await W(900);
    for (const P of [A, B]) await P.ev(() => G.dbgKit()); await W(2500);
    // um sítio com um Humvee e um carro fechado normal a menos de 300 m (a lista de veículos é igual em todos os aparelhos)
    const plan = await A.ev(() => { const L = G.cars.spawnPoints(); for (const h of L.filter(q => q[3] === 'humvee')) { const o = L.find(q => ['sedan', 'suv', 'coupe', 'van', 'sport'].includes(q[3]) && Math.hypot(q[0] - h[0], q[1] - h[1]) < 380); if (o) return { h, o }; } return null; });
    console.log('plano:', JSON.stringify(plan)); const spot = [plan.h[0] + 12, plan.h[1] + 12], K2 = plan.o[3];
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; G.net.start(); }, spot); await W(2500);
    await B.ev(s => { G.p.x = s[0] + 10; G.p.z = s[1]; G.net.start(); }, spot); await W(3000);
    // a Ana (admin no teste) cria um sedan e um Humvee ao pé do Bruno
    const mkCar = async (k) => { await A.ev(() => G.net.raw({ t: 'admclaim', code: 'x' })); return null; };
    const kinds = await A.ev(() => { const n = {}; for (const c of G.cars.list) n[c.k] = (n[c.k] || 0) + 1; return n; });
    console.log('tipos que o servidor mandou:', JSON.stringify(kinds)); ok(Object.keys(kinds).length >= 2 && kinds.humvee, 'o servidor tem veículos de vários tipos');
    // usar um sedan e um Humvee do mapa: trazê-los para aqui é coisa do servidor, por isso o Bruno vai até eles
    const pick = k => A.ev(k => { const c = G.cars.list.find(q => q.k === k && q.hp > 0 && !q.seats.some(Boolean)); return c ? [c.id, c.x, c.z, c.yaw] : null; }, k);
    for (const k of [K2, 'humvee']) {
      const c = await pick(k); if (!c) { ok(false, 'há um ' + k + ' no mapa'); continue; }
      await B.ev(c => { G.p.x = c[1] + 3; G.p.z = c[2]; }, c); await W(1500);
      await B.ev(id => { const c = G.cars.list.find(q => q.id === id); G.cars.enter(c); }, c[0]); await W(1500);
      ok(await B.ev(() => !!G.car && G.carSeat === 0), 'o Bruno conduz o ' + k);
      await A.ev(c => { const a = c[3] + Math.PI / 2; G.p.x = c[1] + Math.sin(a) * 9; G.p.z = c[2] + Math.cos(a) * 9; }, c); await W(1800);
      const hp0 = await B.ev(() => [G.p.hp, G.car.hp]);
      for (let i = 0; i < (k === 'humvee' ? 10 : 4); i++) { await A.ev(id => { const c = G.cars.list.find(q => q.id === id); G.fp = false; if (!G.aimS.on) G.aimStart(); G.aimS.raise = 1; G.aimS.Aw = new G.V3(c.x, 1.25, c.z); G.p.reload = 0; G.p.cd = 0; const it = G.inv.belt[G.sel]; it.ammo = Math.max(it.ammo, 5); G.p.yaw = Math.atan2(c.x - G.p.x, c.z - G.p.z); return G.dbg.fire(); }, c[0]); await W(450); }
      await W(1200); const hp1 = await B.ev(() => [G.p.hp, G.car ? G.car.hp : -1]);
      console.log(k, 'vida do Bruno e do carro:', JSON.stringify(hp0), '→', JSON.stringify(hp1));
      ok(hp1[1] < hp0[1], k + ': os tiros estragam o veículo');
      if (k === 'humvee') ok(hp1[0] >= hp0[0], 'no Humvee blindado o Bruno não leva tiros'); else ok(hp1[0] < hp0[0] || hp1[1] < hp0[1] - 30, 'no sedan os tiros passam (o Bruno ou o carro levam)');
      if (!(await B.ev(() => G.p.alive))) { await B.ev(() => G.dbgKit()); await W(2500); await B.ev(s => { G.p.x = s[0] + 10; G.p.z = s[1]; G.net.start(); }, spot); await W(3000); } else { await B.ev(() => { if (G.car) G.cars.exit(); G.p.hp = 100; }); await W(1200); }
    }
    // disparar da janela: a Ana conduz, o Bruno vai ao lado e aponta
    const c = await pick(K2); await A.ev(c => { G.p.x = c[1] + 3; G.p.z = c[2]; }, c); await B.ev(c => { G.p.x = c[1] - 3; G.p.z = c[2]; G.p.hp = 100; }, c); await W(1500);
    await A.ev(id => G.cars.enter(G.cars.list.find(q => q.id === id)), c[0]); await W(1200); await B.ev(id => G.cars.enter(G.cars.list.find(q => q.id === id)), c[0]); await W(1500);
    const seats = await B.ev(() => [G.carSeat, !!G.car]); ok(seats[1] && seats[0] > 0, 'o Bruno vai de passageiro (lugar ' + seats[0] + ')');
    const wpos = await B.ev(() => { G.aimStart(); return null; }); await W(1200);
    const lean = await B.ev(() => { const c = G.car; return { lean: !!G.leanOut, d: +Math.hypot(G.p.x - c.x, G.p.z - c.z).toFixed(2), aim: G.aimS.on }; }); console.log('janela:', JSON.stringify(lean));
    ok(lean.lean && lean.d > 1.1, 'a apontar de passageiro, o Bruno debruça-se pela janela');
    const a0 = await B.ev(() => G.inv.belt[G.sel].ammo); await B.ev(() => { G.aimS.raise = 1; G.p.cd = 0; G.p.reload = 0; G.aimS.Aw = new G.V3(G.p.x + 8, 1.2, G.p.z); return G.dbg.fire(); }); await W(500);
    const a1 = await B.ev(() => G.inv.belt[G.sel].ammo); ok(a1 < a0, 'dispara da janela (' + a0 + ' → ' + a1 + ')');
    const seenA = await A.ev(() => { const r = [...G.net.R.values()].find(q => q.name === 'Bruno') || [...G.net.R.values()][0]; return r ? { vis: r.b.root.visible } : null; }); console.log('a Ana vê o Bruno debruçado:', JSON.stringify(seenA));
    await B.page.screenshot({ path: path.join(outDir, 'net-janela.png') });
    console.log('erros:', A.errs.length + B.errs.length, JSON.stringify([...A.errs, ...B.errs]).slice(0, 400)); ok(A.errs.length + B.errs.length === 0, 'sem erros no jogo');
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs && gs.kill();
});
