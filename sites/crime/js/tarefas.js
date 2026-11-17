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

// ---------- marcar as linhas erradas (vigilante: a porta; advogado: o contrato) ----------
function marcar(task, ctx, { title, sub, refTitle, ref, rows, isBad }) {
  const { t, sfx, vibrate } = ctx;
  let done; const finished = new Promise((r) => { done = r; });
  const picks = new Set();
  const rowEls = rows.map((txt, i) => {
    const b = h('button', { class: 'tk-mark', type: 'button', 'aria-pressed': 'false' }, h('span', { class: 'x', 'aria-hidden': 'true' }), ...txt);
    b.addEventListener('click', () => {
      const on = !picks.has(i); if (on) picks.add(i); else picks.delete(i);
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); sfx(on ? 'tick' : 'tap'); vibrate(on ? 10 : 4);
    });
    return b;
  });
  const go = h('button', { class: 'btn buy block big', type: 'button' }, t('tkClose'));
  go.addEventListener('click', () => {
    go.disabled = true; rowEls.forEach((b) => (b.disabled = true));
    rowEls.forEach((b, i) => b.classList.add(isBad(i) ? 'bad' : 'good'));   // mostra o que estava errado antes de fechar
    sfx('claim'); setTimeout(() => done({ picks: [...picks] }), reduced() ? 200 : 900);
  });
  const paper = h('div', { class: 'tk-paper' }, h('b', null, refTitle), ...ref);
  const stage = h('div', { class: 'tk-stage tk-marcar' }, head(title, sub), paper, h('div', { class: 'tk-rows' }, ...rowEls), go);
  // a ficha fica presa logo abaixo do cabeçalho do jogo: compara-se sem subir e descer
  requestAnimationFrame(() => { const hud = document.querySelector('.hud'); paper.style.top = ((hud ? hud.getBoundingClientRect().height : 0) + 8) + 'px'; });
  return { el: stage, finished };
}
const hora = (m) => `${21 + Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
function entradas(task, ctx) {
  const { t, people } = ctx, L = task.layout;
  return marcar(task, ctx, {
    title: t('tkDoorH'), sub: t('tkDoorSub'), refTitle: t('tkGuests'),
    ref: L.guests.map((n) => h('span', null, people[n % people.length])),
    rows: L.rows.map((r) => [h('span', { class: 'num tm' }, hora(r.m)), h('span', null, people[r.n % people.length])]),
    isBad: (i) => !L.guests.includes(L.rows[i].n),
  });
}
function contrato(task, ctx) {
  const { t, people, money, date } = ctx, L = task.layout;
  const val = (f, v) => (f === 0 ? people[v % people.length] : f === 1 ? money(v) : f === 2 ? date(v) : t('tkMonths', { n: v }));
  return marcar(task, ctx, {
    title: t('tkContractH'), sub: t('tkContractSub'), refTitle: t('tkFile'),
    ref: L.ficha.map((v, f) => h('span', null, h('small', null, t('tkF' + f)), ' ', val(f, v))),
    rows: L.rows.map((r) => [h('span', null, t('tkC' + r.f + (r.k ? 'b' : ''), { v: val(r.f, r.v) }))]),
    isBad: (i) => L.rows[i].v !== L.ficha[L.rows[i].f],
  });
}
// ---------- doses (enfermeiro): segurar para encher cada seringa até à dose receitada ----------
function doses(task, ctx) {
  const { t, sfx, vibrate, ml } = ctx, L = task.layout;
  let done; const finished = new Promise((r) => { done = r; });
  const fill = h('i', { class: 'liq' }), mark = h('i', { class: 'mark' }), plunger = h('i', { class: 'plg' }), rod = h('i', { class: 'rod' });
  const barrel = h('div', { class: 'tk-syr' }, h('div', { class: 'brl' }, fill, mark, h('i', { class: 'ticks' })), rod, plunger, h('i', { class: 'ndl' }));
  const read = h('b', { class: 'num' }, ml(0)), want = h('small', null, '');
  const marks = h('div', { class: 'tk-marks' }, ...L.doses.map(() => h('i')));
  const btn = h('button', { class: 'btn buy block big tk-hold', type: 'button' }, t('tkFill'));
  const stage = h('div', { class: 'tk-stage tk-doses' }, head(t('tkDosesH'), t('tkDosesSub')), barrel, h('div', { class: 'tk-read' }, read, want), marks, btn);
  const holds = []; let h0 = 0, raf = 0;
  const MAX = 5;   // a seringa leva 5 ml
  const setDose = () => { const k = holds.length; if (k < L.doses.length) { want.textContent = t('tkDose', { v: ml(L.doses[k] / 10) }); mark.style.left = (100 - (L.doses[k] / 10 / MAX) * 100) + '%'; } };
  const show = (v) => { const tg = L.doses[holds.length] / 10, e = (v - tg) / tg; read.textContent = ml(v); read.className = 'num' + (Math.abs(e) <= 0.05 ? ' on' : e > 0.05 ? ' over' : ''); const pc = Math.min(100, (v / MAX) * 100); fill.style.width = pc + '%'; plunger.style.left = (100 - pc) + '%'; rod.style.width = (100 - pc) + '%'; };
  const press = (e) => { e.preventDefault(); if (h0 || holds.length >= L.doses.length) return; if (e.pointerId !== undefined) try { btn.setPointerCapture(e.pointerId); } catch {} h0 = performance.now(); sfx('pour');
    const tick = () => { show((L.rate * (performance.now() - h0)) / 100000); raf = requestAnimationFrame(tick); }; tick(); };
  const release = () => {
    if (!h0) return;
    const ms = Math.min(20000, Math.round(performance.now() - h0)); h0 = 0; cancelAnimationFrame(raf);
    const v = (L.rate * ms) / 100000, tg = L.doses[holds.length] / 10, err = Math.abs(v - tg) / tg; show(v);
    holds.push(ms); marks.children[holds.length - 1].className = err <= 0.05 ? 'ok' : err <= 0.15 ? 'mid' : 'bad';
    sfx('zip'); vibrate(err <= 0.05 ? 18 : 10);
    if (holds.length === L.doses.length) { btn.disabled = true; setTimeout(() => done({ holds: holds.slice() }), 500); }
    else setTimeout(() => { show(0); setDose(); }, 550);
  };
  btn.addEventListener('pointerdown', press); btn.addEventListener('pointerup', release); btn.addEventListener('pointercancel', release);
  btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) press(e); });
  btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') release(); });
  setDose(); show(0);
  return { el: stage, finished };
}

// ---------- oficina: trocar um pneu ----------
// 1) desapertar as 5 porcas (qualquer ordem); 2) a roda velha sai, entra a nova; 3) apertar em estrela, a segurar
// cada porca até ao binário pedido. A ordem e os tempos vão para o servidor, que faz as mesmas contas.
function oficina(task, ctx) {
  const { t, sfx, vibrate } = ctx, L = task.layout;
  let done; const finished = new Promise((r) => { done = r; });
  const pos = [0, 1, 2, 3, 4].map((i) => { const a = (-90 + i * 72) * (Math.PI / 180); return [50 + 27 * Math.cos(a), 50 + 27 * Math.sin(a)]; });
  const nuts = pos.map(([x, y], i) => h('button', { class: 'tk-nut', type: 'button', style: `left:${x}%;top:${y}%`, 'aria-label': t('tkNut', { n: i + 1 }), dataset: { i } }, h('i', { class: 'hex' }), h('i', { class: 'ring' })));
  const wheel = h('div', { class: 'tk-wheel l' + L.look }, h('div', { class: 'tyre' }, h('div', { class: 'rim' }, h('i', { class: 'hub' }))));
  const wrap = h('div', { class: 'tk-wheelwrap' }, h('div', { class: 'arch' }), wheel, ...nuts);
  const read = h('b', { class: 'num' }, '0 N·m'), want = h('small', null, t('tkNm', { n: L.nm }));
  const lcd = h('div', { class: 'tk-read' }, read, want);
  const marks = h('div', { class: 'tk-marks' }, ...nuts.map(() => h('i')));
  const count = h('span', { class: 'tk-count num' }, '0 / 5');
  const hd = head(t('tkTyreH'), t('tkTyreSub1'), count);
  const note = h('p', { class: 'tk-note', 'aria-live': 'polite' }, t('tkTyreHint1'));
  const stage = h('div', { class: 'tk-stage tk-oficina' }, hd, wrap, lcd, marks, note);
  lcd.hidden = true; marks.hidden = true;
  let phase = 1, off = 0;
  const picks = [], holds = []; let h0 = 0, raf = 0, cur = -1;
  const loosen = (b) => {
    if (b.classList.contains('out')) return;
    b.classList.add('out'); off++; count.textContent = `${off} / 5`; sfx('clank'); vibrate(10);
    if (off === 5) setTimeout(swap, reduced() ? 50 : 450);
  };
  const swap = async () => {
    note.textContent = '';
    if (!reduced()) { await wheel.animate([{ transform: 'none' }, { transform: 'translateX(140%) rotate(120deg)', opacity: 0 }], { duration: 420, easing: 'ease-in' }).finished.catch(() => {}); }
    sfx('thud'); wheel.classList.add('new');
    if (!reduced()) await wheel.animate([{ transform: 'translateX(-140%) rotate(-120deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished.catch(() => {});
    phase = 2; count.textContent = '0 / 5';
    nuts.forEach((b) => { b.classList.remove('out'); b.classList.add('loose'); });
    hd.querySelector('span:not(.tk-count)').textContent = t('tkTyreSub2');
    lcd.hidden = false; marks.hidden = false; note.textContent = t('tkTyreHint2');
  };
  const show = (nm) => { const e = (nm - L.nm) / L.nm; read.textContent = Math.round(nm) + ' N·m'; read.className = 'num' + (Math.abs(e) <= 0.08 ? ' on' : e > 0.08 ? ' over' : ''); };
  const press = (b, e) => {
    if (phase !== 2 || h0 || b.classList.contains('tight')) return;
    e.preventDefault(); if (e.pointerId !== undefined) try { b.setPointerCapture(e.pointerId); } catch {}
    cur = +b.dataset.i; h0 = performance.now(); b.classList.add('turning'); sfx('tick');
    let lastClick = 0;
    const tick = () => {
      const ms = performance.now() - h0, nm = (L.rate * ms) / 1000; show(nm);
      b.style.setProperty('--p', Math.min(1, nm / (L.nm * 1.3)));
      b.style.setProperty('--a', (ms * 0.6) % 360 + 'deg');
      // a chave dá um estalo ao chegar ao binário, como uma chave dinamométrica
      if (!lastClick && Math.abs(nm - L.nm) / L.nm <= 0.02) { lastClick = 1; sfx('tick'); vibrate(14); }
      raf = requestAnimationFrame(tick);
    };
    tick();
  };
  const release = (b) => {
    if (!h0 || +b.dataset.i !== cur) return;
    const ms = Math.min(20000, Math.round(performance.now() - h0)); h0 = 0; cancelAnimationFrame(raf);
    const nm = (L.rate * ms) / 1000, err = Math.abs(nm - L.nm) / L.nm; show(nm);
    picks.push(cur); holds.push(ms); b.classList.remove('turning'); b.classList.add('tight', err <= 0.08 ? 'ok' : 'bad');
    marks.children[picks.length - 1].className = err <= 0.08 ? 'ok' : 'bad';
    // a ordem em estrela: cada porca salta a do lado
    if (picks.length > 1) { const d = (picks[picks.length - 1] - picks[picks.length - 2] + 5) % 5; if (d !== 2 && d !== 3) { note.textContent = t('tkStarMiss'); note.classList.add('bad'); } else { note.classList.remove('bad'); note.textContent = ''; } }
    count.textContent = `${picks.length} / 5`; sfx('clank'); vibrate(err <= 0.08 ? 18 : 10);
    if (picks.length === 5) { setTimeout(() => { wheel.classList.add('spin'); sfx('claim'); }, 200); setTimeout(() => done({ picks: picks.slice(), holds: holds.slice() }), reduced() ? 300 : 900); }
    else setTimeout(() => show(0), 500);
  };
  nuts.forEach((b) => {
    b.addEventListener('click', () => { if (phase === 1) loosen(b); });
    b.addEventListener('pointerdown', (e) => press(b, e));
    b.addEventListener('pointerup', () => release(b)); b.addEventListener('pointercancel', () => release(b));
    b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && phase === 2) press(b, e); });
    b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') release(b); });
  });
  return { el: stage, finished, stop: () => cancelAnimationFrame(raf) };
}

// ---------- mudanças: encaixar os móveis na carrinha ----------
// a carrinha vista de cima (cabine em cima, porta em baixo), numa grelha W × H. Os móveis arrastam-se para a grelha;
// tocar num móvel escolhe-o (para rodar, ou para o pôr com um toque numa casa livre).
function mudancas(task, ctx) {
  const { t, sfx, vibrate } = ctx, L = task.layout, N = L.pcs.length;
  let done; const finished = new Promise((r) => { done = r; });
  const place = L.pcs.map(() => [-1, -1, 0]);
  const dims = (i) => { const q = L.pcs[i], r = place[i][2]; return r ? [q.h, q.w] : [q.w, q.h]; };
  const cells = Array.from({ length: L.W * L.H }, (_, c) => h('i', { class: 'cell', dataset: { c } }));
  const grid = h('div', { class: 'grid', style: `--w:${L.W};--h:${L.H}` }, ...cells);
  const van = h('div', { class: 'tk-van' }, h('div', { class: 'cab' }, h('i', { class: 'glass' })), grid, h('div', { class: 'doors' }, h('i'), h('i')));
  const tag = (q) => (q.heavy ? t('tkHeavy') : q.fragile ? t('tkFragile') : '');
  const look = (q) => 'k-' + q.kind + (q.heavy ? ' heavy' : '') + (q.fragile ? ' fragile' : '');
  const pieces = L.pcs.map((q, i) => h('div', { class: 'tk-piece ' + look(q), role: 'button', tabindex: 0, dataset: { i } }, h('b', null, t('mv_' + q.kind)), tag(q) ? h('small', null, tag(q)) : null));
  const tiles = L.pcs.map((q, i) => h('button', { class: 'tk-tile ' + look(q), type: 'button', dataset: { i } },
    h('i', { class: 'shape', style: `--w:${q.w};--h:${q.h}` }), h('span', null, h('b', null, t('mv_' + q.kind)), tag(q) ? h('small', null, tag(q)) : null)));
  const tray = h('div', { class: 'tk-trayv' }, ...tiles);
  const area = h('span', { class: 'tk-count num' }, `0 / ${L.W * L.H}`);
  const rot = h('button', { class: 'btn ghost sm', type: 'button', disabled: true }, t('tkRotate'));
  const shut = h('button', { class: 'btn buy block big', type: 'button' }, t('tkShut'));
  const note = h('p', { class: 'tk-note', 'aria-live': 'polite' }, t('tkVanHint'));
  // os móveis em cima e a carrinha por baixo: arrasta-se para baixo, que é para onde o polegar vai
  const stage = h('div', { class: 'tk-stage tk-mudancas' }, head(t('tkVanH'), t('tkVanSub'), area), tray, van, note, h('div', { class: 'tk-actbar' }, rot, shut));
  let sel = -1;
  const occ = () => { const g = Array(L.W * L.H).fill(-1); place.forEach(([x, y], i) => { if (x < 0) return; const [w, hh] = dims(i); for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + w; xx++) g[yy * L.W + xx] = i; }); return g; };
  const fits = (i, x, y, rot2 = place[i][2]) => {
    const q = L.pcs[i], w = rot2 ? q.h : q.w, hh = rot2 ? q.w : q.h, g = occ();
    if (x < 0 || y < 0 || x + w > L.W || y + hh > L.H) return false;
    for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + w; xx++) if (g[yy * L.W + xx] >= 0 && g[yy * L.W + xx] !== i) return false;
    return true;
  };
  const cellPx = () => grid.getBoundingClientRect().width / L.W;
  const draw = () => {
    let a = 0;
    place.forEach(([x, y], i) => {
      const p = pieces[i], [w, hh] = dims(i);
      tiles[i].classList.toggle('used', x >= 0); tiles[i].classList.toggle('sel', sel === i);
      p.classList.toggle('sel', sel === i);
      if (x < 0) { p.remove(); return; }
      a += w * hh;
      Object.assign(p.style, { left: `calc(${x} * var(--c))`, top: `calc(${y} * var(--c))`, width: `calc(${w} * var(--c))`, height: `calc(${hh} * var(--c))` });
      p.classList.toggle('ok', (L.pcs[i].heavy && y === 0) || (L.pcs[i].fragile && y + hh === L.H));
      if (p.parentNode !== grid) grid.appendChild(p);
    });
    area.textContent = `${a} / ${L.W * L.H}`; rot.disabled = sel < 0 || L.pcs[sel].w === L.pcs[sel].h;
    shut.classList.toggle('ready', a === L.W * L.H);
  };
  const choose = (i) => { sel = sel === i ? -1 : i; draw(); };
  const put = (i, x, y, from) => {
    place[i] = [x, y, place[i][2]]; sel = -1; draw(); sfx('thud'); vibrate(10);
    const p = pieces[i];
    if (from && !reduced()) { const to = p.getBoundingClientRect(); p.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(1.04)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
    const q = L.pcs[i], [, hh] = dims(i);
    if (q.heavy && y !== 0) note.textContent = t('tkHeavyWhy');
    else if (q.fragile && y + hh !== L.H) note.textContent = t('tkFragileWhy');
    else note.textContent = '';
  };
  // arrastar: um fantasma do tamanho real segue o dedo; as casas por baixo acendem a verde (cabe) ou a vermelho (não cabe)
  let drag = null;
  const ghostAt = (e) => {
    const g = grid.getBoundingClientRect(), c = cellPx(), [w, hh] = dims(drag.i);
    drag.ghost.style.transform = `translate(${e.clientX - (w * c) / 2}px, ${e.clientY - (hh * c) / 2}px)`;
    const x = Math.round((e.clientX - g.left) / c - w / 2), y = Math.round((e.clientY - g.top) / c - hh / 2);
    const inside = e.clientX >= g.left - c / 2 && e.clientX <= g.right + c / 2 && e.clientY >= g.top - c / 2 && e.clientY <= g.bottom + c / 2;
    cells.forEach((el) => el.classList.remove('can', 'cant'));
    drag.at = inside ? [x, y] : null;
    if (inside) { const ok = fits(drag.i, x, y); for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + w; xx++) if (xx >= 0 && yy >= 0 && xx < L.W && yy < L.H) cells[yy * L.W + xx].classList.add(ok ? 'can' : 'cant'); }
  };
  const startDrag = (i, el, e) => {
    const c = cellPx(), [w, hh] = dims(i);
    drag = { i, el, x0: e.clientX, y0: e.clientY, moved: false, at: null, ghost: null, w: w * c, h: hh * c };
    try { el.setPointerCapture(e.pointerId); } catch {}
  };
  const moveDrag = (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 7) return;
    if (!drag.moved) {
      drag.moved = true; sel = -1;
      const q = L.pcs[drag.i];
      drag.ghost = h('div', { class: 'tk-piece ghost ' + look(q), style: `width:${drag.w}px;height:${drag.h}px` }, h('b', null, t('mv_' + q.kind)));
      document.body.appendChild(drag.ghost);
      if (place[drag.i][0] >= 0) { drag.was = place[drag.i].slice(); place[drag.i] = [-1, -1, place[drag.i][2]]; }
      draw();
    }
    ghostAt(e);
  };
  const endDrag = (e) => {
    if (!drag) return;
    const d = drag; drag = null; cells.forEach((el) => el.classList.remove('can', 'cant'));
    if (!d.moved) { choose(d.i); return; }
    const from = d.ghost.getBoundingClientRect(); d.ghost.remove();
    if (e.type === 'pointerup' && d.at && fits(d.i, d.at[0], d.at[1])) put(d.i, d.at[0], d.at[1], from);
    else { sfx(d.at ? 'fail' : 'tap'); if (d.at) { note.textContent = t('tkNoFit'); vibrate([15, 25, 15]); } draw(); }
  };
  const bindDrag = (el, i) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); startDrag(i, el, e); });
    el.addEventListener('pointermove', moveDrag);
    el.addEventListener('pointerup', endDrag); el.addEventListener('pointercancel', endDrag);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(i); } });
  };
  tiles.forEach((el, i) => bindDrag(el, i)); pieces.forEach((el, i) => bindDrag(el, i));
  // com um móvel escolhido, um toque numa casa livre põe-no lá (o canto de cima à esquerda)
  cells.forEach((el) => el.addEventListener('click', () => {
    if (sel < 0) return;
    const c = +el.dataset.c, x = c % L.W, y = Math.floor(c / L.W);
    if (fits(sel, x, y)) put(sel, x, y, (place[sel][0] >= 0 ? pieces[sel] : tiles[sel]).getBoundingClientRect());
    else { note.textContent = t('tkNoFit'); sfx('fail'); }
  }));
  rot.addEventListener('click', () => {
    if (sel < 0) return;
    const r2 = place[sel][2] ? 0 : 1, [x, y] = place[sel];
    if (x < 0 || fits(sel, x, y, r2)) { place[sel][2] = r2; sfx('tick'); }
    else { place[sel] = [-1, -1, r2]; note.textContent = t('tkRotOut'); sfx('tap'); }
    draw();
  });
  shut.addEventListener('click', () => {
    shut.disabled = true; rot.disabled = true; sel = -1; draw();
    van.classList.add('shut'); sfx('door'); vibrate(20);
    setTimeout(() => done({ place: place.map((v) => v.slice()) }), reduced() ? 250 : 800);
  });
  draw();
  return { el: stage, finished };
}

// ---------- desmanche: peças de um carro roubado antes de a patrulha passar ----------
// segura numa peça até sair; o relógio da patrulha só começa na primeira. Quem ainda está agarrado a uma peça
// quando a patrulha passa é visto. Fugir antes acaba já com o que se tirou.
function desmanche(task, ctx) {
  const { t, sfx, vibrate } = ctx, L = task.layout;
  let done; const finished = new Promise((r) => { done = r; });
  const holds = L.parts.map(() => 0), got = L.parts.map(() => false);
  const sec = (ms) => (ms / 1000).toLocaleString(ctx.lang === 'en' ? 'en-GB' : 'pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' s';
  const vmax = Math.max(...L.parts.map((x) => x.v));
  const spots = L.parts.map((x) => h('i', { class: 'spot s' + x.k }));
  const car = h('div', { class: 'tk-car' }, h('div', { class: 'body' }, h('i', { class: 'win a' }), h('i', { class: 'win b' })), h('i', { class: 'whl f' }), h('i', { class: 'whl r' }), ...spots);
  const rows = L.parts.map((x, i) => h('button', { class: 'tk-part', type: 'button', dataset: { i } },
    h('i', { class: 'prog' }), h('b', null, t('dp_' + x.k)),
    h('span', { class: 'val', 'aria-label': t('tkWorth', { n: x.v, m: vmax }) }, ...Array.from({ length: vmax }, (_, k) => h('i', { class: k < x.v ? 'on' : '' }))),
    h('span', { class: 'num tm' }, sec(x.need))));
  const clock = h('b', { class: 'num' }, sec(L.win)), bar = h('i', { class: 'left' });
  const patrol = h('div', { class: 'tk-patrol' }, h('div', { class: 'track' }, bar, h('i', { class: 'siren' })), h('span', null, t('tkPatrol'), ' ', clock));
  const flee = h('button', { class: 'btn ghost block big', type: 'button' }, t('tkFlee'));
  const risk = h('p', { class: 'tk-risk' }, t('tkIllegal', { p: ctx.risk }));
  const note = h('p', { class: 'tk-note', 'aria-live': 'polite' }, t('tkStripHint'));
  const bar2 = h('div', { class: 'tk-actbar' }, flee);
  const stage = h('div', { class: 'tk-stage tk-desmanche' }, head(t('tkStripH'), t('tkStripSub')), risk, patrol, note, car, h('div', { class: 'tk-parts' }, ...rows), bar2);
  // o relógio da patrulha fica preso por baixo do cabeçalho do jogo enquanto se desce na lista
  requestAnimationFrame(() => { const hud = document.querySelector('.hud'); patrol.style.top = ((hud ? hud.getBoundingClientRect().height : 0) + 6) + 'px'; });
  let t0 = 0, raf = 0, cur = -1, h0 = 0, over = false;
  const finish = (spotted) => {
    if (over) return; over = true; cancelAnimationFrame(raf);
    if (cur >= 0) { holds[cur] += Math.round(performance.now() - h0); rows[cur].classList.remove('on'); cur = -1; }
    rows.forEach((r) => (r.disabled = true)); flee.disabled = true;
    if (spotted) { stage.classList.add('spotted'); sfx('bust'); vibrate([30, 40, 30]); note.textContent = t('tkSpotted'); }
    else { stage.classList.add('gone'); sfx('door'); note.textContent = t('tkGone'); }
    setTimeout(() => done({ holds: holds.map((ms) => Math.min(30000, ms)), spotted: !!spotted }), reduced() ? 300 : 1100);
  };
  const loop = () => {
    const el = performance.now() - t0, left = Math.max(0, L.win - el);
    clock.textContent = sec(left); bar.style.transform = `scaleX(${left / L.win})`;
    stage.classList.toggle('near', left < 3000);
    if (cur >= 0) {
      const x = L.parts[cur], spent = holds[cur] + (performance.now() - h0);
      rows[cur].style.setProperty('--p', Math.min(1, spent / x.need));
      if (spent >= x.need && !got[cur]) {   // a peça saiu
        got[cur] = true; rows[cur].classList.add('got'); spots[cur].classList.add('gone'); sfx('clank'); vibrate(16);
        holds[cur] += Math.round(performance.now() - h0); h0 = performance.now(); rows[cur].classList.remove('on'); cur = -1;
      }
    }
    if (left <= 0) return finish(cur >= 0);
    raf = requestAnimationFrame(loop);
  };
  const press = (i, e) => {
    if (over || got[i] || cur >= 0) return;
    e.preventDefault(); if (e.pointerId !== undefined) try { rows[i].setPointerCapture(e.pointerId); } catch {}
    if (!t0) { t0 = performance.now(); note.textContent = ''; raf = requestAnimationFrame(loop); }
    cur = i; h0 = performance.now(); rows[i].classList.add('on'); spots[i].classList.add('work'); sfx('tick');
  };
  const release = (i) => {
    if (cur !== i || over) return;
    holds[i] += Math.round(performance.now() - h0); rows[i].classList.remove('on'); spots[i].classList.remove('work'); cur = -1;
  };
  rows.forEach((r, i) => {
    r.addEventListener('pointerdown', (e) => press(i, e)); r.addEventListener('pointerup', () => release(i)); r.addEventListener('pointercancel', () => release(i));
    r.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) press(i, e); });
    r.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') release(i); });
  });
  flee.addEventListener('click', () => finish(false));
  return { el: stage, finished, stop: () => cancelAnimationFrame(raf) };
}

const GAMES = { camiao, entregas, laboratorio, entradas, contrato, doses, oficina, mudancas, desmanche };
// monta a tarefa e devolve { el, finished } (finished resolve com a resposta para o servidor)
export function mount(task, ctx) { const g = GAMES[task.id]; return g ? g(task, ctx) : null; }
export { wait, bestLen };
