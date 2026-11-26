// inventário: nomes por cima dos desenhos, encaixes das armas e armas onde serve o acessório escolhido
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { const I = G.inv; const m = G.mkItem('m4'); m.att = { sup: null, scope: 'reddot' }; m.ammo = 30; I.give(m); I.give(G.mkItem('mira4')); I.give(G.mkItem('cacadeira')); G.ui.refresh(true); G.ui.openInv(null); }); await W(1200); await shot('inv2');
  // escolher a mira 4x: as armas onde serve ficam marcadas
  await ev(() => { const e = G.inv.bag.list.find(e => e.it.k === 'mira4'); const el = document.querySelector(`[data-src="bag:${e.it.id}"]`); const r = el.getBoundingClientRect(); const o = { bubbles: true, clientX: r.x + 5, clientY: r.y + 5, pointerId: 7, isPrimary: true, pointerType: 'touch' }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); }); await W(800);
  console.log('marcadas:', await ev(() => document.querySelectorAll('.fit').length), 'botões:', await ev(() => [...document.querySelectorAll('#inv .btn.sm')].map(b => b.textContent).join(' | ')));
  await shot('inv2-mira');
};
