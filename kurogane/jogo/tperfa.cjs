// peso do desenho na arena (sem servidor)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(1500); await ev(() => { G.net.start = () => { }; window.__rinfoOn = true; G.arenaStart(0, 'atirador'); }); await W(3000);
  for (const [nm, x, z, a] of [['partida', 3650 - 42, 3650, Math.PI / 2], ['meio', 3650 - 12, 3650 + 3, Math.PI / 2], ['parque', 3650 - 25, 3650 + 20, 1.2]]) {
    await ev(([x, z, a]) => { G.p.x = x; G.p.z = z; G.aimS.fy = a; G.p.yaw = G.p.root = a; }, [x, z, a]); await W(2000);
    const r = await ev(() => window.__rinfo()); const n = await ev(() => ({ trees: G.sectors.trees().filter(t => Math.hypot(t.x - G.p.x, t.z - G.p.z) < 150).length, mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0 }));
    console.log(nm.padEnd(8), JSON.stringify(r), JSON.stringify(n));
  }
  console.log('carregar (ms):', await ev(() => Math.round(performance.now())));
};
