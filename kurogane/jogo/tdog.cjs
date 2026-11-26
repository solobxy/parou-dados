module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { const c = G.zs.find(z => z.an === 'cao'); window._c = c; c.pet = 'local'; G.p.x = c.x + 1.1; G.p.z = c.z; for (const z of G.zs) if (!z.an && Math.hypot(z.x - G.p.x, z.z - G.p.z) < 80) z.x += 900; });
  for (let i = 0; i < 6; i++) { if (i === 1) await ev(() => { G.p.x += 15; }); await WG(0.7); console.log(JSON.stringify(await ev(() => ({ d: +Math.hypot(_c.x - G.p.x, _c.z - G.p.z).toFixed(1), st: _c.state, v: +(_c.v || 0).toFixed(2), prey: !!_c.prey, stay: !!_c.stay, rem: !!_c.remote, x: +_c.x.toFixed(1), stuck: _c.stuck, dead: _c.state })))); }
};
