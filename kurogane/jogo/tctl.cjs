// comandos estilo PUBG: metade direita aponta, botão grande dispara; modo canhoto troca os lados
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const cdp = await page.context().newCDPSession(page);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const drag = async (x0, y0, x1, y1, hold = 600) => { await touch('touchStart', x0, y0); for (let i = 1; i <= 8; i++) { await touch('touchMove', x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8); await W(40); } await W(hold); const r = await ev(() => ({ L: G.sticks.L, aim: G.aimS.on, kn: [...document.querySelectorAll('.knob.on')].map(k => Math.round(k.getBoundingClientRect().left + k.getBoundingClientRect().width / 2)) })); await touch('touchEnd'); return r; };
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { for (const z of G.zs) z.x += 9000; G.select(0); }); await W(500);
  const w = await ev(() => innerWidth), h = await ev(() => innerHeight);
  console.log('rótulo do botão:', await ev(() => document.querySelector('#tFire em').textContent));
  await shot('ctl-normal');
  // normal: polegar esquerdo anda, direito aponta
  const a = await drag(150, h - 120, 210, h - 120); console.log('normal, esquerda:', JSON.stringify(a), a.L && a.L.x > 0.5 ? 'OK anda para a direita' : 'FALHA');
  await ev(() => G.aimEnd()); await W(400);
  const b = await drag(w * 0.62, h * 0.45, w * 0.62 + 60, h * 0.45 - 20); console.log('normal, direita:', JSON.stringify(b), b.aim ? 'OK aponta' : 'FALHA');
  await ev(() => G.aimEnd()); await W(600);
  // botão grande dispara logo
  const n0 = await ev(() => G.inv.belt[G.sel].ammo); const fb = await ev(() => { const r = document.getElementById('tFire').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await touch('touchStart', fb[0], fb[1]); await W(1500); await touch('touchEnd'); await W(300);
  const n1 = await ev(() => G.inv.belt[G.sel].ammo); console.log('disparar num toque:', n0, '→', n1, n1 < n0 ? 'OK disparou' : 'FALHA');
  await ev(() => G.aimEnd()); await W(500);
  // canhoto
  await ev(() => { G.cfg.mirror = true; document.body.classList.add('mir'); }); await W(400);
  await shot('ctl-canhoto');
  const fb2 = await ev(() => { const r = document.getElementById('tFire').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; }); console.log('botão disparar no canhoto em x =', fb2[0], fb2[0] < w / 2 ? 'OK à esquerda' : 'FALHA');
  const c = await drag(w - 150, h - 120, w - 90, h - 120); console.log('canhoto, direita anda:', JSON.stringify(c), c.L && c.L.x > 0.5 && Math.abs(c.kn[0] - (w - 150)) < 70 ? 'OK anda e o botão fica debaixo do dedo' : 'FALHA');
  const d = await drag(w * 0.3, h * 0.45, w * 0.3 + 60, h * 0.45); console.log('canhoto, esquerda aponta:', JSON.stringify(d), d.aim ? 'OK aponta' : 'FALHA');
  const txt = await ev(() => { const r = document.querySelector('#tReload em').getBoundingClientRect(); return document.querySelector('#tReload em').textContent; }); console.log('texto dos botões:', txt);
};
