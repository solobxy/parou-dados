module.exports = async (page, shot) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms), fs = require('fs');
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1500); await ev(() => { for (const z of G.zs) z.x += 3000; G.tod = 0.5; }); await WG(1);
  await ev(() => { G.dbgShowBody = true; });
  for (const [nm, k, gun] of [['pe', 0, 'm4'], ['agach', 1, 'm4'], ['deit', 2, 'm4'], ['deitp', 2, 'pistola'], ['agachp', 1, 'pistola'], ['deitn', 2, null]]) {
    await ev(([k, gun]) => { G.inv.belt.fill(null); if (gun) G.inv.belt[0] = G.mkItem(gun); G.sel = 0; G.refresh(); G.stanceSet(k); if (gun && G.aimStart) G.aimStart(); }, [k, gun]); await WG(1.3);
    const u = await ev(() => { const p = G.p, c = Math.cos(p.root), s = Math.sin(p.root); return G.dbgCam([p.x + c * 2.6 + s * 0.4, p.y + 0.9, p.z - s * 2.6 + c * 0.4], [p.x + s * 0.3, p.y + 0.5, p.z + c * 0.3], 45, 600, 420); });
    fs.writeFileSync('shots/st-' + nm + '.jpg', Buffer.from(u.split(',')[1], 'base64')); }
};
