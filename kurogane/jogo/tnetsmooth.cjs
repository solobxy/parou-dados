// suavidade: como a Ana vê o Bruno a andar e um carro conduzido por outro (saltos, paragens, para onde está virado, animação, corpo escondido no carro)
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
    await B.ev(() => { G.p.x = -180; G.p.z = 10; G.net.start(); }); await W(3500);
    // o que a Ana vê do Bruno, imagem a imagem
    const watch = (ms, what) => A.ev(async ([ms, what]) => { const out = []; const t0 = performance.now(); await new Promise(res => { const f = () => { const r = [...G.net.R.values()][0]; if (r) { if (what === 'car') { const c = G.cars.list.find(q => q.drv); if (c) out.push([performance.now(), c.x, c.z, c.yaw, r.b.root.visible ? 1 : 0, r.s1 ? r.s1[7] : -1]); } else out.push([performance.now(), r.b.root.position.x, r.b.root.position.z, r.b.root.rotation.y, r.s1 ? r.s1[6] : 0, r.s1 ? r.s1[7] : 0, r.spd]); } if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); return out; }, [ms, what]);
    const stats = (L, label) => { const st = []; for (let i = 1; i < L.length; i++) { const dt = (L[i][0] - L[i - 1][0]) / 1000; st.push({ d: Math.hypot(L[i][1] - L[i - 1][1], L[i][2] - L[i - 1][2]), dt }); }
      const sp = st.filter(s => s.dt > 0).map(s => s.d / s.dt).sort((a, b) => a - b), med = sp[Math.floor(sp.length / 2)] || 0;
      const jumps = st.filter(s => s.dt > 0 && s.d / s.dt > med * 3 + 1.5).length, stalls = st.filter(s => s.d < 1e-4).length;
      const yaws = new Set(L.map(x => x[3].toFixed(2))).size;
      console.log(`${label}: ${L.length} imagens, velocidade típica ${med.toFixed(2)} m/s (relógio real), saltos ${jumps}, paradas ${stalls}, direções diferentes ${yaws}`); return { jumps, stalls, med, yaws, n: L.length }; };
    // o Bruno anda em frente a virar devagar (como quem anda com o polegar)
    await B.ev(() => { const p = G.p; p.yaw = p.root = p.aim = 0.4; G.autoYaw = 0.4; G.autoRun = true; window.__turn = setInterval(() => { G.autoYaw += 0.06; }, 120); });
    await W(1500);
    const L1 = await watch(7000, 'walk');
    await B.ev(() => { clearInterval(window.__turn); G.setAuto(false); });
    const s1 = stats(L1, 'Bruno a andar');
    const an = L1.map(x => x[5]), mvs = L1.map(x => x[4]);
    console.log('animação que chega: modo', [...new Set(an)].join(','), '· passada (0–1)', Math.min(...mvs).toFixed(2), 'a', Math.max(...mvs).toFixed(2));
    ok(s1.n > 10 && s1.jumps <= 2, 'o Bruno anda sem saltos (' + s1.jumps + ')');
    ok(s1.stalls <= s1.n * 0.1, 'o Bruno não fica parado a meio do caminho (' + s1.stalls + ' imagens paradas)');
    ok(s1.yaws > 10, 'o Bruno vira-se para onde vai (' + s1.yaws + ' direções)');
    ok(Math.max(...mvs) > 0.3, 'a animação de andar chega à Ana (passada ' + Math.max(...mvs).toFixed(2) + ')');
    // carro: o Bruno conduz; a Ana vê o carro andar suave e não vê o corpo do Bruno fora do carro
    const cid = await B.ev(() => { const c = G.cars.nearest(G.p, 90); if (!c) return null; G.p.x = c.x + Math.cos(c.yaw) * 1.6; G.p.z = c.z - Math.sin(c.yaw) * 1.6; return c.id; }); await W(900);
    if (!cid) { ok(false, 'não há carro perto'); } else {
      await B.ev(i => { const c = G.cars.list.find(q => q.id === i); G.cars.enter(c); }, cid); await W(1200);
      await A.ev(i => { const c = G.cars.list.find(q => q.id === i); G.p.x = c.x + 8; G.p.z = c.z + 8; }, cid); await W(1500);
      await B.page.keyboard.down('KeyW'); await W(1200);
      const L2 = await watch(5000, 'car'); await B.page.keyboard.up('KeyW');
      const s2 = stats(L2, 'carro do Bruno');
      ok(s2.n > 8 && s2.jumps <= 2, 'o carro anda sem saltos (' + s2.jumps + ')');
      ok(L2.every(x => x[4] === 0), 'o corpo do Bruno não aparece fora do carro (escondido em ' + L2.filter(x => x[4] === 0).length + '/' + L2.length + ' imagens, modo ' + [...new Set(L2.map(x => x[5]))].join(',') + ')');
    }
    console.log('erros A:', A.errs.length, 'B:', B.errs.length);
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill();
});
