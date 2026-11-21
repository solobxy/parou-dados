module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.click('#sPlay'); await W(1200); await ev(() => { document.getElementById('toast').hidden = true; });
  await page.click('#bMap'); await W(1200); await shot('d0-mapa');
};
