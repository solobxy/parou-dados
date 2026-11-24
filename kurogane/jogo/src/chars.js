// Personagem do jogador (com equipamento visível) e zombies (desenhados todos de uma vez).
import * as THREE from 'three';
import { Builder, mat4, shade } from './builder.js';

export const HIP = 0.92, SHY = 1.42, SHX = 0.27;
export const LONG = ['m4', 'ak', 'smg', 'cacadeira', 'caca'];

const geoOf = fn => { const b = new Builder(0); fn(b); const out = {}; for (const k of [...b.buckets.keys()]) out[k] = b.merged(k); return out; };
const meshOf = (geos, mats, shadow = true) => { const g = new THREE.Group(); for (const k in geos) { const m = new THREE.Mesh(geos[k], mats[k] || mats.v); m.castShadow = shadow; m.receiveShadow = true; g.add(m); } return g; };

// pose de um zombie: as mesmas matrizes servem para o desenhar e para as hitboxes (o que vês é o que acertas)
const _pe = new THREE.Euler(), _pq = new THREE.Quaternion(), _pv = new THREE.Vector3(), _ps = new THREE.Vector3();
export const newPose = () => ({ r: new THREE.Matrix4(), torso: new THREE.Matrix4(), armL: new THREE.Matrix4(), armR: new THREE.Matrix4(), legL: new THREE.Matrix4(), legR: new THREE.Matrix4() });
export function zombiePose(z, M) {
  const dead = z.state === 'dead', fall = dead ? Math.min(1, z.deadT / 0.45) : 0;
  _pe.set(-fall * Math.PI / 2, z.yaw, 0, 'YXZ'); _pq.setFromEuler(_pe); _pv.set(z.x, (z.y || 0) + fall * 0.16 - (z.sink || 0), z.z); _ps.setScalar(z.sc || 1); M.r.compose(_pv, _pq, _ps);
  const ph = z.phase || 0, amp = dead ? 0 : Math.min(1, z.mv || 0), s = Math.sin(ph), wk = dead ? 0 : (z.wallK || 0), lean = dead ? 0 : (0.22 + (z.state === 'chase' ? 0.15 : 0)) * (1 - 0.65 * wk);
  M.torso.copy(M.r).multiply(mat4(0, HIP + Math.abs(Math.cos(ph)) * 0.03 * amp, 0, Math.sin(ph * 0.5) * 0.1, lean, Math.sin(ph * 0.5 + 1) * 0.06));
  const reach = (z.state === 'wander' ? -0.6 : -1.35) * (1 - wk) - 0.25 * wk, atk = z.atkT > 0 ? Math.sin(z.atkT * 8) * 0.5 : 0;
  M.armL.copy(M.torso).multiply(mat4(-SHX, SHY - HIP, 0, 0, dead ? 0 : reach + s * 0.12 - atk, dead ? 0.5 : 0.15));
  M.armR.copy(M.torso).multiply(mat4(SHX, SHY - HIP, 0, 0, dead ? 0 : reach - s * 0.12 - atk * 0.7, dead ? -0.5 : -0.15));
  M.legL.copy(M.r).multiply(mat4(-0.11, HIP, 0, 0, s * 0.55 * amp, 0.03));
  M.legR.copy(M.r).multiply(mat4(0.11, HIP, 0, 0, -s * 0.55 * amp, -0.03));
  return M;
}

// opções de aparência (personalização da personagem)
export const LOOK_OPTS = {
  skin: [0xf1c9a5, 0xe3b48e, 0xd9a882, 0xb9805a, 0x8d5a3b, 0x5e3a25],
  hair: [0x2a211b, 0x4a3424, 0x7a5434, 0xb08a4a, 0x8a8a86, 0xb8342a],
  hairS: ['Curto', 'Rapado', 'Comprido', 'Rabo', 'Moicano'],
  beardS: ['Sem', 'Barba', 'Bigode'],
  top: [0x5c6846, 0x3a4a5e, 0x6a3a32, 0x2a2b2c, 0x8a7a5a, 0xc4b9a4, 0x4f5f6a, 0x7a2a3a],
  legs: [0x3a3f33, 0x2c3440, 0x4a3a2a, 0x2a2a2a, 0x6a6458, 0x3d4a5a],
};
const mixC = (a, b, t) => { const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255; return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t); };
export function partGeos(c) {
  const leg = geoOf(b => { b.cap(0.1, 0.6, 0, -0.42, 0, c.legs); b.rbox(0.19, 0.12, 0.3, 0.04, 0, -0.86, 0.05, c.shoes); if (c.blood) b.box(0.15, 0.1, 0.02, 0.02, -0.25, 0.1, c.blood); });
  const arm = geoOf(b => { b.sph(0.085, 0, 0, 0, c.top); b.cap(0.07, 0.38, 0, -0.27, 0, c.sleeve ?? c.top); b.sph(0.066, 0, -0.55, 0, c.hand ?? c.skin); if (c.zombie) b.cap(0.062, 0.14, 0, -0.42, 0, c.skin); });
  const torso = geoOf(b => {
    b.rbox(0.4, 0.2, 0.24, 0.06, 0, 0.06, 0, c.legs);
    b.box(0.41, 0.05, 0.25, 0, 0.15, 0, 0x2a2623);
    b.rbox(0.46, 0.5, 0.26, 0.09, 0, 0.43, 0, c.top);
    b.cyl(0.065, 0.075, 0.1, 8, 0, 0.73, 0, c.skin);
    b.sph(0.145, 0, 0.88, 0.01, c.skin, { sy: 1.12, ws: 18, hs: 13 });
    // cabelo: 0 curto, 1 rapado, 2 comprido, 3 rabo-de-cavalo, 4 moicano
    const hs = c.hairS ?? 0, stub = mixC(c.hair, c.skin, 0.55);
    if (hs === 1 || hs === 4) b.sph(0.149, 0, 0.9, -0.012, stub, { th: Math.PI * 0.5, ws: 18, hs: 8 }); else b.sph(0.152, 0, 0.9, -0.012, c.hair, { th: Math.PI * 0.52, ws: 18, hs: 8 });
    if (hs === 2) { b.rbox(0.29, 0.26, 0.09, 0.04, 0, 0.8, -0.115, c.hair); for (const s of [-1, 1]) b.rbox(0.05, 0.2, 0.16, 0.02, s * 0.14, 0.84, -0.03, c.hair); }
    if (hs === 3) { b.sph(0.05, 0, 0.9, -0.16, c.hair); b.cap(0.035, 0.14, 0, 0.78, -0.18, c.hair); }
    if (hs === 4) b.rbox(0.055, 0.07, 0.28, 0.025, 0, 1.04, -0.015, c.hair);
    for (const s of [-1, 1]) b.box(0.034, 0.022, 0.02, s * 0.052, 0.89, 0.15, c.eye ?? 0x1a1a1a);
    if (c.beard && (c.beardS ?? 1) === 1) b.sph(0.148, 0, 0.84, 0.02, c.beard, { th: Math.PI, sy: 0.7, sz: 1.05, sx: 1.0, ws: 10, hs: 6 });
    if (c.beard && c.beardS === 2) b.box(0.1, 0.022, 0.025, 0, 0.838, 0.148, c.beard);
    if (c.blood) { b.box(0.2, 0.18, 0.02, 0.08, 0.5, 0.135, c.blood); b.box(0.12, 0.1, 0.02, -0.12, 0.3, 0.135, c.blood); b.box(0.1, 0.06, 0.02, 0.02, 0.8, 0.14, c.blood); }
    if (c.torn) b.box(0.3, 0.08, 0.27, 0, 0.2, 0, shade(c.top, 0.7));
  });
  return { leg, arm, torso };
}

export function gearGeos() {
  const OLV = 0x5f6844, TAN = 0x8a7a55;
  return {
    head: geoOf(b => { b.sph(0.185, 0, 0.92, 0.0, OLV, { th: Math.PI * 0.55, ws: 14, hs: 8 }); b.rbox(0.08, 0.06, 0.05, 0.015, 0, 1.04, 0.16, 0x2a2b2c); for (const s of [-1, 1]) b.rbox(0.03, 0.09, 0.12, 0.01, s * 0.175, 0.86, 0.02, shade(OLV, 0.8)); }),
    vest: geoOf(b => { b.rbox(0.54, 0.44, 0.36, 0.06, 0, 0.44, 0, TAN); for (const x of [-0.15, 0, 0.15]) b.rbox(0.12, 0.15, 0.07, 0.02, x, 0.33, 0.19, shade(TAN, 0.8)); b.rbox(0.07, 0.15, 0.05, 0.015, 0.2, 0.56, 0.19, 0x2a2b2c); }),
    back: geoOf(b => { b.rbox(0.42, 0.52, 0.26, 0.08, 0, 0.44, -0.27, 0x7a5f3c); b.rbox(0.3, 0.2, 0.09, 0.03, 0, 0.32, -0.43, 0x634c30); b.cyl(0.1, 0.1, 0.5, 10, 0, 0.76, -0.27, 0x8a4b36, { rz: Math.PI / 2 }); for (const s of [-0.13, 0.13]) b.box(0.05, 0.46, 0.02, s, 0.46, 0.15, 0x4e3c24); }),
  };
}

// armas: rifle no espaço do tronco (cano em +z); as outras na mão direita (ao longo de -y do braço)
export function weaponGeos() {
  const BLK = 0x1c1e21, WOOD = 0x7a5232, ST = 0x8f8d86;
  const inHand = fn => geoOf(b => { b.push(0, -0.56, 0, 0, Math.PI / 2, 0); fn(b); b.pop(); });
  return {
    m4: geoOf(b => { b.push(0.07, SHY - HIP - 0.12, 0.16); b.rbox(0.07, 0.11, 0.5, 0.015, 0, 0, 0.12, BLK, { mat: 'm' }); b.rbox(0.08, 0.09, 0.34, 0.02, 0, 0, 0.5, 0x5a5a4e); b.cyl(0.016, 0.016, 0.32, 8, 0, 0.005, 0.82, BLK, { rx: Math.PI / 2, mat: 'm' }); b.rbox(0.06, 0.13, 0.28, 0.02, 0, -0.02, -0.24, 0x5a5a4e); b.rbox(0.05, 0.2, 0.08, 0.015, 0, -0.13, 0.18, BLK, { rx: 0.25 }); b.rbox(0.045, 0.12, 0.06, 0.012, 0, -0.1, -0.02, BLK, { rx: -0.3 }); b.pop(); }),
    pistola: inHand(b => { b.rbox(0.035, 0.05, 0.21, 0.012, 0, 0.03, 0.06, 0x2a2c2e, { mat: 'm' }); b.rbox(0.036, 0.12, 0.05, 0.012, 0, -0.04, -0.02, BLK, { rx: 0.28 }); }),
    pedra: inHand(b => { b.ico(0.07, 0, 0.02, 0.03, ST, { mat: 'vf', sx: 1.1, sy: 0.9, sz: 1.2 }); }),
    machado: inHand(b => { b.cyl(0.018, 0.02, 0.5, 8, 0, 0, 0.16, WOOD, { rx: Math.PI / 2 }); b.ico(0.06, 0, 0.07, 0.38, ST, { mat: 'vf', sx: 0.55, sy: 1.5, sz: 0.7 }); }),
    picareta: inHand(b => { b.cyl(0.018, 0.02, 0.55, 8, 0, 0, 0.18, WOOD, { rx: Math.PI / 2 }); b.cyl(0.022, 0.012, 0.34, 6, 0, 0, 0.42, ST, { mat: 'vf' }); }),
    lanca: inHand(b => { b.cyl(0.016, 0.018, 1.5, 8, 0, 0, 0.35, 0x8a6a42, { rx: Math.PI / 2 }); b.add(new THREE.ConeGeometry(0.03, 0.18, 6), 0x5a4030, 'vf', mat4(0, 0, 1.18, 0, Math.PI / 2)); }),
    revolver: inHand(b => { b.cyl(0.014, 0.014, 0.18, 8, 0, 0.035, 0.1, 0x2a2c2e, { rx: Math.PI / 2, mat: 'm' }); b.cyl(0.028, 0.028, 0.05, 6, 0, 0.03, 0.0, 0x3a3c3e, { rx: Math.PI / 2, mat: 'm' }); b.rbox(0.034, 0.11, 0.05, 0.012, 0, -0.04, -0.04, 0x6a4a2e, { rx: 0.3 }); }),
    faca: inHand(b => { b.box(0.022, 0.03, 0.12, 0, 0, 0.0, 0x2a2a2a); b.box(0.006, 0.035, 0.2, 0, 0, 0.16, 0xd6dade, { mat: 'm' }); }),
    bastao: inHand(b => { b.cyl(0.02, 0.038, 0.8, 10, 0, 0, 0.32, 0xc9a877, { rx: Math.PI / 2 }); }),
    pecabra: inHand(b => { b.cyl(0.013, 0.013, 0.55, 6, 0, 0, 0.2, 0xb8322a, { rx: Math.PI / 2, mat: 'm' }); b.box(0.02, 0.07, 0.03, 0, 0.03, 0.47, 0xb8322a, { mat: 'm' }); }),
    machete: inHand(b => { b.box(0.024, 0.035, 0.13, 0, 0, 0.0, 0x2a2a2a); b.box(0.006, 0.06, 0.45, 0, 0.01, 0.28, 0xb8bcc0, { mat: 'm' }); }),
    smg: geoOf(b => { b.push(0.07, SHY - HIP - 0.12, 0.2); b.rbox(0.06, 0.09, 0.36, 0.015, 0, 0, 0.1, BLK, { mat: 'm' }); b.cyl(0.014, 0.014, 0.14, 8, 0, 0.01, 0.34, BLK, { rx: Math.PI / 2 }); b.rbox(0.04, 0.17, 0.045, 0.01, 0, -0.12, 0.16, BLK); b.rbox(0.045, 0.1, 0.05, 0.012, 0, -0.08, 0.0, BLK, { rx: -0.3 }); b.box(0.02, 0.025, 0.2, 0, 0, -0.16, 0x3a3c3e); b.pop(); }),
    ak: geoOf(b => { b.push(0.07, SHY - HIP - 0.12, 0.16); b.rbox(0.065, 0.1, 0.5, 0.015, 0, 0, 0.12, 0x3a3c3e, { mat: 'm' }); b.rbox(0.07, 0.07, 0.24, 0.015, 0, -0.005, 0.46, 0x8a5a32); b.cyl(0.013, 0.013, 0.3, 8, 0, 0.01, 0.74, BLK, { rx: Math.PI / 2, mat: 'm' }); b.rbox(0.045, 0.2, 0.07, 0.015, 0, -0.14, 0.22, 0x3a3c3e, { rx: 0.4 }); b.rbox(0.055, 0.12, 0.3, 0.02, 0, -0.03, -0.25, 0x8a5a32); b.pop(); }),
    cacadeira: geoOf(b => { b.push(0.07, SHY - HIP - 0.12, 0.16); b.cyl(0.024, 0.024, 0.8, 10, 0, 0.03, 0.48, BLK, { rx: Math.PI / 2, mat: 'm' }); b.cyl(0.02, 0.02, 0.62, 10, 0, -0.02, 0.4, 0x2a2c2e, { rx: Math.PI / 2, mat: 'm' }); b.rbox(0.07, 0.07, 0.22, 0.02, 0, -0.02, 0.36, WOOD); b.rbox(0.07, 0.12, 0.26, 0.02, 0, 0.0, 0.02, BLK, { mat: 'm' }); b.rbox(0.06, 0.12, 0.34, 0.03, 0, -0.04, -0.28, WOOD); b.pop(); }),
    caca: geoOf(b => { b.push(0.07, SHY - HIP - 0.12, 0.16); b.cyl(0.016, 0.016, 0.66, 10, 0, 0.03, 0.62, BLK, { rx: Math.PI / 2, mat: 'm' }); b.rbox(0.065, 0.07, 0.62, 0.025, 0, -0.005, 0.22, 0x7a4a2a); b.rbox(0.06, 0.12, 0.32, 0.03, 0, -0.03, -0.24, 0x7a4a2a); b.pop(); }),
    // acessórios: silenciador na ponta do cano e mira por cima
    ...(() => { const o = {}; const BY = SHY - HIP - 0.12;
      const sup = (y, z, r, l) => geoOf(b => { b.push(0.07, BY, 0.16); b.cyl(r, r, l, 12, 0, y, z + l / 2, 0x2c2e30, { rx: Math.PI / 2, mat: 'm' }); for (let i = 1; i < 4; i++) b.cyl(r + 0.002, r + 0.002, 0.008, 12, 0, y, z + l * i / 4, 0x17181a, { rx: Math.PI / 2 }); b.pop(); });
      const sc = (y, z, big) => geoOf(b => { b.push(0.07, BY, 0.16); const r = big ? 0.03 : 0.024, l = big ? 0.32 : 0.24; b.cyl(r, r, l, 12, 0, y, z, BLK, { rx: Math.PI / 2, mat: 'm' }); b.cyl(r + 0.01, r, 0.05, 12, 0, y, z + l / 2, BLK, { rx: Math.PI / 2, mat: 'm' }); b.cyl(r * 0.85, r * 0.85, 0.004, 12, 0, y, z + l / 2 + 0.026, 0x6a9ac8, { rx: Math.PI / 2 }); for (const dz of [-0.06, 0.06]) b.box(0.02, 0.05, 0.03, 0, y - 0.04, z + dz, 0x2a2c2e, { mat: 'm' }); b.pop(); });
      o.sup_m4 = sup(0.005, 0.98, 0.026, 0.24); o.sup_ak = sup(0.01, 0.89, 0.026, 0.24); o.sup_caca = sup(0.03, 0.95, 0.024, 0.26); o.sup_smg = sup(0.01, 0.41, 0.024, 0.2);
      o.sup_pistola = inHand(b => { b.cyl(0.02, 0.02, 0.16, 12, 0, 0.03, 0.245, 0x2c2e30, { rx: Math.PI / 2, mat: 'm' }); });
      o.sc_m4 = sc(0.1, 0.14); o.sc_ak = sc(0.1, 0.12); o.sc_caca = sc(0.1, 0.14); o.sc8_caca = sc(0.11, 0.14, true);
      // ponto vermelho (caixa baixa com vidro) e lanterna por baixo do cano
      const rd = (y, z) => geoOf(b => { b.push(0.07, BY, 0.16); b.box(0.045, 0.012, 0.07, 0, y - 0.02, z, 0x2a2c2e, { mat: 'm' }); b.box(0.006, 0.05, 0.06, -0.022, y + 0.01, z, BLK, { mat: 'm' }); b.box(0.006, 0.05, 0.06, 0.022, y + 0.01, z, BLK, { mat: 'm' }); b.box(0.05, 0.008, 0.06, 0, y + 0.038, z, BLK, { mat: 'm' }); b.box(0.038, 0.04, 0.004, 0, y + 0.012, z + 0.028, 0x8ab8d8); b.pop(); });
      o.rd_m4 = rd(0.085, 0.12); o.rd_ak = rd(0.085, 0.1); o.rd_smg = rd(0.07, 0.06); o.rd_caca = rd(0.075, 0.12);
      const lt = (y, z) => geoOf(b => { b.push(0.07, BY, 0.16); b.cyl(0.016, 0.016, 0.09, 10, 0, y, z, BLK, { rx: Math.PI / 2, mat: 'm' }); b.cyl(0.019, 0.016, 0.02, 10, 0, y, z + 0.05, BLK, { rx: Math.PI / 2, mat: 'm' }); b.cyl(0.015, 0.015, 0.003, 10, 0, y, z + 0.062, 0xfff4d8, { rx: Math.PI / 2, mat: 'lit' }); b.box(0.012, 0.02, 0.05, 0, y + 0.02, z, 0x2a2c2e); b.pop(); });
      o.lt_m4 = lt(-0.055, 0.6); o.lt_ak = lt(-0.05, 0.6); o.lt_smg = lt(-0.055, 0.28); o.lt_caca = lt(-0.035, 0.62); o.lt_cacadeira = lt(-0.05, 0.62);
      o.lt_pistola = inHand(b => { b.cyl(0.014, 0.014, 0.07, 10, 0, -0.035, 0.1, BLK, { rx: Math.PI / 2, mat: 'm' }); b.cyl(0.012, 0.012, 0.003, 10, 0, -0.035, 0.137, 0xfff4d8, { rx: Math.PI / 2, mat: 'lit' }); });
      return o; })(),
    katana: inHand(b => { b.cyl(0.02, 0.022, 0.25, 8, 0, 0, -0.02, 0x2a2230, { rx: Math.PI / 2 }); b.cyl(0.045, 0.045, 0.012, 14, 0, 0, 0.11, 0x3a3328, { rx: Math.PI / 2, mat: 'm' }); b.box(0.01, 0.045, 0.76, 0, 0, 0.5, 0xd6dade, { mat: 'm' }); }),
  };
}

export class Body {
  // personagem com hierarquia normal (jogador e corpos)
  constructor(mats, c, opts = {}) {
    const P = partGeos(c), G = gearGeos(), Wp = weaponGeos();
    this.root = new THREE.Group();
    this.torso = new THREE.Group(); this.torso.position.y = HIP; this.root.add(this.torso);
    this.torso.add(meshOf(P.torso, mats));
    this.legs = [-1, 1].map(s => { const g = meshOf(P.leg, mats); g.position.set(s * 0.11, HIP, 0); this.root.add(g); return g; });
    this.arms = [-1, 1].map(s => { const g = meshOf(P.arm, mats); g.position.set(s * SHX, SHY - HIP, 0); this.torso.add(g); return g; });
    this.gear = {}; for (const k in G) { const g = meshOf(G[k], mats); g.visible = false; this.torso.add(g); this.gear[k] = g; }
    this.weps = {}; for (const k in Wp) { const g = meshOf(Wp[k], mats); g.visible = false; const base = k.replace(/^(sup|sc8|sc|rd|lt)_/, ''); (LONG.includes(base) ? this.torso : this.arms[1]).add(g); this.weps[k] = g; }
    // o que tens na mão ao usar: comida, bebida ou ligadura
    this.props = { eat: meshOf(geoOf(b => { b.rbox(0.13, 0.17, 0.05, 0.02, 0, 0, 0, 0xd8c8a0); b.box(0.135, 0.05, 0.055, 0, 0.05, 0, 0xc8321e); }), mats), drink: meshOf(geoOf(b => { b.cyl(0.04, 0.04, 0.2, 10, 0, 0, 0, 0x8ab8d8); b.cyl(0.02, 0.025, 0.04, 8, 0, 0.12, 0, 0x2a6aa8); }), mats), heal: meshOf(geoOf(b => { b.cyl(0.05, 0.05, 0.08, 12, 0, 0, 0, 0xf2f0ea, { rz: Math.PI / 2 }); }), mats) };
    for (const k in this.props) { const m = this.props[k]; m.visible = false; m.position.set(0, -0.6, 0.05); this.arms[1].add(m); }
    this.phase = 0;
  }
  setGear(eq) { for (const k in this.gear) this.gear[k].visible = !!eq[k]; }
  setWeapon(k, att = {}) { const sc = att.scope ? (att.scope === 'mira8' ? 'sc8_' : att.scope === 'reddot' ? 'rd_' : 'sc_') + k : null, sp = att.sup ? 'sup_' + k : null, lt = att.light ? 'lt_' + k : null; const vis = [sc, sp, lt].filter(w => w && this.weps[w]); for (const w in this.weps) this.weps[w].visible = w === k || vis.includes(w); this.wk = k; this.wkAtt = vis; }
  // anim: mv (0..1.5), mode ('rifle','pistol','melee','none'), swing (0..1 ou -1), dt
  pose(dt, mv, mode, swing = -1, recoil = 0, twist = 0, climb = -1, step = 0, raise = 1, use = null) {
    this.phase += step * 2.7;
    const amp = Math.min(1, mv), s = Math.sin(this.phase);
    this.amp = (this.amp ?? 0) + (amp - (this.amp ?? 0)) * Math.min(1, dt * 8); const A = this.amp;
    this.legs[0].rotation.set(s * 0.6 * A, 0, 0); this.legs[1].rotation.set(-s * 0.6 * A, 0, 0);
    this.torso.position.y = HIP + Math.abs(Math.cos(this.phase)) * 0.04 * A - A * 0.02;
    const [L, R] = this.arms; L.rotation.set(0, 0, 0); R.rotation.set(0, 0, 0);
    this.torso.rotation.set(0.03 + A * 0.08 + (mv > 1.2 ? 0.08 : 0), twist, 0);
    if (climb >= 0) { const c = climb; R.rotation.set(-2.7 + c * 1.9, 0, -0.2); L.rotation.set(-2.7 + c * 1.9, 0, 0.2); this.legs[0].rotation.x = -1.4 * Math.sin(c * Math.PI); this.legs[1].rotation.x = -0.5 * Math.sin(c * Math.PI); this.torso.rotation.x = 0.45 * Math.sin(c * Math.PI); this.torso.position.y = HIP - 0.12 * Math.sin(c * Math.PI); return; }
    // arma em baixo (segura, a apontar para o chão) ou levantada a apontar
    const lo = 1 - raise, wk = this.wk && this.weps[this.wk];
    if (wk && LONG.includes(this.wk)) { const rx = lo * 0.62; wk.rotation.x = rx; for (const a of this.wkAtt || []) if (a) this.weps[a].rotation.x = rx; }
    if (mode === 'rifle') { R.rotation.set(-1.22 + recoil * 0.2 + lo * 0.55, 0.05, -0.12); L.rotation.set(-1.42 + lo * 0.6, 0, 0.5); this.torso.rotation.y = twist - 0.12 * raise; }
    else if (mode === 'pistol') { R.rotation.set(-1.52 + recoil * 0.35 + lo * 0.95, 0.08, 0.02); L.rotation.set(-1.38 + lo * 1.1, 0, 0.42 - lo * 0.2); }
    else if (mode === 'melee') {
      if (swing >= 0) {
        let rx;
        if (swing < 0.2) rx = -0.55 - 2.05 * (swing / 0.2);
        else if (swing < 0.5) { const t = (swing - 0.2) / 0.3; rx = -2.6 + 2.25 * (1 - Math.pow(1 - t, 3)); }
        else rx = -0.35 - 0.2 * ((swing - 0.5) / 0.5);
        R.rotation.set(rx, 0, swing < 0.5 ? -0.3 + swing * 0.6 : 0);
        this.torso.rotation.y = twist + (swing < 0.2 ? -0.35 * (swing / 0.2) : swing < 0.5 ? -0.35 + 0.7 * ((swing - 0.2) / 0.3) : 0.35 * (1 - (swing - 0.5) / 0.5));
      }
      else { R.rotation.set(-0.55 - s * 0.2 * A, 0, -0.1); }
      L.rotation.set(s * 0.4 * A - 0.1, 0, 0.12);
    } else { R.rotation.set(-s * 0.5 * A, 0, -0.08); L.rotation.set(s * 0.5 * A, 0, 0.08); }
    // a usar alguma coisa: a arma vai para o lado e as mãos fazem o gesto (levar à boca, beber, enrolar a ligadura)
    const uk = use ? use.kind : null; for (const k in this.props) this.props[k].visible = k === uk;
    if (this.wk && this.weps[this.wk]) { const hide = !!uk; this.weps[this.wk].visible = !hide; for (const a of this.wkAtt || []) if (a) this.weps[a].visible = !hide; }
    if (uk) { const t = use.t, e = Math.min(1, t * 6, (1 - t) * 6), w = Math.sin(t * Math.PI * (uk === 'heal' ? 10 : uk === 'drink' ? 3 : 6));
      if (uk === 'heal') { R.rotation.set(-1.05 + w * 0.22 * e, 0.35, -0.45 + w * 0.12); L.rotation.set(-0.95 - w * 0.22 * e, -0.35, 0.5); this.torso.rotation.x += 0.22 * e; }
      else { R.rotation.set(-0.4 - (uk === 'drink' ? 2.15 : 1.9) * e + w * 0.12 * e, 0.25, -0.5 * e); L.rotation.set(-0.5 * e, 0, 0.2); this.torso.rotation.x += (uk === 'drink' ? -0.14 : 0.06) * e; } }
  }
  lie() { this.root.rotation.x = -Math.PI / 2; this.root.position.y = 0.16; this.legs.forEach(l => l.rotation.set(0, 0, 0)); this.arms[0].rotation.set(0, 0, 0.5); this.arms[1].rotation.set(0, 0, -0.5); }
}

export class Horde {
  // zombies: 3 partes repetidas por instância (tronco+cabeça, pernas, braços)
  constructor(scene, mats, max = 28, silMat = null) {
    this.max = max;
    const P = partGeos({ skin: 0x8f9a7e, top: 0x8a8274, legs: 0x3a3d44, shoes: 0x26221e, hair: 0x2a2520, blood: 0x5a0e0b, eye: 0xd8d0a0, zombie: true, torn: true, sleeve: 0x9a948a });
    const mk = g => { const m = new THREE.InstancedMesh(g.v, mats.v, max); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; m.renderOrder = 3; scene.add(m); return m; };
    this.torso = mk(P.torso); this.legL = mk(P.leg); this.legR = mk(P.leg); this.armL = mk(P.arm); this.armR = mk(P.arm);
    // proteção: capacete e colete (tingidos por zombie)
    const arm = geoOf(b => { b.sph(0.172, 0, 0.9, 0.0, 0xffffff, { th: Math.PI * 0.5, ws: 14, hs: 7 }); b.box(0.36, 0.03, 0.04, 0, 0.9, 0.16, 0xd8d8d8); });
    const vst = geoOf(b => { b.rbox(0.52, 0.42, 0.33, 0.06, 0, 0.44, 0, 0xffffff); for (const x of [-0.13, 0, 0.13]) b.rbox(0.1, 0.12, 0.06, 0.02, x, 0.34, 0.17, 0xd0d0d0); });
    const mk2 = g => { const m = new THREE.InstancedMesh(g.v, mats.v, max); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; m.renderOrder = 3; scene.add(m); return m; };
    this.helm = mk2(arm); this.vest = mk2(vst);
    this.sil = silMat ? [P.torso, P.leg, P.leg, P.arm, P.arm].map(g => { const m = new THREE.InstancedMesh(g.v, silMat, max); m.frustumCulled = false; m.count = 0; m.renderOrder = 1; scene.add(m); return m; }) : null;
    const tints = [0xffffff, 0xb8c8e8, 0xe8d0b0, 0xc8e0c0, 0xd8c0c8, 0x9aa0b0, 0xf0e8d8];
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) { c.set(tints[i % tints.length]); for (const m of [this.torso, this.legL, this.legR, this.armL, this.armR]) m.setColorAt(i, c); }
    this._m = new THREE.Matrix4(); this._r = new THREE.Matrix4(); this._p = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }
  update(list, noSil = false) {
    const { _m, _r, _p, _q, _e, _v, _s } = this; let n = 0, ns = 0, nh = 0, nv = 0; const c = this._c || (this._c = new THREE.Color());
    for (const z of list) {
      if (n >= this.max) break;
      if (z.hide) continue;
      const dead = z.state === 'dead', M = zombiePose(z, this.M || (this.M = newPose()));
      _p.copy(M.torso); this.torso.setMatrixAt(n, M.torso); this.armL.setMatrixAt(n, M.armL); this.armR.setMatrixAt(n, M.armR); this.legL.setMatrixAt(n, M.legL); this.legR.setMatrixAt(n, M.legR);
      z.inst = n;
      if (z.helm && !dead) { this.helm.setMatrixAt(nh, _p); this.helm.setColorAt(nh, c.set(z.kind === 'pol' ? 0x2a3442 : 0x55603e)); nh++; }
      if (z.vest && !dead) { this.vest.setMatrixAt(nv, _p); this.vest.setColorAt(nv, c.set(z.kind === 'pol' ? 0x2c3a52 : 0x6a6448)); nv++; }
      if (this.sil && z.sees && !dead && !noSil) { const S = this.sil, src = [this.torso, this.legL, this.legR, this.armL, this.armR]; for (let k = 0; k < 5; k++) { src[k].getMatrixAt(n, _m); S[k].setMatrixAt(ns, _m); } ns++; }
      n++;
    }
    for (const m of [this.torso, this.legL, this.legR, this.armL, this.armR]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
    for (const [m, k] of [[this.helm, nh], [this.vest, nv]]) { m.count = k; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    if (this.sil) for (const m of this.sil) { m.count = ns; m.instanceMatrix.needsUpdate = true; }
  }
}

// saco no chão (loot largado ou de zombie) e saco de corpo
export function bagMesh(mats, body = false) {
  const g = geoOf(b => { if (body) { b.rbox(0.7, 0.28, 1.7, 0.12, 0, 0.14, 0, 0x2a2b2c); b.box(0.05, 0.02, 1.5, 0, 0.29, 0, 0x6a6e72); } else { b.sph(0.26, 0, 0.18, 0, 0x5a4a32, { sy: 0.75, ws: 10, hs: 7 }); b.cyl(0.07, 0.1, 0.12, 8, 0, 0.38, 0, 0x4a3a28); } });
  return meshOf(g, mats);
}
