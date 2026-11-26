// helicóptero aterra num telhado plano, sai-se para o telhado, anda-se lá em cima, volta-se a entrar e descola; saltar do telhado magoa
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const GT = async s => { const t0 = await ev(() => G.t); while ((await ev(() => G.t)) - t0 < s) await W(250); };
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await ev(() => G.dbgKit()); await W(1500);
  const info = await ev(() => { for (const z of G.zs) z.x += 9000; const W0 = G.W;
    const cs = W0.cuts.filter(C => C.roofY && C.ix1 - C.ix0 > 6.5 && C.iz1 - C.iz0 > 6.5);
    for (const C of cs) { const free = (x, z) => !W0.rects.some(r => r.lv === C.n && r.roof && x + 2.3 > r.x0 && x - 2.3 < r.x1 && z + 2.3 > r.z0 && z - 2.3 < r.z1);
      for (let k = 0; k < 200; k++) { const x = C.ix0 + 2.3 + Math.random() * (C.ix1 - C.ix0 - 4.6), z = C.iz0 + 2.3 + Math.random() * (C.iz1 - C.iz0 - 4.6); if (free(x, z)) { window.__R = { id: C.id, x, z }; return { n: cs.length, name: C.name, roofY: +C.roofY.toFixed(2), floors: C.n, x: +x.toFixed(1), z: +z.toFixed(1) }; } } }
    return { n: cs.length }; });
  console.log('telhado:', JSON.stringify(info));
  const hid = await ev(() => { const c = G.cars.list.find(q => q.k === 'heli'); G.p.x = c.x + 3; G.p.z = c.z; return c.id; });
  await ev(id => G.cars.enter(G.cars.list.find(q => q.id === id)), hid); await W(500);
  await ev(() => { const R = window.__R, C = G.W.cuts.find(c => c.id === R.id), c = G.car; c.x = R.x; c.z = R.z; c.yaw = 0.3; c.air = true; c.alt = C.roofY + 10; c.uAlt = C.roofY + 10; c.rot = 1; c.vx = c.vz = 0; G.dbgDrive = { kb: true, t: -1, s: 0 }; G.cyc = 700; });
  for (let i = 0; i < 16; i++) { await GT(1); const q = await ev(() => { const c = G.car; return [+c.alt.toFixed(2), !!c.air, +(c.pad || 0).toFixed(2)]; }); if (i % 3 === 0 || !q[1]) console.log('a descer', JSON.stringify(q)); if (!q[1]) break; }
  await ev(() => { G.dbgDrive = { kb: true, t: 0, s: 0 }; }); await GT(1.5);
  await shot('heli-telhado');
  await ev(() => G.cars.exit()); await GT(1.2);
  const st = () => ev(() => { const p = G.p; return { lv: p.lv, bld: p.bld && p.bld.name, y: +p.y.toFixed(2), base: +(p.base || 0).toFixed(2), hp: Math.round(p.hp), dentro: G.inside && G.inside.name, carro: !!G.car }; });
  console.log('saiu:', JSON.stringify(await st()));
  await shot('no-telhado');
  // andar no telhado
  await ev(() => { const R = window.__R; G.p.x = R.x + 2.6; }); await GT(1.5); console.log('a andar:', JSON.stringify(await st()));
  console.log('carro perto (no telhado):', await ev(() => !!G.cars.nearest(G.p)));
  // voltar a entrar e descolar
  await ev(() => { const R = window.__R; G.p.x = R.x + 2.2; G.p.z = R.z; const c = G.cars.nearest(G.p); if (c) G.cars.enter(c); }); await W(500);
  console.log('entrou de novo:', await ev(() => !!G.car));
  await ev(() => { G.dbgDrive = { kb: true, t: 1, s: 0 }; }); await GT(6);
  console.log('descolou:', JSON.stringify(await ev(() => { const c = G.car; return [+c.alt.toFixed(1), !!c.air, +(c.pad || 0).toFixed(1), Math.round(c.x - window.__R.x)]; })));
  // de volta, aterrar outra vez e sair, depois saltar do telhado
  await ev(() => { const R = window.__R, C = G.W.cuts.find(c => c.id === R.id), c = G.car; c.x = R.x; c.z = R.z; c.vx = c.vz = 0; c.alt = C.roofY + 4; c.uAlt = C.roofY + 4; G.dbgDrive = { kb: true, t: -1, s: 0 }; });
  for (let i = 0; i < 12; i++) { await GT(1); if (!(await ev(() => G.car.air))) break; }
  await ev(() => { G.dbgDrive = { kb: true, t: 0, s: 0 }; G.cars.exit(); }); await GT(1);
  const hp0 = await ev(() => G.p.hp);
  await ev(() => { const C = G.p.bld; G.p.x = C.ix1 + 0.6; }); await GT(2.5);
  console.log('saltou (hp antes ' + Math.round(hp0) + '):', JSON.stringify(await st()));
  // do chão: o helicóptero lá em cima não se alcança
  await ev(() => { const R = window.__R, C = G.W.cuts.find(c => c.id === R.id); G.p.x = C.x1 + 1; G.p.z = R.z; }); await GT(0.5);
  console.log('do chão alcança o heli do telhado?', await ev(() => { const c = G.cars.nearest(G.p, 30); return c ? c.k + ' alt ' + (c.alt || 0).toFixed(1) : 'não'; }));
  console.log('erros:', errs.length ? errs : 'nenhum');
};
