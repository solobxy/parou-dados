// v0.4: HUD nas duas orientações, mira, zonas, portas, mira em 1.ª pessoa
module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(600); await page.click('#sPlay'); await W(900);
  await ev(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
  // num sítio aberto da cidade
  await ev(() => { const p = G.p; p.x = 2; p.z = 8; p.lv = 0; G.camT.set(p.x, 0, p.z); G.zs.length = 0; G.gain('pistola', 1); G.gain('a9', 60); G.gain('caca', 1); G.gain('a308', 20); G.gain('mira8', 1); G.gain('silP', 1); });
  await W(400);
  await shot('40-hud');
  console.log('safe', JSON.stringify(await ev(() => G.ui.safe())), 'view', JSON.stringify(await ev(() => G.view)));
  // zombie à frente, pistola levantada: a mira prende-se a ele
  await ev(() => { const p = G.p; G.select(G.inv.belt.findIndex(b => b && b.k === 'pistola')); G.inv.belt[G.sel].ammo = 12; p.yaw = p.aim = p.root = 0; G.zs.push({ x: p.x, z: p.z + 6, yaw: Math.PI, hp: 80, state: 'wander', tx: p.x, tz: p.z + 6, think: 9, phase: 0, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 3, sc: 1, wT: 9, spd: 0, lv: 0, base: 0, y: 0.05 }); });
  await W(200);
  await ev(() => G.fireDown()); await ev(() => G.fireUp()); await W(500);
  console.log('aim on', await ev(() => [G.aimS.on, !!G.aimS.lock, G.aimS.raise.toFixed(2), G.aimS.zone].join(' ')), 'ammo', await ev(() => G.inv.belt[G.sel].ammo));
  await shot('41-mira');
  // mira na cabeça e disparar: tem de morrer com um tiro
  await ev(() => { const L = G.aimS.lock; L.lx = 0; L.ly = 1.75; L.lz = 0.2; }); await W(300);
  console.log('zone before shot', await ev(() => G.aimS.zone));
  await ev(() => { G.aimS.steady = 1; G.fireDown(); G.fireUp(); }); await W(400);
  console.log('after head', await ev(() => { const z = G.zs[0]; return [z.state, Math.round(z.hp), z.head].join(' '); }), 'ammo', await ev(() => G.inv.belt[G.sel].ammo));
  await shot('42-cabeca');
  // zombie de capacete: a 9 mm na cabeça é travada
  await ev(() => { const p = G.p; G.zs.length = 0; G.zs.push({ x: p.x, z: p.z + 5, yaw: Math.PI, hp: 95, state: 'wander', tx: p.x, tz: p.z + 5, think: 9, phase: 0, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 3, sc: 1, wT: 9, spd: 0, lv: 0, base: 0, y: 0.05, helm: 2, vest: 3, kind: 'mil' }); G.aimS.lock = { z: G.zs[0], lx: 0, ly: 1.76, lz: 0.2 }; }); await W(300);
  await ev(() => { G.aimS.steady = 1; G.p.cd = 0; G.fireDown(); G.fireUp(); }); await W(400);
  console.log('helmet', await ev(() => { const z = G.zs[0]; return [z.state, Math.round(z.hp)].join(' '); }));
  // pernas: coxeia
  await ev(() => { G.aimS.lock = { z: G.zs[0], lx: 0, ly: 0.5, lz: 0 }; }); await W(250);
  await ev(() => { G.aimS.steady = 1; G.p.cd = 0; G.fireDown(); G.fireUp(); }); await W(400);
  console.log('legs', await ev(() => { const z = G.zs[0]; return [z.state, Math.round(z.hp), z.limp].join(' '); }));
  await shot('43-soldado');
  // portas: encontrar uma perto, fechar, ver que trava
  const dr = await ev(() => { const p = G.p; let best = null, bd = 1e9; for (const D of G.W.doors) { if (D.lv) continue; const d = Math.hypot(D.x - 2, D.z - 8); if (d < bd) { bd = d; best = D; } } return best ? { x: best.x, z: best.z, h: best.horiz, i: best.inward, t: best.target, n: G.W.doors.length } : null; });
  console.log('door', JSON.stringify(dr));
  await ev(() => { G.aimEnd(); G.zs.length = 0; G.cfg.autoDoor = false; });
  await ev(d => { const p = G.p; const D = G.W.doors.find(o => o.x === d.x && o.z === d.z); D.target = D.t = 0; const o = d.h ? [0, -d.i * 0.7] : [-d.i * 0.7, 0]; p.x = d.x + o[0]; p.z = d.z + o[1]; G.camT.set(p.x, 0, p.z); p.vx = p.vz = 0; }, dr); await W(600);
  console.log('prompt', await ev(() => G.prompt && G.prompt.label), 'tUse', await ev(() => !document.getElementById('tUse').hidden && document.getElementById('tUse').textContent.trim()));
  await shot('44-porta-fechada');
  // tentar atravessar a porta fechada: empurrar o polegar na direção da porta durante 1,5 s
  await ev(d => { const p = G.p; const wx = d.h ? 0 : d.i, wz = d.h ? d.i : 0; const RG = [Math.cos(G.YAW), -Math.sin(G.YAW)], FW = [-Math.sin(G.YAW), -Math.cos(G.YAW)]; const ix = wx * RG[0] + wz * RG[1], iy = wx * FW[0] + wz * FW[1]; G.sticks.L = { x: ix * 0.7, y: -iy * 0.7, m: 0.7 }; }, dr);
  await W(4000); const after = await ev(() => [G.p.x, G.p.z]); await ev(() => { G.sticks.L = null; });
  console.log('closed door: player', JSON.stringify(after.map(v => v.toFixed(2))), 'door', dr.x.toFixed(2), dr.z.toFixed(2), 'passed?', dr.h ? (after[1] - dr.z) * dr.i > 0 : (after[0] - dr.x) * dr.i > 0);
  await ev(() => G.interact()); await W(2500);
  console.log('door open', await ev(d => { const D = G.W.doors.find(o => o.x === d.x && o.z === d.z); return [D.t, D.target, D.rc.off].join(' '); }, dr));
  await shot('45-porta-aberta');
  await ev(d => { const wx = d.h ? 0 : d.i, wz = d.h ? d.i : 0; const RG = [Math.cos(G.YAW), -Math.sin(G.YAW)], FW = [-Math.sin(G.YAW), -Math.cos(G.YAW)]; const ix = wx * RG[0] + wz * RG[1], iy = wx * FW[0] + wz * FW[1]; G.sticks.L = { x: ix * 0.7, y: -iy * 0.7, m: 0.7 }; }, dr);
  await W(5000); const af2 = await ev(() => [G.p.x, G.p.z]); await ev(() => { G.sticks.L = null; });
  console.log('open door: passed?', dr.h ? (af2[1] - dr.z) * dr.i > 0 : (af2[0] - dr.x) * dr.i > 0, JSON.stringify(af2.map(v => v.toFixed(2))));
  // mira 8x em primeira pessoa
  await ev(() => { const p = G.p; p.x = 2; p.z = 8; G.camT.set(p.x, 0, p.z); const i = G.inv.belt.findIndex(b => b && b.k === 'caca'); const g = G.inv.belt[i]; g.att.scope = 'mira8'; g.ammo = 5; G.select(i); G.refresh(); G.zs.length = 0; G.zs.push({ x: p.x + 1, z: p.z + 22, yaw: Math.PI, hp: 80, state: 'wander', tx: p.x + 1, tz: p.z + 22, think: 9, phase: 0, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 3, sc: 1, wT: 9, spd: 0, lv: 0, base: 0, y: 0.05 }); G.p.yaw = G.p.aim = G.p.root = 0; });
  await W(200);
  await ev(() => G.scopeToggle()); await W(250); await shot('46-entrar-mira'); await W(600);
  console.log('fp', await ev(() => [G.fp, G.aimS.fpT.toFixed(2), G.aimS.zone, Math.round(G.aimS.dist || 0)].join(' ')));
  await shot('47-mira8');
  // apontar à cabeça na mira e disparar
  await ev(() => { const z = G.zs[0], e = G.aimS.eye; const hy = 0.05 + 0.92 + 0.88 * Math.cos(0.22), hz = z.z + 0.88 * Math.sin(0.22) * -1; G.aimS.fy = Math.atan2(z.x - e.x, hz - e.z); G.aimS.fpit = Math.atan2(hy - e.y, Math.hypot(z.x - e.x, hz - e.z)); G.aimS.steady = 1; G.aimS.breathOn = true; }); await W(500);
  console.log('scope zone', await ev(() => G.aimS.zone));
  await ev(() => { G.p.cd = 0; G.fireDown(); G.fireUp(); }); await W(500);
  console.log('scope shot', await ev(() => { const z = G.zs[0]; return [z.state, Math.round(z.hp), z.head].join(' '); }));
  await shot('48-mira8-tiro');
  await ev(() => G.scopeToggle()); await W(700);
  console.log('fp off', await ev(() => [G.fp, G.aimS.fpT.toFixed(2)].join(' ')));
  // portas automáticas: abre ao ir contra ela e fecha depois de passar
  await ev(() => { G.aimEnd(); G.select(0); G.cfg.autoDoor = true; G.zs.length = 0; });
  await ev(d => { const p = G.p; const D = G.W.doors.find(o => o.x === d.x && o.z === d.z); D.target = D.t = 0; D.auto = false; const o = d.h ? [0, -d.i * 1.6] : [-d.i * 1.6, 0]; p.x = d.x + o[0]; p.z = d.z + o[1]; G.camT.set(p.x, 0, p.z); p.vx = p.vz = 0;
    const wx = d.h ? 0 : d.i, wz = d.h ? d.i : 0; const RG = [Math.cos(G.YAW), -Math.sin(G.YAW)], FW = [-Math.sin(G.YAW), -Math.cos(G.YAW)]; const ix = wx * RG[0] + wz * RG[1], iy = wx * FW[0] + wz * FW[1]; G.sticks.L = { x: ix * 0.7, y: -iy * 0.7, m: 0.7 }; }, dr);
  let opened = false; for (let i = 0; i < 30 && !opened; i++) { await W(200); opened = await ev(d => G.W.doors.find(o => o.x === d.x && o.z === d.z).target === 1, dr); }
  await W(5000); await ev(() => { G.sticks.L = null; }); await W(4000);
  console.log('auto door: opened', opened, 'now', await ev(d => { const D = G.W.doors.find(o => o.x === d.x && o.z === d.z); return D.target + ' auto=' + D.auto + ' dist=' + Math.hypot(D.x - G.p.x, D.z - G.p.z).toFixed(1); }, dr));
  // definições
  await ev(() => document.getElementById('bSet').click()); await W(300); await shot('49-definicoes');
};
