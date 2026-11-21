module.exports = async (page, shot) => {
  const W = ms => page.waitForTimeout(ms);
  await page.evaluate(() => G.dbgKit()); await W(2500);
  await page.click('#bSet'); await W(600);
  const r = await page.evaluate(() => { const rows = [...document.querySelectorAll('#set *')].filter(e => /Música em jogo/.test(e.textContent) && e.children.length < 4); const el = rows[rows.length - 1]; el.scrollIntoView({ block: 'center' }); const inp = [...document.querySelectorAll('#set input[type=range]')]; return inp.length; });
  console.log('sliders:', r); await W(400); await shot('set-som');
};
