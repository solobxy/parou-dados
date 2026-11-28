// a conduzir: as casas não desaparecem (sem cortes de telhado/paredes); a construir: 1.ª pessoa com a peça onde aponta a mira
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  const spot = await ev(() => { const C = G.dbgW.cuts.filter(c => c.shell && !c.lv); const c = C.sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - 140, (a.z0 + a.z1) / 2 + 20) - Math.hypot((b.x0 + b.x1) / 2 - 140, (b.z0 + b.z1) / 2 + 20))[0]; return [c.x0 - 6, (c.z0 + c.z1) / 2]; });
  await ev(s => { G.fpFree = false; G.FP_ONLY = false; const p = G.p; p.x = s[0] - 3; p.z = s[1]; const c = G.cars.dbgAdd('sedan', s[0], s[1] + 4, 0); G.cars.enter(c); }, spot); await W(1000);
  await ev(() => { G.dbgDrive = { kb: true, t: 0.6, s: 0 }; }); await W(5000); await ev(() => { G.dbgDrive = { kb: true, t: -1, s: 0 }; }); await W(1500);
  const r = await ev(() => { const p = G.p; let hid = 0, near = 0; for (const c of G.dbgW.cuts) { if (!c.shell) continue; if (Math.abs((c.x0 + c.x1) / 2 - p.x) > 40 || Math.abs((c.z0 + c.z1) / 2 - p.z) > 40) continue; near++; if (!c.gR.visible || c.gt.some(g => !g.visible)) hid++; } return { car: !!G.car, near, hid }; });
  await page.screenshot({ path: '/tmp/kg/carcut.png' });
  console.log(JSON.stringify(r)); console.log((r.car && r.near > 0 && r.hid === 0 ? 'OK   ' : 'FALHA') + ' a conduzir nenhuma casa perto fica cortada');
  await ev(() => { G.dbgDrive = null; G.cars.exit(); }); await W(1500);
  await ev(() => { G.inv.belt[5] = G.mkItem('planta', 1); G.select(5); }); await W(2500);
  const b = await ev(() => ({ fp: !!G.fp, ag: !!(G.aimGround && G.aimGround()) }));
  console.log((b.ag ? 'OK   ' : 'FALHA') + ' a construir fica na 1.ª pessoa e a peça segue a mira ' + JSON.stringify(b));
  await ev(() => { G.aimS.fpit = -0.45; }); await W(1500); await page.screenshot({ path: '/tmp/kg/buildfp.png' });
};
