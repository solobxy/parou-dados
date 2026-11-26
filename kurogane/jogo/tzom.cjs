// zombies de perto (frente, lado, de cima como no jogo) e o custo de desenho com muitos à vista
const fs = require('fs');
module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1500);
  // um sítio aberto, de dia; três zombies parados à frente (um a andar)
  const tag = process.env.TAG || 'z';
  await ev(() => { G.cyc = 700; const p = G.p; p.x = -6; p.z = 3; G.camT.set(p.x, 0, p.z); for (const z of G.zs) z.x += 5000; const Z = G.zs.filter(z => !z.an).slice(0, 3); Z.forEach((z, i) => { z.x = p.x - 1.2 + i * 1.2; z.z = p.z + 4; z.y = 0; z.yaw = Math.PI; z.state = 'wander'; z.mv = i === 2 ? 1 : 0; z.hp = 999; z.frozen = true; z.vx = z.vz = 0; z.hide = false; }); window.__Z = Z; });
  await WG(1.5);
  await ev(() => { for (const z of window.__Z) { z.x = G.p.x - 1.2 + window.__Z.indexOf(z) * 1.2; z.z = G.p.z + 4; z.yaw = Math.PI; } });
  await WG(0.3);
  const save = (name, url) => fs.writeFileSync(`shots/${tag}-${name}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  save('frente', await ev(() => { const p = G.p, s = window.__Z[1].sc || 1; return G.dbgCam([p.x, 1.4 * s, p.z + 1.0], [p.x, 1.0 * s, p.z + 4], 42, 900, 600); }));
  save('cara', await ev(() => { const z = window.__Z[1], s = z.sc || 1; return G.dbgCam([z.x, 1.66 * s, z.z - 0.85], [z.x, 1.62 * s, z.z], 38, 600, 600); }));
  save('lado', await ev(() => { const z = window.__Z[1]; return G.dbgCam([z.x + 3, 1.3, z.z - 0.5], [z.x, 0.95, z.z], 40, 700, 600); }));
  save('cima', await ev(() => { const p = G.p; return G.dbgCam([p.x, 14, p.z - 4], [p.x, 0, p.z + 4], 30, 900, 600); }));
};
