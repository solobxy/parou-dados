// loja de Kitamura: grinalda de lâmpadas e letreiro aceso, de dia e de noite
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await ev(() => G.dbgKit()); await W(1200);
  for (const [cyc, n] of [[760, 'dia'], [1480, 'tarde'], [1700, 'noite']]) { await ev(cyc => { const p = G.p; p.x = -165; p.z = -4.5; p.lv = 0; p.yaw = p.root = Math.PI + 0.12; G.aimS.fy = p.yaw; G.aimS.fpit = 0.08; G.cyc = cyc; }, cyc); await W(4500); await shot('loja-' + n); }
  console.log('festoon', await ev(() => (G.dbgW.festoon || []).length));
};
