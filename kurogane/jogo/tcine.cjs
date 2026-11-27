// cartões do menu, em cinema: arena (vermelho contra azul a trocar tiros em Tóquio) e survival (sobrevivente contra uma horda ao fim da tarde)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  const clean = () => ev(() => { const cv = G.dbgCanvas; for (const e of document.querySelectorAll('body *')) if (e !== cv && !e.contains(cv)) e.style.visibility = 'hidden'; });
  // soldado: cria, veste, aponta para (tx,tz) e dispara (clarão na ponta da arma)
  const SOLDIER = `(L, eq, team, x, z, tx, tz, gun, fire) => { const b = G.dbgNewBody(L); b.forceNear = true; if (team != null) b.setTeam(team); b.setGear(eq); b.setWeapon(gun, {}); const yaw = Math.atan2(tx - x, tz - z); b.root.position.set(x, 0.03, z); b.root.rotation.y = yaw;
    for (let i = 0; i < 4; i++) b.pose(0.016, 0, 'rifle', -1, 0, 0, -1, 0, 1); b.root.updateMatrixWorld(true);
    if (fire) { const w = b.weps[gun]; const bx = new G.Box3().setFromObject(w), c = bx.getCenter(new (bx.min.constructor)()), s = bx.getSize(new (bx.min.constructor)()), hl = Math.max(s.x, s.z) / 2, fx = Math.sin(yaw), fz = Math.cos(yaw); const mz = [c.x + fx * hl, c.y + 0.01, c.z + fz * hl]; const F = G.dbgMuz(mz, [fx, 0, fz]); F.s.scale.setScalar(window.__mzs || 1.15); (window.__fl = window.__fl || []).push(mz); }
    (window.__pin = window.__pin || []).push({ b, x, z, yaw }); return b; }`;
  const K = process.env.KG_CINE || 'ambos';
  if (K !== 'arena') {
    await ev(() => G.dbgKit()); await W(1500);
    // rua com máquinas de bebidas ao fim da tarde
    await ev(() => { const s = G.propStat.vend; const [x, z, ry] = s.at[1] || s.at[0]; const p = G.p, a = ry + 0.7; p.x = x + Math.sin(a) * 6.5; p.z = z + Math.cos(a) * 6.5; p.yaw = p.root = Math.atan2(x - p.x, z - p.z) + 0.25; G.aimS.fy = p.yaw; G.cyc = 1500; p.god = true; window.__ph = [p.x, p.z, p.yaw]; }); await W(8000);
    await ev(`(() => { const S = ${SOLDIER}; const [px, pz, yw] = window.__ph; const fx = Math.sin(yw), fz = Math.cos(yw);
      const me = S({}, { head: { k: 'capacete' }, vest: { k: 'colete' } }, null, px, pz, px + fx * 8, pz + fz * 8, 'ak', true);
      const zs = G.zs.filter(z => z.state !== 'dead' && !z.an).sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz)).slice(0, 9); console.log('zs', zs.length); zs.forEach((z, i) => { const d = 4.2 + i * 0.9, s = (i % 2 ? 1 : -1) * (0.3 + i * 0.3); const x = px + fx * d + Math.cos(yw) * s, zz = pz + fz * d - Math.sin(yw) * s; Object.assign(z, { x, z: zz, hx: x, hz: zz, lv: 0, state: 'wander', wT: 99, think: 99, yaw: Math.atan2(px - x, pz - zz) + (Math.random() - 0.5) * 0.3, vx: 0, vz: 0, spd: 0 }); });
      const rx = Math.cos(yw), rz = -Math.sin(yw); G.camOv = { p: [px - fx * 1.5 + rx * 2.3, 1.1, pz - fz * 1.5 + rz * 2.3], t: [px + fx * 3.2 - rx * 1.4, 1.3, pz + fz * 3.2 - rz * 1.4], fov: 52, noMe: true, pin: window.__pin, fl: window.__fl }; })()`);
    await W(1200); await clean(); await W(300); await shot('cine-survival');
  }
  if (K !== 'survival') {
    // arena: a mesma Tóquio, numa rua comprida; vermelho à esquerda, azul à direita, os dois a disparar
    if (K === 'ambos') await page.reload(); await page.waitForFunction('window.__ready === true', null, { timeout: 240000 });
    await ev(() => G.dbgKit()); await W(1200);
    await ev(() => { window.__mzs = 0.7; const s = G.propStat.vend; const [x, z, ry] = s.at[1] || s.at[0]; const p = G.p, a = ry + 0.7; p.x = x + Math.sin(a) * 6.5; p.z = z + Math.cos(a) * 6.5; p.yaw = Math.atan2(x - p.x, z - p.z) + 0.25; p.god = true; G.cyc = Number(window.__cyc || 1200); window.__ph = [p.x, p.z, p.yaw]; }); await W(7000);
    await ev(`(() => { window.__pin = []; window.__fl = []; const S = ${SOLDIER}; const [px, pz, yw] = window.__ph; const fx = Math.sin(yw), fz = Math.cos(yw), rx = Math.cos(yw), rz = -Math.sin(yw);
      for (const z of G.zs) { z.x += 300; z.hx = z.x; }
      const ax = px + rx * 0.6, az = pz + rz * 0.6, bx = px + fx * 5.2 + rx * 1.3, bz = pz + fz * 5.2 + rz * 1.3;
      S({}, { head: { k: 'capacete' } }, 1, ax, az, bx, bz, 'ak', true);
      S({}, { head: { k: 'capacete' } }, 0, bx, bz, ax, az, 'ak', true);
      const dx = bx - ax, dz = bz - az, dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl, vx = uz, vz = -ux; const sd = Number(window.__sd || 1); G.camOv = { p: [ax - ux * 1.9 + vx * 0.85 * sd, 1.55, az - uz * 1.9 + vz * 0.85 * sd], t: [bx - vx * 0.5 * sd, 1.25, bz - vz * 0.5 * sd], fov: 46, noMe: true, pin: window.__pin, fl: window.__fl }; })()`);
    await W(1500); console.log('same', await ev(() => [window.__pin[0].b === window.__pin[1].b, window.__pin[0].b.root === window.__pin[1].b.root, window.__pin[0].b.skin[0] === window.__pin[1].b.skin[0], window.__pin[1].b.skin.map(s => s.visible + ':' + s.parent.uuid.slice(0, 4) + ':' + s.frustumCulled).join(','), window.__pin[0].b.root.uuid.slice(0, 4), window.__pin[1].b.root.uuid.slice(0, 4)].join(' '))); console.log('pins', await ev(() => JSON.stringify(window.__pin.map(q => { let v = 0, n = 0; q.b.root.traverse(o => { if (o.isMesh) { n++; if (o.visible) v++; } }); const bb = new G.Box3().setFromObject(q.b.root); return [q.x.toFixed(1), q.z.toFixed(1), q.b.root.visible, !!q.b.root.parent, n, v, bb.min.y.toFixed(2), bb.max.y.toFixed(2), bb.min.x.toFixed(1)]; })))); await clean(); await W(300); await shot('cine-arena');
  }
};
