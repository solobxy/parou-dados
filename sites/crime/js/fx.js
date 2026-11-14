// Efeitos: dinheiro a voar para o contador, números a rolar, carimbos, subida de nível, lutas.
// Só transform e opacity. Com «animações leves», ficam mais curtos mas continuam lá.

import { h, icon } from './ui.js';

let light = false;
export function setLight(v) { light = !!v; document.body.classList.toggle('light', light); }
const k = (ms) => (light ? Math.round(ms * 0.5) : ms);
const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
export function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }

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

// subida de nível: o título acende-se como um letreiro de néon
export function levelUp(n, kText, title, titleLabel) {
  return new Promise((resolve) => {
    const ov = h('div', { class: 'overlay lvl', role: 'dialog', 'aria-live': 'assertive' },
      h('div', null,
        h('div', { class: 'k' }, kText),
        h('div', { class: 'n neon' }, String(n)),
        h('div', { class: 'k', style: 'margin-top:14px' }, titleLabel),
        h('div', { class: 'ttl neon', style: 'animation-delay:.35s' }, title)));
    document.body.appendChild(ov);
    vibrate([20, 60, 40]);
    const close = () => { ov.removeEventListener('click', close); const a = ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 }); a.onfinish = () => { ov.remove(); resolve(); }; };
    ov.addEventListener('click', close);
    setTimeout(close, k(2600));
  });
}

// luta: os dois frente a frente, choque e resultado
export function fight(meName, themName, win, line, labels) {
  return new Promise((resolve) => {
    const me = h('div', { class: 'f me' }, icon('fist'));
    const them = h('div', { class: 'f them' }, icon('skull'));
    const res = h('div', { class: 'res', style: `opacity:0;color:${win ? 'var(--cash)' : 'var(--danger)'}` }, win ? labels.win : labels.lose);
    const sub = h('div', { class: 'sub', style: 'opacity:0' }, line);
    const ov = h('div', { class: 'overlay' }, h('div', { class: 'fight' },
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
