module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.click('#sPlay'); await W(1200);
  console.log(JSON.stringify(await ev(() => {
    const H = G.dbg.horde(), z = G.zs[0], out = [];
    Object.assign(z, { x: 0, z: 0, y: 0, yaw: 0.3, state: 'chase', phase: 1.1, mv: 0.8, atkT: 0, sc: 1, helm: 0, vest: 0, hide: false, sink: 0, deadT: 0, lv: 0, _pt: -1 });
    H.update([z]); G.dbg.zoneHit(z, new G.V3(0, 1, -5), new G.V3(0, 1, 5));
    for (const [nm, mesh] of [['armL', H.armL], ['armR', H.armR], ['torso', H.torso]]) {
      const im = new G.M4(); mesh.getMatrixAt(0, im); const pm = z._pose[nm]; const same = im.elements.every((v, i) => Math.abs(v - pm.elements[i]) < 1e-6);
      const pt = new G.V3(0, nm === 'torso' ? 0.43 : -0.3, 0).applyMatrix4(pm); const from = pt.clone().add(new G.V3(3, 0.5, 0)); const dir = pt.clone().sub(from).normalize();
      G.RC.set(from, dir); G.RC.far = 6; mesh.boundingSphere = null; const h = G.RC.intersectObject(mesh, false); out.push([nm, same, h.length, h[0] && +h[0].distance.toFixed(3), +from.distanceTo(pt).toFixed(3), mesh.count, mesh.material.side]);
    }
    return out; })));
};
