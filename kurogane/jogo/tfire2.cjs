// fornalha acesa dentro da base (boca e fumo) e avião caído a arder
const base = require('./tluzbase.cjs');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const fs = require('fs'), cam = async (nm, pos, at, fov) => { const u = await ev(([p, a, f]) => G.dbgCam(p, a, f, 640, 480), [pos, at, fov]); fs.writeFileSync(__dirname + '/shots/' + nm + '.jpg', Buffer.from(u.split(',')[1], 'base64')); };
  await base(page, async () => {});
  const d = await ev(() => { const d = G.base.deps.find(d => d.k === 'fornalha'); return [d.x, d.y || 0, d.z, d.yaw]; });
  const fx = d[0] + Math.sin(d[3]) * 2.2, fz = d[2] + Math.cos(d[3]) * 2.2;
  await cam('fornalha-perto', [fx + 0.6, d[1] + 1.7, fz], [d[0], d[1] + 0.8, d[2]], 55);
  await cam('fornalha-cima', [d[0] + 2, d[1] + 7, d[2] - 4], [d[0], d[1] + 1, d[2]], 45);
  await ev(() => { G.airdrop({ ph: 2, x: G.p.x + 25, z: G.p.z, yaw: 0.4 }); G.cyc = 1710; }); await W(2500);
  await shot('aviao');
  const p = await ev(() => [G.p.x, G.p.z]);
  await cam('aviao-perto', [p[0] + 12, 7, p[1] - 6], [p[0] + 25, 2, p[1] - 2], 50);
};
