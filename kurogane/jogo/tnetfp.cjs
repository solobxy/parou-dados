// PvP com a mira a sério (arrastar para o peito do outro): parado a 3, 8 e 15 m e a correr de lado
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-test'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3191', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (nome, id, tok) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id, tok]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3191/ws'); localStorage.setItem('kg.test', '1'); if (tok) localStorage.setItem('kg.tok.' + id, tok); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id, tok]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 600)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    for (const P of [A, B]) await P.ev(() => G.dbgKit());
    await W(3000);
    // conta as confirmações de tiro que o servidor manda ao A
    await A.ev(() => { const WS = window.WebSocket; window.__hitc = []; window.WebSocket = class extends WS { constructor(...a) { super(...a); const snd = this.send.bind(this); this.send = d => { try { const m = JSON.parse(d); if (m.t === 'shot') window.__lastShot = { L: m.L, Ls: m.Ls, n: m.n, k: m.k }; } catch (x) { } return snd(d); }; this.addEventListener('message', e => { try { const m = JSON.parse(e.data); if (m.t === 'hitc') window.__hitc.push(m.zone + (m.kill ? '+morto' : '')); } catch (x) { } }); } }; });
    const spot = await A.ev(() => [G.p.x, G.p.z]);
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; G.p.yaw = G.p.root = G.p.aim = 0; G.net.start(); }, spot);
    await B.ev(s => { G.p.x = s[0]; G.p.z = s[1] + 6; G.net.start(); }, spot);
    await W(3500);
    await A.ev(() => { G.cfg.sens = 1; for (let i = 0; i < 6; i++) if (G.inv.belt[i] && /pistola/.test(G.inv.belt[i].k)) { G.sel = i; return; } });
    const placeB = async (dx, dz) => { await B.ev(async ([s, dx, dz]) => { if (!G.p.alive && G.respawn) { G.respawn(null); await new Promise(r => setTimeout(r, 3500)); } G.p.hp = 100; G.inv.eq.vest = null; G.inv.eq.head = null; G.p.x = s[0] + dx; G.p.z = s[1] + dz; G.p.vx = G.p.vz = 0; }, [spot, dx, dz]); };
    // 1.ª pessoa (botão do olho): roda a vista para o peito do Bruno e dispara
    const aimFire = () => A.ev(async () => { const sl = ms => new Promise(r => setTimeout(r, ms)); const r = [...G.net.R.values()][0]; if (!r) return 'não vejo'; if (!G.fpv.on) { G.viewToggle(); await sl(1500); }
      for (let k = 0; k < 3; k++) { const e = G.aimS.eye, tx = r.x, ty = (r.y || 0) + 1.15, tz = r.z; G.aimS.fy = Math.atan2(tx - e.x, tz - e.z); G.aimS.fpit = Math.atan2(ty - e.y, Math.hypot(tx - e.x, tz - e.z)); await sl(300); }
      G.p.cd = 0; G.p.reload = 0; const it = G.inv.belt[G.sel]; if (it) it.ammo = Math.max(it.ammo, 5); const z = G.aimS.zone || 'nada'; G.fireDown(); await sl(1100); G.fireUp(); return z + (G.fp ? '' : '(não fp!)'); });
    for (const d of [3, 8, 11]) {
      await placeB(0, -d); await W(2500);
      const before = await A.ev(() => window.__hitc.length); const zs = [];
      for (let i = 0; i < 3; i++) { zs.push(await aimFire()); await W(900); }
      const got = await A.ev(n => window.__hitc.slice(n), before);
      console.log(`1.ª pessoa a ${d} m: mira em ${zs.join(',')} · servidor confirmou ${got.length}/3 (${got.join(', ')})`); ok(got.length === 3, `PvP na 1.ª pessoa a ${d} m: 3 tiros, 3 acertos`);
    }

    console.log('erros A:', A.errs.length, 'B:', B.errs.length);
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill();
});
