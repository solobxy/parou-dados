// interface nova: HUD com arma, inventário com caixa aberta
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(400); await shot('80-inicio'); await page.evaluate(() => G.dbgKit()); await W(1200);
  await ev(() => G.selectSlot ? G.selectSlot(0) : null); await W(300);
  await shot('81-hud');
  await ev(() => { const p = G.p; let b = null, bd = 1e9; for (const c of G.W.containers) { if (c.lv) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; b = c; } } p.x = b.x + 0.9; p.z = b.z; p.y = 0; G.prompt = b; G.interact(); });
  await W(600); await shot('82-inv-caixa');
  { const r = await ev(() => { const it = G.inv.bag.list.find(e => true) .it; const b = document.querySelector(`[data-src="bag:${it.id}"]`).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }); await page.touchscreen.tap(r[0], r[1]); await W(600); await shot('83-inv-sel'); }
  await ev(() => G.ui.closeInv()); await W(300);
  await ev(() => { const p = G.p; p.x = -25.5; p.z = -33; p.y = 0.03; p.lv = 0; p.yaw = p.root = Math.PI; G.camT.set(p.x, 0, p.z); }); await W(3500); await shot('84-dentro-escuro');
  const r = await ev(() => { const o = {}; for (const id of ['cBox', 'cEq', 'cBelt', 'iBar', 'cBag', 'gBag', 'gBox']) { const b = document.getElementById(id).getBoundingClientRect(); o[id] = [b.left, b.top, b.right, b.bottom].map(Math.round); } o.vw = innerWidth; o.vh = innerHeight; o.cs = getComputedStyle(document.getElementById('inv')).getPropertyValue('--cs'); return o; });
  console.log(JSON.stringify(r));
};
