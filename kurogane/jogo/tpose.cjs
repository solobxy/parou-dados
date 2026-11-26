// as 5 poses das mãos, vistas de perto (o resto igual)
const fs = require('fs');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => { G.dbgKit(); }); await W(2500); await ev(() => { G.inv.belt.fill(null); G.sel = 0; G.refresh(); }); await W(1000);
  for (const nm of ['punho', 'aberta', 'larga', 'pega', 'gatilho']) {
    await ev(nm => { const d = G.vm.dbg(); const a = d.arms; const sp = a.setPose; a.setPose = () => {}; sp(0, nm); sp(1, nm); G.__sp = sp; }, nm); await W(700);
    await shot('pose-' + nm);
    await ev(() => { G.vm.dbg().arms.setPose = G.__sp; });
  }
};
