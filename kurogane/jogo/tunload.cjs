// descarregar uma arma e um carregador encontrados: as balas vêm para a mochila e a arma fica na caixa
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { G.inv.bag.list.filter(e => ['a556', 'a9'].includes(e.it.k)).forEach(e => G.inv.bag.remove(e.it)); const g = new (G.inv.bag.constructor)(6, 4); const gun = G.mkItem('m4'); gun.mg = 'cStanag'; gun.ammo = 25; gun.ak = 'a556'; g.insert(gun); const m = G.mkItem('cStanag'); m.am = 18; m.ak = 'a556'; g.insert(m); G.dropGrid(G.p.x + 0.5, G.p.z, g); G.refresh(); });
  await W(600); await ev(() => { const b = G.bags[G.bags.length - 1]; G.box = b; G.ui.openInv(b); }); await W(800);
  const before = await ev(() => G.inv.count('a556'));
  for (let i = 0; i < 4; i++) {
    const r = await ev(i => { const els = [...document.querySelectorAll('#inv .item')].filter(e => { const b = e.getBoundingClientRect(); return b.left < innerWidth * 0.36 && b.width > 4; }); const e = i === 0 ? els.find(e => /Carreg/.test(e.textContent)) : i === 1 ? els.find(e => /M4/.test(e.textContent) && !/Carreg/.test(e.textContent)) : null; if (!e) return null; const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, i);
    if (!r) { console.log('sem item', i); continue; } await page.mouse.click(r[0], r[1]); await W(500);
    const btns = await ev(() => [document.querySelector('#iName') ? document.querySelector('#iName').textContent : '', ...[...document.querySelectorAll('#iAct .btn')].map(b => b.textContent)]); console.log('ações:', JSON.stringify(btns));
    if (i === 0) await shot('descarregar');
    await ev(() => { const b = [...document.querySelectorAll('#iAct .btn')].find(b => /Descarregar/.test(b.textContent)); if (b) b.click(); }); await W(400);
  }
  const after = await ev(() => ({ balas: G.inv.count('a556'), naCaixa: G.box.grid.list.map(e => e.it.k + ':' + (e.it.ammo ?? e.it.am ?? '')) }));
  console.log('balas', before, '→', after.balas, 'caixa', JSON.stringify(after.naCaixa), after.balas - before === 43 ? 'OK' : 'FALHA');
};
