const fs = require('fs');
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => G.dbgKit()); await page.waitForTimeout(1200);
  const r = await ev(() => { const L = G.cars.spawnPoints().filter(a => a[0] > 2100 && a[0] < 3300 && a[1] > -2880 && a[1] < -2500); G.cars.goodClear(); return L.map(a => [...a, G.cars.escapes(a[0], a[1], 700)]); });
  console.log(JSON.stringify(r));
  const url = await ev(() => G.dbgTop(2260, -2640, 260, 1000)); fs.writeFileSync(__dirname + '/shots/airp-mil.jpg', Buffer.from(url.split(',')[1], 'base64'));
  const u2 = await ev(() => G.dbgTop(2700, -2650, 700, 1000)); fs.writeFileSync(__dirname + '/shots/airp-all.jpg', Buffer.from(u2.split(',')[1], 'base64'));
};
