module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await WG(1.5);
  await ev(() => { for (const z of G.zs) z.x += 3000; G.inv.belt.fill(null); G.sel = 0; G.refresh(); }); await WG(0.5);
  await ev(() => G.viewToggle()); await WG(0.8);
  for (const w of ['m4']) {
    await ev(w => { const g = G.mkItem(w); g.att = {}; G.inv.belt[1] = g; G.sel = -1; G.select(1); G.refresh(); }, w); await WG(0.8);
    for (const f of [0.6, 0.62, 0.64]) { await ev(f => { G.vmDbg = f < 0 ? null : { rp: f }; }, f); await WG(0.12);
      console.log(w, f, JSON.stringify(await ev(() => { const d = G.vm.dbg(); return { last: d.arms.last, rig: d.rig.position.toArray().map(x => +x.toFixed(3)) }; }))); }
  }
};
