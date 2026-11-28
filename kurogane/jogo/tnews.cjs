// imagem limpa das novidades: terminal do aeroporto com as luzes acesas, sem o HUD
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1200);
  await ev(() => { const p = G.p; p.x = 2575; p.z = -2590; p.lv = 0; }); await W(8000);
  await ev(() => { const p = G.p; p.yaw = p.root = Math.PI / 2 + 0.25; G.aimS.fy = p.yaw; G.aimS.fpit = 0.2; G.cyc = 1650; G.dbgHideVM && G.dbgHideVM(); }); await W(3000);
  await page.addStyleTag({ content: 'body > *:not(canvas){visibility:hidden!important}' }); await W(400);
  await page.screenshot({ path: '/tmp/kg/news.png' });
};
