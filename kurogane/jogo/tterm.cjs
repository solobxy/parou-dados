// terminal do aeroporto de dia: as lâmpadas do teto acendem
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await ev(() => G.dbgKit()); await W(1200);
  await ev(() => { const p = G.p; p.x = 2600; p.z = -2588; p.lv = 0; }); await W(8000);
  console.log('glow', await ev(() => G.dbgInGlow())); console.log(JSON.stringify(await ev(() => { const c = G.W.cuts.find(c => c.name === 'Terminal'); return c ? [c.lamps && c.lamps.length, c.lamps && c.lamps.map(l => l.s[0] + l.k).join(''), !!G.inside, G.inside && G.inside.name] : 'sem'; })));
  await ev(() => { const p = G.p; p.yaw = p.root = Math.PI / 2; G.aimS.fy = p.yaw; G.aimS.fpit = 0.35; G.cyc = 750; }); await W(3000); await shot('term-dia');
  await ev(() => { G.cyc = 1710; }); await W(3000); await shot('term-noite'); await ev(() => { const p = G.p; p.x = 2600; p.z = -2560; p.yaw = p.root = Math.PI; G.aimS.fy = p.yaw; G.aimS.fpit = 0.05; G.cyc = 750; }); await W(3500); console.log('glow fora', await ev(() => [G.dbgInGlow(), !!G.inside])); await shot('term-fora');
};
