// opacidade do ecrã: só os botões ficam transparentes; vida, fome, sede, flash de dano e hitmarker a 100%
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(1500);
  await ev(() => { const c = JSON.parse(localStorage.getItem('kurogane-cfg-v1')); c.op = 0.35; c.ts = Date.now() + 9000; localStorage.setItem('kurogane-cfg-v1', JSON.stringify(c)); G.ui.cfgCloud(); });
  await W(600);
  const r = await ev(() => { const o = id => { const e = document.getElementById(id) || document.querySelector(id); if (!e) return 'nao-ha'; let a = 1; for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); a *= +cs.opacity; const m = /opacity\(([\d.]+)\)/.exec(cs.filter); if (m) a *= +m[1]; } return +a.toFixed(2); }; return { vida: o('vit'), botaoFogo: o('tFire'), cinto: o('belt'), hit: o('hm'), mira: o('xh'), dano: o('dmg') }; });
  console.log(JSON.stringify(r));
  await ev(() => G.ui.damage(40, 2)); await W(150); await shot('opacidade-35');
};
