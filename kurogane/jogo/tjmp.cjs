module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { window.__L = []; const t0 = performance.now(); G.jump(); const iv = setInterval(() => { __L.push([Math.round(performance.now() - t0), +G.p.h.toFixed(2), +G.p.vy.toFixed(2), G.p.onGround]); if (__L.length > 400) clearInterval(iv); }, 30); });
  await W(14000); console.log('JMP', JSON.stringify(await ev(() => __L.filter((q, i, a) => i === 0 || q[1] !== a[i - 1][1]))));
};
