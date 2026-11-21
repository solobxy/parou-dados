module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.evaluate(() => G.dbgKit()); await W(3000);
  const far = () => ev(() => { for (const z of G.zs) { z.x = z.hx = 440; z.z = z.hz = 440; z.state = 'wander'; } const p = G.p; p.x = 60; p.z = 60; G.t += 60; });
  await far(); console.log('calmo:', await ev(() => G.danger()));
  await ev(() => { G.p.hp = 100; G.dbg.hurt(8); G.dbg.hurt(8); }); console.log('2 golpes:', await ev(() => G.danger() + ' ' + JSON.stringify(G.dangerWhy)));
  await ev(() => G.dbg.hurt(8)); console.log('3 golpes:', await ev(() => G.danger() + ' ' + JSON.stringify(G.dangerWhy)));
  await far(); await ev(() => { G.p.hp = 100; G.dbg.hurt(45, 'queda'); }); console.log('queda de 45:', await ev(() => G.danger()));
  await far(); await ev(() => { G.p.hp = 100; G.dbg.hurt(25); G.t += 5.5; G.dbg.hurt(22); }); console.log('47 em 6 s:', await ev(() => G.danger() + ' ' + JSON.stringify(G.dangerWhy)));
  await far(); await ev(() => { G.p.hp = 100; const p = G.p; let n = 0; for (const z of G.zs) { if (z.state === 'dead') continue; Object.assign(z, { x: p.x + 5 + n, z: p.z + 3, hx: p.x + 5 + n, hz: p.z + 3, state: 'wander' }); if (++n >= 5) break; } });
  console.log('5 perto:', await ev(() => G.danger() + ' ' + JSON.stringify(G.dangerWhy)));
  await ev(() => { const p = G.p; for (const z of G.zs) { if (z.state === 'dead' || z.x === 440) continue; } let n = 0; for (const z of G.zs) { if (z.state === 'dead' || z.x !== 440) continue; Object.assign(z, { x: p.x - 6, z: p.z, hx: p.x - 6, hz: p.z, state: 'wander' }); if (++n >= 1) break; } });
  console.log('6 perto:', await ev(() => G.danger() + ' ' + JSON.stringify(G.dangerWhy)));
  console.log('cidade:', await ev(() => { const p = G.p; G.t += 60; p.x = 0; p.z = 0; for (const z of G.zs) { z.x = z.hx = 440; z.z = z.hz = 440; } return G.danger() + ' ' + JSON.stringify(G.dangerWhy); }));
};
