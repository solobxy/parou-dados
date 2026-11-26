// 1.ª pessoa: braços reais, recargas por arma (fotogramas), ligadura, comer, beber, granada, punhos e arma branca
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await WG(1.5);
  await ev(() => { for (const z of G.zs) z.x += 3000; G.inv.belt.fill(null); G.sel = 0; G.refresh(); }); await WG(0.5);
  await ev(() => G.viewToggle()); await WG(0.8);
  if (process.env.NOHUD) await ev(() => { const st = document.createElement('style'); st.textContent = 'body *:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}'; document.head.appendChild(st); });
  const only = (process.env.VMW || 'm4,pistola,cacadeira,caca,ak').split(',');
  const F = (process.env.VMF || '0.05,0.16,0.3,0.5,0.6,0.7,0.85').split(',').map(Number);
  let slot = 1;
  for (const w of only) {
    await ev(w => { const g = G.mkItem(w); g.att = {}; g.ammo = 5; G.inv.belt[1] = g; G.sel = -1; G.select(1); G.refresh(); }, w); await WG(0.8);
    await shot('vm-' + w + '-anca');
    if (!process.env.NOADS && w !== 'pistola' && w !== 'revolver') { await ev(() => G.scopeToggle()); await WG(0.7); await shot('vm-' + w + '-mira'); await ev(() => G.scopeToggle()); await WG(0.5); }
    for (const f of F) { await ev(f => { G.vmDbg = { rp: f }; }, f); await WG(0.12); await shot('vm-' + w + '-r' + Math.round(f * 100)); if (process.env.DBGL) console.log(f, JSON.stringify(await ev(() => { const d = G.vm.dbg(); return { last: d.arms.last, rig: d.rig.position.toArray().map(x => +x.toFixed(3)), rr: d.rig.rotation.toArray().slice(0,3).map(x => +x.toFixed(3)), pr: d.piv.rotation.toArray().slice(0,3).map(x => +x.toFixed(3)) }; }))); }
    await ev(() => { G.vmDbg = null; }); slot++;
  }
  if (!process.env.NOHANDS) {
    await ev(() => { G.inv.belt[1] = null; G.select(0); G.refresh(); }); await WG(0.5); await shot('vm-maos');
    await ev(() => G.tapAttack()); await WG(0.12); await shot('vm-soco');
    await ev(() => { G.inv.belt[2] = G.mkItem('machado'); G.select(2); G.refresh(); }); await WG(0.6); await shot('vm-machado');
    await ev(() => { G.inv.belt[3] = G.mkItem('granada'); G.select(3); G.refresh(); }); await WG(0.6); await shot('vm-granada');
    for (const f of [0.2, 0.4, 0.55]) { await ev(f => { G.vmDbg = { thr: f }; }, f); await WG(0.12); await shot('vm-gran' + Math.round(f * 100)); }
    for (const [k, f] of [['heal', 0.3], ['heal', 0.5], ['eat', 0.5], ['drink', 0.5]]) { await ev(([k, f]) => { G.vmDbg = { use: { kind: k, t: f } }; G.inv.belt[3] = null; G.select(0); }, [k, f]); await WG(0.15); await shot('vm-use-' + k + Math.round(f * 100)); }
    await ev(() => { G.vmDbg = null; });
  }
};
