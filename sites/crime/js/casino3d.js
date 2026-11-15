// Mesas do casino desenhadas à mão: roleta com bola, roda grande com lingueta, dados em 3D e os jogos de bónus.
// Aqui só se anima. O resultado chega sempre decidido pelo servidor e a animação vai ter com ele.

import { h } from './ui.js';

const TAU = Math.PI * 2;
// As animações do jogo correm sempre, mesmo com «remover animações» ou poupança de bateria ligados no telemóvel:
// aqui a animação é o próprio jogo (a bola, a roda, os símbolos a cair).
const RM = () => false;
const DISP = '"Archivo Manchete", "Arial Narrow", sans-serif';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Nas mesas ao vivo a jogada tem de ser igual em todos os telemóveis: o acaso da animação (velocidade do lançamento,
// caminho da bola, baralhar das cartas) sai de um gerador com a semente da ronda, que é a mesma para toda a gente.
let rand = Math.random;
export function seed(n) {
  if (n === null || n === undefined) { rand = Math.random; return; }
  let a = (Number(n) ^ 0x9e3779b9) >>> 0;
  rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const norm = (x) => { const y = ((x % TAU) + TAU) % TAU; return y > Math.PI ? y - TAU : y; };

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
function ticker(el, frame, gone) {
  let on = false, last = 0;
  const step = (ts) => {
    if (!el.isConnected) { on = false; gone && gone(); return; }   // saíste do ecrã a meio: a jogada dá-se por acabada
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
  const IDLE = 0.32, KICK = 1.7, WT = 3, W0 = 11.5, BT = 2.6, TA = 3.6, D = 1.35, TB = TA + D, C = 0.45;
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
      const sp = st.sp; if (sp.t0 === undefined) sp.t0 = now - sp.t; sp.t = now - sp.t0; b = ballAt(sp, sp.t); st.wa = b.wa + sp.err * Math.exp(-sp.t / 0.5);   // relógio real: num telemóvel lento a jogada não fica em câmara lenta
      if (sp.t < TA) { const k = Math.floor(b.a / (TAU / 8)); if (k !== sp.k) { sp.k = k; tickDef(); } }
      else if (!b.rest && b.hop !== sp.hop) { sp.hop = b.hop; sfx('deal'); }
      if (b.rest && !sp.landed) { sp.landed = true; st.idx = sp.idx; sfx('claim'); }
      if (b.rest) st.glow = Math.min(1, st.glow + dt * 3);
      if (sp.t > TB + 1 && st.resolve) { const r = st.resolve; st.resolve = null; r(); }
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
  const wake = ticker(el, draw, () => { if (st.sp) { st.idx = st.sp.idx; st.sp = null; st.glow = 1; } if (st.resolve) { const r = st.resolve; st.resolve = null; r(); } });
  return {
    el, wake,
    set(n) { st.idx = Math.max(0, order.indexOf(n)); st.sp = null; st.glow = 1; },
    spin(n, t0) {
      const wa0 = t0 === undefined ? st.wa : (IDLE * t0) % TAU;
      const idx = Math.max(0, order.indexOf(n)), sp = { t: 0, wa0, err: norm(st.wa - wa0), idx, phi: idx * th - Math.PI / 2, k: 0, hop: 0 };
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
// Física da roda, em «casas» (1 = distância entre dois pinos): p = posição, v = casas por segundo.
// A roda perde velocidade com o atrito e com a lingueta de borracha, que cada pino dobra até a soltar. No fim, se a roda
// já não tem força para dobrar a lingueta até ao fim, é a lingueta que a empurra para trás: «quase passou, mas voltou».
// O resultado continua a ser sorteado pelo servidor (cada casa com a mesma probabilidade): aqui escolhe-se, entre os
// lançamentos possíveis, um que acabe nessa casa, e a jogada que se vê é a simulação desse lançamento, sem atalhos.
const PH = { a: 0.3, r: 0.3, K: 1.2, mu: 0.8, b: 0.28, fmax: 0.64, wn: 58, z: 0.34, dt: 1 / 300 };
const wheelSim = (p, v) => ({ p, v, mode: 0, kq: 0, phi: 0, phiv: 0, t: 0, done: false, ticks: 0, back: 0, maxo: 0 });
function wheelStep(s) {
  const { a, r, K, mu, b, fmax, wn, z, dt } = PH, L = a + r, q = s.p + 0.5;
  let F = 0;
  if (s.mode === 1) {
    const o = q - s.kq;
    if (o >= r) { s.mode = 0; s.phiv = 0; }                       // o pino passou: a lingueta solta-se
    else if (o < -a) { s.mode = 0; s.phi = 0; s.phiv = 0; }        // a roda recuou e largou a lingueta
    else { const c = o + a; s.phi = fmax * c / L; F = -K * c / (L * L); if (o > s.maxo) s.maxo = o; }
  } else if (s.mode === -1) {
    const o = q - s.kq;
    if (o <= -r) { s.mode = 0; s.phiv = 0; }
    else if (o > a) { s.mode = 0; s.phi = 0; s.phiv = 0; }
    else { const c = a - o; s.phi = -fmax * c / L; F = K * c / (L * L); }
  }
  if (s.mode === 0) {
    s.phiv += (-wn * wn * s.phi - 2 * z * wn * s.phiv) * dt; s.phi += s.phiv * dt;
    const kb = Math.ceil(q), ob = q - kb;                           // pino que vem de trás
    if (s.v >= 0 && ob >= -a) { const kin = fmax * (ob + a) / L; if (s.phi <= kin) { s.mode = 1; s.kq = kb; s.phi = kin; s.ticks++; s.maxo = ob; } }
    if (s.mode === 0 && s.v < 0) { const ka = Math.floor(q), oa = q - ka; if (oa <= a) { const kin = fmax * (oa - a) / L; if (s.phi >= kin) { s.mode = -1; s.kq = ka; s.phi = kin; s.ticks++; } } }
  }
  // atrito: seco + do ar; perto de parar, o atrito seco segura a roda se a lingueta não empurrar mais do que ele
  if (Math.abs(s.v) < 1e-3) { if (Math.abs(F) <= mu) { s.v = 0; s.done = true; } else s.v += (F - mu * Math.sign(F)) * dt; }
  else {
    const v0 = s.v; s.v += (F - mu * Math.sign(v0) - b * v0) * dt;
    if (v0 * s.v < 0) { s.back += v0 > 0 ? 1 : 0; if (Math.abs(F) <= mu) s.v = 0; }
  }
  s.p += s.v * dt; s.t += dt;
  if (s.t > 30) s.done = true;
}
const pmod = (x, n) => ((x % n) + n) % n;
function solveSpin(p0, idx, N) {
  const ok = [];
  for (let v0 = 36 + rand() * 0.04; v0 < 52.6; v0 += 0.04) {
    const q = wheelSim(p0, v0); while (!q.done) wheelStep(q);
    if (pmod(Math.round(-q.p), N) === idx) ok.push(v0);
  }
  return ok.length ? ok[Math.floor(rand() * ok.length)] : null;
}

// segs: [{ text, color, big }]. A casa 0 começa no topo.
export function bigWheel({ segs, sfx, hub = '', cls = 'bw3', turns = 5, secs = 8.5 }) {
  const W = 360, H = 404, cx = 180, cy = 190, R = 158, N = segs.length, th = TAU / N;
  const [el, ctx, dpr] = mkCanvas(W, H, cls);
  const face = layer(R * 2, dpr, (x) => {
    const full = N > 30, HB = full ? 0.8 : 1, RB = R - 9, BAND = 34;   // roda grande: aro escuro com os números, casas de bónus com o nome ao comprido
    segs.forEach((s, i) => {
      const a0 = (i - 0.5) * th - Math.PI / 2, a1 = a0 + th, a = i * th - Math.PI / 2;
      x.fillStyle = s.color; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, RB, a0, a1); x.closePath(); x.fill();
      if (full && s.big) { x.fillStyle = '#080a0fb8'; x.beginPath(); x.arc(0, 0, RB, a0, a1); x.arc(0, 0, RB - BAND, a1, a0, true); x.closePath(); x.fill(); }
      x.strokeStyle = '#e2c06a'; x.lineWidth = full ? 1 : 1.1; x.beginPath(); x.moveTo(0, 0); x.lineTo(RB * Math.cos(a0), RB * Math.sin(a0)); x.stroke();
      x.save(); x.fillStyle = s.ink || '#fff'; x.strokeStyle = '#000c'; x.lineJoin = 'round'; x.textAlign = 'center'; x.textBaseline = 'middle';
      if (s.big && full) {
        x.translate((RB - BAND / 2) * Math.cos(a), (RB - BAND / 2) * Math.sin(a)); x.rotate(a + Math.PI / 2);
        x.font = `900 ${s.text.length > 1 ? 16 : 23}px ${DISP}`; x.lineWidth = 3.5; x.strokeText(s.text, 0, 1); x.fillText(s.text, 0, 1);
      } else if (s.big) { x.translate((R - 30) * Math.cos(a), (R - 30) * Math.sin(a)); x.rotate(a + Math.PI / 2); x.font = `900 22px ${DISP}`; x.lineWidth = 3; x.strokeText(s.text, 0, 0); x.fillText(s.text, 0, 0); }
      else {
        // casa de bónus: marca dourada no aro e o nome em grande, ao longo do raio
        x.save(); x.translate((RB - 12) * Math.cos(a), (RB - 12) * Math.sin(a));
        x.fillStyle = '#f0d58a'; x.beginPath(); x.arc(0, 0, 5.2, 0, TAU); x.fill(); x.fillStyle = s.color; x.beginPath(); x.arc(0, 0, 2.4, 0, TAU); x.fill(); x.restore();
        x.translate((RB - 62) * Math.cos(a), (RB - 62) * Math.sin(a)); x.rotate(a);
        x.font = `900 13px ${DISP}`; try { x.letterSpacing = '0.6px'; } catch { /* navegador antigo */ }
        x.lineWidth = 3; x.strokeText(s.text, 0, 0.5); x.fillStyle = '#fff3c4'; x.fillText(s.text, 0, 0.5);
      }
      x.restore();
    });
    if (full) { x.strokeStyle = '#e2c06a'; x.lineWidth = 1.2; x.beginPath(); x.arc(0, 0, RB - BAND, 0, TAU); x.stroke(); }
    // sombreado: só junto ao centro, para as casas ficarem com cor até ao aro
    const g = x.createRadialGradient(0, 0, 30, 0, 0, RB); g.addColorStop(0, '#0008'); g.addColorStop(full ? 0.42 : 0.45, full ? '#0000' : '#0002'); g.addColorStop(1, '#ffffff10');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, RB, 0, TAU); x.fill();
    // anel interior e cubo
    x.strokeStyle = '#f0d58a'; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 58 * HB, 0, TAU); x.stroke();
    // medalhão ao centro: laca preta com raios dourados, à maneira art déco
    const hg = x.createRadialGradient(-14 * HB, -16 * HB, 4, 0, 0, 56 * HB); hg.addColorStop(0, '#2a2f3a'); hg.addColorStop(1, '#07080b');
    x.fillStyle = hg; x.beginPath(); x.arc(0, 0, 56 * HB, 0, TAU); x.fill();
    x.fillStyle = '#d9b25a33'; for (let i = 0; i < 16; i++) { const a = i * TAU / 16; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 54 * HB, a, a + TAU / 32); x.closePath(); x.fill(); }
    x.fillStyle = '#0b0d12'; x.beginPath(); x.arc(0, 0, 40 * HB, 0, TAU); x.fill();
    x.strokeStyle = '#e2c06a'; x.lineWidth = 1.5; x.beginPath(); x.arc(0, 0, 40 * HB, 0, TAU); x.stroke(); x.beginPath(); x.arc(0, 0, 51 * HB, 0, TAU); x.stroke();
    if (hub) {
      x.fillStyle = '#f0d58a'; x.textAlign = 'center'; x.textBaseline = 'middle'; const ws = hub.split(' ');
      x.font = `900 ${(ws.length > 1 ? 15 : 17) * HB}px ${DISP}`;
      if (ws.length > 1) { const m = Math.ceil(ws.length / 2); x.fillText(ws.slice(0, m).join(' '), 0, -8 * HB); x.fillText(ws.slice(m).join(' '), 0, 9 * HB); } else x.fillText(hub, 0, 1);
    }
    // pinos
    for (let i = 0; i < N; i++) {
      const a = (i - 0.5) * th - Math.PI / 2, px = (R - 9) * Math.cos(a), py = (R - 9) * Math.sin(a), pr = N > 30 ? 3 : 4;
      x.fillStyle = '#0007'; x.beginPath(); x.arc(px + 0.8, py + 1.2, pr, 0, TAU); x.fill();
      const pg = x.createRadialGradient(px - pr * 0.4, py - pr * 0.4, 0.3, px, py, pr); pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.5, '#c9ced8'); pg.addColorStop(1, '#5d6472');
      x.fillStyle = pg; x.beginPath(); x.arc(px, py, pr, 0, TAU); x.fill();
    }
  });
  const st = { rot: 0, sp: null, flap: 0, win: -1, flash: 0, resolve: null };
  const ease = (u) => 1 - Math.pow(1 - u, 3.4);
  const tick = throttled(sfx, 'tick', 45);
  function draw(dt, now) {
    if (st.sp) {
      const sp = st.sp; if (sp.t0 === undefined) sp.t0 = now; sp.t = now - sp.t0;
      if (sp.sim) {
        // passos fixos, contados pelo relógio: a jogada é sempre a mesma que foi calculada, em qualquer telemóvel
        const want = Math.floor(sp.t / PH.dt); let n = 0;
        while (sp.n < want && !sp.sim.done && n++ < 500) { const tk = sp.sim.ticks; wheelStep(sp.sim); sp.n++; if (sp.sim.ticks !== tk) tick(); }
        st.rot = sp.sim.p * th + sp.err * Math.exp(-sp.t / 0.25); st.flap = sp.sim.phi;
        if (sp.sim.done && !sp.done) { sp.done = true; sp.T = sp.t; st.win = sp.idx; sfx('claim'); }
      } else {
        const u = clamp(sp.t / sp.T, 0, 1); st.rot = sp.r0 + sp.d * ease(u);
        const k = Math.floor(st.rot / th + 0.5); if (k !== sp.k) { sp.k = k; tick(); }
        if (u >= 1 && !sp.done) { sp.done = true; st.win = sp.idx; sfx('claim'); }
      }
      if (sp.done && sp.t - sp.T > 1.3 && st.resolve) { const r = st.resolve; st.resolve = null; r(); }
    }
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
    // lingueta de borracha: presa em cima, dobra-se um pouco mais na ponta (rija: quase direita)
    const LF = 35, fa = st.flap, tx = LF * Math.sin(fa), ty = LF * Math.cos(fa), mx = LF * 0.5 * Math.sin(fa * 0.55), my = LF * 0.5 * Math.cos(fa * 0.55);
    ctx.save(); ctx.translate(cx, cy - R - 14); ctx.lineCap = 'round';
    const mg = ctx.createLinearGradient(-16, -12, 16, 6); mg.addColorStop(0, '#fff1bf'); mg.addColorStop(0.5, '#d9a531'); mg.addColorStop(1, '#7a4e0a');
    ctx.fillStyle = '#0008'; ctx.beginPath(); ctx.roundRect(-15, -9, 32, 17, 5); ctx.fill();
    ctx.fillStyle = mg; ctx.beginPath(); ctx.roundRect(-16, -11, 32, 17, 5); ctx.fill();
    ctx.strokeStyle = '#0007'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(1.5, 2); ctx.quadraticCurveTo(mx + 1.5, my + 2, tx + 1.5, ty + 2); ctx.stroke();
    ctx.strokeStyle = '#b3121c'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
    ctx.strokeStyle = '#ff6a62'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-1.5, 1); ctx.quadraticCurveTo(mx - 1.5, my, tx - 1.2, ty - 1); ctx.stroke();
    ctx.fillStyle = '#5d6472'; ctx.beginPath(); ctx.arc(0, -3, 3.2, 0, TAU); ctx.fill(); ctx.fillStyle = '#e8ebf0'; ctx.beginPath(); ctx.arc(-0.8, -3.8, 1.3, 0, TAU); ctx.fill();
    ctx.restore();
  }
  const wake = ticker(el, draw, () => { if (st.sp) { st.rot = -st.sp.idx * th; st.flap = 0; st.win = st.sp.idx; st.sp = null; } if (st.resolve) { const r = st.resolve; st.resolve = null; r(); } });
  return {
    el, wake,
    set(idx) { st.rot = -idx * th; st.flap = 0; st.win = idx; st.sp = null; },
    spin(idx, from) {
      const off = (rand() - 0.5) * th * 0.56, cur = from === undefined || from === null ? st.rot : -from * th, err = norm(st.rot - cur);
      const base = -idx * th + off, delta = ((base - cur) % TAU + TAU) % TAU;
      st.win = -1;
      const v0 = solveSpin(cur / th, idx, N);   // a velocidade do lançamento muda de jogada para jogada
      st.sp = { t: 0, T: secs, r0: cur, d: turns * TAU + delta, idx, err, k: Math.floor(cur / th + 0.5), n: 0, sim: v0 === null ? null : wheelSim(cur / th, v0) };
      wake();
      return new Promise((res) => { st.resolve = res; });
    },
  };
}

// ------------------------------------------------------------------ dados em 3D
// Desenhados em canvas com projeção a sério (sem 3D do CSS, que em alguns telemóveis achata os cubos e abre buracos nos cantos).
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
const mmul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const mapp = (M, p) => [M[0][0] * p[0] + M[0][1] * p[1] + M[0][2] * p[2], M[1][0] * p[0] + M[1][1] * p[1] + M[1][2] * p[2], M[2][0] * p[0] + M[2][1] * p[1] + M[2][2] * p[2]];
// rotação que põe cada face virada para cima (faces opostas somam 7)
const FACE_UP = { 1: rotX(0), 6: rotX(Math.PI), 2: rotX(Math.PI / 2), 5: rotX(-Math.PI / 2), 3: rotY(-Math.PI / 2), 4: rotY(Math.PI / 2) };
const DFACES = [
  { v: 1, n: [0, 0, 1], u: [1, 0, 0], w: [0, 1, 0] }, { v: 6, n: [0, 0, -1], u: [1, 0, 0], w: [0, -1, 0] },
  { v: 2, n: [0, 1, 0], u: [1, 0, 0], w: [0, 0, -1] }, { v: 5, n: [0, -1, 0], u: [1, 0, 0], w: [0, 0, 1] },
  { v: 3, n: [1, 0, 0], u: [0, 1, 0], w: [0, 0, 1] }, { v: 4, n: [-1, 0, 0], u: [0, -1, 0], w: [0, 0, 1] },
];
export function diceTable({ sfx }) {
  const W = 340, H = 236, cx = 170, cy = 138, S0 = 60, hS = S0 / 2, PHI = 0.72, CP = Math.cos(PHI), SP = Math.sin(PHI), F = 760;
  const [cv, ctx] = mkCanvas(W, H, 'dc3c'), el = h('div', { class: 'dc3', role: 'img' }, cv);
  const LIGHT = (() => { const v = [-0.42, -0.5, 0.76], l = Math.hypot(...v); return v.map((x) => x / l); })();
  // mundo: x para a direita, y para longe de quem vê, z para cima. A câmara olha de cima e de frente.
  const view = (p) => [p[0], p[1] * CP + p[2] * SP, -p[1] * SP + p[2] * CP];
  const proj = (p) => { const v = view(p), k = F / (F - v[2]); return [cx + v[0] * k, cy - v[1] * k]; };
  const hull = (pts) => {
    const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const p of P) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of P.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };
  const poly = (pts) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); };
  const rquad = (c, r) => {
    const L = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    ctx.beginPath(); const s0 = L(c[0], c[1], r); ctx.moveTo(s0[0], s0[1]);
    for (let i = 1; i <= 4; i++) { const k = c[i % 4], a = L(k, c[(i + 3) % 4], r), b = L(k, c[(i + 1) % 4], r); ctx.lineTo(a[0], a[1]); ctx.quadraticCurveTo(k[0], k[1], b[0], b[1]); }
    ctx.closePath();
  };
  const dice = [{ x: -48, y: 8, z: 0, R: mmul(rotZ(-0.25), FACE_UP[3]) }, { x: 50, y: -8, z: 0, R: mmul(rotZ(0.38), FACE_UP[4]) }];
  function shadow(d) {
    const p = proj([d.x + d.z * 0.3, d.y - d.z * 0.2, 0]), r = S0 * 0.74 * (1 + d.z / 150), a = clamp(0.5 - d.z / 240, 0.1, 0.5);
    ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, CP + 0.08);
    const g = ctx.createRadialGradient(0, 0, r * 0.25, 0, 0, r); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.restore();
  }
  function die(d) {
    const at = (l) => { const q = mapp(d.R, l); return [q[0] + d.x, q[1] + d.y, q[2] + d.z + hS]; };
    const V = []; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) V.push(proj(at([sx * hS, sy * hS, sz * hS])));
    // corpo: a silhueta toda, cheia e de cantos redondos, para nunca se ver a mesa entre as faces
    poly(hull(V)); ctx.fillStyle = '#7d0a13'; ctx.strokeStyle = '#7d0a13'; ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.fill(); ctx.stroke();
    const cam = [0, 0, F];
    for (const f of DFACES) {
      const n = mapp(d.R, f.n), c = at(f.n.map((x) => x * hS)), cv2 = view(c), nv = view(n);
      if (nv[0] * (cam[0] - cv2[0]) + nv[1] * (cam[1] - cv2[1]) + nv[2] * (cam[2] - cv2[2]) <= 0) continue;   // face virada para o outro lado
      const pt = (a, b) => proj(at([f.n[0] * hS + f.u[0] * a + f.w[0] * b, f.n[1] * hS + f.u[1] * a + f.w[1] * b, f.n[2] * hS + f.u[2] * a + f.w[2] * b]));
      const e = hS * 0.94, lam = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]), b = 0.5 + 0.5 * lam;
      const q = [pt(-e, -e), pt(e, -e), pt(e, e), pt(-e, e)];
      rquad(q, 0.2);
      const g = ctx.createLinearGradient(q[3][0], q[3][1], q[1][0], q[1][1]);
      g.addColorStop(0, `rgb(${Math.round(246 * b)},${Math.round(72 * b)},${Math.round(80 * b)})`); g.addColorStop(1, `rgb(${Math.round(196 * b)},${Math.round(22 * b)},${Math.round(34 * b)})`);
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = `rgba(255,255,255,${0.1 + 0.22 * lam})`; ctx.lineWidth = 1.2; ctx.stroke();
      for (const i of PIPS[f.v]) {
        const gx = (i % 3 - 1) * S0 * 0.27, gy = (1 - Math.floor(i / 3)) * S0 * 0.27, r = S0 * 0.098, ring = (rr, dy) => { const o = []; for (let k = 0; k < 14; k++) { const a = k * TAU / 14, p = pt(gx + rr * Math.cos(a), gy + rr * Math.sin(a)); o.push([p[0], p[1] + dy]); } return o; };
        poly(ring(r * 1.12, 0.9)); ctx.fillStyle = 'rgba(60,0,6,.55)'; ctx.fill();
        poly(ring(r, 0)); ctx.fillStyle = `rgb(${Math.round(215 + 40 * lam)},${Math.round(215 + 40 * lam)},${Math.round(218 + 37 * lam)})`; ctx.fill();
      }
    }
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const o = [...dice].sort((a, b) => b.y - a.y);   // o que está mais longe desenha-se primeiro
    o.forEach(shadow); o.forEach(die);
  }
  const rest = [{ x: -48, y: 8, yaw: -0.25 }, { x: 50, y: -8, yaw: 0.38 }];
  const set = (a, b) => { [a, b].forEach((v, k) => { Object.assign(dice[k], { x: rest[k].x, y: rest[k].y, z: 0, R: mmul(rotZ(rest[k].yaw), FACE_UP[v]) }); }); draw(); };
  set(3, 4);
  // altura: três saltos cada vez mais pequenos
  const BN = [[0, 0.44, 96], [0.44, 0.72, 44], [0.72, 0.9, 16], [0.9, 1, 4]];
  const zAt = (u) => { for (const [a, b, hh] of BN) if (u <= b) { const s = (u - a) / (b - a); return hh * 4 * s * (1 - s); } return 0; };
  return {
    el, set,
    roll(a, b) {
      if (RM()) { set(a, b); return wait(350); }
      const T = 1900, t0 = performance.now(), vals = [a, b];
      const P = vals.map((v, k) => {
        const end = { x: (k ? 52 : -50) + (rand() * 16 - 8), y: (k ? -8 : 8) + (rand() * 14 - 7), yaw: (rand() * 70 - 35) * Math.PI / 180 };
        rest[k] = end;
        return { v, end, sx: -250 - k * 40, sy: -70 + k * 110, nx: (2 + Math.floor(rand() * 2)) * (k ? -1 : 1), ny: 2 + Math.floor(rand() * 2), lag: k * 0.07 };
      });
      const lastB = [0, 0];
      return new Promise((res) => {
        const step = (ts) => {
          const u0 = (ts - t0) / T; let done = true;
          P.forEach((p, k) => {
            const u = clamp(u0 - p.lag, 0, 1), e = 1 - Math.pow(1 - u, 2.6), back = 1 - e; if (u < 1) done = false;
            Object.assign(dice[k], { x: p.sx + (p.end.x - p.sx) * e, y: p.sy + (p.end.y - p.sy) * e, z: zAt(u),
              R: mmul(mmul(mmul(rotZ(p.end.yaw + 4.5 * back), rotX(TAU * p.nx * back)), rotY(TAU * p.ny * back)), FACE_UP[p.v]) });
            const bi = BN.findIndex(([, x1]) => u <= x1); if (bi > lastB[k]) { lastB[k] = bi; sfx(bi < 3 ? 'deal' : 'tick'); }
          });
          draw();
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
    if (!RM()) for (let i = 0; i < 14; i++) { b.textContent = '×' + pool[Math.floor(rand() * pool.length)]; sfx('tick'); await wait(45 + i * 9); }
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

// ------------------------------------------------------------------ bónus: caça ao tesouro (cartas tapadas, escolhes uma)
// 1) mostram-se os prémios que há nesta mesa; 2) tapam-se e baralham-se; 3) as cartas trocam todas de símbolo e de sítio,
// por isso não dá para seguir nenhuma; 4) escolhes uma. O prémio é um sorteio do servidor entre as cartas mostradas,
// com a mesma probabilidade para cada uma: escolher às cegas uma carta baralhada vale exatamente o mesmo.
export async function cashHunt(stage, { boxes, pick, sfx, L, secs = 7 }) {
  const n = boxes.length, many = n > 20, cols = many ? 6 : 4, SH = ['★', '♦', '♣', '♥', '♠', '●', '▲', '■', '✚', '☾', '♪', '⬟'];
  const rnd = (k) => Math.floor(rand() * k), mix = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const top = [...boxes].sort((a, b) => b - a)[Math.min(n - 1, Math.max(2, Math.floor(n / 9)))];   // os maiores da mesa ficam a dourado
  const face = (tl) => { tl.style.setProperty('--hue', String(rnd(360))); tl.querySelector('.fr').textContent = SH[rnd(SH.length)]; };
  const tiles = boxes.map((v) => h('button', { class: 'ch3t open pre' }, h('span', { class: 'fr' }, ''), h('span', { class: 'bk' + (v >= top ? ' hot' : '') }, '×' + v)));
  tiles.forEach(face);
  const grid = h('div', { class: 'ch3' + (many ? ' many' : ''), style: `--cols:${cols}` }, tiles), bar = h('i'), msg = h('div', { class: 'ch3msg' }, h('span', null, L.prizes), h('div', { class: 'ch3bar' }, bar));
  const barBox = bar.parentNode; barBox.style.visibility = 'hidden';
  stage.append(grid, msg);
  // 1) os prémios desta mesa, à vista
  await wait(60);
  tiles.forEach((tl, i) => setTimeout(() => tl.classList.remove('pre'), i * 14)); sfx('deal');
  await wait(RM() ? 600 : 3600);
  // 2) tapam-se, em onda
  mix(tiles.map((_, i) => i)).forEach((i, k) => setTimeout(() => tiles[i].classList.remove('open'), k * 16)); sfx('deal');
  await wait(RM() ? 200 : 900);
  msg.firstChild.textContent = L.shuffle;
  // 3) baralha: todas mudam de sítio ao mesmo tempo, várias vezes
  if (!RM()) {
    const cell = tiles[0].getBoundingClientRect(), gs = getComputedStyle(grid), gap = parseFloat(gs.columnGap) || 6, pos = (k) => [(k % cols) * (cell.width + gap), Math.floor(k / cols) * (cell.height + gap)];
    const order = boxes.map((_, i) => i);
    for (let r = 0; r < 9; r++) {
      mix(order);
      order.forEach((slot, i) => { const [x0, y0] = pos(i), [x1, y1] = pos(slot); tiles[i].style.transform = `translate(${x1 - x0}px,${y1 - y0}px)`; });
      sfx('deal'); await wait(430);
    }
    // … e no fim trocam todas de símbolo e de cor: o que estava por trás de cada uma já não se sabe
    grid.classList.add('mixing'); sfx('tick'); await wait(240);
    tiles.forEach(face); grid.classList.remove('mixing'); await wait(320);
  }
  // 4) escolhes (ou escolhe-se sozinha quando o tempo acaba)
  msg.firstChild.textContent = L.pick; grid.classList.add('live'); barBox.style.visibility = '';
  bar.style.transition = `transform ${secs}s linear`; requestAnimationFrame(() => { bar.style.transform = 'scaleX(0)'; });
  const chosen = await new Promise((res) => {
    const tm = setTimeout(() => res(rnd(n)), secs * 1000);
    tiles.forEach((tl, i) => tl.addEventListener('click', () => { clearTimeout(tm); res(i); }, { once: true }));
  });
  grid.classList.remove('live'); msg.firstChild.textContent = ''; barBox.style.visibility = 'hidden';
  const rest = mix(boxes.filter((_, i) => i !== pick)); let k = 0;
  const put = (tl, v) => { const b = tl.querySelector('.bk'); b.textContent = '×' + v; b.classList.toggle('hot', v >= top); };
  put(tiles[chosen], boxes[pick]); tiles[chosen].classList.add('shot'); sfx('hit'); await wait(RM() ? 100 : 420);
  tiles[chosen].classList.add('open', 'win'); sfx('claim'); await wait(RM() ? 300 : 1600);
  // as outras: para se ver o que havia na mesa
  tiles.forEach((tl, i) => { if (i !== chosen) { put(tl, rest[k++]); setTimeout(() => tl.classList.add('open', 'dim'), (k % 12) * 30); } });
  await wait(RM() ? 300 : 2400);
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
    const pull = x > n / 2 ? 0.5 : -0.5, s = opts.length === 1 ? opts[0] : rand() < (j > ROWS - 3 ? 0.5 : 0.62) ? (opts.includes(pull) ? pull : opts[0]) : -pull;
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
    await seg(xs[j] * cw, y0 + j * dy - 9, xs[j + 1] * cw, ty, 250 + rand() * 90, 13);
    if (j < ROWS - 1) { hitPeg = [j + 1, xs[j + 1]]; sfx('tick'); }
  }
  hitPeg = null; lit = at; glow = 14; sfx('claim');
  const t1 = performance.now(); await new Promise((res) => { const step = (ts) => { draw(ts); if (ts - t1 < 1300 && el.isConnected) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
  return slots[at];
}
