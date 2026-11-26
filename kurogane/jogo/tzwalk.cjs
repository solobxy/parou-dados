// zombies a andar: passada devagar (vaguear) e a correr (perseguir), vistos de lado
const fs = require('fs');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  for (const [nm, v] of [['devagar', 0.55], ['corre', 2.6]]) {
    await ev(v => { const p = G.p; const z = G.zs.find(z => z.state !== 'dead'); for (const o of G.zs) if (o !== z) o.x += 3000; z.x = p.x + 3; z.z = p.z; z.yaw = 0; z.frz = v; z.state = 'wander'; z.hide = false; G.__z = z; }, v);
    await W(800);
    for (let i = 0; i < 8; i++) {
      const u = await ev(() => { const z = G.__z; return G.dbgCam(new G.V3(z.x - 2.6, 1.0, z.z), new G.V3(z.x, 0.9, z.z), 50, 300, 300); });
      fs.writeFileSync(`shots/zw-${nm}-${i}.jpg`, Buffer.from(u.split(',')[1], 'base64'));
      await page.waitForFunction(t => G.t >= t, (await ev(() => G.t)) + (v < 1 ? 0.22 : 0.08), { timeout: 60000, polling: 50 });
    }
  }
};
