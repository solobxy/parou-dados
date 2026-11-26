module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => { G.dbgKit(); }); await W(2500); await ev(() => { G.inv.belt.fill(null); G.inv.belt[0] = G.mkItem('faca'); G.sel = 0; G.refresh(); }); await W(1200);
  const V = [[-0.9, 0.35, 0], [0, 1, 0], [-0.5, 0.5, 0.7], [0, 0.4, 0.9]];
  for (let i = 0; i < V.length; i++) { await ev(v => { G.vm.dbg().D.place = [[1, [0.2, -0.36, 0.08], [0.06, -0.06, -0.38], [1, -1, 0.1], v, null, 'punho'], [0, [-0.2, -0.36, 0.08], [-0.1, -0.06, -0.38], [-1, -1, 0.1], [-v[0], v[1], v[2]], null, 'gatilho']]; }, V[i]); await W(900); await shot('p2-' + i); }
};
