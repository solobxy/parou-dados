module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.waitForFunction('window.__ready === true', { timeout: 120000 }).catch(() => { }); await W(2000);
  await ev(() => { document.querySelector('#arw .atm.t0').click(); }); await W(600); for (let i = 0; i < +(process.env.KIT || 0); i++) { await ev(() => document.getElementById('arNextK').click()); await W(700); }
  const SETS = JSON.parse(process.env.LRS);
  for (let si = 0; si < SETS.length; si++) { await ev(v => { window.__lr = v; }, SETS[si]);
    for (const [lab, a] of [['f', 0], ['l', Math.PI / 2]]) { await ev(a => G.arenaPrev.dbgAng(a), a); await W(500); const cv = await page.$('#arw canvas'); await cv.screenshot({ path: __dirname + '/shots/lr-' + si + lab + '.png' }); } }
};
