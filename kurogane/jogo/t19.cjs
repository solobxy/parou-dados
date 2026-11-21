// beco entre dois prédios: ao olhar para dentro do beco, os prédios que o tapam saem; ao virar costas, voltam
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.evaluate(() => G.dbgKit()); await W(1200);
  const info = await ev(() => { for (const z of G.zs) { z.x = z.hx = 250; z.z = z.hz = 250; } const T = G.W.cuts.filter(c => !c.shell); let best = null;
    for (const A of T) for (const B of T) { const gap = B.x0 - A.x1; if (gap < 1.5 || gap > 6) continue; const zo = Math.min(A.z1, B.z1) - Math.max(A.z0, B.z0); if (zo < 6) continue; if (!best || gap < best.gap) best = { A, B, gap }; }
    if (!best) return null; const p = G.p, { A, B } = best; p.x = (A.x1 + B.x0) / 2; p.z = Math.min(A.z1, B.z1) + 1.2; p.y = 0.03; p.lv = 0; p.yaw = p.root = Math.PI; G.camT.set(p.x, 0, p.z); G.__AB = [A, B]; return [A.id, B.id, best.gap.toFixed(1), p.x.toFixed(1), p.z.toFixed(1)]; });
  console.log('beco', JSON.stringify(info)); if (!info) return;
  await W(2500); console.log('a olhar para o beco: visíveis', await ev(() => G.__AB.map(c => c.group.visible))); await shot('97-beco-olhar');
  console.log('antes', await ev(() => JSON.stringify([G.t, G.__AB.map(c => c.lookT)]))); await ev(() => { G.p.yaw = G.p.root = 0; }); await W(9000); console.log('de costas: visíveis', await ev(() => G.__AB.map(c => c.group.visible)), await ev(() => JSON.stringify({ yaw: G.p.yaw, t: G.t, lt: G.__AB.map(c => c.lookT), pts: (G.lookPts || []).length, B: [G.__AB[1].x0, G.__AB[1].z0, G.__AB[1].x1, G.__AB[1].z1, G.__AB[1].y0, G.__AB[1].y1], p: [G.p.x, G.p.z] }))); await shot('98-beco-costas');
};
