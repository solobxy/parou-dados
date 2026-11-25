// modelo do helicóptero visto de perto
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  const c = await ev(() => { const c = G.cars.list.find(q => q.k === 'heli' && Math.hypot(q.x - 208, q.z + 182) < 5); G.p.x = c.x + 12; G.p.z = c.z + 6; return { x: c.x, z: c.z, yaw: c.yaw }; }); await W(1500);
  for (const [n, dx, dy, dz] of [['heliM-lado', 9, 3, 4], ['heliM-tras', -6, 6, -9], ['heliM-cima', 2, 18, 3]]) { const u = await ev(([c, dx, dy, dz]) => G.dbgCam([c.x + dx, dy, c.z + dz], [c.x, 1.6, c.z - 1], 45, 800, 560), [c, dx, dy, dz]); require('fs').writeFileSync(__dirname + '/shots/' + n + '.jpg', Buffer.from(u.split(',')[1], 'base64')); }
};
