module.exports = async (page) => { await page.evaluate(() => G.dbgKit()); await page.waitForTimeout(2500);
  console.log('LUZES', JSON.stringify(await page.evaluate(() => { const o = {}; G.dbgL.scene.traverse(l => { if (l.isLight) { const k = l.type + (l.castShadow ? '+S' : ''); o[k] = (o[k] || 0) + 1; } }); return o; }))); };
