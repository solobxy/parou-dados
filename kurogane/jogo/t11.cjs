module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(300); await page.tap('#sPlay'); await W(500);
  await ev(() => { document.getElementById('toast').hidden = true; G.zs.length = 0; G.spawnT = 999; G.tod = 0.96; const p = G.p; p.x = 2; p.z = 10; G.camT.set(2, 0, 10); });
  await W(700); await shot('90-noite');
  await ev(() => { G.toggleLight(); G.p.root = G.p.aim = G.p.yaw = Math.PI; }); await W(600); await shot('91-noite-lanterna');
  // tiro no escuro: luz do cano
  await ev(() => { G.gain('pistola', 1); const i = G.inv.belt.findIndex(b => b && b.k === 'pistola'); G.inv.belt[i].ammo = 12; G.select(i); G.p.cd = 0; G.tapAttack(); }); await W(30); await shot('92-noite-tiro');
  // sons à volta do ecrã
  await ev(() => { G.tod = 0.4; const p = G.p; G.zs.length = 0; G.zs.push({ x: p.x + 14, z: p.z + 3, yaw: -1.5, hp: 80, state: 'chase', tx: p.x, tz: p.z, think: 0, phase: 0, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 0, sc: 1, wT: 9, spd: 1, lv: 0, base: 0, v: 2 }); G.ui.sound(p.x - 20, p.z - 6, 'z', 20); G.ui.sound(p.x + 8, p.z + 12, 't', 14); });
  await W(500); await shot('93-sons');
  // escadas: zombie no topo da escada vê e é visto por quem está em baixo
  await ev(() => { const p = G.p; G.zs.length = 0; p.x = -14.8; p.z = -17.6; p.lv = 0; p.base = 0; p.st = null; G.camT.set(p.x, 0, p.z); G.zs.push({ x: -20.3, z: -18.6, yaw: Math.PI / 2, hp: 80, state: 'wander', tx: -20.3, tz: -18.6, think: 0, phase: 0, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 3, sc: 1, wT: 99, spd: 1, lv: 1, base: 3.5, fhb: 3.5 }); });
  await W(300); await ev(() => { const z = G.zs[0]; z.bld = G.W.cuts.find(c => c.name === 'Clínica Kurogane'); });
  await W(900);
  console.log('escada', await ev(() => { const z = G.zs[0]; return [z.lv, z.hide, z.sees, z.state].join(' '); }));
  await shot('94-escada-visivel');
  console.log('errors-check done');
};
