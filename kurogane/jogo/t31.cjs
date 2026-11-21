// fuzz do inventário: arrastar ao calhas entre mochila, cinto, equipamento, caixa e chão; nada pode aparecer nem desaparecer
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.click('#sKit'); await W(600); if (await page.$('#pfN')) { await page.fill('#pfN', 'Teste'); await page.click('#pfOk'); } await W(1500);
  await ev(() => { for (const z of G.zs) { z.x = z.hx = 440; z.z = z.hz = 440; } let b = null, bd = 1e9; for (const c of G.W.containers) { if (c.lv) continue; const d = Math.hypot(c.x - G.p.x, c.z - G.p.z); if (d < bd) { bd = d; b = c; } } G.p.x = b.x + 0.9; G.p.z = b.z; G.prompt = b; G.interact(); });
  await W(800);
  const count = () => ev(() => { const m = {}; const add = it => { if (!it) return; m[it.k] = (m[it.k] || 0) + (it.n || 1); if (it.ammo) m['@' + (it.ak || 'x')] = (m['@' + (it.ak || 'x')] || 0) + it.ammo; if (it.att) for (const v of Object.values(it.att)) if (v) m[v] = (m[v] || 0) + 1; };
    const I = G.inv; I.bag.list.forEach(e => add(e.it)); I.belt.forEach(add); Object.values(I.eq).forEach(add); const grids = new Set(); if (G.box && G.box.grid) grids.add(G.box.grid); for (const b of G.bags) grids.add(b.grid); for (const c of G.W.containers) if (c.grid) grids.add(c.grid); for (const g of grids) g.list.forEach(e => add(e.it)); return m; });
  const diff = (a, b) => { const out = []; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if ((a[k] || 0) !== (b[k] || 0)) out.push(k + ':' + (a[k] || 0) + '→' + (b[k] || 0)); return out; };
  let c0 = await count(), bad = 0;
  for (let i = 0; i < 30; i++) {
    const pts = await ev(() => { const vis = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight; }; const src = [...document.querySelectorAll('#inv .item, #inv .slot[data-src]:not([data-src=""])')].filter(vis); const dst = [...document.querySelectorAll('#inv .cell, #inv .slot')].filter(vis); if (!src.length) return null; const a = src[Math.floor(Math.random() * src.length)].getBoundingClientRect(); let b; if (Math.random() < 0.12) b = { left: innerWidth / 2 - 5, top: 4, width: 10, height: 10 }; else b = dst[Math.floor(Math.random() * dst.length)].getBoundingClientRect(); return [a.left + a.width / 2, a.top + a.height / 2, b.left + b.width / 2, b.top + b.height / 2]; });
    if (!pts) break;
    await page.mouse.move(pts[0], pts[1]); await page.mouse.down(); await page.mouse.move((pts[0] + pts[2]) / 2, (pts[1] + pts[3]) / 2, { steps: 3 }); await page.mouse.move(pts[2], pts[3], { steps: 3 }); await page.mouse.up(); await W(60);
    if (Math.random() < 0.15) { await ev(() => { const b = document.querySelector('#iAct .btn'); if (b) b.click(); }); await W(60); }
    const c1 = await count(); const d = diff(c0, c1).filter(x => !/^(onigiri|racao|agua|bebida|chocolate|maca|ligadura|medkit)/.test(x)); if (d.length) { bad++; console.log('mudou na jogada', i, d.join(' ')); } c0 = c1;
  }
  console.log('jogadas com diferenças:', bad); await shot('g0-fuzz');
};
