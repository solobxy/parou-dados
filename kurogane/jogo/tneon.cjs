// à noite, pela mira 8x, janelas acesas e placas ao longe não tremem (duas capturas paradas seguidas)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2000);
  const g = await ev(() => { for (let i = 0; i < 6; i++) { const it = G.inv.belt[i]; if (it && it.k === 'caca') { it.att = it.att || {}; it.att.scope = 'mira8'; G.sel = i; return it.k; } } for (let i = 0; i < 6; i++) { const it = G.inv.belt[i]; if (it && it.att && it.att.scope) { G.sel = i; return it.k + ' ' + it.att.scope; } } return null; });
  console.log('arma:', g);
  await ev(P => { for (const z of G.zs) z.x += 5000; G.cyc = 1700; Object.assign(G.p, { x: P[0], z: P[1] }); }, [+(process.env.NX||0), +(process.env.NZ||-60)]); await W(2500);
  await ev(a => { G.cyc = 1700; G.dbgSway = 0; G.aimStart(true); G.aimS.fy = a; }, +(process.env.NA||0)); await W(3000);
  const s = await ev(() => [G.fp, +G.tod.toFixed(2), +G.day.toFixed(2)]); console.log('fp/tod/day', JSON.stringify(s));
  await ev(() => { G.cyc = 1700; }); await shot('neon-a'); await W(700); await ev(() => { G.cyc = 1700; }); await shot('neon-b'); await W(700); await shot('neon-c');
};
