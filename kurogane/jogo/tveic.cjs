// tipos de veículo: lista de sítios, conduzir cada tipo e medir a velocidade máxima na estrada
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  const sp = await ev(() => { const L = G.cars.spawnPoints(), n = {}; for (const a of L) n[a[3]] = (n[a[3]] || 0) + 1; return { total: L.length, n }; });
  console.log('veículos no mapa:', JSON.stringify(sp));
  // mais simples: cria um de cada numa estrada reta (estrada principal, a leste do centro) e conduz 8 s em frente
  const out = await ev(async () => { const sl = ms => new Promise(r => setTimeout(r, ms)), res = {};
    for (const z of G.zs) z.x += 9000;
    for (const k of ['sedan', 'sport', 'coupe', 'suv', 'van', 'jeep', 'humvee', 'moto', 'bike']) {
      const c = G.cars.dbgAdd(k, 600, 0, Math.PI / 2); c.fuel = 30; G.p.x = 600; G.p.z = 0; G.cars.enter(c); await sl(300);
      G.dbgDrive = { kb: true, t: 1, s: 0 }; await sl(5000); res[k] = { kmh: Math.round(Math.abs(c.v) * 3.6), x: Math.round(c.x) }; G.dbgDrive = null; G.cars.exit(); G.cars.dbgDel(c); await sl(200); }
    return res; });
  console.log('velocidade depois de 5 s (km/h):', JSON.stringify(out));
  await ev(v => { window.__vx = v; }, +(process.env.VX || 628)); const c = await ev(() => { const L = []; let x = 600; for (const k of ['sedan', 'sport', 'coupe', 'suv', 'van', 'jeep', 'humvee', 'moto', 'bike']) { L.push(G.cars.dbgAdd(k, x, 9, Math.PI / 2)); x += 7; } G.p.x = (window.__vx || 628); G.p.z = 14; return L.length; });
  await W(1500); await shot('veiculos');
};
