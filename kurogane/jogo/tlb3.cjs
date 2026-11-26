// prova: com o near antigo (0,3 m) a lanterna encostada à parede passa para fora; com 0,04 não
const base = require('./tluzbase.cjs');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await base(page, async () => {});
  const go = async (near, nm) => { await ev(n => { const t = G.dbgL.torch; t.shadow.camera.near = n; t.shadow.camera.updateProjectionMatrix(); const P = [...G.base.pieces.values()][0]; G.p.x = P.i * 3 + 1.5; G.p.z = P.j * 3 + 3 - 0.42; G.p.yaw = G.p.root = 0; if (!G.lightOn) G.toggleLight(); }, near); await W(4000); await shot(nm); };
  await go(0.3, 'near-antigo'); await go(0.04, 'near-novo');
  console.log('torch', await ev(() => { const t = G.dbgL.torch; return [t.position.x - G.p.x, t.position.z - G.p.z, t.intensity, t.shadow.camera.near].map(v => +v.toFixed(2)).join(' '); }));
};
