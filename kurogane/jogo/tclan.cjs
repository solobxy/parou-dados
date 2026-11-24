module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2500);
  await ev(() => G.ui.toggleMap()); await W(800);
  const b = await ev(() => { const e = document.getElementById('mClan'), r = e.getBoundingClientRect(); return { vis: !e.hidden && r.width > 0, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }; });
  console.log('botão Clã no mapa:', JSON.stringify(b)); await shot('mapa-cla');
  await page.click('#mClan'); await W(700); console.log('janela:', await ev(() => [!document.getElementById('pfm').hidden, document.getElementById('pfT').textContent, document.getElementById('pfB').textContent.slice(0, 90)]));
  await shot('cla-janela');
  await ev(() => document.getElementById('pfX').click()); await W(300); await ev(() => G.ui.toggleMap()); await W(300);
  await ev(() => document.getElementById('bSet').click()); await W(700); console.log('ecrã inteiro nas definições:', await ev(() => [...document.querySelectorAll('#setBody .sgrp')][0].textContent.slice(0, 40)));
};
