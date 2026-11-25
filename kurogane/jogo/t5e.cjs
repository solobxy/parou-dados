// fase 5e: arma e braços na 1.ª pessoa com a mira de ponto vermelho
const fs = require('fs');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1200);
  await ev(() => { for (const z of G.zs) z.x += 3000; });
  for (const k of ['m4', 'ak', 'smg', 'caca', 'm249', 'pkm']) {
    await ev(k => { const g = G.mkItem(k); g.att = { scope: 'reddot', light: k === 'm4' ? 'lantArma' : undefined }; g.ammo = 20; G.inv.belt[5] = g; G.sel = 5; G.refresh(); G.scopeToggle(); }, k);
    await W(2200);
    const st = await ev(() => ({ fp: !!G.fp, vm: !!G.vmOn }));
    console.log(k, JSON.stringify(st)); await shot('5e-' + k);
    if (k === 'm4') { await ev(() => G.dbgFire()); await W(60); await shot('5e-m4-tiro'); }
    await ev(() => G.scopeToggle()); await W(900);
  }
  // à noite com visão noturna
  await ev(() => { G.cyc = 1710; G.inv.eq.eyes = G.mkItem('nvg'); const g = G.mkItem('m4'); g.att = { scope: 'reddot' }; g.ammo = 20; G.inv.belt[5] = g; G.refresh(); G.scopeToggle(); }); await W(2500); await shot('5e-noite');
  // mira 4x: continua a luneta (sem braços)
  await ev(() => { G.scopeToggle(); G.cyc = 900; const g = G.mkItem('m4'); g.att = { scope: 'mira4' }; g.ammo = 20; G.inv.belt[5] = g; G.refresh(); }); await W(800); await ev(() => G.scopeToggle()); await W(2000);
  console.log('mira4', JSON.stringify(await ev(() => ({ fp: !!G.fp, vm: !!G.vmOn })))); await shot('5e-mira4');
};
