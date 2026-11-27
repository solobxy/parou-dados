// Arena PvP de Tóquio: dois jogadores (vermelha e azul), ver-se, tiros, baixa, placar, renascer, mudar de equipa e de kit
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-arena'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3195', STATE_DIRECTORY: ST, KG_TEST: '1', KG_BOTS: '0' }, stdio: 'inherit' });
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
    const lob = await A.ev(() => ({ open: !document.getElementById('arw').hidden, kits: document.querySelectorAll('#arw .adots i').length, start: !document.getElementById('start').hidden, zone: G.W.zones.some(z => z.arena) }));
    console.log('lobby:', JSON.stringify(lob)); ok(lob.open && lob.kits === 5 && !lob.start && lob.zone, 'abre a escolha de equipa e de kit (5 kits) em vez do menu');
    const pick = (P, team, nome) => P.ev(async ([team, nome]) => { document.querySelector('#arw .atm.t' + team).click(); await new Promise(r => setTimeout(r, 400)); for (let i = 0; i < 6 && document.querySelector('#arw .akh b').textContent !== nome; i++) { document.getElementById('arNextK').click(); await new Promise(r => setTimeout(r, 250)); } return document.querySelector('#arw .akh b').textContent; }, [team, nome]);
    console.log('kit A:', await pick(A, 0, 'Atirador')); await W(300);
    await A.page.screenshot({ path: path.join(outDir, 'arena-lobby.png') });
    await A.page.click('#arGo'); await W(500);
    console.log('kit B:', await pick(B, 1, 'Sniper')); await B.ev(() => document.getElementById('arGo').click());
    for (let i = 0; i < 40 && !(await A.ev(() => G.net.on && G.net.R.size > 0)); i++) await W(500);
    const st = await A.ev(() => ({ on: G.net.on, R: G.net.R.size, team: G.net.clanInfo && G.net.clanInfo.nome, x: G.p.x, z: G.p.z, belt: G.inv.belt.map(i => i && i.k), zs: G.zs.length }));
    console.log('Ana:', JSON.stringify(st)); ok(st.on && st.R === 1 && /Vermelha/.test(st.team) && st.x < 3650 && st.belt[0] === 'm4' && st.zs === 0, 'a Ana entra na vermelha, com o kit de atirador, a oeste, sem zombies');
    const sb = await B.ev(() => ({ team: G.net.clanInfo && G.net.clanInfo.nome, x: G.p.x, belt: G.inv.belt.map(i => i && i.k) })); console.log('Bruno:', JSON.stringify(sb)); ok(/Azul/.test(sb.team) && sb.x > 3650 && sb.belt[0] === 'cheytac', 'o Bruno entra na azul, com o kit de sniper, a este');
    await A.page.screenshot({ path: path.join(outDir, 'arena-hud.png') });
    // fotografias do mapa
    const X = 3650, Z = 3650;
    await snap(A, 'cima', [X, 70, Z + 55], [X, 0, Z], 60); await snap(A, 'meio', [X - 30, 1.7, Z + 1], [X, 2, Z], 75); await snap(A, 'viela', [X - 28, 1.7, Z - 19], [X + 5, 2, Z - 20], 75); await snap(A, 'parque', [X - 34, 2.5, Z + 22], [X, 2, Z + 20], 75); await snap(A, 'partida', [X - 30, 2, Z], [X - 44, 2, Z], 75);
    // o Bruno escolhe já o próximo kit (Pesado) no menu da arena: conta ao renascer
    await B.ev(() => document.getElementById('bAr').click()); await W(400);
    await B.ev(async nome => { for (let i = 0; i < 6 && document.querySelector('#arw .akh b').textContent !== nome; i++) { document.getElementById('arNextK').click(); await new Promise(r => setTimeout(r, 150)); } }, 'Pesado');
    await B.ev(() => document.getElementById('arX').click()); await W(400);
    // frente a frente na praça: a Ana dispara até abater o Bruno (fora da proteção de nascer)
    await W(2600);
    await B.ev(() => { G.p.x = 3656; G.p.z = 3650 + 7; G.p.hp = 100; }); await A.ev(() => { G.p.x = 3644; G.p.z = 3650 + 7; }); await W(1500);
    let killed = false; for (let i = 0; i < 25 && !killed; i++) { const fr = await A.ev(() => { const r = [...G.net.R.values()][0]; if (!r) return 'sem alvo'; G.fp = false; if (!G.aimS.on) G.aimStart(); G.aimS.raise = 1; G.aimS.Aw = new G.V3(r.x, (r.y || 0) + 1.25, r.z); G.p.reload = 0; G.p.cd = 0; const it = G.inv.belt[G.sel]; it.ammo = Math.max(it.ammo, 5); G.p.yaw = Math.atan2(r.x - G.p.x, r.z - G.p.z); return G.dbg.fire(); }); if (i < 2) console.log('tiro:', JSON.stringify(fr), JSON.stringify(await B.ev(() => [G.p.hp, G.p.x, G.p.z]))); await W(350); killed = !(await B.ev(() => G.p.alive)); }
    ok(killed, 'a Ana abate o Bruno');
    await W(1800);
    const sc = await A.ev(() => ({ s: G.net.arena && G.net.arena.s, feed: document.getElementById('akf').textContent, hud: document.getElementById('asc').textContent })); console.log('placar:', JSON.stringify(sc)); ok(sc.s && sc.s[0] === 1 && /Ana/.test(sc.feed) && /Bruno/.test(sc.feed), 'conta a baixa para a vermelha e aparece nas mortes ao vivo');
    const dv = await B.ev(() => ({ open: !document.getElementById('arw').hidden, txt: document.querySelector('#arw .aT') && document.querySelector('#arw .aT').textContent, bags: G.bags.length })); console.log('Bruno morto:', JSON.stringify(dv)); ok(dv.open && /Ana/.test(dv.txt) && dv.bags === 0, 'o Bruno vê quem o matou e não fica mochila no chão');
    await B.page.screenshot({ path: path.join(outDir, 'arena-morte.png') });
    // renasce sozinho passados 5 s (com a barra a encher), com o kit escolhido
    await B.page.waitForFunction(() => !document.getElementById('arw').hidden, null, { timeout: 15000 }).catch(() => { });
    const bar = await B.ev(() => { const b = document.getElementById('arGo'); return [b.classList.contains('cdb'), b.textContent]; }); console.log('barra:', JSON.stringify(bar));
    await B.page.waitForFunction(() => G.p.alive, null, { timeout: 15000 }).catch(() => { }); await W(800);
    const rb = await B.ev(() => ({ al: G.p.alive, x: G.p.x, belt: G.inv.belt.map(i => i && i.k), hp: G.p.hp })); console.log('Bruno renasceu:', JSON.stringify(rb)); ok(rb.al && rb.x > 3680 && rb.belt[0] === 'm249' && rb.hp === 100, 'renasce sozinho (barra de 5 s) na zona azul com o kit escolhido (pesado)');
    // proteção de nascer: tiros logo a seguir não magoam
    // mudar de equipa: 1 contra 1, passar para a vermelha desequilibrava (2 contra 0): não deixa
    await B.ev(() => { document.getElementById('bAr').click(); }); await W(300); await B.ev(() => document.getElementById('arBack').click()); await W(500); const full = await B.ev(() => document.querySelector('#arw .atm.t0').classList.contains('full')); await B.ev(() => document.querySelector('#arw .atm.t0').click()); await W(1500);
    const tb = await B.ev(() => ({ team: G.net.clanInfo && G.net.clanInfo.nome, x: G.p.x })); console.log('troca de equipa:', JSON.stringify(tb), 'cartão bloqueado:', full); ok(full && /Azul/.test(tb.team) && tb.x > 3680, 'não deixa passar para a equipa que ficaria com mais jogadores');
    await B.ev(() => { const x = document.getElementById('arX'); if (!document.getElementById('arw').hidden) x.click(); }); await W(500);
    const mates = await A.ev(() => G.net.mates().length), foesSeen = await A.ev(() => [...G.net.R.values()].map(r => +(r.spA || 0).toFixed(2))); console.log('radar da Ana: colegas', mates, 'inimigo visto', JSON.stringify(foesSeen));
    await B.ev(() => { G.p.x = 3650 + 3; G.p.z = 3650 + 8; G.p.hp = 100; G.p.born = -99; }); await W(1500);
    const s0 = await A.ev(() => (G.net.arena && G.net.arena.s || [0, 0])[0]);
    await A.ev(() => { G.p.x = 3650 - 4; G.p.z = 3650 + 8; }); await W(400);
    for (let i = 0; i < 2; i++) { await A.ev(() => { G.net.raw({ t: 'thr', k: 'gran', P: [G.p.x, 1.5, G.p.z], V: [1, 1, 0], lv: 0 }); }); await W(300); await A.ev(() => G.net.raw({ t: 'boom', k: 'gran', x: 3650 + 3, y: 0.2, z: 3650 + 8, lv: 0 })); await W(2000); } for (let i = 0; i < 20 && (await B.ev(() => G.p.alive)); i++) await W(400); await W(800); // duas granadas (o colete aguenta uma)
    const gb = await B.ev(() => ({ al: G.p.alive, by: G.arenaBy, hp: G.p.hp, booms: window.__booms || 0 })), s1 = await A.ev(() => (G.net.arena && G.net.arena.s || [0, 0])[0]); console.log('granada:', JSON.stringify(gb), 'placar vermelha', s0, '→', s1); ok(!gb.al && gb.by === 'Ana' && s1 === s0 + 1, 'as granadas da Ana matam o Bruno (azul) e contam para a vermelha');
    // granada falsa (sem lançar) não faz nada
    await W(4500); await B.ev(() => G.arenaRespawn()); await W(3500); await B.ev(() => { G.p.x = 3650 + 3; G.p.z = 3650 + 8; G.p.born = -99; }); await W(1200);
    await A.ev(() => G.net.raw({ t: 'boom', k: 'gran', x: 3650 + 3, y: 0.2, z: 3650 + 8, lv: 0 })); await W(2000);
    const gf = await B.ev(() => G.p.alive); console.log('granada sem lançar:', gf); ok(gf, 'uma explosão sem granada lançada antes é ignorada pelo servidor');
    { await B.ev(() => { G.dbgNoVis = true; G.net.raw({ t: 'vis', L: [] }); }); await W(4500); /* o Bruno sem a ver: só o tiro a mostra */
      const am0 = await A.ev(() => JSON.stringify([G.sel, G.inv.belt.map(i => i && (i.k + ':' + i.ammo)), G.fireHeld, G.p.alive])); await W(2000); const am1 = await A.ev(() => JSON.stringify([G.sel, G.inv.belt.map(i => i && (i.k + ':' + i.ammo)), G.fireHeld])); console.log('Ana armas:', am0, am1);
      const before = await B.ev(() => { const r = [...G.net.R.values()][0]; return [+(r.spA || 0).toFixed(2), r.s1 && r.s1[16], r.al]; });
      await A.ev(() => { G.p.reload = 0; G.p.cd = 0; const it = G.inv.belt[G.sel]; if (it) it.ammo = Math.max(it.ammo || 0, 5); for (let i = 0; i < 6; i++) if (G.inv.belt[i] && G.inv.belt[i].k === 'm4') G.sel = i; const it2 = G.inv.belt[G.sel]; it2.ammo = 30; G.fp = false; G.aimS.Aw = new G.V3(G.p.x - 5, 1, G.p.z - 5); const rr = G.dbg.fire(); return [rr, it2.ammo]; }).then(v => console.log('tiro da Ana:', JSON.stringify(v))); await W(900);
      const [raw, shotA] = await B.ev(async () => { let mx = 0, ma = 0; const t0 = G.t; while (G.t < t0 + 2) { const r = [...G.net.R.values()][0]; mx = Math.max(mx, r.s1 ? r.s1[16] | 0 : -1); ma = Math.max(ma, r.spA || 0); await new Promise(q => setTimeout(q, 50)); } return [mx, +ma.toFixed(2)]; }); console.log('linha do servidor depois do tiro (visto):', raw);
      { const t0 = await B.ev(() => G.t); await B.page.waitForFunction(t => G.t > t, t0 + 5, { timeout: 120000 }); } const after = await B.ev(() => +([...G.net.R.values()][0].spA || 0).toFixed(2));
      console.log('radar do Bruno (Ana):', JSON.stringify(before), '→ tiro', shotA, '→ 5 s depois', after); ok(shotA > before[0] + 0.2 && after < shotA, 'quem dispara aparece no radar dos inimigos e depois desaparece devagar'); }
    const errA = A.errs.filter(e => !/ERR_TUNNEL/.test(e)), errB = B.errs.filter(e => !/ERR_TUNNEL/.test(e)); console.log('erros:', errA.length, errB.length, JSON.stringify([...errA, ...errB].slice(0, 4))); ok(!errA.length && !errB.length, 'sem erros no jogo');
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem'); await browser.close(); server.close(); gs.kill(); process.exit(fails ? 1 : 0);
});
