// perfil de CPU: onde vai o tempo de cada imagem (cidade, de dia), funções com mais tempo próprio
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  const spot = process.env.SPOT || 'cidade';
  await ev(s => { const p = G.p; if (s === 'cidade') { p.x = -6; p.z = 3; } else if (s === 'floresta') { p.x = 300; p.z = 300; } else { p.x = 2602; p.z = -2560; } G.camT.set(p.x, 0, p.z); }, spot); await W(4000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 300 });
  const f0 = await ev(() => G.frames || 0), t0 = Date.now();
  await cdp.send('Profiler.start'); await W(8000); const { profile } = await cdp.send('Profiler.stop');
  const info = await ev(() => ({ fps: G.fps, calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles, geos: G.renderer.info.memory.geometries, tex: G.renderer.info.memory.textures, progs: G.renderer.info.programs.length, zs: G.zs.length }));
  const dt = {}; const nodes = new Map(profile.nodes.map(n => [n.id, n]));
  const iv = profile.timeDeltas; let tot = 0;
  for (let i = 0; i < profile.samples.length; i++) { const n = nodes.get(profile.samples[i]); const cf = n.callFrame; const k = (cf.functionName || '(anon)') + ' @' + (cf.url.split('/').pop() || '') + ':' + cf.lineNumber + ':' + cf.columnNumber; dt[k] = (dt[k] || 0) + (iv[i] || 0); tot += iv[i] || 0; }
  const top = Object.entries(dt).sort((a, b) => b[1] - a[1]).slice(0, 40);
  console.log('INFO', JSON.stringify(info), 'total ms', (tot / 1000).toFixed(0));
  for (const [k, v] of top) console.log((v / tot * 100).toFixed(1).padStart(5) + '%', k);
};
