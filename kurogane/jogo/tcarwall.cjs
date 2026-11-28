// não se entra num carro com uma parede pelo meio; do lado do carro, entra-se
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2500);
  const setup = await ev(() => { const W = G.W, p = G.p; let best = null, bd = 1e9;
    for (const r of W.rects) { if (r.k !== 's' || r.lv || r.h < 2.4 || r.door) continue; const w = r.x1 - r.x0, d = r.z1 - r.z0; if (Math.min(w, d) > 0.5 || Math.max(w, d) < 5) continue; const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, dd = Math.hypot(cx - p.x, cz - p.z); if (dd < bd) { const hz = w > d, n = hz ? [0, 1] : [1, 0], th = Math.min(w, d) / 2;
        const car = [cx + n[0] * (th + 1.5), cz + n[1] * (th + 1.5)], back = [cx - n[0] * (th + 0.45), cz - n[1] * (th + 0.45)], front = [cx + n[0] * (th + 0.4), cz + n[1] * (th + 0.4)];
        const clear = P => !W.rects.some(q => q !== r && !q.lv && q.k !== 'g' && P[0] > q.x0 - 0.35 && P[0] < q.x1 + 0.35 && P[1] > q.z0 - 0.35 && P[1] < q.z1 + 0.35);
        if (!clear(back) || !clear(front) || !clear(car)) continue; bd = dd; best = { car, back, front, yaw: hz ? Math.PI / 2 : 0 }; } }
    if (!best) return null; G.cars.dbgAdd('sedan', best.car[0], best.car[1], best.yaw); return best; });
  if (!setup) { console.log('FALHA não encontrei carro junto a uma parede'); return; }
  const tryAt = async P => { await ev(P => { G.p.x = P[0]; G.p.z = P[1]; G.p.vx = G.p.vz = 0; }, P); await W(1500); return ev(() => G.prompt && G.prompt.car ? G.prompt.label : (G.prompt ? '(' + G.prompt.label + ')' : '-')); };
  const back = await tryAt(setup.back), front = await tryAt(setup.front);
  console.log('atrás da parede:', back, '· do lado do carro:', front);
  console.log((!/Conduzir|Entrar|pendura|Pedalar|mota/.test(back) ? 'OK   ' : 'FALHA') + ' com a parede pelo meio não aparece «entrar no carro»');
  console.log((/Conduzir|Entrar|pendura|Pedalar|mota|lugar|gasolina/.test(front) ? 'OK   ' : 'FALHA') + ' do lado do carro aparece');
  // a conduzir: sem os contornos das portas e janelas (raio-x) nem a sombra de «fora da vista»
  await ev(() => { G.playing = true; G.fp = false; }); await W(1500); const before = await ev(() => ({ playing: G.playing, fp: G.fp, ...G.dbgView() }));
  await ev(() => { const c = G.prompt && G.prompt.car; if (c) G.cars.enter(c); }); await W(2500);
  const drv = await ev(() => ({ car: !!G.car, ...G.dbgView() }));
  console.log('a pé:', JSON.stringify(before), '· a conduzir:', JSON.stringify(drv));
  console.log((drv.car && !drv.xray && drv.visK === 1 ? 'OK   ' : 'FALHA') + ' a conduzir não há raio-x nem sombras de fora da vista');
};
