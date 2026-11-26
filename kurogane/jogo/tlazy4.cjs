module.exports = async (page, shot) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  const r = await ev(() => { const zn = G.W.zones.find(z => z.kind === 'town' && Math.hypot(z.x, z.z) > 500); G.p.x = zn.x + 4; G.p.z = zn.z + 4; G.camT.set(G.p.x, 0, G.p.z); const W0 = G.W; let n = 0; for (const L of W0.lazy) { const d = Math.max(L.x0 - G.p.x, G.p.x - L.x1, L.z0 - G.p.z, G.p.z - L.z1, 0); if (d < 120 && !L.meshes) { W0.lazyBuild(L, true); while (L.job) W0.lazyStep(performance.now() + 4); n++; } } return [zn.name, n]; });
  console.log('zona', JSON.stringify(r)); await W(4000); await shot('vila-sliced'); };
