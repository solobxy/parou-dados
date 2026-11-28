// Dois jogadores no mesmo servidor: ver-se, disparar, morrer, mochila, clã e quem dorme
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
    await A.page.screenshot({ path: path.join(outDir, 'net-menu.png') });
    console.log('menu:', await A.ev(() => document.getElementById('sOnT').textContent));
    // os dois começam com o kit (armas), põem-se perto um do outro e ligam-se
    for (const P of [A, B]) { await P.ev(() => G.dbgKit()); }
    await W(3000);
    const spot = await A.ev(() => [G.p.x, G.p.z]);
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; G.net.start(); }, spot);
    await B.ev(s => { G.p.x = s[0] + 6; G.p.z = s[1]; G.p.root = 0; G.net.start(); }, spot);
    await W(3500);
    await A.ev(() => { const r = [...G.net.R.values()][0]; if (r) { const a = Math.atan2(r.x - G.p.x, r.z - G.p.z); G.aimS.fy = a; G.aimS.fpit = 0; G.p.root = a; G.p.yaw = a; } }); for (let i = 0; i < 20 && !(await A.ev(() => { const r = [...G.net.R.values()][0]; return r && r.el.style.display !== 'none'; })); i++) await W(400); // na 1.ª pessoa só se vê o nome de quem está à frente
    const seen = await A.ev(() => { const r = [...G.net.R.values()][0]; return r ? { name: r.name, vis: r.b.root.visible, tag: r.el.style.display !== 'none', x: r.x } : null; });
    console.log('A vê:', JSON.stringify(seen)); ok(seen && seen.name === 'Bruno' && seen.vis && seen.tag, 'A vê o Bruno com o nome por cima');
    await A.page.screenshot({ path: path.join(outDir, 'net-ver.png') });
    // A dispara 3 tiros de pistola ao peito do Bruno (sem colete): morre ao 3.º
    await B.ev(() => { G.inv.eq.vest = null; G.inv.eq.head = null; G.p.hp = 100; });
    const bpos = await B.ev(() => [G.p.x, G.p.y || 0, G.p.z]); await A.ev(() => { const h0 = G.ui.hit; window.__hp = []; G.ui.hit = (...a) => { __hp.push(a[3] ? [a[3].x, a[3].y, a[3].z] : null); return h0(...a); }; });
    await W(400);
    console.log('DBG', await A.ev(() => { const r = [...G.net.R.values()][0], T = G.TER; return JSON.stringify({ a: [G.p.x, G.p.y, G.p.z, T.at(G.p.x, G.p.z)], b: r && [r.x, r.y, r.z, T.at(r.x, r.z)], mid: r && T.at((r.x + G.p.x) / 2, (r.z + G.p.z) / 2) }); }));
    const gun = await A.ev(() => { for (let i = 0; i < 6; i++) if (G.inv.belt[i] && /pistola/.test(G.inv.belt[i].k)) { G.sel = i; return G.inv.belt[i].k + ' ' + G.inv.belt[i].ak; } return null; });
    console.log('arma do A:', gun);
    const hps = [];
    for (let i = 0; i < 4; i++) {
      await A.ev(() => { const r = [...G.net.R.values()][0]; G.fp = false; G.aimS.Aw = new G.V3(r.x, (r.y || 0) + 1.42, r.z); G.p.reload = 0; G.p.cd = 0; const it = G.inv.belt[G.sel]; it.ammo = Math.max(it.ammo, 5); G.p.yaw = Math.atan2(r.x - G.p.x, r.z - G.p.z); return G.dbg.fire(); });
      const h0 = await B.ev(() => G.p.hp); for (let k = 0; k < 40 && (await B.ev(h => G.p.hp === h, h0)); k++) await W(100); /* espera que o tiro chegue (no servidor de testes as páginas estão lentas) */ hps.push(await B.ev(() => Math.round(G.p.hp) + (G.p.alive ? '' : ' morto')));
    }
    console.log('vida do Bruno depois de cada tiro:', hps.join(', ')); ok(/morto/.test(hps[2]) && !/morto/.test(hps[1]), 'morre ao 3.º tiro no peito');
    { const hp = await A.ev(() => window.__hp); const bp = await A.ev(() => { const r = [...G.net.R.values()][0]; return r ? [r.x, r.y || 0, r.z] : null; }); const g = hp.filter(Boolean); console.log('hitmarkers em', JSON.stringify(g.map(q => q.map(v => +v.toFixed(2)))), 'Bruno em', JSON.stringify(bp && bp.map(v => +v.toFixed(2)))); ok(g.length >= 1 && bp && g.every(q => Math.hypot(q[0] - bp[0], q[2] - bp[2]) < 0.6 && q[1] - bp[1] > 0.6 && q[1] - bp[1] < 1.9), 'o hitmarker aparece onde a bala entrou (no peito, à frente do corpo)'); }
    await W(1800);
    const dtx = await B.ev(() => document.getElementById('dCause').textContent); console.log('ecrã de morte:', dtx); ok(/Ana matou-te/.test(dtx), 'diz quem te matou');
    await B.page.screenshot({ path: path.join(outDir, 'net-morte.png') });
    const bagA = await A.ev(() => G.bags.map(b => b.label + ' @' + b.x.toFixed(0)));
    console.log('mochilas que o A vê:', bagA.join(' | ')); ok(bagA.length === 1, 'a mochila do Bruno aparece no mundo para o A');
    // A vai à mochila e apanha
    const before = await A.ev(() => G.inv.all().length);
    await A.ev(() => { const b = G.bags[0]; G.p.x = b.x + 0.8; G.p.z = b.z; const a = Math.atan2(b.x - G.p.x, b.z - G.p.z); G.aimS.fy = a; G.aimS.fpit = -0.9; G.p.yaw = G.p.root = a; }); /* na 1.ª pessoa abre-se o que está debaixo da mira */
    await W(900);
    const pr = await A.ev(() => G.prompt && G.prompt.label); console.log('prompt do A:', pr); ok(/corpo de Bruno/.test(pr || ''), 'aparece «Revistar o corpo de Bruno»');
    await A.ev(() => G.interact()); await W(1200); await A.ev(() => { document.getElementById('takeAll').click(); G.ui.closeInv(); }); await W(1200);
    const after = await A.ev(() => [G.inv.all().length, G.bags.length]);
    console.log('itens do A antes/depois:', before, after[0], '· mochilas:', after[1]); ok(after[0] > before, 'levou o que o Bruno tinha (o que não coube fica no corpo: ' + after[1] + ')');
    // clã: A cria, B renasce e entra com o código; tiros entre os dois não magoam
    await B.ev(() => G.respawn(false)); await W(500);
    await A.ev(() => G.net.clanCmd('create', 'Ronin')); for (let i = 0; i < 16 && !(await A.ev(() => G.net.clanInfo && G.net.clanInfo.codigo)); i++) await W(400);
    const code = await A.ev(() => G.net.clanInfo && G.net.clanInfo.codigo); console.log('código do clã:', code); ok(!!code, 'clã criado com código');
    await B.ev(c => G.net.clanCmd('join', c), code); for (let i = 0; i < 10 && !(await B.ev(() => G.net.clanInfo && G.net.clanInfo.membros.length > 1)); i++) await W(500);
    const cb = await B.ev(() => G.net.clanInfo && G.net.clanInfo.membros.join(',')); ok(cb === 'Ana,Bruno', 'o Bruno entrou no clã (' + cb + ')');
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; }, spot); await B.ev(s => { G.p.x = s[0] + 6; G.p.z = s[1]; G.p.hp = 100; }, spot); await W(1200);
    await A.ev(() => { const r = [...G.net.R.values()][0]; G.aimS.Aw = new G.V3(r.x, (r.y || 0) + 1.15, r.z); G.p.reload = 0; G.p.cd = 0; G.inv.belt[G.sel].ammo = 5; return G.dbg.fire(); }); await W(800);
    const hpc = await B.ev(() => Math.round(G.p.hp)); ok(hpc === 100, 'o mesmo clã não se magoa (vida ' + hpc + ')');
    await A.ev(() => { G.ui.toggleMap ? G.ui.toggleMap(true) : null; }); await W(300);
    const mates = await A.ev(() => JSON.stringify(G.net.mates())); console.log('clã no mapa do A:', mates); ok(/Bruno/.test(mates), 'o Bruno aparece no mapa do A');
    // B sai do clã e fecha o jogo: fica a dormir. A mata-o a dormir e leva a mochila
    await B.ev(() => G.net.clanCmd('leave')); await W(500);
    await B.ev(() => { G.inv.eq.vest = null; G.inv.eq.head = null; G.net.sendInv(); }); await W(500);
    const tokB = await B.ev(() => localStorage.getItem('kg.tok.pb'));
    await B.ctx.close(); await W(1500);
    const sl = await A.ev(() => [...document.querySelectorAll('.ntag.sleep')].map(e => e.textContent + (e.style.display === 'none' ? ' (escondido)' : '')).join(','));
    console.log('a dormir:', sl); ok(/Bruno · a dormir/.test(sl), 'o Bruno ficou a dormir no mundo');
    await A.page.screenshot({ path: path.join(outDir, 'net-dormir.png') });
    const nb0 = await A.ev(() => G.bags.length); let k = 0; for (; k < 8; k++) { const b = await A.ev(() => G.bags.length); if (b > nb0) break; await A.ev(s => { G.fp = false; const t = G.net.targets().find(q => q.lie) || { x: s[0] + 6, z: s[1], y: G.groundY(s[0] + 6, s[1]) + 0.13, yaw: 0 }; G.aimS.Aw = new G.V3(t.x - Math.sin(t.yaw) * 1.3, (t.y || 0) + 0.22, t.z - Math.cos(t.yaw) * 1.3); /* peito de quem dorme (de costas, a cabeça para trás dos pés) */ G.p.reload = 0; G.p.cd = 0; G.inv.belt[G.sel].ammo = 5; return G.dbg.fire(); }, spot); await W(600); }
    const bl = await A.ev(n0 => G.bags.length > n0 ? G.bags[G.bags.length - 1].label : '', nb0);
    ok(/Bruno/.test(bl), `matou quem dormia em ${k} tiros e ficou a mochila (${bl})`);
    // o Bruno volta: sabe que o mataram a dormir
    const B2 = await mk('Bruno', 'pb', tokB); await B2.ev(() => G.dbgKit()); await W(2500); await B2.ev(() => G.net.start()); for (let i = 0; i < 30 && !(await B2.ev(() => /dormias/.test(document.getElementById('dCause').textContent))); i++) await W(500);
    const dt2 = await B2.ev(() => [G.p.alive, document.getElementById('dCause').textContent]);
    console.log('o Bruno ao voltar:', JSON.stringify(dt2)); ok(dt2[0] === false && /dormias/.test(dt2[1]), 'ao voltar, morto: mataram-te enquanto dormias');
    const C = await mk('Ana', 'pc'); await C.ev(() => G.dbgKit()); await W(2500); await C.ev(() => G.net.start()); for (let i = 0; i < 30 && !(await C.ev(() => /outro jogador/.test(document.getElementById('mnote').textContent))); i++) await W(500);
    const cn = await C.ev(() => [G.net.on, G.playing, document.getElementById('mnote').textContent, document.getElementById('start').hidden]); console.log('outro "Ana":', JSON.stringify(cn)); ok(cn[0] === false && cn[1] === false && cn[3] === false && /outro jogador/.test(cn[2]), 'ninguém entra com o nome de outro (volta ao menu com a razão)');
    console.log('erros A:', A.errs.length, 'B:', B.errs.length, 'B2:', B2.errs.length, 'C:', C.errs.length);
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill();
});
