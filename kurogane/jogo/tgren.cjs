// granada: segurar enche a força e mostra a trajetória; mais tempo = mais longe
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { G.inv.belt[4] = { id: 9e5, k: 'granada', n: 3 }; const p = G.p; p.x = 60; p.z = 1.5; p.yaw = p.root = Math.PI / 2; for (const z of G.zs) { z.x = z.hx = 440; z.z = z.hz = 440; } G.select(4); });
  const waitG = async s => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t > t, t0 + s, { timeout: 120000, polling: 100 }); };
  await waitG(0.5);
  const one = async (hold, snap) => { await ev(() => { const p = G.p; p.yaw = p.root = 0; });
    await ev(() => { const p = G.p; p.x = 60; p.z = 1.5; p.cd = 0; G.ui.toast(''); });
    const x0 = await ev(() => [G.p.x, G.p.z]);
    await ev(() => G.fireDown()); await waitG(hold);
    const pw = await ev(() => G.grenPow()), pe = await ev(() => G.dbgGrenEnd()); if (snap) await shot(snap);
    await ev(() => G.fireUp());
    let last = null; for (let i = 0; i < 60; i++) { await waitG(0.1); const b = await ev(() => { const B = G.booms.find(b => b.k === 'gran' && !b.ghost); return B ? [B.P.x, B.P.z, B.t] : null; }); if (b) last = b; else if (last) break; }
    const thD = await ev(() => G.p.thrD);
    await waitG(0.9);
    console.log('  previsão a', Math.hypot(pe[0] - x0[0], pe[1] - x0[1]).toFixed(1), 'm; final', last && last.slice(0, 2).map(v => v.toFixed(1)), 'previsto', pe.map(v => v.toFixed(1)));
    return [pw, last ? +Math.hypot(last[0] - x0[0], last[1] - x0[1]).toFixed(1) : null];
  };
  const a = await one(0.12, null), b = await one(1.4, 'granada-trajetoria');
  console.log('curto: força', a[0].toFixed(2), 'dist', a[1], '| longo: força', b[0].toFixed(2), 'dist', b[1]);
  console.log('linha escondida depois:', await ev(() => !G.gch));
};
