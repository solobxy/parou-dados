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
  // botões «ação · preço»: a ação em cima e o preço por baixo, mais pequeno (antes partiam a linha onde calhava: «Depositar 4 112 988 € / · taxa 123 390 €»)
  if (tag === 'button' && /(^| )btn( |$)/.test(el.className)) kids = kids.map((k) => (typeof k === 'string' && k.includes(' · ') ? btnTwo(k) : k));
  add(el, kids);
  return el;
}
// mudar o texto de um botão depois de criado, com a mesma divisão em duas linhas
export function setBtn(el, txt) { txt = String(txt); el.replaceChildren(...(txt.includes(' · ') ? btnTwo(txt) : [txt])); }
function btnTwo(txt) {
  const i = txt.indexOf(' · ');
  const s = document.createElement('span'); s.className = 'bs';
  const dot = document.createElement('span'); dot.className = 'sr'; dot.textContent = ' · ';
  s.append(dot, txt.slice(i + 3));
  const m = document.createElement('span'); m.className = 'bm'; m.textContent = txt.slice(0, i);
  return [m, s];
}
function add(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else {
      const txt = tidy(String(k));
      if (txt.indexOf('\u00a0·') < 0) { el.appendChild(document.createTextNode(txt)); continue; }
      // v106: cada «·» separador fica num span (sdot), para se esconder quando calha no fim de uma linha (ver dotPass)
      txt.split(/\u00a0·(?=[ \u00a0])/).forEach((part, i) => {
        if (i) { const d = document.createElement('span'); d.className = 'sdot'; d.textContent = '\u00a0·'; el.appendChild(d); }
        if (part) el.appendChild(document.createTextNode(part));
      });
    }
  }
}
// Um «·» que separa duas coisas não serve para nada no fim de uma linha («Negócios +10% ·» / «31 dias»): depois de cada
// mudança no ecrã, vê-se onde cai o primeiro carácter a seguir a cada «·»; se for numa linha de baixo, o «·» fica invisível
// (só a cor: o espaço continua lá, por isso a linha não muda de sítio). O mesmo quando é o último da caixa.
const INLINE = new Set(['inline', 'contents']);
function nextChar(d) {
  let box = d.parentElement;
  while (box && box !== document.body && INLINE.has(getComputedStyle(box).display)) box = box.parentElement;
  if (!box) return null;
  const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  w.currentNode = d.lastChild || d;
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const i = n.data.search(/[^\s\u00a0]/);
    if (i >= 0 && n.parentElement && n.parentElement.getClientRects().length) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); return r.getBoundingClientRect(); }
  }
  return null;
}
function dotPass() {
  dotRaf = 0;
  const ds = document.querySelectorAll('.sdot'), out = [];
  for (const d of ds) {
    const a = d.getClientRects(); if (!a.length) continue;
    const r = a[a.length - 1], nx = nextChar(d);
    out.push([d, !nx || nx.top >= r.bottom - 2]);
  }
  for (const [d, end] of out) d.classList.toggle('eol', end);
}
let dotRaf = 0;
const dotLater = () => { if (!dotRaf) dotRaf = requestAnimationFrame(dotPass); };
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  new MutationObserver(dotLater).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('resize', dotLater);
  document.fonts?.ready?.then(dotLater);
}
// o texto nunca parte mal: o «·» fica agarrado à palavra de antes (uma linha nunca começa por «·»), os milhares escritos à mão
// («5 000») não se separam e um intervalo («224 €–336 €») não parte a seguir ao traço
const tidy = (s) => (s.indexOf(' ') < 0 && s.indexOf('–') < 0 && s.indexOf('-') < 0 ? s : s.replace(/ ·(?=[ \u00a0])/g, '\u00a0·').replace(/(\d) (?=\d{3}(?!\d))/g, '$1\u00a0').replace(/(\S)–(?=\S)/g, '$1–\u2060')
  .replace(/(\p{L})-(?=\p{L})/gu, '$1\u2011'));   // e o hífen entre letras («comprar-te», «porta-contentores») não parte a palavra

const PATHS = {
  street: 'M2 9c3-2.5 7-2.5 10 0 3-2.5 7-2.5 10 0-.8 5-3.5 7.5-6 7.5-2 0-3-2-4-2s-2 2-4 2C5.5 16.5 2.8 14 2 9zM6.5 11.5h3M14.5 11.5h3',
  gym: 'M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12',
  empire: 'M4 21V8l6-4v17M10 21V10h10v11M3 21h18M13 13h1M16 13h1M13 16h1M16 16h1',
  city: 'M5 4h14l-7 8zM12 12v8M8 20h8',
  skyline: 'M3 21V11h5v10M8 21V4h8v17M16 21v-9h5v9M2 21h20M11 8h2M11 12h2M11 16h2',
  chev: 'M9 6l6 6-6 6',
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
  check: 'M5 12.5l4.5 4.5L19 7.5',
  fist: 'M7 11V7a2 2 0 0 1 4 0v4M11 9V6a2 2 0 0 1 4 0v5M15 10V8a2 2 0 0 1 4 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-1a2 2 0 0 1 2-2h3',
  brain: 'M12 5v15M12 5a3 3 0 0 0-5.6-1.2A3.2 3.2 0 0 0 4 9.5a3.4 3.4 0 0 0 .6 5.3A3.6 3.6 0 0 0 9 19a3 3 0 0 0 3-2M12 5a3 3 0 0 1 5.6-1.2A3.2 3.2 0 0 1 20 9.5a3.4 3.4 0 0 1-.6 5.3A3.6 3.6 0 0 1 15 19a3 3 0 0 1-3-2M8 10h2M14 13h2',
  chat: 'M4 5h16v11H10l-5 4v-4H4z',
  target: 'M12 3a9 9 0 1 0 0.01 0M12 8a4 4 0 1 0 0.01 0M12 12h.01',
  box: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
  car: 'M3 14l2-5h14l2 5v4H3zM6 18v2M18 18v2M7 14h.01M17 14h.01',
  skull: 'M12 3a8 8 0 0 0-8 8v3l2 2v4h12v-4l2-2v-3a8 8 0 0 0-8-8zM9 11h.01M15 11h.01M10 20v-3M14 20v-3',
  x: 'M6 6l12 12M18 6L6 18',
  flag: 'M5 21V4M5 4h12l-3 4 3 4H5',   // v110: bairros
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
let LOC = 'en-US', NF = null;
export function setLocale(l) { LOC = l === 'pt' ? 'pt-PT' : 'en-US'; NF = null; NF2 = null; }
// em português o browser só separa os milhares a partir de 5 algarismos («6200» mas «12 345»); «always» separa sempre («6 200»)
export function num(n) {
  if (!NF) { try { NF = new Intl.NumberFormat(LOC, { useGrouping: 'always', maximumFractionDigits: 0 }); } catch { NF = new Intl.NumberFormat(LOC, { maximumFractionDigits: 0 }); } }
  return NF.format(Math.floor(n));
}
// euros a valores reais (base nova): «1 500 €» em português, «€1,500» em inglês; sempre por extenso
export function money(n) { return LOC === 'pt-PT' ? num(n) + '\u00a0€' : (n < 0 ? '−€' + num(-n) : '€' + num(n)); }
// cêntimos (só as slots apostam ao cêntimo): «0,20 €», «1,20 €»; um valor redondo escreve-se como os outros («5 €»)
let NF2 = null;
export function moneyC(c) {
  c = Math.round(c);
  if (c % 100 === 0) return money(c / 100);
  if (!NF2) { try { NF2 = new Intl.NumberFormat(LOC, { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch { NF2 = new Intl.NumberFormat(LOC, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } }
  const v = NF2.format(Math.abs(c) / 100);
  return LOC === 'pt-PT' ? (c < 0 ? '−' : '') + v + '\u00a0€' : (c < 0 ? '−€' : '€') + v;
}
export function short(n) { return num(n); }   // (16/11) também o respeito e as stats por extenso: «16K» escondia o valor
export function moneyShort(n) { return money(n); }   // os valores em dinheiro escrevem-se sempre por extenso (sem K nem M)
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
