module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  console.log(await ev(() => { for (const [s, k] of [['head', 'capacetec'], ['vest', 'coleted'], ['back', 'mochilaC'], ['eyes', 'nvg']]) G.inv.eq[s] = G.mkItem(k); G.refresh(); const b = G.body; return JSON.stringify({ eq: Object.fromEntries(Object.entries(G.inv.eq).map(([s, i]) => [s, i && i.k])), vis: Object.keys(b.gear).filter(k => b.gear[k].visible), keys: Object.keys(b.gear) }); }));
};
