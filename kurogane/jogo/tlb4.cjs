// sem sombras (opção dos telemóveis fracos): a lanterna não pode passar paredes; casa do mapa e base
const base = require('./tluzbase.cjs');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await base(page, async () => {});
  await ev(() => { G.applyGfx(Object.assign({}, G.cfg, { shadows: false })); const P = [...G.base.pieces.values()][0]; G.p.x = P.i * 3 + 1.5; G.p.z = P.j * 3 + 1.5; G.p.yaw = G.p.root = Math.PI / 2; if (!G.lightOn) G.toggleLight(); });
  await W(4000); await shot('semsombras-base');
  console.log('alcance', await ev(() => G.dbgL.torch.distance.toFixed(2)));
  await ev(() => { G.applyGfx(Object.assign({}, G.cfg, { shadows: true })); }); await W(3000); await shot('comsombras-base');
};
