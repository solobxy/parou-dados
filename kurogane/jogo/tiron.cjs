// primeira pessoa pela mira de ferro: M4 sem mira, botão Mira mostra a arma e um ponto branco
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 120000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { for (const z of G.zs) z.x += 3000; const g = G.mkItem('m4'); g.att = {}; g.ammo = 30; G.inv.belt[5] = g; G.sel = 5; G.refresh(); }); await WG(1);
  console.log('botão mira visível:', await ev(() => !document.getElementById('tScope').hidden));
  await ev(() => G.scopeToggle()); await WG(1.5);
  console.log('fp:', await ev(() => [!!G.fp, !!G.vmOn, document.getElementById('scope').className]));
  await shot('iron');
};
