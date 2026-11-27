// relevo: vai a uma colina, vê de cima e na 1.ª pessoa, confirma que o jogador anda por cima do chão
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const info = await ev(() => ({ ms: G.W.terMs, sum: G.TER.sum }));
  console.log('relevo feito em', info.ms, 'ms · soma', info.sum);
  await ev(() => G.dbgKit()); await W(800);
  // procura um sítio alto a até 1,5 km do início, longe de cidades
  const spot = await ev(N => { const T = G.TER; let best = null; for (let k = 0; k < 4000; k++) { const x = (Math.random() * 2 - 1) * 1500, z = (N ? -800 - Math.random() * 1500 : 300 + Math.random() * 1200); const h = T.at(x, z), g = Math.abs(T.at(x + 30, z) - T.at(x - 30, z)) + Math.abs(T.at(x, z + 30) - T.at(x, z - 30)); if (h > 6 && g > 4 && (!best || g > best[3])) best = [x, z, h, g]; } return best; }, !!process.env.KG_NORTE);
  console.log('colina', JSON.stringify(spot));
  const [x, z] = spot; await ev(([x, z]) => { const p = G.p; p.x = x; p.z = z; p.vx = p.vz = 0; }, [x, z]); await W(2500);
  const y = await ev(() => [G.p.y, G.TER.at(G.p.x, G.p.z)]); console.log((Math.abs(y[0] - y[1]) < 0.3 ? 'OK   ' : 'FALHA') + ' o jogador está em cima do chão (' + y.map(v => v.toFixed(2)).join(' / ') + ')');
  await shot('ter-cima');
  // anda colina acima e confirma que sobe
  const up = await ev(() => { const T = G.TER, p = G.p; let bx = 0, bz = 0, bh = -1; for (let a = 0; a < 6.28; a += 0.3) { const h = T.at(p.x + Math.sin(a) * 25, p.z + Math.cos(a) * 25); if (h > bh) { bh = h; bx = Math.sin(a); bz = Math.cos(a); } } return [bx, bz]; });
  const y0 = await ev(() => G.p.y); await ev(u => { const p = G.p; p.x += u[0] * 20; p.z += u[1] * 20; }, up); await W(1500); const y1 = await ev(() => G.p.y);
  console.log((y1 > y0 + 0.3 ? 'OK   ' : 'FALHA') + ' 20 m colina acima, a altura muda (' + y0.toFixed(2) + ' → ' + y1.toFixed(2) + ')');
  await ev(u => { G.fpFree = true; const a = Math.atan2(-u[0], -u[1]); const p = G.p; p.yaw = p.root = a; G.aimS.fy = a; G.aimS.fpit = 0.02; }, up); await W(3000); await shot('ter-fp');
  await ev(u => { const a = Math.atan2(u[0], u[1]); const p = G.p; p.yaw = p.root = a; G.aimS.fy = a; }, up); await W(2500); await shot('ter-fp2');
  await ev(() => { G.fpFree = false; }); await W(2500); await shot('ter-topo');
};
