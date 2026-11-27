// imagens dos menus a partir do próprio jogo (sem interface por cima)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const clean = () => ev(() => { for (const e of document.querySelectorAll('body > *:not(canvas)')) if (e.id !== 'c' && !e.querySelector('canvas#c')) e.style.visibility = 'hidden'; });
  await ev(() => G.dbgKit()); await W(1500);
  const S = (process.env.KG_CAPA || 'survival').split(',');
  for (const k of S) {
    if (k === 'survival') { await ev(() => { const p = G.p; p.x = -2660; p.z = -2770; p.yaw = p.root = 2.6; G.fp = false; G.cyc = 1380; }); await W(9000); }
    if (k === 'objetos') { await ev(() => { const s = G.propStat.vend; const [x, z, ry] = s.at[1] || s.at[0]; const p = G.p, a = ry + 0.7; p.x = x + Math.sin(a) * 3.5; p.z = z + Math.cos(a) * 3.5; p.yaw = p.root = Math.atan2(x - p.x, z - p.z); G.aimS.fy = p.yaw; G.aimS.fpit = -0.1; G.fp = true; G.cyc = 600; }); await W(9000); }
    if (k === 'luzes') { await ev(() => { G.p.x = -160; G.p.z = -7; }); await W(5000); await ev(() => { const c = G.W.cuts.filter(c => c.shell && /Casa/.test(c.name || '') && c.lamps && c.lamps.some(l => l.s !== 'off')).sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - G.p.x, (a.z0 + a.z1) / 2 - G.p.z) - Math.hypot((b.x0 + b.x1) / 2 - G.p.x, (b.z0 + b.z1) / 2 - G.p.z))[0]; const l = c.lamps.find(l => l.s !== 'off'), p = G.p; p.x = l.x + 1.4; p.z = l.z + 1.4; p.yaw = p.root = Math.atan2(l.x - p.x, l.z - p.z) + 0.4; G.aimS.fy = p.yaw; G.aimS.fpit = 0.1; G.fp = true; G.cyc = 1710; }); await W(7000); }
    if (k === 'granada') { await ev(() => { G.inv.belt[4] = { id: 9e5, k: 'granada', n: 3 }; G.select(4); const p = G.p; p.x = 60; p.z = 1.5; p.yaw = p.root = 0.4; G.aimS.fy = 0.4; G.aimS.fpit = 0.05; G.fp = true; G.cyc = 1200; }); await W(3000); await ev(() => G.fireDown()); await W(2500); }
    await clean(); await W(400); await shot('capa-' + k); await ev(() => { for (const e of document.querySelectorAll('body > *')) e.style.visibility = ''; });
    if (k === 'granada') await ev(() => G.fireUp());
  }
};
