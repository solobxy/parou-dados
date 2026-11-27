// vidros dos carros transparentes: vê-se o interior (bancos, volante, quem vai lá dentro)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await ev(() => G.dbgKit()); await W(1500);
  console.log('tipos:', await ev(() => [...new Set(G.cars.list.map(c => c.k))].join(',')));
  for (const k of ['sedan', 'suv', 'van', 'humvee', 'sport', 'coupe']) {
    const ok = await ev(k => { const c = G.cars.list.find(q => q.k === k && !q.dead); if (!c) return false; const a = c.yaw + Math.PI / 2 + 0.5; G.p.x = c.x + Math.sin(a) * 4.2; G.p.z = c.z + Math.cos(a) * 4.2; G.p.yaw = G.p.root = Math.atan2(c.x - G.p.x, c.z - G.p.z); G.fp = false; c.m.heads[0].visible = true; return true; }, k);
    if (!ok) { console.log('sem', k); continue; }
    await W(1800); await shot('vidro-' + k);
  }
  const c = await ev(() => { const c = G.cars.list.find(q => q.k === 'sedan'); G.p.x = c.x + 2.5; G.p.z = c.z; return !!c; }); await W(800);
  await ev(() => { const c = G.cars.list.find(q => q.k === 'sedan'); G.cars.enter(c); G.fp = true; }); await W(1800); await shot('vidro-dentro');
};
