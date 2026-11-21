module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(2500); await page.click('#sPlay'); await W(500); await page.fill('#pfN', 'Dinis'); await page.click('#pfOk'); await W(2500);
  const b = await ev(() => { const C = G.W.cuts.find(c => c.name === 'Apartamentos'); const p = G.p; p.lv = 1; p.bld = C; p.base = C.fh; p.y = C.fh; p.x = -24; p.z = -36; let b = null; for (const c of G.W.containers) if ((c.lv || 0) === 1 && Math.hypot(c.x - p.x, c.z - p.z) < 12) { b = c; break; } G.prompt = b; G.interact(); for (const e of [...b.grid.list]) { b.grid.remove(e.it); G.inv.give(e.it); } G.ui.closeInv(); G.save(); const id = JSON.parse(localStorage.getItem('kg.perfis')).ativo; const w = JSON.parse(localStorage.getItem('kg.mundo.' + id)); return { i: G.W.containers.indexOf(b), lab: b.label, x: b.x, saved: JSON.stringify(w.cont), box: G.box && G.box.label }; });
  console.log('antes', JSON.stringify(b));
  await page.reload(); await page.waitForFunction('window.__ready === true'); await W(3000); await page.click('#sCont'); await W(2000);
  console.log('depois', JSON.stringify(await ev(i => { const c = G.W.containers[i]; return { lab: c.label, x: c.x, n: c.grid && c.grid.list.length, items: c.grid && c.grid.list.map(e => e.it.k) }; }, b.i)));
};
