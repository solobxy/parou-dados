// grades: veem-se através delas (sem sombra de vista) e a luz passa
const fs = require('fs');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1000);
  await ev(() => { for (const z of G.zs) z.x += 3000; G.p.x = 2700; G.p.z = -2522; G.cyc = 600; }); await W(6000); await shot('grade-aeroporto');
  await ev(() => { G.p.x = 2240; G.p.z = -2552; }); await W(5000); await shot('grade-militar');
};
