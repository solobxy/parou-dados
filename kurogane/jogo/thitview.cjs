// hitboxes desenhadas por cima do corpo em várias poses e ângulos
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.waitForFunction('window.__ready === true', { timeout: 120000 }).catch(() => { }); await W(1500);
  await ev(() => G.dbgKit()); await W(1500);
  const p0 = await ev(() => [G.p.x + 30, G.p.z + 30]);
  const POSES = [['pe-arma', { sc: 0, an: 2, w: 'm4' }], ['pe-apontar', { sc: 0, an: 6, w: 'm4' }], ['pe-pistola', { sc: 0, an: 5, w: 'pistola' }], ['pe-andar', { sc: 0, an: 2, mv: 1, w: 'm4' }], ['agachado', { sc: 1, an: 6, w: 'm4' }], ['agachado-andar', { sc: 1, an: 2, mv: 1, w: 'm4' }], ['deitado', { sc: 2, an: 6, w: 'm4' }], ['sem-arma', { sc: 0, an: 0 }]];
  const fs = require('fs');
  for (const [nm, st] of POSES) { const S = { ...st, x: p0[0], z: p0[1], yaw: 0.6 }; await ev(s => G.dbgHitView(s), S); await W(300);
    for (const [lab, a, h] of [['frente', 0.6, 1.2], ['lado', 0.6 + Math.PI / 2, 1.2], ['cima', 0.6 + 0.7, 3.2]]) { const u = await ev(([x, z, a, h]) => G.dbgCam([x + Math.sin(a) * 3.2, h, z + Math.cos(a) * 3.2], [x, 0.9, z], 45, 360, 360), [S.x, S.z, a, h]); fs.writeFileSync(__dirname + '/shots/hb-' + nm + '-' + lab + '.jpg', Buffer.from(u.split(',')[1], 'base64')); } }
};
