// personagem com capacete, colete e AK de perto (retrato do menu) + arma na 1.ª pessoa, para comparar o desgaste e o brilho
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1000);
  const u = await ev(() => G.dbgPortrait({ gun: 'ak', raise: 1, ry: -0.6, eq: { head: { k: 'capacete' }, vest: { k: 'colete' }, back: { k: 'mochila' } } }, 1400, 1520));
  await ev(u => { const i = document.createElement('img'); i.src = u; i.id = 'pv'; i.style.cssText = 'position:fixed;inset:0;margin:auto;height:100%;z-index:99999;background:#3a4048'; document.body.appendChild(i); }, u); await W(600);
  await shot('veste'); await ev(() => document.getElementById('pv').remove());
  const u2 = await ev(() => G.dbgPortrait({ ry: 2.4, eq: { head: { k: 'capacete' }, vest: { k: 'colete' } } }, 1400, 1520));
  await ev(u => { const i = document.createElement('img'); i.src = u; i.id = 'pv'; i.style.cssText = 'position:fixed;inset:0;margin:auto;height:100%;z-index:99999;background:#3a4048'; document.body.appendChild(i); }, u2); await W(600);
  await shot('veste-costas'); await ev(() => document.getElementById('pv').remove());
  await ev(() => { const it = G.inv.belt[0]; it.k = 'ak'; it.att = {}; G.select(1); G.select(0); const p = G.p; p.x = 60; p.z = 1.5; p.yaw = p.root = 2.2; G.aimS.fy = 2.2; G.aimS.fpit = 0.05; }); await W(2500); await shot('veste-fp');
};
