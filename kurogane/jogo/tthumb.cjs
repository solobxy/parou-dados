// polegares: a mão direita tem o polegar do lado esquerdo e a esquerda do lado direito (vistas por trás)
module.exports = async (page, shot) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1500); await ev(() => { for (const z of G.zs) z.x += 3000; }); await WG(1);
  if (!(await ev(() => !!G.fp))) { await ev(() => G.viewToggle()); await WG(0.8); }
  for (const k of ['smg', 'm4', 'pistola']) { await ev(k => { G.inv.belt.fill(null); G.inv.belt[0] = G.mkItem(k); G.sel = 0; G.refresh(); if (G.aimS) G.aimS.fpit = 0; }, k); await WG(1.2); await shot('th-' + k); }
};
