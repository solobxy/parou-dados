// peso dos adereços: triângulos e chamadas de desenho em sítios típicos, com e sem adereços do Blender
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const SP = [[-2677, -2775, 3.6], [-2660, -2760, 0.8], [-165, -7, 0], [0, 0, 1.6], [-20, -12, 2]];
  const run = async () => { await ev(() => G.dbgKit()); await W(1000); const o = [];
    for (const [x, z, a] of SP) { await ev(([x, z, a]) => { const p = G.p; p.x = x; p.z = z; p.yaw = p.root = a; G.aimS.fy = a; G.aimS.fpit = -0.1; window.__rinfoOn = 1; }, [x, z, a]); await W(6000);
      const r = await ev(async () => { const s = []; for (let i = 0; i < 3; i++) { await new Promise(r => requestAnimationFrame(r)); s.push(window.__rinfo()); } return s[2]; }); o.push([r.calls, r.tris]); }
    const bm = await ev(() => G.W.buildMs); return { o, bm, n: await ev(() => Object.values(G.propStat).reduce((a, v) => a + v.n, 0)) }; };
  const a = await run(); console.log('com:', JSON.stringify(a));
  await page.goto(page.url().split('?')[0] + '?noprops'); await page.waitForFunction('window.G && G.dbgKit', { timeout: 120000 }); await W(3000);
  const b = await run(); console.log('sem:', JSON.stringify(b));
};
