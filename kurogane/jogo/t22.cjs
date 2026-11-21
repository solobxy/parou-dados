// hitboxes contra a malha desenhada: muitos raios ao acaso em muitas poses
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.click('#sPlay'); await W(1200);
  const r = await ev(() => {
    const H = G.dbg.horde(), meshes = [H.torso, H.armL, H.armR, H.legL, H.legR, H.helm, H.vest];
    const z = G.zs[0]; const V = (x, y, z) => ({ x, y, z });
    let tp = 0, fn = 0, fp = 0, zoneOk = 0, zoneBad = 0, rays = 0; const bad = [];
    const P = new G.V3(), Q = new G.V3(), D = new G.V3();
    for (let k = 0; k < 160; k++) {
      Object.assign(z, { x: 0, z: 0, y: 0, yaw: Math.random() * 6.28, state: ['wander', 'chase', 'chase', 'attack'][k % 4], phase: Math.random() * 20, mv: Math.random(), atkT: k % 3 === 0 ? Math.random() * 0.4 : 0, sc: 0.9 + Math.random() * 0.25, helm: k % 5 === 0 ? 2 : 0, vest: k % 7 === 0 ? 3 : 0, hide: false, sink: 0, deadT: 0, lv: 0, _pt: -1 });
      if (z.state === 'attack') z.state = 'chase';
      H.update([z]); for (const m of meshes) { m.updateMatrixWorld(); m.computeBoundingSphere && (m.boundingSphere = null); }
      for (let i = 0; i < 60; i++) {
        const tx = (Math.random() - 0.5) * 1.4, ty = Math.random() * 2.1, tz = (Math.random() - 0.5) * 1.4;
        const a = Math.random() * 6.28, el = (Math.random() - 0.3) * 1.2; D.set(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el));
        P.set(tx - D.x * 4, ty - D.y * 4, tz - D.z * 4); Q.set(tx + D.x * 4, ty + D.y * 4, tz + D.z * 4);
        G.RC.set(P, D); G.RC.far = 8; const hits = G.RC.intersectObjects(meshes, false).filter(h => h.instanceId === 0);
        const mine = G.dbg.zoneHit(z, P, Q, 1); rays++;
        if (hits.length && mine) { tp++; const h = hits[0], part = meshes.indexOf(h.object); let ez = part === 0 ? null : part <= 2 ? 'arms' : part <= 4 ? 'legs' : part === 5 ? 'head' : 'body';
          if (part === 0) { const lp = h.point.clone().applyMatrix4(new G.M4().copy(z._pose.torso).invert()); ez = lp.y > 0.71 ? 'head' : 'body'; }
          const dd = Math.abs(h.distance - mine.s * 8);
          if (ez === mine.zone || dd < 0.04) zoneOk++; else { zoneBad++; if (h.distance - mine.s * 8 > 0.15 && bad.length < 12) { const mk = ['torso','torso','torso','torso','armL','armR','legL','legR','legL','legR'][mine.i]; const lp = mine.c.clone().applyMatrix4(new G.M4().copy(z._pose[mk]).invert()); bad.push([ez, mine.zone, mine.i, +h.distance.toFixed(3), +(mine.s * 8).toFixed(3), [lp.x, lp.y, lp.z].map(v => +v.toFixed(2)), z.state, z.vest, z.helm, +z.atkT.toFixed(2)]); } } }
        else if (hits.length) { fn++; }
        else if (mine) { fp++; }
      }
    }
    return { rays, tp, fn, fp, zoneOk, zoneBad, bad };
  });
  console.log(JSON.stringify(r));
};
