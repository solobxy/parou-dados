// Mundo antigo (só zombies): o servidor pede os animais a quem está ligado e passam a existir para todos
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-testan2'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3198', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (nome, id) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3198/ws'); localStorage.setItem('kg.test', '1'); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id]);
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
    await A.ev(() => { G.popAnimals0 = G.popAnimals; G.popAnimals = () => []; G.net.start(); }); await W(4000);
    const n0 = await A.ev(() => G.zs.filter(z => z.an).length); console.log('animais antes:', n0);
    await A.ev(() => { G.popAnimals = G.popAnimals0; const t = G.W.zones.find(z => z.kind === 'town'); G.p.x = t.x + 3; G.p.z = t.z + 3; }); await W(15000);
    const n1 = await A.ev(() => G.zs.filter(z => z.an).length); console.log('animais depois:', n1); ok(n0 === 0 && n1 > 0, 'o servidor pediu os animais e já existem');
    ok(!A.errs.length, 'sem erros');
  } catch (e) { console.log('ERRO', e); fails++; }
  await browser.close(); gs.kill(); server.close(); console.log(fails ? fails + ' falhas' : 'tudo bem'); process.exit(fails ? 1 : 0);
});
