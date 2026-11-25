// bater sozinho num recurso até partir; parar ao mexer
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await page.waitForTimeout(1200);
  const r = await ev(() => { for (const z of G.zs) z.x += 3000; const N = G.dbgNodes().filter(n => n.alive && n.kind === 'tree'); const p = G.p; N.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)); const n = N[0]; window.__n = n;
    const a = Math.random() * 6.28; p.x = n.x + Math.sin(a) * (n.r + 0.9); p.z = n.z + Math.cos(a) * (n.r + 0.9); const it = G.mkItem('machado'); G.inv.belt[5] = it; G.sel = 5; G.refresh(); return { hp: n.hp, max: n.max }; });
  console.log('árvore:', JSON.stringify(r)); await WG(0.5);
  await ev(() => G.fireDown()); await ev(() => G.fireUp());
  await WG(6); console.log('6 s depois de um toque:', JSON.stringify(await ev(() => ({ hp: window.__n.hp, alive: window.__n.alive, farm: !!G.farm, wood: G.inv.count('madeira') }))));
  await WG(25); console.log('mais 25 s:', JSON.stringify(await ev(() => ({ hp: window.__n.hp, alive: window.__n.alive, farm: !!G.farm }))));
};
