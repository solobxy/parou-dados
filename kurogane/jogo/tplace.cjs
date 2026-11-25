// colocar objetos com fantasma: do cinto, do inventário, tocar no chão, e nunca através de paredes
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 120000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1000);
  await ev(() => { for (const z of G.zs) z.x += 3000; G.p.x = 900; G.p.z = 900; const it = G.mkItem('bau'); G.inv.belt[5] = it; G.select(5); G.refresh(); });
  await WG(1); console.log('do cinto:', JSON.stringify(await ev(() => ({ placing: G.base.placing(), ok: G.base.placeOk(), label: document.querySelector('#tFire em').textContent }))));
  await shot('place-ghost');
  await ev(() => G.fireDown()); await WG(0.5); console.log('depois de Colocar:', JSON.stringify(await ev(() => ({ placing: G.base.placing(), belt5: G.inv.belt[5] && G.inv.belt[5].k }))));
  // do inventário: fornalha na mochila, Colocar → fantasma; tocar no chão a 3 m
  await ev(() => { const it = G.mkItem('fornalha'); G.inv.bag.insert(it, G.inv.rows()); G.select(0); G.base.deploy(it); window.__f = it; });
  await WG(0.5); const pt = await ev(() => { const v = new (G.p.constructor === Object ? Object : Object)(); return G.proj ? (q => [q.x, q.y])(G.proj({ x: G.p.x + 3, y: 0, z: G.p.z, isVector3: true, clone() { return this; } })) : null; });
  await ev(() => G.base.pin({ x: G.p.x + 3, z: G.p.z })); await WG(0.4); await shot('place-pin');
  console.log('fornalha:', JSON.stringify(await ev(() => ({ placing: G.base.placing(), ok: G.base.placeOk() }))));
  await ev(() => G.fireDown()); await WG(0.4); console.log('fornalha posta:', await ev(() => !G.inv.where(window.__f)));
  // parede de teste entre ti e o sítio
  await ev(() => { const p = G.p; window.__wr = { x0: p.x - 3, x1: p.x + 3, z0: p.z + 1, z1: p.z + 1.2, k: 's', h: 3, lv: 0 }; G.W.rects.push(window.__wr); const it = G.mkItem('bau'); G.inv.belt[4] = it; G.select(4); G.refresh(); });
  await WG(0.3); await ev(() => G.base.pin({ x: G.p.x, z: G.p.z + 2.6 })); await WG(0.4);
  console.log('através da parede:', JSON.stringify(await ev(() => ({ ok: G.base.placeOk() }))));
  await ev(() => G.fireDown()); await WG(0.4); console.log('aviso:', await ev(() => document.getElementById('toast').textContent));
  await ev(() => G.W.rects.splice(G.W.rects.indexOf(window.__wr), 1));
};
