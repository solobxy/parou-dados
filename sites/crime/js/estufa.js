// A estufa (v120): erva feita à mão. Aqui só os desenhos e os movimentos; as regras e o tempo vêm do servidor.
// A planta é um SVG: vaso, terra, caule com três pares de folhas, o topo com os botões e duas folhas amarelas (a poda).
// O que se vê depende de três dados no <svg>: data-st (1 a 4, a fase), data-pw (há folhas amarelas para podar) e data-rd (pronta),
// e de duas variáveis: --gs (o tamanho da planta) e --bud (o tamanho dos botões). O resto é CSS.
// Com «menos movimento» ou «animações leves» não há baloiço nem voos: o resultado aparece logo.

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('light');
// o desenho inteiro (com o <svg>) passa pelo leitor de HTML, que põe cada elemento no espaço de nomes do SVG
const mk = (markup) => { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstElementChild; };
const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

// uma folha em leque (7 folíolos com a nervura ao meio), virada para cima, com a base em 0,0
const FOLIOLO = 'M0 0C2.2-3.6 3-10.5 0-18.5C-3-10.5-2.2-3.6 0 0Z';
const LEQUE = [[-78, 0.42], [-52, 0.66], [-26, 0.88], [0, 1], [26, 0.88], [52, 0.66], [78, 0.42]];
const leque = (x, y, ang, s, cls = 'lf') => `<g class="${cls}" transform="translate(${x} ${y}) rotate(${ang}) scale(${s})">` +
  LEQUE.map(([a, k]) => `<g transform="rotate(${a}) scale(${k})"><path d="${FOLIOLO}"/><path class="vn" d="M0-1V-15"/></g>`).join('') + '</g>';
// um cacho de flor: uma gota cheia de cálices pequenos (verde claro), resina branca e três pelinhos cor de laranja
const CALICES = [[0, -8.6, 1.5], [-1.4, -6, 1.7], [1.5, -5.6, 1.7], [-2.4, -2.8, 1.9], [0.3, -3.2, 1.9], [2.6, -2.2, 1.8], [-2.6, 0.8, 2],
  [0, 0.4, 2.1], [2.7, 1.2, 1.9], [-1.6, 3.8, 2], [1.6, 4, 2], [0, 6.4, 1.8]];
const cacho = (x, y, s) => `<g class="bd" transform="translate(${x} ${y}) scale(${s})">` +
  '<path class="bds" d="M-3 2.2L-7.6-1.4L-4.4 4ZM3 2.8L7.6-.6L4.4 4.6Z"/>' +
  '<path class="bdb" d="M0-10.6C3.4-8.6 4.9-3.6 4.6 1.4C4.3 5.6 2.4 8.6 0 9C-2.4 8.6-4.3 5.6-4.6 1.4C-4.9-3.6-3.4-8.6 0-10.6Z"/>' +
  CALICES.map(([cx, cy, r]) => `<circle class="bdk" cx="${cx}" cy="${cy}" r="${r}"/>`).join('') +
  '<path class="bdp" d="M-.8-9.6c-.4-1-1.1-1.5-1.9-1.6M2-4.4c.9-.4 1.7-.3 2.2.3M-2.8 2.4c-.9.1-1.5.6-1.7 1.4"/>' +
  '<g class="tri"><circle cx="-1.2" cy="-6.6" r=".45"/><circle cx="1.4" cy="-2.8" r=".5"/><circle cx="-2" cy="0" r=".45"/><circle cx="1.8" cy="2.4" r=".45"/><circle cx="-.6" cy="5.2" r=".5"/><circle cx=".6" cy="-.8" r=".35"/></g></g>';

// os degradês (vaso, terra, brilho de pronta) ficam uma vez só no documento
function defs() {
  if (document.getElementById('grDefs')) return;
  const d = mk(`<svg id="grDefs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <linearGradient id="grPot" x1="0" x2="1"><stop offset="0" stop-color="#a7643f"/><stop offset=".45" stop-color="#8a4c30"/><stop offset="1" stop-color="#5c2f1d"/></linearGradient>
    <linearGradient id="grRim" x1="0" x2="1"><stop offset="0" stop-color="#c27a52"/><stop offset=".5" stop-color="#a2603e"/><stop offset="1" stop-color="#7a4228"/></linearGradient>
    <radialGradient id="grSoil" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#3a281d"/><stop offset="1" stop-color="#1c120d"/></radialGradient>
    <radialGradient id="grGlow"><stop offset="0" stop-color="#46e08a" stop-opacity=".32"/><stop offset="1" stop-color="#46e08a" stop-opacity="0"/></radialGradient>
  </defs></svg>`);
  document.body.append(d);
}

export function plant() {
  defs();
  return mk(`<svg viewBox="0 0 80 96" class="gpl" aria-hidden="true">
    <ellipse class="glow" cx="40" cy="40" rx="38" ry="36"/>
    <g class="spr"><path class="stem" d="M40 70.5C40 66 40.3 62.5 40.2 59.5"/><ellipse cx="36.4" cy="58.6" rx="4.4" ry="2.2" transform="rotate(-22 36.4 58.6)"/><ellipse cx="44" cy="58.6" rx="4.4" ry="2.2" transform="rotate(22 44 58.6)"/></g>
    <path class="plus" d="M40 57v8M36 61h8"/>
    <g class="pl"><g class="sw">
      <path class="stem" d="M40 70C40 52 41 30 40.4 12"/>
      <g class="n n1">${leque(39.6, 60, -70, 1.15)}${leque(40.4, 60, 70, 1.15)}</g>
      <g class="n n2">${leque(39.8, 46, -60, 1.04)}${leque(40.6, 46, 60, 1.04)}</g>
      <g class="n n3">${leque(40, 32, -50, 0.9)}${leque(40.8, 32, 50, 0.9)}</g>
      <g class="tip">${leque(40.4, 16, 0, 0.55)}</g>
      <g class="yl">${leque(39, 66, -104, 1.25, 'ylf')}${leque(41, 62, 102, 1.2, 'ylf')}</g>
      <g class="cola">${cacho(28.5, 57, 0.5)}${cacho(52.5, 57, 0.5)}${cacho(30, 44, 0.58)}${cacho(51, 44, 0.58)}${cacho(33, 30, 0.62)}${cacho(48, 30, 0.62)}${cacho(40.4, 15, 1)}</g>
    </g></g>
    <path class="pot" d="M21.5 76H58.5L55 94H25Z"/>
    <rect class="rim" x="18" y="69.5" width="44" height="7" rx="1.6"/>
    <ellipse class="soil" cx="40" cy="70.4" rx="20.5" ry="2.8"/>
  </svg>`);
}

// a fase da planta a partir do crescimento em pontos-base (0 a 10 000)
export function setPlant(el, x, now, G, can = false) {
  const s = el.querySelector('svg.gpl') || el;
  s.dataset.can = !x && can ? '1' : '0';
  if (!x) { s.dataset.st = '0'; s.dataset.pw = '0'; s.dataset.rd = '0'; s.style.setProperty('--gs', '0'); s.style.setProperty('--bud', '0'); return { bp: -1 }; }
  const bp = Math.min(10000, Math.max(0, Math.floor(((now - x.t0) * 10000) / G.ms)));
  s.dataset.st = bp < 1500 ? '1' : bp < 3500 ? '2' : bp < 6500 ? '3' : '4';
  s.dataset.pw = !x.pr && bp >= G.pruneFrom && bp <= G.pruneTo ? '1' : '0';
  s.dataset.rd = bp >= 10000 ? '1' : '0';
  s.style.setProperty('--gs', (0.3 + (0.7 * bp) / 10000).toFixed(3));
  s.style.setProperty('--bud', Math.max(0, Math.min(1, (bp - 6500) / 3500)).toFixed(3));
  return { bp };
}

// ---------- os movimentos (numa camada por cima de tudo: o ecrã por baixo pode ser redesenhado entretanto) ----------
function layer(markup, x, y, w, hgt) {
  const el = document.createElement('div');
  el.className = 'grfx';
  el.style.cssText = `left:${x - w / 2}px;top:${y - hgt / 2}px;width:${w}px;height:${hgt}px`;
  el.append(mk(`<svg viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}">${markup}</svg>`));
  document.body.append(el);
  return el;
}
const SEMENTE = '<g transform="translate(9 9)"><path d="M0-7C4-5 5 1 0 7C-5 1-4-5 0-7Z" fill="#8a6a43" stroke="#4d3822" stroke-width="1"/><path d="M0-5V5" stroke="#d9c29a" stroke-width=".8" stroke-dasharray="1.5 1.5"/></g>';
export const seedSvg = () => mk(`<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">${SEMENTE}</svg>`);
// onde fica a terra de um vaso, no ecrã
const soilOf = (pot) => { const r = (pot.querySelector('svg.gpl') || pot).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + (r.height * 70) / 96 }; };
const topOf = (pot) => { const r = (pot.querySelector('svg.gpl') || pot).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + (r.height * 30) / 96 }; };

// a semente cai na terra; a terra levanta um bocadinho
export function sow(fromRect, pot) {
  if (reduced() || !pot) return Promise.resolve();
  const to = soilOf(pot), a = fromRect ? center(fromRect) : { x: to.x, y: to.y - 70 };
  const s = layer(SEMENTE, a.x, a.y, 18, 18);
  const an = s.animate([
    { transform: 'translate(0,0) rotate(0) scale(1.15)', opacity: 1 },
    { transform: `translate(${(to.x - a.x) * 0.55}px, ${Math.min(0, to.y - a.y) - 26}px) rotate(160deg) scale(1)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${to.x - a.x}px, ${to.y - a.y}px) rotate(320deg) scale(.5)`, opacity: 0.2 },
  ], { duration: 520, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' });
  return an.finished.then(() => { s.remove(); puff(to.x, to.y, '#4a3426', 5); }).catch(() => s.remove());
}
function puff(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const p = layer(`<circle cx="3" cy="3" r="${1.6 + (i % 2)}" fill="${color}"/>`, x, y, 6, 6), dx = (i - (n - 1) / 2) * 7, dy = -6 - (i % 3) * 4;
    p.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${dx}px,${dy}px)`, opacity: 0.9, offset: 0.5 }, { transform: `translate(${dx * 1.3}px,${dy + 10}px)`, opacity: 0 }],
      { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }).finished.then(() => p.remove(), () => p.remove());
  }
}

// a poda: as duas folhas amarelas caem, a rodar
export function prune(pot) {
  if (reduced() || !pot) return;
  const r = (pot.querySelector('svg.gpl') || pot).getBoundingClientRect(), k = r.width / 80;
  [[-1, 66, -104], [1, 62, 102]].forEach(([side, y, ang], i) => {
    const x = r.left + r.width / 2 + side * 12 * k, yy = r.top + y * k;
    const f = layer(`<g fill="#e2c23c" stroke="#8d6a1c" stroke-width=".5">${leque(20, 20, ang, k * 1.22, 'x').replace(/<path class="vn"[^>]*>/g, '')}</g>`, x, yy, 40, 40);
    f.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: `translate(${side * 16}px, 26px) rotate(${side * 40}deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${side * 6}px, 70px) rotate(${side * -30}deg)`, opacity: 0 },
    ], { duration: 900, delay: i * 90, easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'both' }).finished.then(() => f.remove(), () => f.remove());
  });
}

// a colheita: os botões saltam da planta para o saco
export function harvest(pot, bag, n = 6) {
  if (reduced() || !pot || !bag) return Promise.resolve();
  const a = topOf(pot), b = center(bag.getBoundingClientRect());
  const all = [];
  for (let i = 0; i < n; i++) {
    const p = layer(`<g class="grbud">${cacho(10, 12, 0.85)}</g>`, a.x + (i - n / 2) * 4, a.y + (i % 3) * 6, 20, 24);
    const sx = (i - (n - 1) / 2) * 16, sy = -34 - (i % 3) * 14;
    all.push(p.animate([
      { transform: 'translate(0,0) scale(.6)', opacity: 0 },
      { transform: `translate(${sx}px,${sy}px) scale(1.1)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${b.x - a.x - (i - n / 2) * 4}px,${b.y - a.y - (i % 3) * 6}px) scale(.35)`, opacity: 0.8 },
    ], { duration: 820, delay: i * 55, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' }).finished.then(() => p.remove(), () => p.remove()));
  }
  return Promise.all(all);
}

// arrastar uma semente do saquinho para um vaso vazio; tocar no saquinho e depois no vaso também serve
export function dragSeed(pack, { empty, onDrop, onPick }) {
  let st = null, skip = false;
  pack.addEventListener('click', () => { if (skip) { skip = false; return; } onPick(); });
  const potAt = (x, y) => empty().find((p) => { const r = p.getBoundingClientRect(); return x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6; });
  const mark = (p) => empty().forEach((q) => q.classList.toggle('over', q === p));
  pack.addEventListener('pointerdown', (e) => {
    if (pack.disabled) return;
    e.preventDefault(); pack.setPointerCapture(e.pointerId);
    st = { x: e.clientX, y: e.clientY, moved: false, g: null };
  });
  pack.addEventListener('pointermove', (e) => {
    if (!st) return;
    if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 7) return;
    if (!st.moved) { st.moved = true; st.g = layer(SEMENTE, e.clientX, e.clientY, 18, 18); st.g.classList.add('drag'); document.body.classList.add('grdrag'); }
    st.g.style.left = e.clientX - 9 + 'px'; st.g.style.top = e.clientY - 22 + 'px';
    mark(potAt(e.clientX, e.clientY - 13));
  });
  const end = (e, cancel) => {
    if (!st) return;
    const s = st; st = null; document.body.classList.remove('grdrag'); mark(null);
    if (!s.moved) return;   // um toque: fica para o «click» (que também chega pelo teclado)
    skip = true; setTimeout(() => { skip = false; }, 400);
    const pot = cancel ? null : potAt(e.clientX, e.clientY - 13);
    const r = s.g.getBoundingClientRect(); s.g.remove();
    if (pot) onDrop(pot, r);
    else if (!reduced()) {   // volta para o saquinho
      const b = center(pack.getBoundingClientRect()), a = center(r), back = layer(SEMENTE, a.x, a.y, 18, 18);
      back.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${b.x - a.x}px,${b.y - a.y}px) scale(.6)`, opacity: 0.3 }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' })
        .finished.then(() => back.remove(), () => back.remove());
    }
  };
  pack.addEventListener('pointerup', (e) => end(e, false));
  pack.addEventListener('pointercancel', (e) => end(e, true));
}

// o saquinho das sementes e o saco da erva (desenhos pequenos para o topo da estufa)
export const packSvg = () => mk(`<svg viewBox="0 0 36 44" class="grpk-i" aria-hidden="true">
  <path d="M5 6H31L32.5 41H3.5Z" fill="#cdb489"/><path d="M5 6H31L30.6 12H5.4Z" fill="#a98c5f"/>
  <path d="M4.8 5.6L7 3 9 5.6 11 3 13 5.6 15 3 17 5.6 19 3 21 5.6 23 3 25 5.6 27 3 29 5.6 31.2 3" fill="none" stroke="#a98c5f" stroke-width="1.2"/>
  <g fill="#3c8f4e">${leque(18, 35, 0, 0.62, 'x').replace(/<path class="vn"[^>]*>/g, '')}</g>
</svg>`);
export const bagSvg = () => mk(`<svg viewBox="0 0 36 40" class="grbag-i" aria-hidden="true">
  <path d="M6 9H30L32 37H4Z" fill="#e9e4d6" opacity=".92"/><rect x="6" y="5" width="24" height="5" rx="1" fill="#8b919c"/>
  <g fill="#3c8f4e">${leque(18, 31, 0, 0.55, 'x').replace(/<path class="vn"[^>]*>/g, '')}</g>
</svg>`);
