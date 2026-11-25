// condução nova: botões à esquerda (acelerar/trás) e à direita (virar); medir aceleração, curva e travagem
module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1200);
  await ev(() => { for (const z of G.zs) z.x += 3000; const c = G.cars.dbgAdd('sedan', 600, 0, Math.PI / 2); c.fuel = 40; G.p.x = 600; G.p.z = 2; G.cars.enter(c); window.__c = c; });
  await W(800); await shot('drive-hud');
  const box = async id => { const b = await page.locator('#' + id).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const tap = async (id, down) => { const [x, y] = await box(id); await ev(([id, down, x, y]) => { const el = document.getElementById(id); el.dispatchEvent(new PointerEvent(down ? 'pointerdown' : 'pointerup', { bubbles: true, clientX: x, clientY: y, pointerType: 'touch', pointerId: id.length })); }, [id, down, x, y]); };
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 120000, polling: 100 }); };
  const st = () => ev(() => { const c = window.__c; return { st: +(c.st || 0).toFixed(2), dIn: JSON.stringify(G.dIn), kmh: Math.round(c.v * 3.6), x: +c.x.toFixed(1), z: +c.z.toFixed(1), yaw: +c.yaw.toFixed(2) }; });
  await tap('dUp', 1); await WG(4); console.log('acelerar 4 s:', JSON.stringify(await st()));
  await tap('dL', 1); await WG(1.5); console.log('a virar 1,5 s:', JSON.stringify(await st())); await shot('drive-curva');
  await tap('dL', 0); await tap('dUp', 0); await WG(0.5); console.log('largou:', JSON.stringify(await st())); await tap('dDn', 1); await WG(2.5); console.log('travar 2,5 s:', JSON.stringify(await st()));
  await WG(2); console.log('trás 2 s:', JSON.stringify(await st()), await ev(() => document.querySelector('#dDn em').textContent));
  await tap('dDn', 0);
};
