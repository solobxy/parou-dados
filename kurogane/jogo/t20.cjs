module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.click('#sPlay'); await W(2500);
  await ev(() => { const p = G.p; p.x = -20; p.z = -10; G.camT.set(p.x, 0, p.z); }); await W(3000);
  console.log('calls', await ev(() => G.renderer.info.render.calls), 'tris', await ev(() => G.renderer.info.render.triangles));
};
