// percentagem do carregamento: regista o texto enquanto carrega e tira uma captura a meio
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, 'dist');
const server = http.createServer((req, res) => { const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(d); }); });
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
  const T0 = Date.now(); page.goto(`http://localhost:${port}/`); const seen = []; let shotDone = false;
  for (let i = 0; i < 2400; i++) { await page.waitForTimeout(50); const r = await page.evaluate(() => [document.getElementById('ldP') && document.getElementById('ldP').textContent, !!window.__ready]).catch(() => [null, false]);
    if (r[0] && seen[seen.length - 1] !== r[0]) { seen.push(r[0] + " @" + (Date.now() - T0) + "ms"); if (!shotDone && /^[3-7]\d%/.test(r[0])) { shotDone = true; await page.screenshot({ path: 'shots/load-meio.png' }); } }
    if (r[1]) break; }
  console.log(seen.join(' → ')); console.log(JSON.stringify(await page.evaluate(() => [window.__lp, Math.round(performance.now())]))); await browser.close(); server.close(); });
