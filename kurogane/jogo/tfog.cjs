// fogueira: coloca-se fora da base, acende com madeira e coze a carne crua; carne crua pode fazer mal; mochila de couro e ícones
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { for (const z of G.zs) if (Math.hypot(z.x - G.p.x, z.z - G.p.z) < 60) z.x += 500; const it = G.mkItem('fogueira'); G.inv.bag.insert(it, G.inv.rows()); G.base.deploy(it); window.__f = it; });
  await WG(0.4); await ev(() => G.base.pin({ x: G.p.x + 2.5, z: G.p.z })); await WG(0.4);
  console.log('fogueira:', JSON.stringify(await ev(() => ({ ok: G.base.placeOk() })))); await ev(() => G.fireDown()); await WG(0.5);
  const c = await ev(() => { const c = G.W.containers.find(q => q.dep && q.dep.k === 'fogueira'); if (!c) return null; c.grid.insert(G.mkItem('madeira', 4)); c.grid.insert(G.mkItem('carneC', 2)); G.box = c; G.base.toggleFurnace(c); return c.dep.on; });
  console.log('acesa:', c); await WG(9); await shot('fogueira');
  console.log('na fogueira:', JSON.stringify(await ev(() => { const c = G.W.containers.find(q => q.dep && q.dep.k === 'fogueira'); return c.grid.list.map(e => e.it.k + ':' + (e.it.n || 1)); })));
  { const u = await ev(() => { const c = G.W.containers.find(q => q.dep && q.dep.k === 'fogueira'); return G.dbgCam([c.x + 2, 1.6, c.z + 2], [c.x, 0.3, c.z], 45, 600, 400); }); require('fs').writeFileSync(__dirname + '/shots/fogueira3d.jpg', Buffer.from(u.split(',')[1], 'base64')); }
  // receitas novas e inventário com os ícones
  await ev(() => { for (const [k, n] of [['carneC', 3], ['carneA', 2], ['couro', 8], ['fogueira', 1], ['mochilaC', 1]]) G.inv.bag.insert(G.mkItem(k, n), G.inv.rows()); G.ui.refresh(true); G.ui.openInv(null); });
  await WG(0.6); await shot('inv-animais');
  console.log('receitas:', JSON.stringify(await ev(() => G.RECIPES ? G.RECIPES.filter(r => ['fogueira', 'mochilaC'].includes(r.k)).length : 'sem')));
  console.log('erros:', errs.length ? errs : 'nenhum');
};
