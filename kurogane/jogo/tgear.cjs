// equipamento novo: capacete (cores), colete, mochilas, visão noturna, ghillie; e zombies com capacete/colete
const fs = require('fs');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { for (const z of G.zs) z.x += 3000; const p = G.p; p.x = 1200; p.z = 1200; G.camT.set(p.x, 0, p.z); G.cyc = 700; G.inv.belt[0] = null; G.select(1); G.refresh(); }); await WG(1);
  const save = (n, u) => fs.writeFileSync(`shots/eq-${n}.jpg`, Buffer.from(u.split(',')[1], 'base64'));
  const cam = (a, d, h, l) => ev(([a, d, h, l]) => { const p = G.p, y = p.yaw + a; return G.dbgCam([p.x + Math.sin(y) * d, p.y + h, p.z + Math.cos(y) * d], [p.x, p.y + l, p.z], 40, 460, 600); }, [a, d, h, l]);
  const sets = [['base', { head: 'capacete', vest: 'colete', back: 'mochila' }], ['deserto', { head: 'capacetec', vest: 'coleted', back: 'mochilaC', eyes: 'nvg' }], ['ghillie', { suit: 'ghillie', back: null, head: null, vest: null, eyes: null }]];
  for (const [nm, eq] of sets) {
    await ev(eq => { for (const s in eq) G.inv.eq[s] = eq[s] ? G.mkItem(eq[s]) : null; G.refresh(); }, eq); await WG(0.5);
    save(nm + '-frente', await cam(0.4, 2.2, 1.35, 1.05)); save(nm + '-costas', await cam(Math.PI + 0.5, 2.2, 1.4, 1.1)); save(nm + '-cara', await cam(0.5, 0.9, 1.68, 1.55));
  }
  // zombie com capacete e colete
  await ev(() => { const p = G.p, Z = G.zs.find(z => !z.an); Z.x = p.x + 6; Z.z = p.z; Z.y = 0; Z.helm = true; Z.vest = true; Z.frozen = true; Z.hide = false; Z.state = 'wander'; Z.hp = 999; window.__Z = Z; }); await WG(0.8);
  save('zombie', await ev(() => { const z = window.__Z; return G.dbgCam([z.x - 1.6, 1.6, z.z + 1.2], [z.x, 1.1, z.z], 40, 460, 600); })); save('zombie2', await ev(() => { const z = window.__Z; return G.dbgCam([z.x + 1.2, 1.6, z.z - 1.6], [z.x, 1.1, z.z], 40, 460, 600); }));
  fs.writeFileSync('shots/eq-retrato.png', Buffer.from((await ev(() => G.portrait(G.inv.eq))).split(',')[1], 'base64'));
};
