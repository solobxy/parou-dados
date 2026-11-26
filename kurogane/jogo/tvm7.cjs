module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await WG(1.5);
  await ev(() => G.viewToggle()); await WG(0.8);
  await ev(() => { const g = G.mkItem('m4'); g.att = {}; G.inv.belt[1] = g; G.select(1); G.refresh(); }); await WG(0.8);
  console.log(JSON.stringify(await ev(() => { const d = G.vm.dbg(); const out = []; d.gun.children.forEach(c => { let n = 0; c.traverse(m => { if (m.isMesh) n += m.geometry.attributes.position.count; }); out.push([c.type, c.position.toArray().map(x => +x.toFixed(3)), n, c.visible]); }); return out; })));
};
