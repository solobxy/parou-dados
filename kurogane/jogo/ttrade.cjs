// comerciante: está no sítio, abre o painel, compra com ienes e vende o que tens
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { const T = G.TR.TRADERS[0]; G.p.x = T.x + 1.4; G.p.z = T.z + 0.3; for (const z of G.zs) if (Math.hypot(z.x - T.x, z.z - T.z) < 60) z.x += 600; G.inv.bag.insert(G.mkItem('iene', 3000), G.inv.rows()); G.inv.bag.insert(G.mkItem('couro', 4), G.inv.rows()); G.ui.refresh(true); });
  await WG(1); console.log('prompt:', await ev(() => G.prompt && G.prompt.label));
  { const u = await ev(() => { const T = G.TR.TRADERS[0]; return G.dbgCam([T.x + 2.5, 1.7, T.z + 2.5], [T.x, 1.1, T.z], 45, 600, 420); }); require('fs').writeFileSync(__dirname + '/shots/trader3d.jpg', Buffer.from(u.split(',')[1], 'base64')); }
  await ev(() => G.interact()); await WG(0.5); await shot('trader-comprar');
  const y0 = await ev(() => G.inv.count('iene'));
  await ev(() => { const b = document.querySelector('#trB button[data-b="lata"]'); b.click(); }); await WG(0.3);
  const y1 = await ev(() => [G.inv.count('iene'), G.inv.count('lata')]); console.log('comprou lata:', y0, '→', JSON.stringify(y1), y0 - y1[0] === G_PRICE ? '' : '');
  await ev(() => { document.querySelector('#trTabs button[data-t="s"]').click(); }); await WG(0.3); await shot('trader-vender');
  await ev(() => { const b = document.querySelector('#trB button[data-s="couro"]'); b.click(); }); await WG(0.3);
  const y2 = await ev(() => [G.inv.count('iene'), G.inv.count('couro')]); console.log('vendeu couro:', JSON.stringify(y2));
  await ev(() => { G.p.x += 12; }); await WG(1); console.log('painel fecha ao afastar:', await ev(() => document.getElementById('trw').hidden));
};
const G_PRICE = 40;
