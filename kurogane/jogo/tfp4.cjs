// PC: tecla V troca a vista; rato direito aponta; tecla V outra vez volta
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { for (const z of G.zs) z.x += 3000; const g = G.mkItem('m4'); g.att = {}; g.ammo = 30; G.inv.belt[3] = g; G.select(3); G.refresh(); }); await WG(1);
  await page.keyboard.press('KeyV'); await WG(0.8);
  console.log('V:', await ev(() => [G.fp, G.fpv.on, G.vm.kind, document.getElementById('tView').hidden]));
  await page.mouse.move(640, 360); await page.mouse.down({ button: 'right' }); await WG(0.8);
  console.log('botão direito:', await ev(() => [G.aimS.scope, +G.aimS.adsT.toFixed(2), G.fp]));
  await shot('fp4-mira');
  await page.mouse.up({ button: 'right' }); await WG(0.6);
  console.log('larga:', await ev(() => [G.aimS.scope, G.fp, G.fpv.on]));
  await page.keyboard.down('KeyW'); await WG(1); await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyV'); await WG(0.8);
  console.log('V outra vez:', await ev(() => [G.fp, G.fpv.on]));
  await shot('fp4-tp');
};
