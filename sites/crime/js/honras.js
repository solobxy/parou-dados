// v100: as barras das honras, desenhadas a partir da honra (sem imagens).
// Cada série (por exemplo, «Mão Leve» I a X, ou o troféu de cada espécie) tem o seu desenho: padrão, forma do emblema e tom,
// atribuídos pela ordem da série dentro da categoria, para não haver duas séries iguais na mesma categoria. O degrau muda a
// moldura (bronze, prata, ouro e platina) e a força do padrão. As cores fogem do vermelho, do verde e do âmbar puros (que no jogo
// querem dizer mau, bom e respeito).
import { svg } from './ui.js';

const HUE = { caca: 82, museu: 24, estudos: 152, dinheiro: 174, viagens: 192, ginasio: 212, arsenal: 228, nivel: 252, rua: 276, imperio: 298, missoes: 318, lutas: 338, prisao: 220 };
const SAT = { prisao: 8, arsenal: 18, caca: 38, museu: 30 };
export const PATTERNS = ['stripes', 'chevron', 'dots', 'waves', 'checker', 'hex', 'rays', 'arcs', 'zigzag', 'hatch', 'triangles', 'circuit', 'scales', 'plaid'];
export const SHAPES = ['circle', 'shield', 'hex', 'diamond', 'square', 'star'];
// o peso de cada padrão (os cheios gritam, os de traço fino somem-se)
const WEIGHT = { stripes: 0.8, chevron: 1, dots: 0.8, waves: 1.2, checker: 0.5, hex: 1.3, rays: 0.9, arcs: 1.4, zigzag: 1, hatch: 1.2, triangles: 0.55, circuit: 1.5, scales: 1.2, plaid: 0.5 };
function seedOf(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rnd(seed) { let a = seed; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const frameOf = (h) => (h.d >= 0.95 && (h.of >= 5 || (h.of === 1 && h.d === 1)) ? 'plat' : h.d > 0.8 ? 'gold' : h.d > 0.4 ? 'silver' : 'bronze');
const FRAME = { bronze: ['#d79a63', '#7a4a24'], silver: ['#f2f4f8', '#7d8693'], gold: ['#ffe08a', '#b07d12'], plat: ['#e8fdff', '#38b8f0'] };
// o desenho de uma honra (só números: serve ao teste e ao desenho)
export function honorStyle(h) {
  const s = h.s ?? 0, r = rnd(seedOf(h.cat + ':' + s)), base = HUE[h.cat] ?? 0, sat = SAT[h.cat] ?? 52;
  const hue = Math.round(base + ((s * 23) % 50) - 25 + 360) % 360, hue2 = Math.round(hue + (r() * 2 - 1) * 32 + 360) % 360;
  const pattern = PATTERNS[s % PATTERNS.length], shape = SHAPES[(Math.floor(s / PATTERNS.length) + s) % SHAPES.length];
  const lvl = h.of > 1 ? h.t / h.of : h.d;
  return { hue, hue2, sat: Math.round(sat + r() * 16), light: Math.round(22 + r() * 8), pattern, shape, scale: 0.75 + r() * 0.5, angle: Math.round(r() * 30 - 15),
    alpha: Math.min(0.55, (0.14 + lvl * 0.22) * WEIGHT[pattern]), frame: frameOf(h) };
}
// a assinatura que tem de ser única entre todas as honras
export const honorSig = (h) => { const s = honorStyle(h); return [h.cat, s.pattern, s.shape, Math.round(s.hue / 4), s.frame, h.t, h.of].join('|'); };

const W = 300, H = 64;
function pattern(g, s, col) {
  const P = (tag, a) => g.append(svg(tag, { fill: 'none', stroke: col, 'stroke-width': 2, ...a }));
  const k = 8 + Math.round(s.scale * 10);
  switch (s.pattern) {
    case 'stripes': for (let x = -H; x < W + H; x += k) P('path', { d: `M${x} ${H}L${x + H} 0`, 'stroke-width': k / 3 }); break;
    case 'chevron': for (let y = -k; y < H + k; y += k) P('path', { d: Array.from({ length: Math.ceil(W / k) + 1 }, (_, i) => `${i ? 'L' : 'M'}${i * k} ${y + (i % 2 ? k / 2 : 0)}`).join('') }); break;
    case 'dots': for (let y = k / 2; y < H; y += k) for (let x = (y / k) % 2 ? k : k / 2; x < W; x += k) g.append(svg('circle', { cx: x, cy: y, r: k / 5, fill: col })); break;
    case 'waves': for (let y = 0; y < H + k; y += k) P('path', { d: Array.from({ length: Math.ceil(W / 4) + 1 }, (_, i) => `${i ? 'L' : 'M'}${i * 4} ${(y + Math.sin((i * 4) / (k * 0.9)) * k * 0.35).toFixed(1)}`).join('') }); break;
    case 'checker': for (let y = 0; y < H; y += k) for (let x = ((y / k) % 2) * k; x < W; x += 2 * k) g.append(svg('rect', { x, y, width: k, height: k, fill: col })); break;
    case 'hex': for (let y = 0; y < H + k; y += k * 0.87) for (let x = 0; x < W + k; x += k * 1.5) { const ox = Math.round(y / (k * 0.87)) % 2 ? k * 0.75 : 0, r2 = k / 2;
      P('path', { d: [0, 1, 2, 3, 4, 5].map((j) => `${j ? 'L' : 'M'}${(x + ox + r2 * Math.cos((j * Math.PI) / 3)).toFixed(1)} ${(y + r2 * Math.sin((j * Math.PI) / 3)).toFixed(1)}`).join('') + 'Z', 'stroke-width': 1.5 }); } break;
    case 'rays': for (let a = 0; a < 360; a += 12) P('path', { d: `M34 32L${(34 + Math.cos((a * Math.PI) / 180) * 400).toFixed(1)} ${(32 + Math.sin((a * Math.PI) / 180) * 400).toFixed(1)}`, 'stroke-width': 3 }); break;
    case 'arcs': for (let r = k; r < W; r += k) P('circle', { cx: W, cy: H / 2, r }); break;
    case 'zigzag': for (let y = 0; y < H + k; y += k) P('path', { d: Array.from({ length: Math.ceil(W / (k / 2)) + 1 }, (_, i) => `${i ? 'L' : 'M'}${(i * k) / 2} ${y + (i % 2 ? k / 3 : 0)}`).join(''), 'stroke-width': 3 }); break;
    case 'hatch': for (let x = -H; x < W + H; x += k) { P('path', { d: `M${x} 0L${x + H} ${H}`, 'stroke-width': 1.5 }); P('path', { d: `M${x} ${H}L${x + H} 0`, 'stroke-width': 1.5 }); } break;
    case 'triangles': for (let y = 0; y < H; y += k) for (let x = ((y / k) % 2) * (k / 2); x < W; x += k) g.append(svg('path', { d: `M${x} ${y + k}L${x + k / 2} ${y}L${x + k} ${y + k}Z`, fill: col })); break;
    case 'circuit': { const r = rnd(seedOf(s.pattern + s.hue + s.hue2)); for (let i = 0; i < 18; i++) { const x = r() * W, y = r() * H, dx = (r() * 60 + 20) * (r() < 0.5 ? -1 : 1);
      P('path', { d: `M${x.toFixed(1)} ${y.toFixed(1)}h${dx.toFixed(1)}v${((r() - 0.5) * 30).toFixed(1)}`, 'stroke-width': 1.5 }); g.append(svg('circle', { cx: x, cy: y, r: 2.2, fill: col })); } break; }
    case 'scales': for (let y = 0; y < H + k; y += k / 2) for (let x = ((y / (k / 2)) % 2) * (k / 2); x < W + k; x += k) P('path', { d: `M${x - k / 2} ${y}A${k / 2} ${k / 2} 0 0 0 ${x + k / 2} ${y}`, 'stroke-width': 1.5 }); break;
    case 'plaid': for (let x = 0; x < W; x += k * 2) g.append(svg('rect', { x, y: 0, width: k * 0.7, height: H, fill: col })); for (let y = 0; y < H; y += k * 2) g.append(svg('rect', { x: 0, y, width: W, height: k * 0.7, fill: col })); break;
  }
}
// o emblema de cada categoria, em 24×24 à volta de (0,0)
const GLYPH = {
  rua: 'M-9 -2h18l-4 9h-10zM-6 -2l2 -7h8l2 7', lutas: 'M-9 -9L9 9M9 -9L-9 9', ginasio: 'M-11 -5h4v10h-4zM7 -5h4v10h-4zM-7 -2h14v4h-14z',
  nivel: 'M0 -11L3 -3L11 -3L5 2L7 10L0 5L-7 10L-5 2L-11 -3L-3 -3Z', dinheiro: 'M6 -7A8 8 0 1 0 6 7M-10 -2h12M-10 2h12', imperio: 'M-10 10V-4L-3 -9V10M-3 10V-2H10V10M-10 10H10',
  viagens: 'M-11 2L11 -6L4 2L11 10L-1 4L-6 9L-6 3Z', caca: 'M0 -11V-4M0 4V11M-11 0H-4M4 0H11M-7 0A7 7 0 1 0 7 0A7 7 0 1 0 -7 0', museu: 'M-11 -5L0 -11L11 -5ZM-9 -3h18M-8 -1v9M-3 -1v9M3 -1v9M8 -1v9M-10 9h20',
  estudos: 'M-10 -8h9a3 3 0 0 1 1 2v14a3 3 0 0 0 -1 -2h-9ZM10 -8h-9a3 3 0 0 0 -1 2v14a3 3 0 0 1 1 -2h9Z', prisao: 'M-10 -10h20v20h-20zM-5 -10v20M0 -10v20M5 -10v20',
  arsenal: 'M-3 -11h6v4h-6zM-4 -7h8v15h-8z', missoes: 'M-7 11V-11M-7 -10h14l-4 5l4 5h-14',
};
function shapePath(s, r) {
  switch (s) {
    case 'circle': return `M${-r} 0A${r} ${r} 0 1 0 ${r} 0A${r} ${r} 0 1 0 ${-r} 0`;
    case 'shield': return `M${-r} ${-r}H${r}V${r * 0.2}Q${r} ${r} 0 ${r * 1.15}Q${-r} ${r} ${-r} ${r * 0.2}Z`;
    case 'hex': return [0, 1, 2, 3, 4, 5].map((j) => `${j ? 'L' : 'M'}${(r * Math.cos((j * Math.PI) / 3 + Math.PI / 6)).toFixed(1)} ${(r * Math.sin((j * Math.PI) / 3 + Math.PI / 6)).toFixed(1)}`).join('') + 'Z';
    case 'diamond': return `M0 ${-r * 1.15}L${r * 1.15} 0L0 ${r * 1.15}L${-r * 1.15} 0Z`;
    case 'square': return `M${-r} ${-r}h${2 * r}v${2 * r}h${-2 * r}Z`;
    default: return Array.from({ length: 10 }, (_, j) => { const a = (j * Math.PI) / 5 - Math.PI / 2, q = j % 2 ? r * 0.55 : r * 1.15; return `${j ? 'L' : 'M'}${(q * Math.cos(a)).toFixed(1)} ${(q * Math.sin(a)).toFixed(1)}`; }).join('') + 'Z';
  }
}
let uid = 0;
function grads(defs, id, s) {
  const [f1, f2] = FRAME[s.frame];
  const bg = svg('linearGradient', { id: id + 'b', x1: 0, y1: 0, x2: 1, y2: 1 });
  bg.append(svg('stop', { offset: 0, 'stop-color': `hsl(${s.hue} ${s.sat}% ${s.light + 10}%)` }), svg('stop', { offset: 1, 'stop-color': `hsl(${s.hue2} ${s.sat}% ${s.light}%)` }));
  const fr = svg('linearGradient', { id: id + 'f', x1: 0, y1: 0, x2: 0, y2: 1 });
  fr.append(svg('stop', { offset: 0, 'stop-color': f1 }), svg('stop', { offset: 1, 'stop-color': f2 }));
  defs.append(bg, fr);
  return [f1, f2];
}
function emblem(h, s, id, f1, size = 22) {
  const em = svg('g');
  em.append(svg('path', { d: shapePath(s.shape, size), fill: `hsl(${s.hue} ${s.sat}% ${Math.max(10, s.light - 8)}%)`, stroke: `url(#${id}f)`, 'stroke-width': s.frame === 'plat' ? 4 : 2.5 }));
  em.append(svg('path', { d: GLYPH[h.cat] || GLYPH.nivel, fill: 'none', stroke: f1, 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: `scale(${(size / 22).toFixed(2)})` }));
  return em;
}
// a barra (300×64). label: o nome escrito na barra; locked: a cinzento
export function honorBar(h, label, { locked = false, cls = '' } = {}) {
  const s = honorStyle(h), id = 'hb' + ++uid;
  const el = svg('svg', { class: 'hbar f-' + s.frame + (locked ? ' lock' : '') + (cls ? ' ' + cls : ''), viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
  const defs = svg('defs'), [f1] = grads(defs, id, s);
  const clip = svg('clipPath', { id: id + 'c' }); clip.append(svg('rect', { x: 3, y: 3, width: W - 6, height: H - 6, rx: 7 }));
  defs.append(clip); el.append(defs);
  el.append(svg('rect', { x: 0, y: 0, width: W, height: H, rx: 9, fill: `url(#${id}f)` }));
  const g = svg('g', { 'clip-path': `url(#${id}c)` });
  g.append(svg('rect', { x: 0, y: 0, width: W, height: H, fill: `url(#${id}b)` }));
  const pg = svg('g', { opacity: s.alpha.toFixed(2), transform: s.pattern === 'rays' || s.pattern === 'arcs' ? '' : `rotate(${s.angle} ${W / 2} ${H / 2})` });
  pattern(pg, s, `hsl(${s.hue2} 70% 82%)`); g.append(pg);
  const em = emblem(h, s, id, f1); em.setAttribute('transform', 'translate(34 32)'); g.append(em);
  // o nome, a encolher até caber (nunca abaixo de 13)
  const fs = Math.max(13, Math.min(18, 222 / Math.max(1, label.length * 0.56)));
  const tx = svg('text', { x: 66, y: (32 + fs * 0.36).toFixed(1), 'font-size': fs.toFixed(1), 'font-weight': 800, fill: '#fff', stroke: '#000a', 'stroke-width': 3, 'paint-order': 'stroke', 'font-family': 'var(--disp, sans-serif)' });
  tx.textContent = label;
  g.append(tx);
  el.append(g);
  return el;
}
// só o emblema com a moldura (para as classificações e os avisos)
export function honorEmblem(h, label) {
  const s = honorStyle(h), id = 'he' + ++uid;
  const el = svg('svg', { class: 'hemb f-' + s.frame, viewBox: '-27 -27 54 54', role: 'img', 'aria-label': label });
  const defs = svg('defs'), [f1] = grads(defs, id, s); el.append(defs);
  el.append(emblem(h, s, id, f1, 21));
  return el;
}
