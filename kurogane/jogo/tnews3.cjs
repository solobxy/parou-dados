// imagem das novidades: inventário com as cores de raridade
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { for (const [k, n] of [['cheytac', 1], ['ak', 1], ['granada', 2], ['medkit', 1], ['capacetec', 1], ['mira8', 1]]) G.gain(k, n); G.ui.openInv(null); }); await W(1200);
  await page.screenshot({ path: '/tmp/kg/news3.png' });
};
