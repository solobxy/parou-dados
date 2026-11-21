module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
  await page.evaluate(() => G.dbgKit()); await W(1500);
  // casa com uma porta ao nível do chão: tu lá dentro, zombie do lado oposto à porta, lá fora
  const setup = await ev(() => { const W0 = G.W; const D = W0.doors.find(D => D.C && D.lv === 0 && Math.abs(D.x) > 120 && !D.lock && !D.base && D.C.n === 1 && (D.C.x1 - D.C.x0) > 6 && (D.C.z1 - D.C.z0) > 5); const C = D.C; D.t = D.target = 1;
    const cx = (C.x0 + C.x1) / 2, cz = (C.z0 + C.z1) / 2; const vx = cx - D.x, vz = cz - D.z, l = Math.hypot(vx, vz); const zx = cx + vx / l * ((C.x1 - C.x0) / 2 + 3), zz = cz + vz / l * ((C.z1 - C.z0) / 2 + 3);
    for (const z of G.zs) { z.x = z.hx = 440; z.z = z.hz = 440; z.state = 'wander'; }
    const p = G.p; p.x = cx; p.z = cz; p.lv = 0; p.bld = null;
    const z = G.zs.find(z => z.state !== 'dead'); Object.assign(z, { x: zx, z: zz, hx: zx, hz: zz, lv: 0, state: 'chase', hp: 80, mem: 99, tx: cx, tz: cz, lost: 0, think: 99, spd: 1 });
    const r = G.dbgNav.find(zx, zz, cx, cz, 0); return { casa: C.name, door: [D.x.toFixed(1), D.z.toFixed(1)], z: [zx.toFixed(1), zz.toFixed(1)], p: [cx.toFixed(1), cz.toFixed(1)], direto: G.dbgNav.walkLine(zx, zz, cx, cz, 0), caminho: r.ok + ' ' + r.pts.length + ' cantos, ' + r.exp + ' nós' }; });
  console.log(JSON.stringify(setup));
  const t0 = await ev(() => G.t);
  for (let i = 0; i < 40; i++) { await W(1000); const r = await ev(() => { const z = G.zs.find(z => z.state === 'chase'); const p = G.p; z && (z.think = 99, z.lost = 0, z.state = 'chase'); return z ? { d: Math.hypot(z.x - p.x, z.z - p.z), t: G.t } : null; }); if (!r) break; if (i % 5 === 0) console.log('  t=' + (r.t - t0).toFixed(1) + 's dist=' + r.d.toFixed(1)); if (r.d < 1.6) { console.log('chegou em', (r.t - t0).toFixed(1), 's de jogo'); break; } }
  await shot('nav');
};
