// só 1.ª pessoa: arma sempre pronta, disparo à anca, botão Mira com mira de ferro, sem botão Baixar nem 3.ª pessoa
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await WG(1);
  await ev(() => { for (const z of G.zs) z.x += 3000; const g = G.mkItem('m4'); g.att = {}; g.ammo = 30; G.inv.belt[1] = g; G.select(1); G.refresh(); }); await WG(0.8);
  const st = () => ev(() => ({ fp: !!G.fp, aim: G.aimS.on, fpv: G.fpv.on, scope: G.aimS.scope, view: getComputedStyle(document.getElementById('tView')).display, lower: document.getElementById('tLower').hidden, ads: document.getElementById('tAds').hidden, ammo: G.inv.belt[1].ammo }));
  console.log('pronta:', JSON.stringify(await st()));
  await ev(() => { G.fireDown(); G.fireUp(); }); await WG(0.3); console.log('tiro à anca:', JSON.stringify(await st()));
  await ev(() => G.scopeToggle()); await WG(0.6); console.log('mira:', JSON.stringify(await st())); await shot('fp2-mira');
  await ev(() => { G.fireDown(); G.fireUp(); }); await WG(0.3); console.log('tiro na mira:', JSON.stringify(await st()));
  await ev(() => G.scopeToggle()); await WG(6); console.log('6 s parado:', JSON.stringify(await st())); await shot('fp2-anca');
};
