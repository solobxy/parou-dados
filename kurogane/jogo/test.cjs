// Testa o jogo num Chrome sem ecrã: node test.cjs <cenario.cjs> [mobile|desktop]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const scen = require(path.resolve(process.argv[2]));
const mode = process.argv[3] || 'mobile';
const root = path.join(__dirname, 'dist'), outDir = path.join(__dirname, 'shots'); fs.mkdirSync(outDir, { recursive: true });
const server = http.createServer((req, res) => { const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.mp3') ? 'audio/mpeg' : 'application/octet-stream' }); res.end(d); }); });
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const VP = { mobile: [844, 390, 1, 2], portrait: [390, 844, 1, 2], small: [360, 640, 1, 2], tablet: [820, 1180, 1, 2], tabletL: [1180, 820, 1, 2], desktop: [1280, 720, 0, 1], wide: [1920, 1080, 0, 1], tall: [800, 1000, 0, 1], tiny: [320, 568, 1, 2], shortL: [640, 300, 1, 2], andL: [800, 360, 1, 2] }[mode] || [1280, 720, 0, 1];
  const ctx = await browser.newContext({ viewport: { width: VP[0], height: VP[1] }, deviceScaleFactor: VP[3], isMobile: !!VP[2], hasTouch: !!VP[2] });
  if (process.env.KG_NOWEAR) await ctx.addInitScript(() => { window.__noWear = 1; });
  if (process.env.KG_ARENA) await ctx.addInitScript(() => { try { sessionStorage.setItem('kgArena', '1'); } catch (e) { } });
  if (!process.env.NOPROF) await ctx.addInitScript(() => { try { if (!localStorage.getItem('kg.perfis')) localStorage.setItem('kg.perfis', JSON.stringify({ ativo: 'pt', lista: [{ id: 'pt', nome: 'Teste', criado: 1 }] })); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { const t = m.text(); if (/GPU stall|Automatic fallback|GroupMarkerNotSet|swiftshader|WebGL/.test(t)) return; if (m.type() === 'error' || m.type() === 'warning') errs.push(t); console.log('[' + m.type() + ']', t.slice(0, 400)); });
  page.on('pageerror', e => { errs.push(String(e)); console.log('[pageerror]', String(e.stack || e).slice(0, 900)); });
  const shot = async (name) => { await page.screenshot({ path: path.join(outDir, `${mode}-${name}.png`) }); console.log('shot', name); };
  try {
    await page.goto(`http://localhost:${port}/`);
    await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
    const f = await page.evaluate('window.__failed || null'); if (f) throw new Error('boot: ' + f);
    await scen(page, shot, mode);
  } catch (e) { console.log('ERRO', e.stack || e); }
  console.log('errors:', errs.length); errs.slice(0, 10).forEach(e => console.log('  ', e.slice(0, 300)));
  await browser.close(); server.close();
});
