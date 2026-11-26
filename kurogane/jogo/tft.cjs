module.exports = async (page) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { const p = G.p; p.x = -40; p.z = 0.5; G.autoYaw = Math.PI / 2; p.yaw = p.root = G.autoYaw; }); await W(3000);
  for (const run of [false, true]) { await ev(r => { window.__ft = []; let l = performance.now(); const f = () => { const n = performance.now(); window.__ft.push(n - l); l = n; if (window.__ft.length < 400) requestAnimationFrame(f); }; requestAnimationFrame(f); G.autoRun = r; }, run); await W(8000);
    console.log(run ? 'a correr' : 'parado', JSON.stringify(await ev(() => { const F = window.__ft.slice(2).sort((a, b) => a - b); return [F.length, F[F.length >> 1].toFixed(0), F[Math.floor(F.length * 0.95)].toFixed(0)]; }))); } };
