// Anti-batota: o servidor sabe o que cada um tem (o que apanhou, abriu, fez, largou) e corrige o resto
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
  const mk = async (nome, id, tok, test = true) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id, tok, test]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3191/ws'); if (test) localStorage.setItem('kg.test', '1'); if (tok) localStorage.setItem('kg.tok.' + id, tok); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id, tok, test]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 600)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  try {
    const A = await mk('Ana', 'pa');
    await A.ev(() => G.dbgKit()); await W(2500);
    const spot = await A.ev(() => [G.p.x, G.p.z]);
    await A.ev(() => G.net.start()); await W(5000);
    const cnt = (P, k) => P.ev(k => G.inv.count(k), k);
    // 1) coisas inventadas no cliente: o servidor tira-as
    const a0 = await cnt(A, 'a556'), m0 = await cnt(A, 'm4');
    await A.ev(() => { G.inv.give(G.dbg.item('a556', 60)); G.inv.give(G.dbg.item('m4', 1)); }); await W(7000);
    const a1 = await cnt(A, 'a556'), m1 = await cnt(A, 'm4');
    console.log('balas 5,56 antes/depois de inventar:', a0, a1, '· M4:', m0, m1); ok(a1 === a0 && m1 === m0, 'o que foi inventado no cliente desaparece');
    // 2) apanhar madeira de uma árvore a sério fica; madeira do nada sai
    const tree = await A.ev(() => { const p = G.p; let best = null, bd = 1e9; for (const n of G.dbg.nodes()) { if (n.kind !== 'tree' || !n.alive || !n.key) continue; const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { bd = d; best = n; } } if (!best) return null; p.x = best.x + 1; p.z = best.z; return [best.key, +bd.toFixed(1)]; });
    console.log('árvore:', JSON.stringify(tree)); await W(1500);
    const w0 = await cnt(A, 'madeira');
    await A.ev(k => { G.gain('madeira', 12, k); }, tree && tree[0]); await W(7000);
    const w1 = await cnt(A, 'madeira'); ok(tree && w1 === w0 + 12, `madeira apanhada numa árvore fica (${w0} → ${w1})`);
    await A.ev(() => { G.gain('madeira', 40); }); await W(10000);
    const w2 = await cnt(A, 'madeira'); ok(w2 === w1, `madeira sem árvore é tirada (${w1} → ${w2})`);
    // 3) tirar de uma caixa do mundo fica (o servidor gerou o que lá estava)
    const box = await A.ev(async () => { const sl = ms => new Promise(r => setTimeout(r, ms)); const p = G.p; let best = null, bd = 1e9; for (const c of G.W.containers) { if (c.wid == null || (c.lv || 0) !== 0) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } } if (!best) return null; p.x = best.x + 0.6; p.z = best.z + 0.6; await sl(1500); G.prompt = best; G.interact(); await sl(2500); if (!G.box || !G.box.grid) return 'não abriu'; const e = G.box.grid.list[0]; if (!e) { G.ui.closeInv(); return 'vazia'; } const it = e.it; G.box.grid.remove(it); const left = G.inv.give(it); G.ui.refresh(true); await sl(800); G.ui.closeInv(); return { k: it.k, n: it.n, left }; });
    console.log('caixa:', JSON.stringify(box)); await W(7000);
    if (box && box.k) { const have = await cnt(A, box.k); ok(have >= 1, `o que tirou da caixa ficou (${box.k} ×${have})`); } else ok(false, 'não encontrou uma caixa com coisas: ' + JSON.stringify(box));
    // 4) largar uma mochila com coisas que não tem: recusado
    const nb0 = await A.ev(() => G.bags.length);
    await A.ev(() => G.net.bag(G.p.x + 1, G.p.z, G.p.y || 0, 0, [{ k: 'c4', n: 1, x: 0, y: 0 }])); await W(2500);
    const nb1 = await A.ev(() => G.bags.length); ok(nb1 === nb0, 'não larga uma mochila com C4 que não tem');
    // 5) um jogador novo (sem modo de teste): começa sem correções, não se teletransporta e não dispara sem arma
    const C = await mk('Carla', 'pc', null, false); await C.ev(() => document.getElementById('sPlay').click()); await W(3000);
    const c0 = await C.ev(() => { const it = G.inv.all().map(o => o.k + 'x' + (o.n || 1)); return it; });
    await C.ev(() => G.net.start()); await W(9000);
    const c1 = await C.ev(() => G.inv.all().map(o => o.k + 'x' + (o.n || 1)));
    console.log('Carla ao entrar:', JSON.stringify(c0), '→', JSON.stringify(c1)); ok(c1.length >= 1 && JSON.stringify(c0.sort()) === JSON.stringify(c1.sort()), 'jogador novo começa com o que tem, sem correções');
    const p0 = await C.ev(() => [G.p.x, G.p.z]);
    await C.ev(() => { G.p.x += 150; }); await W(4000);
    const p1 = await C.ev(() => [G.p.x, G.p.z]); const back = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    console.log('Carla teletransportou-se 150 m; ficou a', back.toFixed(1), 'm de onde estava'); ok(back < 20, 'teletransporte desfeito pelo servidor');
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; }, p1); await W(3000);
    const hA0 = await A.ev(() => G.p.hp);
    await C.ev(() => { const A = [...G.net.R.values()][0]; if (!A) return 'não vê'; for (let i = 0; i < 3; i++) G.net.raw({ t: 'shot', o: [G.p.x, 1.35, G.p.z], d: [A.x - G.p.x, 0, A.z - G.p.z], k: 'a9', n: 1, L: 50 }); return 'disparou'; }); await W(2500);
    const hA1 = await A.ev(() => G.p.hp); ok(hA1 >= hA0, `tiros sem arma não magoam (vida da Ana ${Math.round(hA0)} → ${Math.round(hA1)})`);
    console.log('erros A:', A.errs.length, 'C:', C.errs.length);
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill();
});
