import * as THREE from 'three';
// Árvores com folhas a sério (planos com recorte da imagem foliage.webp) e casca; tufos de erva em lâminas.
// Regiões da imagem (u para a direita, v para cima): folhas [0,.5]×[.5,1], pinheiro [.5,1]×[.5,1], casca [0,.5]×[0,.5], erva [.5,1]×[.25,.5], branco [.5,1]×[0,.25]
const R = { leaf: [0, 0.5, 0.5, 1], pine: [0.5, 0.5, 1, 1], grass: [0.5, 0.25, 1, 0.5] }, WHITE = [0.75, 0.12];
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();
class G { constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  v(p, n, u, v, col) { this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.uv.push(u, v); this.c.push(col.r, col.g, col.b); }
  // plano: centro, meia largura (vetor), meia altura (vetor), região da imagem, cor, normal de cada canto (função)
  quad(C, Rv, Uv, rg, col, nf, flip = false) { const [u0, v0, u1, v1] = rg, U0 = flip ? u1 : u0, U1 = flip ? u0 : u1;
    const P = [C.clone().sub(Rv).sub(Uv), C.clone().add(Rv).sub(Uv), C.clone().add(Rv).add(Uv), C.clone().sub(Rv).add(Uv)], T = [[U0, v0], [U1, v0], [U1, v1], [U0, v1]];
    for (const i of [0, 1, 2, 0, 2, 3]) this.v(P[i], nf(P[i]), T[i][0], T[i][1], col); }
  // tronco: cilindro de casca (u à volta, v ao longo)
  trunk(x0, y0, z0, x1, y1, z1, r0, r1, seg, col, rep = 1) { const A = new THREE.Vector3(x0, y0, z0), B = new THREE.Vector3(x1, y1, z1), ax = B.clone().sub(A), L = ax.length(); ax.normalize();
    const s = Math.abs(ax.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), e1 = s.clone().cross(ax).normalize(), e2 = ax.clone().cross(e1);
    for (let i = 0; i < seg; i++) { const ring = [i, i + 1].map(k => { const t = k / seg * Math.PI * 2; return [Math.cos(t), Math.sin(t), k / seg]; });
      const q = [[ring[0], 0], [ring[1], 0], [ring[1], 1], [ring[0], 0], [ring[1], 1], [ring[0], 1]];
      for (const [[c, sn, f], h] of q) { const r = h ? r1 : r0; _n.copy(e1).multiplyScalar(c).addScaledVector(e2, sn); const P = (h ? B : A).clone().addScaledVector(_n, r); this.v(P, _n, f * 0.5, h ? Math.min(0.5, L / 7 * 0.5 + 0.08) : 0.0, col); } } }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.computeBoundingSphere(); return g; }
}
const col = (hex, k = 1) => _c.setHex(hex).multiplyScalar(k).clone();
// árvore de folha larga (a mesma forma das de antes: copa em 6 tufos por cima de um tronco de 2,6 m)
export function broadTree() { seed = 11; const g = new G(), C = new THREE.Vector3(0, 3.8, 0);
  g.trunk(0, 0, 0, 0.05, 3.0, 0, 0.2, 0.12, 8, col(0xa08a74));
  const CL = [[0, 3.4, 0, 1.55, 0x4a6a32], [0.9, 3.9, 0.3, 1.15, 0x56763a], [-0.8, 3.8, -0.4, 1.1, 0x44622e], [0.1, 4.5, -0.2, 1.0, 0x5c7c40], [-0.3, 3.2, 0.9, 0.95, 0x50703a], [0.6, 3.1, -0.8, 0.9, 0x486834]];
  for (const [x, y, z, r] of CL.slice(1)) g.trunk(0.03, 2.5, 0, x * 0.7, y - 0.3, z * 0.7, 0.07, 0.04, 5, col(0x8a7460));
  for (const [x, y, z, r, c] of CL) { const K = new THREE.Vector3(x, y, z);
    for (let i = 0; i < 9; i++) { const yaw = rnd() * Math.PI * 2, pit = (rnd() - 0.5) * 1.6, s = r * (0.85 + rnd() * 0.4);
      const Rv = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(s), Uv = new THREE.Vector3(Math.sin(yaw) * Math.sin(pit), Math.cos(pit), Math.cos(yaw) * Math.sin(pit)).multiplyScalar(s);
      const P = K.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(r * 0.7));
      g.quad(P, Rv, Uv, R.leaf, col(c, 1.55 * (0.85 + rnd() * 0.3)), V => V.clone().sub(C).multiplyScalar(0.6).add(V.clone().sub(K)).normalize(), rnd() < 0.5); } }
  return g.geo(); }
// pinheiro/cedro: tronco até ao cimo e ramos em camadas (cada ramo são dois planos em cruz, a descer para a ponta)
export function pineTree() { seed = 23; const g = new G();
  g.trunk(0, 0, 0, 0, 6.9, 0, 0.2, 0.05, 8, col(0x9a8470));
  const LY = [[1.95, 2.3, 10], [1.8, 2.95, 10], [1.6, 3.6, 9], [1.35, 4.25, 9], [1.1, 4.9, 8], [0.85, 5.5, 7], [0.6, 6.05, 6], [0.38, 6.5, 5]], CC = [0x2f4a2a, 0x324e2c, 0x34522e, 0x3a5a32, 0x426436];
  LY.forEach(([r, y, n], li) => { for (let i = 0; i < n; i++) { const a = (i + rnd() * 0.6 + li * 0.37) / n * Math.PI * 2, L = r * (0.85 + rnd() * 0.3), d = new THREE.Vector3(Math.sin(a), -0.32 - rnd() * 0.15, Math.cos(a)).normalize();
      const A = new THREE.Vector3(0, y, 0), M = A.clone().addScaledVector(d, L * 0.5), side = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)), up = side.clone().cross(d).normalize(), c = col(CC[Math.min(4, li >> 1)], 1.6 * (0.85 + rnd() * 0.3));
      const nf = V => _a.set(V.x, 0.6, V.z).normalize().clone(), Rv = d.clone().multiplyScalar(L * 0.5), w = L * 0.48;
      g.quad(M, Rv, side.clone().multiplyScalar(w), R.pine, c, nf); g.quad(M, Rv, up.clone().multiplyScalar(w * 0.8), R.pine, c, nf); } });
  for (const yaw of [0, Math.PI / 2]) g.quad(new THREE.Vector3(0, 6.75, 0), new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(0.28), new THREE.Vector3(0, 0.42, 0), [0.5, 0.62, 0.62, 0.88], col(0x426436, 1.6), V => _a.set(V.x, 0.8, V.z).normalize().clone());
  return g.geo(); }
// tufo de erva: 3 planos em cruz com lâminas (a cor vem de cada tufo)
export function grassTuft() { seed = 31; const g = new G(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI + rnd() * 0.3; g.quad(new THREE.Vector3(0, 0.24, 0), new THREE.Vector3(Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38), new THREE.Vector3(0, 0.24, 0), R.grass, col(0xffffff), () => up, rnd() < 0.5); }
  return g.geo(); }
// árvores de longe (as de antes, simples): todas as faces vão buscar o branco da imagem, fica só a cor do vértice
export function whiteUV(geo) { const n = geo.attributes.position.count, uv = new Float32Array(n * 2); for (let i = 0; i < n; i++) { uv[i * 2] = WHITE[0]; uv[i * 2 + 1] = WHITE[1]; } geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo; }
