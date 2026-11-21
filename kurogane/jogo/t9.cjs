module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(300); await page.tap('#sPlay'); await W(500);
  await ev(() => { const p = G.p; p.x = 13.8; p.z = -4.8; p.yaw = Math.PI; G.camT.set(p.x, 0, p.z); G.zs.length = 0; G.zs.push({ x: 10.6, z: -9.0, yaw: 0, hp: 80, state: 'wander', tx: 10.6, tz: -9.0, think: 99, phase: 0, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 3, sc: 1, wT: 99, spd: 1, sees: true }); });
  await W(800); await ev(() => { document.getElementById('toast').hidden = true; }); await W(100); await shot('71-silhueta-vermelha');
  console.log('t ok', await ev(() => G.zs.length));
};
