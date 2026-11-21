// v0.4.1: linha de vista (sem círculo), espreitar por janelas, escadas com espaço
module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(500); await page.click('#sPlay'); await W(800);
  await ev(() => { document.getElementById('toast').hidden = true; G.tod = 0.4; });
  // escadas: espaço à frente do 1.º degrau e no topo
  console.log('stairs', await ev(() => { const out = []; for (const s of G.W.stairs) { const ax = s.ax, w0 = ax ? s.z0 : s.x0, w1 = ax ? s.z1 : s.x1; const chk = (a0, a1, lv) => { const R = ax ? { x0: Math.min(a0, a1), x1: Math.max(a0, a1), z0: w0 + 0.05, z1: w1 - 0.05 } : { z0: Math.min(a0, a1), z1: Math.max(a0, a1), x0: w0 + 0.05, x1: w1 - 0.05 }; const hit = G.W.rects.filter(r => (r.lv || 0) === lv && !r.off && r.h > 0.35 && r.x0 < R.x1 && r.x1 > R.x0 && r.z0 < R.z1 && r.z1 > R.z0 && !(r.leaf)); const ch = G.W.circles.filter(c => (c.lv || 0) === lv && c.on !== false && c.x + c.r > R.x0 && c.x - c.r < R.x1 && c.z + c.r > R.z0 && c.z - c.r < R.z1); return hit.length + ch.length; }; const b = chk(s.bot - s.dir * 0.9, s.bot - s.dir * 0.02, s.lv), t = chk(s.top + s.dir * 0.02, s.top + s.dir * 0.9, s.lv + 1); out.push((s.b.name || '?').slice(0, 12) + ':' + b + '/' + t); } return out.join(' '); }));
  // subir as escadas de uma casa de dois pisos com o polegar
  const ok = await ev(() => { const C = G.W.cuts.find(c => c.name === 'Casa de dois pisos'); if (!C) return 'sem casa'; const s = C.stairs[0]; const p = G.p; const ax = s.ax, cc = s.cc; p.lv = 0; p.h = 0; p.x = ax ? s.bot - s.dir * 0.6 : cc; p.z = ax ? cc : s.bot - s.dir * 0.6; G.camT.set(p.x, 0, p.z); G.zs.length = 0; const wx = ax ? s.dir : 0, wz = ax ? 0 : s.dir; const RG = [Math.cos(G.YAW), -Math.sin(G.YAW)], FW = [-Math.sin(G.YAW), -Math.cos(G.YAW)]; const ix = wx * RG[0] + wz * RG[1], iy = wx * FW[0] + wz * FW[1]; G.sticks.L = { x: ix * 0.8, y: -iy * 0.8, m: 0.8 }; window.__S = s; return [C.x0, C.z0, s.ax, s.dir].join(','); });
  console.log('house', ok);
  let lv = 0; for (let i = 0; i < 40 && lv < 1; i++) { await W(300); lv = await ev(() => G.p.lv); }
  await ev(() => { G.sticks.L = null; });
  console.log('climbed to lv', await ev(() => [G.p.lv, G.p.base.toFixed(2), G.p.x.toFixed(2), G.p.z.toFixed(2)].join(' ')));
  await W(1500); await shot('60-escadas');
  // na rua, de dia: sem círculo escuro; atrás dos prédios fica escuro
  await ev(() => { const p = G.p; p.lv = 0; p.h = 0; p.base = 0; p.bld = null; p.st = null; p.x = 2; p.z = 8; G.camT.set(p.x, 0, p.z); }); await W(1500);
  await shot('61-rua');
  // dentro da clínica: lá fora escuro menos pelas janelas e portas
  await ev(() => { const p = G.p; const C = G.W.cuts.find(c => /Clínica/.test(c.name || '')); p.x = (C.x0 + C.x1) / 2; p.z = (C.z0 + C.z1) / 2 + 1; p.lv = 0; G.camT.set(p.x, 0, p.z); G.zs.length = 0; G.zs.push({ x: C.x1 + 3, z: (C.z0 + C.z1) / 2, yaw: 0, hp: 80, state: 'wander', tx: C.x1 + 3, tz: (C.z0 + C.z1) / 2, think: 9, phase: 0, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 3, sc: 1, wT: 9, spd: 0, lv: 0, base: 0, y: 0.05 }); }); await W(1500);
  console.log('zombie outside hidden?', await ev(() => G.zs[0].hide));
  await shot('62-dentro');
  // de fora, ao pé de uma janela: vê-se lá dentro só pela janela
  await ev(() => { const p = G.p; const C = G.W.cuts.find(c => /Clínica/.test(c.name || '')); const o = C.ops.find(o => o.k === 'w' && o.horiz && Math.abs(o.z - C.z1) < 0.4) || C.ops.find(o => o.k === 'w'); p.x = o.x + (o.horiz ? 0 : (o.x > (C.x0 + C.x1) / 2 ? 1.6 : -1.6)); p.z = o.z + (o.horiz ? (o.z > (C.z0 + C.z1) / 2 ? 1.6 : -1.6) : 0); G.camT.set(p.x, 0, p.z); G.zs.length = 0; }); await W(1500);
  await shot('63-espreitar');
};
