// casas: faixa da parede entre pisos junto às escadas, luzes vistas de fora à noite, e quanto demora a entrar
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await ev(() => G.dbgKit()); await W(1000);
  const C = await ev(() => { const L = G.dbgW.cuts.filter(c => c.shell && c.n >= 2 && c.stairs && c.stairs.length && c.lamps && c.lamps.length).sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - 60, (a.z0 + a.z1) / 2) - Math.hypot((b.x0 + b.x1) / 2 - 60, (b.z0 + b.z1) / 2)); const c = L[0]; const s = c.stairs[0]; return { x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, s: { x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1 }, n: c.n, name: c.name }; });
  console.log('casa', JSON.stringify(C));
  const sx = (C.s.x0 + C.s.x1) / 2, sz = (C.s.z0 + C.s.z1) / 2;
  await ev(([x, z]) => { const p = G.p; p.x = x; p.z = z; p.lv = 0; G.cyc = 700; G.aimS.fpit = 0.55; }, [sx, sz]); await W(2500);
  for (let k = 0; k < 4; k++) { await ev(k => { const p = G.p; p.yaw = p.root = k * Math.PI / 2; G.aimS.fy = p.yaw; }, k); await W(900); await shot('casa-esc' + k); }
  // de fora, à noite, a 5 m da parede do lado de baixo (z1), virado para a casa
  await ev(([c]) => { const p = G.p; p.x = (c.x0 + c.x1) / 2; p.z = c.z1 + 5; p.lv = 0; p.yaw = p.root = Math.PI; G.aimS.fy = Math.PI; G.aimS.fpit = 0.05; G.cyc = 1700; }, [C]); await W(3000);
  console.log('fora:', await ev(() => [!!G.inside, G.dbgLG()].join(' '))); await shot('casa-fora');
  // entrar: tempo de cada imagem nos 2 s seguintes
  const T = await ev(async ([c]) => { const p = G.p; p.x = (c.x0 + c.x1) / 2; p.z = (c.z0 + c.z1) / 2; const out = []; let t0 = performance.now(); for (let i = 0; i < 40; i++) { await new Promise(r => requestAnimationFrame(r)); const t = performance.now(); out.push(Math.round(t - t0)); t0 = t; } return out; }, [C]);
  console.log('ao entrar (ms por imagem):', T.slice(0, 15).join(' '), '· máx', Math.max(...T));
};
