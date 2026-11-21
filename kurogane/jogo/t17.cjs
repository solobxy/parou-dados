// escadas livres, mira só com tiro limpo, espreitar, janelas em 1.ª pessoa, limite do mapa, treino
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(300);
  console.log('ko skipped', await ev(() => G.W.koSkipped || 0), 'blockers', JSON.stringify(await ev(() => G.W.koCheck())));
  await page.evaluate(() => G.dbgKit()); await W(1500);
  // zombies longe para não estragarem os testes
  await ev(() => { for (const z of G.zs) { z.x = z.hx = 250; z.z = z.hz = 250; } });
  // 1) zombie atrás da parede sul dos Apartamentos: não pode prender
  const lockT = async (px, pz, zx, zz) => ev(([px, pz, zx, zz]) => { const p = G.p; p.x = px; p.z = pz; p.y = 0.03; p.lv = 0; p.yaw = p.root = Math.atan2(zx - px, zz - pz); const z = G.zs[0]; Object.assign(z, { x: zx, z: zz, hx: zx, hz: zz, state: 'wander', hp: 80, lv: 0, y: 0, hide: false, _lkT: 0, vis: true }); G.aimS.on = true; G.aimS.lock = null; G.relock(); const r = !!G.aimS.lock; G.aimEnd(); return r; }, [px, pz, zx, zz]);
  console.log('lock atrás da parede (quer false):', await lockT(-23.6, -27, -23.6, -34));
  console.log('lock à vista (quer true):', await lockT(-23.6, -27, -23.6, -20));
  await ev(() => { const z = G.zs[0]; z.x = z.hx = 250; z.z = z.hz = 250; });
  // 2) espreitar atrás de uma árvore
  const tr = await ev(() => { const t = G.W.trees.find(t => t.alive !== false && Math.abs(t.x) < 200 && Math.abs(t.z) < 200 && G.W.trees.every(o => o === t || Math.hypot(o.x - t.x, o.z - t.z) > 6)); const p = G.p; p.x = t.x; p.z = t.z - 0.95; p.yaw = p.root = 0; G.aimStart(); return [t.x, t.z, t.r]; });
  await W(4000); console.log('árvore', tr, 'lean', await ev(() => G.aimS.lean.toFixed(2)));
  await shot('90-espreitar'); await ev(() => G.aimEnd()); await W(800);
  // 3) janela em primeira pessoa (Apartamentos, janela sul em x -25.5)
  await ev(() => { const p = G.p; p.x = -25.5; p.z = -31.3; p.y = 0.03; p.lv = 0; p.yaw = p.root = 0; G.aimStart(true); });
  await W(4500); await shot('91-janela-1p'); await ev(() => G.scopeToggle()); await W(2500); await shot('92-sai-mira'); await ev(() => G.aimEnd());
  // 4) limite do mapa
  await ev(() => { const p = G.p; p.x = 298.6; p.z = 20; p.yaw = p.root = Math.PI / 2; G.edgeT = 0; }); await W(2500); await shot('93-limite');
  // 5) debaixo do viaduto (deve aparecer a silhueta)
  await ev(() => { const p = G.p; p.x = 61; p.z = -52; }); await W(2500); await shot('94-viaduto');
  // 6) treino
  await ev(() => { G.p.sk.res = 0.42; G.p.sk.mira = 0.18; G.ui.openInv(null); document.querySelector('[data-tab="skills"]').click(); }); await W(800); await shot('95-treino');
};
