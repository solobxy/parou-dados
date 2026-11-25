module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => G.dbgKit()); await page.waitForTimeout(1200);
  const r = await ev(() => { const A = G.cars.spawnPoints(true), B = G.cars.spawnPoints(); const k = a => a[0] + ',' + a[1]; const sb = new Set(B.map(k));
    return A.filter(a => !sb.has(k(a))).map(a => { G.cars.goodClear(); return [...a, G.cars.escapes(a[0], a[1], 700)]; }); });
  console.log(JSON.stringify(r));
};
