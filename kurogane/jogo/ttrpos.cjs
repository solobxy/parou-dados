// procura um sítio livre (chão, sem paredes perto) para cada comerciante, perto do centro da sua zona
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  console.log(JSON.stringify(await ev(() => { const out = []; for (const T of G.TR.TRADERS) { let best = null;
    for (let r = 0; r < 45 && !best; r += 1.5) for (let a = 0; a < 6.28 && !best; a += 0.35) { const x = T.x + Math.sin(a) * r, z = T.z + Math.cos(a) * r; if (G.W.wet(x, z, 1)) continue; let ok = !G.W.roads.some(q => x > q.x0 - 1 && x < q.x1 + 1 && z > q.z0 - 1 && z < q.z1 + 1); for (const q of G.W.rects) if (x > q.x0 - 2.2 && x < q.x1 + 2.2 && z > q.z0 - 2.2 && z < q.z1 + 2.2 && (q.h || 0) > 0.3) { ok = false; break; } if (ok) best = [Math.round(x * 10) / 10, Math.round(z * 10) / 10]; }
    out.push([T.id, T.where, best]); } return out; })));
};
