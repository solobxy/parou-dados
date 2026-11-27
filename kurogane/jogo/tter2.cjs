module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(800);
  await ev(() => { const p = G.p; p.x = 60; p.z = 1.5; p.yaw = p.root = 2.2; G.aimS.fy = 2.2; G.aimS.fpit = 0.05; }); await W(2500); await shot('ter2-a');
  const s = [700, 25];
  await ev(s => { const p = G.p; p.x = s[0]; p.z = s[1]; }, s); await W(2500); await shot('ter2-b');
  console.log(await ev(() => { const r = G.dbgRenderer || null; return JSON.stringify({ fp: G.fp, fpFree: G.fpFree }); }));
};
