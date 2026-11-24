// saco no chão brilha quando estás perto
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2000);
  await ev(() => { G.cyc = 700; for (const z of G.zs) z.x += 5000; const it = G.inv.belt[1]; G.dropItem(G.dbg.item('ligadura', 3)); G.p.x -= 2.5; }); await W(1500);
  const r = await ev(() => { const b = G.bags[G.bags.length - 1]; return { gl: !!(b.mesh.userData.gl && b.mesh.userData.gl.visible), d: Math.hypot(b.x - G.p.x, b.z - G.p.z).toFixed(1) }; });
  console.log('perto:', JSON.stringify(r)); await shot('saco-brilho');
  await ev(() => { G.p.x += 12; }); await W(1200);
  console.log('longe:', await ev(() => { const b = G.bags[G.bags.length - 1]; return !!(b.mesh.userData.gl && b.mesh.userData.gl.visible); }));
};
