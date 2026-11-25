// sensibilidade fixa (o mesmo arrasto roda sempre o mesmo) e ajuda à mira ligeira na 1.ª pessoa
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { for (const z of G.zs) z.x += 5000; G.p.x = 1200; G.p.z = 1200; G.viewToggle(); }); await W(1500);
  // sem alvos: 10 arrastos de 5 px = 1 arrasto de 50 px (sem aceleração), e devagar = depressa
  const r = await ev(() => { const a0 = G.aimS.fy; for (let i = 0; i < 10; i++) G.aimDrag(5, 0); const a1 = G.aimS.fy; G.aimDrag(50, 0); const a2 = G.aimS.fy; for (let i = 0; i < 50; i++) G.aimDrag(1, 0); const a3 = G.aimS.fy; return [a0 - a1, a1 - a2, a2 - a3].map(v => +v.toFixed(5)); });
  console.log('sem alvo (10x5px, 1x50px, 50x1px):', r, Math.abs(r[0] - r[1]) < 1e-6 && Math.abs(r[0] - r[2]) < 1e-6 ? 'OK linear' : 'FALHA');
  // um zombie à frente, um pouco ao lado: arrastar na direção dele chega mais perto do que sem ajuda; arrastar para longe abranda pouco
  const z = await ev(() => { const p = G.p, Z = G.zs.find(z => !z.an); Z.x = p.x + Math.sin(G.aimS.fy + 0.05) * 10; Z.z = p.z + Math.cos(G.aimS.fy + 0.05) * 10; Z.y = 0; G.aimS.fpit = -0.03; Z.hp = 999; Z.frozen = true; Z.hide = false; Z.state = 'wander'; Z.vx = Z.vz = 0; window.__Z = Z; return true; });
  await W(800);
  console.log(JSON.stringify(await ev(() => G.dbgAssist())));
  const t = await ev(() => { const yaw = () => Math.atan2(window.__Z.x - G.p.x, window.__Z.z - G.p.z); const s0 = G.aimS.fy, e0 = Math.abs(yaw() - s0); const cfg = G.cfg; cfg.assist = false; G.aimDrag(-6, 0); const off = Math.abs(yaw() - G.aimS.fy); G.aimS.fy = s0; cfg.assist = true; G.aimDrag(-6, 0); const on = Math.abs(yaw() - G.aimS.fy); G.aimS.fy = s0; return { antes: +e0.toFixed(5), semAjuda: +off.toFixed(5), comAjuda: +on.toFixed(5) }; });
  console.log('ajuda:', JSON.stringify(t), t.comAjuda < t.semAjuda ? 'OK puxa para o alvo' : 'FALHA');
  const idle = await ev(() => { const a = G.aimS.fy; return new Promise(r => setTimeout(() => r(+(G.aimS.fy - a).toFixed(5)), 600)); });
  console.log('parado (não mexe sozinha):', idle, idle === 0 ? 'OK' : 'FALHA');
};
