// O bónus Crazy: uma roda de 64 casas com três flappers (verde, azul, amarelo). O jogador escolhe o seu antes de a roda rodar;
// cada flapper lê a casa que tem por baixo. DOUBLE dobra todos os valores da roda e ela roda outra vez, as vezes que sair.
// Aqui só se anima: onde a roda pára e o que cada flapper ganha vem decidido pelo servidor, e só depois de a escolha fechar.
import { h } from './ui.js';

const TAU = Math.PI * 2, DISP = '"Shoulders", "Arial Narrow", sans-serif';
export const FLAP_COR = ['#2fd35f', '#2aa8ff', '#ffd426'];   // verde, azul, amarelo
// cada valor com a sua cor (festa, não o noir da roda principal): reconhece-se o valor pela cor mesmo com a roda a girar
const COR = { 15: '#6d5947', 20: '#d0162b', 25: '#ef8a0b', 35: '#7c2fc0', 50: '#16a05a', 100: '#e0267d', 200: '#1aa3b8', D: '#0d0f14' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mod = (a, n) => ((a % n) + n) % n;

// A roda. segs: números ou 'D'. flaps: de quantas casas cada flapper está desviado do do meio (ex.: [-5, 0, 5]).
export function crazyWheel({ segs, flaps, sfx }) {
  const W = 360, H = 392, cx = 180, cy = 214, R = 162, N = segs.length, th = TAU / N;
  const dpr = Math.min(2.5, window.devicePixelRatio || 1), el = document.createElement('canvas');
  el.width = Math.round(W * dpr); el.height = Math.round(H * dpr); el.className = 'crz-wheel'; el.style.aspectRatio = `${W} / ${H}`;
  const ctx = el.getContext('2d'); ctx.scale(dpr, dpr);
  const st = { rot: 0, k: 0, sp: null, flash: 0, mine: -1, active: [true, true, true], lit: null, raf: 0, t0: 0 };
  // a face da roda, redesenhada só quando os valores dobram
  const face = document.createElement('canvas'); face.width = face.height = Math.round(R * 2 * dpr);
  function paint() {
    const x = face.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, R * 2, R * 2); x.translate(R, R);
    const RB = R - 8, RIN = 50;
    segs.forEach((s, i) => {
      const a0 = (i - 0.5) * th - Math.PI / 2, a = i * th - Math.PI / 2, dbl = s === 'D';
      x.fillStyle = COR[s] || '#444'; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, RB, a0, a0 + th); x.closePath(); x.fill();
      if (dbl) { x.fillStyle = '#f2c230'; x.beginPath(); x.arc(0, 0, RB, a0, a0 + th); x.arc(0, 0, RB - 6, a0 + th, a0, true); x.closePath(); x.fill(); }
      x.strokeStyle = '#f3d27a'; x.lineWidth = 0.9; x.beginPath(); x.moveTo(RIN * Math.cos(a0), RIN * Math.sin(a0)); x.lineTo(RB * Math.cos(a0), RB * Math.sin(a0)); x.stroke();
      // letras empilhadas ao longo do raio, do aro para o centro, como na roda a sério
      const txt = dbl ? 'DOUBLE' : String(s * 2 ** st.k) + 'X', fs = dbl ? 11.5 : txt.length > 4 ? 11.5 : 13, passo = dbl ? 11.2 : txt.length > 4 ? 11.4 : 12.6;
      x.save(); x.rotate(a + Math.PI / 2); x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `900 ${fs}px ${DISP}`;
      x.fillStyle = dbl ? '#ffd95e' : '#fff8dc'; x.strokeStyle = '#0009'; x.lineWidth = 2.4; x.lineJoin = 'round';
      for (let c = 0; c < txt.length; c++) { const y = -(RB - (dbl ? 16 : 14) - c * passo); x.strokeText(txt[c], 0, y); x.fillText(txt[c], 0, y); }
      x.restore();
    });
    const g = x.createRadialGradient(0, 0, RIN, 0, 0, RB); g.addColorStop(0, '#0007'); g.addColorStop(0.35, '#0000'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, RB, 0, TAU); x.fill();
  }
  paint();
  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    // aro com lâmpadas
    ctx.fillStyle = '#0009'; ctx.beginPath(); ctx.arc(cx + 2, cy + 5, R + 3, 0, TAU); ctx.fill();
    const rg = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R); rg.addColorStop(0, '#fff1bf'); rg.addColorStop(0.35, '#e0a92e'); rg.addColorStop(0.65, '#8a590c'); rg.addColorStop(1, '#f0c95f');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, R + 1, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(st.rot); ctx.drawImage(face, -R, -R, R * 2, R * 2);
    // as casas por baixo dos flappers ainda em jogo, depois de a roda parar
    if (st.lit) st.lit.forEach((i, f) => {
      if (i === null) return; const a0 = (i - 0.5) * th - Math.PI / 2, mine = f === st.mine;
      ctx.fillStyle = `rgba(255,255,255,${(mine ? 0.3 : 0.14) + 0.14 * Math.sin(now * 9 + f)})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R - 8, a0, a0 + th); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = FLAP_COR[f]; ctx.lineWidth = mine ? 3 : 1.6; ctx.stroke();
    });
    ctx.restore();
    // centro: medalhão escuro com o nome, sempre direito (não roda com a roda); mostra por quanto os valores já dobraram
    ctx.save(); ctx.translate(cx, cy);
    const hg = ctx.createRadialGradient(-10, -12, 4, 0, 0, 50); hg.addColorStop(0, '#3a1030'); hg.addColorStop(1, '#0c0612');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, 50, 0, TAU); ctx.fill(); ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#ffd95e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `900 21px ${DISP}`; ctx.fillText('CRAZY', 0, -9); ctx.font = `900 ${st.k ? 19 : 15}px ${DISP}`; ctx.fillText(st.k ? '×' + 2 ** st.k : 'TIME', 0, 12);
    ctx.restore();
    if (st.flash > 0) { ctx.fillStyle = `rgba(255,217,94,${st.flash * 0.55})`; ctx.beginPath(); ctx.arc(cx, cy, R - 8, 0, TAU); ctx.fill(); }
    const NB = 40, ph = Math.floor(now * (st.sp ? 10 : 2.5));
    for (let i = 0; i < NB; i++) { const a = i * TAU / NB, on = (i + ph) % 2 === 0, bx = cx + (R - 3) * Math.cos(a), by = cy + (R - 3) * Math.sin(a); ctx.fillStyle = on ? '#fff6c2' : '#a17c22'; ctx.beginPath(); ctx.arc(bx, by, on ? 2.6 : 2.2, 0, TAU); ctx.fill(); }
    // os três flappers: triângulos presos por fora do aro, a apontar para a casa; o teu é maior e os que já acabaram ficam apagados
    flaps.forEach((off, f) => {
      const a = off * th - Math.PI / 2, mine = f === st.mine, on = st.active[f], sc = mine ? 1.18 : 0.92, wob = st.sp ? Math.sin(now * 38 + f * 2) * 0.16 * st.sp.v : 0;
      ctx.save(); ctx.translate(cx + (R + 17) * Math.cos(a), cy + (R + 17) * Math.sin(a)); ctx.rotate(a + Math.PI / 2 + wob); ctx.scale(sc, sc); ctx.globalAlpha = on ? 1 : 0.35;
      // comprido e estreito, com o bloco de fixação no lado largo: assim vê-se logo para onde aponta
      ctx.fillStyle = '#0008'; ctx.beginPath(); ctx.moveTo(-10, -13); ctx.lineTo(12, -13); ctx.lineTo(1, 21); ctx.closePath(); ctx.fill();
      ctx.fillStyle = FLAP_COR[f]; ctx.strokeStyle = mine ? '#fff' : '#f2c230'; ctx.lineWidth = mine ? 2.6 : 1.6; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-11, -15); ctx.lineTo(11, -15); ctx.lineTo(0, 19); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffffb0'; ctx.beginPath(); ctx.moveTo(-4, -9); ctx.lineTo(4, -9); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5a3206'; ctx.beginPath(); ctx.roundRect(-9, -24, 18, 10, 2); ctx.fill(); ctx.fillStyle = FLAP_COR[f]; ctx.beginPath(); ctx.roundRect(-6, -27, 12, 6, 2); ctx.fill();
      ctx.restore();
    });
  }
  function loop(ts) {
    const now = ts / 1000; if (!el.isConnected) { st.raf = 0; if (st.sp) { const d = st.sp.done; st.sp = null; d(); } return; }
    if (st.sp) {
      const sp = st.sp; if (sp.t0 === null) sp.t0 = now;
      const u = Math.min(1, (now - sp.t0) / sp.T), e = 1 - Math.pow(1 - u, 3.2); st.rot = sp.r0 + sp.d * e; sp.v = Math.pow(1 - u, 2.2);
      const k = Math.floor(st.rot / th + 0.5); if (k !== sp.k) { sp.k = k; if (performance.now() - sp.tk > 42) { sp.tk = performance.now(); sfx('tick'); } }
      if (u >= 1) { st.sp = null; st.rot = sp.r0 + sp.d; sp.done(); }
    }
    if (st.flash > 0) st.flash = Math.max(0, st.flash - 0.03);
    draw(now);
    st.raf = st.sp || st.flash > 0 || st.lit || performance.now() < st.until ? requestAnimationFrame(loop) : 0;
  }
  const wake = (ms = 0) => { st.until = Math.max(st.until || 0, performance.now() + ms); if (!st.raf) st.raf = requestAnimationFrame(loop); };
  draw(0);
  return {
    el,
    mine(f) { st.mine = f; wake(50); },
    active(f, on) { st.active[f] = on; wake(50); },
    light(list) { st.lit = list; wake(50); },                       // list: casa por flapper (null = apagado), ou null para apagar tudo
    double() { st.k++; st.flash = 1; paint(); wake(700); },          // todos os valores a dobrar, com um clarão
    // roda até a casa idx ficar por baixo do flapper do meio
    spin(idx, secs = 7) {
      const alvo = -idx * th + (Math.random() - 0.5) * th * 0.5, delta = mod(alvo - st.rot, TAU);
      st.lit = null;
      return new Promise((done) => { st.sp = { t0: null, T: secs, r0: st.rot, d: 4 * TAU + delta, k: 0, tk: 0, v: 1, done }; wake(); });
    },
    seg: (idx, f) => segs[mod(idx + flaps[f], N)], at: (idx, f) => mod(idx + flaps[f], N),
  };
}

// O bónus inteiro dentro do palco da roda. o = { segs, flaps, pickUntil, now(), canPick, pick(c), reveal(), sfx, vibrate, L }
//   pick(c)   → manda a escolha ao servidor; reveal() → espera que o servidor abra o resultado: { stops, mults, flap } (ou null)
//   L         → textos: { colors, pick, note, picked(f), yours, watch, auto, spin, dbl, dblAll(x), left(s) }
// Devolve { flap, mult } (o multiplicador do flapper do jogador, sem o do topo), ou null se não deu para saber.
export async function crazyBonus(stage, o) {
  const wheel = crazyWheel({ segs: o.segs, flaps: o.flaps, sfx: o.sfx });
  const banner = h('div', { class: 'crz-banner' }), clock = h('span', { class: 'crz-clock num' });
  const chips = o.flaps.map((_, f) => h('button', { class: 'crz-flap', type: 'button', style: `--fc:${FLAP_COR[f]}`, 'aria-label': o.L.colors[f], 'aria-pressed': 'false' }, h('i'), h('b')));
  const bar = h('i'), note = h('small', null, o.canPick ? o.L.note : '');
  const row = h('div', { class: 'crz-row' }, ...chips), msg = h('div', { class: 'crz-msg' }, h('span', null, o.canPick ? o.L.pick : o.L.watch), clock, h('div', { class: 'crz-bar' }, bar), note);
  const doors = h('div', { class: 'crz-doors' }, h('i'), h('i'));
  stage.append(h('div', { class: 'crz' }, h('div', { class: 'crz-top' }, wheel.el, banner), msg, row), doors);
  // entrada: a porta vermelha abre para a roda
  o.sfx('door'); requestAnimationFrame(() => doors.classList.add('open')); await wait(1000); doors.remove();
  // escolher o flapper enquanto o relógio corre
  let flap = -1;
  const marca = (f) => { flap = f; wheel.mine(f); chips.forEach((c, i) => { c.setAttribute('aria-pressed', i === f ? 'true' : 'false'); if (!c.classList.contains('fim') && !c.classList.contains('dbl')) c.lastChild.textContent = i === f ? o.L.yours : ''; }); };
  const escolhe = (f) => { if (!o.canPick || o.now() >= o.pickUntil - 250) return; marca(f); msg.firstChild.textContent = o.L.picked(f); note.textContent = ''; o.sfx('claim'); o.vibrate(12); o.pick(f); };
  // a barra esvazia até a escolha fechar
  const falta = Math.max(0, o.pickUntil - o.now()); bar.style.transition = `transform ${falta}ms linear`; requestAnimationFrame(() => { bar.style.transform = 'scaleX(0)'; });
  chips.forEach((c, f) => { c.disabled = !o.canPick; c.addEventListener('click', () => escolhe(f)); });
  while (o.now() < o.pickUntil) { clock.textContent = o.L.left(Math.max(0, Math.ceil((o.pickUntil - o.now()) / 1000))); await wait(200); if (!stage.isConnected) return null; }
  chips.forEach((c) => { c.disabled = true; }); clock.textContent = ''; note.textContent = ''; bar.parentNode.hidden = true; msg.firstChild.textContent = o.L.spin; stage.classList.add('crz-go');
  const r = await o.reveal(); if (!r || !stage.isConnected) return null;
  if (o.canPick && r.flap !== null && r.flap !== undefined) { if (flap < 0) msg.firstChild.textContent = o.L.auto; marca(r.flap); }   // sem escolha: o servidor deu-lhe um à sorte
  const done = [false, false, false];
  for (let n = 0; n < r.stops.length; n++) {
    await wheel.spin(r.stops[n], n ? 5.5 : 7); if (!stage.isConnected) return null;
    const antes = done.slice(); wheel.light(o.flaps.map((_, f) => (antes[f] ? null : wheel.at(r.stops[n], f))));
    let dobra = false;
    o.flaps.forEach((_, f) => {
      if (antes[f]) return; const s = wheel.seg(r.stops[n], f), b = chips[f].lastChild;
      if (s === 'D') { dobra = true; b.textContent = 'DOUBLE'; chips[f].classList.add('dbl'); }
      else { done[f] = true; b.textContent = '×' + r.mults[f]; chips[f].classList.remove('dbl'); chips[f].classList.add('fim'); wheel.active(f, false); }
    });
    // o que aconteceu ao teu flapper nesta volta: parou num valor (é o teu prémio) ou em DOUBLE (segue para a próxima, a dobrar)
    if (flap >= 0 && !antes[flap] && done[flap]) { banner.textContent = '×' + r.mults[flap]; banner.className = 'crz-banner on win'; o.sfx(r.mults[flap] >= 100 ? 'crit' : 'cash'); o.vibrate(20); }
    else if (dobra) { banner.textContent = o.L.dbl; banner.className = 'crz-banner on dbl'; o.sfx('level'); o.vibrate([20, 40, 20]); }
    await wait(1400);
    if (dobra && n + 1 < r.stops.length) { wheel.double(); o.sfx('refill'); msg.firstChild.textContent = o.L.dblAll(2 ** (n + 1)); await wait(1100); banner.classList.remove('on'); wheel.light(null); }
  }
  await wait(600);
  return { flap, mult: flap >= 0 ? r.mults[flap] : null };
}
