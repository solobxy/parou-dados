// avisos e botões: nada por cima de nada, em todos os ecrãs
module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.click('#sKit'); await W(1200);
  await ev(() => { for (const z of G.zs) { z.x = z.hx = 440; z.z = z.hz = 440; } let b = null, bd = 1e9; for (const c of G.W.containers) { if (c.lv) continue; const d = Math.hypot(c.x - G.p.x, c.z - G.p.z); if (d < bd) { bd = d; b = c; } } G.p.x = b.x + 0.9; G.p.z = b.z; });
  await W(1500);
  await ev(() => { G.ui.toast('Inventário cheio: ficou no chão. Mais um aviso comprido para testar.'); G.gain('madeira', 5); G.gain('pedraR', 3); G.gain('a556', 10); G.aimStart(); });
  await W(1500); await shot('f0-avisos');
  const r = await ev(() => { const sel = ['#toast', '#feed .fd', '#tUse', '#quit', '#prompt']; const hud = [...document.querySelectorAll('#hud .tb, #belt, #vit, #ammo, #mm, #tl, #tr, #zone, #toast, #feed .fd')]; const vis = e => e && !e.hidden && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none' && !e.closest('[hidden]');
    const out = []; for (const s of sel) for (const a of document.querySelectorAll(s)) { if (!vis(a)) continue; const A = a.getBoundingClientRect(); for (const h of hud) { if (!vis(h) || h === a || h.contains(a) || a.contains(h)) continue; const B = h.getBoundingClientRect(); if (A.left < B.right - 2 && B.left < A.right - 2 && A.top < B.bottom - 2 && B.top < A.bottom - 2) out.push(s + '×' + (h.id || h.className)); } }
    const shown = sel.filter(s => [...document.querySelectorAll(s)].some(vis)); return { shown, out }; });
  console.log(mode, JSON.stringify(r));
};
