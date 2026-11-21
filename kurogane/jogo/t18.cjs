module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.evaluate(() => G.dbgKit()); await W(1500);
  const r = await ev(() => { for (const z of G.zs) { z.x = z.hx = 250; z.z = z.hz = 250; } const p = G.p, z = G.zs[0], out = [];
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; p.yaw = p.root = a; Object.assign(z, { x: p.x + Math.sin(a) * 7, z: p.z + Math.cos(a) * 7, state: 'wander', hp: 80, lv: 0, y: 0, hide: false, _lkT: 0 }); const cs = G.dbg.canSee(p, z), cl = G.dbg.clearShot(z); G.aimS.on = true; G.aimS.lock = null; G.relock(); out.push([k, cs, cl, !!G.aimS.lock]); G.aimEnd(); }
    return out; });
  console.log(JSON.stringify(r));
};
