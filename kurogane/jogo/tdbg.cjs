module.exports = async (page) => { await page.evaluate(() => G.dbgKit()); await page.waitForTimeout(1500);
  await page.evaluate(() => { G.ui.refresh(true); G.ui.openInv(null); }); await page.waitForTimeout(800);
  console.log(JSON.stringify(await page.evaluate(() => ['#cEq', '.doll', '.pfw', '#cBelt', '.eqc', '.ibody'].map(s => { const e = document.querySelector(s), r = e.getBoundingClientRect(), cs = getComputedStyle(e); return [s, Math.round(r.top), Math.round(r.height), cs.gridTemplateRows || '', cs.display]; })))); };
