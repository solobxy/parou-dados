// admin: balas infinitas (dispara com o carregador vazio e não gasta)
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2000);
  const shoot = async () => { await ev(() => { const it = G.inv.belt[G.sel || 0]; it.ammo = 0; G.p.fireT = -9; G.p.cd = 0; G.p.reload = 0; }); await page.mouse.move(600, 360); await page.mouse.down(); await W(1500); await page.mouse.up(); await W(300); return ev(() => ({ fired: G.p.fireT > 0, ammo: G.inv.belt[G.sel || 0].ammo })); };
  const off = await shoot();
  await ev(() => { G.net.role = 'admin'; G.admF = { r: 'admin', ammo: 1 }; }); await W(300);
  const on = await shoot();
  console.log('sem balas infinitas:', JSON.stringify(off), '· com:', JSON.stringify(on));
  console.log((!off.fired && on.fired && on.ammo <= 1 ? 'OK   ' : 'FALHA') + ' admin com balas infinitas dispara com o carregador vazio');
};
