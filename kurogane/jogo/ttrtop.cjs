module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  for (const [n, x, z] of [['c', 0, 0], ['m', 190, -178], ['a', 2600, -2600], ['p', -1500, -3420]]) { await ev(([x, z]) => { G.p.x = x; G.p.z = z + 6; }, [x, z]); await W(2500); const u = await ev(([x, z]) => G.dbgTop(x, z, 90, 700), [x, z]); require('fs').writeFileSync(__dirname + '/shots/trtop-' + n + '.jpg', Buffer.from(u.split(',')[1], 'base64')); }
};
