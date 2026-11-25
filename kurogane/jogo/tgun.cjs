// armas novas: 1.ª pessoa (à anca, mira de ferro, ponto vermelho, luneta), 3.ª pessoa de perto e ícone
const fs = require('fs');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  const K = process.env.GUN || 'm4', tag = 'g-' + K;
  await ev(() => G.dbgKit()); await W(1500);
  await ev(K => { for (const z of G.zs) z.x += 3000; const p = G.p; p.x = 1200; p.z = 1200; G.camT.set(p.x, 0, p.z); G.cyc = 700; const it = G.mkItem(K); it.ammo = 30; G.inv.belt[0] = it; G.select(0); G.refresh(); }, K); await WG(1.5);
  const save = (n, u) => fs.writeFileSync(`shots/${tag}-${n}.jpg`, Buffer.from(u.split(',')[1], 'base64'));
  save('tp', await ev(() => { const p = G.p, y = p.yaw; return G.dbgCam([p.x + Math.sin(y + 1.2) * 1.6, p.y + 1.5, p.z + Math.cos(y + 1.2) * 1.6], [p.x, p.y + 1.15, p.z], 40, 700, 500); }));
  await ev(() => G.viewToggle()); await WG(1.2); await shot(tag + '-fp-anca');
  for (const [nm, att] of [['ferro', {}], ['ponto', { scope: 'reddot', light: true }], ['sup', { sup: true, light: true }]]) {
    await ev(att => { G.inv.belt[0].att = att; G.refresh(); }, att); await WG(0.5); await shot(tag + '-fp-' + nm + '-anca');
    await ev(() => G.scopeToggle()); await WG(1.0); await shot(tag + '-fp-' + nm + '-mira'); await ev(() => G.scopeToggle()); await WG(0.5);
  }
  save('icone', await ev(K => G.ICONS[K], K));
};
