// explosão com bola de fogo e fumo (de noite), e passado uns segundos desaparece
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const GT = async s => { const t0 = await ev(() => G.t); while ((await ev(() => G.t)) - t0 < s) await W(150); };
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { G.p.x = 300; G.p.z = 300; for (const z of G.zs) { z.x += 900; } G.cyc = 1710; document.getElementById('toast').hidden = true; }); await GT(1);
  await ev(() => G.explodeAt('gran', 306, 300)); await GT(0.25); await shot('boom-0'); await GT(0.8); await shot('boom-1'); await GT(5); await shot('boom-5');
  console.log('erros:', errs.length ? errs : 'nenhum', 'hp', await ev(() => Math.round(G.p.hp)));
};
