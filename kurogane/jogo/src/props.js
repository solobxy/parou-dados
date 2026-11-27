// Adereços modelados no Blender (props/defs.py): formas com pormenor e sombra de contacto (AO) já cozida nas cores dos vértices.
// Vêm num ficheiro ao lado da página (props.json, os bytes em base64); se não chegar, o mapa usa as caixas simples de antes (os sorteios do mapa são os mesmos).
import { PROPV, PROPIDX } from './propver.js';
let BUF = null; const CACHE = new Map();
export const propsReady = () => !!BUF;
export async function loadProps(ms = 6000) {
  if (BUF || typeof fetch !== 'function') return !!BUF;
  try { if (/[?&]noprops\b/.test(location.search)) return false; const c = JSON.parse(localStorage.getItem('kurogane-cfg-v1') || 'null'); if (c && c.props === false) return false; } catch (e) { } // definição «Objetos com pormenor» desligada
  try {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null, tm = setTimeout(() => ctl && ctl.abort(), ms);
    const r = await fetch('props.json?v=' + PROPV, ctl ? { signal: ctl.signal } : {}); clearTimeout(tm);
    if (!r.ok) return false; const j = await r.json(); if (j.v !== PROPV) return false; const s = atob(j.b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); BUF = u.buffer; return true;
  } catch (e) { return false; }
}
// as peças de um adereço, prontas para o construtor (sem índice, como os moldes): posição, normal, cor por vértice e caixa
export function propParts(name) {
  if (!BUF) return null; let L = CACHE.get(name); if (L) return L; const idx = PROPIDX[name]; if (!idx) return null;
  L = idx.map(d => { const v = d.v, n = d.n, a = d.a, al = x => (x + 3) & ~3; let o = d.o;
    const Q = new Int16Array(BUF, o, v * 3); o = al(o + v * 6); const NQ = new Int8Array(BUF, o, v * 3), CQ = new Uint8Array(BUF, o + v * 3, v * 3); o = al(o + v * 6); const I = new Uint16Array(BUF, o, n);
    const p = new Float32Array(n * 3), nn = new Float32Array(n * 3), cv = new Float32Array(n * 3), s = d.s;
    for (let k = 0; k < n; k++) { const j = I[k] * 3, w = k * 3;
      for (let c = 0; c < 3; c++) { p[w + c] = a[c] + (Q[j + c] + 32768) / 65535 * (a[c + 3] - a[c]); nn[w + c] = NQ[j + c] / 127; const q = CQ[j + c] / 255; cv[w + c] = q * q * s; } }
    return { tpl: true, prop: true, p, n: nn, uv: null, cv, bb: a.slice(), m: d.m, t: d.t, dispose() {} }; });
  CACHE.set(name, L); return L;
}
