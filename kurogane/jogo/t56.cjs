module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
  await page.click('#sPlay').catch(() => page.click('#sCont')); await W(2500);
  await ev(() => { const v = G.W.zones.find(z => z.name === 'Kawabe'); G.p.x = v.x + 30; G.p.z = v.z + 20; }); await W(2500);
  await shot('mini-fora');
  await page.click('#bMap'); await W(600); await shot('mapa-tudo');
  await page.click('#mZoom'); await W(600); await shot('mapa-perto');
  await page.click('#mClose'); await ev(() => { G.p.x = 40; G.p.z = 40; }); await W(1500);
  await page.click('#bMap'); await W(400); await page.click('#mZoom'); await W(400); await shot('mapa-centro-perto');
};
