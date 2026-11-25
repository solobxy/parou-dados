// corpo novo do jogador e dos comerciantes: frente, cara, lado, de cima, penteados e cores
const fs = require('fs');
module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  const tag = process.env.TAG || 'p';
  const save = (name, url) => fs.writeFileSync(`shots/${tag}-${name}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { G.cyc = 700; const p = G.p; p.x = -6; p.z = 3; G.camT.set(p.x, 0, p.z); for (const z of G.zs) z.x += 5000; });
  await WG(2.5);
  const view = async (name, f, a) => save(name, await ev(f, a));
  const F = () => { const b = G.body, y = b.root.rotation.y, p = b.root.position; return { x: p.x, y: p.y, z: p.z, fx: Math.sin(y), fz: Math.cos(y) }; };
  await ev(F.toString().replace(/^\(\) => /, 'window.__F = () => '));
  await view('frente', () => { const f = __F(); return G.dbgCam([f.x + f.fx * 3, f.y + 1.2, f.z + f.fz * 3], [f.x, f.y + 0.95, f.z], 40, 600, 800); });
  await view('cara', () => { const f = __F(); return G.dbgCam([f.x + f.fx * 0.8, f.y + 1.68, f.z + f.fz * 0.8], [f.x, f.y + 1.6, f.z], 38, 600, 600); });
  await view('lado', () => { const f = __F(); return G.dbgCam([f.x + f.fz * 3 + f.fx, f.y + 1.2, f.z - f.fx * 3 + f.fz], [f.x, f.y + 0.95, f.z], 40, 600, 800); });
  await view('costas', () => { const f = __F(); return G.dbgCam([f.x - f.fx * 3, f.y + 1.3, f.z - f.fz * 3], [f.x, f.y + 0.95, f.z], 40, 600, 800); });
  await shot('jogo');
  const looks = [{ hairS: 0, beardS: 1, top: 0x3a4a5e, legs: 0x2c3440, skin: 0xf1c9a5, hair: 0x4a3424 }, { hairS: 2, beardS: 0, top: 0x7a2a3a, legs: 0x2a2a2a, skin: 0x8d5a3b, hair: 0x2a211b }, { hairS: 3, beardS: 2, top: 0xc4b9a4, legs: 0x6a6458, skin: 0xe3b48e, hair: 0xb08a4a }, { hairS: 4, beardS: 0, top: 0x2a2b2c, legs: 0x3d4a5a, skin: 0xb9805a, hair: 0xb8342a }, { hairS: 1, beardS: 1, top: 0x5c6846, legs: 0x3a3f33, skin: 0x5e3a25, hair: 0x8a8a86 }];
  await ev(() => { for (const k in G.inv.eq) G.inv.eq[k] = null; });
  for (let i = 0; i < looks.length; i++) { await ev(L => G.setLook(L), looks[i]); await WG(0.4);
    await view('look' + i, () => { const f = __F(); return G.dbgCam([f.x + f.fx * 2.2 + f.fz * 0.8, f.y + 1.35, f.z + f.fz * 2.2 - f.fx * 0.8], [f.x, f.y + 1.05, f.z], 40, 420, 600); }); }
  // comerciantes
  for (let i = 0; i < 4; i++) { await ev(i => { const b = G.npcs[i].b, y = G.npcs[i].T.yaw, p = b.root.position; G.p.x = p.x + Math.sin(y) * 4; G.p.z = p.z + Math.cos(y) * 4; G.camT.set(G.p.x, 0, G.p.z); }, i); await WG(1.2);
    await view('npc' + i, (i) => { const b = G.npcs[i].b, y = b.root.rotation.y, p = b.root.position; return G.dbgCam([p.x + Math.sin(y) * 2.2, p.y + 1.4, p.z + Math.cos(y) * 2.2], [p.x, p.y + 1.05, p.z], 40, 420, 600); }, i); }
};
