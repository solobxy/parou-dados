// pré-visualização dos kits na arena: cada arma vista de frente e de lado (KG_ARENA=1)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.waitForFunction('window.__ready === true', { timeout: 120000 }).catch(() => { }); await W(2000);
  await ev(() => { document.querySelector('#arw .atm.t0').click(); }); await W(600);
  const names = ['Atirador', 'Assalto', 'Sniper', 'Pesado', 'Apoio'];
  for (let i = 0; i < 5; i++) {
    const nm = await ev(() => document.querySelector('#arw .akh b').textContent);
    for (const [lab, a] of [['frente', 0], ['lado', Math.PI / 2], ['tras3q', 2.4]]) { await ev(a => G.arenaPrev.dbgAng(a), a); await W(700);
      const cv = await page.$('#arw canvas'); if (cv) await cv.screenshot({ path: __dirname + '/shots/kit-' + nm + '-' + lab + '.png' }); }
    await ev(() => document.getElementById('arNextK').click()); await W(900);
  }
};
