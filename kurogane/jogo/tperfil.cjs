// Perfil: nível ganho online e amigos (pedido, aceitar, remover), no jogo e no menu (ligação curta)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-pf'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3191', STATE_DIRECTORY: ST, KG_TEST: '1' }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const mk = async (nome, id) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3191/ws'); localStorage.setItem('kg.test', '1'); } catch (e) { } }, [nome, id]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 600)); });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    // antes de jogar online: sem código, o perfil diz que ainda não jogou
    const n0 = await A.ev(() => G.net.pf()); ok(n0.none, 'sem jogar online: perfil vazio');
    for (const P of [A, B]) await P.ev(() => G.dbgKit()); await W(3000);
    const spot = await A.ev(() => [G.p.x, G.p.z]); await A.ev(() => G.net.start()); await B.ev(s => { G.p.x = s[0] + 5; G.p.z = s[1]; G.net.start(); }, spot); await W(4000);
    ok(await A.ev(() => G.net.on) && await B.ev(() => G.net.on), 'os dois ligados');
    await A.ev(() => G.net.raw({ t: 'txp', g: 130 })); for (let i = 0; i < 20 && !(await A.ev(() => G.net.xp && G.net.xp.g)); i++) await W(300);
    const xa = await A.ev(() => G.net.xp); ok(xa && xa.lv === 2 && xa.at === 30 && xa.up, 'Ana ganha 130 XP e sobe ao nível 2 (' + JSON.stringify(xa) + ')');
    ok(await A.ev(() => { const e = document.getElementById('xpF'); return !!e && /\+130 XP/.test(e.textContent); }), 'aparece «+130 XP» no ecrã');
    await A.page.screenshot({ path: path.join(outDir, 'pf-xp.png') });
    // skins: o Bruno vê a skin da Ana se o nível dela a abriu (Floresta, nível 2); a Tigre (nível 10) o servidor tira
    await A.ev(() => { const it = G.inv.belt[0]; it.k = 'ak'; it.att = {}; G.select(1); G.select(0); G.setSkin('ak', 1); });
    let wB = ''; for (let i = 0; i < 25 && !/~/.test(wB); i++) { await W(300); wB = await B.ev(() => { const r = [...G.net.R.values()].find(q => q.name === 'Ana'); return r ? String(r.w) : ''; }); }
    ok(wB === 'ak~1', 'Bruno vê a AK da Ana com a skin Floresta (' + wB + ')');
    await A.ev(() => { G.setLv(10); G.setSkin('ak', 5); }); await W(2500);
    wB = await B.ev(() => { const r = [...G.net.R.values()].find(q => q.name === 'Ana'); return r ? String(r.w) : ''; }); ok(wB === 'ak', 'Tigre sem o nível no servidor: o Bruno vê a AK normal (' + wB + ')');
    await A.ev(() => { G.setLv(2); G.setSkin('ak', 0); });
    let r = await A.ev(() => G.net.pf({ a: 'add', n: 'ninguem' })); ok(r.e && /Não há/.test(r.e), 'nome que não existe: aviso');
    await W(500); r = await A.ev(() => G.net.pf({ a: 'add', n: 'bruno' })); ok(r.ok && r.out.length === 1, 'pedido enviado ao Bruno: ' + r.ok);
    await W(600);
    await W(800); const toastB = await B.ev(() => document.getElementById('toast').textContent.includes('Ana quer ser teu amigo')); ok(toastB, 'Bruno recebe aviso no jogo');
    r = await B.ev(() => G.net.pf()); ok(r.rq.length === 1 && r.rq[0][1] === 'Ana' && r.rq[0][2] === 2, 'Bruno vê o pedido da Ana (nível 2)');
    await W(500); r = await B.ev(u => G.net.pf({ a: 'ok', u }), r.rq[0][0]); ok(r.f.length === 1 && r.f[0][3] === 1, 'Bruno aceita: são amigos e a Ana aparece online');
    // menu (ligação curta): Ana sai do jogo e abre o perfil
    await A.ev(() => G.net.stop()); await W(1500);
    r = await A.ev(() => G.net.pf()); ok(r.me && r.me.lv === 2 && r.f.length === 1 && r.f[0][1] === 'Bruno', 'no menu, pela ligação curta: nível 2 e amigo Bruno');
    await A.ev(() => G.ui_perfil()); await W(1500);
    const pan = await A.ev(() => document.getElementById('pfB').innerText); ok(/Nível 2/.test(pan) && /Bruno/.test(pan), 'painel do perfil mostra nível e amigo');
    await A.page.screenshot({ path: path.join(outDir, 'pf-painel.png') }); await A.page.setViewportSize({ width: 390, height: 844 }); await W(800); await A.page.screenshot({ path: path.join(outDir, 'pf-painel-v.png') }); await A.page.setViewportSize({ width: 844, height: 390 }); await W(500);
    // remover (pede confirmação)
    await A.ev(() => document.querySelector('.fr-b[data-a="del"]').click()); await W(200);
    ok(await A.ev(() => document.querySelector('.fr-b[data-a="del"]').textContent === 'Tens a certeza?'), 'remover pede confirmação');
    await A.ev(() => document.querySelector('.fr-b[data-a="del"]').click()); for (let i = 0; i < 20 && (await A.ev(() => !!document.querySelector('.fr-b[data-a="del"]'))); i++) await W(300);
    r = await B.ev(() => G.net.pf()); ok(r.f.length === 0, 'removido dos dois lados');
    // código falso não serve
    const bad = await A.ev(() => new Promise(res => { const w = new WebSocket('ws://127.0.0.1:3191/ws'); w.onopen = () => w.send(JSON.stringify({ t: 'pf', tok: 'x'.repeat(32), a: 'add', n: 'Bruno' })); w.onmessage = e => { res(JSON.parse(e.data)); w.close(); }; }));
    ok(bad.none, 'código inventado: não faz nada');
    ok(!A.errs.length && !B.errs.length, 'sem erros na página');
  } catch (e) { console.log('ERRO', e); fails++; }
  console.log(fails ? fails + ' FALHAS' : 'TUDO OK'); await browser.close(); server.close(); gs.kill(); process.exit(fails ? 1 : 0);
});
