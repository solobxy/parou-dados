// conduzir numa encosta: o carro anda, a câmara fica por cima do chão
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2000);
  let spot = await ev(() => { const T = G.TER; let best = null; for (let x = -3000; x < 3000; x += 23) for (let z = -3000; z < 0; z += 29) { const g = Math.abs(T.at(x, z + 6) - T.at(x, z - 6)) / 12; if (T.at(x, z) > 5 && g > 0.12 && (!best || g > best[2])) best = [x, z, g]; } return best; });
  if (process.env.KG_FLAT) spot = await ev(() => [G.p.x + 6, G.p.z, 0]);
  console.log('encosta', JSON.stringify(spot));
  await ev(s => { const p = G.p; p.x = s[0] + 2.5; p.z = s[1]; const c = G.cars.dbgAdd('jeep', s[0], s[1], 0); G.cars.enter(c); }, spot); await W(3000);
  const a = await ev(() => [G.car.x, G.car.z, G.groundY(G.car.x, G.car.z, 0)]);
  await page.keyboard.down('KeyW'); await W(5000); await page.screenshot({ path: '/tmp/kg/drive1.png' }); await W(3000); await page.keyboard.up('KeyW');
  const b = await ev(() => [G.car.x, G.car.z, G.groundY(G.car.x, G.car.z, 0), G.car.v, ...G.dbgCamPos()]);
  console.log('antes', JSON.stringify(a.map(v => +v.toFixed(1))), 'depois', JSON.stringify(b.map(v => +v.toFixed(1))));
  console.log((Math.hypot(b[0] - a[0], b[1] - a[1]) > 5 ? 'OK   ' : 'FALHA') + ' o carro andou na encosta (' + Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(1) + ' m)');
  console.log((b[5] > b[2] + 1 ? 'OK   ' : 'FALHA') + ' câmara acima do chão');
  await page.screenshot({ path: '/tmp/kg/drive2.png' });
};
