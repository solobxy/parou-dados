// listas sem scroll: o que não cabe passa para páginas, com setas, número da página, deslizar o dedo e a roda do rato
// box: o contentor (fica com altura fixa pelo layout); sel: os itens a repartir (podem estar dentro de grupos)
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export function pager(box, sel, o = {}) {
  if (box._pg) return box._pg;
  box.classList.add('pgbox');
  const bar = document.createElement('div'); bar.className = 'pgbar'; bar.hidden = true;
  bar.innerHTML = '<button type="button" class="pgp" aria-label="Página anterior"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button><span class="pgn"></span><button type="button" class="pgx2" aria-label="Página seguinte"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
  (o.barIn || box.parentNode).insertBefore(bar, o.barIn ? null : box.nextSibling);
  const [bP, lab, bN] = bar.children;
  let pages = [], p = 0, busy = false, dir = 0;
  const items = () => [...box.querySelectorAll(sel)].filter(e => !e.hidden);
  const conts = it => { const s = new Set(); for (const e of it) { let a = e.parentElement; while (a && a !== box) { s.add(a); a = a.parentElement; } } return [...s]; };
  const sync = (C, it) => { for (const c of C) c.classList.toggle('pgx', !it.some(e => !e.classList.contains('pgx') && c.contains(e))); };
  const fits = () => box.scrollHeight <= box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1;
  const show = (an) => { const it = items(), C = conts(it); for (const e of it) e.classList.add('pgx'); for (const e of pages[p] || []) e.classList.remove('pgx'); sync(C, it); box.scrollTop = 0;
    bar.hidden = pages.length < 2; lab.textContent = (p + 1) + ' / ' + pages.length; bP.disabled = p <= 0; bN.disabled = p >= pages.length - 1;
    if (an && !RM()) { box.classList.remove('pgin', 'pgl', 'pgr'); void box.offsetWidth; box.classList.add('pgin', dir < 0 ? 'pgl' : 'pgr'); } };
  const layout = () => {
    if (busy) return; busy = true;
    try {
      const it = items(), C = conts(it); for (const e of it) e.classList.remove('pgx'); sync(C, it); bar.hidden = true; box.scrollTop = 0;
      if (!box.clientHeight || fits() || it.length < 2) { pages = [it]; p = 0; bar.hidden = true; return; }
      bar.hidden = false; // a barra ocupa espaço: mede já com ela
      for (const e of it) e.classList.add('pgx'); sync(C, it);
      pages = []; let cur = [];
      for (const e of it) { e.classList.remove('pgx'); sync(C, it);
        if (cur.length && !fits()) { e.classList.add('pgx'); for (const c of cur) c.classList.add('pgx'); pages.push(cur); cur = [e]; e.classList.remove('pgx'); sync(C, it); }
        else cur.push(e); }
      if (cur.length) pages.push(cur);
      // um título não fica sozinho no fim de uma página
      for (let i = 0; i < pages.length - 1; i++) { const pg = pages[i]; while (pg.length > 1 && /^H\d$/.test(pg[pg.length - 1].tagName)) pages[i + 1].unshift(pg.pop()); }
      p = Math.min(p, pages.length - 1);
    } finally { show(false); busy = false; }
  };
  const go = d => { const q = Math.max(0, Math.min(pages.length - 1, p + d)); if (q === p) return; p = q; dir = d; show(true); try { o.onPage && o.onPage(p); } catch (e) { } };
  bP.onclick = e => { e.stopPropagation(); go(-1); }; bN.onclick = e => { e.stopPropagation(); go(1); };
  // deslizar o dedo para o lado muda de página (sem interferir com sliders nem com arrastar itens)
  let sx = 0, sy = 0, st = 0;
  box.addEventListener('pointerdown', e => { if (e.target.closest('input,[draggable=true],.slot,.item')) { st = 0; return; } sx = e.clientX; sy = e.clientY; st = 1; }, { passive: true });
  box.addEventListener('pointerup', e => { if (!st) return; st = 0; const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1); }, { passive: true });
  box.addEventListener('wheel', e => { if (pages.length < 2) return; e.preventDefault(); const t = performance.now(); if (t - (box._wt || 0) < 260) return; box._wt = t; go(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1); }, { passive: false });
  // volta a repartir quando o conteúdo ou o tamanho mudam
  let raf = 0; const later = () => { if (busy) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); };
  new MutationObserver(m => { if (m.some(r => r.type === 'childList' || r.attributeName === 'hidden')) later(); }).observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  new ResizeObserver(later).observe(box.parentNode);
  box._pg = { layout, go, first: () => { p = 0; later(); }, get page() { return p; }, get pages() { return pages.length; } };
  return box._pg;
}
// ecrãs que não são listas: se não couber, tira por ordem o que é menos importante (ajuda, rodapé, subtítulos) até caber
export function fitDrop(box, drops, inner) {
  const over = () => { const b = inner ? inner() : box; return b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1; };
  const run = () => { if (box.hidden) return; for (const e of box.querySelectorAll('.fitx')) e.classList.remove('fitx');
    for (const s of drops) { if (!over()) return; for (const e of box.querySelectorAll(s)) e.classList.add('fitx'); } };
  let raf = 0; const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); };
  new MutationObserver(m => { if (m.some(r => r.type === 'childList' || r.target === box)) later(); }).observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  addEventListener('resize', later); new ResizeObserver(later).observe(box);
  return run;
}
