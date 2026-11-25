// primeira pessoa com red-dot em frente a uma porta de casa (fechada e aberta): frestas e tamanho da arma
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 120000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1500);
  const D = await ev(() => { for (const z of G.zs) z.x += 3000; const P = G.p; let best = null, bd = 1e9; for (const d of G.dbgDoors()) { if (d.base || d.lv) continue; const q = Math.hypot(d.x - P.x, d.z - P.z); if (q < bd && d.w < 1.7) { bd = q; best = d; } } best.target = best.t = 0; return { x: best.x, z: best.z, horiz: best.horiz, inward: best.inward, w: best.w }; });
  const out = D.horiz ? [D.x + 0.3, D.z - D.inward * 2.6] : [D.x - D.inward * 2.6, D.z + 0.3];
  await ev(([o, D]) => { const p = G.p; p.x = o[0]; p.z = o[1]; p.vx = p.vz = 0; const g = G.mkItem('m4'); g.att = { scope: 'reddot' }; g.ammo = 30; G.inv.belt[5] = g; G.sel = 5; G.refresh(); p.yaw = p.root = p.aim = Math.atan2(D.x - o[0], D.z - o[1]); }, [out, D]); await WG(1);
  await ev(() => G.scopeToggle()); await WG(1.2);
  await ev(([o, D]) => { G.aimS.fy = Math.atan2(D.x - o[0], D.z - o[1]); G.aimS.fpit = -0.05; }, [out, D]); await WG(0.6);
  console.log('fp:', await ev(() => !!G.fp)); await shot('fp-porta-fechada');
  await ev(() => { for (const d of G.dbgDoors()) if (Math.hypot(d.x - G.p.x, d.z - G.p.z) < 4) d.target = 1; }); await WG(1.5);
  await ev(([o, D]) => { G.aimS.fy = Math.atan2(D.x - o[0], D.z - o[1]); G.aimS.fpit = -0.05; }, [out, D]); await WG(0.3); await shot('fp-porta-aberta');
};
