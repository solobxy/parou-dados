// texturas do chão: relva, estrada, betão, passeio e terra, de dia
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { for (const z of G.zs) z.x += 3000; G.cyc = 600; G.p.x = 640; G.p.z = 12; }); await W(4000); await shot('tex-estrada');
  await ev(() => { const T = G.W.zones.find(z => z.kind === 'town'); G.p.x = T.x + 6; G.p.z = T.z + 6; }); await W(4000); await shot('tex-vila');
  await ev(() => { G.p.x = 30; G.p.z = -30; }); await W(4000); await shot('tex-cidade');
  await ev(() => { G.p.x = 2300; G.p.z = -2620; }); await W(5000); await shot('tex-militar');
};
