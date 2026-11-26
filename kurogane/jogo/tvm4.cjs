module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await WG(1.5);
  await ev(() => { for (const z of G.zs) z.x += 3000; G.inv.belt.fill(null); G.sel = 0; G.refresh(); }); await WG(0.5);
  await ev(() => G.viewToggle()); await WG(0.8);
  const views = JSON.parse(process.env.PV);
  let i = 0; for (const v of views) { await ev(v => { G.vm.dbg().D.place = v; }, v); await WG(0.15); await shot('pl' + (i++)); }
};
