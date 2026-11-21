module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
  const t0 = Date.now();
  await page.click('#sPlay').catch(() => page.click('#sCont')); await W(2500);
  console.log('arranque', Date.now() - t0, 'ms; jogador em', await ev(() => G.p.x.toFixed(0) + ',' + G.p.z.toFixed(0) + ' setores=' + G.sectors.loaded.size + ' nós=' + G.dbgNodes));
  console.log('zonas:', await ev(() => G.W.zones.length + ' zombies=' + G.zs.length + ' rects=' + G.W.rects.length + ' casas=' + G.W.cuts.length));
  await shot('fora-1');
  // andar 400 m pela estrada (teleporte em passos)
  for (let i = 0; i < 8; i++) { await ev(() => { G.p.x += Math.sign(-G.p.x || 1) * 50; }); await W(400); }
  console.log('depois de andar:', await ev(() => G.p.x.toFixed(0) + ',' + G.p.z.toFixed(0) + ' setores=' + G.sectors.loaded.size));
  await W(1500); await shot('fora-2');
  // ir a uma vila de fora
  await ev(() => { const v = G.W.zones.find(z => z.name === 'Kawabe'); G.p.x = v.x + 3; G.p.z = v.z + 3; }); await W(2500); await shot('fora-vila');
  console.log('vila:', await ev(() => { const v = G.W.zones.find(z => z.name === 'Kawabe'); return v.x + ',' + v.z + ' zombies perto=' + G.zs.filter(z => Math.hypot(z.x - v.x, z.z - v.z) < 60).length; }));
};
