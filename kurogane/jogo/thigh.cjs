module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1000);
  console.log(await ev(() => { const R = G.W.rects; const hs = R.filter(r => r.k === 's').map(r => (r.h || 0) + (r.lv || 0) * 3.7).sort((a, b) => b - a); const top = R.filter(r => r.k === 's' && (r.h || 0) > 15).slice(0, 8).map(r => [Math.round(r.x0), Math.round(r.z0), r.h, r.lv]); return { n: hs.length, max: hs.slice(0, 10), top }; }));
};
