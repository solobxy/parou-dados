// helicóptero contra uma torre de 42 m: tem de subir por cima (ou travar), nunca atravessar
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const GT = async s => { const t0 = await ev(() => G.t); while ((await ev(() => G.t)) - t0 < s) await W(300); };
  await ev(() => G.dbgKit()); await W(1500);
  const h = await ev(() => { for (const z of G.zs) z.x += 9000; const c = G.cars.list.find(q => q.k === 'heli'); G.p.x = c.x + 3; G.p.z = c.z; return c.id; });
  await ev(id => G.cars.enter(G.cars.list.find(q => q.id === id)), h); await W(500);
  await ev(() => { const c = G.car, tx = -110, tz = -209; c.x = tx + 160; c.z = tz; c.yaw = -Math.PI / 2; c.air = true; c.alt = 22; c.uAlt = 22; c.rot = 1; c.vx = -30; c.vz = 0; G.dbgDrive = { kb: true, t: 1, s: 0 }; });
  let worst = 99, path = [];
  for (let i = 0; i < 24; i++) { await GT(0.5); const q = await ev(() => { const c = G.car, R = G.W.rects; let top = 0; for (const r of R) if (c.x > r.x0 && c.x < r.x1 && c.z > r.z0 && c.z < r.z1) top = Math.max(top, (r.h || 0) + (r.lv || 0) * 3.7); return { x: Math.round(c.x), alt: +c.alt.toFixed(1), v: +c.v.toFixed(1), top }; }); path.push(q.x + ':' + q.alt + '/' + q.top); if (q.top > 0) worst = Math.min(worst, q.alt - q.top); }
  console.log(path.join(' ')); console.log('folga mínima sobre telhados:', worst, worst > 1 ? 'OK passa por cima' : 'FALHA');
};
