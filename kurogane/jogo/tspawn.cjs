// veículos: nenhum lugar de partida fica preso (vedações, muros, água)
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => G.dbgKit()); await page.waitForTimeout(1200);
  const r = await ev(() => { G.cars.goodClear(); const t0 = performance.now(), L = G.cars.spawnPoints(), dt = performance.now() - t0, bad = [];
    G.cars.goodClear(); for (const [x, z, , k] of L) if (k !== 'heli' && !G.cars.escapes(x, z, 300)) bad.push([x, z, k]);
    const n = {}; for (const a of L) n[a[3]] = (n[a[3]] || 0) + 1; return { ms: Math.round(dt), total: L.length, n, bad }; });
  console.log(JSON.stringify(r));
};
