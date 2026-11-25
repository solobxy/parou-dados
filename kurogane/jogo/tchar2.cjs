// vista normal do jogo: a andar com zombies à volta
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 120000, polling: 50 }); };
  await ev(() => G.dbgKit()); await W(1200);
  await ev(() => { const p = G.p; let i = 0; for (const z of G.zs) { if (i < 6) { z.x = p.x + 6 + (i % 3) * 2.5; z.z = p.z - 3 + Math.floor(i / 3) * 3; z.state = 'wander'; z.lv = 0; } i++; } G.sticks.L = { x: 0.5, y: -0.6 }; });
  await WG(1.5); await shot('jogo-andar');
  await ev(() => { G.sticks.L = null; G.aimStart(); }); await WG(1); console.log(JSON.stringify(await ev(() => { const A = G.aimS; return { A: A.A && [A.A.x - G.p.x, A.A.z - G.p.z].map(v => +v.toFixed(2)), lock: !!A.lock, zone: A.zone }; }))); await shot('jogo-apontar');
};
