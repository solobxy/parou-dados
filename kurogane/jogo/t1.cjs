module.exports = async (page, shot, mode) => {
  await page.waitForTimeout(1500);
  await shot('01-inicio');
  await page.click('#sPlay');
  await page.waitForTimeout(1500);
  await shot('02-spawn');
  // levar o jogador para o cruzamento (helicóptero)
  await page.evaluate(() => { const p = G.p; p.x = -6; p.z = 3; G.camT.set(p.x, 0, p.z); });
  await page.waitForTimeout(1200);
  await shot('03-cruzamento');
  await page.evaluate(() => { const p = G.p; p.x = 13.8; p.z = -10; G.camT.set(p.x, 0, p.z); });
  await page.waitForTimeout(900);
  await shot('04-konbini');
  const info = await page.evaluate(() => ({ fps: G.fps, calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles, zs: G.zs.length, prompt: G.prompt && G.prompt.label, inside: G.inside && G.inside.name }));
  console.log(JSON.stringify(info));
};
