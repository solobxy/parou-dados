// auditoria de todos os menus: sem scroll na página, sem scroll dentro, botões dentro do ecrã e não tapados
// KG_SAFE=1 simula entalhe e barra de gestos (áreas seguras)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.waitForFunction('window.__ready === true', { timeout: 120000 }).catch(() => { }); await W(2500);
  if (process.env.KG_SAFE) await ev(() => { const P = innerHeight > innerWidth, s = document.documentElement.style; if (P) { s.setProperty('--st', '47px'); s.setProperty('--sb', '34px'); } else { s.setProperty('--sl', '47px'); s.setProperty('--sr', '47px'); s.setProperty('--sb', '21px'); } });
  const chk = (nm, root) => ev(([nm, root]) => { const vw = innerWidth, vh = innerHeight, de = document.documentElement, out = [], R = document.querySelector(root);
    if (!R || R.hidden || R.offsetParent === null && getComputedStyle(R).position !== 'fixed') return nm + ': (não aberto)';
    if (de.scrollWidth > vw + 1 || de.scrollHeight > vh + 1 || document.body.scrollHeight > vh + 1) out.push('página com scroll ' + de.scrollWidth + 'x' + de.scrollHeight);
    const sl = parseFloat(getComputedStyle(de).getPropertyValue('--sl')) || 0, sr = parseFloat(getComputedStyle(de).getPropertyValue('--sr')) || 0, st = parseFloat(getComputedStyle(de).getPropertyValue('--st')) || 0, sb = parseFloat(getComputedStyle(de).getPropertyValue('--sb')) || 0;
    const vis = e => { if (e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return false; const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
    for (const e of [R, ...R.querySelectorAll('*')]) { if (!vis(e)) continue; const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2)) out.push('scroll dentro: ' + (e.id || e.className || e.tagName) + ' ' + e.scrollHeight + '/' + e.clientHeight); }
    for (const b of R.querySelectorAll('button, input, select, [role=button], a')) { if (!vis(b)) continue; const r = b.getBoundingClientRect(); const id = b.id || b.dataset.tab || b.textContent.trim().slice(0, 18) || b.getAttribute('aria-label');
      if (r.left < sl - 1 || r.top < st - 1 || r.right > vw - sr + 1 || r.bottom > vh - sb + 1) { out.push('fora: ' + id + ' [' + [r.left, r.top, r.right, r.bottom].map(Math.round) + ']'); continue; }
      let cl = b.parentElement; let clipped = false; while (cl && cl !== document.body) { const cs = getComputedStyle(cl); if (cs.overflow !== 'visible') { const q = cl.getBoundingClientRect(); if (r.bottom > q.bottom + 1 || r.right > q.right + 1 || r.top < q.top - 1 || r.left < q.left - 1) { clipped = true; break; } } cl = cl.parentElement; }
      if (clipped) { out.push('cortado: ' + id); continue; }
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!t || !(b === t || b.contains(t))) out.push('tapado: ' + id + ' por ' + (t ? t.id || t.className || t.tagName : '-'));
      if (Math.min(r.width, r.height) < 24) out.push('pequeno: ' + id + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }
    return nm + ': ' + (out.length ? [...new Set(out)].join(' | ') : 'ok'); }, [nm, root]);
  const step = async (nm, root, open, close, arg) => { try { const r = await ev(open, arg); if (r !== undefined) console.log(nm, 'abrir ->', JSON.stringify(r)); } catch (e) { console.log(nm + ': erro ao abrir ' + e.message); return; } await W(700); console.log(await chk(nm, root)); await shot('au-' + nm); if (close) await ev(close).catch(() => { }); await W(250); };
  await ev(() => { G.ui.toMenu(); }); await W(500);
  await step('inicio', '#start', () => { document.getElementById('start').hidden = false; });
  await step('opcoes', '#set', () => document.getElementById('sSet').click(), () => { document.getElementById('set').hidden = true; });
  for (const [nm, id] of [['aspeto', 'pfL'], ['cla', 'pfC'], ['conta', 'pfA']]) await step(nm, '#pfm', id => { const b = document.getElementById(id); if (!b) throw new Error('sem ' + id); b.click(); }, () => { document.getElementById('pfm').hidden = true; }, id);
  await ev(() => { document.getElementById('start').hidden = true; G.ui.showHUD && 0; });
  await ev(() => { const p = document.getElementById('sPlay'); p && p.click(); }); await W(2500); await ev(() => { document.getElementById('intro').hidden = true; });
  await step('hud', '#hud', () => { document.getElementById('hud').hidden = false; });
  console.log('hud sobreposições:', await ev(() => { const L = [...document.querySelectorAll('#hud button, #touch button, #mm, #vit, #cmp, #belt, #ammo, #zone, #fps, #feed')].filter(e => { if (e.hidden) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.width < innerWidth * 0.9; });
    const out = []; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i], b = L[j]; if (a.contains(b) || b.contains(a)) continue; const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); const w = Math.min(A.right, B.right) - Math.max(A.left, B.left), h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top); if (w > 2 && h > 2 && !(a.closest('#belt') && b.closest('#belt'))) out.push((a.id || a.className) + '×' + (b.id || b.className)); }
    const off = L.filter(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1; }).map(e => e.id || e.className);
    return (out.join(', ') || 'nenhuma') + (off.length ? ' · fora do ecrã: ' + off.join(', ') : ''); }));
  await ev(() => { const I = G.inv; for (const k of 'pedra machado picareta lanca faca pistola m4 cacadeira a9 a556 a762 ligadura medkit lata onigiri agua chocolate iene tecido couro madeira enxofre metal carvao polvora granada gasolina planta fechadura martelo lanterna mochila'.split(' ')) try { I.give({ k, n: k === 'madeira' || k === 'metal' ? 200 : 3 }); } catch (e) { } });
  for (const tb of ['inv', 'craft', 'skills']) await step('inv-' + tb, '#inv', tb => { G.ui.openInv(); const b = document.querySelector('#inv .tabs [data-tab="' + tb + '"]'); b && b.click(); }, null, tb);
  await ev(() => G.ui.closeInv());
  await step('mapa', '#map', () => G.ui.toggleMap(), () => G.ui.toggleMap());
  await step('sair', '#quit', () => G.ui.quitTick(3), () => G.ui.quitTick(-1));
  await step('morte', '#dead', () => G.ui.death({ cause: 'zombie', time: 734, kills: 12 }), () => G.ui.closeDeath());
  await step('semrede', '#netLost', () => { document.getElementById('netLost').hidden = false; }, () => { document.getElementById('netLost').hidden = true; });
  await step('admin', '#adm', () => { G.net.role = 'admin'; G.ui.admOpen(); }, () => { document.getElementById('adm').hidden = true; });
  await step('class', '#lbw', () => { G.net.on = true; G.ui.lbOpen(); }, () => { document.getElementById('lbw').hidden = true; });
  await step('trocas', '#trw', () => { const T = G.TR.TRADERS[0], N = G.npcs.find(n => n.T === T); if (N) { G.p.x = N.x + 1; G.p.z = N.z; } G.ui.trOpen(T); return [document.getElementById('trw').hidden, getComputedStyle(document.getElementById('trw')).display]; }, () => G.ui.trClose());
  await step('editorhud', '#hedit', () => { document.getElementById('hedit').hidden = false; }, () => { document.getElementById('hedit').hidden = true; });
};
