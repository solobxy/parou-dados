// interface: capturas e medição de cada ecrã (alvos de toque pequenos, botões tapados, fora do ecrã, texto cortado)
module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const only = process.env.SCR ? process.env.SCR.split(',') : null, want = s => !only || only.includes(s);
  // medição: tudo o que se toca, à vista
  const audit = name => ev(name => {
    const MIN = 40, out = { small: [], covered: [], off: [], cut: [] };
    const sel = 'button, a[href], input, select, [data-tab], .slot, .item, .hb, [role=button], .rec, .bm, #mm, .tg, .chip';
    const vis = el => { if (el.closest('[hidden]')) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || cs.pointerEvents === 'none') return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
    const nm = el => (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (el.dataset && el.dataset.tab ? '[' + el.dataset.tab + ']' : '') + ((el.textContent || el.getAttribute('aria-label') || '').trim() ? ' «' + (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 18) + '»' : '');
    const ovs = [...document.querySelectorAll('.ov')].filter(o => !o.hidden && getComputedStyle(o).display !== 'none'), top = ovs[ovs.length - 1] || null;
    for (const el of (top || document).querySelectorAll(sel)) {
      if (!vis(el)) continue; if (el.parentElement && el.parentElement.closest(sel) && !el.matches('.item')) continue;
      const r = el.getBoundingClientRect();
      if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
      if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.off.push(nm(el) + ` ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      if (Math.min(r.width, r.height) < MIN && !el.matches('.item')) out.small.push(nm(el) + ` ${Math.round(r.width)}×${Math.round(r.height)}`);
      // tapado: o ponto do meio (e mais 2) não cai neste elemento
      let hidden = 0, by = null; for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.35], [0.7, 0.65]]) { const x = r.left + r.width * fx, y = r.top + r.height * fy; if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue; const t = document.elementFromPoint(x, y); if (t && t !== el && !el.contains(t) && !t.contains(el)) { hidden++; by = t; } }
      if (hidden >= 2) out.covered.push(nm(el) + ' ← ' + nm(by));
    }
    for (const el of document.querySelectorAll('button, .ph span, .lb, .nm, label, b, h2, h3')) { if (!vis(el)) continue; const cs = getComputedStyle(el); if (cs.overflow === 'visible' && cs.textOverflow !== 'ellipsis') continue; if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) out.cut.push(nm(el)); }
    return { name, vw: innerWidth, vh: innerHeight, ...out };
  }, name);
  const rep = r => { const L = []; for (const k of ['small', 'covered', 'off', 'cut']) if (r[k].length) L.push(`  ${k} (${r[k].length}): ` + r[k].slice(0, 14).join(' | ')); console.log(`== ${r.name} ${r.vw}×${r.vh}: ${L.length ? '' : 'sem problemas'}`); L.forEach(l => console.log(l)); };
  const doShot = async (name) => { await shot('ui-' + name); rep(await audit(name)); };
  if (want('start')) { await W(1500); await doShot('menu'); }
  await ev(() => G.dbgKit()); await W(3000);
  // um pouco de loot para ver a mochila cheia e uma caixa aberta
  await ev(() => { for (const k of ['madeira', 'pedraR', 'metal', 'ligadura', 'agua', 'lata']) G.inv.give(G.dbg.item(k, k === 'madeira' ? 80 : 3)); });
  if (want('hud')) { await doShot('hud'); await ev(() => G.aimStart()); await W(1500); await doShot('hud-mira'); await ev(() => G.aimEnd()); await W(400); }
  if (want('inv')) {
    const box = await ev(async () => { const sl = ms => new Promise(r => setTimeout(r, ms)); const p = G.p; let best = null, bd = 1e9; for (const c of G.W.containers) { if ((c.lv || 0) !== 0) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } } if (!best) return null; p.x = best.x + 0.6; p.z = best.z + 0.6; await sl(1200); G.prompt = best; G.interact(); await sl(1500); return best.label; });
    console.log('caixa:', box); await W(800); await doShot('inv');
    await ev(() => { const el = document.querySelector('#gBag .item'); if (el) { const r = el.getBoundingClientRect(); const o = { bubbles: true, clientX: r.left + 8, clientY: r.top + 8, pointerId: 1, pointerType: 'touch', isPrimary: true }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); } }); await W(700); await doShot('inv-sel');
    await ev(() => { const el = document.querySelector('#beltI .slot'); if (el) { const r = el.getBoundingClientRect(); const o = { bubbles: true, clientX: r.left + 10, clientY: r.top + 10, pointerId: 1, pointerType: 'touch', isPrimary: true }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); } }); await W(700); await doShot('inv-arma');
    await ev(() => document.querySelector('#inv .tabs [data-tab=craft]').click()); await W(700); await doShot('inv-fabrico');
    await ev(() => document.querySelector('#inv .tabs [data-tab=skills]').click()); await W(700); await doShot('inv-treino');
    await ev(() => G.ui.closeInv()); await W(500);
  }
  if (want('build')) { await ev(() => { G.inv.belt[5] = G.dbg.item('planta', 1); G.sel = 5; }); await W(1200); await doShot('construir'); await ev(() => { G.sel = 0; }); await W(300); }
  if (want('map')) { await ev(() => G.ui.toggleMap()); await W(900); await doShot('mapa'); await ev(() => G.ui.toggleMap()); await W(400); }
  if (want('set')) { await ev(() => document.getElementById('bSet').click()); await W(900); await doShot('definicoes'); await ev(() => document.getElementById('setClose').click()); await W(400); }
  if (want('dead')) { await ev(() => G.dbg.hurt(500, 'zombie')); await W(3500); await doShot('morte'); }
};
