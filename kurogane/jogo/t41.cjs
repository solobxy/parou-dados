module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.evaluate(() => G.dbgKit()); await W(1500);
  console.log('peso do kit:', await ev(() => JSON.stringify(G.load())));
  await page.click('#bInv'); await W(700);
  const sel = await ev(() => { const e = G.inv.bag.list.find(e => e.it.k === 'medkit'); const el = document.querySelector(`[data-src="bag:${e.it.id}"]`); const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, id: e.it.id, at: e.x + ',' + e.y }; });
  console.log('medkit em', sel.at, 'livres:', await ev(() => { let n = 0; for (let y = 0; y < G.inv.rows(); y++) for (let x = 0; x < 6; x++) if (!G.inv.bag.at(x, y)) n++; return n; }));
  await page.touchscreen.tap(sel.x, sel.y); await W(300);
  await ev(() => [...document.querySelectorAll('#iAct button')].find(b => b.textContent === 'Rodar').click()); await W(300);
  const st = id => ev(id => { const e = G.inv.bag.list.find(e => e.it.id === id); if (!e) return 'fora'; const el = document.querySelector(`[data-src="bag:${id}"]`); return e.x + ',' + e.y + ' r=' + !!e.it.r + ' caixa=' + el.offsetWidth + 'x' + el.offsetHeight + (el.classList.contains('rot') ? ' rot' : ''); }, id);
  console.log('depois de Rodar:', await st(sel.id));
  await shot('inv-rodado');
  const cdp = await page.context().newCDPSession(page);
  const el = await ev(id => { const b = document.querySelector(`[data-src="bag:${id}"]`).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sel.id);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await T('touchStart', [{ x: el.x, y: el.y, id: 1 }]); for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: el.x + i * 2, y: el.y + i * 2, id: 1 }]); await W(30); }
  await T('touchStart', [{ x: el.x + 12, y: el.y + 12, id: 1 }, { x: 30, y: 300, id: 2 }]); await W(60); await T('touchEnd', [{ x: el.x + 12, y: el.y + 12, id: 1 }]); await W(80);
  console.log('2.º dedo durante o arrasto:', await ev(id => { const g = document.getElementById('dragG'); return 'r=' + !!G.inv.all().find(i => i.id === id).r + ' fantasma=' + g.className + ' ' + g.style.width + 'x' + g.style.height; }, sel.id));
  await T('touchEnd', []); await W(300);
  console.log('largado:', await st(sel.id));
};
