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
    // mira a sério: arrasta a mira para o peito do Bruno no ecrã, espera e dispara
    const aimFire = () => A.ev(async () => { const sl = ms => new Promise(r => setTimeout(r, ms)); const r = [...G.net.R.values()][0]; if (!r || !r.b.root.visible) return 'não vejo'; if (!G.aimS.on) { G.aimStart(); await sl(1200); }
      for (let k = 0; k < 4; k++) { const q = G.dbg.scr(r.x, (r.y || 0) + 1.2, r.z); const dx = q[0] - G.aimS.sx, dy = Math.max(-120, Math.min(120, q[1] - G.aimS.sy)); G.aimDrag(dx, dy); await sl(350); if (Math.hypot(q[0] - G.aimS.sx, q[1] - G.aimS.sy) < 6) break; } G.p.reload = 0; G.p.cd = 0; const it = G.inv.belt[G.sel]; it.ammo = 12; G.aimS.steady = 1; G.dbgShots = []; G.fireDown(); G.fireUp(); await sl(500); const sh = (G.dbgShots || []).map(x => x.k + (x.zone ? ':' + x.zone : '') + (x.e ? '@' + x.e.map(v => v.toFixed(1)).join(',') : '')); G.dbgShots = null; const q2 = G.dbg.scr(r.x, (r.y || 0) + 1.2, r.z); if (window.__dbg) console.error('tiro', JSON.stringify({ pk: G.dbg.pick(G.aimS.sx, G.aimS.sy), pkB: G.dbg.pick(q2[0], q2[1]), T: G.net.targets().length, off: G.aimS.off, lock: !!G.aimS.lock, raise: G.aimS.raise, z: G.aimS.zone, A: G.dbg.aimA().slice(0, 3).map(v => +v.toFixed(2)), B: [+r.x.toFixed(2), +(r.y || 0).toFixed(2), +r.z.toFixed(2)], me: [+G.p.x.toFixed(2), +G.p.z.toFixed(2)], cam: G.dbg.cam().map(v => +v.toFixed(2)), sx: [Math.round(G.aimS.sx), Math.round(G.aimS.sy)], scr: q2.map(v => typeof v === 'number' ? Math.round(v) : v), H: innerHeight })); return G.aimS.zone || 'sem zona'; });
    await placeB(0, 3); await W(2500); await aimFire(); await W(600);
    console.log('sonda:', JSON.stringify(await A.ev(() => { const r = [...G.net.R.values()][0]; return { T: G.net.targets(), r: [r.x, r.y, r.z, r.b.root.visible], A: G.dbg.aimA(), sx: [G.aimS.sx, G.aimS.sy], scr: G.dbg.scr(r.x, (r.y || 0) + 1.2, r.z), on: G.net.on, lock: !!G.aimS.lock, me: [G.p.x, G.p.z] }; })));
    for (const d of [3, 8, 11]) {
      await placeB(0, -d); await W(2500);
      const before = await A.ev(() => window.__hitc.length); const zs = [];
      for (let i = 0; i < 3; i++) { zs.push(await aimFire()); await W(900); }
      const got = await A.ev(n => window.__hitc.slice(n), before);
      console.log(`parado a ${d} m: mira em ${zs.join(',')} · servidor confirmou ${got.length}/3 (${got.join(', ')})`); ok(got.length === 3, `PvP parado a ${d} m: 3 tiros, 3 acertos`);
    }
    // o Bruno a correr de lado a ~4 m/s (no relógio real), a 8 m: o A vê-o um pouco atrás e o servidor conta onde ele esteve
    await placeB(-6, -8); await W(2500);
    await B.ev(() => { window.__run = setInterval(() => { G.p.x += 0.1; if (G.p.x > window.__x0 + 6) G.p.x = window.__x0 - 6; }, 100); }).catch(() => { });
    await B.ev(s => { window.__x0 = s[0]; }, spot);
    const before = await A.ev(() => window.__hitc.length); let fired = 0;
    for (let i = 0; i < 6; i++) { const z = await A.ev(() => { const r = [...G.net.R.values()][0]; if (!r || !r.b.root.visible) return 'não vejo'; G.fp = false; G.aimS.Aw = new G.V3(r.x, (r.y || 0) + 1.15, r.z); G.p.reload = 0; G.p.cd = 0; const it = G.inv.belt[G.sel]; it.ammo = 12; G.p.yaw = Math.atan2(r.x - G.p.x, r.z - G.p.z); G.dbgSpread = 0; const f = G.dbg.fire(); G.dbgSpread = 1; return f ? 'ok' : 'não disparou'; }); if (z !== 'não vejo') fired++; await W(700); const dead = await B.ev(() => !G.p.alive); if (dead) { await B.ev(() => clearInterval(window.__run)); await placeB(-6, -8); await B.ev(() => { window.__run = setInterval(() => { G.p.x += 0.1; if (G.p.x > window.__x0 + 6) G.p.x = window.__x0 - 6; }, 100); }); await W(1500); } }
    const got = await A.ev(n => window.__hitc.slice(n), before);
    console.log(`a correr a 8 m: ${fired} tiros · servidor confirmou ${got.length} (${got.join(', ')})`); ok(got.length >= Math.ceil(fired * 0.66), 'PvP alvo a correr: pelo menos 2 em cada 3 tiros contam');
    console.log('erros A:', A.errs.length, 'B:', B.errs.length);
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill();
});
