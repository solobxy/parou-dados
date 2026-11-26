// 1.ª pessoa no telemóvel: arrastar o polegar direito roda a vista, mesmo depois de um toque perdido (painel aberto a meio do toque)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const cdp = await page.context().newCDPSession(page);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  await ev(() => G.dbgKit()); await W(1500); await ev(() => { for (const z of G.zs) z.x += 3000; });
  const drag = async (id, x0, y0, dx, steps = 8) => { await T('touchStart', [[x0, y0, id]]); for (let i = 1; i <= steps; i++) { await T('touchMove', [[x0 + dx * i / steps, y0, id]]); await W(30); } await T('touchEnd', []); };
  const pt = await ev(() => { for (let y = 80; y < 380; y += 20) for (let x = 420; x < 820; x += 20) { const e = document.elementFromPoint(x, y); if (e && e.id === 'padR') return [x, y]; } return null; }); console.log('ponto livre do polegar direito:', pt); const [PX, PY] = pt;
  const fy = () => ev(() => +G.aimS.fy.toFixed(3));
  let a = await fy(); await drag(1, PX, PY, -120); let b = await fy(); console.log('arrasto 1:', a, '→', b); const ok1 = Math.abs(b - a) > 0.1;
  // toque começa, abre-se o inventário por cima, o dedo sai sem o comando saber
  await T('touchStart', [[PX, PY, 2]]); await T('touchMove', [[PX - 20, PY, 2]]); await ev(() => G.ui.toggleInv ? G.ui.toggleInv() : (G.invOpen = true)); await W(200);
  await T('touchEnd', []); await ev(() => { if (G.ui.toggleInv && G.invOpen) G.ui.toggleInv(); G.invOpen = false; }); await W(400);
  a = await fy(); await drag(3, PX, PY, 120); b = await fy(); console.log('arrasto depois do inventário:', a, '→', b); const ok2 = Math.abs(b - a) > 0.1;
  const ads = await ev(() => { const e = document.getElementById('tAds'); if (e.hidden) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
  let ok3 = true; if (ads) { a = await fy(); await drag(4, ads[0], ads[1], -100); b = await fy(); console.log('arrasto a começar no botão da mira:', a, '→', b); ok3 = Math.abs(b - a) > 0.1; await ev(() => { if (G.aimS.scope) G.scopeToggle(); }); }
  console.log(ok1 && ok2 && ok3 ? 'OK vista roda sempre' : 'FALHA vista presa');
};
