module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
  await page.click('#sKit'); await W(1500);
  // ir para a floresta, longe de tudo, e dar materiais
  const spot = await ev(() => { for (let k = 0; k < 4000; k++) { const x = -420 + Math.random() * 840, z = -420 + Math.random() * 840; let ok = true; for (let i = -1; i <= 2 && ok; i++) for (let j = -1; j <= 2 && ok; j++) if (G.base.B && false) ok = false; if (!ok) continue; const gi = Math.floor(x / 3), gj = Math.floor(z / 3); const W0 = G.W; let fine = true; for (let a = -1; a <= 1 && fine; a++) for (let b = -1; b <= 1 && fine; b++) { const x0 = (gi + a) * 3, z0 = (gj + b) * 3; if (W0.paved(x0 + 1.5, z0 + 1.5)) fine = false; for (const c of W0.circles) if (Math.abs(c.x - x0 - 1.5) < 3.5 && Math.abs(c.z - z0 - 1.5) < 3.5) { fine = false; break; } for (const zn of W0.zones) if (Math.hypot(x0 - zn.x, z0 - zn.z) < zn.r + 30) fine = false; for (const r of W0.roads) if (x0 > r.x0 - 8 && x0 < r.x1 + 8 && z0 > r.z0 - 8 && z0 < r.z1 + 8) fine = false; } if (fine) return [gi * 3 + 1.5, gj * 3 - 1.2]; } return null; });
  console.log('sítio:', JSON.stringify(spot));
  await ev(s => { const p = G.p; p.x = s[0]; p.z = s[1]; p.yaw = p.root = 0; for (const z of G.zs) { z.x = z.hx = 440; z.z = z.hz = 440; } const add = (k, n) => G.gain(k, n); add('madeira', 1000); add('pedraR', 1000); add('metalR', 600); add('metal', 200); add('carvao', 60); add('enxofre', 60); }, spot);
  await ev(() => { G.inv.belt[4] = { id: 5e5, k: 'planta', n: 1 }; G.inv.belt[5] = { id: 5e5 + 1, k: 'martelo', n: 1 }; });
  const selK = k => ev(k => { const i = G.inv.belt.findIndex(b => b && b.k === k); if (i < 0) { const e = G.inv.bag.list.find(e => e.it.k === k); G.inv.bag.remove(e.it); const j = G.inv.belt.indexOf(null); G.inv.belt[j] = e.it; G.select(j); return 'cinto ' + j; } G.select(i); return 'cinto ' + i; }, k);
  console.log('planta:', await selK('planta')); await W(400);
  const tryPlace = (m, yaw, dx, dz) => ev(([m, yaw, dx, dz]) => { const p = G.p; if (dx !== undefined) { p.x += dx; p.z += dz; } p.yaw = p.root = yaw; G.base.setMode(m); G.base.frame(); const tg = G.base.B.tgt; const ok = G.base.place(); return m + ' ' + (ok ? 'ok' : 'falhou: ' + (tg && tg.bad)); }, [m, yaw, dx, dz]);
  console.log(await tryPlace('fund', 0));
  // segunda fundação ao lado (+x)
  console.log(await tryPlace('fund', Math.PI / 2, 0, 2.6));
  // entrar na primeira fundação e pôr paredes à volta
  await ev(() => { const P = [...G.base.pieces.values()][0]; G.p.x = P.i * 3 + 1.5; G.p.z = P.j * 3 + 1.5; });
  for (const [m, yaw] of [['parede', Math.PI], ['porta', -Math.PI / 2], ['janela', 0]]) console.log(await tryPlace(m, yaw));
  console.log(await tryPlace('parede', Math.PI / 2));
  console.log(await tryPlace('teto', 0));
  console.log('peças:', await ev(() => [...G.base.pieces.values()].map(P => P.t + '@' + P.k).join(' ')));
  // martelo: melhorar a parede
  console.log('martelo:', await selK('martelo')); await W(300);
  console.log('melhorar:', await ev(() => { G.p.yaw = G.p.root = Math.PI; G.base.frame(); const a = G.base.upgradeInfo(); G.base.upgrade(); const b = G.base.upgradeInfo(); G.base.upgrade(); const c = G.base.upgradeInfo(); return JSON.stringify([a, b, c].map(x => x && x.n + ':' + x.tier)); }));
  // colocar baú, fornalha e bancada
  for (const k of ['bau', 'fornalha', 'bancada1', 'saco']) { console.log('colocar', k, await ev(k => { const it0 = { id: 1e6 + Math.random(), k, n: 1 }; const e = { it: it0 }; const p = G.p; const tries = [0, Math.PI / 2, Math.PI, -Math.PI / 2]; for (const y of tries) { p.yaw = p.root = y; if (G.base.deploy(e.it)) { return 'ok a ' + y.toFixed(2); } } return 'falhou'; }, k)); }
  console.log('bancada perto:', await ev(() => G.base.benchNear()));
  // fornalha: pôr madeira e minério e acender
  console.log('fornalha:', await ev(() => { const d = G.base.deps.find(d => d.k === 'fornalha'); G.inv.take('madeira', 10); d.c.grid.insert(G.mkItem ? G.mkItem('madeira', 10) : { id: 99999, k: 'madeira', n: 10 }); d.c.grid.insert({ id: 99998, k: 'metal', n: 6 }); G.base.toggleFurnace(d.c); G.base.tick(12.6); return d.c.grid.list.map(e => e.it.k + 'x' + e.it.n).join(' ') + ' acesa=' + d.on; }));
  await shot('base-1');
  // gravar e repor
  console.log('gravar/repor:', await ev(() => { G.save(); const n0 = G.base.pieces.size, d0 = G.base.deps.length; const w = JSON.parse(JSON.stringify(G.base.save(x => x.list.map(e => ({ k: e.it.k, n: e.it.n, x: e.x, y: e.y }))))); G.base.clear(); const n1 = G.base.pieces.size; G.base.load(w, (L, g) => { for (const o of L) g.insert({ id: Math.random(), k: o.k, n: o.n }); return g; }); return [n0, d0, n1, G.base.pieces.size, G.base.deps.length, !!G.base.spawn].join(' '); }));
  // a parede trava e tapa a vista
  console.log('colisão e vista:', await ev(() => { const P = [...G.base.pieces.values()].find(P => P.t === 'parede'); const r = P.rects[0]; const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2; const a = { x: mx, z: mz - 2, lv: 0 }, b = { x: mx, z: mz + 2, lv: 0 }; return 'vê através: ' + G.dbg.canSee(a, b); }));
  await ev(() => { G.select(0); G.p.yaw = G.p.root = Math.PI * 0.8; }); await W(600); await shot('base-2');
};
