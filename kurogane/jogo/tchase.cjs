// a conduzir numa colina: a câmara fica acima do chão (antes ficava à altura 0, dentro do monte)
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2000);
  const spot = await ev(() => { const T = G.TER; let best = null; for (let x = -3000; x < 3000; x += 37) for (let z = -3000; z < 0; z += 41) { const h = T.at(x, z); if (h > 15 && (!best || h > best[2])) best = [x, z, h]; } return best; });
  console.log('colina', JSON.stringify(spot && spot.map(v => +v.toFixed(1))));
  for (const k of ['jeep', 'heli']) {
    await ev(([s, k]) => { if (G.car) G.cars.exit(false); const p = G.p; p.x = s[0] + 2.5; p.z = s[1]; const c = G.cars.dbgAdd(k, s[0], s[1], 0); G.cars.enter(c); }, [spot, k]); await W(4000);
    const r = await ev(() => { const c = G.car, cam = G.dbgCamPos ? G.dbgCamPos() : null; return { car: !!c, k: c && c.k, cam, ground: c ? G.groundY(c.x, c.z, 0) : null }; });
    const ok = r.car && r.cam && r.cam[1] > r.ground + 1;
    console.log((ok ? 'OK   ' : 'FALHA') + ' ' + k + ' na colina: câmara a ' + (r.cam ? r.cam[1].toFixed(1) : '?') + ' m, chão a ' + (r.ground ?? 0).toFixed(1) + ' m');
  }
  await page.screenshot({ path: '/tmp/kg/chase.png' });
};
