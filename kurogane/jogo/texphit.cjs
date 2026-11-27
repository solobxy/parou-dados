// exporta as poses das hitboxes (articulações do corpo em cada postura/arma/mira/andar) para jogo/src/hitpose.js
module.exports = async (page) => {
  await page.waitForFunction('window.__ready === true', { timeout: 120000 }).catch(() => { }); await page.waitForTimeout(1500);
  const J = await page.evaluate(() => G.dbgHitPoses());
  require('fs').writeFileSync(__dirname + '/src/hitpose.js', '// gerado por texphit.cjs a partir do esqueleto do jogo: articulações (x, y, z) com o corpo virado para +z, pés em y=0\n// chave: postura (0 de pé, 1 agachado, 2 deitado) + arma (r comprida, p pistola, n nada) + a apontar (0/1) + a andar (0/1)\nexport const HITPOSE = ' + JSON.stringify(J) + ';\n');
  const k = J['0r10'], k2 = J['2r00'], k1 = J['1r00']; console.log('de pé a apontar:', JSON.stringify({ head: k.head, top: k.top, pelvis: k.pelvis, haR: k.haR, ftL: k.ftL })); console.log('agachado:', JSON.stringify({ head: k1.head, pelvis: k1.pelvis, knL: k1.knL })); console.log('deitado:', JSON.stringify({ head: k2.head, pelvis: k2.pelvis, ftL: k2.ftL }));
};
