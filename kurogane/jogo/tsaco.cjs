// saco no chão (o que se deixa cair) com o modelo do Blender
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await ev(() => G.dbgKit()); await W(1200);
  await ev(() => { const p = G.p; p.x = 60; p.z = 1.5; p.yaw = p.root = Math.PI / 2; G.aimS.fy = p.yaw; G.aimS.fpit = -0.75; G.dropItem({ id: 9e5 + 7, k: 'granada', n: 1 }); }); await W(2500);
  await shot('saco');
};
