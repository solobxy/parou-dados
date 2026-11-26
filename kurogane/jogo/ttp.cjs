// 3.ª pessoa: recarga (M4, pistola), granada e ligadura
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a);
  const fs = require('fs');
  const snap = async (name, ang = 1.0) => { const u = await ev(a => { const p = G.p, y = p.root; return G.dbgCam([p.x + Math.sin(y + a) * 2.6, p.y + 1.7, p.z + Math.cos(y + a) * 2.6], [p.x, p.y + 1.1, p.z], 34, 520, 520); }, ang); fs.writeFileSync('shots/' + name + '.jpg', Buffer.from(u.split(',')[1], 'base64')); };
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await WG(1.5);
  await ev(() => { for (const z of G.zs) z.x += 3000; G.inv.belt.fill(null); G.sel = 0; G.refresh(); const st = document.createElement('style'); st.textContent = 'body *:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}'; document.head.appendChild(st); }); await WG(0.5);
  for (const w of ['m4', 'pistola']) {
    await ev(w => { const g = G.mkItem(w); g.att = {}; g.ammo = 3; G.inv.belt[1] = g; G.sel = -1; G.select(1); G.refresh(); }, w); await WG(0.8);
    for (const f of [0.06, 0.2, 0.4, 0.6, 0.8]) { await ev(f => { G.p.reloadDur = 1000; G.p.reload = 1000 * (1 - f); }, f); await WG(0.25); await snap('tp-' + w + '-r' + Math.round(f * 100)); }
    await ev(() => { G.p.reload = 0; });
  }
  await ev(() => { G.inv.belt[1] = null; G.inv.belt[2] = G.mkItem('granada'); G.select(2); G.refresh(); }); await WG(0.5);
  for (const f of [0.25, 0.5, 0.7]) { await ev(f => { G.p.thrIt = null; G.p.thrT = f - 0.05; }, f); await WG(0.03); await snap('tp-gran' + Math.round(f * 100), 1.6); }
};
