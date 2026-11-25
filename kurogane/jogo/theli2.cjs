// helicóptero realista: rotor arranca, sobe a direito, virar não mexe na altura, trás trava sem marcha-atrás e aterra
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const GT = async s => { const t0 = await ev(() => G.t); while ((await ev(() => G.t)) - t0 < s) await W(300); };
  const st = () => ev(() => { const c = G.car, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); return { alt: +c.alt.toFixed(1), v: +c.v.toFixed(1), vf: +((c.vx || 0) * fx + (c.vz || 0) * fz).toFixed(1), pt: +(c.pt || 0).toFixed(2), rl: +(c.rl || 0).toFixed(2), rot: +(c.rot || 0).toFixed(2), x: Math.round(c.x), z: Math.round(c.z) }; });
  await ev(() => G.dbgKit()); await W(1500);
  const h = await ev(() => { for (const z of G.zs) z.x += 9000; const c = G.cars.list.find(q => q.k === 'heli' && Math.hypot(q.x - 208, q.z + 182) < 5); G.p.x = c.x + 3; G.p.z = c.z; return c ? c.id : null; });
  await ev(id => G.cars.enter(G.cars.list.find(q => q.id === id)), h); await W(500);
  await ev(() => { G.dbgDrive = { kb: true, t: -1, s: 0 }; }); await GT(1.5); const g0 = await st(); console.log('trás no chão:', JSON.stringify(g0), g0.v < 0.2 && g0.alt < 0.1 ? 'OK não mexe' : 'FALHA');
  await ev(() => { G.dbgDrive = { kb: true, t: 1, s: 0 }; }); await GT(1.2); const r1 = await st(); console.log('rotor a arrancar:', JSON.stringify(r1), r1.rot > 0.9 ? 'OK rotor pronto' : 'FALHA');
  await GT(9); const a = await st(); console.log('a voar:', JSON.stringify(a), a.alt > 15 && a.v > 15 && a.pt < -0.02 ? 'OK sobe, anda, nariz em baixo' : 'FALHA'); await shot('heli2-ar');
  await GT(4); const a2 = await st();
  await ev(() => { G.dbgDrive = { kb: true, t: 1, s: 1 }; }); let mx = 0, mn = 99; for (let i = 0; i < 8; i++) { await GT(0.5); const q = await st(); mx = Math.max(mx, q.alt); mn = Math.min(mn, q.alt); }
  const b = await st(); console.log('a virar:', JSON.stringify(b), 'altura', mn, '-', mx, 'antes', a2.alt, Math.abs(mx - a2.alt) < 0.8 && Math.abs(mn - a2.alt) < 0.8 && b.rl < -0.05 && b.v > 20 ? 'OK mesma altura, inclina' : 'FALHA'); await shot('heli2-curva');
  await ev(() => { G.dbgDrive = { kb: true, t: -1, s: 0 }; }); let neg = 0; for (let i = 0; i < 10; i++) { await GT(0.5); const q = await st(); if (q.vf < -0.3) neg++; if (i === 1) console.log('a travar:', JSON.stringify(q), q.pt > 0.03 ? 'OK nariz em cima' : 'FALHA'); }
  const c = await st(); console.log('travou:', JSON.stringify(c), c.v < 1 && !neg ? 'OK parou sem ir para trás' : 'FALHA');
  await GT(9); console.log('chão livre?', await ev(() => G.cars.free(G.car.x, G.car.z))); const d = await st(); console.log('trás parado:', JSON.stringify(d), d.alt < 0.2 ? 'OK aterrou' : d.alt <= 3.1 ? 'paira (água ou telhado)' : 'FALHA');
  await ev(() => { G.dbgDrive = { kb: true, t: 0, s: 0 }; }); await GT(1);
  const ex = await ev(() => { G.cars.exit(); return !G.car; }); console.log('sair no chão:', ex ? 'OK' : 'FALHA');
  await GT(6); console.log('rotor sem piloto:', await ev(id => +G.cars.list.find(q => q.id === id).rot.toFixed(2), h));
};
