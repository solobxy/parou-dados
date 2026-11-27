// contorno branco no que dá para usar: saco, móvel/caixa, porta, carro
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const face = async (x, z, tx, tz, pit = -0.55) => { await ev(([x, z, tx, tz, pit]) => { const p = G.p; p.x = x; p.z = z; p.vx = p.vz = 0; p.yaw = p.root = Math.atan2(tx - x, tz - z); G.aimS.fy = p.yaw; G.aimS.fpit = pit; }, [x, z, tx, tz, pit]); await W(1500); };
  await ev(() => G.dbgKit()); await W(800);
  // saco
  await ev(() => { const p = G.p; p.x = 60; p.z = 1.5; G.dropItem({ id: 9e5 + 7, k: 'granada', n: 1 }); }); await W(400);
  await face(60, 1.5, 61, 1.5); console.log('saco', JSON.stringify(await ev(() => G.dbgOl()))); await shot('ol-saco');
  // móvel / caixa do mundo (no rés do chão, fora de casa de preferência)
  const c = await ev(() => { const p = G.p; const L = G.dbgW.containers.filter(c => !c.lv && !c.dep && Math.hypot(c.x - 60, c.z) < 140).sort((a, b) => Math.hypot(a.x - 60, a.z) - Math.hypot(b.x - 60, b.z)); const seen = new Set(); return L.filter(c => !seen.has(c.table) && seen.add(c.table)).filter(c => c.table !== 'casa' || /arm|cacifo|frig/i.test(c.label)).slice(0, 3).map(c => ({ x: c.x, z: c.z, t: c.table, l: c.label })); });
  console.log('cont', JSON.stringify(c)); console.log('recs', JSON.stringify(await ev(() => { const C = G.dbgW.containers; let n = 0, v = 0; for (const c of C) if (c.recs && c.recs.length) { n++; for (const r of c.recs) v += r.count || 0; } return [C.length, n, v]; })));
  for (let i = 0; i < Math.min(3, c.length); i++) { const C = c[i]; const fp = await page.evaluate(C => { for (let a = 0; a < 16; a++) { const dx = Math.cos(a * Math.PI / 8) * 1.75, dz = Math.sin(a * Math.PI / 8) * 1.75; { const x = C.x + dx, z = C.z + dz; if (!G.dbgW.rects.some(r => !r.lv && r.k === 's' && x > r.x0 - 0.3 && x < r.x1 + 0.3 && z > r.z0 - 0.3 && z < r.z1 + 0.3) && !G.dbgW.rects.some(r => !r.lv && r.k !== 's' && r.x1 - r.x0 < 0.6 && x > r.x0 - 0.2 && x < r.x1 + 0.2 && z > r.z0 - 0.2 && z < r.z1 + 0.2)) return [x, z]; } } return [C.x - 1.3, C.z]; }, C); await face(fp[0], fp[1], C.x, C.z, -0.4); console.log('cont' + i, JSON.stringify(await ev(() => G.dbgOl()))); await shot('ol-cont' + i); }
  // porta
  const d = await ev(() => { const L = G.dbgW.doors.filter(D => !D.lv && D.leaves && D.leaves.length).sort((a, b) => Math.hypot(a.x - 60, a.z) - Math.hypot(b.x - 60, b.z)); const D = L[0]; return D && { x: D.x, z: D.z, ax: D.ax || 0 }; });
  if (d) { await face(d.x + 1.2, d.z + 0.3, d.x, d.z); console.log('porta', JSON.stringify(await ev(() => G.dbgOl()))); await shot('ol-porta'); }
  // carro
  const k = await ev(() => { const L = (G.cars.list || G.cars.all || []); const c = L.slice().sort((a, b) => Math.hypot(a.x - 60, a.z) - Math.hypot(b.x - 60, b.z))[0]; return c && { x: c.x, z: c.z }; });
  if (k) { await face(k.x + 2.6, k.z + 0.4, k.x, k.z, -0.4); console.log('carro', JSON.stringify(await ev(() => G.dbgOl()))); await shot('ol-carro'); }
  const t = await ev(async () => { const a = performance.now(); let n = 0; await new Promise(r => { const f = () => { n++; if (performance.now() - a < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return n / 3; });
  console.log('fps(swiftshader)', t.toFixed(1));
};
