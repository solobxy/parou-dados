module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(300); await page.tap('#sPlay'); await W(500);
  await ev(() => { const p = G.p; p.x = 13.8; p.z = -4.8; G.camT.set(p.x, 0, p.z); G.zs.length = 0; G.zs.push({ x: 10.6, z: -9.0, yaw: 0, hp: 80, state: 'wander', tx: 10.6, tz: -9.0, think: 99, phase: 0, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 3, sc: 1, wT: 99, spd: 1, sees: true }); });
  await W(600);
  console.log(await ev(() => { const out = []; G.scene.traverse(o => { if (o.isInstancedMesh && o.count === 1 && o.material.isMeshBasicMaterial) out.push(o.material.depthFunc + ' pos=' + [12, 13, 14].map(i => o.instanceMatrix.array[i].toFixed(1)).join(',') + ' geo=' + o.geometry.attributes.position.count + ' layers=' + o.layers.mask); }); return out.join(' | '); }));
  console.log(await ev(() => { const r = G.renderer.info.render; return r.calls + ' ' + r.triangles; }));
};
