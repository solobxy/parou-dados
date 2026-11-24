// encostados a uma parede: o zombie não mete a cabeça e os braços através dela; o jogador baixa a arma
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2500);
  const r = await ev(async () => { const sl = ms => new Promise(r => setTimeout(r, ms));
    // uma parede comprida perto (de uma casa da vila mais perto)
    const p = G.p; let best = null; for (let rad = 20; rad < 900 && !best; rad += 40) { const L = G.dbg.cols(p.x, p.z, rad).filter(q => q[0] === 'r' && q[1] === 's' && Math.max(q[4] - q[2], q[5] - q[3]) > 4 && Math.min(q[4] - q[2], q[5] - q[3]) < 0.4 && q[6] > 2.4 && !q[7]); if (L.length) best = L[0]; }
    if (!best) return null; const [, , x0, z0, x1, z1] = best, horiz = x1 - x0 > z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // de fora da parede (do lado de onde se vê melhor) e de frente para ela
    const side = 1, zx = horiz ? cx : (side > 0 ? x1 : x0) + side * 0.25, zz = horiz ? (side > 0 ? z1 : z0) + side * 0.25 : cz, yaw = horiz ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    p.x = zx + (horiz ? 2.2 : side * 2.2); p.z = zz + (horiz ? side * 2.2 : 0); await sl(1500);
    const z = G.zs[0]; for (const o of G.zs) if (o !== z) o.x += 4000; Object.assign(z, { x: zx, z: zz, y: 0, lv: 0, yaw, state: 'chase', tx: zx, tz: zz, hp: 999, frz: 1.5 });
    return { wall: best, zx, zz };
  });
  console.log('parede:', JSON.stringify(r)); await W(2500);
  const st = await ev(() => { const z = G.zs[0], wf = G.wallAhead(z.x, z.z, z.yaw, 0); return { wallK: +(z.wallK || 0).toFixed(2), dist: +wf.toFixed(2), state: z.state }; });
  console.log('zombie:', JSON.stringify(st), st.dist >= 0.38 ? 'OK afastado' : 'ENCOSTADO DEMAIS');
  await shot('zombie-parede');
};
