// fase 5d: armas pesadas, ghillie, visão noturna, capacetes e coletes de cores
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  const r = await ev(() => { const out = {}; for (const k of ['cheytac', 'barrett', 'm249', 'pkm', 'a408', 'a50', 'a754', 'c408', 'c50', 'cM249', 'cPKM', 'ghillie', 'nvg', 'capacetec', 'coleteu', 'capaceted', 'coletep']) out[k] = (G.ICONS[k] || '').length > 2000; return out; });
  console.log('ícones:', JSON.stringify(r));
  // equipa ghillie, NVG, capacete camuflado e colete urbano; CheyTac com mira 8x na mão
  await ev(() => { const I = G.inv; I.eq.head = G.mkItem('capacetec'); I.eq.vest = G.mkItem('coleteu'); I.eq.suit = G.mkItem('ghillie'); I.eq.eyes = G.mkItem('nvg');
    const g = G.mkItem('cheytac'); g.att = { scope: 'mira8', sup: 'silR' }; g.ammo = 7; I.belt[5] = g; G.sel = 5; G.refresh(); for (const z of G.zs) z.x += 9000; });
  await W(1200); await shot('5d-dia');
  const vis = await ev(() => { const b = G.dbgBody ? G.dbgBody() : null; return b ? Object.entries(b.gear).filter(([k, m]) => m.visible).map(([k]) => k) : 'sem dbgBody'; });
  console.log('peças visíveis:', JSON.stringify(vis));
  await ev(() => { G.cyc = 1710; }); await W(2500);
  const nv = await ev(() => ({ nv: G.nv, cls: document.querySelector('canvas.nvg') ? 1 : 0 })); console.log('noite:', JSON.stringify(nv));
  await shot('5d-noite-nvg');
  await ev(() => { G.inv.eq.eyes = null; G.refresh(); }); await W(1500); console.log('sem NVG:', JSON.stringify(await ev(() => ({ nv: G.nv, cls: document.querySelector('canvas.nvg') ? 1 : 0 }))));
  await shot('5d-noite-sem');
  await ev(() => { G.cyc = 900; G.ui.openInv(); }); await W(1200); await shot('5d-inventario');
  // disparar cada arma pesada uma vez (sem erros) com balas
  const fired = await ev(async () => { const sl = ms => new Promise(r => setTimeout(r, ms)), o = {}; G.ui.closeInv && G.ui.closeInv();
    for (const k of ['cheytac', 'barrett', 'm249', 'pkm']) { const g = G.mkItem(k); g.ammo = 5; G.inv.belt[5] = g; G.sel = 5; G.refresh(); await sl(400); const a0 = g.ammo; try { G.dbgFire ? G.dbgFire() : null; } catch (e) { o[k] = 'erro ' + e.message; continue; } await sl(600); o[k] = a0 + '→' + g.ammo; }
    return o; });
  console.log('tiros:', JSON.stringify(fired));
};
