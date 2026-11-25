// ícones novos no inventário
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1200);
  await ev(() => { const I = G.inv; I.bag.list = []; for (const k of ['barrett', 'cheytac', 'm249', 'pkm', 'c50', 'c408', 'cM249', 'cPKM', 'a408', 'a50', 'a754', 'nvg']) { const it = G.mkItem(k, k[0] === 'a' ? 20 : 1); I.bag.insert(it, I.rows()); }
    I.eq.head = G.mkItem('capaceteu'); I.eq.vest = G.mkItem('coleted'); I.eq.suit = G.mkItem('ghillie'); I.eq.eyes = G.mkItem('nvg'); G.refresh(); G.ui.openInv(); });
  await W(1200); await shot('5d-icones');
};
