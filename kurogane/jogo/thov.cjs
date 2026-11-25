// pairar: o helicóptero no ar trava e fica à mesma altura; zombies não atacam quem está dentro; holofote
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const GT = async s => { const t0 = await ev(() => G.t); while ((await ev(() => G.t)) - t0 < s) await W(300); };
  await ev(() => G.dbgKit()); await W(1500);
  const h = await ev(() => { for (const z of G.zs) z.x += 9000; const c = G.cars.list.find(q => q.k === 'heli'); G.p.x = c.x + 3; G.p.z = c.z; return c.id; });
  await ev(id => G.cars.enter(G.cars.list.find(q => q.id === id)), h); await W(500);
  await ev(() => { G.dbgDrive = { kb: true, t: 1, s: 0 }; }); await GT(9);
  const a = await ev(() => ({ alt: +G.car.alt.toFixed(1), v: +G.car.v.toFixed(1), cls: document.body.classList.contains('heliAir') })); console.log('a voar:', JSON.stringify(a));
  await ev(() => { G.dbgDrive = { kb: true, t: 0, s: 0 }; G.hoverToggle(); }); await GT(6);
  const b = await ev(() => ({ alt: +G.car.alt.toFixed(1), v: +G.car.v.toFixed(1), hov: G.car.hov, lab: document.querySelector('#dHov em').textContent })); console.log('a pairar:', JSON.stringify(b), b.hov && b.v < 0.6 && Math.abs(b.alt - a.alt) < 1.5 ? 'OK parado no ar' : 'FALHA');
  // zombie ao lado (no chão por baixo) não ataca
  await ev(() => { G.car.alt = 1.2; G.car.uAlt = 1.2; const z = G.zs.find(q => !q.an && q.state !== 'dead'); z.x = G.car.x + 0.8; z.z = G.car.z; z.state = 'chase'; window._z = z; G.p.hp = 100; }); await GT(4);
  console.log('zombie ao lado do helicóptero: vida', await ev(() => Math.round(G.p.hp)), (await ev(() => G.p.hp)) >= 100 ? 'OK não ataca' : 'FALHA');
  await ev(() => { G.cyc = 1700; G.car.alt = 22; G.car.uAlt = 22; G.car.hov = true; }); await GT(2.5); await shot('heli-luz');
};
