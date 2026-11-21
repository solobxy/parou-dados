// monumentos novos: visitar cada um e tirar fotografia; contar coisas
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  console.log('mundo', await ev(() => JSON.stringify({ rects: G.W.rects.length, cont: G.W.containers.length, zones: G.W.zones.length, trees: G.W.trees.length, rocks: G.W.rocks.length, ko: G.W.koSkipped, koBad: G.W.koCheck().length, boot: performance.now() | 0 })));
  await page.click('#sPlay'); await W(1200);
  await ev(() => { document.getElementById('toast').hidden = true; G.cyc = 600; });
  const spots = [['c0-templo', -322, -150], ['c1-pagode', -312, -140], ['c2-estacao', 334, -30], ['c3-hospital', 300, 136], ['c4-escola', -40, 318], ['c5-industrial', -316, 318], ['c6-central', 350, -318], ['c7-aerodromo', -140, -350], ['c8-higashimura', 392, -2]];
  for (const [n, x, z] of spots) { await ev(([x, z]) => { const p = G.p; p.x = x; p.z = z; p.y = 0.03; p.lv = 0; G.camT.set(x, 0, z); for (const zz of G.zs) if (Math.hypot(zz.x - x, zz.z - z) < 30) { zz.x = zz.hx = 440; zz.z = zz.hz = 440; } }, [x, z]); await W(2600); await shot(n); }
  console.log('calls', await ev(() => G.renderer.info.render.calls), 'tris', await ev(() => G.renderer.info.render.triangles));
};
