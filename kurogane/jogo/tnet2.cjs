// Mundo partilhado (parte 1): tempo, chuva, portas, árvores, caixas e sacos iguais para os dois jogadores
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-test2'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3191', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (nome, id) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3191/ws'); localStorage.setItem('kg.test', '1'); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 700)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader|CORS|ERR_FAILED|404/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    for (const P of [A, B]) await P.ev(() => G.dbgKit());
    await W(3000);
    const spot = await A.ev(() => [G.p.x, G.p.z]);
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; G.net.start(); }, spot); await W(1500);
    await B.ev(s => { G.p.x = s[0] + 4; G.p.z = s[1]; G.net.start(); }, spot); await W(3000);
    const t = await Promise.all([A, B].map(P => P.ev(() => [G.cyc, G.rainT, G.net.world])));
    console.log('tempo e chuva:', JSON.stringify(t)); ok(t[0][2] && t[1][2] && Math.abs(t[0][0] - t[1][0]) < 3 && t[0][1] === t[1][1], 'a hora do dia e a chuva são iguais nos dois');
    // porta: a Ana abre a porta mais perto; o Bruno vê-a aberta
    const door = await A.ev(() => { let best = null, bd = 1e9; for (const D of G.W.doors) { if (D.wid == null || D.lock || D.lv) continue; const d = Math.hypot(D.x - G.p.x, D.z - G.p.z); if (d < bd) { bd = d; best = D; } } best.target ? null : null; const was = best.target; G.p.x = best.x + 1; G.p.z = best.z + 1; G.prompt = { door: best, label: '' }; G.interact(); return [best.wid, was, best.target, Math.round(bd)]; });
    await W(1200);
    const bd = await B.ev(i => { const D = G.W.doors.find(d => d.wid === i); return D.target; }, door[0]);
    console.log('porta', door[0], 'a', door[3], 'm: Ana', door[1], '→', door[2], '· Bruno vê', bd); ok(bd === door[2] && door[1] !== door[2], 'a porta que a Ana abriu está aberta para o Bruno');
    // árvore: a Ana acaba uma árvore; desaparece para o Bruno
    const nk = await A.ev(s => { let best = null, bd = 1e9; for (const n of G.dbg.nodes()) { if (!n.alive || !n.key) continue; const d = Math.hypot(n.x - s[0], n.z - s[1]); if (d < bd) { bd = d; best = n; } } G.dbg.deplete(best); return best.key; }, spot);
    await W(1200);
    const nb = await B.ev(k => { const n = G.dbg.nodes().find(q => q.key === k); return n ? n.alive : 'sem'; }, nk);
    ok(nb === false, 'a árvore/rocha ' + nk + ' que a Ana partiu desapareceu para o Bruno');
    // caixa: a Ana abre a caixa mais perto e tira uma coisa; o Bruno não consegue abrir ao mesmo tempo; depois vê o que ficou
    const box = await A.ev(() => { let best = null, bd = 1e9; for (const c of G.W.containers) { if (c.wid == null || c.own) continue; const d = Math.hypot(c.x - G.p.x, c.z - G.p.z); if (d < bd) { bd = d; best = c; } } G.p.x = best.x + 0.6; G.p.z = best.z; G.p.lv = best.lv || 0; G.prompt = best; G.interact(); return [best.wid, Math.round(bd), best.label]; });
    await W(1500);
    const a1 = await A.ev(() => { const c = G.box; if (!c || !c.grid) return null; const L = c.grid.list.map(e => e.it.k + 'x' + e.it.n); const e = c.grid.list[0]; if (e) { c.grid.remove(e.it); G.inv.give(e.it); } G.ui.refresh(true); return L; });
    console.log('caixa', box[0], '(' + box[2] + ', a ' + box[1] + ' m) para a Ana:', JSON.stringify(a1)); ok(a1 && a1.length > 0, 'a Ana abriu a caixa com loot');
    await B.ev(w => { const c = G.W.containers.find(q => q.wid === w); G.p.x = c.x - 0.6; G.p.z = c.z; G.p.lv = c.lv || 0; G.prompt = c; G.interact(); }, box[0]); await W(1200);
    const busy = await B.ev(() => [!!G.box, document.getElementById('toast').textContent]); console.log('Bruno ao mesmo tempo:', JSON.stringify(busy)); ok(!busy[0] && /Ana está a revistar/.test(busy[1]), 'o Bruno não abre enquanto a Ana está a revistar');
    await A.ev(() => G.ui.closeInv()); await W(1200);
    await B.ev(w => { const c = G.W.containers.find(q => q.wid === w); G.prompt = c; G.interact(); }, box[0]); await W(1500);
    const b1 = await B.ev(() => G.box && G.box.grid ? G.box.grid.list.map(e => e.it.k + 'x' + e.it.n) : null);
    console.log('a mesma caixa para o Bruno:', JSON.stringify(b1)); ok(b1 && JSON.stringify(b1.slice().sort()) === JSON.stringify(a1.slice(1).sort()), 'o Bruno vê o mesmo que ficou na caixa (sem o que a Ana tirou)');
    await B.ev(() => G.ui.closeInv()); await W(600);
    // saco: a Ana larga uma coisa; o Bruno vê o saco, abre e leva tudo; o saco desaparece para os dois
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; G.p.lv = 0; }, spot); await W(900); // o servidor tem de saber que chegaste antes de largares
    await A.ev(s => { const it = G.inv.belt.find(Boolean); const w = G.inv.where(it); if (w.t === 'belt') G.inv.belt[w.i] = null; G.dropItem(it); }, spot); await W(1500);
    const sb = await B.ev(() => G.bags.map(b => b.label + '@' + b.x.toFixed(1)));
    console.log('sacos que o Bruno vê:', JSON.stringify(sb)); ok(sb.length === 1, 'o saco que a Ana largou aparece ao Bruno');
    await B.ev(() => { const b = G.bags[0]; G.p.x = b.x + 0.6; G.p.z = b.z; G.p.lv = 0; }); await W(600); await B.ev(() => { const b = G.bags[0]; G.prompt = b; G.interact(); }); await W(1500);
    const tk = await B.ev(() => { if (!G.box || !G.box.grid) return null; const n = G.box.grid.list.length; document.getElementById('takeAll').click(); return [n, G.box.grid.list.length]; });
    await B.ev(() => G.ui.closeInv()); await W(1500);
    const left = await Promise.all([A, B].map(P => P.ev(() => G.bags.length)));
    console.log('saco: tinha', tk && tk[0], '· depois de levar tudo', tk && tk[1], '· sacos agora (Ana, Bruno):', left.join(', ')); ok(tk && tk[0] > 0 && tk[1] === 0 && left[0] === 0 && left[1] === 0, 'o Bruno levou tudo e o saco desapareceu para os dois');
    // zombie morto: o saco de loot (se calhar) também é partilhado — testado na parte 2
    console.log('erros A:', A.errs.length, 'B:', B.errs.length);
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill();
});
