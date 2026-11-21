module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.evaluate(() => G.dbgKit()); await W(1200);
  await ev(() => { const D = G.W.doors.find(D => Math.abs(D.x + 250) < 0.5 && Math.abs(D.z + 106.6) < 0.5); D.t = D.target = 1; }); await W(500);
  console.log(await ev(() => { const n = G.dbgNav.nav; n.dbg = true; const t0 = performance.now(); const r = n.find(-250, -116.5, -250, -110, 0); const ms = performance.now() - t0; n.find1(-250, -116.5, -250, -110, 0, 6, 16000); return r.ok + ' ' + r.pts.length + ' cantos ' + r.exp + ' nós ' + ms.toFixed(1) + ' ms\n' + n.last.split('\n').slice(24, 50).join('\n'); }));
};
