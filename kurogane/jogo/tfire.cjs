// fogo realista: fogueira de noite e de dia (vista do jogo e de perto), fornalha acesa (boca e fumo da chaminé)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const fs = require('fs'), cam = async (nm, pos, at, fov) => { const u = await ev(([p, a, f]) => G.dbgCam(p, a, f, 640, 480), [pos, at, fov]); fs.writeFileSync(__dirname + '/shots/' + nm + '.jpg', Buffer.from(u.split(',')[1], 'base64')); };
  await ev(() => G.dbgKit()); await W(1500);
  const spot = await ev(() => { const W0 = G.W; for (let k = 0; k < 4000; k++) { const x = -420 + Math.random() * 840, z = -420 + Math.random() * 840; if (W0.paved(x, z) || W0.trees.some(t => Math.hypot(t.x - x, t.z - z) < 7) || W0.zones.some(zn => Math.hypot(x - zn.x, z - zn.z) < zn.r + 30) || W0.circles.some(c => Math.hypot(c.x - x, c.z - z) < 5)) continue; return [x, z]; } return null; });
  await ev(s => { G.p.x = s[0]; G.p.z = s[1]; G.p.yaw = G.p.root = Math.PI / 2; for (const z of G.zs) { z.x += 900; z.z += 900; z.hx = z.x; z.hz = z.z; } G.spawnT = 1e9; const it = G.mkItem('fogueira'); G.inv.bag.insert(it, G.inv.rows()); G.base.deploy(it); }, spot);
  await WG(0.4); await ev(() => G.base.pin({ x: G.p.x + 2.2, z: G.p.z })); await WG(0.4); await ev(() => G.fireDown()); await WG(0.5);
  console.log('acesa:', await ev(() => { const c = G.W.containers.find(q => q.dep && q.dep.k === 'fogueira'); if (!c) return null; c.grid.insert(G.mkItem('madeira', 30)); G.box = c; G.base.toggleFurnace(c); G.box = null; window.__c = [c.x, c.z]; return c.dep.on; }));
  await ev(() => { G.cyc = 1710; document.getElementById('toast').hidden = true; }); await WG(1.5);
  await shot('fogo-noite');
  const c = await ev(() => window.__c);
  await cam('fogo-perto-noite', [c[0] + 1.6, 1.3, c[1] + 1.6], [c[0], 0.35, c[1]], 50);
  await cam('fogo-cima-noite', [c[0] + 0.5, 6, c[1] + 2.5], [c[0], 0.2, c[1]], 40);
  await ev(() => { G.cyc = 700; }); await WG(1.2); await shot('fogo-dia'); await cam('fogo-perto-dia', [c[0] + 1.6, 1.3, c[1] + 1.6], [c[0], 0.35, c[1]], 50);
  console.log('erros:', errs.length ? errs : 'nenhum');
};
