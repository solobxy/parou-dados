// exporta as colisões da arena para o servidor (bots): KG_ARENA=1 node test.cjs texpcol.cjs desktop
module.exports = async (page) => {
  await page.waitForFunction('window.__ready === true', { timeout: 120000 }).catch(() => { }); await page.waitForTimeout(1500);
  const J = await page.evaluate(() => G.dbgArenaCols());
  require('fs').writeFileSync(process.env.KG_OUT || 'arena-col.json', JSON.stringify(J));
  console.log('rects', J.rects.length, 'circ', J.circ.length, 'steps', J.steps.length, 'portas', J.rects.filter(r => r[7]).length, 'janelas', J.rects.filter(r => r[8]).length, 'lv1', J.rects.filter(r => r[5]).length);
};
