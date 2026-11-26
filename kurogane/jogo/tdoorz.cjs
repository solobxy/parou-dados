// beiras das portas: procurar o tremer (z-fighting / sombras) à frente de uma porta na 1.ª pessoa
module.exports = async (page, shot) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(2500); await ev(() => { G.net.start = () => { }; G.ui.arenaHide(); G.arenaStart(0, 'atirador'); });
  await W(3000);
  const info = await ev(() => { const p = G.p, A = G.W.doors.map(D => ({ D, d: Math.hypot(D.x - p.x, D.z - p.z) })).sort((a, b) => a.d - b.d); const D = (A.find(a => a.D.lv === 0) || A[0]).D; window.__D = D; return { n: G.W.doors.length, x: D.x, z: D.z, horiz: D.horiz, inward: D.inward, t: D.t, w: D.w }; });
  console.log('porta:', JSON.stringify(info));
  for (const [nm, off, side, op] of [['frente', 2.2, 0, 0], ['lado', 2.0, 0.6, 0], ['aberta', 2.2, 0.3, 1]]) {
    await ev(([off, side, op]) => { const D = window.__D, p = G.p; D.t = D.target = op; const nx = D.horiz ? 0 : -D.inward, nz = D.horiz ? -D.inward : 0, tx = D.horiz ? 1 : 0, tz = D.horiz ? 0 : 1; p.x = D.x + nx * off + tx * side; p.z = D.z + nz * off + tz * side; p.vx = p.vz = 0; const yaw = Math.atan2(D.x - p.x, D.z - p.z); p.yaw = p.root = p.aim = yaw; if (G.aimS) { G.aimS.fy = yaw; G.aimS.fpit = 0.02; } }, [off, side, op]);
    await W(2500); await shot('door-' + nm);
    await ev(() => { G.p.x += 0.04; }); await W(600); await shot('door-' + nm + '2');
  }
};
