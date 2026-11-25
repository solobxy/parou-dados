// Animais online: o servidor guarda-os, os dois veem o mesmo; adotar um cão (gasta a comida a sério), o cão segue o dono; animal morto deixa carne e couro para todos
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-testan'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3197', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (nome, id) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3197/ws'); localStorage.setItem('kg.test', '1'); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 700)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader|CORS|ERR_FAILED|404/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  const CODE = fs.readFileSync('/tmp/kg-admin-code.txt', 'utf8').trim();
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    for (const P of [A, B]) await P.ev(() => G.dbgKit());
    await W(2500);
    await A.ev(() => { G.net.start(); }); await W(2500); await B.ev(() => { G.net.start(); }); await W(2500);
    await A.ev(c => G.net.admClaim(c), CODE); await W(900);
    const tw = await A.ev(() => { const t = G.W.zones.find(z => z.kind === 'town'); return { x: t.x, z: t.z }; });
    await A.ev(t => { G.p.x = t.x + 3; G.p.z = t.z + 3; }, tw); await B.ev(t => { G.p.x = t.x + 6; G.p.z = t.z + 3; }, tw); await W(5000);
    const cnt = P => P.ev(() => { const c = {}; for (const z of G.zs) if (z.an) c[z.an] = (c[z.an] || 0) + 1; return c; });
    const ca = await cnt(A), cb = await cnt(B); console.log('A vê', JSON.stringify(ca), 'B vê', JSON.stringify(cb)); ok(Object.keys(ca).length > 0 && JSON.stringify(ca) === JSON.stringify(cb), 'os dois veem os mesmos animais');
    // cão mais perto: A põe-se ao lado com carne e dá-lha
    await A.ev(() => G.net.adm('give', { k: 'carneC', n: 2 })); await W(1500);
    const dog = await A.ev(() => { let b = null, bd = 1e9; for (const z of G.zs) if (z.an === 'cao' && !z.pet && z.state !== 'dead') { const d = Math.hypot(z.x - G.p.x, z.z - G.p.z); if (d < bd) { bd = d; b = z; } } if (!b) return null; G.p.x = b.x + 1.0; G.p.z = b.z; return b.nid; });
    ok(dog != null, 'há um cão vadio perto da vila'); await W(1200);
    const lab = await A.ev(() => { const z = G.zs.find(q => q.nid === window.__dogN); return G.prompt && G.prompt.label; }); console.log('A vê:', lab);
    await A.ev(n => { const z = G.zs.find(q => q.nid === n); G.p.x = z.x + 1.0; G.p.z = z.z; }, dog); await W(700);
    await A.ev(() => G.interact()); await W(2500);
    const petA = await A.ev(n => { const z = G.zs.find(q => q.nid === n); return [z.pet, G.net.uid, G.inv.count('carneC'), z.remote]; }, dog);
    const petB = await B.ev(n => { const z = G.zs.find(q => q.nid === n); return z ? z.pet : 'sem'; }, dog);
    console.log('A:', JSON.stringify(petA), 'B vê dono:', petB); ok(petA[0] === petA[1] && petB === petA[1] && petA[2] === 1 && !petA[3], 'cão adotado no servidor, A gastou 1 carne e simula o cão');
    await A.ev(() => { G.p.x += 12; }); { const t0 = await A.ev(() => G.t); while ((await A.ev(() => G.t)) - t0 < 6) await W(500); } await W(1000);
    const fol = await B.ev(n => { const z = G.zs.find(q => q.nid === n), a = [...G.net.R.values()][0]; return Math.hypot(z.x - a.x, z.z - a.z); }, dog); console.log('B vê o cão a', fol.toFixed(1), 'm de A'); const prey = await A.ev(n => { const z = G.zs.find(q => q.nid === n); return !!z.prey; }, dog); console.log('cão a atacar um zombie?', prey); ok(fol < 6 || prey, 'o cão segue o dono (ou está a defendê-lo de um zombie)');
    // B mata um veado: saco com carne e couro para os dois
    const deer = await B.ev(() => { const z = G.zs.find(q => q.an && !q.pet && q.state !== 'dead'); if (!z) return null; G.dbgHurtZ(z, 999); return [z.nid, z.an, Math.round(z.x), Math.round(z.z)]; });
    ok(deer, 'há um animal para caçar'); await W(2500);
    const bagA = await A.ev(d => G.bags.some(b => Math.hypot(b.x - d[2], b.z - d[3]) < 3), deer), bagB = await B.ev(d => G.bags.some(b => Math.hypot(b.x - d[2], b.z - d[3]) < 3), deer);
    ok(bagA && bagB, 'o animal morto deixa um saco que os dois veem (' + (deer && deer[1]) + ')');
    ok(!A.errs.length && !B.errs.length, 'sem erros');
  } catch (e) { console.log('ERRO', e); fails++; }
  await browser.close(); gs.kill(); server.close(); console.log(fails ? fails + ' falhas' : 'tudo bem'); process.exit(fails ? 1 : 0);
});
