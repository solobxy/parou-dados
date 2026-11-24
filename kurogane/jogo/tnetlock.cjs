// Fechaduras de código (portas e baús), paredes que não se atravessam e baús que não se abrem através da parede
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-testlk'; fs.rmSync(ST, { recursive: true, force: true }); fs.mkdirSync(ST, { recursive: true });
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
    await ctx.addInitScript(([nome, id]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3193/ws'); localStorage.setItem('kg.test', '1'); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 700)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader|CORS|ERR_FAILED|404/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    const wv = await A.ev(() => G.WV);
    fs.writeFileSync(path.join(ST, 'estado.json'), JSON.stringify({ w: { wv, base: { p: { 'f:400:300': { t: 'fund', tier: 0, hp: 250, o: 0, u: 'uVelho', tok: 'tokVelho' }, 'h:400:300': { t: 'porta', tier: 0, hp: 250, o: 0, u: 'uVelho', tok: 'tokVelho' } }, d: {} } } }));
    gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3193', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
    await W(800);
    for (const P of [A, B]) await P.ev(() => G.dbgKit());
    await W(3000);
    const X = 1000.5, Z = 600.5;
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; G.gain('madeira', 900); for (const k of ['bau', 'fechadura', 'fechadura']) G.inv.give(G.dbg.item(k, 1)); G.net.start(); }, [X, Z]); await W(2000);
    await B.ev(s => { G.p.x = s[0] - 6; G.p.z = s[1]; G.net.start(); }, [X, Z]); await W(2500);
    console.log('dbg velha:', JSON.stringify(await A.ev(() => { const P = G.base.pieces.get('h:400:300'); return P ? [P.t, P.cl, P.u] : [...G.base.pieces.keys()].slice(0, 5); })));
    ok(await A.ev(() => G.base.pieces.get('h:400:300') && G.base.pieces.get('h:400:300').cl === 2), 'porta de antes das fechaduras: fica trancada só para o dono e o clã');
    await A.ev(() => { G.p.yaw = 0; G.base.setMode('fund'); G.base.place(); }); await W(1200);
    const F = await A.ev(() => [...G.base.pieces.keys()].find(k => k[0] === 'f' && k !== 'f:400:300')); const [, fi, fj] = F.split(':').map(Number);
    const door = 'h:' + fi + ':' + fj, cx = fi * 3 + 1.5, cz = fj * 3 + 1.5;
    for (const [k, t] of [[door, 'porta'], ['h:' + fi + ':' + (fj + 1), 'parede'], ['v:' + fi + ':' + fj, 'parede'], ['v:' + (fi + 1) + ':' + fj, 'parede']]) await A.ev(([k, t]) => G.net.raw({ t: 'bp', k, tt: t }), [k, t]);
    await W(1200);
    const pk = (P, k) => P.ev(k => { const Q = G.base.pieces.get(k); return Q ? [Q.t, Q.door ? Q.door.target : null, Q.cl || 0] : null; }, k);
    console.log('base da Ana:', F, door, JSON.stringify(await pk(B, door)));
    // sem fechadura: qualquer um abre (como no DayZ)
    await B.ev(s => { G.p.x = s[0]; G.p.z = s[1] - 3; }, [cx, cz]); await W(1200);
    await B.ev(k => G.net.raw({ t: 'bdo', k, o: 1 }), door); await W(900);
    ok((await pk(A, door))[1] === 1, 'porta sem fechadura: o Bruno abre');
    await B.ev(k => G.net.raw({ t: 'bdo', k, o: 0 }), door); await W(700);
    // a Ana põe fechadura com o código 4321
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1] - 2.6; }, [cx, cz]); await W(900);
    const n0 = await A.ev(() => G.inv.count('fechadura'));
    await A.ev(k => G.base.lockSend({ door: G.base.pieces.get(k) }, { t: 'lkset', code: '4321' }), door); await W(1000);
    const n1 = await A.ev(() => G.inv.count('fechadura')); console.log('dbg A:', JSON.stringify(await A.ev(k => { const P = G.base.pieces.get(k); return [!!P, P && P.cl, G.base.lockOf({ door: P }), document.getElementById('toast').textContent, G.inv.count('fechadura')]; }, door)));
    ok((await pk(B, door))[2] === 1 && n1 === n0 - 1, 'a Ana põe a fechadura: o Bruno vê-a trancada e a Ana gastou uma (' + n0 + ' → ' + n1 + ')');
    // o Bruno tenta abrir: aparece o teclado; código errado não abre; o certo abre
    const kpOn = P => P.ev(() => !document.getElementById('pfm').hidden && !!document.querySelector('#pfB .kp'));
    const type = (P, code) => P.ev(code => { for (const ch of code) document.querySelector(`#pfB .kp-k[data-n="${ch}"]`).click(); document.querySelector('#pfB .kp-ok').click(); }, code);
    await B.ev(k => { const D = G.base.pieces.get(k).door; G.prompt = { door: D, label: '' }; G.interact(); }, door); await W(1000);
    ok(await kpOn(B), 'o Bruno toca na porta trancada: pede o código'); await B.page.screenshot({ path: path.join(outDir, 'net-teclado.png') });
    await type(B, '0000'); await W(900);
    const msg = await B.ev(() => document.getElementById('kpM').textContent);
    ok((await pk(A, door))[1] === 0 && /errado/.test(msg), 'código errado: a porta não abre (' + msg + ')');
    await type(B, '4321'); await W(1000);
    ok((await pk(A, door))[1] === 1 && !(await kpOn(B)), 'código certo: a porta abre para os dois e o teclado fecha');
    // atravessar a parede: o servidor manda voltar para trás
    await B.ev(s => { G.p.x = s[0] - 6; G.p.z = s[1] - 4; }, [cx, cz]); await W(1200); await B.ev(s => { G.p.x = s[0] - 2.2; G.p.z = s[1] + 0.6; }, [cx, cz]); await W(1200);
    const b0 = await B.ev(() => [G.p.x, G.p.z]);
    await B.ev(s => { G.p.x = s[0] - 0.9; }, [cx, cz]); await W(1500);
    const b1 = await B.ev(() => [+G.p.x.toFixed(2), +G.p.z.toFixed(2)]);
    ok(b1[0] < cx - 1.5, 'atravessar a parede: volta para fora (' + JSON.stringify(b1) + ')');
    // baú com fechadura (código 5555)
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; }, [cx, cz - 0.2]); await W(1000);
    await A.ev(s => G.net.raw({ t: 'bd', k: 'bau', x: s[0], z: s[1] + 0.9, yaw: 0, y: 0.3 }), [cx, cz]); await W(1200);
    const did = await A.ev(() => (G.base.deps.find(d => d.k === 'bau') || {}).nid); ok(!!did, 'a Ana põe um baú dentro da base');
    await A.ev(id => G.base.lockSend({ dep: G.base.deps.find(d => d.nid === id) }, { t: 'lkset', code: '5555' }), did); await W(1000);
    ok(await B.ev(id => (G.base.deps.find(d => d.nid === id) || {}).cl === 1, did), 'o baú fica com fechadura');
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1] - 3.5; }, [cx, cz]); await W(800);
    // o Bruno do outro lado da parede (perto do baú) não o abre
    await B.ev(s => { G.p.x = s[0]; G.p.z = s[1] + 2.2; }, [cx, cz]); await W(1500);
    await B.ev(id => G.net.open(G.base.deps.find(d => d.nid === id).c), did); await W(1000);
    const tw = await B.ev(() => [!!G.box, document.getElementById('toast').textContent]);
    ok(!tw[0] && /perto/.test(tw[1]), 'através da parede não se abre o baú (' + tw[1] + ')');
    // lá dentro: pede o código e abre
    await B.ev(s => { G.p.x = s[0] - 6; G.p.z = s[1] - 4; }, [cx, cz]); await W(1200); await B.ev(s => { G.p.x = s[0]; G.p.z = s[1] - 2.6; }, [cx, cz]); await W(1200); await B.ev(s => { G.p.x = s[0]; G.p.z = s[1] - 0.5; }, [cx, cz]); await W(1200);
    await B.ev(id => G.net.open(G.base.deps.find(d => d.nid === id).c), did); await W(1000);
    ok(await kpOn(B), 'o Bruno dentro da base: o baú pede o código');
    await type(B, '5555'); await W(1500);
    ok(await B.ev(() => !!G.box && !!G.box.dep), 'código certo: o baú abre');
    await B.ev(() => G.ui.closeInv()); await W(500);
    // a Ana muda o código: o Bruno volta a precisar dele
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1] - 0.5; }, [cx, cz]); await W(1000);
    await A.ev(id => G.base.lockSend({ dep: G.base.deps.find(d => d.nid === id) }, { t: 'lkset', code: '1111' }), did); await W(900);
    await B.ev(id => G.net.open(G.base.deps.find(d => d.nid === id).c), did); await W(1000);
    ok(await kpOn(B), 'depois de mudar o código, o Bruno precisa do novo');
    // muitas tentativas erradas: espera
    for (let i = 0; i < 3; i++) { await type(B, '9' + i + '99'); await W(600); }
    await type(B, '1111'); await W(800);
    const ws = await B.ev(() => document.getElementById('kpM').textContent); ok(/Espera/.test(ws), '3 códigos errados: tem de esperar (' + ws + ')');
    await B.ev(() => { document.getElementById('pfX').click(); }); await W(300);
    // a Ana tira a fechadura da porta: volta-lhe para o inventário
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1] - 2.6; }, [cx, cz]); await W(900);
    const m0 = await A.ev(() => G.inv.count('fechadura')); await A.ev(k => G.base.lockSend({ door: G.base.pieces.get(k) }, { t: 'lkset', rm: 1 }), door); await W(1000);
    ok((await pk(B, door))[2] === 0 && await A.ev(() => G.inv.count('fechadura')) === m0 + 1, 'tirar a fechadura: a porta fica sem ela e a Ana recebe-a de volta');
    // construir só em terreno selvagem (o servidor confirma com o mapa)
    const tryF = async (x, z) => { await B.ev(s => { G.p.x = s[0]; G.p.z = s[1]; }, [x, z]); await W(1500); await B.ev(() => { document.getElementById('toast').textContent = ''; }); await B.ev(s => G.net.raw({ t: 'bp', k: 'f:' + Math.floor(s[0] / 3) + ':' + Math.floor(s[1] / 3), tt: 'fund' }), [x, z + 2]); await W(900); return B.ev(() => document.getElementById('toast').textContent); };
    const tc = await tryF(10.5, 10.5); ok(/cidade/.test(tc), 'na cidade o servidor não deixa construir (' + tc + ')');
    const tn = await tryF(cx + 4.5, cz); ok(/outro jogador/.test(tn), 'a 2 casas da base da Ana não deixa (' + tn + ')');
    console.log('erros A:', A.errs.length, 'B:', B.errs.length, JSON.stringify([...A.errs, ...B.errs]).slice(0, 400));
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs && gs.kill();
});
