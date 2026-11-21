module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(600); await page.click('#sPlay'); await W(600);
  await ev(() => { G.gain('pistola', 1); G.gain('a9', 24); G.zs.length = 0; });
  console.log(await ev(() => { const i = G.inv.belt.findIndex(b => b && b.k === 'pistola'); G.select(i); const r0 = G.p.reload; G.reload(); return [i, G.sel, r0, G.p.reload, G.inv.belt[G.sel].ammo].join(' '); }));
  for (let k = 0; k < 6; k++) { await W(500); console.log(await ev(() => [G.p.reload.toFixed(2), G.inv.belt[G.sel].ammo, G.t.toFixed(1)].join(' '))); }
};
