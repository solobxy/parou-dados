// carro no telemóvel: entrar, botões de condução livres e a funcionar, sair, luzes, câmara
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  const c0 = await ev(() => { const c = G.cars.list.find(q => q.k === 'sedan') || G.cars.list[0]; G.p.x = c.x + 2.5; G.p.z = c.z; return { k: c.k, id: c.id }; }); await W(1500);
  await ev(() => { const c = G.cars.list.find(q => q.k === 'sedan') || G.cars.list[0]; G.cars.enter(c); }); await W(1500);
  const r = await ev(() => { const o = {}; for (const id of ['dUp', 'dDn', 'dL', 'dR', 'dHov', 'tUse', 'tJump', 'tFire', 'tCrouch', 'tProne', 'tAds', 'tReload', 'tSprint', 'tLight']) { const e = document.getElementById(id); const b = e.getBoundingClientRect(); const vis = e.offsetParent !== null && !e.hidden && getComputedStyle(e).display !== 'none'; let top = null; if (vis) { const t = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); top = t && (t.closest('button') || t).id; } o[id] = vis ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), top, e.textContent.trim().slice(0, 14)] : 'escondido'; } return { car: !!G.car, o, cam: G.camDist ?? null }; });
  console.log('dentro:', JSON.stringify(r));
  await shot('carro-dentro');
  // acelerar 2,5 s e virar à direita 1,5 s, depois à esquerda 1,5 s (pelos botões do ecrã)
  const hold = (id, on) => ev(([id, on]) => { const e = document.getElementById(id); e.dispatchEvent(new PointerEvent(on ? 'pointerdown' : 'pointerup', { bubbles: true, pointerId: id.length + 3 })); }, [id, on]);
  const gt = () => ev(() => G.t), waitG = async s => { const t0 = await gt(); await page.waitForFunction(t => G.t > t, t0 + s, { timeout: 120000 }); };
  await hold('dUp', 1); await waitG(2.5); const y0 = await ev(() => [G.car.yaw, G.car.v]);
  await hold('dR', 1); await waitG(1.5); await hold('dR', 0); const y1 = await ev(() => [G.car.yaw, G.car.v]);
  await shot('carro-curva');
  await hold('dL', 1); await waitG(1.5); await hold('dL', 0); const y2 = await ev(() => [G.car.yaw, G.car.v]); await hold('dUp', 0);
  console.log('virar: direita', (y1[0] - y0[0]).toFixed(2), 'esquerda', (y2[0] - y1[0]).toFixed(2), 'vel', y0[1].toFixed(1), y1[1].toFixed(1));
  // faróis pelo botão Luz
  const li = await ev(async () => { const c = G.car, a = c.li; document.getElementById('tLight').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); document.getElementById('tLight').click(); await new Promise(q => setTimeout(q, 300)); return [a, c.li]; });
  console.log('faróis:', JSON.stringify(li));
  await waitG(1.5);
  // sair
  const ex = await ev(async () => { const e = document.getElementById('tUse'); const b = e.getBoundingClientRect(); const t = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); const info = [e.hidden, t && (t.closest('button') || t).id, e.textContent.trim(), Math.round(G.car ? G.car.v * 10 : 0) / 10]; if (t) t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await new Promise(q => setTimeout(q, 1000)); return [info, !!G.car]; });
  console.log('sair:', JSON.stringify(ex));
};
