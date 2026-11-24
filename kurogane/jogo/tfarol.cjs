// faróis dos carros iluminam à noite
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  const r = await ev(() => { G.cyc = 1700; for (const z of G.zs) z.x += 9000; const c = G.cars.list ? G.cars.list[0] : null; return !!c; });
  await ev(() => { const L = [...(G.cars.all ? G.cars.all() : [])]; const p = G.p; let best = null, bd = 1e9; for (const c of G.carsList || L) {} });
  const info = await ev(() => { const p = G.p, c = G.cars.nearest({ x: p.x, z: p.z, lv: 0 }, 1e9) || null; return c ? [c.x, c.z, c.yaw] : null; });
  console.log('carro:', JSON.stringify(info));
  if (!info) return;
  await ev(([x, z, yaw]) => { const p = G.p; p.x = x - Math.cos(yaw) * 2.5; p.z = z + Math.sin(yaw) * 2.5; }, info); await W(600);
  await ev(() => { const p = G.p, c = G.cars.nearest(p, 1e9); G.cars.enter(c); }); await W(1500);
  await shot('farois-noite');
  console.log(JSON.stringify(await ev(() => ({ inCar: !!G.car, day: G.day }))));
};
