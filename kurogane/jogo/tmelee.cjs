// armas brancas novas: na mão (3.ª pessoa de perto), 1.ª pessoa e ícones
const fs = require('fs');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { for (const z of G.zs) z.x += 3000; const p = G.p; p.x = 1200; p.z = 1200; G.camT.set(p.x, 0, p.z); G.cyc = 700; }); await WG(1);
  const save = (n, u) => fs.writeFileSync(`shots/m-${n}.jpg`, Buffer.from(u.split(',')[1], 'base64'));
  for (const k of ['faca', 'machete', 'machado', 'picareta', 'lanca', 'bastao', 'pecabra', 'katana', 'pedra']) {
    await ev(k => { G.inv.belt[0] = G.mkItem(k); G.select(0); G.refresh(); }, k); await WG(0.6);
    save(k + '-tp', await ev(() => { const p = G.p, y = p.yaw; return G.dbgCam([p.x + Math.sin(y + 1.0) * 1.7, p.y + 1.4, p.z + Math.cos(y + 1.0) * 1.7], [p.x, p.y + 1.0, p.z], 40, 500, 500); }));
    save(k + '-icone', await ev(k => G.ICONS[k], k));
  }
  await ev(() => G.viewToggle()); await WG(1.2); await shot('m-katana-fp');
};
