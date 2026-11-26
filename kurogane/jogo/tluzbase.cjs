// dentro de uma base de madeira, de noite, com a lanterna e a fornalha acesas: a luz não pode sair pelas paredes
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await ev(() => G.dbgKit()); await W(1500);
  const spot = await ev(() => { for (let k = 0; k < 4000; k++) { const x = -420 + Math.random() * 840, z = -420 + Math.random() * 840; const gi = Math.floor(x / 3), gj = Math.floor(z / 3); const W0 = G.W; let fine = true; for (let a = -2; a <= 2 && fine; a++) for (let b = -2; b <= 2 && fine; b++) { const x0 = (gi + a) * 3, z0 = (gj + b) * 3; if (W0.paved(x0 + 1.5, z0 + 1.5)) fine = false; for (const c of W0.circles) if (Math.abs(c.x - x0 - 1.5) < 3.5 && Math.abs(c.z - z0 - 1.5) < 3.5) { fine = false; break; } for (const zn of W0.zones) if (Math.hypot(x0 - zn.x, z0 - zn.z) < zn.r + 30) fine = false; for (const r of W0.roads) if (x0 > r.x0 - 8 && x0 < r.x1 + 8 && z0 > r.z0 - 8 && z0 < r.z1 + 8) fine = false; } if (fine && W0.trees.some(t => Math.hypot(t.x - gi * 3 - 1.5, t.z - gj * 3 - 1.5) < 9)) fine = false; if (fine) return [gi * 3 + 1.5, gj * 3 - 1.2]; } return null; });
  await ev(s => { const p = G.p; p.x = s[0]; p.z = s[1]; p.yaw = p.root = 0; for (const z of G.zs) { z.x = z.hx = z.x + 900; z.z = z.hz = z.z + 900; } G.spawnT = 1e9; for (const [k, n] of [['madeira', 1000], ['pedraR', 1000], ['metalR', 300]]) G.gain(k, n); G.inv.belt[4] = { id: 5e5, k: 'planta', n: 1 }; G.select(4); }, spot);
  await W(300);
  const place = (m, yaw) => ev(([m, yaw]) => { const p = G.p; p.yaw = p.root = yaw; G.base.setMode(m); G.base.frame(); const tg = G.base.B.tgt; const ok = G.base.place(); return m + ' ' + (ok ? 'ok' : 'falhou: ' + (tg && tg.bad)); }, [m, yaw]);
  console.log(await place('fund', 0));
  await ev(() => { const P = [...G.base.pieces.values()][0]; G.p.x = P.i * 3 + 1.5; G.p.z = P.j * 3 + 1.5; });
  for (const y of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) console.log(await place('parede', y));
  await ev(() => { G.select(0); const it = G.mkItem('fornalha'); G.inv.bag.insert(it, G.inv.rows()); G.base.deploy(it); }); await WG(0.4);
  await ev(() => { const P = [...G.base.pieces.values()][0]; G.base.pin({ x: P.i * 3 + 0.8, z: P.j * 3 + 2.2 }); }); await WG(0.4);
  console.log('pode pôr:', JSON.stringify(await ev(() => G.base.placeOk()))); await ev(() => G.fireDown()); await WG(0.5);
  console.log('fornalha:', await ev(() => { const d = G.base.deps.find(d => d.k === 'fornalha'); if (!d) return 'falhou'; d.c.grid.insert(G.mkItem('madeira', 40)); G.base.toggleFurnace(d.c); return 'acesa=' + d.on; }));
  await ev(() => { G.base.setMode && G.base.setMode(null); G.select(0); const P = [...G.base.pieces.values()][0]; G.p.x = P.i * 3 + 1.5; G.p.z = P.j * 3 + 1.5; G.p.yaw = G.p.root = 0; G.cyc = 1710; document.getElementById('toast').hidden = true; if (!G.lightOn) G.toggleLight(); });
  await WG(2.5);
  console.log('estado:', JSON.stringify(await ev(() => ({ luz: G.lightOn, tod: +G.tod.toFixed(2), fp: G.fp, deps: G.base.deps.map(d => d.k + ':' + !!d.on), luzes: G.base.lights().length }))));
  await shot('luzbase-dentro');
  // vista de fora, por cima, para ver se a luz passa as paredes
  const u = await ev(() => { const P = [...G.base.pieces.values()][0], cx = P.i * 3 + 1.5, cz = P.j * 3 + 1.5; return G.dbgCam([cx - 9, 14, cz - 9], [cx, 0, cz + 2], 50, 700, 500); });
  require('fs').writeFileSync(__dirname + '/shots/luzbase-fora.jpg', Buffer.from(u.split(',')[1], 'base64'));
  // virar para a parede de trás e de lado
  for (const y of [Math.PI / 2, Math.PI]) { await ev(y => { G.p.yaw = G.p.root = y; }, y); await WG(0.8); await shot('luzbase-yaw' + y.toFixed(1)); }
  // encostado à parede, a olhar para ela (o caso da captura do Dinis)
  const enc = async (nm) => { await ev(() => { const P = [...G.base.pieces.values()][0]; G.p.x = P.i * 3 + 2.2; G.p.z = P.j * 3 + 3 - 0.42; G.p.yaw = G.p.root = 0; }); await WG(0.8); await shot(nm); };
  await enc('luzbase-encostado');
  await ev(() => { G.p.yaw = G.p.root = 0; G.toggleLight(); }); await WG(0.8); await shot('luzbase-encostado-semluz');
  await ev(() => { G.toggleLight(); G.applyGfx(Object.assign({}, G.cfg, { shadows: false })); }); await enc('luzbase-semsombras');
  await ev(() => { G.applyGfx(Object.assign({}, G.cfg, { shadows: true })); });
  console.log('erros:', errs.length ? errs : 'nenhum');
};
