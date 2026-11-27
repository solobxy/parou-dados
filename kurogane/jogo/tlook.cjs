// capturas para escolher o que melhorar: rua de vila, rua da cidade, dentro de casas e lojas
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1200);
  const T = ['Revistar cozinha', 'Revistar secretária', 'Revistar prateleira', 'Abrir frigorífico', 'Revistar balcão', 'Revistar caixa registadora'];
  let i = 0;
  for (const lb of T) {
    const r = await ev(lb => { const c = G.W.containers.find(c => c.label === lb); if (!c) return null; const p = G.p; p.x = c.x + 1.6; p.z = c.z + 1.6; p.lv = c.lv || 0; p.yaw = p.root = Math.atan2(c.x - p.x, c.z - p.z); G.aimS.fy = p.yaw; G.aimS.fpit = -0.25; return [c.x, c.z, c.lv]; }, lb);
    if (!r) { console.log('sem', lb); continue; }
    await W(6000); await ev(lb => { const c = G.W.containers.find(c => c.label === lb); const p = G.p; p.x = c.x + 1.6; p.z = c.z + 1.6; p.yaw = p.root = Math.atan2(c.x - p.x, c.z - p.z); G.aimS.fy = p.yaw; }, lb); await W(1200); await shot('look-' + (i++)); console.log(lb, r);
  }
};
