module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => { G.dbgKit(); }); await W(2500); await ev(() => { G.inv.belt.fill(null); G.sel = 0; G.refresh(); }); await W(1200);
  await ev(() => { window.__fs = setInterval(() => { G.p.swing = 0.3; G.p.swingM = { cd: 100 }; G.p.swingHit = true; }, 5); }); await W(1500); await shot('fist-0'); await ev(() => clearInterval(window.__fs));
};
