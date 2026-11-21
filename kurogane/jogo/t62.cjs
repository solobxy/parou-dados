// mira em primeira pessoa: W anda para onde olhas, D para a direita da vista
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.click('#sKit'); await W(2500);
  const g = await ev(() => { for (let i = 0; i < 6; i++) { const it = G.inv.belt[i]; if (it && it.att && it.att.scope) { G.sel = i; return it.k + ' ' + it.att.scope; } } return null; });
  console.log('arma com mira:', g);
  await ev(() => { G.p.x = 1500; G.p.z = 900; G.aimStart(true); }); await W(2500);
  const ang = d => Math.round(((Math.atan2(d[0], d[1]) * 180 / Math.PI) + 360) % 360);
  for (const [key, a0] of [['KeyW', 60], ['KeyD', 60], ['KeyW', 200], ['KeyA', 200]]) {
    await ev(a => { G.aimS.fy = a * Math.PI / 180; }, a0); const p0 = await ev(() => [G.p.x, G.p.z, G.fp]);
    await page.keyboard.down(key); await W(1500); await page.keyboard.up(key); await W(200);
    const p1 = await ev(() => [G.p.x, G.p.z]); const d = [p1[0] - p0[0], p1[1] - p0[1]];
    const want = key === 'KeyW' ? a0 : key === 'KeyD' ? a0 - 90 : a0 + 90;
    console.log(key, 'a olhar para', a0 + '°', '· primeira pessoa', p0[2], '· andou', Math.hypot(...d).toFixed(2), 'm para', ang(d) + '°', '· esperado', ((want + 360) % 360) + '°');
  }
  await shot('mira-fp');
};
