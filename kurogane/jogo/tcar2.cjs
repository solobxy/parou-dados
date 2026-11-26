// condução: derrapagem nas curvas rápidas, sem atravessar muros a alta velocidade, e não se atravessam carros a andar
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await WG(1);
  // estrada longa e livre: procurar um ponto numa estrada larga
  const st = await ev(() => { const W = G.dbgW; const r = W.roads.filter(r => Math.max(r.x1 - r.x0, r.z1 - r.z0) > 300).sort((a, b) => (b.x1 - b.x0 + b.z1 - b.z0) - (a.x1 - a.x0 + a.z1 - a.z0))[0]; const ax = r.x1 - r.x0 > r.z1 - r.z0; const x = ax ? r.x0 + 40 : (r.x0 + r.x1) / 2, z = ax ? (r.z0 + r.z1) / 2 : r.z0 + 40; G.p.x = x; G.p.z = z; const c = G.cars.dbgAdd('sedan', x + 2, z, ax ? Math.PI / 2 : 0); G.cars.seated(c, 0); return { x, z, ax }; });
  await WG(0.3);
  await ev(() => { G.dbgDrive = { kb: true, t: 1, s: 0 }; }); await WG(4.5);
  const a = await ev(() => ({ v: +G.car.v.toFixed(1), slip: +(G.car.slip || 0).toFixed(2) })); console.log('reta 4,5 s:', JSON.stringify(a));
  let mx = 0; for (let i = 0; i < 12; i++) { await ev(() => { G.dbgDrive = { kb: true, t: 1, s: 1 }; }); await WG(0.1); const s = await ev(() => Math.abs(G.car.slip || 0)); mx = Math.max(mx, s); }
  await shot('car-curva');
  const b = await ev(() => ({ v: +G.car.v.toFixed(1), slip: +(G.car.slip || 0).toFixed(2) })); console.log('curva a fundo: derrapagem máxima', mx.toFixed(2), JSON.stringify(b));
  await ev(() => { G.dbgDrive = { kb: true, t: 0, s: 0 }; }); await WG(1.5); console.log('endireita:', await ev(() => +(G.car.slip || 0).toFixed(2)));
  // muro: carro a 22 m/s contra uma parede de casa, de frente
  const w = await ev(() => { const W = G.dbgW, c = G.car; const R = W.rects.find(r => (r.lv || 0) === 0 && r.k === 's' && r.h > 1 && Math.max(r.x1 - r.x0, r.z1 - r.z0) > 4 && Math.min(r.x1 - r.x0, r.z1 - r.z0) < 0.35); const thinX = R.x1 - R.x0 < R.z1 - R.z0, cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
    c.x = thinX ? R.x0 - 8 : cx; c.z = thinX ? cz : R.z0 - 8; c.yaw = thinX ? Math.PI / 2 : 0; c.v = 22; c.slip = 0; G.dbgDrive = { kb: true, t: 1, s: 0 }; return { thinX, wall: thinX ? R.x0 : R.z0, cx, cz }; });
  await WG(1.2);
  const e = await ev(w => { const c = G.car; return { pos: +(w.thinX ? c.x : c.z).toFixed(2), wall: +w.wall.toFixed(2), hp: Math.round(c.hp) }; }, w); console.log('muro (tem de ficar antes da parede):', JSON.stringify(e), e.pos < e.wall ? 'OK' : 'ATRAVESSOU');
  await ev(() => { G.dbgDrive = null; });
};
