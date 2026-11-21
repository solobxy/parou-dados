module.exports = async (page, shot, mode) => {
  const ev = f => page.evaluate(f);
  const W = ms => page.waitForTimeout(ms);
  await W(800); await page.click('#sPlay'); await W(800);
  // clínica: armário de medicamentos
  await ev(() => { const p = G.p; p.x = -9.4; p.z = -17.9; p.yaw = Math.PI; G.camT.set(p.x, 0, p.z); });
  await W(700);
  console.log('prompt', await ev(() => G.prompt && G.prompt.label));
  await shot('10-clinica');
  await ev(() => G.interact()); await W(700);
  await shot('11-inv-loot');
  console.log('box items', await ev(() => G.box && G.box.grid.list.map(e => e.it.k + 'x' + e.it.n).join(',')));
  await page.click('#takeAll'); await W(400);
  console.log('bag', await ev(() => G.inv.bag.list.map(e => e.it.k + 'x' + e.it.n + '@' + e.x + ',' + e.y).join(' ')), 'belt', await ev(() => G.inv.belt.map(b => b ? b.k : '-').join(',')));
  // dar equipamento e armas para ver no corpo
  await ev(() => { const I = G.inv; for (const [k, n] of [['m4', 1], ['a556', 60], ['pistola', 1], ['a9', 30], ['capacete', 1], ['colete', 1], ['mochila', 1], ['madeira', 120], ['pedraR', 70], ['enxofre', 40], ['metal', 30], ['katana', 1]]) { const { mkItem } = window; } });
  await ev(() => { for (const [k, n] of [['m4', 1], ['a556', 60], ['pistola', 1], ['a9', 30], ['capacete', 1], ['colete', 1], ['mochila', 1], ['madeira', 120], ['pedraR', 70], ['enxofre', 40], ['metal', 30]]) G.gain(k, n); G.refresh(); });
  await W(500);
  await shot('12-inv-cheio');
  // arrastar a mochila do saco para o slot das costas (se não estiver equipada)
  const r = await ev(() => { const el = document.querySelector('#gBag .item'); const b = el && el.getBoundingClientRect(); const t = document.querySelector('[data-belt="5"]').getBoundingClientRect(); return b && { x: b.x + 10, y: b.y + 10, tx: t.x + t.width / 2, ty: t.y + t.height / 2, k: el.dataset.src }; });
  console.log('drag', JSON.stringify(r));
  if (r) { await page.mouse.move(r.x, r.y); await page.mouse.down(); await page.mouse.move(r.x + 20, r.y + 20, { steps: 4 }); await page.mouse.move(r.tx, r.ty, { steps: 8 }); await page.mouse.up(); await W(300); }
  console.log('belt after drag', await ev(() => G.inv.belt.map(b => b ? b.k : '-').join(',')));
  // tocar num objeto -> barra de ações
  await ev(() => { const el = document.querySelector('#gBag .item'); el && el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: el.getBoundingClientRect().x + 8, clientY: el.getBoundingClientRect().y + 8, pointerId: 9 })); el && el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: el.getBoundingClientRect().x + 8, clientY: el.getBoundingClientRect().y + 8, pointerId: 9 })); });
  await W(300); await shot('13-inv-selecionado');
  await page.click('.tabs button[data-tab="craft"]'); await W(300); await shot('14-fabrico');
  await ev(() => G.ui.closeInv()); await W(200);
  // M4 na mão e zombies à frente
  await ev(() => { const i = G.inv.belt.findIndex(b => b && b.k === 'm4'); G.select(i); const it = G.inv.belt[i]; it.ammo = 30; const p = G.p; p.x = 0; p.z = 12; p.yaw = Math.PI; G.camT.set(p.x, 0, p.z); G.zs.length = 0; for (let k = 0; k < 4; k++) G.zs.push(Object.assign({ x: -2 + k * 1.3, z: 4 - k * 0.5, yaw: 0, hp: 100, state: 'chase', tx: 0, tz: 0, think: 0, phase: k, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 3, sc: 1, wT: 0 })); });
  await W(600);
  await shot('15-m4-zombies');
  if (mode === 'desktop') { await page.mouse.move(640, 250); await page.mouse.down(); await W(900); await shot('16-a-disparar'); await page.mouse.up(); }
  else { await ev(() => { G.sticks.R = { x: 0, y: -1, m: 1 }; }); await W(900); await shot('16-a-disparar'); await ev(() => { G.sticks.R = null; }); }
  console.log('zombies', await ev(() => G.zs.map(z => z.state + ':' + Math.round(z.hp)).join(' ')), 'ammo', await ev(() => G.inv.belt[G.sel].ammo), 'kills', await ev(() => G.p.kills));
  // floresta: cortar árvore com a pedra
  await ev(() => { const t = G.W.trees.find(t => Math.abs(t.x) > 55 && Math.abs(t.z) > 20); const p = G.p; p.x = t.x; p.z = t.z + 1.0; p.yaw = Math.PI; G.camT.set(p.x, 0, p.z); G.select(0); window.__tree = t; G.zs.length = 0; });
  await W(400);
  for (let i = 0; i < 6; i++) { await ev(() => { G.p.yaw = Math.atan2(__tree.x - G.p.x, __tree.z - G.p.z); G.p.cd = 0; }); if (mode === 'desktop') { await ev(() => { G.mouse.has = false; }); await page.mouse.click(640, 360); } else await ev(() => G.tapAttack()); await W(500); }
  console.log('madeira', await ev(() => G.inv.count('madeira')), 'tree hp', await ev(() => __tree.hp + '/' + __tree.max));
  await shot('17-floresta');
  await ev(() => G.ui.toggleMap(true)); await W(300); await shot('18-mapa'); await ev(() => G.ui.toggleMap(false));
  await ev(() => { G.p.hp = 1; G.p.bleed = 1; }); await W(4200); await shot('19-morte');
  console.log('fps', await ev(() => G.fps), 'calls', await ev(() => G.renderer.info.render.calls), 'tris', await ev(() => G.renderer.info.render.triangles));
};
