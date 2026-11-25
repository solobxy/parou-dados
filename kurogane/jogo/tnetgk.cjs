// Equipamento à vista: ghillie, visão noturna e cores chegam aos outros (só se tiveres mesmo os objetos)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-testgk'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3195', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
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
  const CODE = fs.readFileSync('/tmp/kg-admin-code.txt', 'utf8').trim();
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    for (const P of [A, B]) await P.ev(() => G.dbgKit());
    await W(2500);
    await A.ev(() => { G.p.x = 1000.5; G.p.z = 600.5; G.net.start(); }); await W(2000);
    await B.ev(() => { G.p.x = 1006.5; G.p.z = 600.5; G.net.start(); }); await W(2500);
    await A.ev(c => G.net.admClaim(c), CODE); await W(900);
    for (const k of ['ghillie', 'nvg', 'capacetec', 'coleteu']) { await A.ev(k => G.net.adm('give', { k, n: 1 }), k); await W(300); }
    await W(800);
    await A.ev(() => { const I = G.inv, f = k => { const all = [...I.bag.list.map(e => e.it), ...I.belt.filter(Boolean)]; return all.find(o => o.k === k) || G.mkItem(k); }; I.eq.suit = f('ghillie'); I.eq.eyes = f('nvg'); I.eq.head = f('capacetec'); I.eq.vest = f('coleteu'); G.refresh(); });
    await W(1500);
    const aId = await A.ev(() => G.net.id ?? G.net.myId);
    const seen = await B.ev(() => { const r = [...G.net.R.values()][0]; return r ? { gear: Object.entries(r.b.gear).filter(([k, m]) => m.visible).map(([k]) => k), suit: r.b.suitX.some(m => m.visible), gh: !!r.gh } : null; });
    console.log('o Bruno vê a Ana com:', JSON.stringify(seen)); console.log('linha:', JSON.stringify(await B.ev(() => { const r = [...G.net.R.values()][0]; return r && r.s1; })), 'eu mando:', await A.ev(() => JSON.stringify(Object.keys(G.inv.eq).map(s => G.inv.eq[s] && G.inv.eq[s].k))));
    ok(seen && seen.gear.includes('suit') && seen.gear.includes('eyes') && seen.gear.includes('head_c') && seen.gear.includes('vest_u') && seen.suit && seen.gh, 'o Bruno vê o ghillie, a visão noturna, o capacete camuflado e o colete urbano da Ana');
    // nome: perto vê-se, longe (com ghillie) não
    const tag = () => B.ev(() => { const r = [...G.net.R.values()][0]; return r && r.el.style.display !== 'none'; });
    ok(await tag(), 'a 6 m vê-se o nome da Ana');
    await B.ev(() => { G.p.x = 1030.5; }); await W(1500);
    ok(!(await tag()), 'a 30 m, de ghillie, o nome da Ana não aparece');
    // o Bruno finge ter ghillie (não o tem): a Ana não o vê de ghillie
    await B.ev(() => { G.p.x = 1008.5; G.inv.eq.suit = G.mkItem('ghillie'); G.refresh(); }); await W(1500);
    const fake = await A.ev(() => { const r = [...G.net.R.values()][0]; return r ? r.b.suitX.some(m => m.visible) || r.b.gear.suit.visible : null; });
    ok(fake === false, 'quem não apanhou um ghillie não aparece de ghillie aos outros');
    console.log('erros A:', A.errs.length, 'B:', B.errs.length, JSON.stringify([...A.errs, ...B.errs]).slice(0, 300));
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill();
});
