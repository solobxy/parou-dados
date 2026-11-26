module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a); const fs = require('fs');
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  const snap = async (name) => { const u = await ev(() => { const p = G.p, y = p.root; return G.dbgCam([p.x + Math.sin(y + 1.57) * 3, p.y + 1.3, p.z + Math.cos(y + 1.57) * 3], [p.x, p.y + 0.9, p.z], 34, 420, 420); }); fs.writeFileSync('shots/' + name + '.jpg', Buffer.from(u.split(',')[1], 'base64')); };
  await ev(() => G.dbgKit()); await WG(1.5);
  await ev(() => { for (const z of G.zs) z.x += 3000; G.inv.belt.fill(null); G.sel = 0; G.refresh(); }); await WG(0.3);
  for (const [nm, run, w] of [['andar', 0, null], ['correr', 1, null], ['correr-m4', 1, 'm4']]) {
    await ev(([run, w]) => { if (w) { const g = G.mkItem(w); g.att = {}; G.inv.belt[1] = g; G.select(1); } else G.select(0); G.refresh(); G.sticks.L = { x: 0, y: -1, m: 1 }; G.autoRun = !!run; }, [run, w]); await WG(1.2);
    for (let i = 0; i < 4; i++) { await snap('w-' + nm + i); await WG(0.09); }
    await ev(() => { G.sticks.L = null; G.autoRun = false; }); await WG(0.5);
  }
};
