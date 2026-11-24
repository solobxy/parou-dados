// teclado do telemóvel aberto: o botão «Entrar no clã» fica à vista e o Enter carrega nele
module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2000);
  await ev(() => { G.net.on = true; G.net.clanCmd = () => {}; G.ui.toggleMap(); }); await W(600);
  await page.click('#mClan'); await W(600);
  const vp = page.viewportSize(), kb = mode === 'portrait' ? [390, 430] : [844, 170]; // o que sobra com o teclado aberto
  await page.setViewportSize({ width: kb[0], height: kb[1] }); await W(400);
  await page.focus('#clC'); await page.keyboard.type('AB'); await W(700);
  const r = await ev(() => { const b = document.getElementById('clIn').getBoundingClientRect(), i = document.getElementById('clC').getBoundingClientRect(); return { btn: [Math.round(b.top), Math.round(b.bottom)], inp: [Math.round(i.top), Math.round(i.bottom)], h: innerHeight }; });
  console.log('com teclado:', JSON.stringify(r), r.btn[0] >= 0 && r.btn[1] <= r.h && r.inp[0] >= 0 ? 'OK botão e campo à vista' : 'FALHA tapado');
  await shot('teclado-cla');
  await page.keyboard.press('Enter'); await W(300);
  console.log('Enter →', JSON.stringify(await ev(() => document.getElementById('clM') && document.getElementById('clM').textContent)));
  await page.setViewportSize(vp);
};
