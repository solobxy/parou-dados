// Mundo partilhado (parte 3): bases, portas da base, baús, fornalha, camas e explosões
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-test4'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3191', STATE_DIRECTORY: ST }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (nome, id) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3191/ws'); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 700)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader|CORS|ERR_FAILED|404/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  const pk = (P, k) => P.ev(k => { const Q = G.base.pieces.get(k); return Q ? [Q.t, Q.tier, Math.round(Q.hp), Q.door ? Q.door.target : null] : null; }, k);
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    for (const P of [A, B]) await P.page.click('#sKit');
    await W(3000);
    const X = 1000.5, Z = 600.5, I = 333, J = 200; // célula da base da Ana
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; G.gain('madeira', 900); G.gain('pedraR', 400); G.net.start(); }, [X, Z]); await W(2000);
    await B.ev(s => { G.p.x = s[0] + 7; G.p.z = s[1]; G.net.start(); }, [X, Z]); await W(2500);
    // a Ana põe a fundação (pelo caminho normal do jogo) e uma porta
    const fk = await A.ev(() => { G.p.yaw = 0; G.base.setMode('fund'); const t = G.base.B; const r = G.base.place(); return r; }); await W(1000);
    const myF = await A.ev(() => [...G.base.pieces.keys()].filter(k => k[0] === 'f'));
    console.log('fundações da Ana:', JSON.stringify(myF));
    const F = myF[0]; const [, fi, fj] = F.split(':').map(Number);
    const seenB = await pk(B, F); ok(!!fk && seenB && seenB[0] === 'fund', 'a fundação da Ana aparece ao Bruno (' + F + ')');
    const door = 'h:' + fi + ':' + fj;
    await A.ev(k => G.net.raw({ t: 'bp', k, tt: 'porta' }), door); await W(900);
    ok(JSON.stringify(await pk(B, door)) === JSON.stringify(await pk(A, door)) && (await pk(B, door))[0] === 'porta', 'a porta da Ana aparece ao Bruno');
    // o Bruno não abre a porta da Ana, nem constrói colado à base dela
    await B.ev(k => { const D = G.base.pieces.get(k).door; G.prompt = { door: D, label: '' }; G.interact(); }, door); await W(900);
    const d1 = await pk(A, door), t1 = await B.ev(() => document.getElementById('toast').textContent);
    console.log('porta depois do Bruno tentar:', JSON.stringify(d1), '·', t1); ok(d1[3] === 0 && /Trancada/.test(t1), 'a porta da Ana está trancada para o Bruno');
    await B.ev(s => G.net.raw({ t: 'bp', k: 'f:' + (s[0] + 1) + ':' + s[1], tt: 'fund' }), [fi, fj]); await W(800);
    const nb = await B.ev(() => document.getElementById('toast').textContent); ok(/outro jogador/.test(nb), 'o Bruno não constrói colado à base da Ana (' + nb + ')');
    // a Ana abre a sua porta: aberta para os dois
    await A.ev(k => { const D = G.base.pieces.get(k).door; G.prompt = { door: D, label: '' }; G.interact(); }, door); await W(900);
    ok((await pk(B, door))[3] === 1, 'a Ana abriu a porta e o Bruno vê-a aberta');
    // baú: a Ana põe um baú, guarda madeira, o Bruno vê o mesmo
    await A.ev(() => { G.p.yaw = Math.PI; G.base.deploy({ k: 'bau', n: 1 }); }); await W(1200);
    const ch = await B.ev(() => G.base.deps.filter(d => d.k === 'bau').map(d => d.nid)); ok(ch.length === 1, 'o baú da Ana aparece ao Bruno');
    await A.ev(() => { const d = G.base.deps.find(d => d.k === 'bau'); G.p.x = d.x + 0.8; G.p.z = d.z; }); await W(600);
    await A.ev(() => { const d = G.base.deps.find(d => d.k === 'bau'); G.prompt = d.c; G.interact(); }); await W(1200);
    await A.ev(() => { const c = G.box; c.grid.insert(G.dbg.item('madeira', 50)); G.ui.refresh(true); }); await W(600); await A.ev(() => G.ui.closeInv()); await W(800);
    await B.ev(() => { const d = G.base.deps.find(d => d.k === 'bau'); G.p.x = d.x + 0.8; G.p.z = d.z; }); await W(600);
    await B.ev(() => { const d = G.base.deps.find(d => d.k === 'bau'); G.prompt = d.c; G.interact(); }); await W(1200);
    const cb = await B.ev(() => G.box && G.box.grid ? G.box.grid.list.map(e => e.it.k + 'x' + e.it.n) : null); console.log('baú para o Bruno:', JSON.stringify(cb)); ok(cb && cb.some(x => /madeira/.test(x)), 'o Bruno vê a madeira que a Ana guardou no baú');
    await B.ev(() => G.ui.closeInv()); await W(500);
    // camas: o saco-cama da Ana só aparece nas camas da Ana
    await A.ev(() => { G.p.x = 1000.5 + 3; G.p.z = 600.5 + 4; G.p.yaw = 0; }); await W(600); await A.ev(() => G.base.deploy({ k: 'saco', n: 1 })); await W(1200);
    const bA = await A.ev(() => G.base.beds().map(d => d.name)), bB = await B.ev(() => G.base.beds().map(d => d.name));
    console.log('camas: Ana', JSON.stringify(bA), '· Bruno', JSON.stringify(bB)); ok(bA.length === 1 && bB.length === 0, 'o saco-cama é só da Ana');
    // fornalha da Ana: acende com madeira e metal; passados uns segundos fechada, o Bruno abre e já há carvão
    await A.ev(() => { G.p.x = 1000.5 - 3; G.p.z = 600.5 - 4; G.p.yaw = Math.PI; }); await W(600); await A.ev(() => G.base.deploy({ k: 'fornalha', n: 1 })); await W(1200);
    await A.ev(() => { const d = G.base.deps.find(d => d.k === 'fornalha'); G.p.x = d.x + 1; G.p.z = d.z; }); await W(600);
    await A.ev(() => { const d = G.base.deps.find(d => d.k === 'fornalha'); G.prompt = d.c; G.interact(); }); await W(1200);
    await A.ev(() => { const c = G.box; c.grid.insert(G.dbg.item('madeira', 20)); c.grid.insert(G.dbg.item('metal', 10)); G.base.toggleFurnace(c); G.ui.refresh(true); }); await W(500); await A.ev(() => G.ui.closeInv()); await W(9000);
    const on = await B.ev(() => G.base.deps.find(d => d.k === 'fornalha').on); ok(on, 'o Bruno vê a fornalha acesa');
    await B.ev(() => { const d = G.base.deps.find(d => d.k === 'fornalha'); G.p.x = d.x + 1; G.p.z = d.z; }); await W(600);
    await B.ev(() => { const d = G.base.deps.find(d => d.k === 'fornalha'); G.prompt = d.c; G.interact(); }); await W(1200);
    const fb = await B.ev(() => G.box && G.box.grid ? G.box.grid.list.map(e => e.it.k + 'x' + e.it.n) : null); console.log('fornalha para o Bruno:', JSON.stringify(fb)); ok(fb && fb.some(x => /carvao/.test(x)) && fb.some(x => /metalR/.test(x)), 'a fornalha trabalhou fechada: carvão e metal refinado');
    await B.ev(() => G.ui.closeInv()); await W(500);
    // explosão: o Bruno rebenta C4 junto à porta (de madeira) da Ana: parte-se para os dois
    await B.ev(k => { const D = G.base.pieces.get(k).door; G.explodeAt('c4', D.x, D.z + 0.6); }, door); await W(1500);
    const after = await Promise.all([pk(A, door), pk(B, door)]); console.log('porta depois do C4 (Ana, Bruno):', JSON.stringify(after)); ok(after[0] === null && after[1] === null, 'o C4 do Bruno partiu a porta da Ana para os dois');
    await A.page.screenshot({ path: path.join(outDir, 'net-base-A.png') });
    // clã: a Ana faz outra fundação com porta; o Bruno entra no clã dela e já abre a porta e constrói lá
    const f2 = 'f:' + (fi + 3) + ':' + fj, d2 = 'h:' + (fi + 3) + ':' + fj, w2 = 'v:' + (fi + 3) + ':' + fj;
    await A.ev(s => { G.p.x = (s[0] + 3) * 3 + 1.5; G.p.z = s[1] * 3 + 6; }, [fi, fj]); await B.ev(s => { G.p.x = (s[0] + 3) * 3 + 4; G.p.z = s[1] * 3 + 6; }, [fi, fj]); await W(700);
    await A.ev(k => G.net.raw({ t: 'bp', k, tt: 'fund' }), f2); await W(600); await A.ev(k => G.net.raw({ t: 'bp', k, tt: 'porta' }), d2); await W(800);
    await A.ev(() => G.net.clanCmd('create', 'Ronin')); await W(600); const code = await A.ev(() => G.net.clanInfo.codigo);
    await B.ev(c => G.net.clanCmd('join', c), code); await W(800);
    await B.ev(k => G.net.raw({ t: 'bdo', k, o: 1 }), d2); await B.ev(k => G.net.raw({ t: 'bp', k, tt: 'parede' }), w2); await W(1000);
    const cl = await Promise.all([pk(A, d2), pk(A, w2)]); console.log('no clã: porta', JSON.stringify(cl[0]), '· parede do Bruno', JSON.stringify(cl[1]));
    ok(cl[0] && cl[0][3] === 1 && cl[1] && cl[1][0] === 'parede', 'no mesmo clã, o Bruno abre a porta e constrói na base da Ana');
    console.log('erros A:', A.errs.length, 'B:', B.errs.length);
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill();
});
