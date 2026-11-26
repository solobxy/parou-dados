module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await WG(1);
  const res = [];
  for (const dir of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const r = await ev(dir => { const W = G.dbgW, p = G.p; const cs = W.cuts.filter(c => c.n >= 2 && c.fh && c.stairs && c.stairs.length).sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - p.x, (a.z0 + a.z1) / 2 - p.z) - Math.hypot((b.x0 + b.x1) / 2 - p.x, (b.z0 + b.z1) / 2 - p.z)); const c = cs[0];
      p.x = (c.x0 + c.x1) / 2; p.z = (c.z0 + c.z1) / 2; p.lv = 1; p.bld = c; p.base = c.fh; p.h = 0; p.vy = 0; p.y = c.fh; G.sticks.L = { x: dir[0], y: -dir[1], m: 1 }; return { id: c.id, box: [c.x0, c.z0, c.x1, c.z1].map(v => +v.toFixed(1)) }; }, dir);
    await WG(2.5);
    const e = await ev(() => { G.sticks.L = null; const p = G.p; return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), lv: p.lv, h: +p.h.toFixed(2) }; });
    res.push([dir.join(','), r.box, e]);
  }
  console.log(JSON.stringify(res));
};
