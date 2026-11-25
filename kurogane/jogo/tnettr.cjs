// Comerciante online: comprar e vender batem certo com as contas do servidor (sem correções nem batota)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-testtr'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3199', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (nome, id) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3199/ws'); localStorage.setItem('kg.test', '1'); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 700)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader|CORS|ERR_FAILED|404/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  const CODE = fs.readFileSync('/tmp/kg-admin-code.txt', 'utf8').trim();
  try {
    const A = await mk('Ana', 'pa');
    await A.ev(() => G.dbgKit());
    await W(2500);
    await A.ev(() => { G.net.start(); }); await W(3000);
    await A.ev(c => G.net.admClaim(c), CODE); await W(3000);
    await A.ev(() => G.net.adm('give', { k: 'iene', n: 2000 })); await W(1500); await A.ev(() => G.net.adm('give', { k: 'couro', n: 5 })); await W(1500); console.log('após dar:', await A.ev(() => [G.inv.count('iene'), G.inv.count('couro'), document.getElementById('toast').textContent, G.net.role, G.net.on]));
    await A.ev(() => { const T = G.TR.TRADERS[0]; G.p.x = T.x + 1.4; G.p.z = T.z + 0.3; }); await W(3000);
    const fix0 = await A.ev(() => { window.__fix = 0; const f = G.fixInv; G.fixInv = T => { window.__fix++; return f(T); }; return G.inv.count('iene'); });
    await A.ev(() => { const T = G.TR.TRADERS[0]; G.trade(T, 'pistola', 1, false); G.trade(T, 'a9', 20, false); G.trade(T, 'couro', 5, true); }); await W(4000);
    const r = await A.ev(() => ({ iene: G.inv.count('iene'), pist: G.inv.count('pistola'), a9: G.inv.count('a9'), couro: G.inv.count('couro'), fix: window.__fix }));
    console.log('depois:', JSON.stringify(r), 'antes', fix0); ok(r.fix === 0 && r.pist >= 1 && r.couro === 0 && r.iene === fix0 - 650 - 120 + 120, 'compra e venda batem certo com o servidor (sem correções)');
    // longe do comerciante: o servidor recusa e corrige
    await A.ev(() => { G.p.x += 40; const T = G.TR.TRADERS[0]; window.__far = G.inv.count('iene'); G.p.x -= 40; G.p.x += 40; }); 
    ok(!A.errs.length, 'sem erros');
  } catch (e) { console.log('ERRO', e); fails++; }
  await browser.close(); gs.kill(); server.close(); console.log(fails ? fails + ' falhas' : 'tudo bem'); process.exit(fails ? 1 : 0);
});
