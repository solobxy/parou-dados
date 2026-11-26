module.exports = async (page) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  const cdp = await page.context().newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); await cdp.send('Profiler.start');
  await ev(() => { const W0 = G.W; for (const L of W0.lazy.slice(0, 60)) { if (L.meshes) W0.lazyDrop(L); W0.lazyBuild(L); W0.lazyDrop(L); } });
  const { profile } = await cdp.send('Profiler.stop'); const nodes = new Map(profile.nodes.map(n => [n.id, n])), self = {}, parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  // tempo total (com filhos) por função
  const tot = {}; let all = 0; for (let i = 0; i < profile.samples.length; i++) { const dt = profile.timeDeltas[i] || 0; all += dt; let id = profile.samples[i]; const seen = new Set(); while (id) { const cf = nodes.get(id).callFrame, k = (cf.functionName || '(anon)') + ':' + cf.lineNumber; if (!seen.has(k)) { tot[k] = (tot[k] || 0) + dt; seen.add(k); } id = parent.get(id); } const cf = nodes.get(profile.samples[i]).callFrame; const k = (cf.functionName || '(anon)') + ':' + cf.lineNumber; self[k] = (self[k] || 0) + dt; }
  console.log('TOTAL', (all / 1000).toFixed(0)); for (const [k, v] of Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log('incl', (v / 1000).toFixed(0).padStart(6), k);
  for (const [k, v] of Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log('self', (v / 1000).toFixed(0).padStart(6), k); };
