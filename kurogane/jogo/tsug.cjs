// sugestão de consumível, dois toques a usar, equipar sozinho, MRE
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 120000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1200);
  await ev(() => { for (const z of G.zs) z.x += 3000; G.inv.bag.insert(G.mkItem('agua', 2), G.inv.rows()); G.inv.bag.insert(G.mkItem('racao', 1), G.inv.rows()); G.p.water = 12; G.p.food = 60; G.refresh(); });
  await WG(1); const s1 = await ev(() => { const e = document.getElementById('tSug'); return e.hidden ? null : e.textContent; }); console.log('com sede:', s1); await shot('sug');
  await ev(() => { G.p.bleed = 1; }); await WG(1); console.log('a sangrar:', await ev(() => document.getElementById('tSug').textContent));
  const b = await page.locator('#tSug').boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await WG(3);
  console.log('depois de tocar:', await ev(() => ({ bleed: G.p.bleed, txt: document.getElementById('tSug').hidden ? '(escondido)' : document.getElementById('tSug').textContent })));
  // MRE enche tudo
  await ev(() => { G.p.bleed = 0; G.p.water = 20; G.p.food = 20; const it = G.inv.bag.list.find(e => e.it.k === 'racao').it; G.use(it); }); await WG(3.5);
  console.log('depois da MRE:', await ev(() => ({ food: Math.round(G.p.food), water: Math.round(G.p.water) })));
  // equipar sozinho ao apanhar: tira o capacete e dá um camuflado
  await ev(() => { G.inv.eq.head = null; G.inv.eq.eyes = null; G.gain('capacetec', 1); G.gain('nvg', 1); });
  console.log('equipado:', await ev(() => [G.inv.eq.head && G.inv.eq.head.k, G.inv.eq.eyes && G.inv.eq.eyes.k]));
};
