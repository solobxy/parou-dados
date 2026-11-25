// sons reais: o banco carrega, os tiros, passos e ambiente tocam sem erros
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await ev(() => { G.audio.start(); }); await W(6000);
  console.log('gravações carregadas:', await ev(() => G.audio.count()));
  console.log('tem tiro-m4/passo/zombie/vento:', await ev(() => ['m4', 'passo-relva', 'zombie', 'vento', 'turbina'].map(k => G.audio.has(k))));
  await ev(() => { G.dbgKit && G.dbgKit(); }); await W(800);
  const r = await ev(() => { const o = []; for (const n of ['m4', 'pistola', 'grosso', 'grunhido']) o.push(G.audio.sample(n, 0.5)); o.push(G.audio.shot('ak', 1, 0.6)); G.audio.step('betao', 0.6); G.audio.ambience(1, false, 0.4); G.audio.engine(true, 10, false); G.audio.engine(true, 5, true); G.audio.engine(false, 0, true); return o; });
  console.log('tocou:', r); await W(1500);
  console.log('erros:', errs.length ? errs : 'nenhum');
};
