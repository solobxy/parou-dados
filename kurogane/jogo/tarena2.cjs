// arena sem servidor: mapa só da arena, mira de ponto vermelho (centrada, pequena, mais precisa) e correr vs disparar
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(1500); await ev(() => { G.net.start = () => { }; G.arenaStart(0, 'atirador'); }); await W(2500);
  await ev(() => { G.p.x = 3650 - 30; G.p.z = 3650; G.aimS.fy = Math.PI / 2; G.p.yaw = G.p.root = Math.PI / 2; G.aimS.fpit = 0; }); await W(1500);
  await ev(() => G.ui.toggleMap(true)); await W(900); await shot('ar-mapa'); await ev(() => G.ui.toggleMap(false)); await W(500); await shot('ar-mini');
  // mira: anca e ponto vermelho
  await shot('ar-anca'); await ev(() => G.scopeToggle()); await W(1200); await shot('ar-rd');
  const sp = await ev(() => { const r = []; for (const k of ['iron', 'reddot']) r.push(k + ':' + JSON.stringify(G.SIGHT[k])); return r; }); console.log(sp.join(' | '));
  await ev(() => G.scopeToggle()); await W(600);
  // correr e disparar ao mesmo tempo: o disparo corta a corrida; ao largar volta a correr
  await ev(() => { G.sticks.L = { x: 0, y: -1, m: 1 }; }); await W(1500); const a = await ev(() => G.p.sprint);
  await ev(() => { G.fireDown(); }); await W(700); const b = await ev(() => [G.p.sprint, +Math.hypot(G.p.vx, G.p.vz).toFixed(2)]);
  await ev(() => { G.fireUp(); }); { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t > t, t0 + 1.5, { timeout: 60000 }); } const c = await ev(() => [G.p.sprint, G.fireHeld, +(G.t - G.p.fireT).toFixed(2), G.p.stam, G.p.stamLock, G.aimS.scope, JSON.stringify(G.sticks.L), G.p.reload, G.p.use]); await ev(() => { G.sticks.L = null; });
  console.log('corre:', a, '| a disparar:', JSON.stringify(b), '| depois:', c);
};
