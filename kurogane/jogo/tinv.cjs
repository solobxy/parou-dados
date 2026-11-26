module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { G.ui.refresh(true); G.ui.openInv(null); }); await W(1200); await shot('inv');
  await ev(() => { G.ui.closeInv(); const c = G.W.containers.find(c => Math.hypot(c.x - G.p.x, c.z - G.p.z) < 400) || G.W.containers[0]; G.p.x = c.x + 0.8; G.p.z = c.z; }); await W(800);
  await ev(() => { const c = G.W.containers.slice().sort((a, b) => Math.hypot(a.x - G.p.x, a.z - G.p.z) - Math.hypot(b.x - G.p.x, b.z - G.p.z))[0]; G.ui.openInv(c); }); await W(1200); await shot('inv-caixa');
};
