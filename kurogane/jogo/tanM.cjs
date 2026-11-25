// modelos dos animais lado a lado num campo
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  const o = await ev(() => { const p = G.p, cx = p.x, cz = p.z + 7; const ks = ['veado', 'veado', 'javali', 'lobo', 'cao', 'galinha']; ks.forEach((k, i) => { const a = G.zs.find(z => z.an === k && !z.used); a.used = 1; a.x = cx - 6 + i * 2.4; a.z = cz; a.yaw = -Math.PI / 2 + (i === 1 ? 0.6 : 0); a.frz = i === 1 ? 1.2 : 0; a.state = 'wander'; a.male = i === 0; a.hide = false; }); return { cx, cz }; });
  await W(1500);
  for (const [n, dx, dy, dz] of [['anM-lado', 0, 2.2, -8], ['anM-cima', -3, 6, -6]]) { const u = await ev(([o, dx, dy, dz]) => G.dbgCam([o.cx + dx, dy, o.cz + dz], [o.cx, 0.6, o.cz], 50, 900, 450), [o, dx, dy, dz]); require('fs').writeFileSync(__dirname + '/shots/' + n + '.jpg', Buffer.from(u.split(',')[1], 'base64')); }
};
