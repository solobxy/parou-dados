// Mesas do casino desenhadas à mão: roleta com bola, roda grande com lingueta, dados em 3D e os jogos de bónus.
// Aqui só se anima. O resultado chega sempre decidido pelo servidor e a animação vai ter com ele.

import { h } from './ui.js';

const TAU = Math.PI * 2;
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const DISP = '"Shoulders", "Arial Narrow", sans-serif';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function mkCanvas(w, hh, cls) {
  const c = document.createElement('canvas'), dpr = Math.min(2.5, window.devicePixelRatio || 1);
  c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); c.className = cls; c.style.aspectRatio = `${w} / ${hh}`;
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
  return [c, ctx, dpr];
}
function layer(size, dpr, draw) {
  const c = document.createElement('canvas'); c.width = c.height = Math.round(size * dpr);
  const x = c.getContext('2d'); x.scale(dpr, dpr); x.translate(size / 2, size / 2); draw(x);
  return c;
}
// corre enquanto o elemento estiver no ecrã; pára sozinho quando sai
function ticker(el, frame) {
  let on = false, last = 0;
  const step = (ts) => {
    if (!el.isConnected) { on = false; return; }
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    frame(dt, ts / 1000); requestAnimationFrame(step);
  };
  return () => { if (!on) { on = true; last = performance.now(); requestAnimationFrame(step); } };
}
function throttled(sfx, name, gap) { let t0 = 0; return () => { const n = performance.now(); if (n - t0 > gap) { t0 = n; sfx(name); } }; }

// ------------------------------------------------------------------ roleta
export function roulette({ order, colorOf, sfx }) {
  const W = 360, H = 292, cx = 180, cy = 132, K = 0.6, N = order.length, th = TAU / N;
  const R_OUT = 172, R_TRK = 151, R_NUM = 138, R_MID = 104, R_IN = 84, R_REST = 94;
  const [el, ctx, dpr] = mkCanvas(W, H, 'rl3');
  const COL = { r: '#c2161f', b: '#15171c', g: '#0f8a3c' }, COLD = { r: '#7d0d14', b: '#07080a', g: '#0a5a27' };

  const bowl = layer(R_OUT * 2, dpr, (x) => {
    let g = x.createRadialGradient(0, 0, R_NUM, 0, 0, R_OUT);
    g.addColorStop(0, '#3a1d0b'); g.addColorStop(0.5, '#7a4a22'); g.addColorStop(0.86, '#4a260f'); g.addColorStop(1, '#231006');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, R_OUT, 0, TAU); x.fill();
    x.lineWidth = 3; x.strokeStyle = '#d9b25a'; x.beginPath(); x.arc(0, 0, R_OUT - 2, 0, TAU); x.stroke();
    x.lineWidth = 1.5; x.strokeStyle = '#d9b25a88'; x.beginPath(); x.arc(0, 0, R_NUM + 1, 0, TAU); x.stroke();
    // deflectores
    for (let i = 0; i < 8; i++) {
      x.save(); x.rotate(i * TAU / 8 + 0.2); x.translate(R_TRK + 3, 0); if (i % 2) x.rotate(Math.PI / 2);
      const d = x.createLinearGradient(-7, 0, 7, 0); d.addColorStop(0, '#fff3c4'); d.addColorStop(0.5, '#d9b25a'); d.addColorStop(1, '#8a6420');
      x.fillStyle = d; x.beginPath(); x.moveTo(-8, 0); x.lineTo(0, -3.4); x.lineTo(8, 0); x.lineTo(0, 3.4); x.closePath(); x.fill(); x.restore();
    }
  });
  const rotor = layer(R_NUM * 2, dpr, (x) => {
    for (let i = 0; i < N; i++) {
      const c = colorOf(order[i]), a0 = (i - 0.5) * th - Math.PI / 2, a1 = a0 + th;
      x.fillStyle = COL[c]; x.beginPath(); x.arc(0, 0, R_NUM, a0, a1); x.arc(0, 0, R_MID, a1, a0, true); x.closePath(); x.fill();
      x.fillStyle = COLD[c]; x.beginPath(); x.arc(0, 0, R_MID, a0, a1); x.arc(0, 0, R_IN, a1, a0, true); x.closePath(); x.fill();
    }
    x.strokeStyle = '#e2c06a'; x.lineWidth = 1.2;
    for (let i = 0; i < N; i++) { const a = (i - 0.5) * th - Math.PI / 2; x.beginPath(); x.moveTo(R_IN * Math.cos(a), R_IN * Math.sin(a)); x.lineTo(R_NUM * Math.cos(a), R_NUM * Math.sin(a)); x.stroke(); }
    x.lineWidth = 1.6; [R_NUM - 0.8, R_MID, R_IN].forEach((r) => { x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); });
    x.fillStyle = '#fff'; x.font = `800 12.5px ${DISP}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 0; i < N; i++) { const a = i * th - Math.PI / 2; x.save(); x.translate(121 * Math.cos(a), 121 * Math.sin(a)); x.rotate(a + Math.PI / 2); x.fillText(String(order[i]), 0, 0.5); x.restore(); }
    // cone
    const g = x.createRadialGradient(-14, -18, 6, 0, 0, R_IN);
    g.addColorStop(0, '#b5793c'); g.addColorStop(0.55, '#6a3a18'); g.addColorStop(1, '#2c1408');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, R_IN - 1, 0, TAU); x.fill();
    x.strokeStyle = '#d9b25a66'; x.lineWidth = 1; for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(0, 0, 30 + i * 13, 0, TAU); x.stroke(); }
  });

  const st = { wa: 0, sp: null, idx: 0, glow: 0, resolve: null };
  const IDLE = 0.32, KICK = 1.7, WT = 3, W0 = 11.5, BT = 2.6, TA = 4.3, D = 1.35, TB = TA + D, C = 0.45;
  const waAt = (sp, t) => sp.wa0 + IDLE * t + KICK * WT * (1 - Math.exp(-t / WT));
  const tickDef = throttled(sfx, 'tick', 70);

  function ballAt(sp, t) {
    const wa = waAt(sp, t);
    if (t < TA) {
      const a = sp.b0 - W0 * BT * (1 - Math.exp(-t / BT)), u = clamp((t - (TA - 1.4)) / 1.4, 0, 1);
      return { a, r: R_TRK - 11 * u * u, z: 0, wa };
    }
    if (t < TB) {
      const s = (t - TA) / D, m0 = sp.va * D, p0 = sp.psiA, p1 = p0 + C * m0, s2 = s * s, s3 = s2 * s;
      const psi = (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1;
      return { a: wa + psi, r: 140 - (140 - R_REST) * (1 - (1 - s) * (1 - s)), z: 13 * Math.abs(Math.sin(Math.PI * s * 2.5)) * Math.pow(1 - s, 1.4), wa, hop: Math.floor(s * 2.5) };
    }
    const u = t - TB;
    return { a: wa + sp.phi + 0.05 * Math.exp(-5 * u) * Math.sin(20 * u), r: R_REST, z: 0, wa, rest: true };
  }
  function draw(dt, now) {
    let b;
    if (st.sp) {
      const sp = st.sp; if (sp.t0 === undefined) sp.t0 = now - sp.t; sp.t = now - sp.t0; b = ballAt(sp, sp.t); st.wa = b.wa;   // relógio real: num telemóvel lento a jogada não fica em câmara lenta
      if (sp.t < TA) { const k = Math.floor(b.a / (TAU / 8)); if (k !== sp.k) { sp.k = k; tickDef(); } }
      else if (!b.rest && b.hop !== sp.hop) { sp.hop = b.hop; sfx('deal'); }
      if (b.rest && !sp.landed) { sp.landed = true; st.idx = sp.idx; sfx('claim'); }
      if (b.rest) st.glow = Math.min(1, st.glow + dt * 3);
      if (sp.t > TB + 1.7 && st.resolve) { const r = st.resolve; st.resolve = null; r(); }
    } else {
      if (!RM()) st.wa += IDLE * dt;
      b = { a: st.wa + st.idx * th - Math.PI / 2, r: R_REST, z: 0 };
    }
    ctx.clearRect(0, 0, W, H);
    // sombra e parede da mesa
    ctx.fillStyle = '#0008'; ctx.beginPath(); ctx.ellipse(cx, cy + 34, R_OUT + 4, (R_OUT + 4) * K, 0, 0, TAU); ctx.fill();
    const wall = ctx.createLinearGradient(cx - R_OUT, 0, cx + R_OUT, 0); wall.addColorStop(0, '#1a0c04'); wall.addColorStop(0.5, '#5b3113'); wall.addColorStop(1, '#1a0c04');
    ctx.fillStyle = wall; ctx.beginPath(); ctx.ellipse(cx, cy + 20, R_OUT, R_OUT * K, 0, 0, Math.PI); ctx.lineTo(cx - R_OUT, cy); ctx.lineTo(cx + R_OUT, cy); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, K);
    ctx.drawImage(bowl, -R_OUT, -R_OUT, R_OUT * 2, R_OUT * 2);
    ctx.save(); ctx.rotate(st.wa); ctx.drawImage(rotor, -R_NUM, -R_NUM, R_NUM * 2, R_NUM * 2);
    if (st.glow > 0) {
      const a0 = (st.idx - 0.5) * th - Math.PI / 2;
      ctx.fillStyle = `rgba(255,224,130,${(0.3 + 0.25 * Math.sin(now * 7)) * st.glow})`; ctx.beginPath(); ctx.arc(0, 0, R_NUM, a0, a0 + th); ctx.arc(0, 0, R_IN, a0 + th, a0, true); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(255,240,190,${st.glow})`; ctx.lineWidth = 2.5; ctx.stroke();
    }
    ctx.restore();
    // brilho do verniz
    const sh = ctx.createLinearGradient(-R_OUT, -R_OUT, R_OUT, R_OUT); sh.addColorStop(0.2, '#ffffff22'); sh.addColorStop(0.45, '#ffffff00');
    ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, R_OUT, 0, TAU); ctx.arc(0, 0, R_NUM, 0, TAU, true); ctx.fill();
    ctx.restore();
    // torre ao centro, com altura
    for (let i = 0; i < 4; i++) {
      const a = st.wa + i * TAU / 4, ex = cx + 40 * Math.cos(a), ey = cy - 9 + 40 * Math.sin(a) * K;
      ctx.strokeStyle = '#8a6420'; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = '#f0d58a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy - 10); ctx.lineTo(ex, ey - 1); ctx.stroke();
      ctx.fillStyle = '#f0d58a'; ctx.beginPath(); ctx.arc(ex, ey - 1, 4.2, 0, TAU); ctx.fill();
    }
    for (let hh = 0; hh <= 24; hh += 2) {
      const rr = hh < 8 ? 20 - hh * 0.6 : hh < 18 ? 9 : 9 + Math.sin(((hh - 18) / 6) * Math.PI) * 4;
      const g = ctx.createLinearGradient(cx - rr, 0, cx + rr, 0); g.addColorStop(0, '#7a5518'); g.addColorStop(0.35, '#fff1bf'); g.addColorStop(0.7, '#d9b25a'); g.addColorStop(1, '#6b4a12');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy - hh, rr, rr * K, 0, 0, TAU); ctx.fill();
    }
    // bola
    const zb = ((b.r - R_REST) / (R_TRK - R_REST)) * 9 + b.z, bx = cx + b.r * Math.cos(b.a), by = cy + b.r * Math.sin(b.a) * K, rad = 6.3 + 1.1 * Math.sin(b.a);
    ctx.fillStyle = `rgba(0,0,0,${clamp(0.5 - b.z * 0.02, 0.15, 0.5)})`; ctx.beginPath(); ctx.ellipse(bx + 2 + b.z * 0.35, by + 2.5, rad * (1 + b.z * 0.02), rad * 0.6, 0, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(bx - rad * 0.35, by - 3 - zb - rad * 0.4, 0.5, bx, by - 3 - zb, rad);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#e9ecf2'); g.addColorStop(1, '#8e96a6');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by - 3 - zb, rad, 0, TAU); ctx.fill();
  }
  const wake = ticker(el, draw);
  return {
    el, wake,
    set(n) { st.idx = Math.max(0, order.indexOf(n)); },
    spin(n) {
      const idx = Math.max(0, order.indexOf(n)), sp = { t: 0, wa0: st.wa, idx, phi: idx * th - Math.PI / 2, k: 0, hop: 0 };
      sp.va = -W0 * Math.exp(-TA / BT) - (IDLE + KICK * Math.exp(-TA / WT));
      sp.psiA = sp.phi - sp.va * D * C;
      sp.b0 = waAt(sp, TA) + sp.psiA + W0 * BT * (1 - Math.exp(-TA / BT));
      st.glow = 0;
      if (RM()) { sp.t = TB; }
      st.sp = sp; wake();
      return new Promise((res) => { st.resolve = res; if (RM()) setTimeout(() => { if (st.resolve) { st.resolve = null; res(); } }, 700); });
    },
  };
}

// ------------------------------------------------------------------ roda grande com lingueta
// segs: [{ text, color, big }]. A casa 0 começa no topo.
export function bigWheel({ segs, sfx, hub = '', cls = 'bw3', turns = 5, secs = 8.5 }) {
  const W = 360, H = 404, cx = 180, cy = 190, R = 158, N = segs.length, th = TAU / N;
  const [el, ctx, dpr] = mkCanvas(W, H, cls);
  const face = layer(R * 2, dpr, (x) => {
    segs.forEach((s, i) => {
      const a0 = (i - 0.5) * th - Math.PI / 2, a1 = a0 + th, a = i * th - Math.PI / 2;
      x.fillStyle = s.color; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R - 9, a0, a1); x.closePath(); x.fill();
      x.strokeStyle = '#e2c06a'; x.lineWidth = 1.1; x.stroke();
      x.save(); x.fillStyle = s.ink || '#fff'; x.strokeStyle = '#000b'; x.lineJoin = 'round'; x.textAlign = 'center'; x.textBaseline = 'middle';
      if (s.big) { x.translate((R - 30) * Math.cos(a), (R - 30) * Math.sin(a)); x.rotate(a + Math.PI / 2); x.font = `900 ${N > 30 ? 19 : 22}px ${DISP}`; x.lineWidth = 3; x.strokeText(s.text, 0, 0); x.fillText(s.text, 0, 0); }
      else { x.translate((R - 46) * Math.cos(a), (R - 46) * Math.sin(a)); x.rotate(a); x.font = `900 10.5px ${DISP}`; x.lineWidth = 2.5; x.strokeText(s.text, 0, 0.5); x.fillText(s.text, 0, 0.5); }
      x.restore();
    });
    // sombreado: mais escuro para dentro
    const g = x.createRadialGradient(0, 0, 30, 0, 0, R - 9); g.addColorStop(0, '#0009'); g.addColorStop(0.45, '#0002'); g.addColorStop(1, '#ffffff10');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, R - 9, 0, TAU); x.fill();
    // anel interior e cubo
    x.strokeStyle = '#f0d58a'; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 58, 0, TAU); x.stroke();
    // medalhão ao centro: laca preta com raios dourados, à maneira art déco
    const hg = x.createRadialGradient(-14, -16, 4, 0, 0, 56); hg.addColorStop(0, '#2a2f3a'); hg.addColorStop(1, '#07080b');
    x.fillStyle = hg; x.beginPath(); x.arc(0, 0, 56, 0, TAU); x.fill();
    x.fillStyle = '#d9b25a33'; for (let i = 0; i < 16; i++) { const a = i * TAU / 16; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 54, a, a + TAU / 32); x.closePath(); x.fill(); }
    x.fillStyle = '#0b0d12'; x.beginPath(); x.arc(0, 0, 40, 0, TAU); x.fill();
    x.strokeStyle = '#e2c06a'; x.lineWidth = 1.5; x.beginPath(); x.arc(0, 0, 40, 0, TAU); x.stroke(); x.beginPath(); x.arc(0, 0, 51, 0, TAU); x.stroke();
    if (hub) {
      x.fillStyle = '#f0d58a'; x.textAlign = 'center'; x.textBaseline = 'middle'; const ws = hub.split(' ');
      x.font = `900 ${ws.length > 1 ? 15 : 17}px ${DISP}`;
      if (ws.length > 1) { const m = Math.ceil(ws.length / 2); x.fillText(ws.slice(0, m).join(' '), 0, -8); x.fillText(ws.slice(m).join(' '), 0, 9); } else x.fillText(hub, 0, 1);
    }
    // pinos
    for (let i = 0; i < N; i++) { const a = (i - 0.5) * th - Math.PI / 2, px = (R - 9) * Math.cos(a), py = (R - 9) * Math.sin(a); x.fillStyle = '#fff6d6'; x.beginPath(); x.arc(px, py, N > 30 ? 2.3 : 3.2, 0, TAU); x.fill(); x.fillStyle = '#8a6420'; x.beginPath(); x.arc(px + 0.6, py + 0.8, 1, 0, TAU); x.fill(); }
  });
  const st = { rot: 0, sp: null, flap: 0, win: -1, flash: 0, resolve: null };
  const ease = (u) => 1 - Math.pow(1 - u, 3.4);
  const tick = throttled(sfx, 'tick', 45);
  function draw(dt, now) {
    if (st.sp) {
      const sp = st.sp; if (sp.t0 === undefined) sp.t0 = now; sp.t = now - sp.t0; const u = clamp(sp.t / sp.T, 0, 1);
      st.rot = sp.r0 + sp.d * ease(u);
      const k = Math.floor(st.rot / th + 0.5); if (k !== sp.k) { sp.k = k; tick(); }
      if (u >= 1 && !sp.done) { sp.done = true; st.win = sp.idx; st.flash = 0; sfx('claim'); }
      if (sp.done) { st.flash = sp.t - sp.T; if (st.flash > 1.5 && st.resolve) { const r = st.resolve; st.resolve = null; r(); } }
    }
    // lingueta: o pino empurra-a e ela salta para trás
    const x = ((st.rot / th + 0.5) % 1 + 1) % 1, want = x > 0.7 ? ((x - 0.7) / 0.3) * 0.5 : 0.5 * Math.max(0, 1 - x / 0.1);
    st.flap += (want - st.flap) * Math.min(1, dt * 40);
    ctx.clearRect(0, 0, W, H);
    // pé
    const bg = ctx.createLinearGradient(0, cy + R - 20, 0, H); bg.addColorStop(0, '#5b3a0c'); bg.addColorStop(1, '#1d1203');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(cx - 44, cy + R - 30); ctx.lineTo(cx + 44, cy + R - 30); ctx.lineTo(cx + 96, H - 8); ctx.lineTo(cx - 96, H - 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d9a531'; ctx.fillRect(cx - 104, H - 12, 208, 8);
    // aro
    ctx.fillStyle = '#0009'; ctx.beginPath(); ctx.arc(cx + 3, cy + 6, R + 4, 0, TAU); ctx.fill();
    const rg = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R); rg.addColorStop(0, '#fff1bf'); rg.addColorStop(0.3, '#d9a531'); rg.addColorStop(0.6, '#7a4e0a'); rg.addColorStop(1, '#e8c15a');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, R + 2, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(st.rot); ctx.drawImage(face, -R, -R, R * 2, R * 2);
    if (st.win >= 0) {
      const a0 = (st.win - 0.5) * th - Math.PI / 2;
      ctx.fillStyle = `rgba(255,255,255,${0.22 + 0.22 * Math.sin(now * 9)})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R - 9, a0, a0 + th); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
    }
    ctx.restore();
    // lâmpadas
    const NB = 32, ph = Math.floor(now * (st.sp && !st.sp.done ? 9 : 2.5));
    for (let i = 0; i < NB; i++) {
      const a = i * TAU / NB, on = (i + ph) % 3 === 0, bx = cx + (R - 2.5) * Math.cos(a), by = cy + (R - 2.5) * Math.sin(a);
      if (on) { ctx.fillStyle = '#ffd75e55'; ctx.beginPath(); ctx.arc(bx, by, 6.5, 0, TAU); ctx.fill(); }
      ctx.fillStyle = on ? '#fff3b0' : '#9b7a2a'; ctx.beginPath(); ctx.arc(bx, by, 3, 0, TAU); ctx.fill();
    }
    // lingueta
    ctx.save(); ctx.translate(cx, cy - R - 13); ctx.rotate(-st.flap);
    ctx.fillStyle = '#0007'; ctx.beginPath(); ctx.moveTo(-10, 2); ctx.lineTo(12, 2); ctx.lineTo(2, 36); ctx.closePath(); ctx.fill();
    const fg = ctx.createLinearGradient(-11, 0, 11, 0); fg.addColorStop(0, '#ff5a52'); fg.addColorStop(1, '#a8121b');
    ctx.fillStyle = fg; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.lineTo(0, 33); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f0d58a'; ctx.beginPath(); ctx.arc(0, 2, 5, 0, TAU); ctx.fill();
    ctx.restore();
  }
  const wake = ticker(el, draw);
  return {
    el, wake,
    set(idx) { st.rot = -idx * th; st.win = -1; },
    spin(idx) {
      const off = (Math.random() - 0.5) * th * 0.56, cur = st.rot;
      const base = -idx * th + off, delta = ((base - cur) % TAU + TAU) % TAU;
      st.win = -1;
      st.sp = { t: 0, T: RM() ? 0.5 : secs, r0: cur, d: (RM() ? 0 : turns * TAU) + delta, idx, k: Math.floor(cur / th + 0.5) };
      wake();
      return new Promise((res) => { st.resolve = res; });
    },
  };
}

// ------------------------------------------------------------------ dados em 3D
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FACE_UP = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };   // [rotateX, rotateY] que põe a face virada para cima
export function diceTable({ sfx }) {
  const mk = () => h('div', { class: 'd3' }, [1, 2, 3, 4, 5, 6].map((v) => h('div', { class: 'f f' + v }, Array.from({ length: 9 }, (_, i) => h('i', { class: PIPS[v].includes(i) ? 'on' : '' })))));
  const dice = [mk(), mk()], shadows = [h('div', { class: 'd3sh' }), h('div', { class: 'd3sh' })];
  const floor = h('div', { class: 'dc3floor' }, shadows, dice), el = h('div', { class: 'dc3', role: 'img' }, floor);
  const S0 = 58, rest = [{ x: -44, y: 6, yaw: -14 }, { x: 46, y: -8, yaw: 22 }];
  const place = (k, x, y, z, yaw, rx, ry) => {
    dice[k].style.transform = `translate3d(${x}px,${y}px,${z + S0 / 2}px) rotateZ(${yaw}deg) rotateX(${rx}deg) rotateY(${ry}deg)`;
    shadows[k].style.transform = `translate3d(${x + z * 0.25}px,${y + z * 0.25}px,1px) scale(${1 + z / 160})`; shadows[k].style.opacity = String(clamp(0.55 - z / 260, 0.12, 0.55));
  };
  const set = (a, b) => [a, b].forEach((v, k) => { const [rx, ry] = FACE_UP[v]; place(k, rest[k].x, rest[k].y, 0, rest[k].yaw, rx, ry); });
  set(3, 4);
  // altura: três saltos cada vez mais pequenos
  const BN = [[0, 0.44, 96], [0.44, 0.72, 44], [0.72, 0.9, 16], [0.9, 1, 4]];
  const zAt = (u) => { for (const [a, b, hh] of BN) if (u <= b) { const s = (u - a) / (b - a); return hh * 4 * s * (1 - s); } return 0; };
  return {
    el, set,
    roll(a, b) {
      if (RM()) { set(a, b); return wait(350); }
      const T = 1750, t0 = performance.now(), vals = [a, b];
      const P = vals.map((v, k) => {
        const [rx, ry] = FACE_UP[v], end = { x: rest[k].x + (Math.random() * 24 - 12), y: rest[k].y + (Math.random() * 16 - 8), yaw: Math.random() * 70 - 35 };
        rest[k] = end;
        return { rx, ry, end, sx: -250 - k * 40, sy: 70 - k * 110, nx: (2 + Math.floor(Math.random() * 2)) * (k ? -1 : 1), ny: 2 + Math.floor(Math.random() * 2), lag: k * 0.07 };
      });
      let lastB = [0, 0];
      return new Promise((res) => {
        const step = (ts) => {
          const u0 = (ts - t0) / T; let done = true;
          P.forEach((p, k) => {
            const u = clamp(u0 - p.lag, 0, 1), e = 1 - Math.pow(1 - u, 2.6); if (u < 1) done = false;
            place(k, p.sx + (p.end.x - p.sx) * e, p.sy + (p.end.y - p.sy) * e, zAt(u), p.end.yaw + 260 * (1 - e), p.rx + 360 * p.nx * (1 - e), p.ry + 360 * p.ny * (1 - e));
            const bi = BN.findIndex(([x0, x1]) => u <= x1); if (bi > lastB[k]) { lastB[k] = bi; sfx(bi < 3 ? 'deal' : 'tick'); }
          });
          if (!done && el.isConnected) requestAnimationFrame(step); else { set(a, b); res(); }
        };
        requestAnimationFrame(step);
      });
    },
  };
}

// ------------------------------------------------------------------ bónus: cara ou coroa
export async function coinFlip(stage, { sides, side, sfx, L }) {
  const lab = [h('div', { class: 'cfs a' }, h('small', null, L.red), h('b', null, '×?')), h('div', { class: 'cfs b' }, h('small', null, L.blue), h('b', null, '×?'))];
  const coin = h('div', { class: 'cf3coin' }, Array.from({ length: 7 }, (_, i) => h('i', { class: 'edge', style: `transform:translateZ(${i * 2 - 6}px)` })), h('span', { class: 'fa' }, '?'), h('span', { class: 'fb' }, '?'));
  const sh = h('div', { class: 'cf3sh' }), table = h('div', { class: 'cf3table' }, sh, coin);
  stage.append(h('div', { class: 'cfsides' }, lab), h('div', { class: 'cf3' }, table));
  const fa = coin.querySelector('.fa'), fb = coin.querySelector('.fb');
  const put = (z, rx) => { coin.style.transform = `translateZ(${z + 8}px) rotateX(${rx}deg)`; sh.style.transform = `scale(${1 - z / 520})`; sh.style.opacity = String(clamp(0.6 - z / 500, 0.15, 0.6)); };
  put(0, 0);
  // os dois lados sorteiam o seu multiplicador
  const pool = [2, 3, 5, 7, 10, 15, 20, 25, 50, 100];
  for (let k = 0; k < 2; k++) {
    const b = lab[k].querySelector('b');
    if (!RM()) for (let i = 0; i < 14; i++) { b.textContent = '×' + pool[Math.floor(Math.random() * pool.length)]; sfx('tick'); await wait(45 + i * 9); }
    b.textContent = '×' + sides[k]; (k ? fb : fa).textContent = '×' + sides[k]; lab[k].classList.add('set'); sfx('buy'); await wait(RM() ? 100 : 450);
  }
  if (RM()) { put(0, side ? 180 : 0); }
  else {
    await wait(350);
    const T = 2300, t0 = performance.now(), total = 360 * 9 + (side ? 180 : 0);
    await new Promise((res) => {
      const step = (ts) => {
        const u = clamp((ts - t0) / T, 0, 1);
        // sobe e cai (0–0,82), depois um ressalto curto
        const z = u < 0.82 ? 330 * 4 * (u / 0.82) * (1 - u / 0.82) : 26 * 4 * ((u - 0.82) / 0.18) * (1 - (u - 0.82) / 0.18);
        const e = u < 0.82 ? u / 0.82 : 1; put(z, total * (1 - Math.pow(1 - e, 1.5)));
        if (u < 1 && coin.isConnected) requestAnimationFrame(step); else res();
      };
      sfx('refill'); requestAnimationFrame(step);
    });
    sfx('deal');
  }
  lab[side].classList.add('win'); lab[1 - side].classList.add('lost'); sfx('claim');
  await wait(RM() ? 300 : 900);
  return sides[side];
}

// ------------------------------------------------------------------ bónus: caça ao tesouro (alvos tapados, escolhes um)
export async function cashHunt(stage, { boxes, pick, sfx, L }) {
  const n = boxes.length, cols = 4, SH = ['★', '♦', '♣', '♥', '♠', '●', '▲', '■'];
  const tiles = boxes.map((_, i) => h('button', { class: 'ch3t', style: `--hue:${(i * 47) % 360}` }, h('span', { class: 'fr' }, SH[i % SH.length]), h('span', { class: 'bk' }, '')));
  const grid = h('div', { class: 'ch3', style: `--cols:${cols}` }, tiles), bar = h('i'), msg = h('div', { class: 'ch3msg' }, h('span', null, L.shuffle), h('div', { class: 'ch3bar' }, bar));
  stage.append(grid, msg);
  // 1) baralha os alvos tapados (não se mostram os prémios antes: seria fingir que dá para os seguir)
  const order = boxes.map((_, i) => i);
  if (!RM()) {
    await wait(500);
    const cell = tiles[0].getBoundingClientRect(), gap = 6, pos = (k) => [(k % cols) * (cell.width + gap), Math.floor(k / cols) * (cell.height + gap)];
    for (let r = 0; r < 7; r++) {
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      order.forEach((slot, i) => { const [x0, y0] = pos(i), [x1, y1] = pos(slot); tiles[i].style.transform = `translate(${x1 - x0}px,${y1 - y0}px)`; });
      sfx('deal'); await wait(300);
    }
  }
  // 2) escolhes (ou escolhe-se sozinho ao fim de 7 s). O prémio já vinha decidido: qualquer alvo vale o mesmo sorteio.
  msg.firstChild.textContent = L.pick; grid.classList.add('live');
  bar.style.transition = 'transform 7s linear'; requestAnimationFrame(() => { bar.style.transform = 'scaleX(0)'; });
  const chosen = await new Promise((res) => {
    const tm = setTimeout(() => res(Math.floor(Math.random() * n)), 7000);
    tiles.forEach((tl, i) => tl.addEventListener('click', () => { clearTimeout(tm); res(i); }, { once: true }));
  });
  grid.classList.remove('live'); msg.firstChild.textContent = '';
  const rest = boxes.filter((_, i) => i !== pick); let k = 0;
  tiles[chosen].querySelector('.bk').textContent = '×' + boxes[pick]; tiles[chosen].classList.add('shot'); sfx('hit'); await wait(RM() ? 100 : 380);
  tiles[chosen].classList.add('open', 'win'); sfx('claim'); await wait(RM() ? 300 : 1000);
  tiles.forEach((tl, i) => { if (i !== chosen) { tl.querySelector('.bk').textContent = '×' + rest[k++]; tl.classList.add('open', 'dim'); } });
  await wait(RM() ? 300 : 1100);
  return boxes[pick];
}

// ------------------------------------------------------------------ bónus: pachinko
export async function pachinko(stage, { slots, at, sfx }) {
  const W = 340, H = 372, n = slots.length, cw = W / n, ROWS = 10, y0 = 46, dy = 26, yS = y0 + ROWS * dy;
  const [el, ctx] = mkCanvas(W, H, 'pk3'); stage.append(el);
  // caminho de trás para a frente: acaba na casa certa e nunca sai do tabuleiro
  const xs = [at + 0.5];
  for (let j = ROWS; j >= 1; j--) {
    const x = xs[0], opts = [-0.5, 0.5].filter((s) => x - s >= 0.5 && x - s <= n - 0.5);
    const pull = x > n / 2 ? 0.5 : -0.5, s = opts.length === 1 ? opts[0] : Math.random() < (j > ROWS - 3 ? 0.5 : 0.62) ? (opts.includes(pull) ? pull : opts[0]) : -pull;
    xs.unshift(x - (opts.includes(s) ? s : opts[0]));
  }
  const pegRow = (j) => { const half = Math.abs((xs[j] * 2) % 2) === 1, out = []; for (let x = half ? 0.5 : 1; x < n; x++) out.push(x); return out; };
  const hi = (v) => (v >= 100 ? '#ffd24a' : v >= 50 ? '#ff7ad1' : v >= 20 ? '#7ad7ff' : '#b9c2d6');
  let ball = { x: xs[0] * cw, y: 8 }, lit = -1, hitPeg = null, glow = 0;
  const draw = (now) => {
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#12314a'); bg.addColorStop(1, '#0a1626');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    for (let j = 0; j < ROWS; j++) for (const px of pegRow(j)) {
      const on = hitPeg && hitPeg[0] === j && Math.abs(hitPeg[1] - px) < 0.01;
      ctx.fillStyle = on ? '#fff' : '#f0d58a'; ctx.shadowColor = '#ffd75e'; ctx.shadowBlur = on ? 14 : 3;
      ctx.beginPath(); ctx.arc(px * cw, y0 + j * dy, on ? 4.6 : 3.4, 0, TAU); ctx.fill();
    }
    ctx.shadowBlur = 0;
    slots.forEach((v, i) => {
      const on = i === lit; ctx.fillStyle = on ? hi(v) : '#0d2236'; ctx.fillRect(i * cw + 1, yS + 8, cw - 2, H - yS - 10);
      ctx.strokeStyle = hi(v); ctx.lineWidth = 1.5; ctx.strokeRect(i * cw + 1.5, yS + 8.5, cw - 3, H - yS - 11);
      ctx.fillStyle = on ? '#10151f' : hi(v); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(i * cw + cw / 2, yS + 8 + (H - yS - 10) / 2); ctx.rotate(-Math.PI / 2); ctx.font = `900 ${on ? 17 : 14}px ${DISP}`; ctx.fillText('×' + v, 0, 1); ctx.restore();
      ctx.fillStyle = '#f0d58a'; ctx.fillRect(i * cw - 1, yS, 2, 10);
    });
    if (lit >= 0) { ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.15 * Math.sin(now / 90)})`; ctx.fillRect(lit * cw + 1, yS + 8, cw - 2, H - yS - 10); }
    const g = ctx.createRadialGradient(ball.x - 3, ball.y - 4, 1, ball.x, ball.y, 9); g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#ff9bd6'); g.addColorStop(1, '#c2186f');
    ctx.fillStyle = g; ctx.shadowColor = '#ff7ad1'; ctx.shadowBlur = 12 + glow; ctx.beginPath(); ctx.arc(ball.x, ball.y, 8.5, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
  };
  draw(0);
  if (RM()) { lit = at; ball = { x: (at + 0.5) * cw, y: yS + 2 }; draw(0); await wait(500); return slots[at]; }
  await wait(500);
  const seg = (fromX, fromY, toX, toY, ms, bounce) => new Promise((res) => {
    const t0 = performance.now();
    const step = (ts) => {
      const u = clamp((ts - t0) / ms, 0, 1);
      ball.x = fromX + (toX - fromX) * u; ball.y = fromY + (toY - fromY) * u * u - bounce * Math.sin(Math.PI * u) * (1 - u);
      draw(ts); if (u < 1 && el.isConnected) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  await seg(xs[0] * cw, 8, xs[0] * cw, y0 - 9, 300, 0); hitPeg = [0, xs[0]]; sfx('tick');
  for (let j = 0; j < ROWS; j++) {
    const ty = j < ROWS - 1 ? y0 + (j + 1) * dy - 9 : yS + 2;
    await seg(xs[j] * cw, y0 + j * dy - 9, xs[j + 1] * cw, ty, 250 + Math.random() * 90, 13);
    if (j < ROWS - 1) { hitPeg = [j + 1, xs[j + 1]]; sfx('tick'); }
  }
  hitPeg = null; lit = at; glow = 14; sfx('claim');
  const t1 = performance.now(); await new Promise((res) => { const step = (ts) => { draw(ts); if (ts - t1 < 1300 && el.isConnected) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
  return slots[at];
}
