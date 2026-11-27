// dentro de uma casa à noite e de dia (centro da casa, a olhar para o teto e para a sala)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await ev(() => G.dbgKit()); await W(1200);
  await ev(() => { G.p.x = -160; G.p.z = -7; }); await W(6000);
  for (let k = 0; k < 2; k++) {
    const r = await ev(k => { const L = G.W.cuts.filter(c => c.shell && /Casa/.test(c.name || '') && c.lamps && c.lamps.length).sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - G.p.x, (a.z0 + a.z1) / 2 - G.p.z) - Math.hypot((b.x0 + b.x1) / 2 - G.p.x, (b.z0 + b.z1) / 2 - G.p.z)); const c = L[k]; if (!c) return null; const l = c.lamps[0], p = G.p; p.x = l.x + 1.3; p.z = l.z + 1.3; p.lv = 0; p.yaw = p.root = Math.atan2(l.x - p.x, l.z - p.z) + 0.3; G.aimS.fy = p.yaw; G.aimS.fpit = 0.05; return [c.name, c.lamps.map(l => l.s + l.k).join(',')]; }, k);
    console.log(JSON.stringify(r)); if (!r) continue; await W(5000);
    await ev(() => { G.cyc = 1710; }); await W(2500); await shot('casa' + k + '-noite');
    await ev(() => { G.cyc = 750; }); await W(2500); await shot('casa' + k + '-dia');
  }
};
