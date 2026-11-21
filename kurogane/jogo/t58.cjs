module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.click('#sPlay').catch(() => page.click('#sCont')); await W(2000);
  console.log(await ev(() => { const p = G.p; p.x = 2600; p.z = 1500; G.sectors.clear(); const t = performance.now(); G.sectors.fill(p.x, p.z); const ms = performance.now() - t; let tr = 0, ro = 0; for (const S of G.sectors.loaded.values()) { tr += (S.trees || []).length; ro += (S.rocks || []).length; } return 'setores ' + G.sectors.loaded.size + ' em ' + ms.toFixed(0) + ' ms (' + (ms / G.sectors.loaded.size).toFixed(1) + ' ms cada); árvores ' + tr + ' rochas ' + ro; }));
  await W(1500);
  console.log(await ev(() => { let n = 0; G.renderer.info.reset(); return 'chamadas de desenho: ' + G.renderer.info.render.calls; }));
};
