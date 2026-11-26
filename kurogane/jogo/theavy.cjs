module.exports = async (page, shot) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { for (const k of [...G.inv.bag.list]) G.inv.bag.remove(k.it); for (const k of ['cheytac', 'barrett', 'm249', 'pkm']) G.inv.bag.insert(G.mkItem(k), G.inv.rows()); G.ui.refresh(true); G.ui.openInv(null); }); await W(1200); await shot('inv-pesadas'); };
