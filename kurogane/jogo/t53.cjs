// muitos zombies a perseguir na cidade: ninguém fica preso muito tempo
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.evaluate(() => G.dbgKit()); await W(1500);
  await ev(() => { const p = G.p; p.x = 2; p.z = 30; p.lv = 0; let n = 0; for (const z of G.zs) { if (z.state === 'dead') continue; if (n < 12) { const a = n / 12 * 6.28; Object.assign(z, { x: p.x + Math.cos(a) * 22, z: p.z + Math.sin(a) * 22, lv: 0, state: 'chase', mem: 99, lost: 0, hp: 9999, hpMax: 9999 }); z.hx = z.x; z.hz = z.z; } else { z.x = z.hx = 440; z.z = z.hz = 440; } n++; } p.hp = 1e9; });
  const t0 = await ev(() => G.t);
  for (let i = 0; i < 6; i++) { await W(5000); console.log(await ev(t0 => { const p = G.p; p.hp = 1e9; const zs = G.zs.filter(z => z.state === 'chase' || z.hp > 1000); for (const z of zs) { z.state = 'chase'; z.lost = 0; z.mem = 99; } const d = zs.map(z => Math.hypot(z.x - p.x, z.z - p.z)); return 't=' + (G.t - t0).toFixed(1) + ' perto(<2.5m)=' + d.filter(x => x < 2.5).length + '/' + d.length + ' longe=' + d.filter(x => x > 8).map(x => x.toFixed(0)).join(','); }, t0)); }
};
