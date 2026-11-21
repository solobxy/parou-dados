const base = require('./t44.cjs');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await base(page, async () => {});
  await ev(() => { G.cyc = 700; });
  // de fora, com a planta na mão a apontar para a 2.ª fundação (parede nova)
  await ev(() => { const P = [...G.base.pieces.values()].find(P => P.t === 'fund' && P.i === Math.max(...[...G.base.pieces.values()].filter(q => q.t === 'fund').map(q => q.i))); G.p.x = P.i * 3 + 1.5; G.p.z = P.j * 3 + 4.6; G.p.yaw = G.p.root = Math.PI; const i = G.inv.belt.findIndex(b => b && b.k === 'planta'); G.select(i); G.base.setMode('parede'); });
  console.log('cinto:', await ev(() => G.inv.belt.map(b => b && b.k).join(',') + ' sel=' + G.sel + ' buildK=' + G.buildK)); await W(1500); console.log('depois:', await ev(() => 'sel=' + G.sel + ' buildK=' + G.buildK + ' barra=' + !document.getElementById('build').hidden)); await shot('base-dia');
  await ev(() => { const i = G.inv.belt.findIndex(b => b && b.k === 'martelo'); if (i >= 0) G.select(i); }); await W(800); await shot('base-martelo');
};
