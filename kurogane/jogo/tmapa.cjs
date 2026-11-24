// exporta o que o servidor precisa do mapa para confirmar onde se pode construir (cidade, zonas, estradas, chão duro, edifícios)
// correr sempre que o mapa mudar: node test.cjs tmapa.cjs desktop
const fs = require('fs'), path = require('path');
module.exports = async (page) => {
  const M = await page.evaluate(() => { const W = G.W, r1 = v => Math.round(v * 10) / 10, R4 = r => [r1(r.x0), r1(r.z0), r1(r.x1), r1(r.z1)];
    return { wv: G.WV, city: [-48, -46, 48, 46], zones: W.zones.map(z => [r1(z.x), r1(z.z), z.r, z.kind, z.name]), roads: W.roads.map(R4), pads: W.pads.map(R4), rects: W.rects.filter(r => !r.lv && !r.base).map(R4) }; });
  const out = JSON.stringify(M);
  for (const f of [path.join(__dirname, 'mapa.json'), '/home/claude/parou-dados/kurogane/mapa.json']) { try { fs.writeFileSync(f, out); console.log('gravado', f, (out.length / 1024).toFixed(0) + ' KB', 'wv', M.wv, 'zonas', M.zones.length, 'retângulos', M.rects.length); } catch (e) { console.log('falhou', f, e.message); } }
};
