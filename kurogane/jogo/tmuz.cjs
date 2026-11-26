// onde nasce o rasto da bala no ecrã (deve ser a ponta do cano)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2500); await ev(() => { for (const z of G.zs) z.x += 3000; });
  for (const k of ['m4', 'pistola']) {
    await ev(k => { const i = G.inv.belt.findIndex(x => x && x.k === k); G.sel = -1; G.select ? G.select(i) : (G.sel = i); G.refresh(); }, k); await W(1500);
    const q = await ev(() => { const v = new G.V2(); const r = G.vmMuzzle(v); return r ? [Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)] : null; });
    console.log(k, 'ponta do cano no ecrã:', JSON.stringify(q)); await shot('muz-' + k);
  }
};
