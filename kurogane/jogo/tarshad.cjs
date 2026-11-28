// arena: sem neblina e com sombras (os prédios do cenário à volta já não tapam o sol à praça)
module.exports = async (page) => { await page.waitForTimeout(2000); await page.evaluate(() => { G.dbgKit(); document.getElementById('arw').hidden = true; const p = G.p; p.x = 3640; p.z = 3650; }); await page.waitForTimeout(5000);
  const r = await page.evaluate(() => JSON.stringify({ fog: [G.dbgScene.fog.near, G.dbgScene.fog.far] })); console.log(r);
  await page.screenshot({ path: '/tmp/kg/arena7.png' }); console.log((/600/.test(r) ? 'OK   ' : 'FALHA') + ' arena sem neblina'); };
