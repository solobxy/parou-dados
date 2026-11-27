// botão para desligar a visão noturna: aparece com os óculos, desliga e volta a ligar
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await ev(() => G.dbgKit()); await W(1000);
  console.log('sem óculos, botão escondido:', await ev(() => document.getElementById('tNv').hidden));
  await ev(() => { G.inv.eq.eyes = G.mkItem('nvg'); G.refresh && G.refresh(); G.cyc = 1700; }); await W(2500);
  const st = () => ev(() => [!document.getElementById('tNv').hidden, document.getElementById('tNv').classList.contains('on'), G.dbgCanvas.classList.contains('nvg')]);
  console.log('com óculos à noite [botão, ligado, verde]:', JSON.stringify(await st())); await shot('nv-on');
  const r = await ev(() => { const b = document.getElementById('tNv').getBoundingClientRect(), l = document.getElementById('tLight').getBoundingClientRect(); return [b.x, b.y, b.width, l.x, l.y, innerWidth, innerHeight]; }); console.log('posição', JSON.stringify(r.map(Math.round)));
  await page.click('#tNv'); await W(1500); console.log('depois de tocar:', JSON.stringify(await st())); await shot('nv-off');
  await page.click('#tNv'); await W(1500); console.log('a voltar a ligar:', JSON.stringify(await st()));
};
