// Mundo partilhado (parte 2): os mesmos zombies para os dois jogadores
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots');
const ST = '/tmp/kgsrv-test3'; fs.rmSync(ST, { recursive: true, force: true });
const gs = spawn('node', [process.env.KG_SERVER || path.join(__dirname, '../server.mjs')], { env: { ...process.env, PORT: '3191', STATE_DIRECTORY: ST }, stdio: 'inherit' });
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); });
const W = ms => new Promise(r => setTimeout(r, ms));
const saude = () => new Promise(r => http.get('http://127.0.0.1:3191/saude', res => { let b = ''; res.on('data', d => b += d); res.on('end', () => r(JSON.parse(b))); }));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (nome, id) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([nome, id]) => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: id, lista: [{ id, nome, criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:3191/ws'); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } }, [nome, id]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { errs.push(String(e)); console.log('[' + nome + ' pageerror]', String(e.stack || e).slice(0, 700)); });
    page.on('console', m => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader|CORS|ERR_FAILED|404/.test(m.text())) { errs.push(m.text()); console.log('[' + nome + ']', m.text().slice(0, 300)); } });
    await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    return { page, ctx, errs, ev: (f, a) => page.evaluate(f, a) };
  };
  try {
    const A = await mk('Ana', 'pa'), B = await mk('Bruno', 'pb');
    for (const P of [A, B]) await P.page.click('#sKit');
    await W(3000);
    // os dois na vila Kitamura (com zombies)
    const spot = [-170, 12];
    await A.ev(s => { G.p.x = s[0]; G.p.z = s[1]; G.net.start(); }, spot); await W(2500);
    const h1 = await saude(); console.log('servidor:', JSON.stringify(h1)); ok(h1.zombies > 500, 'a Ana espalhou ' + h1.zombies + ' zombies no mundo novo');
    await B.ev(s => { G.p.x = s[0] + 5; G.p.z = s[1]; G.net.start(); }, spot); await W(4000);
    const snap = P => P.ev(() => { const o = {}; for (const z of G.zs) if (z.nid != null && Math.hypot(z.x - G.p.x, z.z - G.p.z) < 45) o[z.nid] = [+z.x.toFixed(1), +z.z.toFixed(1), z.state, z.remote ? 'r' : 'meu']; return o; });
    const [sa, sb] = [await snap(A), await snap(B)];
    const ids = Object.keys(sa).filter(k => sb[k]); let far = 0, mine = 0; for (const k of ids) { if (Math.hypot(sa[k][0] - sb[k][0], sa[k][1] - sb[k][1]) > 2.5) far++; if ((sa[k][3] === 'meu') === (sb[k][3] === 'meu')) mine++; }
    console.log('zombies a menos de 45 m: Ana', Object.keys(sa).length, '· Bruno', Object.keys(sb).length, '· em comum', ids.length, '· com posição diferente (>2,5 m)', far, '· simulados pelos dois ou por nenhum', mine);
    ok(ids.length >= 5 && ids.length >= Object.keys(sa).length - 3, 'os dois veem os mesmos zombies');
    ok(far <= 1, 'nos mesmos sítios (diferença até 2,5 m)');
    ok(mine === 0, 'cada zombie é simulado por um só jogador');
    // o Bruno mata com um tiro na cabeça um zombie que a Ana simula
    const kid = await B.ev(() => { const z = G.zs.find(z => z.remote && z.state !== 'dead' && Math.hypot(z.x - G.p.x, z.z - G.p.z) < 45); if (!z) return null; G.dbg.hitZ(z, 'head', 'a9'); return [z.nid, z.state]; });
    await W(1500);
    const ka = await A.ev(i => { const z = G.zs.find(q => q.nid === i); return z ? z.state : 'não está'; }, kid && kid[0]);
    const kb = await B.ev(() => G.p.kills);
    console.log('zombie', JSON.stringify(kid), '· para a Ana:', ka, '· mortes do Bruno:', kb); ok(kid && ka === 'dead' && kb === 1, 'o Bruno matou um zombie da Ana: morto para os dois e conta para o Bruno');
    // um zombie que a Ana simula ataca o Bruno (que está mais perto dele)
    const tz = await A.ev(() => { const z = G.zs.find(z => !z.remote && z.state !== 'dead' && z.nid != null && Math.hypot(z.x - G.p.x, z.z - G.p.z) < 30); if (!z) return null; return [z.nid, z.x, z.z]; });
    if (tz) { await A.ev(t => { G.p.x = t[1] + 14; G.p.z = t[2]; }, tz); await B.ev(t => { G.p.x = t[1] + 0.9; G.p.z = t[2]; G.p.hp = 100; }, tz); await W(9000);
      const r = await Promise.all([A.ev(i => { const z = G.zs.find(q => q.nid === i); return z ? [z.remote ? 'r' : 'meu', z.state] : null; }, tz[0]), B.ev(() => [Math.round(G.p.hp), G.p.alive])]);
      console.log('zombie', tz[0], 'na Ana:', JSON.stringify(r[0]), '· vida do Bruno:', JSON.stringify(r[1])); ok(r[1][0] < 100, 'o zombie simulado pela Ana magoou o Bruno'); }
    else ok(false, 'não havia zombie da Ana perto');
    await A.page.screenshot({ path: path.join(outDir, 'net-zombies-A.png') }); await B.page.screenshot({ path: path.join(outDir, 'net-zombies-B.png') });
    const h2 = await saude(); console.log('servidor:', JSON.stringify(h2));
    console.log('erros A:', A.errs.length, 'B:', B.errs.length);
  } catch (e) { console.log('ERRO', e.stack || e); fails++; }
  console.log(fails ? fails + ' falhas' : 'tudo bem');
  await browser.close(); server.close(); gs.kill();
});
