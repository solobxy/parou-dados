// base numa encosta: as fundações ficam ao mesmo nível e descem até ao chão; paredes, porta e teto em cima; um baú fora da base no chão
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(800);
  const spot = await ev(() => { const T = G.TER; let best = null; for (let k = 0; k < 6000; k++) { const x = (Math.random() * 2 - 1) * 1500, z = 300 + Math.random() * 1200; const g = Math.abs(T.at(x + 6, z) - T.at(x - 6, z)) + Math.abs(T.at(x, z + 6) - T.at(x, z - 6)); if (T.at(x, z) > 3 && g > 2 && g < 4 && (!best || g > best[2])) best = [x, z, g]; } return best; });
  console.log('encosta', JSON.stringify(spot));
  const res = await ev(s => { const i = Math.floor(s[0] / 3), j = Math.floor(s[1] / 3), P = [];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) P.push(['fund', 'f:' + (i + a) + ':' + (j + b), i + a, j + b, 1, 600, 0, 0]);
    for (let a = 0; a < 3; a++) { P.push(['parede', 'h:' + (i + a) + ':' + j, null, null, 0, 250, 0, 0]); if (a !== 1) P.push(['parede', 'h:' + (i + a) + ':' + (j + 2), null, null, 0, 250, 0, 0]); }
    P.push(['porta', 'h:' + (i + 1) + ':' + (j + 2), null, null, 0, 250, 0, 0]); P.push(['janela', 'v:' + i + ':' + j, null, null, 0, 250, 0, 0]); P.push(['parede', 'v:' + i + ':' + (j + 1), null, null, 0, 250, 0, 0]); P.push(['parede', 'v:' + (i + 3) + ':' + j, null, null, 0, 250, 0, 0]); P.push(['parede', 'v:' + (i + 3) + ':' + (j + 1), null, null, 0, 250, 0, 0]);
    P.push(['teto', 't:' + i + ':' + j, i, j, 0, 250, 0, 0]);
    G.base.load({ p: P, d: [['bau', i * 3 + 4.5, j * 3 + 3, 0, 0.3, 300, null, 0, 0, null, 0, 0], ['fogueira', i * 3 - 4, j * 3 + 3, 0, 0, 100, null, 0, 0, null, 0, 0]] }, () => null);
    const T = G.TER, lv = []; for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) { lv.push(+(T.at(i * 3 + a * 3 + 1.5, j * 3 + b * 3 + 1.5)).toFixed(2)); }
    const p = G.p; p.x = i * 3 + 4.5; p.z = j * 3 + 3; p.vx = p.vz = 0; return { i, j, terr: lv }; }, spot);
  console.log('base', JSON.stringify(res)); await W(2500);
  const y = await ev(() => [G.p.y, G.groundY(G.p.x, G.p.z)]); console.log('jogador em cima da fundação', y.map(v => v.toFixed(2)).join(' / '));
  await shot('base-dentro');
  await ev(r => { const p = G.p; p.x = r.i * 3 + 4.5; p.z = r.j * 3 + 18; const a = Math.atan2(0, -1); p.yaw = p.root = a; G.aimS.fy = a; G.aimS.fpit = 0.12; G.fpFree = true; }, res); await W(3000); await shot('base-fora');
  await ev(r => { const p = G.p; p.x = r.i * 3 - 12; p.z = r.j * 3 + 3; const a = Math.PI / 2; p.yaw = p.root = a; G.aimS.fy = a; G.aimS.fpit = 0.12; }, res); await W(3000); await shot('base-lado');
  await ev(() => { G.fpFree = false; }); await W(2500); await shot('base-topo');
};
