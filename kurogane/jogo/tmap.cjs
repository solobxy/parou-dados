// mapa grande em todos os níveis, marcadores (pôr, mudar cor/símbolo, apagar), minimapa e bússola
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2500);
  await ev(() => G.ui.toggleMap(true)); await W(800); await shot('map0');
  for (let i = 1; i <= 4; i++) { await ev(() => document.getElementById('mIn').click()); await W(700); if (i === 2 || i === 3) await shot('map' + i); }
  // pôr um marcador a 60% do lado direito do mapa
  const r = await ev(() => { const b = document.getElementById('mapc').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
  await page.mouse.click(r[0] + r[2] * 0.7, r[1] + r[3] * 0.35); await W(500);
  console.log('editor aberto:', await ev(() => !document.getElementById('mEd').hidden));
  await ev(() => { document.querySelector('#mEdC [data-c="1"]').click(); document.querySelector('#mEdS [data-s="perigo"]').click(); }); await W(300); await shot('map-ed');
  await ev(() => document.getElementById('mEdOk').click());
  for (let i = 0; i < 3; i++) await ev(() => document.getElementById('mOut').click());
  await page.mouse.click(r[0] + r[2] * 0.3, r[1] + r[3] * 0.6); await W(300); await ev(() => document.getElementById('mEdOk').click()); await W(300);
  await shot('map-marks');
  console.log('marcadores:', JSON.stringify(await ev(() => JSON.parse(localStorage.getItem('kg.marks.off')))));
  await ev(() => G.ui.toggleMap(false)); await W(800); await shot('hud');
  // virar para o 1.º marcador: aparece no meio da bússola
  await ev(() => { const m = JSON.parse(localStorage.getItem('kg.marks.off'))[0]; G.aimS.fy = Math.atan2(m.x - G.p.x, m.z - G.p.z); }); await W(800); await shot('hud2');
  console.log('bússola:', await ev(() => document.getElementById('cmpt').textContent));
};
