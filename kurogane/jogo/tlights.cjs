module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(3000);
  console.log(JSON.stringify(await ev(() => { const { scene } = G.dbgL, out = [], inst = {}; scene.traverse(o => { if (o.isLight && o.castShadow) out.push([o.type, o.visible, +o.intensity.toFixed(2), o.shadow.autoUpdate, o.shadow.mapSize.x]); if (o.isInstancedMesh && o.count > 0) { const v = o.geometry.attributes.position.count; const k = v + 'v'; inst[k] = inst[k] || []; inst[k].push([o.count, o.castShadow ? 'S' : '-', o.material.type, (o.material.map ? 'map' : ''), o.parent && o.parent.type]); } }); const agg = Object.fromEntries(Object.entries(inst).map(([k, L]) => [k, [L.length, L.reduce((a, b) => a + b[0], 0), L[0][1], L[0][2]]])); return { lights: out, agg }; }), null, 0));
};
