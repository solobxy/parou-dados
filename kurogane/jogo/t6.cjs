module.exports = async (page, shot, mode) => {
  await page.waitForTimeout(800); await shot('40-inicio');
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500); await shot('41-retrato');
};
