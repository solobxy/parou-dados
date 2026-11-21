// carros: entrar, conduzir (teclado e polegar), gasolina, sair
module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.click('#sPlay'); await W(2500);
  const n = await ev(() => G.cars.list.map(c => c.id + '@' + Math.round(c.x) + ',' + Math.round(c.z)).join(' ')); console.log('carros:', n);
  const c0 = await ev(() => { const c = G.cars.list[0]; G.p.x = c.x + Math.cos(c.yaw) * 1.6; G.p.z = c.z - Math.sin(c.yaw) * 1.6; return [c.id, c.x, c.z, c.yaw, c.fuel]; }); await W(600);
  console.log('aviso perto do carro:', await ev(() => G.prompt && G.prompt.label));
  await ev(() => G.interact()); await W(500);
  console.log('dentro:', await ev(() => [!!G.car, G.carSeat, document.getElementById('aN').textContent, document.getElementById('aW').textContent]));
  if (mode === 'desktop') { await page.keyboard.down('KeyW'); await W(4000); await page.keyboard.up('KeyW'); }
  else { await ev(() => { const c = G.car; G.sticks.L = { x: Math.sin(c.yaw) > 0 ? 0.3 : -0.3, y: -0.95, m: 1 }; }); await W(4000); await ev(() => { G.sticks.L = null; }); }
  const r = await ev(() => { const c = G.car; return [Math.round(c.x), Math.round(c.z), +c.v.toFixed(1), +c.fuel.toFixed(2), Math.round(c.hp), document.getElementById('aN').textContent, document.getElementById('aW').textContent, Math.round(G.p.x), Math.round(G.p.z)]; });
  console.log('depois de acelerar 4 s:', JSON.stringify(r), '· saiu de', JSON.stringify(c0.slice(1, 3).map(Math.round)));
  await shot('carro-a-conduzir');
  await W(3000); await ev(() => G.interact()); await W(500);
  console.log('fora:', await ev(() => [!!G.car, Math.round(G.p.x), Math.round(G.p.z), G.prompt && G.prompt.label]));
  // gasolina: com o galão na mão
  await ev(() => { G.inv.belt[0] = G.dbg.item('gasolina', 1); G.sel = 0; }); await W(500);
  console.log('aviso com galão:', await ev(() => G.prompt && G.prompt.label)); await ev(() => G.interact()); await W(300);
  console.log('gasolina depois:', await ev(() => [Math.round(G.cars.list[0].fuel), !!G.inv.belt[0]]));
};
