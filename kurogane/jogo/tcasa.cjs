// interiores: casa de madeira, apartamentos e clínica, de perto (para ver o detalhe das paredes e do chão)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms), fs = require('fs');
  await ev(() => G.dbgKit()); await W(1500);
  const cam = async (nm, pos, at, fov) => { const u = await ev(([p, a, f]) => G.dbgCam(p, a, f, 700, 450), [pos, at, fov]); fs.writeFileSync(__dirname + '/shots/' + nm + '.jpg', Buffer.from(u.split(',')[1], 'base64')); };
  for (const [nm, x, z] of [['casa', -21.5, 14.5], ['clinica', -15, -14]]) { await ev(([x, z]) => { G.p.x = x; G.p.z = z; G.camT.set(x, 0, z); }, [x, z]); await W(2500); await shot('int-' + nm); }
  await ev(() => { G.p.x = 13.8; G.p.z = -10; }); await W(2000); await cam('konbini-perto', [12, 2.2, -7], [15, 0.8, -12], 60);
};
