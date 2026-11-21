module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(300); await page.tap('#sPlay'); await W(500);
  await ev(() => { const p = G.p; p.x = 13.8; p.z = -4.8; p.yaw = Math.PI; G.camT.set(p.x, 0, p.z); G.zs.length = 0; G.zs.push({ x: 10.6, z: -9.0, yaw: 0, hp: 80, state: 'wander', tx: 10.6, tz: -9.0, think: 99, phase: 0, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 3, sc: 1, wT: 99, spd: 1, sees: true }); });
  await W(600);
  console.log(await ev(() => { const out = []; G.scene.traverse(o => { if (o.isInstancedMesh && o.material.color && o.material.depthFunc === 6) out.push(o.count + ':' + o.visible + ':' + o.renderOrder); }); return out.join(' ') + ' | z ' + JSON.stringify(G.zs.map(z => [z.x.toFixed(1), z.z.toFixed(1), z.sees, z.state, z.inst])); }));
};
