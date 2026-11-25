// menu inicial: sem «Começar de novo»; botão Arena
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(1500); await shot('menu0');
  console.log('sem jogo:', await ev(() => [...document.querySelectorAll('#start .menu button')].filter(b => !b.hidden).map(b => b.querySelector('b').textContent).join(' | ')));
  await ev(() => G.dbgKit()); await W(2500); await ev(() => G.ui.toMenu()); await W(1200);
  console.log('com jogo:', await ev(() => [...document.querySelectorAll('#start .menu button')].filter(b => !b.hidden).map(b => b.querySelector('b').textContent).join(' | ')));
  await ev(() => document.getElementById('sArena').click()); await W(400); await shot('menu1');
  console.log('aviso:', await ev(() => document.getElementById('mnote').textContent));
};
