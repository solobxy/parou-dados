module.exports = async (page, shot) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  for (const [i, nm] of [[2, 'pistola'], [3, 'cacadeira']]) { await ev(i => { G.aimEnd && G.aimEnd(); G.select(i); }, i); await W(800); await ev(() => { G.aimStart(true); G.scopeToggle(); }); await W(2600); await shot('fpv-' + nm); }
  await ev(() => { G.aimEnd && G.aimEnd(); const e = G.inv.bag.list.find(e => e.it.k === 'ak') ; }); };
