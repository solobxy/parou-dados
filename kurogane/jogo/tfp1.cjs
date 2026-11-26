// vista livre na 1.ª pessoa: olho liga/desliga, de mãos vazias, com arma branca, pistola e M4 (à anca e pela mira de ferro)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  const st = () => ev(() => ({ fp: !!G.fp, fpv: G.fpv.on, t: +G.fpv.t.toFixed(2), vm: G.vm.kind, vmOn: !!G.vmOn, body: G.p && G.p.alive, eye: !document.getElementById('tView').hidden, eyeTxt: document.getElementById('tView').textContent.trim(), ads: !document.getElementById('tAds').hidden, xh: document.getElementById('xh').className + (document.getElementById('xh').hidden ? ' (oculta)' : ''), sc: !document.getElementById('scope').hidden, fov: +G.dbgL.cam.fov.toFixed(1), fy: +G.aimS.fy.toFixed(2) }));
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { for (const z of G.zs) z.x += 3000; G.inv.belt.fill(null); G.sel = 0; G.refresh(); }); await WG(1);
  console.log('3.ª pessoa:', JSON.stringify(await st()));
  await shot('fp1-tp');
  await ev(() => G.viewToggle()); await WG(0.15); console.log('a meio:', JSON.stringify(await st())); await WG(0.6);
  console.log('mãos vazias:', JSON.stringify(await st())); await shot('fp1-maos');
  // rodar a vista com o polegar direito e andar para a frente
  await ev(() => G.aimDrag(-120, 30)); await WG(0.2); console.log('depois de arrastar:', JSON.stringify(await st()));
  await ev(() => { G.sticks.L = { x: 0, y: -1, m: 1 }; }); await WG(1); const p1 = await ev(() => [G.p.x, G.p.z, G.aimS.fy]); await ev(() => { G.sticks.L = null; });
  console.log('andou (x, z, fy):', p1.map(v => +v.toFixed(2)));
  await ev(() => G.tapAttack()); await WG(0.18); await shot('fp1-soco'); await WG(0.6);
  // arma branca
  await ev(() => { G.inv.belt[1] = G.mkItem('machado'); G.select(1); G.refresh(); }); await WG(0.6); console.log('machado:', JSON.stringify(await st())); await shot('fp1-machado');
  await ev(() => G.tapAttack()); await WG(0.2); await shot('fp1-golpe'); await WG(0.6);
  // pistola
  await ev(() => { const g = G.mkItem('pistola'); g.ammo = 12; G.inv.belt[2] = g; G.select(2); G.refresh(); }); await WG(0.6); console.log('pistola:', JSON.stringify(await st())); await shot('fp1-pistola');
  const a0 = await ev(() => G.inv.belt[2].ammo); await ev(() => { G.fireDown(); G.fireUp(); }); await WG(0.6); console.log('disparou (balas antes/depois):', a0, await ev(() => G.inv.belt[2].ammo));
  // M4: à anca, depois pela mira de ferro
  await ev(() => { const g = G.mkItem('m4'); g.att = {}; g.ammo = 30; G.inv.belt[3] = g; G.select(3); G.refresh(); }); await WG(0.6); console.log('m4 anca:', JSON.stringify(await st())); await shot('fp1-m4');
  await ev(() => G.scopeToggle()); await WG(0.8); console.log('m4 mira:', JSON.stringify(await st())); await shot('fp1-m4-mira');
  await ev(() => G.scopeToggle()); await WG(0.6); console.log('m4 sai da mira:', JSON.stringify(await st()));
  // voltar à 3.ª pessoa
  await ev(() => G.viewToggle()); await WG(0.8); console.log('3.ª outra vez:', JSON.stringify(await st())); await shot('fp1-tp2');
  console.log('guardado:', await ev(() => JSON.parse(localStorage.getItem('kurogane-cfg-v1')).fpView));
};
