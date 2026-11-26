// mira holográfica: o retículo no meio da janela da mira e no sítio para onde vão as balas
module.exports = async (page, shot) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1500); await ev(() => { for (const z of G.zs) z.x += 3000; }); await WG(1);
  if (!(await ev(() => !!G.fp))) { await ev(() => G.viewToggle()); await WG(0.8); }
  for (const sc of ['reddot', 'iron']) {
    await ev(sc => { G.inv.belt.fill(null); const it = G.mkItem('m4'); it.att = { scope: sc === 'iron' ? undefined : sc }; it.ammo = 30; G.inv.belt[0] = it; G.sel = 0; G.refresh(); if (G.aimS) G.aimS.fpit = 0; }, sc); await WG(1.2);
    await ev(() => { G.aimStart && G.aimStart(); }); await WG(0.4); await ev(() => G.scopeToggle()); await WG(1.0);
    console.log(sc, JSON.stringify(await ev(() => { const s = document.getElementById('scope'), cs = getComputedStyle(s); const d = G.vm.dbg(); return { cx: s.style.getPropertyValue('--cx'), cy: s.style.getPropertyValue('--cy'), W: innerWidth, H: innerHeight, cls: s.className, fov: G.cam ? G.cam.fov : null }; })));
    await shot('rd-' + sc); await ev(() => G.scopeToggle()); await WG(0.5);
  }
};
