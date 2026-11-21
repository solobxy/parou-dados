module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.evaluate(() => G.dbgKit()); await W(1200);
  console.log('queda .308 (m):', await ev(() => [100, 200, 300, 400, 500, 600].map(d => d + ':' + G.ballis.dropAt('a308', 850, d).toFixed(2)).join(' ')));
  console.log('queda 5,56 (m):', await ev(() => [100, 200, 300, 400].map(d => d + ':' + G.ballis.dropAt('a556', 940, d).toFixed(2)).join(' ')));
  console.log('queda 9mm (m):', await ev(() => [50, 100, 150].map(d => d + ':' + G.ballis.dropAt('a9', 360, d).toFixed(2)).join(' ')));
  // tiro real: caçadeira .308 com mira 8x (zero 200 m) contra um zombie a 300 m
  await ev(() => { for (const z of G.zs) { z.x = z.hx = 440; z.z = z.hz = 440; } const i = G.inv.belt.findIndex(b => b && b.k === 'caca'); G.select(i); });
  const shotAt = async (zero) => ev(async (zero) => { const p = G.p; p.x = 60; p.z = 1.5; p.y = 0.03; p.lv = 0; p.yaw = p.root = Math.PI / 2; const z = G.zs[0]; Object.assign(z, { x: 360, z: 1.5, hx: 360, hz: 1.5, state: 'wander', hp: 80, hpMax: 80, lv: 0, y: 0, yaw: -Math.PI / 2, mv: 0, helm: 0, vest: 0 }); const it = G.inv.belt[G.sel]; it.zero = zero; it.ammo = 5; G.aimStart(true); await new Promise(r => setTimeout(r, 2500)); const A = G.aimS; const eye = A.eye; const hd = new G.V3(360, 0.89 + 0.92, 1.5); A.fy = Math.atan2(hd.x - eye.x, hd.z - eye.z); A.fpit = Math.atan2(hd.y - eye.y, Math.hypot(hd.x - eye.x, hd.z - eye.z)); await new Promise(r => setTimeout(r, 600)); const hp0 = z.hp, a0 = it.ammo, fp = G.fp, rs = A.raise; Object.assign(z, { x: 360, z: 1.5, tx: 360, tz: 1.5, wT: 99, think: 99, state: 'wander', mv: 0, yaw: -Math.PI / 2, _pt: -1 }); G.p.cd = 0; G.p.reload = 0; A.steady = 1; A.kick = 0; A.dir.set(hd.x - eye.x, hd.y - eye.y, hd.z - eye.z).normalize(); G.fireDown(); G.fireUp(); await new Promise(r => setTimeout(r, 4000)); const res = [zero, hp0, +z.hp.toFixed(1), z.state, z.head ? 'cabeça' : '', 'ammo', a0, it.ammo]; G.aimEnd(); return res; }, zero);
  console.log('mira na cabeça a 300 m com zero 100 m:', JSON.stringify(await shotAt(100)));
  console.log('mira na cabeça a 300 m com zero 300 m:', JSON.stringify(await shotAt(300)));
};
