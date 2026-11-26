// arena sem servidor (KG_ARENA=1): ecrã ao alto e deitado, máquinas de venda, balas infinitas, correr com a arma, rasto a sair do cano
const fs = require('fs');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(1500); await shot('ar-lobby');
  await ev(() => { G.net.start = () => { }; G.arenaStart(1, 'apoio'); }); await W(2500);
  // de frente para as máquinas de venda (lado azul, viela norte)
  await ev(() => { G.p.x = 3650 + 28.6; G.p.z = 3650 - 18.4; const a = Math.atan2(31.2 - 28.6, 0); G.aimS.fy = Math.PI / 2; G.p.yaw = G.p.root = Math.PI / 2; G.aimS.fpit = 0.05; }); await W(1800); await shot('ar-vend');
  // balas: esvazia a reserva e espera
  const am0 = await ev(() => { for (const m of G.clipsOf('cSmg')) m.am = 0; return G.clipsOf('cSmg').map(m => m.am); }); await W(1500);
  const am1 = await ev(() => G.clipsOf('cSmg').map(m => m.am)); console.log('carregadores da SMG:', JSON.stringify(am0), '→', JSON.stringify(am1));
  // correr: polegar esquerdo até ao fim, com a arma na mão
  await ev(() => { G.p.x = 3650 + 30; G.p.z = 3650; G.aimS.fy = -Math.PI / 2; G.p.yaw = G.p.root = -Math.PI / 2; G.sticks.L = { x: 0, y: -1, m: 1 }; }); await W(2500);
  const r = await ev(() => ({ spr: G.p.sprint, v: +Math.hypot(G.p.vx, G.p.vz).toFixed(2), aim: G.aimS.on })); console.log('a correr:', JSON.stringify(r)); await ev(() => { G.sticks.L = null; }); await W(600);
  // disparo: rasto a sair da ponta do cano
  await ev(() => { G.p.cd = 0; G.p.reload = 0; G.dbg.fire(); }); await shot('ar-tiro');
};
