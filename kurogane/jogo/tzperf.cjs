module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  const draw = () => ev(() => new Promise(res => { const { cam } = G.dbgL, R = G.renderer, orig = R.renderBufferDirect; let on = false, tris = 0, calls = 0, zt = 0;
    R.renderBufferDirect = function (camera, scene, geometry, material, object, group) { if (on && camera === cam) { const n = (geometry.index ? (group ? group.count : geometry.index.count) : geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1); tris += n; calls++; if (geometry.attributes.segI) zt += n; } return orig.apply(this, arguments); };
    requestAnimationFrame(() => { on = true; requestAnimationFrame(() => { on = false; R.renderBufferDirect = orig; res({ tris: Math.round(tris / 1000) + 'k', calls, zombies: Math.round(zt / 1000) + 'k' }); }); }); }));
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { const p = G.p; p.x = -6; p.z = 3; G.camT.set(p.x, 0, p.z); const Z = G.zs.filter(z => !z.an).slice(0, 40); Z.forEach((z, i) => { z.x = p.x + (i % 8 - 4) * 2.2; z.z = p.z + 3 + Math.floor(i / 8) * 2.4; z.state = 'wander'; z.hp = 999; z.hide = false; }); });
  await WG(2);
  console.log('40 zombies, vista de cima:', JSON.stringify(await draw()));
  await ev(() => G.viewToggle()); await WG(1); console.log('40 zombies, 1.ª pessoa:', JSON.stringify(await draw()));
};
