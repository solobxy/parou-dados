module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { for (const z of G.zs) z.x += 3000; const p = G.p; p.x = -6; p.z = 3; G.camT.set(p.x, 0, p.z); G.inv.belt.fill(null); G.refresh(); }); await WG(3);
  if (!process.env.TP) { await ev(() => G.viewToggle()); await WG(1); await ev(() => { G.aimS.fy = Math.PI / 2; G.aimS.fpit = 0; }); await WG(0.5); }
  const out = await ev(() => new Promise(res => { const { cam } = G.dbgL, R = G.renderer, orig = R.renderBufferDirect; const by = {}; let on = false;
    const lab = o => { let s = o.name, q = o; while (!s && q.parent && q.parent.type !== 'Scene') { q = q.parent; s = q.name; } return (s || (o.isInstancedMesh ? 'inst' : o.isPoints ? 'pts' : 'mesh')) + '/' + (o.material.type || '').replace('Material', ''); };
    R.renderBufferDirect = function (camera, scene, geometry, material, object, group) { if (on && camera === cam) { const n = (geometry.index ? (group ? group.count : geometry.index.count) : geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1); const k = lab(object) + (object.isInstancedMesh ? ' inst×' + object.count + ' v' + geometry.attributes.position.count : ' v' + geometry.attributes.position.count) + ' @' + Math.round(object.matrixWorld.elements[12]) + ',' + Math.round(object.matrixWorld.elements[14]) + (object.parent && object.parent.userData && object.parent.userData.k ? ' ' + object.parent.userData.k : ''); by[k] = by[k] || [0, 0]; by[k][0] += n; by[k][1]++; } return orig.apply(this, arguments); };
    requestAnimationFrame(() => { on = true; requestAnimationFrame(() => { on = false; R.renderBufferDirect = orig; res(Object.entries(by).sort((a, b) => b[1][0] - a[1][0]).slice(0, 30).map(([k, v]) => (v[0] / 1000).toFixed(0) + 'k ×' + v[1] + ' ' + k)); }); }); }));
  console.log(out.join('\n'));
};
