// personagem: frente, lado, a andar, a correr, a apontar (espingarda e pistola) e zombies, vistos de perto
const fs = require('fs');
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 120000, polling: 50 }); };
  await ev(() => G.dbgKit()); await W(1200);
  await ev(() => { for (const z of G.zs) z.x += 3000; G.p.x = 1200; G.p.z = 1200; G.inv.eq.head = null; G.inv.eq.vest = null; G.inv.eq.back = null; G.select(5); G.refresh(); });
  const cam = async (name, ang, dist = 2.6, h = 1.3, look = 1.0) => { const url = await ev(([ang, dist, h, look]) => { const p = G.p, y = p.yaw + ang; return G.dbgCam([p.x + Math.sin(y) * dist, p.y + h, p.z + Math.cos(y) * dist], [p.x, p.y + look, p.z], 34, 640, 640); }, [ang, dist, h, look]); fs.writeFileSync(__dirname + '/shots/ch-' + name + '.jpg', Buffer.from(url.split(',')[1], 'base64')); };
  await WG(1); await cam('frente', 0); await cam('lado', Math.PI / 2); await cam('cara', 0.3, 0.9, 1.75, 1.7);
  await ev(() => { G.sticks.L = { x: 0, y: -0.6 }; }); await WG(1.2); await cam('andar', Math.PI / 2, 3);
  await ev(() => { G.sticks.L = { x: 0, y: -1 }; G.p.sprint = true; G.setAuto && 0; }); await WG(1.2); await cam('correr', Math.PI / 2, 3.2);
  await ev(() => { G.sticks.L = null; G.p.sprint = false; G.select(0); G.refresh(); }); await WG(0.8); await ev(() => G.aimStart ? G.aimStart() : G.fireDown()); await WG(1); await cam('rifle-frente', 0.5); await cam('rifle-lado', Math.PI / 2);
  await ev(() => { G.aimEnd && G.aimEnd(); G.select(2); G.refresh(); }); await WG(0.6); await ev(() => G.fireDown()); await WG(1); await cam('pistola', 0.6);
  await ev(() => { G.aimEnd && G.aimEnd(); const z = G.zs[0]; z.x = G.p.x + 2.5; z.z = G.p.z; z.state = 'wander'; z.lv = 0; z.hide = false; window.__z = z; }); await WG(1.5);
  const url = await ev(() => { const z = window.__z; return G.dbgCam([z.x + 2.2, 1.5, z.z + 1.6], [z.x, 1.0, z.z], 36, 640, 640); }); fs.writeFileSync(__dirname + '/shots/ch-zombie.jpg', Buffer.from(url.split(',')[1], 'base64'));
};
