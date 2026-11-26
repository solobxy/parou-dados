// peso do desenho (chamadas, triângulos) em vários sítios, na 1.ª pessoa, e o tempo de cada imagem
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => { G.dbgKit(); window.__rinfoOn = true; }); await W(2500); await ev(() => { for (const z of G.zs) if (Math.hypot(z.x - G.p.x, z.z - G.p.z) > 60) z.hide = true; });
  for (const [nm, x, z, a] of [['borda', null, null, 0], ['cidade', 4, 30, Math.PI], ['cruzamento', 0, 0, 0.6], ['vila', 1500, 0, 1], ['floresta', -2000, 900, 2]]) {
    await ev(([x, z, a]) => { if (x != null) { G.p.x = x; G.p.z = z; } G.aimS.fy = a; G.p.yaw = G.p.root = a; }, [x, z, a]); await W(2500);
    const r = await ev(() => window.__rinfo()); const ft = await ev(() => new Promise(res => { let n = 0, t0 = performance.now(); const f = () => { if (++n >= 20) res((performance.now() - t0) / 20); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
    console.log(nm.padEnd(11), JSON.stringify(r), 'ms/imagem:', ft.toFixed(0)); await shot('perf-' + nm);
  }
};
