module.exports = async (page, shot) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2500); await ev(() => { for (const z of G.zs) z.x += 3000; }); await W(800);
  const r = await ev(async () => { const p = G.p, y0 = p.y; let mx = y0; G.jump(); const t0 = G.t; while (G.t - t0 < 1.6) { mx = Math.max(mx, p.y); await new Promise(r => setTimeout(r, 16)); } return { salto: +(mx - y0).toFixed(2) }; });
  if (!(await ev(() => !!G.fp))) { await ev(() => G.viewToggle()); await W(1500); }
  console.log(JSON.stringify(r), 'fov:', await ev(() => G.cam ? +G.cam.fov.toFixed(1) : null));
};
