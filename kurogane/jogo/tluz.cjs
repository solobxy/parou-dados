// luzes dentro dos prédios: de dia e de noite, com lâmpadas acesas, a piscar e partidas
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await ev(() => G.dbgKit()); await W(1200);
  const go = lb => ev(lb => { const c = G.W.containers.find(c => c.label === lb); if (!c) return null; const p = G.p; p.x = c.x + 1.2; p.z = c.z + 1.2; p.yaw = p.root = Math.atan2(c.x - p.x, c.z - p.z) + 0.6; G.aimS.fy = p.yaw; G.aimS.fpit = 0.12; return [c.x, c.z]; }, lb);
  for (const [lb, tag] of [['Revistar cozinha', 'casa'], ['Revistar caixa registadora', 'loja']]) {
    if (!await go(lb)) { console.log('sem', lb); continue; } await W(6000); await go(lb); await W(1500);
    const st = await ev(() => ({ cuts: G.W.cuts.filter(c => c.shell && G.p.x > c.x0 && G.p.x < c.x1 && G.p.z > c.z0 && G.p.z < c.z1).map(c => c.id + ':' + (c.lamps ? c.lamps.length : 0)).join(','), lv: G.p.lv, dentro: !!G.inside, lampadas: G.inside && G.inside.lamps ? G.inside.lamps.map(l => l.s + l.k).join(',') : '-' }));
    console.log(tag, JSON.stringify(st));
    await ev(() => { G.cyc = 750; }); await W(1500); await shot('luz-' + tag + '-dia');
    await ev(() => { G.cyc = 1710; }); await W(1500); await shot('luz-' + tag + '-noite');
    await ev(() => { G.cyc = 750; });
  }
};
