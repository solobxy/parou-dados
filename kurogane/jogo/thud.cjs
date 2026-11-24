// HUD de dia num sítio claro e à noite
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2500);
  await ev(() => { G.cyc = 700; Object.assign(G.p, { x: 0, z: 0, hp: 64, food: 41, water: 18 }); }); await W(2500); await shot('hud-dia');
  await ev(() => { G.cyc = 1700; }); await W(1500); await shot('hud-noite');
};
