module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(500); await shot('70-inicio'); await page.evaluate(() => G.dbgKit()); await W(900);
  console.log('belt', await ev(() => G.inv.belt.map(b => b ? b.k + ':' + (b.ammo ?? '') + (b.att && Object.values(b.att).filter(Boolean).length ? '+' + Object.values(b.att).filter(Boolean).join('/') : '') : '-').join(' ')));
  console.log('eq', await ev(() => Object.values(G.inv.eq).map(v => v && v.k).join(',')), 'bag', await ev(() => G.inv.bag.list.map(e => e.it.k + 'x' + e.it.n).join(' ')));
  await ev(() => G.ui.openInv(null)); await W(400); await shot('71-kit-inv');
};
