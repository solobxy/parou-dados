module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
  await page.evaluate(() => G.dbgKit()); await W(1500);
  await ev(() => { G.inv.belt[4] = { id: 9e5, k: 'granada', n: 2 }; G.inv.belt[5] = { id: 9e5 + 1, k: 'c4', n: 1 }; const p = G.p; p.x = 60; p.z = 1.5; p.yaw = p.root = Math.PI / 2; for (const z of G.zs) { z.x = z.hx = 440; z.z = z.hz = 440; } const zs = G.zs.slice(0, 4); zs.forEach((z, i) => Object.assign(z, { x: 70 + i * 0.6, z: 1.5, hx: 70, hz: 1.5, hp: 80, lv: 0, state: 'wander', helm: 0, vest: 0, wT: 99, think: 99 })); G.select(4); });
  await W(400); console.log('botão:', await ev(() => document.querySelector('#tFire em').textContent + ' ' + document.getElementById('tFire').className));
  await ev(() => { G.p.yaw = G.p.root = Math.PI / 2; G.fireDown(); G.fireUp && G.fireUp(); });
  console.log('granadas restantes:', await ev(() => G.inv.belt[4] && G.inv.belt[4].n));
  for (let i = 0; i < 30; i++) { await W(500); if (i % 4 === 0) console.log('  ', await ev(() => G.booms.map(b => b.k + ' t=' + b.t.toFixed(2) + ' P=' + b.P.x.toFixed(1) + ',' + b.P.y.toFixed(2) + ',' + b.P.z.toFixed(1)).join(' | ') + ' gt=' + G.t.toFixed(1))); const d = await ev(() => G.zs.slice(0, 4).filter(z => z.state === 'dead').length); if (d) { console.log('zombies mortos pela granada:', d, 'aos', (i + 1) * 0.5, 's'); break; } }
  await shot('granada');
  await ev(() => { G.select(5); G.p.x = 30; }); await W(300);
  console.log('botão C4:', await ev(() => document.querySelector('#tFire em').textContent));
  await ev(() => G.fireDown());
  console.log('C4 no cinto depois:', await ev(() => String(G.inv.belt[5])));
};
