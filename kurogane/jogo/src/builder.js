// Geometria estática juntada por material e por zona do mapa (poucas chamadas de desenho).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { propParts } from './props.js';

let seed = 7202611;
export const setSeed = s => { seed = s; };
export const PSTAT = {}; // quantos adereços do Blender e onde estão os primeiros (para testes)
export const getSeed = () => seed;
export const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const rr = (a, b) => a + (b - a) * rnd();
export const ri = (a, b) => Math.floor(rr(a, b + 1));
export const pick = a => a[Math.floor(rnd() * a.length)];
export const shade = (hex, f) => { const c = new THREE.Color(hex); c.multiplyScalar(f); return c.getHex(); };

const KEEP = ['position', 'normal', 'uv'];
const UVS = { asph: 7, tile: 2.4, grass: 9, dirt: 7, conc: 4, water: 16 };
const _v = new THREE.Vector3(), _c = new THREE.Color(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();

export const mat4 = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));

// moldes: cada forma base faz-se uma vez (já sem índice) e depois só se copia e estica; antes cada caixa e cilindro era criado e convertido de novo
// (era o que mais pesava ao construir uma vila nova enquanto andas)
const TPL = new Map();
const tpl = (key, mk) => { let g = TPL.get(key); if (!g) { g = mk(); if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; } for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k); if (!g.attributes.normal) g.computeVertexNormals(); TPL.set(key, g); }
  if (!g.rec) { g.computeBoundingBox(); const bb = g.boundingBox; g.rec = { tpl: true, p: g.attributes.position.array, n: g.attributes.normal.array, uv: g.attributes.uv ? g.attributes.uv.array : null, bb: [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z], dispose() {} }; } return g.rec; };
const _lm = new THREE.Matrix4(), _nm = new THREE.Matrix3();
// peça adiada (molde + matriz + cor): faz agora as contas para dentro das listas finais
const _nm2 = new THREE.Matrix3(), _mm = new THREE.Matrix4();
const writeJob = (r, P, N, U, C, o) => { const g = r.src, n = r.count, e = r.M, CV = g.cv; _mm.fromArray(e); const q = _nm2.getNormalMatrix(_mm).elements, S = g.p, NN = g.n, UU = g.uv, sc = UVS[r.mat];
  for (let i = 0, k = 0, w = o * 3; i < n; i++, k += 3, w += 3) { const x = S[k], y = S[k + 1], z = S[k + 2]; const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14]; P[w] = X; P[w + 1] = Y; P[w + 2] = Z;
    const a = NN[k], b = NN[k + 1], c = NN[k + 2]; let nx = q[0] * a + q[3] * b + q[6] * c, ny = q[1] * a + q[4] * b + q[7] * c, nz = q[2] * a + q[5] * b + q[8] * c; const l = Math.hypot(nx, ny, nz) || 1; N[w] = nx / l; N[w + 1] = ny / l; N[w + 2] = nz / l;
    const u = (o + i) * 2; if (r.mat === 'fence') { U[u] = (X + Z) / 0.5; U[u + 1] = Y / 0.5; } else if (sc) { U[u] = X / sc; U[u + 1] = -Z / sc; } else if (UU) { U[u] = UU[i * 2]; U[u + 1] = UU[i * 2 + 1]; } else { U[u] = 0; U[u + 1] = 0; }
    if (CV) { C[w] = r.r * CV[k]; C[w + 1] = r.g * CV[k + 1]; C[w + 2] = r.b * CV[k + 2]; } else { C[w] = r.r; C[w + 1] = r.g; C[w + 2] = r.b; } } };
const writeRec = (r, P, N, U, C, o) => { if (r.job) writeJob(r, P, N, U, C, o); else { P.set(r.p, o * 3); N.set(r.n, o * 3); U.set(r.uv, o * 2); C.set(r.c, o * 3); } };
// junta listas de números numa geometria só (posição, normal, uv, cor)
const mergeRecs = L => { if (!L.length) return null; let n = 0; for (const r of L) n += r.count; const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), C = new Float32Array(n * 3); let o = 0, T = null; for (const r of L) if (r.tid) { T = new Uint8Array(n); break; } for (const r of L) { r.off = o; writeRec(r, P, N, U, C, o); if (T && r.tid) T.fill(r.tid, o, o + r.count); o += r.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); if (T) g.setAttribute('tid', new THREE.BufferAttribute(T, 1)); return g; }; // tid: textura do objeto (0 nenhuma, 1 madeira, 2 ferrugem, 3 metal pintado, 4 betão)
// textura de cada adereço (a parte com a cor do sítio; as peças de metal levam metal pintado)
const PTEX_OF = { caixote: 1, banco: 1, mesa: 1, cadeira: 1, secretaria: 1, balcao: 1, bidao: 2, lixo: 3, carro: 3, vend: 3, armario: 3, armtec: 3, poste: 3, pilarete: 3, marco: 3, cabine: 3, candeeiro: 3, ac: 3, barreira: 4 };
export class Builder {
  constructor(chunk = 40) { this.chunk = chunk; this.buckets = new Map(); this.stack = [new THREE.Matrix4()]; this.cut = null; this.single = chunk === 0; this.log = []; this.rl = []; }
  // desfazer: marca e volta atrás (para tirar mobília que ficou a tapar escadas)
  mark() { return this.log.length; }
  rollback(m) { while (this.log.length > m) { const g = this.log.pop().pop(); this.rl.pop(); if (g) g.dispose(); } }
  recsSince(m) { return this.rl.slice(m); } // peças feitas desde a marca (para o contorno do móvel)
  get m() { return this.stack[this.stack.length - 1]; }
  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) { this.stack.push(this.m.clone().multiply(mat4(x, y, z, ry, rx, rz))); return this; }
  pop() { this.stack.pop(); return this; }
  // junta uma geometria (é consumida) ou um molde: guarda só as listas de números (posição, normal, uv, cor), sem criar objetos do three.js para cada peça
  add(g, hex, mat = 'v', local = null, jit = 0) {
    // a seco (só colisões e loot, sem geometria): gasta o mesmo número de sorteios para o resultado ser igual quando se constrói a sério
    if (this.dry) { if (g && g.dispose) g.dispose(); if (jit) rr(-jit, jit); return null; }
    if (this.defer && g.tpl) return this.addJob(g, hex, mat, local, jit);
    let P, N, U;
    if (g.tpl) { P = g.p; N = g.n; U = g.uv; }
    else { let geo = g.index ? g.toNonIndexed() : g; if (geo !== g) g.dispose(); if (!geo.attributes.normal) geo.computeVertexNormals(); P = geo.attributes.position.array; N = geo.attributes.normal.array; U = geo.attributes.uv ? geo.attributes.uv.array : null; geo.dispose(); }
    const n = P.length / 3;
    const M = local ? _lm.multiplyMatrices(this.m, local) : this.m, e = M.elements, q = _nm.getNormalMatrix(M).elements;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0, k = 0; i < n; i++, k += 3) { const x = P[k], y = P[k + 1], z = P[k + 2];
      const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14]; pos[k] = X; pos[k + 1] = Y; pos[k + 2] = Z;
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z;
      const a = N[k], b = N[k + 1], c = N[k + 2]; let nx = q[0] * a + q[3] * b + q[6] * c, ny = q[1] * a + q[4] * b + q[7] * c, nz = q[2] * a + q[5] * b + q[8] * c; const l = Math.hypot(nx, ny, nz) || 1; nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l; }
    if (mat === 'fence') { for (let i = 0; i < n; i++) { uv[i * 2] = (pos[i * 3] + pos[i * 3 + 2]) / 0.5; uv[i * 2 + 1] = pos[i * 3 + 1] / 0.5; } }
    else if (UVS[mat]) { const sc = UVS[mat]; for (let i = 0; i < n; i++) { uv[i * 2] = pos[i * 3] / sc; uv[i * 2 + 1] = -pos[i * 3 + 2] / sc; } }
    else if (U) uv.set(U.subarray(0, n * 2));
    if (typeof hex === 'object' && hex.isColor) _c.copy(hex); else _c.set(hex);
    if (jit) _c.multiplyScalar(1 + rr(-jit, jit));
    const CV = g.tpl ? g.cv : null; // adereços do Blender: a cor de cada vértice (sombra cozida) multiplica a do sítio
    if (CV) for (let i = 0, k = 0; i < n; i++, k += 3) { col[k] = _c.r * CV[k]; col[k + 1] = _c.g * CV[k + 1]; col[k + 2] = _c.b * CV[k + 2]; }
    else for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    const geo = { p: pos, n: nor, uv, c: col, count: n, mat, tid: this.tid | 0, bb: [x0, y0, z0, x1, y1, z1], dispose() {} };
    // coisas finas ou pequenas (cabos, postes, placas, cadeiras, carros) desenham-se depois da silhueta do jogador: tapam-no normalmente mas não o põem em raio-X.
    // Só paredes, edifícios, camiões, pilares e lajes por cima (viaduto, pisos) acendem a silhueta, porque só essas o escondem a sério
    let thin = false;
    if (!this.single && !['decal', 'lit', 'gl', 'sign'].includes(mat)) { const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0; thin = this.thin || mat === 'fence' || !((dy >= 2.0 && Math.max(dx, dz) >= 1.2) || (Math.min(dx, dz) >= 2.5 && y0 >= 2.2 && dy >= 0.12)); }
    let key;
    if (this.single) key = mat;
    else if (this.cut) key = 'cut|' + this.cut + '|' + mat;
    else { _v.set(0, 0, 0).applyMatrix4(M); const ch = thin ? this.chunk * 2 : this.chunk; key = Math.floor(_v.x / ch) + ',' + Math.floor(_v.z / ch) + '|' + mat; } // coisas finas em blocos maiores: menos chamadas de desenho
    if (thin) key += '|t';
    let b = this.buckets.get(key); if (!b) this.buckets.set(key, b = []); b.push(geo); this.log.push(b); this.rl.push(geo);
    return geo;
  }
  box(w, h, d, x, y, z, hex, o = {}) { if (this.dry) return this.add(new THREE.BufferGeometry(), hex, o.mat, null, o.jit); return this.add(tpl('b', () => new THREE.BoxGeometry(1, 1, 1)), hex, o.mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0, w, h, d), o.jit); }
  rbox(w, h, d, r, x, y, z, hex, o = {}) { if (this.dry) return this.add(new THREE.BufferGeometry(), hex, o.mat, null, o.jit); const sg = o.seg || 2, rr2 = Math.min(r, Math.min(w, h, d) / 2 - 0.001); return this.add(tpl('r' + [w, h, d, sg, rr2].join(','), () => new RoundedBoxGeometry(w, h, d, sg, rr2)), hex, o.mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0), o.jit); }
  cyl(r1, r2, h, n, x, y, z, hex, o = {}) { if (this.dry) return this.add(new THREE.BufferGeometry(), hex, o.mat, null, o.jit); const op = !!o.open, R = Math.max(r1, r2) || 1e-6, a = +(r1 / R).toFixed(5), b2 = +(r2 / R).toFixed(5); return this.add(tpl('c' + [a, b2, n, op].join(','), () => new THREE.CylinderGeometry(a, b2, 1, n, 1, op)), hex, o.mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0, R, h, R), o.jit); }
  sph(r, x, y, z, hex, o = {}) { if (this.dry) return this.add(new THREE.BufferGeometry(), hex, o.mat, null, o.jit); const ws = o.ws || 14, hs = o.hs || 10, th = o.th || Math.PI; return this.add(tpl('s' + [ws, hs, th].join(','), () => new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, th)), hex, o.mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0, r * (o.sx || 1), r * (o.sy || o.sx || 1), r * (o.sz || o.sx || 1)), o.jit); }
  ico(r, x, y, z, hex, o = {}) { if (this.dry) return this.add(new THREE.BufferGeometry(), hex, o.mat, null, o.jit); const dt = o.det || 0; return this.add(tpl('i' + dt, () => new THREE.IcosahedronGeometry(1, dt)), hex, o.mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0, r * (o.sx || 1), r * (o.sy || o.sx || 1), r * (o.sz || o.sx || 1)), o.jit); }
  cap(r, len, x, y, z, hex, o = {}) { return this.add(new THREE.CapsuleGeometry(r, len, 4, 12), hex, o.mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0), o.jit); }
  // chão horizontal (retângulo em x/z)
  floor(x0, z0, x1, z1, y, hex, mat = 'v') { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); return this.add(g, hex, mat, mat4((x0 + x1) / 2, y, (z0 + z1) / 2)); }
  // adereço do Blender: devolve false se o ficheiro não chegou (quem chama faz as caixas de antes). Só as peças com tint levam a cor do sítio e o jit
  model(name, x, y, z, ry, tint = 0xffffff, o = {}) { const L = propParts(name); if (!L) return false; const M = mat4(x, y, z, ry || 0, o.rx || 0, o.rz || 0, (o.s || 1) * (o.sx || 1), (o.s || 1) * (o.sy || 1), (o.s || 1) * (o.sz || 1)); let jit = o.jit || 0;
    if (!this.dry) { const e = this.m.elements, wx = e[0] * x + e[4] * y + e[8] * z + e[12], wz = e[2] * x + e[6] * y + e[10] * z + e[14]; const c = PSTAT[name] || (PSTAT[name] = { n: 0, at: [] }); c.n++; if (c.at.length < 6) c.at.push([+wx.toFixed(1), +wz.toFixed(1), +(Math.atan2(e[8], e[10]) + (ry || 0)).toFixed(2)]); }
    const main = PTEX_OF[name] || 0; for (const P of L) { this.tid = !main ? 0 : P.m === 'm' ? (main === 1 || main === 4 ? 3 : main) : P.t || main === 1 || main === 4 ? main : 0; this.add(P, P.t ? tint : 0xffffff, P.m === 'lit' ? 'lit' : (o.mat && P.m === 'v' ? o.mat : P.m), M, P.t ? jit : 0); if (P.t) jit = 0; } this.tid = 0;
    if (jit) rr(-jit, jit); return true; }
  plane(w, h, x, y, z, hex, o = {}) { const g = new THREE.PlaneGeometry(w, h); if (o.uv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, o.uv.u0 + uv.getX(i) * (o.uv.u1 - o.uv.u0), o.uv.v0 + uv.getY(i) * (o.uv.v1 - o.uv.v0)); } return this.add(g, hex, o.mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0), o.jit); }
  tube(points, r, hex, o = {}) { const c = new THREE.CatmullRomCurve3(points); const t0 = this.thin; this.thin = true; try { return this.add(new THREE.TubeGeometry(c, o.seg || 10, r, 4, false), hex, o.mat); } finally { this.thin = t0; } }
  // adiado (zonas que se constroem enquanto andas): guarda só o molde, a matriz e a cor; as contas fazem-se aos bocados, nas imagens seguintes
  addJob(g, hex, mat, local, jit) {
    const M = local ? _lm.multiplyMatrices(this.m, local) : this.m, e = M.elements, B = g.bb;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < 8; i++) { const x = B[i & 1 ? 3 : 0], y = B[i & 2 ? 4 : 1], z = B[i & 4 ? 5 : 2]; const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14]; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z; }
    if (typeof hex === 'object' && hex.isColor) _c.copy(hex); else _c.set(hex);
    if (jit) _c.multiplyScalar(1 + rr(-jit, jit));
    const geo = { job: true, src: g, M: Float32Array.from(e), r: _c.r, g: _c.g, b: _c.b, mat, count: g.p.length / 3, tid: this.tid | 0, bb: [x0, y0, z0, x1, y1, z1], dispose() {} };
    let thin = false;
    if (!this.single && !['decal', 'lit', 'gl', 'sign'].includes(mat)) { const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0; thin = this.thin || mat === 'fence' || !((dy >= 2.0 && Math.max(dx, dz) >= 1.2) || (Math.min(dx, dz) >= 2.5 && y0 >= 2.2 && dy >= 0.12)); }
    let key;
    if (this.single) key = mat;
    else if (this.cut) key = 'cut|' + this.cut + '|' + mat;
    else { const ch = thin ? this.chunk * 2 : this.chunk; key = Math.floor(e[12] / ch) + ',' + Math.floor(e[14] / ch) + '|' + mat; }
    if (thin) key += '|t';
    let b = this.buckets.get(key); if (!b) this.buckets.set(key, b = []); b.push(geo); this.log.push(b); this.rl.push(geo);
    return geo;
  }
  // construção aos bocados: devolve uma tarefa; step(até) faz o que couber até à hora dada e diz se acabou
  sliced(parent, mats) {
    const ents = [...this.buckets]; this.buckets = new Map(); this.log = [];
    const job = { meshes: [], cuts: new Map(), done: false, cancel() { this.dead = true; } };
    let bi = 0, ri = 0, P, N, U, C, o = 0;
    job.step = until => { if (job.dead) return true;
      while (bi < ents.length) {
        const [key, recs] = ents[bi];
        if (!P) { let n = 0; for (const r of recs) n += r.count; P = new Float32Array(n * 3); N = new Float32Array(n * 3); U = new Float32Array(n * 2); C = new Float32Array(n * 3); o = 0; ri = 0; }
        while (ri < recs.length) { writeRec(recs[ri], P, N, U, C, o); o += recs[ri].count; ri++; if ((ri & 7) === 0 && performance.now() > until) return false; }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); P = null;
        this._mesh(key, g, parent, mats, job.cuts, job.meshes); bi++;
        if (performance.now() > until) return bi >= ents.length ? (job.done = true) : false;
      }
      return (job.done = true); };
    return job;
  }
  _mesh(key, g, parent, mats, cuts, out) {
    const parts = key.split('|'), thin = parts[parts.length - 1] === 't'; if (thin) parts.pop(); const mat = parts[parts.length - 1];
    g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, mats[mat]);
    const sh = !['gl', 'lit', 'sign', 'decal'].includes(mat);
    m.castShadow = sh && mat !== 'water' && mat !== 'asph' && mat !== 'tile' && mat !== 'grass' && mat !== 'dirt'; m.receiveShadow = mat !== 'lit' && mat !== 'sign';
    if (mat === 'gl') m.renderOrder = 2;
    if (mat === 'decal') m.renderOrder = 1;
    if (thin) { m.renderOrder = 3; m.userData.thin = true; }
    if (parts[0] === 'cut') { let gr = cuts.get(parts[1]); if (!gr) { gr = new THREE.Group(); cuts.set(parts[1], gr); parent.add(gr); } gr.add(m); }
    else parent.add(m);
    out.push(m); return m;
  }
  // um único BufferGeometry (para personagens e ícones)
  merged(mat = 'v') { const b = this.buckets.get(mat) || []; const g = mergeRecs(b); this.buckets.delete(mat); return g; }
  build(parent, mats, opts = {}) {
    const cuts = new Map(), out = [];
    for (const [key, geos] of this.buckets) {
      const parts = key.split('|'), thin = parts[parts.length - 1] === 't'; if (thin) parts.pop(); const mat = parts[parts.length - 1];
      const g = mergeRecs(geos);
      g.computeBoundingSphere(); g.computeBoundingBox();
      const m = new THREE.Mesh(g, mats[mat]);
      const sh = !['gl', 'lit', 'sign', 'decal'].includes(mat);
      m.castShadow = sh && mat !== 'water' && mat !== 'asph' && mat !== 'tile' && mat !== 'grass' && mat !== 'dirt'; m.receiveShadow = mat !== 'lit' && mat !== 'sign';
      if (mat === 'gl') m.renderOrder = 2;
      if (mat === 'decal') m.renderOrder = 1;
      if (thin) { m.renderOrder = 3; m.userData.thin = true; }
      if (parts[0] === 'cut') { let gr = cuts.get(parts[1]); if (!gr) { gr = new THREE.Group(); cuts.set(parts[1], gr); parent.add(gr); } gr.add(m); }
      else parent.add(m);
      out.push(m); for (const r of geos) { r.mesh = m; if (!r.job) r.p = r.n = r.uv = r.c = null; } // o contorno de um móvel vai buscar as suas peças à malha final
    }
    this.buckets.clear(); this.log = []; this.rl = [];
    return { cuts, meshes: out };
  }
}

// Atlas para letreiros: todos os letreiros numa só textura.
export class Atlas {
  constructor(W = 2048, H = 2048) { this.W = W; this.H = H; this.c = document.createElement('canvas'); this.c.width = W; this.c.height = H; this.x = this.c.getContext('2d'); this.cx = 0; this.cy = 0; this.row = 0; this.x.fillStyle = '#3a3c40'; this.x.fillRect(0, 0, 6, 6); this.sh = [{ x: 8, y: 0, h: 6 }]; } // canto de cima: cinzento liso para placas que já não cabem
  // prateleiras por altura: cada letreiro vai para a prateleira mais baixa onde cabe (assim os altos não gastam linhas inteiras)
  alloc(w, h) {
    // zonas que se constroem outra vez (ao chegar perto): reutilizam o mesmo sítio da primeira vez (antes enchia o atlas e
    // as placas novas iam parar ao canto de cima, a mostrar a folha inteira de letreiros)
    if (this.rep) { const i = this.rep.findIndex(r => r.w === w && r.h === h); if (i >= 0) return this.rep.splice(i, 1)[0]; }
    const s0 = this.alloc0(w, h); if (this.rec) this.rec.push(s0); return s0;
  }
  alloc0(w, h) {
    this.sh = this.sh || []; let S = this.sh.find(q => q.h >= h && q.h <= h * 1.5 + 8 && q.x + w <= this.W);
    if (!S) { const top = this.sh.reduce((m, q) => Math.max(m, q.y + q.h + 2), 0); if (top + h > this.H) { // atlas cheio: desenha fora da folha (não se vê) e a placa mostra um cinzento liso, em vez de pintar por cima das outras
        if (!this.full) { this.full = 1; console.warn('atlas cheio'); } return { px: -99999, py: -99999, w, h, u0: 2 / this.W, u1: 3 / this.W, v1: 1 - 2 / this.H, v0: 1 - 3 / this.H }; } else { S = { x: 0, y: top, h }; this.sh.push(S); } }
    const s = { px: S.x, py: S.y, w, h, u0: S.x / this.W, u1: (S.x + w) / this.W, v1: 1 - S.y / this.H, v0: 1 - (S.y + h) / this.H };
    S.x += w + 2; this.cy = Math.max(this.cy || 0, S.y + S.h); return s;
  }
  // texto (horizontal ou vertical) num retângulo
  sign(text, o = {}) {
    const key = text + '|' + JSON.stringify(o); this.memo = this.memo || new Map(); if (this.memo.has(key)) return this.memo.get(key); const r = this.sign0(text, o); this.memo.set(key, r); return r;
  }
  sign0(text, o = {}) {
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
export const FONT_UI = '"Roboto Condensed","Arial Narrow",sans-serif';

export const ctex = (w, h, draw, rep = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
