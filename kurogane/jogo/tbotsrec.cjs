// Bots da arena: um humano sozinho recebe um adversário bot que joga como uma pessoa; sai quando entra outro humano
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-bots'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3195', STATE_DIRECTORY: ST, KG_TEST: '1', KG_BOTS: '1' }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (nome, id, tok) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id, tok]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3195/ws'); localStorage.setItem('kg.test', '1'); if (tok) localStorage.setItem('kg.tok.' + id, tok); sessionStorage.setItem('kgIntro', '1'); sessionStorage.setItem('kgArena', '1'); } catch (e) { } }, [nome, id, tok]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 600)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  try {
    const fs2 = require('fs'), snap = async (P, nm, pos, at, fov = 70) => { const u = await P.ev(([p, a, f]) => G.dbgCam(p, a, f, 960, 540), [pos, at, fov]); fs2.writeFileSync(path.join(outDir, 'bots-' + nm + '.jpg'), Buffer.from(u.split(',')[1], 'base64')); };
    const A = await mk('Ana', 'pa');
    const pick = (P, team, nome) => P.ev(async ([team, nome]) => { document.querySelector('#arw .atm.t' + team).click(); await new Promise(r => setTimeout(r, 400)); for (let i = 0; i < 6 && document.querySelector('#arw .akh b').textContent !== nome; i++) { document.getElementById('arNextK').click(); await new Promise(r => setTimeout(r, 150)); } return document.querySelector('#arw .akh b').textContent; }, [team, nome]);
    await pick(A, 0, 'Sniper'); await A.page.click('#arGo'); await W(500);
    for (let i = 0; i < 30 && !(await A.ev(() => G.net.on && G.net.R.size > 0)); i++) await W(500);
    const b0 = await A.ev(() => { const r = [...G.net.R.values()][0]; return r ? { n: G.net.R.size, name: r.name, clan: r.clan, tag: r.el.style.display, vest: r.b.teamV } : null; });
    console.log('bot:', JSON.stringify(b0)); ok(b0 && b0.n === 1 && b0.clan === 'arena-b' && b0.vest === 'vest_tb', 'sozinho na vermelha: entra um bot na azul, com o colete azul');
    const sc = await A.ev(() => document.getElementById('asc').textContent); console.log('placar:', sc);
    // gravar o bot visto pela Ana: posição desenhada e a última linha do servidor, a cada 50 ms, durante 12 s
    await A.ev(() => { G.p.x = 3650 - 20; G.p.z = 3650 - 18; G.p.born = -99; });
    const rec = await A.ev(async () => { const out = []; const t0 = performance.now(); while (performance.now() - t0 < 12000) { const r = [...G.net.R.values()][0]; if (r) out.push([Math.round(performance.now() - t0), +r.b.root.position.x.toFixed(2), +r.b.root.position.z.toFixed(2), r.s1 ? +r.s1[1].toFixed(2) : 0, r.s1 ? +r.s1[2].toFixed(2) : 0, r.T.buf.length, Math.round(r.T.off), Math.round(r.T.jit), r.b.root.visible ? 1 : 0, G.t]); await new Promise(q => setTimeout(q, 50)); } return out; });
    let jumps = 0, maxV = 0; for (let k = 1; k < rec.length; k++) { const a = rec[k - 1], b = rec[k], dt = (b[0] - a[0]) / 1000, d = Math.hypot(b[1] - a[1], b[2] - a[2]); const v = d / dt; if (v > maxV) maxV = v; if (v > 9) jumps++; }
    console.log('amostras', rec.length, 'saltos >9 m/s:', jumps, 'vel máx', maxV.toFixed(1)); console.log(JSON.stringify(rec.filter((_, k) => k % 6 === 0).slice(0, 40)));
  } catch (e) { console.log('ERRO', e); fails++; }
  console.log(fails + ' falhas'); gs.kill(); server.close(); process.exit(fails ? 1 : 0);
});
