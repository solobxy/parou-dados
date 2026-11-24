// capturas de sítios do mundo novo
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  const spots = process.env.SPOTS ? JSON.parse(process.env.SPOTS) : [['akagawa', -2650, -2690], ['vila-midori', -900, -1440], ['posto', -896.5 + 12, -1100], ['aeroporto-terminal', 2600, -2560], ['aeroporto-militar', 2260, -2620], ['ponte', -2190, -2700], ['lago', -1300, 1700], ['prisao', -1500, -3380], ['barragem', -1130, 2120]];
  for (const [name, x, z] of spots) {
    await ev(([x, z]) => { const p = G.p; for (const zz of G.zs) zz.x += 9000; p.x = x; p.z = z; p.vx = p.vz = 0; G.sectors.fill(x, z); for (let i = 0; i < 30 && G.lazyTick(x, z); i++); }, [x, z]);
    await W(2500); await shot('reg-' + name);
    console.log(name, JSON.stringify(await ev(() => ({ zone: (G.zoneAt(G.p.x, G.p.z) || {}).name, swim: !!G.p.swim, built: G.W.lazy.filter(L => L.meshes).length }))));
  }
};
