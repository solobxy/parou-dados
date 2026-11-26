module.exports = async (page) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  console.log(JSON.stringify(await ev(() => { const W0 = G.W, out = []; for (const L of W0.lazy.slice(0, 40)) { if (L.meshes) W0.lazyDrop(L); const t0 = performance.now(); W0.lazyBuild(L); out.push(Math.round(performance.now() - t0)); W0.lazyDrop(L); } out.sort((a, b) => a - b); return { n: W0.lazy.length, med: out[out.length >> 1], p90: out[Math.floor(out.length * 0.9)], max: out[out.length - 1] }; })));
  console.log('SETOR', JSON.stringify(await ev(() => { const T = []; const p = G.p; for (let i = 0; i < 12; i++) { const x = 900 + i * 300, z = -1200; const t0 = performance.now(); G.dbgSectorAt ? G.dbgSectorAt(x, z) : null; T.push(performance.now() - t0); } return T.map(Math.round); })));
};
