// chão da arena: a terra do parque e o betão não aparecem um por cima do outro (de perto, ao longe e rasante)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await W(2000); await ev(() => { G.dbgKit(); const a = document.getElementById('arw'); if (a) a.hidden = true; }); await W(1500);
  const V = [[3650, 3650 + 26, Math.PI, -0.35, 'a'], [3650 - 10, 3650 + 28, Math.PI * 0.8, -0.12, 'b'], [3650 + 20, 3650 + 4, 0.2, -0.05, 'c'], [3650, 3650 + 16, 0, -0.5, 'd']];
  for (const [x, z, a, pit, n] of V) { await ev(([x, z, a, pit]) => { const p = G.p; p.x = x; p.z = z; p.yaw = p.root = a; G.aimS.fy = a; G.aimS.fpit = pit; }, [x, z, a, pit]); await W(2500); console.log(n, JSON.stringify(await ev(() => [+G.p.x.toFixed(1), +G.p.z.toFixed(1), +(G.p.y||0).toFixed(2)]))); await shot('archao-' + n); }
};
