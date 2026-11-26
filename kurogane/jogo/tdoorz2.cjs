module.exports = async (page, shot) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms), fs = require('fs');
  await W(2500); await ev(() => { G.net.start = () => { }; G.ui.arenaHide(); G.arenaStart(0, 'atirador'); }); await W(3000);
  for (const [nm, op] of [['fz', 1], ['fz0', 0]]) {
    const u = await ev(op => { const p = G.p, D = G.W.doors.map(D => ({ D, d: Math.hypot(D.x - p.x, D.z - p.z) })).sort((a, b) => a.d - b.d).find(a => a.D.lv === 0).D; D.t = D.target = op; const nx = D.horiz ? 0 : -D.inward, nz = D.horiz ? -D.inward : 0, tx = D.horiz ? 1 : 0, tz = D.horiz ? 0 : 1, e = D.w / 2;
      return G.dbgCam([D.x + nx * 1.6 + tx * 0.2, 1.5, D.z + nz * 1.6 + tz * 0.2], [D.x + tx * e, 1.4, D.z + tz * e], 30, 1200, 900); }, op);
    await W(800); fs.writeFileSync('shots/' + nm + '.jpg', Buffer.from(u.split(',')[1], 'base64')); }
};
