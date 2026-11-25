// retratos (inventário e editor de aparência) com o corpo novo
const fs = require('fs');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2500);
  const save = (n, u) => fs.writeFileSync(`shots/pt-${n}.png`, Buffer.from(u.split(',')[1], 'base64'));
  save('inv', await ev(() => G.portrait(G.inv.eq)));
  save('look', await ev(() => G.portraitLook({ hairS: 2, beardS: 0, top: 0x7a2a3a, skin: 0x8d5a3b })));
  save('look2', await ev(() => G.portraitLook({ hairS: 4, beardS: 2, top: 0xc4b9a4, hair: 0xb8342a })));
  // em 1.ª pessoa: sem contornos de portas/janelas
  await ev(() => { G.p.x = -6; G.p.z = 3; }); await W(800);
  await shot('tp'); await ev(() => G.viewToggle()); await W(1500);
  console.log('fp', await ev(() => G.fpv.on));
  await shot('fp');
};
