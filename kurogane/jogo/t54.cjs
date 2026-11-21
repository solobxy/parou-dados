module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
  await W(1500);
  console.log('links:', await ev(() => [...document.querySelectorAll('#prof button')].map(b => b.textContent).join(' | ')));
  await page.click('#pfA'); await W(600); await shot('aparencia-1');
  // escolher: pele escura, cabelo ruivo comprido, sem barba, camisola vermelha
  await ev(() => { const O = G.LOOK_OPTS; const click = (k, v) => { const b = document.querySelector(`#pfB [data-k="${k}"][data-${v.i !== undefined ? 'i' : 'v'}="${v.i ?? v.v}"]`); b.click(); }; click('skin', { v: O.skin[4] }); click('hair', { v: O.hair[5] }); click('hairS', { i: 2 }); click('beardS', { i: 0 }); click('top', { v: O.top[7] }); });
  await W(400); await shot('aparencia-2');
  await page.click('#lkOk'); await W(500);
  console.log('guardado:', await ev(() => JSON.stringify(JSON.parse(localStorage.getItem('kg.perfis')).lista[0].look)));
  await page.evaluate(() => G.dbgKit()); await W(2500); await shot('aparencia-jogo');
  await page.click('#bInv'); await W(800); await shot('aparencia-inv');
};
