// clarão do cano: o teu (na arma da mão) e o dos outros (no mundo)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.waitForFunction('window.__ready === true', { timeout: 120000 }).catch(() => { }); await W(1500);
  await ev(() => G.dbgKit()); await W(1200);
  await ev(() => { G.sel = 0; const it = G.inv.belt[0]; it.att = {}; G.ui.refresh && G.ui.refresh(true); }); await W(500);
  const r = await ev(() => { G.dbgFlashHold = true; G.p.cd = 0; G.p.reload = 0; return G.dbg.fire(); }); await W(400); await shot('clarao-meu');
  console.log('disparou', r);
};
