// nascer perto de vilas/monumentos e botão Auto (correr sempre)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  // 200 nascimentos: distância à zona mais próxima e ao centro
  console.log(await ev(() => { const out = []; let far = 0, inside = 0; for (let i = 0; i < 200; i++) { G.p = G.p || {}; const r = G.dbgSpawn(); const d = Math.min(...G.W.zones.map(z => Math.hypot(z.x - r[0], z.z - r[1]) - z.r)); if (d > 160) far++; if (d < 0) inside++; out.push(Math.round(d)); } out.sort((a, b) => a - b); return 'distância à borda da zona mais perto: min ' + out[0] + ' m, mediana ' + out[100] + ' m, máx ' + out[199] + ' m · longe (>160 m): ' + far + ' · dentro: ' + inside; }));
  await page.click('#sPlay'); await W(2500);
  console.log('mensagem:', await ev(() => document.getElementById('toast').textContent || document.querySelector('#feed') && document.querySelector('#feed').textContent));
  await shot('auto-0');
  const a = await ev(() => [G.p.x, G.p.z, getComputedStyle(document.getElementById('tSprint')).display]); console.log('botão Auto visível:', a[2] !== 'none');
  await page.click('#tSprint'); await W(3000);
  const b = await ev(() => [G.p.x, G.p.z, G.autoRun, G.p.sprint, document.getElementById('tSprint').classList.contains('on')]);
  console.log('andou', Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(1), 'm em 3 s (tempo real, headless ~0,25×) · auto', b[2], '· a correr', b[3], '· botão aceso', b[4]);
  await shot('auto-1');
  await ev(() => G.aimStart()); await W(300); console.log('ao mirar, auto:', await ev(() => G.autoRun));
  await ev(() => G.aimEnd()); await page.click('#tSprint'); await W(300); await page.click('#tSprint'); await W(300); console.log('toque duplo, auto:', await ev(() => G.autoRun));
};
