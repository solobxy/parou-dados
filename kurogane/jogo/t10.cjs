module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(300); await page.tap('#sPlay'); await W(600);
  await ev(() => { document.getElementById('toast').hidden = true; G.zs.length = 0; G.spawnT = 999; });
  // escadas da clínica: subir passo a passo
  await ev(() => { const p = G.p; p.x = -15.4; p.z = -18.68; p.lv = 0; G.camT.set(p.x, 0, p.z); });
  await W(400); await shot('80-clinica-piso0');
  for (const x of [-16.2, -16.9, -17.6, -18.2]) { await ev(x => { G.p.x = x; G.p.z = -18.68; }, x); await W(150); }
  console.log('meio', await ev(() => [G.p.lv, G.p.base.toFixed(2), G.p.stT && G.p.stT.toFixed(2)].join(' '))); await W(200); await shot('81-escada-meio');
  for (const x of [-18.9, -19.4, -20.1, -20.4]) { await ev(x => { G.p.x = x; G.p.z = -18.68; }, x); await W(150); }
  await ev(() => { G.p.z = -17.0; }); await W(500);
  console.log('cima', await ev(() => [G.p.lv, G.p.base.toFixed(2), !!G.p.st, G.inside && G.inside.name].join(' ')));
  await shot('82-clinica-piso1');
  // trepar para cima de um carro
  await ev(() => { const p = G.p; p.lv = 0; p.base = 0; p.bld = null; p.x = -28; p.z = 0.0; p.h = 0; p.vx = 0; p.vz = 0; p.root = Math.PI; p.aim = Math.PI; G.camT.set(p.x, 0, p.z); }); await W(400);
  await ev(() => { G.p.z = -0.0; G.p.root = Math.PI; }); await W(100);
  console.log('taxi rect', await ev(() => { const r = G.W.rects.find(r => r.car && r.x0 < -27 && r.x1 > -29 && r.z0 < 0 && r.z1 > -3); return r && [r.x0, r.z0, r.x1, r.z1, r.h, r.top, r.climb].join(','); }));
  await ev(() => { G.p.z = -0.7; G.p.vx = 0; G.p.vz = -0.6; }); await ev(() => G.jump()); await W(250); await shot('83-a-trepar'); await W(1400);
  console.log('carro h', await ev(() => [G.p.h.toFixed(2), G.p.onGround, !!G.p.climb, G.p.x.toFixed(1), G.p.z.toFixed(1)].join(' ')));
  await shot('84-em-cima-do-carro');
  // zombie do outro lado de uma parede não ataca
  await ev(() => { const p = G.p; p.x = -14.2; p.z = -7.85; p.h = 0; p.lv = 0; p.hp = 100; p.bleed = 0; G.camT.set(p.x, 0, p.z); G.zs.length = 0; G.zs.push({ x: -16.0, z: -8.65, yaw: 0, hp: 80, state: 'chase', tx: 0, tz: 0, think: 0, phase: 0, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 3, sc: 1, wT: 9, spd: 0.01, lv: 0, base: 0 }); });
  await ev(() => { G.p.x = -16.0; G.p.z = -7.75; }); await W(3500);
  console.log('hp com parede', await ev(() => Math.round(G.p.hp)), 'zombie', await ev(() => G.zs[0] && [G.zs[0].x.toFixed(2), G.zs[0].z.toFixed(2), G.zs[0].state].join(',')));
  // caçadeira
  await ev(() => { G.gain('cacadeira', 1); G.gain('c12', 12); const i = G.inv.belt.findIndex(b => b && b.k === 'cacadeira'); G.select(i); const it = G.inv.belt[i]; it.ammo = 6; const p = G.p; p.x = 0; p.z = 14; p.root = p.aim = p.yaw = Math.PI; G.zs.length = 0; for (let k = 0; k < 3; k++) G.zs.push({ x: -0.8 + k * 0.8, z: 9, yaw: 0, hp: 80, state: 'wander', tx: -0.8 + k * 0.8, tz: 9, think: 99, phase: 0, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 3, sc: 1, wT: 99, spd: 1, lv: 0, base: 0 }); G.camT.set(0, 0, 13); });
  await W(300); await ev(() => G.tapAttack()); await W(1500); await ev(() => { G.aimS.lock = { z: G.zs[1], lx: 0, ly: 1.3, lz: 0.1 }; G.aimS.steady = 1; }); await W(600); await ev(() => G.tapAttack()); await W(2500); await shot('85-cacadeira');
  console.log('cac hits', await ev(() => G.zs.map(z => z.state + ':' + Math.round(z.hp)).join(' ')));
  // definições e editor
  await page.tap('#bSet'); await W(400); await shot('86-definicoes');
  await page.click('text=Editar'); await W(400);
  const r = await ev(() => { const b = document.getElementById('tFire').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await page.mouse.move(r.x, r.y); await page.mouse.down(); await page.mouse.move(r.x - 120, r.y - 60, { steps: 6 }); await page.mouse.up(); await W(200);
  await page.click('#hePlus'); await W(100); await shot('87-editor');
  console.log('fire hud', await ev(() => JSON.stringify(G.cfg.hud.fire)));
  await page.click('#heDone'); await W(200); await page.click('#setClose'); await W(300); await shot('88-depois');
  console.log('paused', await ev(() => G.paused), 'fps', await ev(() => G.fps.toFixed(0)), 'calls', await ev(() => G.renderer.info.render.calls));
};
