// árvores e erva novas: de perto, de dia e ao pôr do sol, e numa floresta
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await ev(() => G.dbgKit()); await W(1200);
  const clean = () => ev(() => { const cv = G.dbgCanvas; for (const e of document.querySelectorAll('body *')) if (e !== cv && !e.contains(cv)) e.style.visibility = 'hidden'; });
  const at = await ev(() => { const T = G.dbgW.trees; const t = T.slice().sort((a, b) => Math.hypot(a.x - 60, a.z) - Math.hypot(b.x - 60, b.z)); return [t[0], t.find(q => q.v !== t[0].v)].map(q => q && [q.x, q.z, q.v]); });
  console.log('arv', JSON.stringify(at));
  for (const [i, q] of at.entries()) { if (!q) continue; await ev(([x, z]) => { const p = G.p; p.x = x + 5; p.z = z + 3; p.yaw = p.root = Math.atan2(x - p.x, z - p.z); G.aimS.fy = p.yaw; G.aimS.fpit = 0.12; G.cyc = 700; }, q); await W(3000); await clean(); await shot('arv-' + i); }
  await ev(() => { const p = G.p; p.x = 130; p.z = 60; p.yaw = 2.4; G.aimS.fy = 2.4; G.aimS.fpit = 0.05; G.cyc = 1440; }); await W(4000); await shot('arv-campo');
};
