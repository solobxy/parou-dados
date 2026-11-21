// sair em combate: 5 s parado; mexer cancela; fora de combate sai logo
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.evaluate(() => G.dbgKit()); await W(1200);
  await ev(() => { for (const z of G.zs) { z.x = z.hx = 250; z.z = z.hz = 250; } G.combatT = -99; });
  console.log('fora de combate', await ev(() => G.inCombat()));
  await ev(() => { G.combatT = G.t; G.askQuit(); }); await W(1500); await shot('b0-sair-combate');
  console.log('a contar', await ev(() => G.quit && G.quit.t.toFixed(2)));
  await ev(() => { G.p.x += 1; }); await W(800); console.log('mexeu: cancelou?', await ev(() => G.quit === null));
  await ev(() => { G.combatT = G.t; G.askQuit(); G.quit.t = 0.3; }); await W(2500); console.log('saiu para o menu', await ev(() => !G.playing && !document.getElementById('start').hidden));
  await shot('b1-menu');
};
