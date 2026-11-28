// zombies ao longe: o corpo vê-se (não só o capacete e o colete)
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { const p = G.p, a = p.yaw; const L = G.zs.filter(z => !z.an && z.state !== 'dead').slice(0, 4); [12, 30, 55, 90].forEach((d, i) => { const z = L[i]; if (!z) return; z.x = p.x + Math.sin(a) * d + (i - 1.5) * 1.2; z.z = p.z + Math.cos(a) * d; z.state = 'idle'; z.frz = 9; z.helm = 1; z.vest = 1; }); G.aimS.fpit = 0; });
  await W(3000); await page.screenshot({ path: '/tmp/kg/zfar.png' });
  console.log(JSON.stringify(await ev(() => G.horde.lods.map(L => [L.mesh.count, L.mesh.visible]))));
};
