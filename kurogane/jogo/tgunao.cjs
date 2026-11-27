// armas com sombra cozida e arestas gastas: captura na 1.ª pessoa
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await ev(() => G.dbgKit()); await W(1200);
  for (const k of (process.env.KG_GUNS || 'm4').split(',')) {
    await ev(k => { const it = G.inv.belt[0]; it.k = k; it.att = {}; G.select(1); G.select(0); const p = G.p; p.x = 60; p.z = 1.5; p.yaw = p.root = 2.2; G.aimS.fy = 2.2; G.aimS.fpit = 0.05; }, k); await W(2500); await shot('arma-' + k);
  }
};
