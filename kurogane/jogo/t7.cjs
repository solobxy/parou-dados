module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.setViewportSize({ width: 390, height: 844 }); await W(500);
  await page.click('#rotGo'); await W(300); await shot('50-vertical-inicio');
  await page.click('#sPlay'); await W(600);
  await ev(() => { const p = G.p; p.x = 13.8; p.z = -10; G.camT.set(p.x, 0, p.z); }); await W(800); await shot('51-vertical-jogo');
  await ev(() => { G.interact(); if (!G.invOpen) G.ui.openInv(null); }); await W(500); await shot('52-vertical-inv');
};
