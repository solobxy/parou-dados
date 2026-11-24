// Equipa do jogo: código de administrador, permissões, congelar, ir ter, dar objetos, invisível, cargos, ban; e classificações
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-testadm'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3194', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (nome, id) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3194/ws'); localStorage.setItem('kg.test', '1'); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 700)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader|CORS|ERR_FAILED|404/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  const CODE = fs.readFileSync('/tmp/kg-admin-code.txt', 'utf8').trim();
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    for (const P of [A, B]) await P.ev(() => G.dbgKit());
    await W(2500);
    await A.ev(() => { G.p.x = 1000.5; G.p.z = 600.5; G.net.start(); }); await W(2000);
    await B.ev(() => { G.p.x = 1006.5; G.p.z = 600.5; G.net.start(); }); await W(2500);
    // código errado e certo
    await A.ev(() => G.net.admClaim('AAAAA-BBBBB-CCCCC-DDDDD')); await W(700);
    ok(await A.ev(() => !G.net.role), 'código errado não dá cargo');
    await A.ev(c => G.net.admClaim(c), CODE); await W(900);
    ok(await A.ev(() => G.net.role === 'admin' && !document.getElementById('bAdm').hidden), 'código certo: a Ana é administradora e aparece o botão do painel');
    // o Bruno não tem permissões
    const aUid = await A.ev(() => G.net.uid), bUid = await B.ev(() => G.net.uid);
    await B.ev(u => { document.getElementById('toast').textContent = ''; G.net.adm('kill', { uid: u }); }, aUid); await W(800);
    ok(/permissão/.test(await B.ev(() => document.getElementById('toast').textContent)) && await A.ev(() => G.p.alive), 'o Bruno não consegue usar comandos de administrador');
    // painel: lista de jogadores
    await A.ev(() => G.ui.admOpen()); await W(1200);
    const names = await A.ev(() => [...document.querySelectorAll('#admB .ap .nm b')].map(e => e.textContent));
    ok(names.some(n => /Bruno/.test(n)) && names.some(n => /Ana/.test(n)), 'o painel lista os jogadores (' + names.join(', ') + ')');
    await A.page.screenshot({ path: path.join(outDir, 'net-admin.png') });
    // congelar
    await A.ev(u => G.net.adm('freeze', { uid: u, on: 1 }), bUid); await W(900);
    const b0 = await B.ev(() => [G.p.x, G.frozen]); await B.ev(() => { G.p.x += 3; }); await W(1200); const b1 = await B.ev(() => G.p.x);
    ok(b0[1] === true && Math.abs(b1 - b0[0]) < 0.5, 'congelado: o Bruno não sai do sítio (' + b0[0].toFixed(1) + ' → ' + b1.toFixed(1) + ')');
    await A.ev(u => G.net.adm('freeze', { uid: u, on: 0 }), bUid); await W(700);
    // ir ter com ele
    await A.ev(() => { G.p.x = 1030; G.p.z = 600.5; }); await W(1200);
    await A.ev(u => G.net.adm('goto', { uid: u, w: 'p' }), bUid); await W(1200);
    const da = await A.ev(() => { const r = [...G.net.R.values()][0]; return Math.hypot(G.p.x - 1006.5, G.p.z - 600.5); });
    ok(da < 4, 'ir ter com o Bruno: a Ana aparece ao lado dele (' + da.toFixed(1) + ' m)');
    // dar objetos (e o servidor aceita-os no inventário)
    const c0 = await A.ev(() => G.inv.count('c4')); await A.ev(() => G.net.adm('give', { k: 'c4', n: 2 })); await W(900); const c1 = await A.ev(() => G.inv.count('c4'));
    ok(c1 === c0 + 2, 'criar objeto: a Ana recebe 2 C4 (' + c0 + ' → ' + c1 + ')');
    // invisível
    await A.ev(() => G.net.adm('inv', { on: 1 })); await W(1500);
    ok(await B.ev(() => ![...G.net.R.values()].some(r => r.name === 'Ana')), 'invisível: o Bruno deixa de ver a Ana');
    await A.ev(() => G.net.adm('inv', { on: 0 })); await W(1500);
    ok(await B.ev(() => [...G.net.R.values()].some(r => r.name === 'Ana')), 'visível outra vez: o Bruno volta a ver a Ana');
    // moderador: lista sim, matar não
    await A.ev(u => G.net.adm('role', { uid: u, r: 'mod' }), bUid); await W(900);
    ok(await B.ev(() => G.net.role === 'mod'), 'a Ana tornou o Bruno moderador');
    await B.ev(u => { document.getElementById('toast').textContent = ''; G.net.adm('kill', { uid: u }); }, aUid); await W(800);
    ok(/permissão/.test(await B.ev(() => document.getElementById('toast').textContent)), 'moderador não pode matar');
    await A.ev(u => G.net.adm('role', { uid: u, r: null }), bUid); await W(700);
    // classificações: a Ana mata um zombie
    const zi = await A.ev(() => { let best = -1, bd = 1e9; for (const z of G.zs) { if (z.nid == null || z.state === 'dead') continue; const d = Math.hypot(z.x - G.p.x, z.z - G.p.z); if (d < bd) { bd = d; best = z.nid; } } return best; });
    if (zi >= 0) { await A.ev(i => G.net.raw({ t: 'zd', i, dmg: 5000 }), zi); await W(800); }
    await A.ev(() => G.ui.lbOpen()); await W(1200); const lbz = await A.ev(() => { document.querySelector('#lbTabs [data-t=z]').click(); return document.getElementById('lbB').textContent; }); await W(300);
    ok(zi < 0 || /Ana/.test(lbz), 'classificações: a Ana aparece nos zombies mortos (' + lbz.slice(0, 60) + ')');
    await A.page.screenshot({ path: path.join(outDir, 'net-classificacoes.png') }); await A.ev(() => document.getElementById('lbX').click());
    // ban de 1 hora: o Bruno sai e não volta a entrar; tirar o ban deixa
    await A.ev(u => G.net.adm('ban', { uid: u, h: 1, why: 'teste' }), bUid); await W(1500);
    const bt = await B.ev(() => [G.net.on, document.getElementById('toast').textContent]); ok(!bt[0] && /banido/.test(bt[1]), 'banido: o Bruno é desligado (' + bt[1] + ')');
    await B.ev(() => G.net.start()); await W(1500);
    ok(await B.ev(() => !G.net.on && /banido/.test(document.getElementById('toast').textContent)), 'banido: não consegue voltar a entrar');
    await A.ev(u => G.net.adm('unban', { uid: u }), bUid); await W(600);
    await B.ev(() => G.net.start()); await W(2000);
    ok(await B.ev(() => G.net.on), 'sem ban: o Bruno volta a entrar');
    console.log('erros A:', A.errs.length, 'B:', B.errs.length, JSON.stringify([...A.errs, ...B.errs]).slice(0, 300));
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill();
});
