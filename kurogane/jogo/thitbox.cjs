// hitboxes por osso em rede: cabeça, peito, braço e perna em várias poses e ângulos, e um alvo a correr de lado
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-hb'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3193', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (nome, id, tok) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id, tok]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3193/ws'); localStorage.setItem('kg.test', '1'); if (tok) localStorage.setItem('kg.tok.' + id, tok); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id, tok]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 600)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    for (const P of [A, B]) { await P.ev(() => G.dbgKit()); }
    await W(3000);
    const spot = await A.ev(() => [G.p.x, G.p.z]);
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; G.net.start(); }, spot);
    await B.ev(s => { G.p.x = s[0] + 7; G.p.z = s[1]; G.p.root = 0; G.p.yaw = 0; G.net.start(); }, spot);
    for (let i = 0; i < 40 && !(await A.ev(() => G.net.on && G.net.R.size > 0)); i++) await W(500);
    await A.ev(() => { for (let i = 0; i < 6; i++) if (G.inv.belt[i] && /pistola/.test(G.inv.belt[i].k)) { G.sel = i; return; } const h = G.ui.hit; G.ui.hit = (...a) => { window.__hz = a[1]; window.__hk = (window.__hk || 0) + 1; return h(...a); }; });
    await A.ev(() => { const h = G.ui.hit; if (!h.__w) { G.ui.hit = (...a) => { window.__hz = a[1]; window.__hk = (window.__hk || 0) + 1; return h(...a); }; G.ui.hit.__w = 1; } });
    await B.ev(() => { G.net.raw({ t: 'tgod', on: 1 }); G.inv.eq.vest = null; G.inv.eq.head = null; for (let i = 0; i < 6; i++) if (G.inv.belt[i] && /m4|ak/.test(G.inv.belt[i].k)) { G.sel = i; break; } G.ui.refresh && G.ui.refresh(true); });
    const BONE = { cabeca: 0, peito: 2, barriga: 3, bracoD: 7, antebracoE: 6, coxaE: 9, canelaD: 12, braco: -1 }; // braco: o braço do lado da Ana
    // dispara para o meio de um osso do Bruno, tal como a Ana o vê; devolve a zona que o servidor confirmou (ou 'falhou')
    const fireBone = async (bone, off = [0, 0, 0]) => { await B.ev(() => { G.p.hp = 100; }); await W(1300);
      const k0 = await A.ev(() => window.__hk || 0);
      await A.ev(([bi, off]) => { const r = [...G.net.R.values()][0]; const st = { x: r.x, y: r.y || 0, z: r.z, yaw: r.b.root.rotation.y - (r.lr || 0), sc: r.sc || 0, an: r.an | 0, mv: r.mvS || 0 }; const C = G.hitCaps(st), mid = q => [(q[0] + q[3]) / 2, (q[2] + q[5]) / 2], dA = q => { const m = mid(q); return Math.hypot(m[0] - G.p.x, m[1] - G.p.z); }; const q = bi >= 0 ? C[bi] : (dA(C[5]) < dA(C[7]) ? C[5] : C[7]); const P = [(q[0] + q[3]) / 2 + off[0], (q[1] + q[4]) / 2 + off[1], (q[2] + q[5]) / 2 + off[2]];
        G.fp = false; G.aimS.Aw = new G.V3(P[0], P[1], P[2]); G.p.reload = 0; G.p.cd = 0; const it = G.inv.belt[G.sel]; it.ammo = Math.max(it.ammo, 5); G.p.yaw = Math.atan2(P[0] - G.p.x, P[2] - G.p.z); window.__aimP = P; return G.dbg.fire(); }, [BONE[bone], off]);
      for (let i = 0; i < 8 && (await A.ev(() => window.__hk || 0)) === k0; i++) await W(300); const k1 = await A.ev(() => window.__hk || 0); const zz = k1 > k0 ? await A.ev(() => window.__hz) : 'falhou';
      if (process.env.HBDBG) console.log('   dbg', bone, zz, JSON.stringify(await A.ev(() => { const r = [...G.net.R.values()][0]; const st = { x: r.x, y: r.y || 0, z: r.z, yaw: r.b.root.rotation.y - (r.lr || 0), sc: r.sc || 0, an: r.an | 0, mv: r.mvS || 0 }; const P = window.__aimP, O = [G.p.x, 1.45, G.p.z]; const caps = G.hitCaps(st); const hit = G.hitSeg(O[0], O[1], O[2], O[0] + (P[0] - O[0]) * 1.5, O[1] + (P[1] - O[1]) * 1.5, O[2] + (P[2] - O[2]) * 1.5, caps); return [st, hit, P.map(v => +v.toFixed(2))]; })));
      return zz; };
    const setB = (sc, yaw) => B.ev(([sc, yaw]) => { G.stanceSet(sc); G.p.root = G.p.yaw = G.p.aim = yaw; if (G.aimS) G.aimS.fy = yaw; }, [sc, yaw]);
    const settle = async sc => { for (let i = 0; i < 25; i++) { const v = await A.ev(() => ([...G.net.R.values()][0] || {}).sc || 0); if (Math.abs(v - sc) < 0.08) break; await W(300); } await W(600); };
    const CASES = [
      ['de pé, de frente', 0, -Math.PI / 2, [['cabeca', 'head'], ['peito', 'body'], ['coxaE', 'legs'], ['canelaD', 'legs']]],
      ['de pé, de lado', 0, 0, [['cabeca', 'head'], ['braco', 'arms'], ['barriga', 'body']]],
      ['de pé, de costas', 0, Math.PI / 2, [['cabeca', 'head'], ['peito', 'body']]],
      ['agachado', 1, -Math.PI / 2, [['cabeca', 'head'], ['peito', 'body'], ['coxaE', 'legs']]],
      ['deitado, de frente', 2, -Math.PI / 2, [['cabeca', 'head'], ['peito', 'body|arms|head']]], // de frente e deitado, a cabeça fica à frente do peito
      ['deitado, de lado', 2, 0, [['peito', 'body|arms'], ['coxaE', 'legs']]],
    ];
    for (const [nm, sc, yaw, list] of CASES) { await setB(sc, yaw); await settle(sc);
      for (const [bone, want] of list) { const z = await fireBone(bone); ok(want.split('|').includes(z), nm + ': tiro no ' + bone + ' → ' + z + (z === want ? '' : ' (esperado ' + want + ')')); } }
    // falhas de propósito: por cima da cabeça e ao lado do corpo não acerta
    await setB(0, -Math.PI / 2); await settle(0);
    ok(await fireBone('cabeca', [0, 0.32, 0]) === 'falhou', 'de pé: 30 cm acima da cabeça não acerta');
    ok(await fireBone('peito', [0, 0, 0.55]) === 'falhou', 'de pé: meio metro ao lado do peito não acerta');
    // a correr de lado: a Ana aponta onde o vê e acerta (o servidor põe o alvo onde ela o via)
    await B.ev(() => { G.p.hp = 100; G.stanceSet(0); G.dbgDrive = null; G.p.root = 0; G.p.yaw = 0; G.autoYaw = 0; G.setAuto(true); }); await W(1200);
    let hits = 0, tries = 0; for (let i = 0; i < 6; i++) { const z = await fireBone('peito'); tries++; if (z !== 'falhou') hits++; await B.ev(s => { if (Math.abs(G.p.z - s[1]) > 8) { G.p.z = s[1] - 6; } }, spot); }
    await B.ev(() => G.setAuto(false));
    ok(hits >= tries - 1, 'a correr de lado: acerta onde o vê (' + hits + ' de ' + tries + ')');
    const e = [...A.errs, ...B.errs].filter(x => !/ERR_TUNNEL/.test(x)); ok(!e.length, 'sem erros no jogo ' + JSON.stringify(e.slice(0, 3)));
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill(); process.exit(fails ? 1 : 0);
});
