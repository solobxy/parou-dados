// HUD em vários ecrãs: começar, levantar a arma com um zombie à frente, e a mira 4x
module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(500); await page.click('#sPlay'); await W(800);
  await ev(() => { const t = document.getElementById('toast'); t.hidden = true; const p = G.p; p.x = 2; p.z = 8; G.camT.set(p.x, 0, p.z); G.zs.length = 0; G.gain('m4', 1); G.gain('a556', 60); G.gain('mira4', 1); const i = G.inv.belt.findIndex(b => b && b.k === 'm4'); G.inv.belt[i].ammo = 30; G.select(i); p.yaw = p.aim = p.root = 0;
    for (const [dx, dz] of [[0.5, 5], [-3, 7.5], [4, -6]]) G.zs.push({ x: p.x + dx, z: p.z + dz, yaw: Math.PI, hp: 80, state: 'wander', tx: p.x + dx, tz: p.z + dz, think: 9, phase: 0, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 3, sc: 1, wT: 9, spd: 0, lv: 0, base: 0, y: 0.05 }); });
  await W(300); await ev(() => { G.fireDown(); G.fireUp(); }); await W(700);
  await ev(() => { const t = document.getElementById('toast'); t.hidden = true; });
  await shot('50-hud-mira');
  console.log(mode, 'view', JSON.stringify(G => 0) , await ev(() => JSON.stringify({ v: G.view, s: G.ui.safe(), r: G.ui.scopeR() })));
  // sobreposições: algum botão a tocar no círculo?
  console.log('overlap', await ev(() => { const V = G.view, out = []; for (const el of document.querySelectorAll('#hud [data-h], #hud .tb')) { if (el.hidden || getComputedStyle(el).visibility === 'hidden' || getComputedStyle(el).display === 'none') continue; const r = el.getBoundingClientRect(); if (!r.width) continue; const cx = Math.max(r.left, Math.min(V.cx, r.right)), cy = Math.max(r.top, Math.min(V.cy, r.bottom)); const d = Math.hypot((cx - V.cx) / V.rx, (cy - V.cy) / V.ry); if (d < 0.97) out.push((el.id || el.dataset.h) + ':' + d.toFixed(2)); } const ids = [...document.querySelectorAll('#hud .tb, #hud [data-h]')].filter(e => !e.hidden && e.getBoundingClientRect().width && getComputedStyle(e).visibility !== 'hidden'); const ov = []; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { if (ids[i].contains(ids[j]) || ids[j].contains(ids[i])) continue; const a = ids[i].getBoundingClientRect(), b = ids[j].getBoundingClientRect(); if (a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2) ov.push((ids[i].id || ids[i].dataset.h) + '×' + (ids[j].id || ids[j].dataset.h)); } return out.join(' ') + ' | ' + ov.join(' '); }));
  await ev(() => { const g = G.inv.belt[G.sel]; g.att.scope = 'mira4'; G.refresh(); G.scopeToggle(); }); await W(1500);
  await shot('51-mira4');
};
