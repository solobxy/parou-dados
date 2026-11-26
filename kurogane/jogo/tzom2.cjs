const fs = require('fs');
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { G.cyc = 700; const p = G.p; p.x = -6; p.z = 3; G.camT.set(p.x, 0, p.z); for (const z of G.zs) z.x += 5000; const Z = G.zs.filter(z => !z.an).slice(0, 3); Z.forEach((z, i) => { z.x = p.x - 1.2 + i * 1.2; z.z = p.z + 4; z.y = 0; z.yaw = Math.PI; z.state = 'wander'; z.mv = 0; z.hp = 999; z.hide = false; }); window.__Z = Z; });
  await WG(1.5);
  const shot = async nm => { const url = await ev(() => { for (const z of window.__Z) { z.x = G.p.x - 1.2 + window.__Z.indexOf(z) * 1.2; z.z = G.p.z + 4; z.yaw = Math.PI; z.mv = 0; } const p = G.p; return G.dbgCam([p.x, 1.5, p.z + 1.3], [p.x, 1.1, p.z + 4], 42, 900, 600); }); fs.writeFileSync(`shots/z2-${nm}.jpg`, Buffer.from(url.split(',')[1], 'base64')); };
  await WG(1); await shot('com');
  console.log(await ev(() => { const L = G.horde.lods[0]; const m = L.m; const nm = m.normalMap; m.normalMap = null; m.needsUpdate = true; return [!!m.map, !!nm, m.map && m.map.image && m.map.image.width]; }));
  await WG(0.3); await shot('sem');
  await ev(() => { for (const L of G.horde.lods) { L.m.map.flipY = false; L.m.map.needsUpdate = true; L.m.needsUpdate = true; } }); await WG(0.3); await shot('flip');
};
