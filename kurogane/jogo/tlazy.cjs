// zonas preguiçosas: ir a cada uma, construir, ver que bate certo com as colisões e largar
module.exports = async (page, shot) => {
  await page.evaluate(() => G.start && G.start());
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => { const W = G.W, out = []; let t0 = performance.now();
    for (const L of W.lazy) { const a = performance.now(); W.lazyBuild(L); out.push(Math.round(performance.now() - a)); }
    const v = W.lazy.reduce((s, L) => s + L.meshes.reduce((q, m) => q + m.geometry.attributes.position.count, 0), 0);
    const rects = W.rects.length, cont = W.containers.length;
    for (const L of W.lazy) W.lazyDrop(L);
    return { n: W.lazy.length, bad: W.lazyBad || 0, ms: out, verts: v, rects, cont, rects2: W.rects.length, cont2: W.containers.length, inScene: G.scene ? G.scene.children.length : -1 }; });
  console.log(JSON.stringify(r));
};
