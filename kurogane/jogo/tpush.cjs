// imagens das notificações: personagem a dormir atacada (lua grande por trás) e raide (porta a arder, atacantes à frente)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  const clean = () => ev(() => { const cv = G.dbgCanvas; for (const e of document.querySelectorAll('body *')) if (e !== cv && !e.contains(cv)) e.style.visibility = 'hidden'; });
  await ev(() => G.dbgKit()); await W(1200);
  const K = process.env.KG_PUSH || 'sono';
  const tidy = () => ev(() => { G.cfg.outline = false; for (const b of G.bags || []) if (b.mesh) b.mesh.visible = false; const p = G.p; p.x += 45; });
  if (K === 'sono') {
    await ev(() => { const p = G.p; p.x = Number(window.__px || 128); p.z = Number(window.__pz || 52); p.god = true; G.cyc = Number(window.__cy || 1545); for (const z of G.zs) { z.x += 300; z.hx = z.x; } }); await W(6000);
    await ev(() => { const S = G.dbgSky; S.U.uMoon.value = 0.9955; const md = S.U.uSunDir.value.clone().negate(); const mh = Math.hypot(md.x, md.z), mx = md.x / mh, mz = md.z / mh;
      const p = G.p, sx = p.x, sz = p.z, pin = [], fl = [];
      const sl = G.dbgNewBody({}); sl.forceNear = true; sl.setGear({ head: { k: 'capacete' } }); sl.pose(0, 0, 'none'); pin.push({ b: sl, x: sx, z: sz, y: 0.16, rx: -Math.PI / 2, yaw: Math.atan2(mz, -mx) });
      const ax = sx - mz * 0.55 + mx * 0.15, az = sz + mx * 0.55 + mz * 0.15, a = G.dbgNewBody({}); a.forceNear = true; a.setGear({ head: { k: 'capacete' }, vest: { k: 'colete' } }); a.setWeapon('machado', {});
      for (let i = 0; i < 4; i++) a.pose(0.016, 0, 'melee', Number(window.__sw || 0.12), 0, 0, -1, 0, 1); pin.push({ b: a, x: ax, z: az, yaw: Math.atan2(sx - ax, sz - az) });
      const fx = sx + mx * 1.3 + mz * 1.1, fz = sz + mz * 1.3 - mx * 1.1; G.dbgFlame(fx, 0.04, fz, 0.9); fl.push([fx, 0.4, fz]);
      G.dbgScene.traverse(o => { if (o.isInstancedMesh && o.material && o.material.alphaTest === 0.4) o.visible = false; }); // sem tufos de erva à frente da câmara
      const cx = ax - mx * 3.4 + mz * 0.6, cz = az - mz * 3.4 - mx * 0.6, el = Math.atan2(md.y, mh);
      G.camOv = { p: [cx, 0.42, cz], t: [cx + mx * 10, 0.42 + Math.tan(Math.min(el, 0.5) * 0.8) * 10, cz + mz * 10], fov: 50, noMe: true, pin, fl }; }); await tidy(); await W(2000);
    await clean(); await shot('push-sono');
  } else {
    // base de madeira e pedra num campo, porta rebentada a arder, dois atacantes à frente; fim da tarde
    await ev(() => { const p = G.p; p.x = 128; p.z = 52; p.god = true; G.cyc = Number(window.__cy || 1492); for (const z of G.zs) { z.x += 300; z.hx = z.x; } }); await W(5000);
    await ev(() => { const i0 = Math.floor(Number(window.__bx || 139) / 3), j0 = Math.floor(58 / 3), P = [], T = Number(window.__tier || 0);
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { P.push(['fund', 'f:' + (i0 + a) + ':' + (j0 + b), i0 + a, j0 + b, T, 999, 0, 0]); P.push(['teto', 't:' + (i0 + a) + ':' + (j0 + b), i0 + a, j0 + b, T, 999, 0, 0]); }
      const E = [['porta', 'h:' + i0 + ':' + j0], ['janela', 'h:' + (i0 + 1) + ':' + j0], ['parede', 'h:' + i0 + ':' + (j0 + 2)], ['parede', 'h:' + (i0 + 1) + ':' + (j0 + 2)], ['parede', 'v:' + i0 + ':' + j0], ['parede', 'v:' + i0 + ':' + (j0 + 1)], ['parede', 'v:' + (i0 + 2) + ':' + j0], ['janela', 'v:' + (i0 + 2) + ':' + (j0 + 1)]];
      for (const [t, k] of E) P.push([t, k, null, null, T, 999, t === 'porta' ? 1 : 0, 0]);
      G.base.load({ p: P, d: [] }, () => null); window.__B = [i0 * 3, j0 * 3]; });
    await W(800);
    await ev(() => { const [bx, bz] = window.__B, pin = [], fl = [], dx = bx + 1.5, dz = bz; // porta no lado de baixo (z = bz), a meio da 1.ª célula
      G.dbgScene.traverse(o => { if (o.isInstancedMesh && o.material && o.material.alphaTest === 0.4) o.visible = false; });
      G.dbgFlame(dx - 0.5, 0.3, dz - 0.25, 2.2); G.dbgFlame(dx + 0.6, 0.35, dz - 0.2, 1.7); G.dbgFlame(dx, 1.5, dz - 0.15, 1.3); G.dbgFlame(dx + 1.6, 0.25, dz - 0.3, 1.1); fl.push([dx, 1.2, dz - 1.2]);
      const mk = (x, z, gun, fire) => { const b = G.dbgNewBody({}); b.forceNear = true; b.setGear({ head: { k: 'capacete' }, vest: { k: 'colete' }, back: { k: 'mochila' } }); b.setWeapon(gun, {}); for (let i = 0; i < 4; i++) b.pose(0.016, 0, 'rifle', -1, 0, 0, -1, 0, 1); const yaw = Math.atan2(dx - x, dz - z); pin.push({ b, x, z, yaw }); if (fire) { b.root.position.set(x, 0.03, z); b.root.rotation.y = yaw; b.root.updateMatrixWorld(true); const w = b.weps[gun], bx3 = new G.Box3().setFromObject(w), c = bx3.getCenter(new (bx3.min.constructor)()), sz = bx3.getSize(new (bx3.min.constructor)()), hl = Math.max(sz.x, sz.z) / 2, fx = Math.sin(yaw), fz = Math.cos(yaw); const F = G.dbgMuz([c.x + fx * hl, c.y, c.z + fz * hl], [fx, 0, fz]); F.s.scale.setScalar(0.9); } };
      mk(dx - 1.4, dz - 6.2, 'ak', false); mk(dx + 2.1, dz - 7.6, 'm4', true);
      G.camOv = { p: [dx + 0.6, 1.25, dz - 11.5], t: [dx + 0.2, 1.7, dz], fov: 46, noMe: true, pin, fl }; }); await tidy(); await W(2500);
    await clean(); await shot('push-raid');
  }
};
