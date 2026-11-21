// luz: dentro de casa ao meio-dia (sol só pelas janelas), cidade à noite
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.click('#sPlay'); await W(1200);
  await ev(() => { document.getElementById('toast').hidden = true; for (const z of G.zs) { z.x = z.hx = 250; z.z = z.hz = 250; } G.cyc = 700; const p = G.p; p.x = -22; p.z = -36; p.y = 0.03; p.lv = 0; G.camT.set(p.x, 0, p.z); });
  await W(3500); await shot('a0-casa-dia');
  await ev(() => { G.cyc = 1680; const p = G.p; p.x = 0; p.z = 8; G.camT.set(p.x, 0, p.z); }); await W(3500); await shot('a1-cidade-noite');
  await ev(() => { G.cyc = 1680; const p = G.p; p.x = -30; p.z = -20; G.camT.set(p.x, 0, p.z); }); await W(3500); await shot('a2-cidade-noite2');
  await ev(() => { G.cyc = 1480; }); await W(2500); await shot('a3-entardecer');
  console.log('hora', await ev(() => [G.tod.toFixed(3), G.day.toFixed(2)]));
};
