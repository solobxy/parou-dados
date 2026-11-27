// cartões dos modos: câmara livre (G.dbgCam) sobre a rua com zombies, e sobre a arena
const fs = require('fs'), path = require('path');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const arena = !!process.env.KG_ARENA;
  if (!arena) { await ev(() => G.dbgKit()); await W(1500); await ev(() => { const p = G.p; p.x = -2668; p.z = -2775; G.cyc = 1380; p.god = true; }); await W(12000); }
  else { await W(6000); }
  const r = await ev(arena => { const p = G.p || { x: 3650, z: 3650 }; let tx = p.x, tz = p.z;
    if (!arena) { const zs = (G.zs || []).filter(z => z.state !== 'dead').map(z => [z, Math.hypot(z.x - p.x, z.z - p.z)]).sort((a, b) => a[1] - b[1]).slice(0, 5); if (zs.length) { tx = zs.reduce((s, q) => s + q[0].x, 0) / zs.length; tz = zs.reduce((s, q) => s + q[0].z, 0) / zs.length; } }
    const dx = tx - p.x, dz = tz - p.z, L = Math.hypot(dx, dz) || 1, cx = arena ? 3650 - 22 : p.x - dx / L * 3, cz = arena ? 3650 + 30 : p.z - dz / L * 3;
    const pos = arena ? [cx, 9, cz] : [cx, 1.5, cz], at = arena ? [3650 + 10, 1.5, 3650 - 10] : [tx, 1.2, tz];
    return { url: G.dbgCam(pos, at, arena ? 55 : 50, 900, 1100), n: (G.zs || []).length }; }, arena);
  fs.writeFileSync(path.join(__dirname, 'shots', 'card-' + (arena ? 'arena' : 'survival') + '.png'), Buffer.from(r.url.split(',')[1], 'base64')); console.log('zombies', r.n);
};
