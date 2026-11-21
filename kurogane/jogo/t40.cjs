module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.evaluate(() => G.dbgKit()); await W(1500);
  console.log('peso do kit:', await ev(() => JSON.stringify(G.load())), await ev(() => G.inv.all().map(it => it.k + 'x' + it.n).join(' ')));
  await page.click('#bInv'); await W(700);
  // pôr uma M4 na mochila e rodá-la pelo botão
  const r = await ev(() => { const it = G.inv.bag.list.find(e => e.it.k === 'medkit' || e.it.k === 'racao' || e.it.k === 'agua'); return it ? it.it.k + '@' + it.x + ',' + it.y + ' r=' + !!it.it.r : 'nada 2x1 na mochila'; });
  console.log('alvo:', r);
  const sel = await ev(() => { const e = G.inv.bag.list.find(e => { const it = e.it; return ['medkit', 'racao', 'agua'].includes(it.k); }); const el = document.querySelector(`[data-src="bag:${e.it.id}"]`); const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, id: e.it.id }; });
  await page.touchscreen.tap(sel.x, sel.y); await W(300);
  const btns = await ev(() => [...document.querySelectorAll('#iAct button')].map(b => b.textContent));
  console.log('ações:', btns.join(' | '));
  await ev(() => [...document.querySelectorAll('#iAct button')].find(b => b.textContent === 'Rodar').click()); await W(300);
  console.log('depois de rodar:', await ev(id => { const e = G.inv.bag.list.find(e => e.it.id === id); const el = document.querySelector(`[data-src="bag:${id}"]`); return e.x + ',' + e.y + ' r=' + !!e.it.r + ' caixa=' + el.offsetWidth + 'x' + el.offsetHeight + ' rot=' + el.classList.contains('rot'); }, sel.id));
  await shot('inv-rodado');
  // arrastar com um dedo e rodar com o outro (CDP touch)
  const cdp = await page.context().newCDPSession(page);
  const el = await ev(id => { const b = document.querySelector(`[data-src="bag:${id}"]`).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sel.id);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await T('touchStart', [{ x: el.x, y: el.y, id: 1 }]); for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: el.x + i * 4, y: el.y + i * 3, id: 1 }]); await W(30); }
  await T('touchStart', [{ x: el.x + 24, y: el.y + 18, id: 1 }, { x: 40, y: 60, id: 2 }]); await W(80); await T('touchEnd', [{ x: el.x + 24, y: el.y + 18, id: 1 }]); await W(80);
  console.log('a arrastar, rodado com 2.º dedo:', await ev(id => { const g = document.getElementById('dragG'); return 'r=' + !!G.inv.all().find(i => i.id === id).r + ' fantasma=' + g.className + ' ' + g.style.width + 'x' + g.style.height; }, sel.id));
  await T('touchEnd', []); await W(300);
  console.log('largado:', await ev(id => { const e = G.inv.bag.list.find(e => e.it.id === id); return e ? e.x + ',' + e.y + ' r=' + !!e.it.r : 'fora da mochila'; }, sel.id));
};
