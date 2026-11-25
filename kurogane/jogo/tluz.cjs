// noite: candeeiros nas vilas, torres de luz no aeroporto, candeeiro da base
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1000);
  console.log('candeeiros no mapa:', await ev(() => G.W.lamps.length), 'erros de zona:', await ev(() => G.W.lazyBad || 0));
  await ev(() => { for (const z of G.zs) z.x += 3000; G.cyc = 1700; const T = G.W.zones.find(z => z.kind === 'town'); G.p.x = T.x + 4; G.p.z = T.z + 4; window.__T = T.name; }); await W(5000);
  console.log('vila:', await ev(() => window.__T)); await shot('noite-vila');
  await ev(() => { G.p.x = 2600; G.p.z = -2620; }); await W(6000); await shot('noite-aeroporto');
  await ev(() => { G.p.x = 900; G.p.z = 900; const it = G.mkItem('candeeiro'); G.inv.belt[5] = it; G.select(5); G.refresh(); }); await W(1500); await ev(() => G.fireDown()); await W(1500);
  await ev(() => { G.select(0); G.p.x += 3; }); await W(3000); await shot('noite-candeeiro');
  console.log('luzes da base:', JSON.stringify(await ev(() => G.base.lights())));
};
