// quem sai fica a dormir e, ao voltar com «Jogar», continua onde estava e com o que tinha (sem modo de teste do servidor)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist');
const ST = '/tmp/kgsrv-persist'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER], { env: { ...process.env, PORT: '3192', STATE_DIRECTORY: ST }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const mk = async (tokVal) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(tok => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: 'pr', lista: [{ id: 'pr', nome: 'Rui', criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3192/ws'); if (tok !== null) localStorage.setItem('kg.tok.pr', tok); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, tokVal);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  const enter = async P => { await P.ev(() => G.start(false, false)); await P.page.waitForFunction(() => G.net.on, null, { timeout: 60000 }); await W(2500); };
  const inv = P => P.ev(() => G.inv.all().map(i => i.k + (i.n > 1 ? 'x' + i.n : '')).sort().join(','));
  try {
    const A = await mk(null); await enter(A);
    const it0 = await inv(A);
    // larga uma coisa (o servidor conta) e regista onde ficou
    await A.ev(() => { const I = G.inv, it = I.all().find(i => I.belt.indexOf(i) < 0) || I.all()[0]; if (I.belt.includes(it)) I.belt[I.belt.indexOf(it)] = null; else I.bag.remove ? I.bag.remove(it) : 0; G.dropItem(it); G.ui.refresh(true); G.net.sendInv && G.net.sendInv(); });
    await W(2500);
    const s1 = await A.ev(() => ({ x: +G.p.x.toFixed(1), z: +G.p.z.toFixed(1), tok: localStorage.getItem('kg.tok.pr') })); const it1 = await inv(A);
    console.log('sessão 1:', JSON.stringify(s1), '\n  antes:', it0, '\n  depois de largar:', it1);
    await A.ev(() => G.toMenu()); await W(1500); await A.ctx.close(); await W(1500);
    const B = await mk(s1.tok); await enter(B);
    const s2 = await B.ev(() => ({ x: +G.p.x.toFixed(1), z: +G.p.z.toFixed(1) })); const it2 = await inv(B);
    console.log('sessão 2:', JSON.stringify(s2), '\n  inventário:', it2);
    ok(Math.hypot(s2.x - s1.x, s2.z - s1.z) < 3, 'volta onde adormeceu');
    ok(it2 === it1 && it1 !== it0, 'volta com o que tinha (sem o que largou)');
    // a arena não apaga o código do mundo
    await B.ev(() => { G.ARENA = true; }); await B.ev(() => G.net.raw && 0); const keep = await B.ev(() => localStorage.getItem('kg.tok.pr'));
    ok(keep === s1.tok, 'o código do aparelho continua guardado');
    ok(!A.errs.length && !B.errs.length, 'sem erros (' + [...A.errs, ...B.errs].join(' | ').slice(0, 200) + ')');
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill(); process.exit(0);
});
