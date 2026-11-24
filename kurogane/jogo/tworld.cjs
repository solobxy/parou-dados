// mundo novo: tempos, avisos, zonas preguiçosas e capturas de alguns sítios
module.exports = async (page, shot) => {
  const info = await page.evaluate(() => ({ build: G.W.buildMs, reg: G.W.regionMs, outer: G.W.outerMs, lazy: G.W.lazy.length, zones: G.W.zones.length, cont: G.W.containers.length, doors: G.W.doors.length, warn: G.W.regionWarn, wv: G.WV, roads: G.W.roads.length, bridges: (G.W.bridges || []).length }));
  console.log(JSON.stringify(info));
  const r = await page.evaluate(() => { const W = G.W, ms = []; let mx = 0, mk = null; for (const L of W.lazy) { const a = performance.now(); W.lazyBuild(L); const t = performance.now() - a; ms.push(t); if (t > mx) { mx = t; mk = [Math.round(L.x0), Math.round(L.z0)]; } }
    const v = W.lazy.reduce((s, L) => s + L.meshes.reduce((q, m) => q + m.geometry.attributes.position.count, 0), 0); for (const L of W.lazy) W.lazyDrop(L);
    return { bad: W.lazyBad || 0, total: Math.round(ms.reduce((a, b) => a + b, 0)), max: Math.round(mx), at: mk, verts: v, rects: W.rects.length, cont: W.containers.length }; });
  console.log(JSON.stringify(r));
};
