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
    // a Ana fica parada na praça a olhar para este; o bot tem de a encontrar e disparar (só com o que vê e ouve)
    await A.ev(() => { G.p.x = 3650 - 13; G.p.z = 3650 - 7; G.p.hp = 100; G.p.born = -99; G.p.yaw = G.p.root = Math.PI / 2; });
    const t0 = Date.now(); let seenAt = 0, hitAt = 0, shotSnap = false, minD = 999; const trail = [];
    while (Date.now() - t0 < 150000) { await W(1000);
      const s = await A.ev(() => { const r = [...G.net.R.values()][0]; if (!r) return null; return { x: +(r.x - 3650).toFixed(1), z: +(r.z - 3650).toFixed(1), vis: r.b.root.visible, an: r.s1 && r.s1[7], hp: Math.round(G.p.hp), al: G.p.alive, d: +Math.hypot(r.x - G.p.x, r.z - G.p.z).toFixed(1) }; });
      if (!s) continue; trail.push([s.x, s.z, s.an]); minD = Math.min(minD, s.d);
      if (s.vis && !seenAt) { seenAt = Date.now(); }
      if (s.vis && !shotSnap && s.d < 40) { shotSnap = true; const P = await A.ev(() => { const r = [...G.net.R.values()][0]; return [r.x, r.z, G.p.x, G.p.z, r.b.root.visible, r.b.root.position.x, r.b.root.position.z]; }); console.log('foto do bot:', JSON.stringify(P)); const dd = Math.hypot(P[0] - P[2], P[1] - P[3]); await snap(A, 'perto', [P[2], 1.7, P[3]], [P[0], 1.1, P[1]], Math.max(8, 2 * Math.atan(2.2 / dd) * 180 / Math.PI)); }
      if ((s.hp < 100 || !s.al) && !hitAt) { hitAt = Date.now(); console.log('a Ana levou tiro aos', Math.round((hitAt - t0) / 1000), 's (vida', s.hp, ', a', s.d, 'm)'); break; }
    }
    console.log('trajeto do bot:', JSON.stringify(trail.filter((_, i) => i % 3 === 0)));
    ok(hitAt > 0, 'o bot encontra a Ana e acerta-lhe (sem a ver de início)');
    await A.page.screenshot({ path: path.join(outDir, 'bots-tiro.png') });
    // a Ana mata o bot (com a pontaria de teste); daqui para a frente a Ana não morre (o bot responde aos tiros)
    await A.ev(() => { G.p.hp = 100; if (!G.p.alive) G.arenaRespawn(); }); await W(3000); await A.ev(() => G.net.raw({ t: 'tgod', on: 1 }));
    let killed = false; for (let i = 0; i < 40 && !killed; i++) { await A.ev(() => { const r = [...G.net.R.values()][0]; if (r) { G.p.x = r.x - 5; G.p.z = r.z; G.p.hp = 100; } }); await W(250); const fr = await A.ev(() => { const r = [...G.net.R.values()][0]; G.p.hp = 100; if (!r || !r.b.root.visible) return 'sem alvo ' + (r ? [r.al, r.b.root.visible, Math.round(r.x - 3650), Math.round(r.z - 3650)] : ''); G.p.born = -99; G.fp = false; if (!G.aimS.on) G.aimStart(); G.aimS.raise = 1; G.aimS.Aw = new G.V3(r.x, (r.y || 0) + 1.25, r.z); G.p.reload = 0; G.p.cd = 0; G.sel = 0; const it = G.inv.belt[0]; if (!it) return 'sem arma'; it.ammo = Math.max(it.ammo, 5); G.p.yaw = Math.atan2(r.x - G.p.x, r.z - G.p.z); return G.dbg.fire(); }); if (i < 6) console.log('tiro:', JSON.stringify(fr), JSON.stringify(await A.ev(() => { const r = [...G.net.R.values()][0]; return r ? [r.s1 && r.s1[9], Math.round((r.x - G.p.x) * 10) / 10, Math.round((r.z - G.p.z) * 10) / 10, G.inv.belt[G.sel] && G.inv.belt[G.sel].k, G.inv.belt[G.sel] && G.inv.belt[G.sel].ammo] : null; }))); await W(350); killed = await A.ev(() => { const r = [...G.net.R.values()][0]; return !!(r && r.s1 && (r.s1[10] === 0 || r.s1[9] === 0)); }); }
    const feed = await A.ev(() => document.getElementById('akf').textContent); console.log('mortes:', feed); ok(killed, 'a Ana consegue abater o bot');
    { const fall = await A.ev(async () => { const o = []; for (let i = 0; i < 6; i++) { const r = [...G.net.R.values()][0]; o.push([+r.b.root.rotation.x.toFixed(2), r.al, !!r.deadT, r.b.root.visible, r.s1 && r.s1[10]]); await new Promise(q => setTimeout(q, 300)); } return o; }); console.log('corpo do bot:', JSON.stringify(fall)); ok(fall.some(f => f[0] < -1.2 && f[3]), 'o corpo do bot cai e fica no chão'); }
    { let back = false; for (let i = 0; i < 40 && !back; i++) { await W(300); back = await A.ev(() => { const r = [...G.net.R.values()][0]; return !!(r && r.s1 && r.s1[10] === 1 && r.s1[1] > 3685); }); } ok(back, 'o bot renasce na zona azul passados uns segundos'); }
    // entra outro humano na azul: o bot sai
    const B = await mk('Bruno', 'pb'); await pick(B, 1, 'Sniper'); await B.ev(() => document.getElementById('arGo').click()); await W(4000);
    const after = await A.ev(() => [...G.net.R.values()].map(r => r.name)); console.log('remotos da Ana depois do Bruno:', JSON.stringify(after)); ok(after.length === 1 && after[0] === 'Bruno', 'entra um humano na azul e o bot sai');
    { const e = [...A.errs, ...B.errs].filter(x => !/ERR_TUNNEL/.test(x)); console.log('erros:', JSON.stringify(e.slice(0, 4))); ok(!e.length, 'sem erros no jogo'); }
  } catch (e) { console.log('ERRO', e); fails++; }
  console.log(fails + ' falhas'); gs.kill(); server.close(); process.exit(fails ? 1 : 0);
});
