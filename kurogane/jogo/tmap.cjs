// mapa: + e −, tu com anel, colegas (perto e fora da vista)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2000);
  await ev(() => { const p = G.p; G.net.on = true; G.net.clanCmd = () => {}; G.net.mates = () => [{ name: 'Rui', x: p.x + 900, z: p.z - 700 }, { name: 'Ana', x: p.x + 40, z: p.z + 30 }]; G.ui.toggleMap(true); }); await W(700);
  const st = () => ev(() => [document.getElementById('mScale').textContent, document.getElementById('mIn').disabled, document.getElementById('mOut').disabled]);
  console.log('início', JSON.stringify(await st())); await shot('mapa-0');
  for (let i = 0; i < 2; i++) { await page.click('#mIn'); await W(400); } console.log('+ +', JSON.stringify(await st())); await shot('mapa-2');
  for (let i = 0; i < 2; i++) { await page.click('#mIn'); await W(300); } console.log('+ + + (máx)', JSON.stringify(await st())); await shot('mapa-4');
  await page.click('#mOut'); await W(300); console.log('−', JSON.stringify(await st()));
};
