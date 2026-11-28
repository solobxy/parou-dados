// imagem limpa das novidades: loja de Kitamura ao fim do dia, com a grinalda acesa, sem o HUD
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1200);
  await ev(() => { const p = G.p; p.x = -161.5; p.z = -6.5; p.lv = 0; p.yaw = p.root = Math.PI + 0.5; G.aimS.fy = p.yaw; G.aimS.fpit = 0.1; G.cyc = 1560; }); await W(6000);
  await page.addStyleTag({ content: 'body > *:not(canvas):not(#vig){visibility:hidden!important}' }); await W(400);
  await page.screenshot({ path: '/tmp/kg/news2.png' });
};
