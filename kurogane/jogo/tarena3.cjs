// arena: acessórios no ecrã de escolha (aplicados ao nascer), cidade à volta, mapa leve
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(1500); await ev(() => { G.net.start = () => { }; document.querySelector('#arw .atm.t0').click(); document.querySelector('#arw .akit[data-k="atirador"]').click(); }); await W(400);
  await ev(() => { document.querySelector('#arw .ach[data-g="m4"][data-v="mira4"]').click(); }); await W(200); await ev(() => { document.querySelector('#arw .ach[data-g="m4"][data-f="sup"]').click(); }); await W(200); await ev(() => { document.querySelector('#arw .ach[data-g="pistola"][data-f="light"]').click(); }); await W(300);
  await shot('ar-att');
  await ev(() => document.getElementById('arGo').click()); await W(2500);
  console.log('cinto:', JSON.stringify(await ev(() => G.inv.belt.filter(Boolean).map(i => i.k + (i.att && Object.keys(i.att).length ? JSON.stringify(i.att) : '')))));
  await ev(() => { G.arenaKitSet('apoio'); G.arenaRespawn(); }); await W(800);
  console.log('apoio:', JSON.stringify(await ev(() => G.inv.belt.filter(Boolean).map(i => i.k + (i.att && Object.keys(i.att).length ? JSON.stringify(i.att) : '')))));
  await ev(() => { G.p.x = 3650 + 40; G.p.z = 3650 + 2; G.aimS.fy = 0.4; G.p.yaw = G.p.root = 0.4; G.aimS.fpit = 0.15; }); await W(2000); await shot('ar-cidade');
};
