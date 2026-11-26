module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await WG(1.5);
  await ev(() => { for (const z of G.zs) z.x += 3000; G.inv.belt.fill(null); G.sel = 0; G.refresh(); }); await WG(0.5);
  await ev(() => G.viewToggle()); await WG(0.8);
  await ev(() => { const st = document.createElement('style'); st.textContent = 'body *:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}'; document.head.appendChild(st); });
  await ev(() => { const g = G.mkItem('m4'); g.att = {}; G.inv.belt[1] = g; G.select(1); G.refresh(); }); await WG(0.8);
  for (const sd of [0, 1]) { await ev(sd => { G.vmDbg = { rp: 0.62 }; const d = G.vm.dbg(); d.D.only = sd; }, sd); await WG(0.15); await shot('only' + sd); }
};
