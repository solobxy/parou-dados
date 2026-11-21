module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.click('#sPlay'); await W(2000); await ev(() => { document.getElementById('toast').hidden = true; G.cyc = 700; });
  for (const [n, x, z, c] of [['i0-cidade-rua', -20, 5, 700], ['i1-cruzamento', 3, 3, 700], ['i2-cruzamento-noite', 3, 3, 1700]]) { await ev(([x, z, c]) => { G.cyc = c; const p = G.p; p.x = x; p.z = z; G.camT.set(x, 0, z); for (const zz of G.zs) if (Math.hypot(zz.x - x, zz.z - z) < 25) { zz.x = zz.hx = 440; zz.z = zz.hz = 440; } }, [x, z, c]); await W(2500); await shot(n); }
};
