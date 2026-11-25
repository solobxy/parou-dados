// pedra solta e planta de fibra: apanham-se com um toque; tecido faz ligaduras
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1500);
  console.log('no mapa:', JSON.stringify(await ev(() => { const c = {}; for (const n of G.dbgNodes()) if (n.pick) c[n.kind] = (c[n.kind] || 0) + 1; return c; })));
  for (const k of ['seixo', 'fibra']) {
    await ev(k => { let b = null, bd = 1e9; for (const n of G.dbgNodes()) if (n.kind === k && n.alive) { const d = Math.hypot(n.x - G.p.x, n.z - G.p.z); if (d < bd) { bd = d; b = n; } } G.p.x = b.x + 0.8; G.p.z = b.z; window._n = b; for (const z of G.zs) if (Math.hypot(z.x - G.p.x, z.z - G.p.z) < 50) z.x += 400; }, k);
    await WG(0.8); if (k === 'fibra') { const u = await ev(() => G.dbgCam([_n.x + 1.6, 1.1, _n.z + 1.2], [_n.x, 0.3, _n.z], 45, 500, 350)); require('fs').writeFileSync(__dirname + '/shots/fibra.jpg', Buffer.from(u.split(',')[1], 'base64')); }
    const lab = await ev(() => G.prompt && G.prompt.label); const before = await ev(k => G.inv.count(k === 'seixo' ? 'pedra' : 'tecido'), k);
    await ev(() => G.interact()); await WG(0.3); const after = await ev(k => G.inv.count(k === 'seixo' ? 'pedra' : 'tecido'), k);
    console.log(k, lab, before, '→', after, after > before && !(await ev(() => _n.alive)) ? 'OK' : 'FALHA');
  }
  await ev(() => { G.inv.bag.insert(G.mkItem('tecido', 6), G.inv.rows()); G.ui.refresh(true); G.ui.openInv(null, 'craft'); }); await WG(0.5); await shot('craft-ligadura');
};
