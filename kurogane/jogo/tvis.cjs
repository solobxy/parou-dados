// sombra da vista: quantas vezes se redesenha a andar e quanto custa (numa vila, com muitas paredes)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2500);
  await ev(() => { const z = G.W.zones.find(q => q.kind === 'town') || G.W.zones[0]; G.p.x = z.x + 3; G.p.z = z.z + 3; }); await W(3000);
  const a = await ev(() => G.dbg.vis());
  await ev(() => { const p = G.p; p.yaw = p.root = 0.7; G.autoYaw = 0.7; G.autoRun = true; }); await W(4000); await ev(() => G.setAuto(false));
  const b = await ev(() => G.dbg.vis()); const fr = await ev(() => G.t);
  console.log('redesenhos em 4 s a andar:', b[1] - a[1], '· custo médio de cada um:', b[0], 'ms');
  await shot('vis-vila');
};
