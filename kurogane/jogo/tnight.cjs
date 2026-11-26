// noite numa vila: candeeiros acesos ao longo da rua
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await WG(1);
  await ev(() => { const st = document.createElement('style'); st.textContent = 'body *:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}'; document.head.appendChild(st); });
  await ev(() => { G.p.x = 3300 - 9; G.p.z = -1300 - 30; G.cyc = 1700; G.aimS.fy = 0; G.aimS.fpit = -0.05; }); await WG(6);
  console.log(JSON.stringify(await ev(() => ({ day: +G.day.toFixed(2), lamps: G.dbgW.lamps.filter(l => Math.hypot(l[0] - G.p.x, l[2] - G.p.z) < 80).length }))));
  await shot('noite-vila');
};
