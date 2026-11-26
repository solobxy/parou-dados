module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await WG(1.5);
  await ev(() => { for (const z of G.zs) z.x += 3000; G.inv.belt.fill(null); G.sel = 0; G.refresh(); }); await WG(0.5);
  await ev(() => G.viewToggle()); await WG(0.8);
  await ev(() => { const g = G.mkItem('m4'); g.att = {}; G.inv.belt[1] = g; G.select(1); G.refresh(); }); await WG(0.8);
  const r = await ev(() => { const d = G.vm.dbg(); d.piv.visible = false; const A = d.arms; return { grip: A.grip.map(v => v.toArray().map(x => +x.toFixed(3))), n: A.mesh.geometry.index.count, hasMask: A.uni.uHasMask.value, top: A.uni.uTop.value.toArray() }; });
  console.log(JSON.stringify(r));
  await shot('vm2-nogun');
};
