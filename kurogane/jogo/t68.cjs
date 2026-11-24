// fase 1: vida volta com comida/água, pilhas novas, clarão de dano por cima do inventário, Enter no campo do clã
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2000);
  // 1) regeneração
  const a = await ev(async () => { const sl = ms => new Promise(r => setTimeout(r, ms)), p = G.p;
    for (const z of G.zs) z.x += 5000;
    Object.assign(p, { hp: 50, food: 90, water: 90, bleed: 0, hitAt: -99 }); const t0 = G.t, h0 = p.hp, f0 = p.food, w0 = p.water;
    await sl(6000); const dt = G.t - t0;
    return { dt: +dt.toFixed(2), dhp: +(p.hp - h0).toFixed(2), dfood: +(p.food - f0).toFixed(2), dwater: +(p.water - w0).toFixed(2), regen: p.regen };
  });
  console.log('regen:', JSON.stringify(a), a.dhp > 0 && a.dfood < 0 ? 'OK' : 'FALHA');
  const b = await ev(async () => { const sl = ms => new Promise(r => setTimeout(r, ms)), p = G.p; p.hp = 60; G.dbg.hurt(1); const h = p.hp; await sl(2500); return { parou: p.hp <= h + 0.01, regen: p.regen }; });
  console.log('logo após dano:', JSON.stringify(b), b.parou ? 'OK parado' : 'FALHA');
  const c = await ev(async () => { const sl = ms => new Promise(r => setTimeout(r, ms)), p = G.p; Object.assign(p, { hp: 60, food: 15, water: 90, hitAt: -99 }); const h = p.hp; await sl(2500); return { hp: +(p.hp - h).toFixed(2) }; });
  console.log('com fome:', JSON.stringify(c), c.hp <= 0.01 ? 'OK não cura' : 'FALHA');
  // 2) pilhas
  const d = await ev(() => { const I = G.inv, before = I.bag.list.length; const mk = (k, n) => G.dbg.item(k, n);
    const out = {}; for (const [k, n] of [['ligadura', 30], ['lata', 10], ['a9', 120], ['c12', 120]]) { const it = mk(k, n); const left = I.give(it); out[k] = { left, cnt: I.count(k) }; }
    const big = mk('a9', 130); I.give(big); out.a9mais = I.bag.list.filter(e => e.it.k === 'a9').map(e => e.it.n);
    G.ui.refresh(true); return { before, after: I.bag.list.length, out };
  });
  console.log('pilhas:', JSON.stringify(d));
  // 3) clarão por cima do inventário aberto
  await ev(() => G.ui.openInv && G.ui.openInv()); await W(800);
  const e = await ev(() => { G.ui.damage(); const el = document.getElementById('dmg'), r = el.getBoundingClientRect(), top = document.elementFromPoint(6, innerHeight / 2); const cs = getComputedStyle(el); return { z: cs.zIndex, op: cs.opacity, pe: cs.pointerEvents, w: Math.round(r.width), topId: top && (top.id || top.className) }; });
  console.log('clarão:', JSON.stringify(e), +e.op > 0.5 && e.pe === 'none' ? 'OK visível e não bloqueia' : 'FALHA');
  await shot('clarao-inventario'); await W(900);
  await ev(() => G.ui.closeInv && G.ui.closeInv()); await W(400);
};
