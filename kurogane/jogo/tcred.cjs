module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1200);
  await page.click('#bSet'); await W(600);
  await ev(() => { const el = document.querySelector('#set .sbody, #set') ; const sc = [...document.querySelectorAll('#set *')].find(e => e.scrollHeight > e.clientHeight + 20); if (sc) sc.scrollTop = 1e6; }); await W(400);
  console.log('créditos:', await ev(() => [...document.querySelectorAll('.srow b')].some(b => b.textContent === 'Sons de animais')));
  await shot('creditos');
};
