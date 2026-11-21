module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(2500); await page.click('#sPlay'); await W(600); await page.fill('#pfN', 'Dinis'); await page.click('#pfOk'); await W(2500);
  await ev(() => G.toMenu()); await W(800);
  console.log(await ev(() => { const b = document.getElementById('pfC').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return JSON.stringify([b.x, b.y, b.width, b.height]) + ' topo=' + (e ? e.id + '.' + e.className : 'nada'); }));
  await shot('menu-volta');
};
