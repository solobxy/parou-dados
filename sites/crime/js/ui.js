// Pequenas ferramentas de interface: criar elementos, ícones, formatos.

const SVGNS = 'http://www.w3.org/2000/svg';

// h('div', {class:'x', on:{click: fn}}, 'texto', outroElemento) — texto entra sempre como texto (nunca HTML)
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'style') el.setAttribute('style', v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}

const PATHS = {
  street: 'M2 9c3-2.5 7-2.5 10 0 3-2.5 7-2.5 10 0-.8 5-3.5 7.5-6 7.5-2 0-3-2-4-2s-2 2-4 2C5.5 16.5 2.8 14 2 9zM6.5 11.5h3M14.5 11.5h3',
  gym: 'M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12',
  empire: 'M4 21V8l6-4v17M10 21V10h10v11M3 21h18M13 13h1M16 13h1M13 16h1M16 16h1',
  city: 'M5 4h14l-7 8zM12 12v8M8 20h8',
  fights: 'M4 4l10 10M13 13l3 3M15 18l3-3M20 4L10 14M11 13l-3 3M9 18l-3-3M5 19l1.5-1.5M19 19l-1.5-1.5',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
  crown: 'M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z',
  cash: 'M3 7h18v10H3zM12 10a2 2 0 1 0 0.01 0',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  pill: 'M10.5 4.5a5 5 0 0 1 7 7l-6 6a5 5 0 0 1-7-7zM8 9l7 7',
  timer: 'M12 8v5l3 2M12 3a9 9 0 1 0 0.01 0',
  bank: 'M3 10h18M12 3l9 5H3zM5 10v8M9 10v8M15 10v8M19 10v8M3 21h18',
  gun: 'M3 9h16v4h-6l-1 5H8l1-5H3z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  gem: 'M6 4h12l3 5-9 11L3 9zM3 9h18',
  ship: 'M3 17l2 4h14l2-4zM6 17V9h12v8M9 9V5h6v4',
  user: 'M12 12a4 4 0 1 0 0.01 0M4 21c1-4 4-6 8-6s7 2 8 6',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  plus: 'M12 5v14M5 12h14',
  fist: 'M7 11V7a2 2 0 0 1 4 0v4M11 9V6a2 2 0 0 1 4 0v5M15 10V8a2 2 0 0 1 4 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-1a2 2 0 0 1 2-2h3',
  skull: 'M12 3a8 8 0 0 0-8 8v3l2 2v4h12v-4l2-2v-3a8 8 0 0 0-8-8zM9 11h.01M15 11h.01M10 20v-3M14 20v-3',
};
const FILLED = new Set(['bolt', 'crown']);
export function icon(name, cls = 'i') {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', FILLED.has(name) ? cls + ' f' : cls);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', PATHS[name] || '');
  s.appendChild(p);
  return s;
}
export function svg(tag, attrs) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  return el;
}

// ---------- formatos ----------
let LOC = 'en-US';
export function setLocale(l) { LOC = l === 'pt' ? 'pt-PT' : 'en-US'; }
export function num(n) { return Math.floor(n).toLocaleString(LOC); }
export function money(n) { return '$' + num(n); }
export function short(n) {
  const a = Math.abs(n);
  if (a < 10000) return num(n);
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [v, u] of units) if (a >= v) {
    const x = n / v;
    return (x >= 100 ? Math.floor(x) : Math.floor(x * 10) / 10).toLocaleString(LOC, { maximumFractionDigits: 1 }) + u;
  }
  return num(n);
}
export function moneyShort(n) { return '$' + short(n); }
export function dur(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return m + ':' + String(r).padStart(2, '0');
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return h + 'h ' + String(mm).padStart(2, '0') + 'm';
  const d = Math.floor(h / 24);
  return d + 'd ' + (h % 24) + 'h';
}
export function hoursText(h) {
  if (h < 1) return Math.max(1, Math.round(h * 60)) + ' min';
  if (h < 10) return (Math.round(h * 10) / 10).toLocaleString(LOC) + ' h';
  if (h < 48) return Math.round(h) + ' h';
  return Math.round(h / 24) + ' d';
}
export function pct(bp) { return Math.round(bp / 100) + '%'; }
export function rid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
