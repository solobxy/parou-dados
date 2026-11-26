// Anti-grief: não se constrói colado à base de outro, não se cerca, não se põem camas/objetos à porta
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-testgr'; fs.rmSync(ST, { recursive: true, force: true }); fs.mkdirSync(ST, { recursive: true });
// uma porta antiga (de antes das fechaduras): tem de ficar trancada só para o dono e o clã
let gs = null;
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
  try {
    const A = await mk('Ana', 'pa');
    const wv = await A.ev(() => G.WV);
    fs.writeFileSync(path.join(ST, 'estado.json'), JSON.stringify({ w: { wv, base: { p: { 'f:400:300': { t: 'fund', tier: 0, hp: 250, o: 0, u: 'uVit', tok: 'tokVit' } }, d: {} } } }));
    gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3194', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
    await W(800); await A.ev(() => G.dbgKit()); await W(2500);
    await A.ev(() => { G.p.x = 1195; G.p.z = 901.5; G.gain('madeira', 20000); G.gain('pedraR', 4000); for (const k of ['cama', 'cama', 'bau']) G.inv.give(G.dbg.item(k, 1)); G.net.start(); }); await W(3000);
    const CODE = fs.readFileSync('/tmp/kg-admin-code.txt', 'utf8').trim(); await A.ev(c => G.net.admClaim(c), CODE); await W(900); for (let k = 0; k < 2; k++) { await A.ev(() => G.net.adm('give', { k: 'madeira', n: 1000 })); await W(500); }
    const toasts = []; await A.page.exposeFunction('__t', t => toasts.push(t)); await A.ev(() => { const o = G.ui.toast; G.ui.toast = (m, ...r) => { window.__t(String(m)); return o.call(G.ui, m, ...r); }; });
    const bp = async (i, j) => { await A.ev(([i, j]) => { G.p.x = i * 3 + 1.5 + (i > 400 ? 4 : -4); G.p.z = j * 3 + 1.5; }, [i, j]); await W(250); await A.ev(([i, j]) => G.net.raw({ t: 'bp', k: 'f:' + i + ':' + j, tt: 'fund' }), [i, j]); await W(350); return A.ev(k => G.base.pieces.has(k), 'f:' + i + ':' + j); };
    ok(await A.ev(() => !!G.base.pieces.get('f:400:300')), 'a base da vítima veio do servidor');
    // fantasma do cliente: vermelho e com o motivo
    const ghost = await A.ev(() => { G.p.x = 1209.5; G.p.z = 901.5; G.p.yaw = G.p.root = -Math.PI / 2; G.inv.belt[4] = { id: 5e5, k: 'planta', n: 1 }; G.select(4); G.base.setMode('fund'); G.base.frame(); const t = G.base.B.tgt; return t && [t.i, t.j, t.bad]; });
    console.log('fantasma:', JSON.stringify(ghost)); ok(ghost && /outro jogador/.test(ghost[2] || ''), 'fantasma da fundação a 2 casas: vermelho e diz porquê');
    await A.ev(() => { G.base.setMode(null); G.select(0); });
    ok(!(await bp(402, 300)), 'servidor recusa fundação a 2 casas da base de outro');
    ok(!(await bp(403, 300)), 'servidor recusa fundação a 3 casas');
    ok(await bp(404, 300), 'aceita a 4 casas');
    // cercar: anel de fundações a 4 casas, falta uma
    const ring = []; for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) if (Math.max(Math.abs(a), Math.abs(b)) === 4) ring.push([400 + a, 300 + b]);
    let put = 0, fail = []; for (const [i, j] of ring) { if (i === 396 && j === 300) continue; if (i === 404 && j === 300) continue; if (await bp(i, j)) put++; else fail.push(i + ':' + j); }
    console.log('anel:', put, 'postas; falharam', fail.join(' '));
    ok(!(await bp(396, 300)), 'a última fundação que fechava a base é recusada');
    console.log('avisos:', [...new Set(toasts)].join(' | '));
    ok(toasts.some(t => /fechavas/.test(t)), 'diz que assim fechava a base de outro');
    // camas e objetos
    const bd = async (k, x, z) => { const id = await A.ev(([k, x, z]) => { G.p.x = x + 2; G.p.z = z; return G.base.deps.length; }, [k, x, z]); await W(250); await A.ev(([k, x, z]) => G.net.raw({ t: 'bd', k, x, z, yaw: 0, y: 0 }), [k, x, z]); await W(500); return A.ev(n0 => G.base.deps.length > n0, id); };
    ok(!(await bd('cama', 1200 - 5, 901.5)), 'cama a 5 m da base de outro: recusada');
    ok(await bd('cama', 1200 - 8.5, 901.5), 'cama a 8,5 m: aceite');
    await A.ev(() => G.net.adm('give', { k: 'saco', n: 10 })); await W(700);
    let ns = 0; for (let k = 0; k < 8; k++) if (await bd('saco', 1150 - k * 5, 960)) ns++;
    console.log('sacos fora da base postos:', ns, '(a cama de antes já conta 1)');
    ok(ns === 7, 'só dá 8 objetos fora da base (a cama + 7 sacos)');
    // fantasma do objeto
    const g2 = await A.ev(() => { const it = G.inv.bag.list.find(e => e.it.k === 'bau'); if (!it) return 'sem baú'; G.base.deploy(it.it); G.p.x = 1194; G.p.z = 901.5; G.base.pin({ x: 1197.5, z: 901.5 }); G.base.frame(); return G.base.placeOk ? JSON.stringify(G.base.placeOk()) : '?'; }); await W(400);
    const why = await A.ev(() => { G.base.frame(); return JSON.stringify(G.base.placeInfo()); });
    console.log('fantasma do baú:', g2, why);
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  if (gs) gs.kill(); await browser.close(); server.close(); console.log(fails ? 'FALHAS: ' + fails : 'TUDO OK'); process.exit(fails ? 1 : 0);
});
