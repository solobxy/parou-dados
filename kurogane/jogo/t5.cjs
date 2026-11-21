module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(600); await page.click('#sPlay'); await W(600);
  await ev(() => { for (const k of ['m4', 'katana', 'capacete', 'colete', 'mochila']) G.gain(k, 1); for (const s of ['head', 'vest', 'back']) { const e = G.inv.bag.list.find(e => G.ITEMS[e.it.k].eq === s); if (e) { G.inv.bag.remove(e.it); G.inv.eq[s] = e.it; } } G.refresh(); const p = G.p; p.x = 2; p.z = 10; G.camT.set(p.x, 0, p.z); G.zs.length = 0; });
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -100);
  await page.mouse.move(640, 200);
  await ev(() => G.select(G.inv.belt.findIndex(b => b && b.k === 'm4'))); await W(800); await shot('30-m4-perto');
  await ev(() => G.select(G.inv.belt.findIndex(b => b && b.k === 'katana'))); await W(300);
  await page.mouse.down(); await W(120); await shot('31-katana'); await page.mouse.up(); await W(500);
  await ev(() => { const p = G.p; p.x = 13.8; p.z = -12.5; G.camT.set(p.x, 0, p.z); }); await page.mouse.move(640, 300); await W(800); await shot('32-konbini-perto');
};
