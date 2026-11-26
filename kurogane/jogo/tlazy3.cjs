module.exports = async (page, shot) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  console.log(JSON.stringify(await ev(() => { const W0 = G.W, L = W0.lazy.slice(0, 30); const r = { gen: [], step: [], meshesA: 0, meshesB: 0 };
    for (const z of L) { if (z.meshes || z.job) W0.lazyDrop(z); W0.lazyBuild(z, false); r.meshesA += z.meshes.length; W0.lazyDrop(z);
      let t0 = performance.now(); W0.lazyBuild(z, true); r.gen.push(performance.now() - t0); let k = 0; while (z.job && k++ < 500) { t0 = performance.now(); W0.lazyStep(performance.now() + 4); r.step.push(performance.now() - t0); } r.meshesB += (z.meshes || []).length; W0.lazyDrop(z); }
    const q = (A, p) => { const B = A.slice().sort((a, b) => a - b); return +B[Math.floor(B.length * p)].toFixed(1); }; return { gen50: q(r.gen, 0.5), gen90: q(r.gen, 0.9), genMax: q(r.gen, 0.999), step50: q(r.step, 0.5), step99: q(r.step, 0.99), stepMax: q(r.step, 0.999), nsteps: r.step.length, meshesA: r.meshesA, meshesB: r.meshesB }; })));
  await ev(() => { G.p.x = 2450; G.p.z = -2560; }); for (let i = 0; i < 30; i++) await W(300); await shot('vila-lazy'); };
