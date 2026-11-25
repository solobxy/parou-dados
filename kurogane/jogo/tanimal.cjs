// animais: espécies espalhadas, veado foge, javali ataca de perto, lobos caçam, cão adotado segue e ataca zombies, carne e couro ao morrer
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await ev(() => G.dbgKit()); await W(1500);
  console.log('animais:', JSON.stringify(await ev(() => { const c = {}; for (const z of G.zs) if (z.an) c[z.an] = (c[z.an] || 0) + 1; return c; })));
  // veado: chega-te a 15 m e vê se foge
  const fl = await ev(() => { const d = G.zs.find(z => z.an === 'veado'); const p = G.p; p.x = d.x + 15; p.z = d.z; for (const z of G.zs) if (!z.an && Math.hypot(z.x - p.x, z.z - p.z) < 60) z.x += 500; window._d = d; return Math.hypot(d.x - p.x, d.z - p.z); });
  await WG(4); const fl2 = await ev(() => ({ d: Math.hypot(_d.x - G.p.x, _d.z - G.p.z), st: _d.state }));
  console.log('veado: de', fl.toFixed(1), 'para', fl2.d.toFixed(1), fl2.st, fl2.d > fl + 5 ? 'OK fugiu' : 'FALHA');
  { const u = await ev(() => G.dbgCam([_d.x + 4, 2.2, _d.z + 4], [_d.x, 0.9, _d.z], 45, 700, 450)); require('fs').writeFileSync(__dirname + '/shots/an-veado.jpg', Buffer.from(u.split(',')[1], 'base64')); }
  // lobo: põe-te a 12 m de uma alcateia
  await ev(() => { const w = G.zs.find(z => z.an === 'lobo'); G.p.x = w.x + 12; G.p.z = w.z; G.p.hp = 100; window._w = w; for (const z of G.zs) if (!z.an && Math.hypot(z.x - G.p.x, z.z - G.p.z) < 60) z.x += 500; });
  await WG(5); const lw = await ev(() => ({ hp: G.p.hp, st: _w.state, d: Math.hypot(_w.x - G.p.x, _w.z - G.p.z), pack: G.zs.filter(z => z.an === 'lobo' && z.pack === _w.pack && z.state === 'chase').length }));
  console.log('lobos:', JSON.stringify(lw), lw.st === 'chase' && lw.hp < 100 ? 'OK atacam' : 'FALHA');
  { const u = await ev(() => G.dbgCam([_w.x + 5, 3, _w.z + 3], [_w.x, 0.6, _w.z], 45, 700, 450)); require('fs').writeFileSync(__dirname + '/shots/an-lobo.jpg', Buffer.from(u.split(',')[1], 'base64')); }
  // matar um lobo: deixa carne e couro
  const bags0 = await ev(() => G.bags.length); await ev(() => { G.dbgHurtZ(_w, 999); }); await WG(0.5);
  console.log('lobo morto:', await ev(() => _w.state), 'sacos novos:', (await ev(() => G.bags.length)) - bags0, JSON.stringify(await ev(() => { const b = G.bags[G.bags.length - 1]; return b.grid ? b.grid.list.map(e => e.it.k + ':' + (e.it.n || 1)) : null; })));
  // javali: perto demais ataca
  await ev(() => { G.p.hp = 100; G.p.alive = true; for (const z of G.zs) if (z.an === 'lobo' && Math.hypot(z.x - G.p.x, z.z - G.p.z) < 80) z.x += 900; const b = G.zs.find(z => z.an === 'javali'); G.p.x = b.x + 4; G.p.z = b.z; window._b = b; });
  await WG(4); const jb = await ev(() => ({ hp: Math.round(G.p.hp), st: _b.state })); console.log('javali:', JSON.stringify(jb), jb.hp < 100 ? 'OK atacou' : 'FALHA');
  { const u = await ev(() => G.dbgCam([_b.x + 4, 2, _b.z + 3], [_b.x, 0.5, _b.z], 45, 700, 450)); require('fs').writeFileSync(__dirname + '/shots/an-javali.jpg', Buffer.from(u.split(',')[1], 'base64')); }
  // cão: dá-lhe carne, segue-te e ataca um zombie
  await ev(() => { G.p.hp = 100; G.p.alive = true; for (const z of G.zs) if (z.an && z.an !== 'cao' && Math.hypot(z.x - G.p.x, z.z - G.p.z) < 100) z.x += 900; const c = G.zs.find(z => z.an === 'cao'); window._c = c; G.p.x = c.x + 1.1; G.p.z = c.z; c.frz = 0; G.inv.bag.insert(G.mkItem('carneC', 3)); G.ui.refresh(true); });
  await WG(0.6); console.log('prompt:', await ev(() => G.prompt && G.prompt.label)); await ev(() => { G.interact(); delete _c.frz; }); await WG(0.3);
  console.log('cão adotado:', await ev(() => _c.pet));
  await ev(() => { for (const z of G.zs) if (!z.an && Math.hypot(z.x - G.p.x, z.z - G.p.z) < 150) z.x += 900; G.p.x += 15; }); await WG(4); const df = await ev(() => Math.hypot(_c.x - G.p.x, _c.z - G.p.z)); console.log('cão segue: a', df.toFixed(1), 'm', df < 5 ? 'OK' : 'FALHA');
  { const u = await ev(() => G.dbgCam([_c.x + 3, 1.8, _c.z + 3], [_c.x, 0.4, _c.z], 45, 700, 450)); require('fs').writeFileSync(__dirname + '/shots/an-cao.jpg', Buffer.from(u.split(',')[1], 'base64')); }
  const zz = await ev(() => { const z = G.zs.find(q => !q.an && q.state !== 'dead'); z.x = G.p.x + 6; z.z = G.p.z + 2; z.state = 'wander'; window._z = z; return z.hp; });
  await WG(6); const zr = await ev(() => ({ hp: Math.round(_z.hp), st: _z.state, dog: Math.round(_c.hp) })); console.log('cão contra zombie:', JSON.stringify(zr), zr.hp < zz ? 'OK mordeu' : 'FALHA');
  await shot('an-jogo');
  console.log('erros:', errs.length ? errs : 'nenhum');
};
