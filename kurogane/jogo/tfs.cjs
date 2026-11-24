module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2500);
  await ev(() => document.getElementById('bSet').click()); await W(800); await shot('fs-antes');
  const r1 = await ev(() => { const b = [...document.querySelectorAll('#setBody .sgrp')][0]; return b ? b.textContent.slice(0, 160) : null; }); console.log('1.º grupo:', r1);
  await page.click('#setBody .sgrp .btn'); await W(1200);
  console.log('em ecrã inteiro:', await ev(() => !!document.fullscreenElement), '·', await ev(() => [...document.querySelectorAll('#setBody .sgrp')][0].textContent.slice(0, 80)));
  await shot('fs-depois');
  await page.click('#setBody .sgrp .btn'); await W(1000); console.log('depois de sair:', await ev(() => !!document.fullscreenElement));
};
