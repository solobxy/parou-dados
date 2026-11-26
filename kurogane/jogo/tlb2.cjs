const base = require(require('path').join(__dirname, 'tluzbase.cjs'));
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a);
  await base(page, async () => {});
  console.log(JSON.stringify(await ev(() => [...G.base.pieces.values()].map(P => { let n = 0, cs = 0, ly = 0; if (P.sh) P.sh.traverse(o => { if (o.isMesh) { n++; if (o.castShadow) cs++; ly = o.layers.mask; } }); return P.t + ' sh=' + !!P.sh + ' meshes=' + n + ' cast=' + cs + ' mask=' + ly + ' cut=' + (P.cut||0).toFixed(2) + ' inScene=' + !!(P.sh && P.sh.parent); }))));
  console.log('sombras', await ev(() => JSON.stringify(G.cfg && G.cfg.shadows)));
  console.log('ray', await ev(() => { const p = G.p; return [0, Math.PI/2, Math.PI, -Math.PI/2].map(y => G.dbg && G.dbg.ray ? G.dbg.ray(p.x, p.z, Math.sin(y), Math.cos(y), 30).toFixed(2) : 'x').join(' '); }));
};
