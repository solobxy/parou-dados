// vistas de cima de sítios novos (para verificar o desenho)
const fs = require('fs');
module.exports = async (page) => {
  await page.evaluate(() => G.dbgKit()); await page.waitForTimeout(1500);
  const spots = JSON.parse(process.env.SPOTS || '[["akagawa",-2650,-2700,240],["aeroporto",2700,-2690,1200],["terminal",2600,-2620,180],["militar",2260,-2640,230],["prisao",-1500,-3420,190],["radar",-3300,-3310,180],["fabrica",3363,900,150],["serracao",-3282,1600,110],["castelo",697,3300,110],["barragem",-1130,2120,120],["campismo",-1300,1660,120],["vila",-900,-1450,220],["posto",-884,-1100,70],["hoshimachi",2650,2400,240],["yukimura",-2300,2660,240],["lago",-1300,1900,620]]');
  for (const [n, x, z, L] of spots) { const u = await page.evaluate(([x, z, L]) => { G.p.x = x; G.p.z = z; G.sectors.fill(x, z); return G.dbgTop(x, z, L); }, [x, z, L]); fs.writeFileSync('shots/top-' + n + '.jpg', Buffer.from(u.split(',')[1], 'base64')); console.log('top', n); }
};
