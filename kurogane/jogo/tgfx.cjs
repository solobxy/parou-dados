// gráficos: rua de dia, ao pôr do sol, interior do terminal e a olhar ao longe (as sombras perto de ti não desaparecem)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await ev(() => G.dbgKit()); await W(1200);
  const go = async (x, z, a, pit, cyc, name, far) => { await ev(([x, z, a, pit, cyc, far]) => { const p = G.p; p.x = x; p.z = z; p.lv = 0; p.yaw = p.root = a; G.aimS.fy = a; G.aimS.fpit = pit; G.cyc = cyc; if (far) G.aimS.dist = far; }, [x, z, a, pit, cyc, far || 0]); await W(5500); await shot('gfx-' + name); };
  await go(-160, -7, 1.57, -0.05, 750, 'rua-dia');
  await go(-160, -7, 1.57, -0.05, 1190, 'rua-tarde');
  await go(-160, -7, 1.57, -0.05, 1500, 'rua-noite');
  await go(2575, -2590, 1.82, 0.2, 750, 'terminal');
  await go(-150, 20, 0.2, -0.25, 800, 'longe', 60);
  console.log('dist', await ev(() => [G.aimS.dist, G.fp]));
};
