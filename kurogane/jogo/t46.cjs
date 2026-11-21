const base = require('./t44.cjs');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await base(page, async () => {});
  await ev(() => { const d = G.base.deps.find(d => d.k === 'bancada1'); G.p.x = d.x + 1.2; G.p.z = d.z; G.p.lv = 0; });
  await W(500);
  console.log('prompt:', await ev(() => G.prompt ? G.prompt.label : 'nenhum'));
  await ev(() => { const d = G.base.deps.find(d => d.k === 'bancada1'); G.interact.call(null); }); await W(200);
  await ev(() => { if (!G.invOpen) G.ui.openInv(null, 'craft'); }); await W(700);
  console.log('receitas visíveis:', await ev(() => [...document.querySelectorAll('#recipes .rhead')].map(h => h.textContent).join(' | ')));
  console.log('pistola fabricável:', await ev(() => { const rows = [...document.querySelectorAll('#recipes .recipe')]; const r = rows.find(r => r.textContent.includes('Pistola 9 mm')); const b = r.querySelector('button'); return b.textContent + ' disabled=' + b.disabled; }));
  await ev(() => { const rows = [...document.querySelectorAll('#recipes .recipe')]; rows.find(r => r.textContent.includes('Pistola 9 mm')).scrollIntoView({ block: 'center' }); }); await W(300);
  await shot('craft');
  await ev(() => G.ui.closeInv && G.ui.closeInv()); await W(300);
  // saco-cama fora e morrer
  console.log('saco:', await ev(() => { const P = [...G.base.pieces.values()].find(q => q.t === 'fund'); G.p.x = P.i * 3 + 1.5; G.p.z = P.j * 3 - 3; G.p.yaw = G.p.root = Math.PI; return G.base.deploy({ id: 7e5, k: 'saco', n: 1 }) + ' spawn=' + !!G.base.spawn; }));
  await ev(() => { G.p.hp = 1; G.dbg.hurt(50); }); await W(4500);
  console.log('morte:', await ev(() => 'dBed visível=' + !document.getElementById('dBed').hidden));
  await shot('morte');
  await ev(() => document.getElementById('dBed').click()); await W(800);
  console.log('renasceu:', await ev(() => { const s = G.base.spawn; return 'dist ao saco=' + Math.hypot(G.p.x - s.x, G.p.z - s.z).toFixed(2) + ' vivo=' + G.p.alive; }));
};
