// modelos dos carros vistos de perto
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  for (const k of ['sedan', 'suv', 'humvee', 'van', 'sport', 'jeep']) {
    const c = await ev(k => { const c = G.cars.list.find(q => q.k === k); if (!c) return null; G.p.x = c.x + 8; G.p.z = c.z + 5; return { x: c.x, z: c.z, yaw: c.yaw }; }, k); if (!c) { console.log('sem', k); continue; } await W(1200);
    const u = await ev(c => { const a = c.yaw + 0.8; return G.dbgCam([c.x + Math.sin(a) * 6.5, 3.2, c.z + Math.cos(a) * 6.5], [c.x, 0.8, c.z], 40, 700, 450); }, c);
    require('fs').writeFileSync(__dirname + '/shots/car-' + k + '.jpg', Buffer.from(u.split(',')[1], 'base64'));
  }
};
