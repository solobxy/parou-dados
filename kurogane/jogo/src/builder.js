// Geometria estática juntada por material e por zona do mapa (poucas chamadas de desenho).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

let seed = 7202611;
export const setSeed = s => { seed = s; };
export const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const rr = (a, b) => a + (b - a) * rnd();
export const ri = (a, b) => Math.floor(rr(a, b + 1));
export const pick = a => a[Math.floor(rnd() * a.length)];
export const shade = (hex, f) => { const c = new THREE.Color(hex); c.multiplyScalar(f); return c.getHex(); };

const KEEP = ['position', 'normal', 'uv'];
const UVS = { asph: 7, tile: 2.4, grass: 9, dirt: 7, conc: 4 };
const _v = new THREE.Vector3(), _c = new THREE.Color(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();

export const mat4 = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));

export class Builder {
  constructor(chunk = 40) { this.chunk = chunk; this.buckets = new Map(); this.stack = [new THREE.Matrix4()]; this.cut = null; this.single = chunk === 0; this.log = []; }
  // desfazer: marca e volta atrás (para tirar mobília que ficou a tapar escadas)
  mark() { return this.log.length; }
  rollback(m) { while (this.log.length > m) { const g = this.log.pop().pop(); if (g) g.dispose(); } }
  get m() { return this.stack[this.stack.length - 1]; }
  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) { this.stack.push(this.m.clone().multiply(mat4(x, y, z, ry, rx, rz))); return this; }
  pop() { this.stack.pop(); return this; }
  // junta uma geometria já criada (é consumida)
  add(g, hex, mat = 'v', local = null, jit = 0) {
    let geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    for (const k of Object.keys(geo.attributes)) if (!KEEP.includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const n = geo.attributes.position.count;
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    const M = local ? this.m.clone().multiply(local) : this.m;
    geo.applyMatrix4(M);
    if (mat === 'fence') { const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < n; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) / 0.5, p.getY(i) / 0.5); }
    else if (UVS[mat]) { const p = geo.attributes.position, uv = geo.attributes.uv, s = UVS[mat]; for (let i = 0; i < n; i++) uv.setXY(i, p.getX(i) / s, -p.getZ(i) / s); }
    if (typeof hex === 'object' && hex.isColor) _c.copy(hex); else _c.set(hex);
    if (jit) _c.multiplyScalar(1 + rr(-jit, jit));
    const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // coisas finas ou pequenas (cabos, postes, placas, cadeiras, carros) desenham-se depois da silhueta do jogador: tapam-no normalmente mas não o põem em raio-X.
    // Só paredes, edifícios, camiões, pilares e lajes por cima (viaduto, pisos) acendem a silhueta, porque só essas o escondem a sério
    let thin = false;
    if (!this.single && !['decal', 'lit', 'gl', 'sign'].includes(mat)) { geo.computeBoundingBox(); const bb = geo.boundingBox, dx = bb.max.x - bb.min.x, dy = bb.max.y - bb.min.y, dz = bb.max.z - bb.min.z; thin = this.thin || mat === 'fence' || !((dy >= 2.0 && Math.max(dx, dz) >= 1.2) || (Math.min(dx, dz) >= 2.5 && bb.min.y >= 2.2 && dy >= 0.12)); }
    let key;
    if (this.single) key = mat;
    else if (this.cut) key = 'cut|' + this.cut + '|' + mat;
    else { _v.set(0, 0, 0).applyMatrix4(M); const ch = thin ? this.chunk * 2 : this.chunk; key = Math.floor(_v.x / ch) + ',' + Math.floor(_v.z / ch) + '|' + mat; } // coisas finas em blocos maiores: menos chamadas de desenho
    if (thin) key += '|t';
    let b = this.buckets.get(key); if (!b) this.buckets.set(key, b = []); b.push(geo); this.log.push(b);
    return geo;
  }
  box(w, h, d, x, y, z, hex, o = {}) { return this.add(new THREE.BoxGeometry(w, h, d), hex, o.mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0), o.jit); }
  rbox(w, h, d, r, x, y, z, hex, o = {}) { return this.add(new RoundedBoxGeometry(w, h, d, o.seg || 2, Math.min(r, Math.min(w, h, d) / 2 - 0.001)), hex, o.mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0), o.jit); }
  cyl(r1, r2, h, n, x, y, z, hex, o = {}) { return this.add(new THREE.CylinderGeometry(r1, r2, h, n, 1, !!o.open), hex, o.mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0), o.jit); }
  sph(r, x, y, z, hex, o = {}) { return this.add(new THREE.SphereGeometry(r, o.ws || 14, o.hs || 10, 0, Math.PI * 2, 0, o.th || Math.PI), hex, o.mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0, o.sx || 1, o.sy || o.sx || 1, o.sz || o.sx || 1), o.jit); }
  ico(r, x, y, z, hex, o = {}) { return this.add(new THREE.IcosahedronGeometry(r, o.det || 0), hex, o.mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0, o.sx || 1, o.sy || o.sx || 1, o.sz || o.sx || 1), o.jit); }
  cap(r, len, x, y, z, hex, o = {}) { return this.add(new THREE.CapsuleGeometry(r, len, 4, 12), hex, o.mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0), o.jit); }
  // chão horizontal (retângulo em x/z)
  floor(x0, z0, x1, z1, y, hex, mat = 'v') { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); return this.add(g, hex, mat, mat4((x0 + x1) / 2, y, (z0 + z1) / 2)); }
  plane(w, h, x, y, z, hex, o = {}) { const g = new THREE.PlaneGeometry(w, h); if (o.uv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, o.uv.u0 + uv.getX(i) * (o.uv.u1 - o.uv.u0), o.uv.v0 + uv.getY(i) * (o.uv.v1 - o.uv.v0)); } return this.add(g, hex, o.mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0), o.jit); }
  tube(points, r, hex, o = {}) { const c = new THREE.CatmullRomCurve3(points); const t0 = this.thin; this.thin = true; try { return this.add(new THREE.TubeGeometry(c, o.seg || 10, r, 4, false), hex, o.mat); } finally { this.thin = t0; } }
  // um único BufferGeometry (para personagens e ícones)
  merged(mat = 'v') { const b = this.buckets.get(mat) || []; const g = mergeGeometries(b, false); b.forEach(x => x.dispose()); this.buckets.delete(mat); return g; }
  build(parent, mats, opts = {}) {
    const cuts = new Map(), out = [];
    for (const [key, geos] of this.buckets) {
      const parts = key.split('|'), thin = parts[parts.length - 1] === 't'; if (thin) parts.pop(); const mat = parts[parts.length - 1];
      const g = mergeGeometries(geos, false); geos.forEach(x => x.dispose());
      g.computeBoundingSphere(); g.computeBoundingBox();
      const m = new THREE.Mesh(g, mats[mat]);
      const sh = !['gl', 'lit', 'sign', 'decal'].includes(mat);
      m.castShadow = sh && mat !== 'asph' && mat !== 'tile' && mat !== 'grass' && mat !== 'dirt'; m.receiveShadow = mat !== 'lit' && mat !== 'sign';
      if (mat === 'gl') m.renderOrder = 2;
      if (mat === 'decal') m.renderOrder = 1;
      if (thin) { m.renderOrder = 3; m.userData.thin = true; }
      if (parts[0] === 'cut') { let gr = cuts.get(parts[1]); if (!gr) { gr = new THREE.Group(); cuts.set(parts[1], gr); parent.add(gr); } gr.add(m); }
      else parent.add(m);
      out.push(m);
    }
    this.buckets.clear(); this.log = [];
    return { cuts, meshes: out };
  }
}

// Atlas para letreiros: todos os letreiros numa só textura.
export class Atlas {
  constructor(W = 2048, H = 2048) { this.W = W; this.H = H; this.c = document.createElement('canvas'); this.c.width = W; this.c.height = H; this.x = this.c.getContext('2d'); this.cx = 0; this.cy = 0; this.row = 0; }
  alloc(w, h) {
    if (this.cx + w > this.W) { this.cx = 0; this.cy += this.row + 2; this.row = 0; }
    if (this.cy + h > this.H) { console.warn('atlas cheio'); this.cy = 0; }
    const s = { px: this.cx, py: this.cy, w, h, u0: this.cx / this.W, u1: (this.cx + w) / this.W, v1: 1 - this.cy / this.H, v0: 1 - (this.cy + h) / this.H };
    this.cx += w + 2; this.row = Math.max(this.row, h); return s;
  }
  // texto (horizontal ou vertical) num retângulo
  sign(text, o = {}) {
    const { w = 128, h = 512, bg = null, fg = '#fff', weight = 900, vertical = false, pad = 0.1, font = 'JP', border = null, sub = null } = o;
    const s = this.alloc(w, h), x = this.x;
    x.save(); x.translate(s.px, s.py); x.beginPath(); x.rect(0, 0, w, h); x.clip();
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
    if (border) { x.strokeStyle = border; x.lineWidth = Math.min(w, h) * 0.06; x.strokeRect(x.lineWidth, x.lineWidth, w - 2 * x.lineWidth, h - 2 * x.lineWidth); }
    const fam = font === 'JP' ? FONT_JP : FONT_UI;
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (vertical) {
      const ch = [...text]; const cs = Math.min(w * (1 - 2 * pad), h * (1 - 2 * pad) / ch.length);
      x.font = `${weight} ${cs * 0.88}px ${fam}`;
      const top = (h - cs * ch.length) / 2; ch.forEach((c, i) => x.fillText(c, w / 2, top + cs * (i + 0.5)));
    } else {
      const hh = sub ? h * 0.62 : h;
      let fs = hh * (1 - 2 * pad); x.font = `${weight} ${fs}px ${fam}`;
      const mw = x.measureText(text).width; if (mw > w * (1 - 2 * pad)) { fs *= w * (1 - 2 * pad) / mw; x.font = `${weight} ${fs}px ${fam}`; }
      x.fillText(text, w / 2, hh / 2 + fs * 0.04 + (sub ? h * 0.04 : 0));
      if (sub) { let f2 = h * 0.2; x.font = `600 ${f2}px ${FONT_UI}`; x.globalAlpha = 0.85; x.fillText(sub, w / 2, h * 0.78); x.globalAlpha = 1; }
    }
    x.restore(); return s;
  }
  draw(w, h, fn) { const s = this.alloc(w, h); this.x.save(); this.x.translate(s.px, s.py); this.x.beginPath(); this.x.rect(0, 0, w, h); this.x.clip(); fn(this.x, w, h); this.x.restore(); return s; }
  texture() { const t = new THREE.CanvasTexture(this.c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; return t; }
}
export const FONT_JP = '"KJP","Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo","Noto Sans CJK JP","Noto Sans JP",sans-serif';
export const FONT_UI = '"Barlow Condensed","Arial Narrow",sans-serif';

export const ctex = (w, h, draw, rep = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
