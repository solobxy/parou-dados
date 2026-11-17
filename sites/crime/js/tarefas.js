// Trabalho à mão (16/11): as tarefas dos biscates, cada uma com objetos que se arrastam, tocam e enchem.
// A disposição vem do servidor (sorteada lá); aqui só se desenha, se joga e se junta a resposta que o servidor confere.
// Tudo o que se arrasta também se faz com dois toques (tocar no objeto e depois no sítio), para quem não consegue arrastar.
import { h, svg } from './ui.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- arrastar (com a alternativa de dois toques) ----------
// pieces: os objetos; spots(): os sítios livres agora; accept(piece, spot); place(piece, spot) põe-no lá (mexe no DOM)
function dragKit(stage, { spots, accept = () => true, place, miss, sfx }) {
  let sel = null;
  const pick = (p) => { if (sel) sel.classList.remove('sel'); sel = p; if (p) p.classList.add('sel'); stage.classList.toggle('picking', !!p); };
  const spotAt = (x, y) => spots().find((s) => { const r = s.getBoundingClientRect(); return x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8; });
  // anima do sítio onde estava para o sítio novo (o objeto já mudou de pai)
  const flip = (el, from) => {
    const to = el.getBoundingClientRect();
    if (reduced()) return;
    el.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(1.06)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
  };
  const drop = (p, s, from) => { pick(null); place(p, s); p.classList.add('done'); flip(p, from); };
  function bind(p) {
    let st = null;
    p.addEventListener('pointerdown', (e) => {
      if (p.classList.contains('done')) return;
      e.preventDefault(); p.setPointerCapture(e.pointerId);
      st = { x: e.clientX, y: e.clientY, moved: false, rect: p.getBoundingClientRect() }; sfx && sfx('tap');
    });
    p.addEventListener('pointermove', (e) => {
      if (!st) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.moved && Math.hypot(dx, dy) < 7) return;
      if (!st.moved) { st.moved = true; pick(null); p.classList.add('lift'); }
      p.style.transform = `translate(${dx}px, ${dy}px) scale(1.06)`;
      const s = spotAt(e.clientX, e.clientY);
      spots().forEach((x) => x.classList.toggle('over', x === s && accept(p, x)));
    });
    const end = (e) => {
      if (!st) return;
      const s0 = st; st = null; p.classList.remove('lift');
      spots().forEach((x) => x.classList.remove('over'));
      if (!s0.moved) { pick(sel === p ? null : p); return; }   // toque: escolhe; o toque seguinte, num sítio, larga
      const from = p.getBoundingClientRect(), s = e.type === 'pointerup' ? spotAt(e.clientX, e.clientY) : null;
      p.style.transform = '';
      if (s && accept(p, s)) drop(p, s, from);
      else {
        if (!reduced()) p.animate([{ transform: `translate(${from.left - s0.rect.left}px, ${from.top - s0.rect.top}px)` }, { transform: 'translate(0, 6px)', offset: 0.75 }, { transform: 'none' }], { duration: 360, easing: 'ease-in' });
        miss && miss(p);
      }
    };
    p.addEventListener('pointerup', end); p.addEventListener('pointercancel', end);
  }
  // segundo toque: num sítio livre larga o que estava escolhido
  stage.addEventListener('click', (e) => {
    if (!sel) return;
    const s = spots().find((x) => x.contains(e.target));
    if (s && accept(sel, s)) drop(sel, s, sel.getBoundingClientRect());
  });
  return { bind, pick };
}

const head = (title, sub, right) => h('div', { class: 'tk-head' }, h('div', { class: 'tk-ht' }, h('b', null, title), right || null), sub ? h('span', null, sub) : null);

// ---------- descarregar o camião ----------
function camiao(task, ctx) {
  const { t, sfx, vibrate } = ctx, L = task.layout, slots = new Array(6).fill(-1);
  let drops = 0, placed = 0, done;
  const finished = new Promise((r) => { done = r; });
  const boxes = L.boxes.map((b, i) => h('div', { class: 'tk-box l' + b.look, dataset: { i }, role: 'button', 'aria-label': `${b.kg} kg`, style: `--s:${(0.78 + (0.22 * (b.kg - 4)) / 36).toFixed(3)}` },
    h('i', { class: 'tape' }), h('span', { class: 'kg num' }, b.kg + ' kg')));
  const truck = h('div', { class: 'tk-truck' }, h('div', { class: 'roll' }), h('div', { class: 'door l' }), h('div', { class: 'hold' }, ...boxes.map((b) => h('div', { class: 'cell' }, b))), h('div', { class: 'door r' }), h('div', { class: 'bumper' }, h('i'), h('i')));
  const spotEls = [0, 1, 2, 3, 4, 5].map((k) => h('div', { class: 'tk-slot' + (k < 3 ? ' low' : ' high'), dataset: { k } }));
  const pallet = h('div', { class: 'tk-pallet' }, h('div', { class: 'rows' }, h('div', { class: 'row top' }, ...spotEls.slice(3)), h('div', { class: 'row bot' }, ...spotEls.slice(0, 3))),
    h('div', { class: 'wood' }, h('i'), h('i'), h('i')), h('span', { class: 'base' }, t('tkBase')));
  const note = h('p', { class: 'tk-note', 'aria-live': 'polite' }, t('tkTapHint'));
  const left = h('span', { class: 'tk-count num' }, '0 / 6');
  const stage = h('div', { class: 'tk-stage tk-camiao' }, head(t('tkCamiaoH'), t('tkCamiaoRule'), left), truck, pallet, note);
  const free = () => spotEls.filter((s) => slots[s.dataset.k] < 0 && (+s.dataset.k < 3 || slots[+s.dataset.k - 3] >= 0));
  const refresh = () => { spotEls.forEach((s) => s.classList.toggle('open', free().includes(s))); pallet.classList.toggle('lowdone', slots.slice(0, 3).every((x) => x >= 0)); left.textContent = `${placed} / 6`; };
  const kit = dragKit(stage, {
    spots: free, sfx,
    place: (p, s) => {
      slots[s.dataset.k] = +p.dataset.i; s.appendChild(p); placed++; sfx('thud'); vibrate(10); refresh();
      if (placed === 6) { note.textContent = ''; setTimeout(() => { pallet.classList.add('wrap'); sfx('zip'); }, 120); setTimeout(() => done({ slots: boxes.map((_, i) => slots.indexOf(i)), drops }), reduced() ? 300 : 900); }
    },
    miss: () => { drops++; sfx('fail'); vibrate([20, 30, 20]); note.textContent = t('tkDropWhy'); note.classList.add('bad'); clearTimeout(note._t); note._t = setTimeout(() => { note.classList.remove('bad'); if (placed < 6) note.textContent = t('tkTapHint'); }, 1400); },
  });
  boxes.forEach(kit.bind); refresh();
  return { el: stage, finished };
}

// ---------- entregas ----------
function entregas(task, ctx) {
  const { t, sfx, vibrate, streets } = ctx, L = task.layout;
  let done; const finished = new Promise((r) => { done = r; });
  const name = (s) => `${streets[s.name % streets.length]}, ${s.door}`;
  // 1) as encomendas para a mochila
  const parcels = L.stops.map((s, i) => h('div', { class: 'tk-parcel z' + ((s.door + i) % 3), dataset: { i }, role: 'button', 'aria-label': name(s) }, h('i', { class: 'tape' }), h('span', { class: 'lbl' }, h('b', null, name(s)), h('i', { class: 'bars' }))));
  const bagIn = h('div', { class: 'in' });
  const bag = h('div', { class: 'tk-bag' }, h('i', { class: 'side l' }), h('i', { class: 'side r' }), h('div', { class: 'flap' }), bagIn, h('i', { class: 'reflect' }));
  const counter = h('div', { class: 'tk-counter' }, ...parcels.map((p) => h('div', { class: 'cell' }, p)));
  const bagCount = h('span', { class: 'tk-count num' }, `0 / ${L.stops.length}`);
  const step1 = h('div', { class: 'tk-step' }, head(t('tkBagH'), t('tkBagSub'), bagCount), counter, bag);
  // 2) o mapa: tocar nas portas pela ordem
  const P = (x, y) => [12 + x * 19, 88 - y * 19];
  const map = svg('svg', { viewBox: '0 0 100 100', class: 'tk-map', role: 'group' });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const [x, y] = P(i, j + 1); map.appendChild(svg('rect', { x: x + 2.2, y: y + 2.2, width: 14.6, height: 14.6, rx: 2.2, class: (i * 7 + j * 3) % 9 === 4 ? 'park' : 'blk' })); }
  const route = svg('polyline', { class: 'route', points: P(0, 0).join(',') });
  map.appendChild(route);
  const [sx, sy] = P(0, 0);
  map.appendChild(svg('rect', { x: sx - 4.5, y: sy - 4.5, width: 9, height: 9, rx: 1.6, class: 'shop' }));
  const pins = L.stops.map((s, i) => {
    const [x, y] = P(s.x, s.y), g = svg('g', { class: 'pin', tabindex: 0, role: 'button', 'aria-label': name(s), transform: `translate(${x} ${y})` });
    g.appendChild(svg('circle', { r: 8.2, class: 'hit' })); g.appendChild(svg('circle', { r: 6.2 })); const n = svg('text', { y: 1.9, 'text-anchor': 'middle' }); n.textContent = 'ABCD'[i]; g.appendChild(n);
    g.dataset.i = i; map.appendChild(g); return g;
  });
  const scooter = svg('circle', { class: 'scooter', r: 2.6, cx: 0, cy: 0 }); map.appendChild(scooter);
  const putScooter = (x, y) => { scooter.style.transform = `translate(${x}px, ${y}px)`; };
  putScooter(sx, sy);
  const blocksEl = h('b', { class: 'num' }, t('tkBlocks', { n: 0 }));
  const redo = h('button', { class: 'btn ghost sm', type: 'button' }, t('tkRedo'));
  const legend = h('ol', { class: 'tk-legend' }, L.stops.map((s, i) => h('li', { dataset: { i } }, h('b', null, 'ABCD'[i]), name(s))));
  const step2 = h('div', { class: 'tk-step', hidden: true }, head(t('tkMapH'), t('tkMapSub')), map, h('div', { class: 'tk-row' }, blocksEl, redo), legend);
  const stage = h('div', { class: 'tk-stage tk-entregas' }, step1, step2);
  let inBag = 0;
  const kit = dragKit(stage, {
    spots: () => [bag], sfx,
    place: (p) => {
      bagIn.appendChild(p); inBag++; bagCount.textContent = `${inBag} / ${parcels.length}`; sfx('thud'); vibrate(8);
      if (inBag === parcels.length) setTimeout(() => { bag.classList.add('shut'); sfx('zip'); setTimeout(() => { step1.hidden = true; step2.hidden = false; }, reduced() ? 100 : 550); }, 150);
    },
    miss: () => sfx('fail'),
  });
  parcels.forEach(kit.bind);
  let order = [], pos = [0, 0], len = 0, busy = false;
  const pts = () => { const out = [P(0, 0)]; let [cx, cy] = [0, 0]; for (const i of order) { const s = L.stops[i]; out.push(P(s.x, cy), P(s.x, s.y)); cx = s.x; cy = s.y; } return out.map((q) => q.join(',')).join(' '); };
  const reset = () => { if (busy) return; order = []; pos = [0, 0]; len = 0; route.setAttribute('points', P(0, 0).join(',')); pins.forEach((g) => g.classList.remove('on')); legend.querySelectorAll('li').forEach((li) => { li.classList.remove('on'); li.firstChild.textContent = 'ABCD'[+li.dataset.i]; }); putScooter(sx, sy); blocksEl.textContent = t('tkBlocks', { n: 0 }); };
  redo.addEventListener('click', reset);
  const go = async (g) => {
    const i = +g.dataset.i;
    if (busy || order.includes(i)) return;
    const s = L.stops[i]; busy = true; order.push(i);
    len += Math.abs(s.x - pos[0]) + Math.abs(s.y - pos[1]);
    g.classList.add('on'); const li = legend.querySelector(`li[data-i="${i}"]`); li.classList.add('on'); li.firstChild.textContent = order.length + ' · ' + 'ABCD'[i];
    route.setAttribute('points', pts()); blocksEl.textContent = t('tkBlocks', { n: len }); sfx('tick'); vibrate(8);
    const [a, b] = P(pos[0], pos[1]), [c] = P(s.x, pos[1]), [, d] = P(s.x, s.y);
    if (!reduced()) await scooter.animate([{ transform: `translate(${a}px, ${b}px)` }, { transform: `translate(${c}px, ${b}px)` }, { transform: `translate(${c}px, ${d}px)` }], { duration: 160 + 90 * (Math.abs(s.x - pos[0]) + Math.abs(s.y - pos[1])), easing: 'ease-in-out' }).finished.catch(() => {});
    putScooter(c, d); pos = [s.x, s.y]; busy = false;
    if (order.length === L.stops.length) { redo.disabled = true; sfx('claim'); setTimeout(() => done({ order: order.slice() }), 350); }
  };
  pins.forEach((g) => { g.addEventListener('click', () => go(g)); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(g); } }); });
  return { el: stage, finished, best: () => bestLen(L) };
}
function bestLen(L) {
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((q) => [x, ...q])));
  const len = (o) => { let x = 0, y = 0, s = 0; for (const i of o) { const st = L.stops[i]; s += Math.abs(st.x - x) + Math.abs(st.y - y); x = st.x; y = st.y; } return s; };
  return Math.min(...perms(L.stops.map((_, i) => i)).map(len));
}

// ---------- laboratório ----------
// a posição do ponteiro é a mesma conta que o servidor faz: vai e volta num período, de 0 a 1
const needle = (ms, P) => { const ph = (ms % P) / P; return ph < 0.5 ? 2 * ph : 2 - 2 * ph; };
function laboratorio(task, ctx) {
  const { t, sfx, vibrate, grams } = ctx, L = task.layout, G = L.gauge;
  let done; const finished = new Promise((r) => { done = r; });
  // 1) comprimidos para a trituradora
  const pills = Array.from({ length: L.pills }, (_, i) => h('div', { class: 'tk-pill c' + (i % 3), role: 'button', 'aria-label': t('tkPill') }, h('i')));
  const tray = h('div', { class: 'tk-tray' }, ...pills.map((p, i) => h('div', { class: 'cell', style: `--r:${(i * 47) % 30 - 15}deg` }, p)));
  const hopperIn = h('div', { class: 'in' });
  const powder = h('div', { class: 'powder' });
  const machine = h('div', { class: 'tk-grinder' }, h('div', { class: 'hopper' }, hopperIn), h('div', { class: 'body' }, h('i', { class: 'bolt a' }), h('i', { class: 'bolt b' }), h('div', { class: 'vent' })), h('div', { class: 'chute' }), h('div', { class: 'bowl' }, powder));
  const count = h('span', { class: 'num' }, `0 / ${L.pills}`);
  const risk = h('p', { class: 'tk-risk' }, t('tkIllegal', { p: ctx.risk }));
  const step1 = h('div', { class: 'tk-step' }, head(t('tkPillsH'), t('tkPillsSub'), count), risk, h('div', { class: 'tk-labrow' }, tray, machine));
  // 2) triturar no momento certo
  const zone = h('i', { class: 'zone', style: `left:${(G.c - G.w) / 100}%;width:${(2 * G.w) / 100}%` }), ndl = h('i', { class: 'needle' });
  const gauge = h('div', { class: 'tk-gauge', 'aria-hidden': 'true' }, zone, ndl);
  const marks = h('div', { class: 'tk-marks' }, h('i'), h('i'), h('i'));
  const crushBtn = h('button', { class: 'btn buy block big', type: 'button' }, t('tkCrush'));
  const machineSlot = h('div', { class: 'tk-mslot' });
  const step2 = h('div', { class: 'tk-step', hidden: true }, head(t('tkCrushT'), t('tkCrushH')), machineSlot, gauge, marks, crushBtn);
  // 3) encher os sacos
  const lcd = h('b', { class: 'num' }, grams(0)), bagFill = h('i', { class: 'fill' });
  const bagEl = h('div', { class: 'tk-zip' }, h('i', { class: 'seal' }), h('i', { class: 'mark' }), bagFill);
  const scale = h('div', { class: 'tk-scale' }, bagEl, h('div', { class: 'plate' }), h('div', { class: 'lcd' }, lcd, h('small', null, t('tkTarget', { g: grams(L.target) }))));
  const bagsRow = h('div', { class: 'tk-marks bags' }, ...L.bags.map(() => h('i')));
  const holdBtn = h('button', { class: 'btn buy block big tk-hold', type: 'button' }, t('tkFill'));
  const step3 = h('div', { class: 'tk-step', hidden: true }, head(t('tkBagsT'), t('tkBagsH', { g: grams(L.target) })), scale, bagsRow, holdBtn);
  const stage = h('div', { class: 'tk-stage tk-lab' }, step1, step2, step3);
  let inHopper = 0;
  const kit = dragKit(stage, {
    spots: () => [machine], sfx,
    place: (p) => {
      hopperIn.appendChild(p); inHopper++; count.textContent = `${inHopper} / ${L.pills}`; sfx('tick'); vibrate(6);
      if (inHopper === L.pills) setTimeout(() => { step1.hidden = true; machineSlot.appendChild(machine); step2.hidden = false; startGauge(); }, 300);
    },
  });
  pills.forEach(kit.bind);
  const taps = []; let g0 = 0, raf = 0;
  const startGauge = () => { g0 = performance.now(); const tick = () => { ndl.style.left = needle(performance.now() - g0, G.periodMs) * 100 + '%'; raf = requestAnimationFrame(tick); }; tick(); };
  crushBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (taps.length >= 3 || !g0) return;
    const ms = Math.round(performance.now() - g0), x = needle(ms, G.periodMs) * 10000, hit = Math.abs(x - G.c) <= G.w;
    taps.push(ms); marks.children[taps.length - 1].className = hit ? 'ok' : 'bad';
    if (!hit) { gauge.classList.remove('miss'); void gauge.offsetWidth; gauge.classList.add('miss'); }
    machine.classList.remove('shake'); void machine.offsetWidth; machine.classList.add('shake');
    powder.style.setProperty('--h', taps.length / 3);
    if (!reduced()) for (let k = 0; k < 7; k++) { const d = h('i', { class: 'dust' }); machine.querySelector('.bowl').appendChild(d); d.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 70}px, ${-20 - Math.random() * 30}px)`, opacity: 0 }], { duration: 500 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.4,1)' }).finished.then(() => d.remove()); }
    sfx('crunch'); vibrate(hit ? 18 : [10, 20, 10]);
    if (taps.length === 3) { crushBtn.disabled = true; setTimeout(() => { cancelAnimationFrame(raf); step2.hidden = true; step3.hidden = false; }, 450); }
  });
  const holds = []; let h0 = 0, hraf = 0;
  const show = (mg) => { const e = (mg - L.target) / L.target; lcd.textContent = grams(mg); lcd.className = 'num' + (Math.abs(e) <= 0.05 ? ' on' : e > 0.05 ? ' over' : ''); bagFill.style.setProperty('--f', Math.min(1.5, mg / L.target)); };
  const press = (e) => { e.preventDefault(); if (h0 || holds.length >= L.bags.length) return; if (e.pointerId !== undefined) try { holdBtn.setPointerCapture(e.pointerId); } catch {} h0 = performance.now(); scale.classList.add('pour'); sfx('pour');
    const tick = () => { show((L.rate * (performance.now() - h0)) / 1000); hraf = requestAnimationFrame(tick); }; tick(); };
  const release = () => {
    if (!h0) return;
    const ms = Math.min(20000, Math.round(performance.now() - h0)); h0 = 0; cancelAnimationFrame(hraf); scale.classList.remove('pour');
    const mg = (L.rate * ms) / 1000, err = Math.abs(mg - L.target) / L.target; show(mg);
    holds.push(ms); bagsRow.children[holds.length - 1].className = err <= 0.05 ? 'ok' : err <= 0.15 ? 'mid' : 'bad';
    bagEl.classList.add('sealed'); sfx('zip'); vibrate(err <= 0.05 ? 18 : 10);
    if (holds.length === L.bags.length) { holdBtn.disabled = true; setTimeout(() => done({ taps: taps.slice(), holds: holds.slice() }), 500); }
    else setTimeout(() => { bagEl.classList.remove('sealed'); show(0); }, 500);
  };
  holdBtn.addEventListener('pointerdown', press); holdBtn.addEventListener('pointerup', release); holdBtn.addEventListener('pointercancel', release);
  holdBtn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) press(e); });
  holdBtn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') release(); });
  crushBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); crushBtn.dispatchEvent(new PointerEvent('pointerdown')); } });
  return { el: stage, finished, stop: () => { cancelAnimationFrame(raf); cancelAnimationFrame(hraf); } };
}

const GAMES = { camiao, entregas, laboratorio };
// monta a tarefa e devolve { el, finished } (finished resolve com a resposta para o servidor)
export function mount(task, ctx) { const g = GAMES[task.id]; return g ? g(task, ctx) : null; }
export { wait, bestLen };
