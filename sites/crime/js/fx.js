// Efeitos: dinheiro a voar para o contador, números a rolar, carimbos, subida de nível, lutas.
// Só transform e opacity. Com «animações leves», ficam mais curtos mas continuam lá.

import { h, icon } from './ui.js';

let light = false;
export function setLight(v) { light = !!v; document.body.classList.toggle('light', light); }
const k = (ms) => (light ? Math.round(ms * 0.5) : ms);
const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
export function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }
export const dur = (ms) => k(ms);

// ---------- som ----------
// Sons curtos e baixos feitos de ruído filtrado e notas que morrem depressa (madeira, moedas, cartas),
// em vez de bips. Tudo passa por um volume geral baixo.
let actx = null, soundOn = true, master = null, noiseBuf = null;
export function setSound(v) { soundOn = !!v; }
function ctxReady() {
  actx = actx || new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  if (!master) {
    master = actx.createGain(); master.gain.value = 0.5;
    const cmp = actx.createDynamicsCompressor(); cmp.threshold.value = -18; cmp.ratio.value = 4;
    master.connect(cmp).connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
}
const jit = (x, p = 0.04) => x * (1 + (Math.random() * 2 - 1) * p);   // cada toque sai ligeiramente diferente
function env(g, t0, vol, len, att = 0.004) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len); }
// ruído filtrado: cliques, cartas, sopros
function noise(t0, len, type, freq, q, vol, toFreq) {
  const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(jit(freq), t0); f.Q.value = q;
  if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, t0 + len);
  env(g, t0, vol, len, 0.002); src.connect(f).connect(g).connect(master); src.start(t0, Math.random() * 0.3); src.stop(t0 + len + 0.02);
}
// nota que morre: seno com um harmónico, como uma tecla de madeira ou uma moeda
function ping(t0, freq, len, vol, harm = 0, to = null) {
  const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(jit(freq, 0.01), t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + len);
  env(g, t0, vol, len); o.connect(g).connect(master); o.start(t0); o.stop(t0 + len + 0.02);
  if (harm) { const o2 = actx.createOscillator(), g2 = actx.createGain(); o2.type = 'sine'; o2.frequency.value = freq * harm; env(g2, t0, vol * 0.35, len * 0.5); o2.connect(g2).connect(master); o2.start(t0); o2.stop(t0 + len); }
}
const coin = (t, f = 3300, v = 0.035) => { ping(t, f, 0.11, v, 1.52); ping(t, f * 1.34, 0.08, v * 0.6); noise(t, 0.012, 'highpass', 5000, 0.7, 0.02); };
const SFX = {
  tap: (t) => { noise(t, 0.028, 'bandpass', 1700, 1.4, 0.07); ping(t, 150, 0.04, 0.035, 0, 90); },
  tick: (t) => noise(t, 0.014, 'bandpass', 3400, 2.2, 0.06),
  deal: (t) => { noise(t, 0.07, 'bandpass', 2600, 0.8, 0.05, 900); ping(t + 0.05, 180, 0.04, 0.03, 0, 110); },
  cash: (t) => { coin(t); coin(t + 0.07, 3900, 0.03); },
  claim: (t) => { coin(t, 2900); coin(t + 0.06, 3500); coin(t + 0.13, 4300, 0.03); },
  buy: (t) => { noise(t, 0.03, 'bandpass', 1400, 1.2, 0.07); coin(t + 0.05, 3100, 0.03); },
  crit: (t) => [659, 784, 988, 1319].forEach((f, i) => ping(t + i * 0.075, f, 0.32, 0.06, 2)),
  level: (t) => { [392, 523, 659, 784].forEach((f, i) => ping(t + i * 0.1, f, 0.5, 0.07, 2)); ping(t + 0.42, 1047, 0.8, 0.05, 2); },
  fail: (t) => { ping(t, 130, 0.2, 0.09, 0, 70); noise(t, 0.06, 'lowpass', 400, 0.7, 0.05); },
  hit: (t) => { noise(t, 0.09, 'lowpass', 500, 0.8, 0.14); ping(t, 95, 0.16, 0.12, 0, 48); },
  bust: (t) => [0, 1, 2, 3].forEach((i) => ping(t + i * 0.15, i % 2 ? 620 : 830, 0.14, 0.04, 2)),
  refill: (t) => noise(t, 0.32, 'bandpass', 500, 1.2, 0.06, 2600),
};
let lastTap = 0;
export function sfx(name) {
  if (!soundOn) return;
  if (name === 'tap') { const n = performance.now(); if (n - lastTap < 70) return; lastTap = n; }
  try { ctxReady(); SFX[name] && SFX[name](actx.currentTime + 0.005); } catch {}
}

// ---------- música ----------
// Uma lista de faixas tocada baixinho, em sequência. Só arranca depois do primeiro toque (os browsers não deixam antes).
const TRACKS = [1, 2, 3, 4].map((n) => `/audio/faixa${n}.m4a`);
let music = null, musicOn = false, trackI = Math.floor(Math.random() * TRACKS.length);
export function setMusic(v) {
  musicOn = !!v;
  if (!musicOn) { music && music.pause(); return; }
  if (!music) {
    music = new Audio(); music.preload = 'none'; music.volume = 0.22;
    music.addEventListener('ended', () => { trackI = (trackI + 1) % TRACKS.length; music.src = TRACKS[trackI]; music.play().catch(() => {}); });
    document.addEventListener('visibilitychange', () => { if (!music) return; if (document.hidden) music.pause(); else if (musicOn) music.play().catch(() => {}); });
  }
  if (!music.src) music.src = TRACKS[trackI];
  music.play().catch(() => {});
}
// o primeiro toque liga a música (se estiver ligada nas definições) e dá som a todos os botões
document.addEventListener('pointerdown', (e) => {
  if (musicOn && music && music.paused && !document.hidden) music.play().catch(() => {});
  if (e.target.closest && e.target.closest('button, a, .tile, .game, [role="button"]')) sfx('tap');
}, { passive: true });

// texto que sobe de um ponto até um alvo (ex.: +$23 do cartão até ao dinheiro no topo)
export function fly(text, color, fromRect, toEl, delay = 0) {
  const a = center(fromRect);
  const el = h('div', { class: 'fly', style: `left:${a.x}px;top:${a.y}px;color:${color}` }, text);
  document.body.appendChild(el);
  const to = toEl ? center(toEl.getBoundingClientRect()) : { x: a.x, y: a.y - 80 };
  const dx = to.x - a.x, dy = to.y - a.y;
  const anim = el.animate([
    { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
    { transform: 'translate(-50%,-90%) scale(1.15)', opacity: 1, offset: 0.25 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`, opacity: 0.2 },
  ], { duration: k(900), delay, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'both' });
  anim.onfinish = () => el.remove();
  return anim.finished.catch(() => {});
}

// notas a voar do cartão para o contador do dinheiro
export function bills(fromRect, toEl, n = 6) {
  const a = center(fromRect);
  const to = center(toEl.getBoundingClientRect());
  for (let i = 0; i < n; i++) {
    const el = h('div', { class: 'bill', style: `left:${a.x - 11}px;top:${a.y - 6}px` });
    document.body.appendChild(el);
    const sx = (Math.random() - 0.5) * 140, sy = -40 - Math.random() * 60, rot = (Math.random() - 0.5) * 120;
    const an = el.animate([
      { transform: 'translate(0,0) rotate(0) scale(.6)', opacity: 0 },
      { transform: `translate(${sx}px,${sy}px) rotate(${rot}deg) scale(1)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${to.x - a.x}px,${to.y - a.y}px) rotate(${rot * 2}deg) scale(.4)`, opacity: 0.6 },
    ], { duration: k(800), delay: i * k(45), easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' });
    an.onfinish = () => el.remove();
  }
}

// número a rolar até ao valor novo
const rolling = new WeakMap();
export function roll(el, from, to, fmt, ms = 650) {
  if (!el) return;
  cancelAnimationFrame(rolling.get(el));
  if (from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), d = k(ms);
  const step = (t) => {
    const p = Math.min(1, (t - t0) / d);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (p < 1) rolling.set(el, requestAnimationFrame(step));
  };
  rolling.set(el, requestAnimationFrame(step));
}

export function pop(el) {
  if (!el) return;
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: k(380), easing: 'cubic-bezier(.3,1.4,.5,1)' });
}

// carimbo grande (GOLPE PERFEITO, APANHADO)
export function stamp(text, color) {
  const el = h('div', { class: 'stamp', style: `color:${color}` }, text);
  document.body.appendChild(el);
  const an = el.animate([
    { transform: 'translate(-50%,-50%) rotate(-8deg) scale(2.2)', opacity: 0 },
    { transform: 'translate(-50%,-50%) rotate(-8deg) scale(.94)', opacity: 1, offset: 0.22 },
    { transform: 'translate(-50%,-50%) rotate(-8deg) scale(1)', opacity: 1, offset: 0.32 },
    { transform: 'translate(-50%,-50%) rotate(-8deg) scale(1)', opacity: 1, offset: 0.8 },
    { transform: 'translate(-50%,-50%) rotate(-8deg) scale(1.04)', opacity: 0 },
  ], { duration: k(1300), easing: 'ease-out', fill: 'both' });
  an.onfinish = () => el.remove();
  return an.finished.catch(() => {});
}

// subida de nível: o título acende-se como um letreiro de néon (fecha sozinha ou ao toque)
export function levelUp(n, kText, title, titleLabel, note) {
  document.querySelectorAll('.overlay.lvl').forEach((e) => e.remove());
  const ov = h('div', { class: 'overlay lvl', role: 'status', 'aria-live': 'polite' },
    h('div', null,
      h('div', { class: 'k' }, kText),
      h('div', { class: 'n neon' }, String(n)),
      h('div', { class: 'k', style: 'margin-top:14px' }, titleLabel),
      h('div', { class: 'ttl neon', style: 'animation-delay:.25s' }, title),
      note ? h('div', { class: 'note2' }, icon('bolt'), ' ' + note) : null));
  document.body.appendChild(ov);
  vibrate([20, 60, 40]); sfx('level');
  let done = false;
  const close = () => { if (done) return; done = true; const a = ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180 }); a.onfinish = () => ov.remove(); };
  ov.addEventListener('click', close);
  setTimeout(close, k(1900));
}

// luta: os dois frente a frente, choque e resultado
export function fight(meName, themName, win, line, labels) {
  return new Promise((resolve) => {
    const me = h('div', { class: 'f me' }, icon('fist'));
    const them = h('div', { class: 'f them' }, icon('skull'));
    const res = h('div', { class: 'res', style: `opacity:0;color:${win ? 'var(--cash)' : 'var(--danger)'}` }, win ? labels.win : labels.lose);
    const sub = h('div', { class: 'sub', style: 'opacity:0' }, line);
    const ov = h('div', { class: 'overlay fightbg' }, h('div', { class: 'fight' },
      h('div', { class: 'vs' }, h('div', { style: 'display:grid;gap:8px;justify-items:center' }, me, h('div', { class: 'small muted' }, meName)),
        'vs', h('div', { style: 'display:grid;gap:8px;justify-items:center' }, them, h('div', { class: 'small muted' }, themName))),
      res, sub));
    document.body.appendChild(ov);
    const D = k(1500);
    me.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-14px)', offset: 0.3 }, { transform: 'translateX(40px)', offset: 0.45 }, { transform: 'translateX(0)' }], { duration: D * 0.6, easing: 'ease-in-out', iterations: 1 });
    them.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(14px)', offset: 0.3 }, { transform: 'translateX(-40px)', offset: 0.45 }, { transform: 'translateX(0)' }], { duration: D * 0.6, easing: 'ease-in-out', iterations: 1 });
    const loser = win ? them : me;
    setTimeout(() => {
      vibrate(win ? 25 : [40, 50, 40]);
      loser.animate([{ transform: 'rotate(0) scale(1)', opacity: 1 }, { transform: 'rotate(-14deg) scale(.86)', opacity: 0.45 }], { duration: k(350), fill: 'forwards', easing: 'ease-out' });
      res.animate([{ opacity: 0, transform: 'scale(1.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: k(320), fill: 'forwards', easing: 'cubic-bezier(.3,1.4,.5,1)' });
      sub.animate([{ opacity: 0 }, { opacity: 1 }], { duration: k(300), delay: k(200), fill: 'forwards' });
    }, D * 0.45);
    const close = () => { ov.removeEventListener('click', close); const a = ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180 }); a.onfinish = () => { ov.remove(); resolve(); }; };
    setTimeout(() => ov.addEventListener('click', close), D * 0.6);
    setTimeout(close, D + k(1500));
  });
}
