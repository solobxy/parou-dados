// helicóptero: entrar no heliporto da base militar, levantar, voar 6 s, largar e aterrar
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const GT = async s => { const t0 = await ev(() => G.t); while ((await ev(() => G.t)) - t0 < s) await W(400); }; // espera tempo de jogo
  await ev(() => G.dbgKit()); await W(1500);
  const h = await ev(() => { for (const z of G.zs) z.x += 9000; const c = G.cars.list.find(q => q.k === 'heli' && Math.hypot(q.x - 208, q.z + 182) < 5); G.p.x = c.x + 3; G.p.z = c.z; return c ? c.id : null; });
  console.log('helicóptero:', h); await W(800);
  await ev(id => G.cars.enter(G.cars.list.find(q => q.id === id)), h); await W(500);
  await shot('heli-chao');
  await ev(() => { G.dbgDrive = { kb: false, yaw: Math.PI / 2, m: 1 }; }); await GT(7);
  const a = await ev(() => ({ alt: +G.car.alt.toFixed(1), v: +G.car.v.toFixed(1), x: Math.round(G.car.x), fuel: +G.car.fuel.toFixed(1), py: +G.p.y.toFixed(1) })); console.log('a voar:', JSON.stringify(a), a.alt > 8 && a.x > 215 ? 'OK sobe e voa' : 'FALHA');
  await shot('heli-ar');
  const ex = await ev(() => { G.cars.exit(); return !!G.car; }); console.log('sair no ar:', ex ? 'OK não deixa' : 'FALHA');
  await ev(() => { G.dbgDrive = { kb: false, m: 0, yaw: 0 }; }); await GT(9);
  const b = await ev(() => ({ alt: +G.car.alt.toFixed(2), v: +G.car.v.toFixed(1) })); console.log('largou o polegar:', JSON.stringify(b), b.alt < 4 ? 'OK desce' : 'FALHA');
};
