// Todos os menus cabem no ecrã: em vários tamanhos (telemóveis deitados e de pé, tablets, computador), abre cada menu e procura
// botões, textos ou imagens cortados ou fora do ecrã que não se alcançam (nem com scroll nem com páginas)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, 'dist/web'), outDir = path.join(__dirname, 'shots');
const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); res.end(d); }); });
const VP = (process.env.KG_VP || '568x320,640x360,740x360,844x390,915x412,1024x600,1280x720,1920x1080,360x640,390x844,412x915,768x1024,1024x768').split(',').map(s => s.split('x').map(Number));
const W = ms => new Promise(r => setTimeout(r, ms));
server.listen(0, async () => {
  const port = server.address().port; let fails = 0; const rep = [];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('kg.perfis', JSON.stringify({ ativo: 'pa', lista: [{ id: 'pa', nome: 'Alexandrina', criado: 1 }] })); localStorage.setItem('kg.srv', 'ws://127.0.0.1:1/ws'); localStorage.setItem('kg.test', '1'); sessionStorage.setItem('kgIntro', '1'); } catch (e) { } });
  const page = await ctx.newPage(); page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.goto(`http://localhost:${port}/`); await page.waitForFunction('window.__ready === true || window.__failed', null, { timeout: 240000 });
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { G.paused = true; window.__fit = sel => { const R = document.querySelector(sel); if (!R || R.hidden) return ['(não abriu) ' + sel]; const vw = innerWidth, vh = innerHeight, bad = [];
    const vis = e => { for (let a = e; a; a = a.parentElement) { if (a.hidden) return false; const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; if (a === R) break; } return true; };
    for (const e of R.querySelectorAll('button, input, select, a, img, h2, h3, h4, label, p, b, em, .btn, canvas')) { if (!vis(e) || e.closest('.pgx') || e.closest('.lb-av') || e.id === 'lbChar') continue; const r = e.getBoundingClientRect(); if (r.width < 3 || r.height < 3) continue;
      let c = { l: 0, t: 0, r: vw, b: vh }, ok = false;
      for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) { const cs = getComputedStyle(a);
        const sy = /(auto|scroll)/.test(cs.overflowY) && a.scrollHeight > a.clientHeight + 1, sx = /(auto|scroll)/.test(cs.overflowX) && a.scrollWidth > a.clientWidth + 1;
        if (sy || sx) { const ar = a.getBoundingClientRect(); if (ar.bottom <= vh + 1 && ar.right <= vw + 1 && ar.top >= -1 && ar.left >= -1) { ok = true; break; } }
        if (cs.overflow !== 'visible' || cs.clipPath !== 'none') { const ar = a.getBoundingClientRect(); c = { l: Math.max(c.l, ar.left), t: Math.max(c.t, ar.top), r: Math.min(c.r, ar.right), b: Math.min(c.b, ar.bottom) }; } }
      if (ok) continue; const cut = Math.max(r.bottom - c.b, r.right - c.r, c.t - r.top, c.l - r.left);
      if (cut > 2) { const t = (e.textContent || e.getAttribute('aria-label') || e.alt || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 30); bad.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} «${t}» cortado ${Math.round(cut)}px`); } }
    return [...new Set(bad)].slice(0, 6); }; });
  const close = () => ev(() => { for (const id of ['pfm', 'news', 'modes', 'set', 'adm', 'lbw', 'trw', 'map', 'dead', 'gate']) { const e = document.getElementById(id); if (e) e.hidden = true; } G.ui.closeInv && G.ui.closeInv(); });
  const MENU = [
    ['lobby', () => { G.showMenu(); }, '#start'],
    ['modos', () => { G.showMenu(); document.getElementById('sGo').click(); }, '#modes'],
    ['novidades', () => { G.showMenu(); document.getElementById('sNews').click(); }, '#news'],
    ['aparência', () => { G.showMenu(); document.getElementById('sLook').click(); }, '#pfm'],
    ['perfis', () => { G.showMenu(); document.getElementById('sProf').click(); }, '#pfm'],
    ['conta', () => { G.showMenu(); document.getElementById('sAcc').click(); }, '#pfm'],
    ['perfil', () => { G.showMenu(); document.getElementById('prof').click(); }, '#pfm'],
    ['skins', () => { G.showMenu(); G.setLv(4); document.getElementById('sSkins').click(); }, '#pfm'],
    ['como se joga', () => { G.showMenu(); document.getElementById('sHow').click(); }, '#pfm'],
    ...['ctl', 'ecra', 'img', 'mais'].map(t => ['definições ' + t, new Function(`G.showMenu(); document.getElementById('sSet').click(); const b = document.querySelector('#setTabs [data-t="${t}"]'); b && b.click();`), '#set']),
    ['inventário', () => { G.ui.openInv(); }, '#inv', 1],
    ['fabrico', () => { G.ui.openInv(); document.querySelector('#inv [data-tab="craft"]').click(); }, '#inv', 1],
    ['treino', () => { G.ui.openInv(); document.querySelector('#inv [data-tab="skills"]').click(); }, '#inv', 1],
    ['mapa', () => { G.ui.toggleMap(true); }, '#map', 1],
    ['classificações', () => { document.getElementById('lbw').hidden = false; G.ui.lbShow({ pvp: [['Ana', 3, 1], ['Bruno', 1, 2]], z: [['Ana', 20]], clans: [], me: [3, 1, 20], name: 'Ana' }); }, '#lbw', 1],
    ['jogo (HUD)', () => { }, '#hud', 1],
    ['loja', () => { G.ui.trOpen(G.TR.TRADERS[0]); }, '#trw', 1],
    ['admin', () => { G.net.role = 'admin'; G.ui.admOpen(); }, '#adm', 1],
    ['morte', () => { G.ui.death({ cause: 'zombie', t: 300, kills: 3 }); }, '#dead', 1],
    ['entrada', () => { G.ui.toMenu(); document.getElementById('start').hidden = true; document.getElementById('gate').hidden = false; }, '#gate'],
    ['entrada form', () => { G.ui.toMenu(); document.getElementById('start').hidden = true; document.getElementById('gate').hidden = false; document.getElementById('gReg').click(); }, '#gate'],
  ];
  let inGame = false;
  for (const [w, h] of VP) {
    await page.setViewportSize({ width: w, height: h }); await W(700);
    for (const [name, fn, sel, game] of MENU) {
      if (game && !inGame) { await close(); await ev(() => { G.paused = false; G.dbgKit(); }); await W(2500); inGame = true; }
      if (!game && inGame) { await close(); await ev(() => G.ui.toMenu()); await W(800); inGame = false; }
      await close(); await W(150); try { await ev(fn); } catch (e) { rep.push(`${w}x${h} ${name}: erro ${String(e).slice(0, 80)}`); continue; } await W(name === 'skins' || name === 'perfil' ? 1200 : 450);
      const bad = await ev(s => window.__fit(s), sel);
      if (process.env.KG_ALL && new RegExp(process.env.KG_ALL).test(name)) await page.screenshot({ path: path.join(outDir, `fitall-${w}x${h}-${name.replace(/\W+/g, '_')}.png`) });
      if (bad.length) { fails++; rep.push(`${w}x${h} ${name}: ${bad.join(' · ')}`); if (process.env.KG_SHOT) await page.screenshot({ path: path.join(outDir, `fit-${w}x${h}-${name.replace(/\W+/g, '_')}.png`) }); }
    }
    console.log(`${w}x${h} feito`);
  }
  console.log(rep.join('\n')); console.log(fails ? fails + ' PROBLEMAS' : 'TUDO CABE');
  await browser.close(); server.close(); process.exit(0);
});
