module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.evaluate(() => G.dbgKit()); await W(1500);
  await ev(() => { const i = G.inv.belt.findIndex(b => b && b.k === 'caca'); G.select(i); G.aimStart(true); });
  await W(2800);
  const r = await ev(() => { const zs = document.getElementById('szero'); const b = document.getElementById('zUp'), d = document.getElementById('zDn'); const rb = b.getBoundingClientRect(), rd = d.getBoundingClientRect(); const top = (x, y) => { const e = document.elementFromPoint(x, y); return e && (e.closest('button') || e).id; }; return { fp: G.fp, hidden: zs.hidden, up: [rb.x|0, rb.y|0, rb.width|0], dn: [rd.x|0, rd.y|0], atUp: top(rb.x + rb.width / 2, rb.y + rb.height / 2), atDn: top(rd.x + rd.width / 2, rd.y + rd.height / 2), zero: G.inv.belt[G.sel].zero, vw: innerWidth, vh: innerHeight }; });
  console.log(JSON.stringify(r));
  const b = await page.$('#zUp'); const bb = await b.boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await W(300);
  console.log('zero depois do toque:', await ev(() => G.inv.belt[G.sel].zero + ' / ' + document.getElementById('scZero').textContent));
  await shot('scope-zero');
};
