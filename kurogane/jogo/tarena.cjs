// Arena PvP de Tóquio: dois jogadores (vermelha e azul), ver-se, tiros, baixa, placar, renascer, mudar de equipa e de kit
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-arena'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3195', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
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
    const fs2 = require('fs'), snap = async (P, nm, pos, at, fov = 70) => { const u = await P.ev(([p, a, f]) => G.dbgCam(p, a, f, 960, 540), [pos, at, fov]); fs2.writeFileSync(path.join(outDir, 'arena-' + nm + '.jpg'), Buffer.from(u.split(',')[1], 'base64')); };
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    const lob = await A.ev(() => ({ open: !document.getElementById('arw').hidden, kits: document.querySelectorAll('#arw .akit').length, start: !document.getElementById('start').hidden, zone: G.W.zones.some(z => z.arena) }));
    console.log('lobby:', JSON.stringify(lob)); ok(lob.open && lob.kits === 5 && !lob.start && lob.zone, 'abre a escolha de equipa e de kit (5 kits) em vez do menu');
    await A.page.click('#arw .atm.t0'); await A.page.click('#arw .akit[data-k="atirador"]'); await W(300);
    await A.page.screenshot({ path: path.join(outDir, 'arena-lobby.png') });
    await A.page.click('#arGo'); await W(500);
    await B.ev(() => { document.querySelector('#arw .atm.t1').click(); document.querySelector('#arw .akit[data-k="sniper"]').click(); document.getElementById('arGo').click(); });
    for (let i = 0; i < 40 && !(await A.ev(() => G.net.on && G.net.R.size > 0)); i++) await W(500);
    const st = await A.ev(() => ({ on: G.net.on, R: G.net.R.size, team: G.net.clanInfo && G.net.clanInfo.nome, x: G.p.x, z: G.p.z, belt: G.inv.belt.map(i => i && i.k), zs: G.zs.length }));
    console.log('Ana:', JSON.stringify(st)); ok(st.on && st.R === 1 && /Vermelha/.test(st.team) && st.x < 3650 && st.belt[0] === 'm4' && st.zs === 0, 'a Ana entra na vermelha, com o kit de atirador, a oeste, sem zombies');
    const sb = await B.ev(() => ({ team: G.net.clanInfo && G.net.clanInfo.nome, x: G.p.x, belt: G.inv.belt.map(i => i && i.k) })); console.log('Bruno:', JSON.stringify(sb)); ok(/Azul/.test(sb.team) && sb.x > 3650 && sb.belt[0] === 'cheytac', 'o Bruno entra na azul, com o kit de sniper, a este');
    await A.page.screenshot({ path: path.join(outDir, 'arena-hud.png') });
    // fotografias do mapa
    const X = 3650, Z = 3650;
    await snap(A, 'cima', [X, 70, Z + 55], [X, 0, Z], 60); await snap(A, 'meio', [X - 30, 1.7, Z + 1], [X, 2, Z], 75); await snap(A, 'viela', [X - 28, 1.7, Z - 19], [X + 5, 2, Z - 20], 75); await snap(A, 'parque', [X - 34, 2.5, Z + 22], [X, 2, Z + 20], 75); await snap(A, 'partida', [X - 30, 2, Z], [X - 44, 2, Z], 75);
    // frente a frente na praça: a Ana dispara até abater o Bruno (fora da proteção de nascer)
    await W(2600);
    await B.ev(() => { G.p.x = 3656; G.p.z = 3650 + 7; G.p.hp = 100; }); await A.ev(() => { G.p.x = 3644; G.p.z = 3650 + 7; }); await W(1500);
    let killed = false; for (let i = 0; i < 25 && !killed; i++) { const fr = await A.ev(() => { const r = [...G.net.R.values()][0]; if (!r) return 'sem alvo'; G.fp = false; if (!G.aimS.on) G.aimStart(); G.aimS.raise = 1; G.aimS.Aw = new G.V3(r.x, (r.y || 0) + 1.25, r.z); G.p.reload = 0; G.p.cd = 0; const it = G.inv.belt[G.sel]; it.ammo = Math.max(it.ammo, 5); G.p.yaw = Math.atan2(r.x - G.p.x, r.z - G.p.z); return G.dbg.fire(); }); if (i < 2) console.log('tiro:', JSON.stringify(fr), JSON.stringify(await B.ev(() => [G.p.hp, G.p.x, G.p.z]))); await W(350); killed = !(await B.ev(() => G.p.alive)); }
    ok(killed, 'a Ana abate o Bruno');
    await W(1800);
    const sc = await A.ev(() => ({ s: G.net.arena && G.net.arena.s, feed: document.getElementById('akf').textContent, hud: document.getElementById('asc').textContent })); console.log('placar:', JSON.stringify(sc)); ok(sc.s && sc.s[0] === 1 && /Ana/.test(sc.feed) && /Bruno/.test(sc.feed), 'conta a baixa para a vermelha e aparece nas mortes ao vivo');
    const dv = await B.ev(() => ({ open: !document.getElementById('arw').hidden, txt: document.querySelector('#arw .aT') && document.querySelector('#arw .aT').textContent, bags: G.bags.length })); console.log('Bruno morto:', JSON.stringify(dv)); ok(dv.open && /Ana/.test(dv.txt) && dv.bags === 0, 'o Bruno vê quem o matou e não fica mochila no chão');
    await B.page.screenshot({ path: path.join(outDir, 'arena-morte.png') });
    // muda de kit e renasce
    await B.ev(() => document.querySelector('#arw .akit[data-k="pesado"]').click()); await W(4200); await B.ev(() => document.getElementById('arGo').click()); await W(1500);
    const rb = await B.ev(() => ({ al: G.p.alive, x: G.p.x, belt: G.inv.belt.map(i => i && i.k), hp: G.p.hp })); console.log('Bruno renasceu:', JSON.stringify(rb)); ok(rb.al && rb.x > 3680 && rb.belt[0] === 'm249' && rb.hp === 100, 'renasce na zona azul com o kit novo (pesado)');
    // proteção de nascer: tiros logo a seguir não magoam
    // mudar de equipa pelo botão da arena
    await B.ev(() => { document.getElementById('bAr').click(); }); await W(300); await B.ev(() => document.querySelector('#arw .atm.t0').click()); await W(1500);
    const tb = await B.ev(() => ({ team: G.net.clanInfo && G.net.clanInfo.nome, x: G.p.x })); const ta = await A.ev(() => { const r = [...G.net.R.values()][0]; return r && r.el.classList.contains('mate'); }); console.log('troca de equipa:', JSON.stringify(tb), 'a Ana vê-o como colega:', ta); ok(/Vermelha/.test(tb.team) && tb.x < 3620 && ta, 'muda para a vermelha, renasce a oeste e a Ana vê-o como colega');
    // granada: a Ana (vermelha) rebenta uma granada aos pés de um azul... o Bruno agora é vermelho: volta para a azul primeiro
    await B.ev(() => { document.getElementById('bAr').click(); }); await W(300); await B.ev(() => document.querySelector('#arw .atm.t1').click()); await W(4000);
    await B.ev(() => { G.p.x = 3650 + 3; G.p.z = 3650 + 8; G.p.hp = 100; G.p.born = -99; }); await W(1500);
    const s0 = await A.ev(() => (G.net.arena && G.net.arena.s || [0, 0])[0]);
    await A.ev(() => { G.p.x = 3650 - 4; G.p.z = 3650 + 8; }); await W(400);
    for (let i = 0; i < 2; i++) { await A.ev(() => { G.net.raw({ t: 'thr', k: 'gran', P: [G.p.x, 1.5, G.p.z], V: [1, 1, 0], lv: 0 }); }); await W(300); await A.ev(() => G.net.raw({ t: 'boom', k: 'gran', x: 3650 + 3, y: 0.2, z: 3650 + 8, lv: 0 })); await W(1200); } await W(1500); // duas granadas (o colete aguenta uma)
    const gb = await B.ev(() => ({ al: G.p.alive, by: G.arenaBy, hp: G.p.hp, booms: window.__booms || 0 })), s1 = await A.ev(() => (G.net.arena && G.net.arena.s || [0, 0])[0]); console.log('granada:', JSON.stringify(gb), 'placar vermelha', s0, '→', s1); ok(!gb.al && gb.by === 'Ana' && s1 === s0 + 1, 'as granadas da Ana matam o Bruno (azul) e contam para a vermelha');
    // granada falsa (sem lançar) não faz nada
    await W(4500); await B.ev(() => G.arenaRespawn()); await W(3500); await B.ev(() => { G.p.x = 3650 + 3; G.p.z = 3650 + 8; G.p.born = -99; }); await W(1200);
    await A.ev(() => G.net.raw({ t: 'boom', k: 'gran', x: 3650 + 3, y: 0.2, z: 3650 + 8, lv: 0 })); await W(2000);
    const gf = await B.ev(() => G.p.alive); console.log('granada sem lançar:', gf); ok(gf, 'uma explosão sem granada lançada antes é ignorada pelo servidor');
    const errA = A.errs.filter(e => !/ERR_TUNNEL/.test(e)), errB = B.errs.filter(e => !/ERR_TUNNEL/.test(e)); console.log('erros:', errA.length, errB.length, JSON.stringify([...errA, ...errB].slice(0, 4))); ok(!errA.length && !errB.length, 'sem erros no jogo');
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem'); await browser.close(); server.close(); gs.kill(); process.exit(fails ? 1 : 0);
});
