// Personagem do jogador (com equipamento visível) e zombies (desenhados todos de uma vez).
import * as THREE from 'three';
import { Builder, mat4, shade } from './builder.js';
import { ITEMS, TINTS } from './items.js';
import { GUNS, GUNA, GUNP, dataTpl } from './guns.js';
import { GEARDATA } from './geardata.js';
import { ZBODY } from './zbody.js';
import { PBODY } from './pbody.js';
import { FPARMS } from './fparms.js';

export const HIP = 0.92, SHY = 1.42, SHX = 0.27;
export const LONG = ['m4', 'ak', 'smg', 'cacadeira', 'caca', 'cheytac', 'barrett', 'm249', 'pkm'];

const geoOf = fn => { const b = new Builder(0); fn(b); const out = {}; for (const k of [...b.buckets.keys()]) out[k] = b.merged(k); return out; };
const meshOf = (geos, mats, shadow = true) => { const g = new THREE.Group(); for (const k in geos) { const m = new THREE.Mesh(geos[k], mats[k] || mats.v); m.castShadow = shadow; m.receiveShadow = true; g.add(m); } return g; };

// pose de um zombie: as mesmas matrizes servem para o desenhar e para as hitboxes (o que vês é o que acertas)
// coxa e canela, braço e antebraço, cabeça à parte: anda a coxear, curvado, com os joelhos sempre um pouco dobrados
const _pe = new THREE.Euler(), _pq = new THREE.Quaternion(), _pv = new THREE.Vector3(), _ps = new THREE.Vector3();
export const THIGH = 0.44, UPPER = 0.3, NECK = 0.74;
export const newPose = () => { const o = {}; for (const k of ['r', 'torso', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR']) o[k] = new THREE.Matrix4(); return o; };
export function zombiePose(z, M) {
  const dead = z.state === 'dead', fall = dead ? Math.min(1, z.deadT / 0.45) : 0;
  _pe.set(-fall * Math.PI / 2, z.yaw, 0, 'YXZ'); _pq.setFromEuler(_pe); _pv.set(z.x, (z.y || 0) + fall * 0.16 - (z.sink || 0), z.z); _ps.setScalar(z.sc || 1); M.r.compose(_pv, _pq, _ps);
  const ph = z.phase || 0, mv0 = z.mv || 0, amp = dead ? 0 : Math.min(1, mv0 * 5) * (0.55 + 0.45 * Math.min(1, mv0)), s = Math.sin(ph), c = Math.cos(ph), wk = dead ? 0 : (z.wallK || 0), chase = z.state === 'chase' ? 1 : 0;
  const limp = ((z.id ?? z.i ?? 0) % 3) === 0 ? 1 : 0, lean = dead ? 0 : (0.3 + 0.12 * chase) * (1 - 0.65 * wk), bob = Math.abs(c) * 0.045 * amp + (limp ? Math.max(0, s) * 0.03 * amp : 0);
  M.torso.copy(M.r).multiply(mat4(0, HIP - 0.05 * (1 - fall) + bob, 0, Math.sin(ph * 0.5) * 0.12, lean, Math.sin(ph * 0.5 + 1) * 0.08 + (limp ? 0.06 : 0)));
  M.head.copy(M.torso).multiply(mat4(0, NECK, 0.02, Math.sin(ph * 0.37 + 2) * 0.25 * (1 - chase * 0.6), dead ? 0 : -0.25 + Math.sin(ph) * 0.06, 0.28 * Math.sin((z.id ?? 0) * 1.7) + (limp ? 0.15 : 0)));
  const reach = (z.state === 'wander' ? -0.55 : -1.3) * (1 - wk) - 0.25 * wk, atk = z.atkT > 0 ? Math.sin(z.atkT * 8) * 0.5 : 0;
  M.armL.copy(M.torso).multiply(mat4(-SHX, SHY - HIP, 0.02, 0, dead ? 0 : reach + s * 0.14 - atk, dead ? 0.5 : 0.16));
  M.armR.copy(M.torso).multiply(mat4(SHX, SHY - HIP, 0.02, 0, dead ? 0 : reach - s * 0.14 - atk * 0.7 + (limp ? 0.5 : 0), dead ? -0.5 : -0.16));
  M.foreL.copy(M.armL).multiply(mat4(0, -UPPER, 0, 0, dead ? 0 : -0.25 - 0.15 * chase + s * 0.08, 0));
  M.foreR.copy(M.armR).multiply(mat4(0, -UPPER, 0, 0, dead ? 0 : -0.3 - 0.15 * chase - s * 0.08, 0));
  // pernas: a coxa balança, o joelho dobra quando a perna passa para a frente; a coxa manca arrasta-se mais tesa
  const hL = -s * 0.5 * amp, hR = s * 0.5 * amp * (limp ? 0.55 : 1), kL = 0.22 + amp * 0.75 * Math.max(0, Math.sin(ph + 0.9)), kR = 0.22 + amp * (limp ? 0.25 : 0.75) * Math.max(0, Math.sin(ph + Math.PI + 0.9));
  M.legL.copy(M.r).multiply(mat4(-0.11, HIP - 0.05 * (1 - fall) + bob, 0, 0, dead ? 0 : hL - 0.12, 0.03));
  M.legR.copy(M.r).multiply(mat4(0.11, HIP - 0.05 * (1 - fall) + bob, 0, limp ? 0.2 : 0, dead ? 0 : hR - 0.12, -0.03));
  M.shinL.copy(M.legL).multiply(mat4(0, -THIGH, 0, 0, dead ? 0 : kL, 0));
  M.shinR.copy(M.legR).multiply(mat4(0, -THIGH, 0, 0, dead ? 0 : kR, 0));
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
// peças do corpo, cada uma no seu eixo (anca, joelho, ombro, cotovelo, pescoço): roupa com costuras, bolsos, cinto, botas com sola e atacadores, mãos com polegar, cara com olhos, nariz, orelhas e sobrancelhas
export function partGeos(c) {
  const T = c.top, Lg = c.legs, Sk = c.skin, Sl = c.sleeve ?? T, Bt = c.shoes ?? 0x23211f, dark = shade(T, 0.72), seam = shade(Lg, 0.75);
  const thigh = side => geoOf(b => { b.sph(0.1, 0, -0.02, 0, Lg, { ws: 12, hs: 8 }); b.cyl(0.1, 0.084, THIGH - 0.02, 12, 0, -(THIGH - 0.02) / 2 - 0.02, 0, Lg); b.sph(0.083, 0, -THIGH, 0, Lg, { ws: 12, hs: 8 });
    b.rbox(0.025, 0.14, 0.12, 0.012, side * 0.095, -0.2, 0.0, seam); b.box(0.028, 0.03, 0.125, side * 0.1, -0.13, 0.0, shade(Lg, 0.6)); // bolso lateral com aba
    if (c.blood) b.box(0.12, 0.1, 0.02, 0.02, -0.2, 0.09, c.blood); });
  const shin = geoOf(b => { b.cyl(0.082, 0.068, 0.32, 12, 0, -0.16, 0, Lg); b.cyl(0.074, 0.074, 0.03, 12, 0, -0.31, 0, seam);
    b.cyl(0.07, 0.074, 0.12, 12, 0, -0.37, 0, Bt); b.rbox(0.118, 0.085, 0.27, 0.03, 0, -0.435, 0.055, Bt); b.rbox(0.124, 0.026, 0.285, 0.01, 0, -0.467, 0.058, shade(Bt, 0.55));
    for (let i = 0; i < 3; i++) b.box(0.07, 0.008, 0.012, 0, -0.39 + i * 0.012, 0.115 + i * 0.03, shade(Bt, 1.6));
    if (c.zombie) b.box(0.09, 0.08, 0.02, 0.01, -0.12, 0.08, Sk); });
  const upper = geoOf(b => { b.sph(0.077, 0, -0.01, 0, T, { ws: 14, hs: 10 }); b.cyl(0.068, 0.06, UPPER - 0.02, 12, 0, -(UPPER - 0.02) / 2, 0, Sl); b.sph(0.06, 0, -UPPER, 0, Sl, { ws: 10, hs: 8 }); b.box(0.004, 0.16, 0.02, 0.066, -0.12, 0, shade(Sl, 0.8)); });
  const fore = geoOf(b => { const sl = c.zombie ? 0.12 : 0.21; b.cyl(0.058, 0.052, sl, 12, 0, -sl / 2, 0, Sl);
    if (!c.zombie) b.cyl(0.056, 0.056, 0.03, 12, 0, -0.215, 0, shade(Sl, 0.78));
    b.cyl(0.05, 0.043, 0.28 - sl, 10, 0, -sl - (0.28 - sl) / 2, 0, Sk);
    const H = c.hand ?? Sk; b.rbox(0.085, 0.1, 0.042, 0.016, 0, -0.33, 0, H); b.rbox(0.08, 0.06, 0.036, 0.014, 0, -0.395, 0.012, H, { rx: 0.35 }); b.cap(0.016, 0.04, -0.045, -0.315, 0.022, H, { rz: 0.5 });
    if (c.blood) b.box(0.05, 0.08, 0.02, 0, -0.1, 0.05, c.blood); });
  const torso = geoOf(b => {
    b.rbox(0.38, 0.2, 0.23, 0.06, 0, 0.06, 0, Lg); for (const s of [-1, 1]) b.box(0.005, 0.15, 0.02, s * 0.12, 0.04, 0.11, seam); // costuras das calças
    b.box(0.392, 0.048, 0.24, 0, 0.15, 0, 0x2a2623); b.box(0.055, 0.04, 0.012, 0, 0.15, 0.123, 0x8a8478, { mat: 'm' }); // cinto e fivela
    b.rbox(0.39, 0.2, 0.225, 0.07, 0, 0.27, 0, T); b.rbox(0.46, 0.3, 0.255, 0.1, 0, 0.5, 0, T); b.box(0.4, 0.022, 0.235, 0, 0.185, 0, dark);
    b.box(0.012, 0.42, 0.006, 0, 0.42, 0.129, dark); for (let i = 0; i < 4; i++) b.cyl(0.008, 0.008, 0.004, 8, 0.014, 0.28 + i * 0.1, 0.132, shade(T, 1.25), { rx: Math.PI / 2 }); // carcela e botões
    for (const s of [-1, 1]) { b.box(0.1, 0.11, 0.012, s * 0.11, 0.52, 0.131, shade(T, 0.9)); b.box(0.106, 0.032, 0.016, s * 0.11, 0.578, 0.133, dark); } // bolsos do peito
    b.add(new THREE.TorusGeometry(0.068, 0.012, 6, 16), dark, 'v', mat4(0, 0.675, 0.0, 0, Math.PI / 2, 0, 1, 1, 0.6)); // gola
    b.cyl(0.058, 0.066, 0.12, 10, 0, 0.73, 0, Sk);
    if (c.blood) { b.box(0.2, 0.18, 0.02, 0.08, 0.48, 0.135, c.blood); b.box(0.12, 0.1, 0.02, -0.12, 0.3, 0.13, c.blood); }
    if (c.torn) { b.box(0.3, 0.08, 0.235, 0, 0.21, 0, shade(T, 0.6)); b.box(0.12, 0.14, 0.01, -0.1, 0.36, 0.125, Sk); }
  });
  const head = geoOf(b => {
    b.sph(0.135, 0, 0.145, 0.01, Sk, { sy: 1.1, ws: 20, hs: 14 }); b.rbox(0.17, 0.085, 0.15, 0.045, 0, 0.06, 0.035, Sk); // crânio e maxilar
    for (const s of [-1, 1]) { b.sph(0.03, s * 0.135, 0.14, -0.005, shade(Sk, 0.92), { sx: 0.5, sy: 1.25 }); // orelhas
      b.sph(0.022, s * 0.047, 0.155, 0.122, c.zombie ? 0xc8c09a : 0xece8e0, { sz: 0.55, ws: 10, hs: 8 }); b.sph(0.012, s * 0.047, 0.155, 0.133, c.eye ?? 0x3a2a1c, { sz: 0.5, ws: 8, hs: 6 }); // olhos
      b.box(0.05, 0.012, 0.02, s * 0.05, 0.19, 0.128, c.zombie ? shade(Sk, 0.7) : c.hair, { rz: s * -0.12 }); } // sobrancelhas
    b.rbox(0.032, 0.055, 0.04, 0.012, 0, 0.12, 0.142, shade(Sk, 0.93)); b.box(0.052, 0.009, 0.01, 0, 0.078, 0.147, c.zombie ? 0x3a1a14 : 0x7a4a40); // nariz e boca
    if (c.zombie) { b.box(0.06, 0.05, 0.01, 0.04, 0.2, 0.124, c.blood ?? 0x5a0e0b); return; }
    // cabelo: 0 curto, 1 rapado, 2 comprido, 3 rabo-de-cavalo, 4 moicano
    const hs = c.hairS ?? 0, stub = mixC(c.hair, Sk, 0.55);
    if (hs === 1 || hs === 4) b.sph(0.141, 0, 0.158, -0.004, stub, { th: Math.PI * 0.5, ws: 20, hs: 9, sy: 1.08 }); else { b.sph(0.147, 0, 0.16, -0.006, c.hair, { th: Math.PI * 0.53, ws: 20, hs: 9, sy: 1.08 }); b.rbox(0.25, 0.1, 0.05, 0.02, 0, 0.12, -0.11, c.hair); }
    if (hs === 2) { b.rbox(0.27, 0.27, 0.09, 0.04, 0, 0.06, -0.11, c.hair); for (const s of [-1, 1]) b.rbox(0.05, 0.2, 0.15, 0.02, s * 0.135, 0.1, -0.03, c.hair); }
    if (hs === 3) { b.sph(0.05, 0, 0.16, -0.155, c.hair); b.cap(0.035, 0.14, 0, 0.04, -0.175, c.hair); }
    if (hs === 4) b.rbox(0.055, 0.075, 0.27, 0.025, 0, 0.305, -0.015, c.hair);
    if (c.beard && (c.beardS ?? 1) === 1) { const bc = mixC(c.beard, Sk, 0.3); b.rbox(0.178, 0.07, 0.158, 0.05, 0, 0.052, 0.037, bc); for (const s of [-1, 1]) b.rbox(0.03, 0.08, 0.1, 0.012, s * 0.085, 0.1, 0.03, bc); b.box(0.07, 0.018, 0.02, 0, 0.09, 0.15, bc); } // barba rente ao maxilar
    if (c.beard && c.beardS === 2) b.box(0.1, 0.022, 0.025, 0, 0.097, 0.148, c.beard);
  });
  return { thighL: thigh(-1), thighR: thigh(1), shin, upper, fore, torso, head };
}

// cores e camuflados do equipamento: repinta só os triângulos da cor base (e tons dela), o resto (fivelas, bolsos escuros) fica
const CAMO = { camo: [0x4b5a32, 0x6e6b3e, 0x3b3326, 0x25271d], urb: [0x8e9092, 0x5f6265, 0xb7b8b4, 0x3c3e41] };
const _tb = new THREE.Color(), _tc = new THREE.Color();
export function retint(geos, base, tint) {
  _tb.set(base); const pal = CAMO[tint];
  for (const k in geos) { const g = geos[k], col = g.attributes.color, pos = g.attributes.position;
    for (let i = 0; i + 2 < col.count; i += 3) {
      const sr = col.getX(i) / _tb.r, sg = col.getY(i) / _tb.g, sb = col.getZ(i) / _tb.b, s = (sr + sg + sb) / 3;
      if (!(s > 0.35 && s < 1.4) || Math.max(sr, sg, sb) - Math.min(sr, sg, sb) > 0.15) continue;
      if (pal) { let x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
        if (tint === 'urb') { x = Math.round(x / 0.045) * 0.045; y = Math.round(y / 0.045) * 0.045; z = Math.round(z / 0.045) * 0.045; }
        const v = Math.sin(x * 21 + Math.sin(z * 17) * 1.8) + Math.sin(y * 19 + z * 13) + Math.sin(x * 11 - y * 23 + 1.3);
        _tc.setHex(pal[Math.max(0, Math.min(3, Math.floor((v + 2.4) / 4.8 * 4)))]); }
      else _tc.setHex(tint);
      for (let j = 0; j < 3; j++) col.setXYZ(i + j, _tc.r * s, _tc.g * s, _tc.b * s);
    }
    col.needsUpdate = true; }
  return geos;
}
// fato ghillie: tufos de folhas e fios por cima do corpo, braços e pernas (sementes fixas: igual em todos)
const GHC = [0x4a5a2c, 0x5f6a34, 0x3c4a26, 0x6b6440, 0x2f3a1f, 0x54502e];
const ghillie = (fn, seed) => geoOf(b => { let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; fn(b, r, () => GHC[Math.floor(r() * GHC.length)]); });
export function gearGeos() {
  const OLV = 0x5f6844, TAN = 0x8a7a55; let gearHead, gearVest;
  const G = {
    head: geoOf(gearHead = b => { b.sph(0.185, 0, 0.92, 0.0, OLV, { th: Math.PI * 0.55, ws: 14, hs: 8 }); b.rbox(0.08, 0.06, 0.05, 0.015, 0, 1.04, 0.16, 0x2a2b2c); for (const s of [-1, 1]) b.rbox(0.03, 0.09, 0.12, 0.01, s * 0.175, 0.86, 0.02, shade(OLV, 0.8)); }),
    vest: geoOf(gearVest = b => { b.rbox(0.54, 0.44, 0.36, 0.06, 0, 0.44, 0, TAN); for (const x of [-0.15, 0, 0.15]) b.rbox(0.12, 0.15, 0.07, 0.02, x, 0.33, 0.19, shade(TAN, 0.8)); b.rbox(0.07, 0.15, 0.05, 0.015, 0.2, 0.56, 0.19, 0x2a2b2c); }),
    back: geoOf(b => { b.rbox(0.42, 0.52, 0.26, 0.08, 0, 0.44, -0.27, 0x7a5f3c); b.rbox(0.3, 0.2, 0.09, 0.03, 0, 0.32, -0.43, 0x634c30); b.cyl(0.1, 0.1, 0.5, 10, 0, 0.76, -0.27, 0x8a4b36, { rz: Math.PI / 2 }); for (const s of [-0.13, 0.13]) b.box(0.05, 0.46, 0.02, s, 0.46, 0.15, 0x4e3c24); }),
    // óculos de visão noturna: suporte na testa e dois tubos para a frente
    eyes: geoOf(b => { b.rbox(0.12, 0.05, 0.05, 0.012, 0, 1.0, 0.17, 0x1e2022); for (const s of [-1, 1]) { b.cyl(0.024, 0.026, 0.08, 10, s * 0.034, 0.97, 0.22, 0x26292c, { rx: Math.PI / 2 }); b.cyl(0.02, 0.02, 0.006, 10, s * 0.034, 0.97, 0.262, 0x3c6a46, { rx: Math.PI / 2 }); } b.box(0.36, 0.025, 0.025, 0, 0.98, 0.0, 0x1a1b1c, { rx: 0 }); }),
    suit: ghillie((b, r, c) => {
      for (let i = 0; i < 70; i++) { const a = r() * Math.PI * 2, y = -0.02 + r() * 0.76, rx = 0.25 + 0.04 * Math.sin(y * 5), rz = 0.17; b.ico(0.055 + r() * 0.05, Math.sin(a) * rx, y, Math.cos(a) * rz, c(), { rx: r() * 3, ry: r() * 3 }); }
      for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2, t = r() * Math.PI * 0.55; b.ico(0.05 + r() * 0.035, Math.sin(a) * Math.sin(t) * 0.2, 0.93 + Math.cos(t) * 0.18, Math.cos(a) * Math.sin(t) * 0.2 - 0.02, c(), { rx: r() * 3 }); }
      for (let i = 0; i < 30; i++) { const a = r() * Math.PI * 2, y = -0.02 + r() * 0.9; b.box(0.022, 0.16 + r() * 0.12, 0.012, Math.sin(a) * 0.27, y, Math.cos(a) * 0.19, c(), { ry: a, rx: (r() - 0.5) * 0.6, rz: (r() - 0.5) * 0.6 }); }
    }, 7),
    suitU: ghillie((b, r, c) => { for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2, y = -r() * 0.28; b.ico(0.045 + r() * 0.03, Math.sin(a) * 0.075, y, Math.cos(a) * 0.075, c(), { rx: r() * 3 }); } }, 11),
    suitF: ghillie((b, r, c) => { for (let i = 0; i < 7; i++) { const a = r() * Math.PI * 2, y = -r() * 0.24; b.ico(0.04 + r() * 0.03, Math.sin(a) * 0.065, y, Math.cos(a) * 0.065, c(), { rx: r() * 3 }); } }, 12),
    suitT: ghillie((b, r, c) => { for (let i = 0; i < 11; i++) { const a = r() * Math.PI * 2, y = -r() * THIGH; b.ico(0.05 + r() * 0.035, Math.sin(a) * 0.1, y, Math.cos(a) * 0.1, c(), { rx: r() * 3 }); } }, 13),
    suitS: ghillie((b, r, c) => { for (let i = 0; i < 8; i++) { const a = r() * Math.PI * 2, y = -r() * 0.32; b.ico(0.045 + r() * 0.03, Math.sin(a) * 0.085, y, Math.cos(a) * 0.085, c(), { rx: r() * 3 }); } }, 14),
  };
  // capacete e colete de outras cores (as chaves são as dos itens: capacetep, coletec…)
  for (const t in TINTS) { G['head_' + t] = retint(geoOf(gearHead), OLV, TINTS[t][1]); G['vest_' + t] = retint(geoOf(gearVest), TAN, TINTS[t][1]); }
  // equipamento novo (Blender, já nas coordenadas da cabeça ou do tronco do corpo novo)
  const _gc = {}, real = k => geoOf(b => { for (const T of dataTpl(GEARDATA, k, _gc)) b.add(T.g, T.c, T.m); });
  if (GEARDATA.capacete) { G.head = real('capacete'); for (const t in TINTS) G['head_' + t] = retint(real('capacete'), OLV, TINTS[t][1]); }
  if (GEARDATA.colete) { G.vest = real('colete'); for (const t in TINTS) G['vest_' + t] = retint(real('colete'), TAN, TINTS[t][1]); }
  if (GEARDATA.mochila) G.back = real('mochila'); if (GEARDATA.mochilaC) G.back_C = real('mochilaC'); if (GEARDATA.nvg) G.eyes = real('nvg');
  if (GEARDATA.ghillie_torso) { G.suit = real('ghillie_torso'); for (const s of ['head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR']) G['gh_' + s] = real('ghillie_' + s); }
  G.real = !!GEARDATA.capacete;
  return G;
}
// que peças mostrar para o equipamento que tens (aceita só chaves: { head: { k: 'capacetec' } })
export const gearKeys = eq => { const out = new Set(); for (const s in eq) { const it = eq[s]; if (!it) continue; const d = ITEMS[it.k]; out.add(s + (d && d.tk ? '_' + d.tk : '')); } return out; };

// armas: rifle no espaço do tronco (cano em +z); as outras na mão direita (ao longo de -y do braço)
// onde fica a mira de ponto vermelho em cada arma (altura e distância no espaço da arma); a vista na 1.ª pessoa usa o mesmo sítio
export const RDP = { m4: [0.085, 0.12], ak: [0.085, 0.1], smg: [0.07, 0.06], caca: [0.075, 0.12], m249: [0.085, 0.06], pkm: [0.085, 0.06] };
export const WPUSH = [0.07, SHY - HIP - 0.12, 0.16];
for (const k of LONG) { const A = GUNA(k); if (!A) continue; if (RDP[k]) RDP[k] = [A.rail[0] + 0.026, A.rail[1] + 0.02]; } // ponto vermelho em cima da calha das armas novas
// armas brancas e ferramentas novas (Blender): no lugar das antigas, com o mesmo encaixe na mão
const MELEEK = ['pedra', 'machado', 'picareta', 'lanca', 'faca', 'bastao', 'pecabra', 'machete', 'katana'];
export function weaponGeos() { const o = weaponGeos0(); for (const k of MELEEK) if (GUNA(k)) o[k] = geoOf(b => { b.push(0, -0.56, 0, 0, Math.PI / 2, 0); GUNS[k](b); b.pop(); });
  for (const pk in GUNP) o[pk] = geoOf(b => { b.push(...partPush(pk)); GUNP[pk](b); b.pop(); }); return o; }
// peças soltas (mag_, bolt_, pump_): o mesmo empurrão da arma e o ponto de encaixe nesse espaço
const partPush = pk => { const k = pk.slice(pk.indexOf('_') + 1); return LONG.includes(k) ? [0.07, SHY - HIP - 0.12, 0.16] : [0, -0.56, 0, 0, Math.PI / 2, 0]; };
export const partPivot = pk => { const k = pk.slice(pk.indexOf('_') + 1), t = pk.slice(0, pk.indexOf('_')), A = GUNA(k); if (!A || !A[t + 'c']) return null; const c = A[t + 'c']; return new THREE.Vector3(c[0], c[1], c[2]).applyMatrix4(mat4(...partPush(pk))); };
function weaponGeos0() {
  const BLK = 0x1c1e21, WOOD = 0x7a5232, ST = 0x8f8d86;
  const inHand = fn => geoOf(b => { b.push(0, -0.56, 0, 0, Math.PI / 2, 0); fn(b); b.pop(); });
  return {
    m4: geoOf(b => { b.push(0.07, SHY - HIP - 0.12, 0.16); GUNS.m4(b); b.pop(); }),
    pistola: inHand(b => GUNS.pistola(b)),
    pedra: inHand(b => { b.ico(0.07, 0, 0.02, 0.03, ST, { mat: 'vf', sx: 1.1, sy: 0.9, sz: 1.2 }); }),
    machado: inHand(b => { b.cyl(0.018, 0.02, 0.5, 8, 0, 0, 0.16, WOOD, { rx: Math.PI / 2 }); b.ico(0.06, 0, 0.07, 0.38, ST, { mat: 'vf', sx: 0.55, sy: 1.5, sz: 0.7 }); }),
    picareta: inHand(b => { b.cyl(0.018, 0.02, 0.55, 8, 0, 0, 0.18, WOOD, { rx: Math.PI / 2 }); b.cyl(0.022, 0.012, 0.34, 6, 0, 0, 0.42, ST, { mat: 'vf' }); }),
    lanca: inHand(b => { b.cyl(0.016, 0.018, 1.5, 8, 0, 0, 0.35, 0x8a6a42, { rx: Math.PI / 2 }); b.add(new THREE.ConeGeometry(0.03, 0.18, 6), 0x5a4030, 'vf', mat4(0, 0, 1.18, 0, Math.PI / 2)); }),
    revolver: inHand(b => GUNS.revolver(b)),
    faca: inHand(b => { b.box(0.022, 0.03, 0.12, 0, 0, 0.0, 0x2a2a2a); b.box(0.006, 0.035, 0.2, 0, 0, 0.16, 0xd6dade, { mat: 'm' }); }),
    bastao: inHand(b => { b.cyl(0.02, 0.038, 0.8, 10, 0, 0, 0.32, 0xc9a877, { rx: Math.PI / 2 }); }),
    pecabra: inHand(b => { b.cyl(0.013, 0.013, 0.55, 6, 0, 0, 0.2, 0xb8322a, { rx: Math.PI / 2, mat: 'm' }); b.box(0.02, 0.07, 0.03, 0, 0.03, 0.47, 0xb8322a, { mat: 'm' }); }),
    machete: inHand(b => { b.box(0.024, 0.035, 0.13, 0, 0, 0.0, 0x2a2a2a); b.box(0.006, 0.06, 0.45, 0, 0.01, 0.28, 0xb8bcc0, { mat: 'm' }); }),
    smg: geoOf(b => { b.push(0.07, SHY - HIP - 0.12, 0.16); GUNS.smg(b); b.pop(); }),
    ak: geoOf(b => { b.push(0.07, SHY - HIP - 0.12, 0.16); GUNS.ak(b); b.pop(); }),
    cacadeira: geoOf(b => { b.push(0.07, SHY - HIP - 0.12, 0.16); GUNS.cacadeira(b); b.pop(); }),
    caca: geoOf(b => { b.push(0.07, SHY - HIP - 0.12, 0.16); GUNS.caca(b); b.pop(); }),
    // armas pesadas: duas de precisão (ferrolho .408 e semiautomática .50) e duas metralhadoras com caixa de fita
    cheytac: geoOf(b => { b.push(0.07, SHY - HIP - 0.12, 0.16); GUNS.cheytac(b); b.pop(); }),
    barrett: geoOf(b => { b.push(0.07, SHY - HIP - 0.12, 0.16); GUNS.barrett(b); b.pop(); }),
    m249: geoOf(b => { b.push(0.07, SHY - HIP - 0.12, 0.16); GUNS.m249(b); b.pop(); }),
    pkm: geoOf(b => { b.push(0.07, SHY - HIP - 0.12, 0.16); GUNS.pkm(b); b.pop(); }),
    // acessórios: silenciador na ponta do cano e mira por cima
    ...(() => { const o = {}; const BY = SHY - HIP - 0.12;
      const sup = (y, z, r, l) => geoOf(b => { b.push(0.07, BY, 0.16); b.cyl(r, r, l, 12, 0, y, z + l / 2, 0x2c2e30, { rx: Math.PI / 2, mat: 'm' }); for (let i = 1; i < 4; i++) b.cyl(r + 0.002, r + 0.002, 0.008, 12, 0, y, z + l * i / 4, 0x17181a, { rx: Math.PI / 2 }); b.pop(); });
      const sc = (y, z, big) => geoOf(b => { b.push(0.07, BY, 0.16); const r = big ? 0.03 : 0.024, l = big ? 0.32 : 0.24; b.cyl(r, r, l, 12, 0, y, z, BLK, { rx: Math.PI / 2, mat: 'm' }); b.cyl(r + 0.01, r, 0.05, 12, 0, y, z + l / 2, BLK, { rx: Math.PI / 2, mat: 'm' }); b.cyl(r * 0.85, r * 0.85, 0.004, 12, 0, y, z + l / 2 + 0.026, 0x6a9ac8, { rx: Math.PI / 2 }); for (const dz of [-0.06, 0.06]) b.box(0.02, 0.05, 0.03, 0, y - 0.04, z + dz, 0x2a2c2e, { mat: 'm' }); b.pop(); });
      o.sup_m4 = sup(0.005, 0.98, 0.026, 0.24); o.sup_ak = sup(0.01, 0.89, 0.026, 0.24); o.sup_caca = sup(0.03, 0.95, 0.024, 0.26); o.sup_smg = sup(0.01, 0.41, 0.024, 0.2);
      o.sup_pistola = inHand(b => { b.cyl(0.02, 0.02, 0.16, 12, 0, 0.03, 0.245, 0x2c2e30, { rx: Math.PI / 2, mat: 'm' }); });
      o.sc_m4 = sc(0.1, 0.14); o.sc_ak = sc(0.1, 0.12); o.sc_caca = sc(0.1, 0.14); o.sc8_caca = sc(0.11, 0.14, true);
      o.sup_cheytac = sup(0.01, 1.14, 0.032, 0.26); o.sc_cheytac = sc(0.1, 0.12); o.sc8_cheytac = sc(0.11, 0.12, true); o.sc_barrett = sc(0.12, 0.1); o.sc8_barrett = sc(0.13, 0.1, true);
      o.sc_m249 = sc(0.1, 0.08); o.sc_pkm = sc(0.1, 0.08);
      // ponto vermelho (caixa baixa com vidro) e lanterna por baixo do cano
      const rd = (y, z) => geoOf(b => { b.push(0.07, BY, 0.16); b.box(0.045, 0.012, 0.07, 0, y - 0.02, z, 0x2a2c2e, { mat: 'm' }); b.box(0.006, 0.05, 0.06, -0.022, y + 0.01, z, BLK, { mat: 'm' }); b.box(0.006, 0.05, 0.06, 0.022, y + 0.01, z, BLK, { mat: 'm' }); b.box(0.05, 0.008, 0.06, 0, y + 0.038, z, BLK, { mat: 'm' }); b.box(0.038, 0.04, 0.004, 0, y + 0.012, z + 0.028, 0x8ab8d8); b.pop(); });
      for (const k in RDP) o['rd_' + k] = rd(...RDP[k]);
      const lt = (y, z) => geoOf(b => { b.push(0.07, BY, 0.16); b.cyl(0.016, 0.016, 0.09, 10, 0, y, z, BLK, { rx: Math.PI / 2, mat: 'm' }); b.cyl(0.019, 0.016, 0.02, 10, 0, y, z + 0.05, BLK, { rx: Math.PI / 2, mat: 'm' }); b.cyl(0.015, 0.015, 0.003, 10, 0, y, z + 0.062, 0xfff4d8, { rx: Math.PI / 2, mat: 'lit' }); b.box(0.012, 0.02, 0.05, 0, y + 0.02, z, 0x2a2c2e); b.pop(); });
      o.lt_m4 = lt(-0.055, 0.6); o.lt_ak = lt(-0.05, 0.6); o.lt_smg = lt(-0.055, 0.28); o.lt_caca = lt(-0.035, 0.62); o.lt_cacadeira = lt(-0.05, 0.62); o.lt_m249 = lt(-0.06, 0.4); o.lt_pkm = lt(-0.06, 0.42);
      // armas novas (tamanho real): acessórios também em tamanho real, postos nos pontos de encaixe exportados do Blender
      const supR = A => geoOf(b => { b.push(0.07, BY, 0.16); const y = A.muzzle[0], z = A.muzzle[1] - 0.014, r = A.supR || 0.0195, l = A.supL || 0.17, Z = z + l / 2;
        b.cyl(r, r, l, 20, 0, y, Z, 0x2c2e30, { rx: Math.PI / 2, mat: 'm' }); b.cyl(r + 0.0015, r + 0.0015, 0.026, 20, 0, y, z + 0.013, 0x1d1f21, { rx: Math.PI / 2, mat: 'm' }); b.cyl(r - 0.002, r, 0.01, 20, 0, y, z + l + 0.004, 0x1d1f21, { rx: Math.PI / 2, mat: 'm' });
        for (let i = 0; i < 6; i++) b.cyl(r + 0.0006, r + 0.0006, 0.004, 20, 0, y, z + 0.05 + i * 0.016, 0x202224, { rx: Math.PI / 2, mat: 'm' });
        b.cyl(0.0055, 0.0055, 0.002, 12, 0, y, z + l + 0.0095, 0x0a0a0b, { rx: Math.PI / 2 }); b.pop(); });
      const scR = (A, big) => geoOf(b => { b.push(0.07, BY, 0.16); const ry = A.rail[0], z = A.rail[1] + (A.scz || 0), h = big ? 0.04 : 0.033, y = ry + h, tr = big ? 0.015 : 0.0127, ob = big ? 0.028 : 0.021, L = big ? 0.34 : 0.27, C = 0x1b1c1e;
        b.cyl(tr, tr, L * 0.55, 18, 0, y, z, C, { rx: Math.PI / 2, mat: 'm' }); // tubo
        b.cyl(ob, tr, 0.05, 20, 0, y, z + L * 0.275 + 0.025, C, { rx: Math.PI / 2, mat: 'm' }); b.cyl(ob, ob, 0.05, 20, 0, y, z + L * 0.275 + 0.075, C, { rx: Math.PI / 2, mat: 'm' }); b.cyl(ob * 0.86, ob * 0.86, 0.002, 20, 0, y, z + L * 0.275 + 0.1, 0x3a5a7a, { rx: Math.PI / 2, mat: 'm' }); // objetiva
        b.cyl(tr + 0.002, 0.019, 0.03, 18, 0, y, z - L * 0.275 - 0.015, C, { rx: Math.PI / 2, mat: 'm' }); b.cyl(0.019, 0.019, 0.05, 18, 0, y, z - L * 0.275 - 0.055, C, { rx: Math.PI / 2, mat: 'm' }); for (let i = 0; i < 6; i++) b.box(0.002, 0.003, 0.04, Math.sin(i * 1.05) * 0.019, y + Math.cos(i * 1.05) * 0.019, z - L * 0.275 - 0.055, 0x0f1011, { rz: -i * 1.05 }); // ocular estriada
        b.cyl(0.011, 0.011, 0.018, 14, 0, y + tr + 0.009, z + 0.005, C, { mat: 'm' }); b.cyl(0.011, 0.011, 0.018, 14, tr + 0.009, y, z + 0.005, C, { rz: Math.PI / 2, mat: 'm' }); // torres de ajuste
        for (const dz of [-0.055, 0.06]) { b.cyl(tr + 0.004, tr + 0.004, 0.014, 18, 0, y, z + dz, 0x2a2c2e, { rx: Math.PI / 2, mat: 'm' }); b.box(0.016, h - tr, 0.014, 0, ry + (h - tr) / 2, z + dz, 0x2a2c2e, { mat: 'm' }); b.box(0.026, 0.008, 0.02, 0, ry + 0.004, z + dz, 0x2a2c2e, { mat: 'm' }); } // anéis e base na calha
        b.pop(); });
      const ltR = A => geoOf(b => { b.push(0.07, BY, 0.16); const y = A.light[0], z = A.light[1]; b.cyl(0.0125, 0.0125, 0.09, 16, 0, y - 0.004, z, BLK, { rx: Math.PI / 2, mat: 'm' }); b.cyl(0.016, 0.0125, 0.022, 16, 0, y - 0.004, z + 0.056, BLK, { rx: Math.PI / 2, mat: 'm' }); b.cyl(0.0145, 0.0145, 0.002, 16, 0, y - 0.004, z + 0.067, 0xfff4d8, { rx: Math.PI / 2, mat: 'lit' }); b.box(0.014, 0.012, 0.04, 0, y + 0.006, z, 0x2a2c2e, { mat: 'm' }); b.pop(); });
      for (const k of Object.keys(o)) { const m = k.match(/^(sup|sc8|sc|lt)_(.+)$/); if (!m) continue; const A = GUNA(m[2]); if (!A || m[2] === 'pistola') continue; o[k] = m[1] === 'sup' ? supR(A) : m[1] === 'lt' ? ltR(A) : scR(A, m[1] === 'sc8'); }
      o.lt_pistola = inHand(b => { b.cyl(0.014, 0.014, 0.07, 10, 0, -0.035, 0.1, BLK, { rx: Math.PI / 2, mat: 'm' }); b.cyl(0.012, 0.012, 0.003, 10, 0, -0.035, 0.137, 0xfff4d8, { rx: Math.PI / 2, mat: 'lit' }); });
      return o; })(),
    katana: inHand(b => { b.cyl(0.02, 0.022, 0.25, 8, 0, 0, -0.02, 0x2a2230, { rx: Math.PI / 2 }); b.cyl(0.045, 0.045, 0.012, 14, 0, 0, 0.11, 0x3a3328, { rx: Math.PI / 2, mat: 'm' }); b.box(0.01, 0.045, 0.76, 0, 0, 0.5, 0xd6dade, { mat: 'm' }); }),
  };
}

// IK de dois ossos (ombro-cotovelo-mão): põe a mão num ponto do espaço do tronco; o cotovelo aponta para "pole"
const _ik = { d: new THREE.Vector3(), n: new THREE.Vector3(), u: new THREE.Vector3(), h: new THREE.Vector3(), z: new THREE.Vector3(), m: new THREE.Matrix4(), y: new THREE.Vector3() };
function ik2(upper, fore, sh, target, pole, a = UPPER, b2 = 0.31) {
  const { d, n, u, h, z, m, y } = _ik; d.subVectors(target, sh); let c = d.length(); c = Math.min(Math.max(c, 0.08), a + b2 - 0.002); d.normalize();
  n.copy(pole).addScaledVector(d, -pole.dot(d)); if (n.lengthSq() < 1e-6) n.set(0, -1, 0).addScaledVector(d, d.y); n.normalize();
  const al = Math.acos(Math.min(1, Math.max(-1, (a * a + c * c - b2 * b2) / (2 * a * c)))), be = Math.acos(Math.min(1, Math.max(-1, (a * a + b2 * b2 - c * c) / (2 * a * b2))));
  u.copy(d).multiplyScalar(Math.cos(al)).addScaledVector(n, Math.sin(al)).normalize(); // direção do braço
  h.crossVectors(d, n).normalize(); // eixo da dobra do cotovelo (perpendicular ao plano braço-alvo)
  y.copy(u).negate(); z.crossVectors(h, y).normalize(); m.makeBasis(h, y, z); upper.quaternion.setFromRotationMatrix(m);
  fore.rotation.set(-(Math.PI - be), 0, 0);
}
const _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3(), _t4 = new THREE.Vector3();
const _t = new THREE.Vector3(), _sh = new THREE.Vector3(), _pl = new THREE.Vector3(), _rx = new THREE.Matrix4(), _hq = new THREE.Quaternion(), _hq2 = new THREE.Quaternion();
// onde pegam as mãos em cada arma comprida (no espaço da arma, antes do empurrão para o ombro): punho e guarda-mão
const GRIP = { m4: [[0, -0.1, -0.02], [0, -0.04, 0.36]], ak: [[0, -0.09, -0.06], [0, -0.035, 0.34]], smg: [[0, -0.07, 0.04], [0, -0.03, 0.26]], cacadeira: [[0, -0.06, 0.0], [0, -0.04, 0.36]], caca: [[0, -0.06, -0.12], [0, -0.03, 0.3]],
  cheytac: [[0, -0.1, -0.04], [0, -0.04, 0.38]], barrett: [[0, -0.11, -0.06], [0, -0.05, 0.36]], m249: [[0, -0.1, -0.04], [0, -0.06, 0.34]], pkm: [[0, -0.1, -0.04], [0, -0.06, 0.34]] };
for (const k of LONG) { const A = GUNA(k); if (A) GRIP[k] = [[0, A.grip[1] - 0.012, A.grip[2] + 0.01], [0, A.fore[1] - 0.034, A.fore[2]]]; } // armas novas: mão no punho e mão de apoio por baixo do guarda-mão


// ---------- corpo do jogador e dos comerciantes (Blender + MakeHuman): uma malha com pele por partes, presa aos mesmos
// pontos de rotação de sempre (anca, joelhos, ombros, cotovelos, pescoço). As cores escolhidas pintam-se no shader com
// uma máscara (camisa, calças, pele, cabelo); cabelo e barba são malhas presas à cabeça.
let PG = null;
function hairGeo(D) {
  const g = new THREE.BufferGeometry(), P = new Int16Array(zbuf(D.p)), pos = new Float32Array(P.length), C = new Uint8Array(zbuf(D.c)), col = new Float32Array(C.length * 3);
  for (let i = 0; i < P.length; i++) pos[i] = P[i] / 32767 * 0.5;
  for (let i = 0; i < C.length; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = C[i] / 255 * 1.2;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(zbuf(D.nm)), 3, true)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(zbuf(D.i)), 1)); g.computeBoundingSphere(); return g;
}
const pgeo = () => PG || (PG = { l0: bodyGeo(PBODY.lod0), l1: bodyGeo(PBODY.lod1), hair: Object.fromEntries(Object.entries(PBODY.hair).map(([k, D]) => [k, hairGeo(D)])) });
const PREF = { top: 0x9a9a96, legs: 0x8e8e8a, skin: 0xd9a882, hair: 0x6a5a4c }; // tons em que a textura foi pintada
export const PTEX = { map: null, nmap: null, mask: null, mats: new Set(), started: false, base: 'tex/',
  load() { if (this.started) return; this.started = true; const TL = new THREE.TextureLoader(), done = () => { if (this.map && this.nmap && this.mask) for (const m of this.mats) PTEX.apply(m); };
    TL.load(this.base + 'player.jpg', t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; this.map = t; done(); }, undefined, () => { });
    TL.load(this.base + 'player_n.jpg', t => { t.anisotropy = 4; this.nmap = t; done(); }, undefined, () => { });
    TL.load(this.base + 'player_m.png', t => { t.colorSpace = THREE.NoColorSpace; this.mask = t; done(); }, undefined, () => { }); },
  apply(m) { if (!this.map || !this.nmap || !this.mask) return; m.map = this.map; m.normalMap = this.nmap; m.userData.uni.maskMap.value = this.mask; m.userData.uni.uHasMask.value = 1; m.color.set(0xffffff); m.needsUpdate = true; } };
const _cr = new THREE.Color(), _cc = new THREE.Color();
const ratio = (hex, ref, out) => { _cc.setHex(hex); _cr.setHex(ref); return out.set(_cc.r / Math.max(_cr.r, 1e-4), _cc.g / Math.max(_cr.g, 1e-4), _cc.b / Math.max(_cr.b, 1e-4)); };
const maskFrag = sh => {
  for (const k of ['maskMap', 'uTop', 'uLegs', 'uSkin', 'uHair', 'uHasMask']) sh.uniforms[k] = sh.__uni[k];
  sh.fragmentShader = 'uniform sampler2D maskMap;\nuniform vec3 uTop, uLegs, uSkin, uHair;\nuniform float uHasMask;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
  { vec4 mk = texture2D(maskMap, vMapUv); float hr = clamp(mk.a * 2.0 - 1.0, 0.0, 1.0);
    vec3 f = vec3(1.0) + mk.r * (uTop - 1.0) + mk.g * (uLegs - 1.0) + mk.b * (uSkin - 1.0) + hr * (uHair - 1.0);
    diffuseColor.rgb *= mix(vec3(1.0), f, uHasMask); }
#endif`);
};
const SEGN = ['torso', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR'];
// braços da 1.ª pessoa: os braços e as mãos do próprio corpo (a mesma malha, textura e cores), postos por IK em cada frame.
// place(lado, ombro, alvo da mão, para onde vai o cotovelo, para onde vira a palma): tudo no espaço de quem chama.
const _fa = { a1: new THREE.Vector3(), a2: new THREE.Vector3(), a3: new THREE.Vector3(), b1: new THREE.Vector3(), b2: new THREE.Vector3(), b3: new THREE.Vector3(), d: new THREE.Vector3(), n: new THREE.Vector3(), E: new THREE.Vector3(), w: new THREE.Vector3(), A: new THREE.Matrix4(), B: new THREE.Matrix4(), M: new THREE.Matrix4(), T: new THREE.Matrix4() };
const mapBasis = (a1, a2, b1, b2, out) => { const F = _fa; F.a2.copy(a2).addScaledVector(a1, -a2.dot(a1)).normalize(); F.a3.crossVectors(a1, F.a2); F.b2.copy(b2).addScaledVector(b1, -b2.dot(b1)); if (F.b2.lengthSq() < 1e-8) F.b2.set(0, 0, 1).addScaledVector(b1, -b1.z); F.b2.normalize(); F.b3.crossVectors(b1, F.b2);
  F.A.makeBasis(a1, F.a2, F.a3); F.B.makeBasis(b1, F.b2, F.b3); return out.multiplyMatrices(F.B, F.A.transpose()); };
export function fpArms(c) {
  PTEX.load(); const g = bodyGeo(FPARMS), SI = g.attributes.segI.array, SW = g.attributes.segW.array, P = g.attributes.position.array;
  // o que no corpo pesa no tronco (o ombro) fica preso ao braço do mesmo lado
  for (let v = 0; v < P.length / 3; v++) for (let j = 0; j < 4; j++) { const q = SI[v * 4 + j]; if (q < 2 || q > 5) SI[v * 4 + j] = P[v * 3] < 0 ? 2 : 3; }
  const dom = v => { let b = -1, w = -1; for (let j = 0; j < 4; j++) if (SW[v * 4 + j] > w) { w = SW[v * 4 + j]; b = SI[v * 4 + j]; } return b; };
  // pele certa no pulso e na mão (a textura tinha ali um bocado de outra peça: parecia uma pulseira tatuada)
  { const sk = new Float32Array(P.length / 3); for (let v = 0; v < sk.length; v++) { const d = dom(v); sk[v] = (d === 4 || d === 5) && P[v * 3 + 1] < 0.893 ? 1 : 0; } g.setAttribute('skinW', new THREE.BufferAttribute(sk, 1)); }
  // poses das mãos (gatilho, pega, larga, punho, aberta): posições e normais dos vértices dos dedos, trocadas quando a pega muda
  const PI_ = new Uint16Array(zbuf(FPARMS.pi)), POSES = {}, NA = g.attributes.normal.array;
  for (const nm in FPARMS.poses || {}) { const Q = new Int16Array(zbuf(FPARMS.poses[nm].p)), Nq = new Int8Array(zbuf(FPARMS.poses[nm].nm)); const pp = new Float32Array(Q.length); for (let i = 0; i < Q.length; i++) pp[i] = Q[i] / 32767 * 2; POSES[nm] = { p: pp, n: Nq }; }
  const curPose = [null, null];
  const setPose = (side, nm) => { if (curPose[side] === nm || !POSES[nm]) return; curPose[side] = nm; const Q = POSES[nm]; for (let k = 0; k < PI_.length; k++) { const v = PI_[k]; if ((P[v * 3] > 0) === !!side) continue; P[v * 3] = Q.p[k * 3]; P[v * 3 + 1] = Q.p[k * 3 + 1]; P[v * 3 + 2] = Q.p[k * 3 + 2]; NA[v * 3] = Q.n[k * 3]; NA[v * 3 + 1] = Q.n[k * 3 + 1]; NA[v * 3 + 2] = Q.n[k * 3 + 2]; } g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; };
  // ponto onde a mão agarra (centro da mão fechada) de cada lado
  const B = PBODY.bind, grip = [4, 5].map(sg => { const o = new THREE.Vector3(); let n = 0; for (let v = 0; v < P.length / 3; v++) if (dom(v) === sg && P[v * 3 + 1] < 0.86) { o.x += P[v * 3]; o.y += P[v * 3 + 1]; o.z += P[v * 3 + 2]; n++; } return o.divideScalar(n || 1); });
  const data = new Float32Array(30 * 4), tex = new THREE.DataTexture(data, 30, 1, THREE.RGBAFormat, THREE.FloatType);
  for (let k = 0; k < 10; k++) { data[k * 12] = 1; data[k * 12 + 5] = 1; data[k * 12 + 10] = 1; } tex.needsUpdate = true;
  const uni = { boneTex: { value: tex }, maskMap: { value: null }, uTop: { value: new THREE.Vector3(1, 1, 1) }, uLegs: { value: new THREE.Vector3(1, 1, 1) }, uSkin: { value: new THREE.Vector3(1, 1, 1) }, uHair: { value: new THREE.Vector3(1, 1, 1) }, uHasMask: { value: 0 } };
  const m = new THREE.MeshStandardMaterial({ color: c.top ?? 0x8a8a80, roughness: 0.78 }); m.userData.uni = uni;
  // mãos limpas: a pele da textura foi pintada para a mão aberta (as sombras dos dedos ficavam riscos com a mão fechada); aqui a pele é lisa, com o relevo só da luz
  uni.uSkinC = { value: new THREE.Color(PREF.skin) }; // tom de referência: o shader da máscara pinta depois com a pele escolhida
  skinPatch(m, uni, 'fpa', sh => { sh.__uni = uni; maskFrag(sh); sh.uniforms.uSkinC = uni.uSkinC; sh.vertexShader = 'attribute float skinW;\nvarying float vSkinW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSkinW = skinW;'); sh.fragmentShader = 'uniform vec3 uSkinC;\nvarying float vSkinW;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec4 mk2 = texture2D(maskMap, vMapUv); float sk = max(smoothstep(0.35, 0.8, mk2.b), vSkinW) * uHasMask; normal = normalize(mix(normal, nonPerturbedNormal, sk)); }`).replace('#include <color_fragment>', `#include <color_fragment>
#ifdef USE_MAP
  { vec4 mk3 = texture2D(maskMap, vMapUv); float sk = max(smoothstep(0.35, 0.8, mk3.b), vSkinW) * uHasMask; diffuseColor.rgb = mix(diffuseColor.rgb, uSkinC * uSkin, sk); }
#endif`); }); PTEX.mats.add(m); PTEX.apply(m);
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false;
  const self = { mesh, uni, grip, setPose,
    setColors(c) { Body.prototype.setColors.call(self, c); },
    dispose() { PTEX.mats.delete(m); m.dispose(); tex.dispose(); g.dispose(); },
    // lado 0 = esquerdo, 1 = direito (no ecrã). A malha tem a mão direita a x < 0 (o boneco olha para +z): o lado direito do ecrã usa essa,
    // senão ficava uma mão esquerda à direita, a agarrar com as costas da mão e o polegar do lado errado. palma: direção para onde vira a palma da mão (no espaço de quem chama)
    place(side, S, H, pole, palm, fwd) {
      const F = _fa, bA = B[side ? 'armL' : 'armR'], bF = B[side ? 'foreL' : 'foreR'], L1 = Math.hypot(bF[0] - bA[0], bF[1] - bA[1], bF[2] - bA[2]);
      const gS = grip[side ? 0 : 1], Gl = F.w.set(gS.x - bF[0], gS.y - bF[1], gS.z - bF[2]), L2 = Gl.length();
      // longe demais: o ombro vai atrás da mão (como quem estica o corpo), para a mão chegar sempre ao sítio
      F.d.subVectors(H, S); let D = F.d.length(); const Dm = L1 + L2 - 0.03; S = F.w2 = (F.w2 || new THREE.Vector3()).copy(S); if (D > Dm) { S.addScaledVector(F.d, (D - Dm) / D); D = Dm; } D = Math.max(D, Math.abs(L1 - L2) + 0.01); F.d.normalize();
      F.n.copy(pole).addScaledVector(F.d, -pole.dot(F.d)).normalize();
      if (fwd) { F.E.copy(H).addScaledVector(fwd, -L2); F.b2.subVectors(S, F.E).normalize(); S.copy(F.E).addScaledVector(F.b2, L1); } // antebraço na direção pedida (a mão fica bem virada); o ombro acompanha
      else { const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L1 * L1 - a * a)); F.E.copy(S).addScaledVector(F.d, a).addScaledVector(F.n, h); }
      const hx = side ? 1 : -1; // palma de cada mão no corpo em pé: virada para dentro
      // antebraço: o ponto de agarrar vai ao alvo e a palma vira para onde se pede
      F.b1.subVectors(H, F.E).normalize(); F.a1.copy(Gl).normalize(); const Rf = mapBasis(F.a1, F.b3.set(0, 0, 1), F.b1, palm, F.Rf || (F.Rf = new THREE.Matrix4())); // 'palm' = para onde aponta o polegar (o eixo do que a mão agarra)
      // braço: do ombro ao cotovelo, rodado o mesmo que o antebraço (sem torcer o cotovelo)
      const pw = (F.pw || (F.pw = new THREE.Vector3())).set(hx, 0, 0).applyMatrix4(Rf); F.b1.subVectors(F.E, S).normalize(); F.a1.set(bF[0] - bA[0], bF[1] - bA[1], bF[2] - bA[2]).normalize(); const Ru = mapBasis(F.a1, F.b3.set(hx, 0, 0), F.b1, pw, F.Ru || (F.Ru = new THREE.Matrix4()));
      const put = (k, R, at, b) => { F.M.makeTranslation(at.x, at.y, at.z).multiply(R).multiply(F.T.makeTranslation(-b[0], -b[1], -b[2])); const e = F.M.elements, o = k * 12;
        data[o] = e[0]; data[o + 1] = e[4]; data[o + 2] = e[8]; data[o + 3] = e[12]; data[o + 4] = e[1]; data[o + 5] = e[5]; data[o + 6] = e[9]; data[o + 7] = e[13]; data[o + 8] = e[2]; data[o + 9] = e[6]; data[o + 10] = e[10]; data[o + 11] = e[14]; };
      put(side ? 2 : 3, Ru, S, bA); put(side ? 4 : 5, Rf, F.E, bF); tex.needsUpdate = true; if (self.dbg) (self.last || (self.last = []))[side] = [S, F.E, H].map(v => v.toArray().map(x => +x.toFixed(3))); return F.E;
    },
    restAt(side, x, y, z, rx = 0, ry = 0) { const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0)); for (const k of side ? [2, 4] : [3, 5]) { const gp = grip[side ? 0 : 1], M = new THREE.Matrix4().makeTranslation(x, y, z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-gp.x, -gp.y, -gp.z)); const e = M.elements, o = k * 12; data[o] = e[0]; data[o + 1] = e[4]; data[o + 2] = e[8]; data[o + 3] = e[12]; data[o + 4] = e[1]; data[o + 5] = e[5]; data[o + 6] = e[9]; data[o + 7] = e[13]; data[o + 8] = e[2]; data[o + 9] = e[6]; data[o + 10] = e[10]; data[o + 11] = e[14]; } tex.needsUpdate = true; },
    hide(side) { const o = (side ? 2 : 3) * 12, o2 = (side ? 4 : 5) * 12; for (const q of [o, o2]) { data.fill(0, q, q + 12); } tex.needsUpdate = true; } };
  self.setColors(c); return self;
}
const _rm = new THREE.Matrix4(), _rk = new THREE.Matrix4();
const relTo = (root, o, out) => { out.copy(o.matrix); for (let p = o.parent; p && p !== root; p = p.parent) out.premultiply(p.matrix); return out; };
export const PCOL = { skin: 0xd9a882, top: 0x5c6846, legs: 0x3a3f33, shoes: 0x23211f, hair: 0x2a211b, beard: 0x6a4a32 };
export const lookCol = L => { L = L || {}; const hair = L.hair ?? PCOL.hair, bs = L.beardS ?? 1; return { ...PCOL, skin: L.skin ?? PCOL.skin, top: L.top ?? PCOL.top, legs: L.legs ?? PCOL.legs, hair, hairS: L.hairS ?? 0, beardS: bs, beard: bs ? (hair === PCOL.hair ? PCOL.beard : hair) : null }; };
export class Body {
  // personagem articulada: anca, coxa→joelho→canela, ombro→cotovelo→mão, pescoço→cabeça. Andar com dobra dos joelhos e
  // balanço dos braços, respiração parada, as duas mãos na arma por IK, pistola a duas mãos, golpe com o corpo todo
  constructor(mats, c, opts = {}) {
    const G = gearGeos(), Wp = weaponGeos();
    this.root = new THREE.Group();
    this.hips = new THREE.Group(); this.hips.position.y = HIP; this.root.add(this.hips);
    this.torso = new THREE.Group(); this.hips.add(this.torso);
    this.head = new THREE.Group(); this.head.position.y = NECK; this.torso.add(this.head);
    this.legs = [-1, 1].map(s => { const g = new THREE.Group(); g.position.set(s * 0.11, 0, 0); this.hips.add(g); const k = new THREE.Group(); k.position.y = -THIGH; g.add(k); g.userData.knee = k; return g; });
    this.arms = [-1, 1].map(s => { const g = new THREE.Group(); g.position.set(s * SHX, SHY - HIP, 0); this.torso.add(g); const f = new THREE.Group(); f.position.y = -UPPER; g.add(f); const h = new THREE.Group(); h.position.y = -0.33; f.add(h); g.userData.fore = f; g.userData.hand = h; return g; });
    this.mkSkin(c);
    // equipamento (provisório até ao equipamento novo): encolhido e mudado para a cabeça e o tronco do corpo novo
    this.gear = {}; for (const k in G) { if (/^suit[A-Z]/.test(k) || k.startsWith('gh_') || k === 'real') continue; const g = meshOf(G[k], mats); g.visible = false; if (G.real) { if (k === 'eyes' || k.startsWith('head')) this.head.add(g); else this.torso.add(g); this.gear[k] = g; continue; } if (k === 'eyes' || k.startsWith('head')) { const hs = 0.68; g.scale.setScalar(hs); g.position.set(0, PBODY.headC[1] - hs * (NECK + 0.145) + 0.006, PBODY.headC[2] + 0.02 - hs * 0.01); this.head.add(g); } else { const T = k.startsWith('vest') ? [0.74, 0.8, 0.75, -0.022, 0.01] : k === 'back' ? [0.85, 0.85, 0.85, 0, 0.012] : [0.8, 0.85, 0.8, 0, 0.01]; g.scale.set(T[0], T[1], T[2]); g.position.set(0, T[3], T[4]); this.torso.add(g); } this.gear[k] = g; }
    const sx = (geo, par) => { const g = meshOf(geo, mats); g.visible = false; par.add(g); return g; };
    this.suitX = G.gh_head ? [sx(G.gh_head, this.head), sx(G.gh_armL, this.arms[0]), sx(G.gh_armR, this.arms[1]), sx(G.gh_foreL, this.arms[0].userData.fore), sx(G.gh_foreR, this.arms[1].userData.fore), sx(G.gh_legL, this.legs[0]), sx(G.gh_legR, this.legs[1]), sx(G.gh_shinL, this.legs[0].userData.knee), sx(G.gh_shinR, this.legs[1].userData.knee)]
      : [...this.arms.flatMap(a => [sx(G.suitU, a), sx(G.suitF, a.userData.fore)]), ...this.legs.flatMap(l => [sx(G.suitT, l), sx(G.suitS, l.userData.knee)])];
    this.weps = {}; for (const k in Wp) { const g = meshOf(Wp[k], mats); g.visible = false; const base = k.replace(/^(sup|sc8|sc|rd|lt|mag|bolt|pump)_/, ''); if (LONG.includes(base)) this.torso.add(g); else { g.position.y = 0.53; this.arms[1].userData.hand.add(g); } this.weps[k] = g; }
    // o que tens na mão ao usar: comida, bebida ou ligadura
    this.props = { eat: meshOf(geoOf(b => { b.rbox(0.13, 0.17, 0.05, 0.02, 0, 0, 0, 0xd8c8a0); b.box(0.135, 0.05, 0.055, 0, 0.05, 0, 0xc8321e); }), mats), drink: meshOf(geoOf(b => { b.cyl(0.04, 0.04, 0.2, 10, 0, 0, 0, 0x8ab8d8); b.cyl(0.02, 0.025, 0.04, 8, 0, 0.12, 0, 0x2a6aa8); }), mats), heal: meshOf(geoOf(b => { b.cyl(0.05, 0.05, 0.08, 12, 0, 0, 0, 0xf2f0ea, { rz: Math.PI / 2 }); }), mats), gran: meshOf(geoOf(b => { b.sph(0.034, 0, 0, 0, 0x4a5236, { ws: 10, hs: 8 }); b.cyl(0.012, 0.012, 0.022, 8, 0, 0.038, 0, 0x6a6e62); }), mats) };
    for (const k in this.props) { const m = this.props[k]; m.visible = false; m.position.set(0, -0.04, 0.05); this.arms[1].userData.hand.add(m); }
    this.phase = 0; this.t = Math.random() * 10; this.amp = 0; this.run = 0;
  }
  mkSkin(c) {
    const PGe = pgeo(); PTEX.load();
    const data = new Float32Array(30 * 4), tex = new THREE.DataTexture(data, 30, 1, THREE.RGBAFormat, THREE.FloatType); tex.needsUpdate = true;
    const uni = this.uni = { boneTex: { value: tex }, maskMap: { value: null }, uTop: { value: new THREE.Vector3(1, 1, 1) }, uLegs: { value: new THREE.Vector3(1, 1, 1) }, uSkin: { value: new THREE.Vector3(1, 1, 1) }, uHair: { value: new THREE.Vector3(1, 1, 1) }, uHasMask: { value: 0 } };
    this.bdata = data; this.btex = tex;
    const m = new THREE.MeshStandardMaterial({ color: c.top ?? 0x8a8a80, roughness: 0.82 }); m.userData.uni = uni;
    skinPatch(m, uni, 'pm', sh => { sh.__uni = uni; maskFrag(sh); }); PTEX.mats.add(m); PTEX.apply(m); this.pmat = m;
    this.setColors(c);
    this.skin = [PGe.l0, PGe.l1].map((g, i) => { const me = new THREE.Mesh(g, m); me.castShadow = true; me.receiveShadow = true; me.frustumCulled = false; me.visible = i === 0; me.userData.skinned = true; me.position.y = 0.014;
      me.customDepthMaterial = skinPatch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uni, 'pd'); me.customDistanceMaterial = skinPatch(new THREE.MeshDistanceMaterial(), uni, 'pp'); this.root.add(me); return me; });
    // cabelo e barba: presos à cabeça (a malha foi feita com a cabeça 2 cm mais à frente do ponto de rotação)
    const HS = [null, null, 'comprido', 'rabo', 'moicano']; HS[0] = 'curto';
    this.hairM = new THREE.MeshStandardMaterial({ color: c.hair ?? 0x2a211b, vertexColors: true, roughness: 0.72, side: THREE.DoubleSide });
    this.beardM = new THREE.MeshStandardMaterial({ color: c.beard ?? c.hair ?? 0x2a211b, vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    const add = (k, mat) => { if (!k || !PGe.hair[k]) return null; const h = new THREE.Mesh(PGe.hair[k], mat); h.position.z = 0.02; h.castShadow = true; h.receiveShadow = true; this.head.add(h); return h; };
    this.hairMesh = add(HS[c.hairS ?? 0], this.hairM);
    this.beardMesh = c.beard ? add(['', 'barba', 'bigode'][c.beardS ?? 1], this.beardM) : null;
    this.segs = [this.torso, this.head, this.arms[0], this.arms[1], this.arms[0].userData.fore, this.arms[1].userData.fore, this.legs[0], this.legs[1], this.legs[0].userData.knee, this.legs[1].userData.knee];
    this.root.updateMatrixWorld(true); this.Ginv = this.segs.map(o => relTo(this.root, o, new THREE.Matrix4()).invert());
    this.lodNear = true; this.skinUpd();
  }
  // liberta o que é só deste corpo (retratos do inventário e do editor de aparência fazem um corpo novo de cada vez)
  dispose() { PTEX.mats.delete(this.pmat); this.pmat.dispose(); this.hairM.dispose(); this.beardM.dispose(); this.btex.dispose(); for (const m of this.skin) { m.customDepthMaterial.dispose(); m.customDistanceMaterial.dispose(); } }
  setColors(c) { const u = this.uni; ratio(c.top ?? PREF.top, PREF.top, u.uTop.value); ratio(c.legs ?? PREF.legs, PREF.legs, u.uLegs.value); ratio(c.skin ?? PREF.skin, PREF.skin, u.uSkin.value); ratio(c.hair ?? PREF.hair, PREF.hair, u.uHair.value); }
  // material com a mesma pele (para o contorno visto através das paredes)
  skinMat(base) { return skinPatch(base.clone(), this.uni, 'ps' + base.id); }
  skinUpd() {
    const d = this.bdata, S = this.segs; for (const o of S) o.updateMatrix(); this.hips.updateMatrix();
    for (let k = 0; k < S.length; k++) {
      relTo(this.root, S[k], _rm); _rk.multiplyMatrices(_rm, this.Ginv[k]); const e = _rk.elements, o = k * 12;
      d[o] = e[0]; d[o + 1] = e[4]; d[o + 2] = e[8]; d[o + 3] = e[12]; d[o + 4] = e[1]; d[o + 5] = e[5]; d[o + 6] = e[9]; d[o + 7] = e[13]; d[o + 8] = e[2]; d[o + 9] = e[6]; d[o + 10] = e[10]; d[o + 11] = e[14];
    }
    this.btex.needsUpdate = true;
    let near = this.lodNear; if (Body.cam && !this.forceNear) { const p = this.root.position, q = Body.cam; near = (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2 < (Body.nearD || 16) ** 2; }
    this.skin[0].visible = near; this.skin[1].visible = !near;
  }
  setGear(eq) { const on = gearKeys(eq); for (const k in this.gear) this.gear[k].visible = on.has(k); for (const g of this.suitX) g.visible = on.has('suit'); }
  setWeapon(k, att = {}) { const sc = att.scope ? (att.scope === 'mira8' ? 'sc8_' : att.scope === 'reddot' ? 'rd_' : 'sc_') + k : null, sp = att.sup ? 'sup_' + k : null, lt = att.light ? 'lt_' + k : null; const vis = [sc, sp, lt, 'mag_' + k, 'bolt_' + k, 'pump_' + k].filter(w => w && this.weps[w]); this.wkMag = this.weps['mag_' + k] || null; this.wkPiv = this.wkMag ? partPivot('mag_' + k) : null; for (const w in this.weps) this.weps[w].visible = w === k || vis.includes(w); this.wk = k; this.wkAtt = vis; }
  // um membro: coxa/braço (rotação x = para a frente/trás, z = abrir) e a dobra do joelho/cotovelo
  limb(g, rx, rz, bend, ry = 0) { g.quaternion.setFromEuler(_pe.set(rx, ry, rz, 'XYZ')); const k = g.userData.knee || g.userData.fore; k.rotation.set(bend, 0, 0); if (g.userData.hand) g.userData.hand.rotation.set(0, 0, 0); }
  // anim: mv (0..1.5), mode ('rifle','pistol','melee','none'), swing (0..1 ou -1), dt
  pose(...a) { this._pose(...a); this.skinUpd(); }
  _pose(dt, mv, mode, swing = -1, recoil = 0, twist = 0, climb = -1, step = 0, raise = 1, use = null, act = null) {
    const rl = act && act.rel >= 0 ? act.rel : -1, thr = act && act.thr >= 0 ? act.thr : -1;
    this.phase += step * 2.7; this.t += dt;
    const k8 = Math.min(1, dt * 8); this.amp += (Math.min(1, mv) - this.amp) * k8; this.run += ((mv > 1.15 ? 1 : 0) - this.run) * Math.min(1, dt * 5);
    const A = this.amp, Rn = this.run, ph = this.phase, s = Math.sin(ph), cph = Math.cos(ph), idle = 1 - Math.min(1, A * 3), t = this.t;
    const sc = this.stance || 0, cr = Math.min(1, sc) * (1 - Math.max(0, sc - 1)), pr = Math.max(0, Math.min(1, sc - 1)); // agachado (cr) e deitado (pr), suaves
    const [LL, LR] = this.legs, [AL, AR] = this.arms, armed = mode === 'rifle' || mode === 'pistol';
    // anca: sobe e desce duas vezes por passada, balança para os lados; respiração quando parado
    this.hips.position.set(Math.sin(ph) * 0.018 * A, HIP - 0.015 * A - 0.03 * Rn + Math.abs(cph) * (0.03 + 0.03 * Rn) * A, 0);
    this.hips.position.y -= (0.37 * (1 - A) + 0.22 * A) * cr; this.hips.position.z = -(0.08 * (1 - A) + 0.15 * A) * cr; if (pr > 0) { this.hips.position.y += (0.19 - this.hips.position.y) * pr; this.hips.position.z *= 1 - pr; }
    this.hips.rotation.set(1.54 * pr, -s * 0.08 * A * (1 - pr), s * 0.03 * A * (1 - pr)); // deitado: o corpo roda para a frente e fica de barriga para baixo
    const lean = 0.02 + 0.07 * A + 0.13 * Rn * A + (armed ? 0.04 : 0);
    this.torso.rotation.set((lean + Math.sin(t * 1.7) * 0.012 * idle) * (1 - pr) + 0.26 * cr - 0.08 * pr, twist + s * 0.13 * A * (armed ? 0.3 : 1) * (1 - pr), -s * 0.025 * A);
    this.torso.scale.set(1, 1 + Math.sin(t * 1.7) * 0.008 * idle, 1);
    // cabeça: compensa a inclinação e olha um pouco à volta quando estás parado
    this.head.rotation.set(-lean * 0.7 * (1 - pr) - Math.sin(t * 1.7) * 0.01 * idle - 0.25 * cr - 1.2 * pr, -s * 0.1 * A * (armed ? 0.3 : 1) + Math.sin(t * 0.37) * 0.22 * idle * (armed ? 0.3 : 1), 0);
    // pernas: coxa para a frente/trás e o joelho dobra quando a perna vem para a frente (mais a correr)
    for (const [L, sg, off] of [[LL, -1, 0], [LR, 1, Math.PI]]) { const q = ph + off, sw = Math.sin(q);
      const hip = -sw * (0.42 + 0.22 * Rn) * A - 0.04 * Rn, knee = 0.06 + (0.15 + 0.25 * Rn) * A + (0.55 + 0.6 * Rn) * A * Math.max(0, Math.sin(q - 0.6)) + idle * 0.03;
      // agachado: parado, de joelho no chão (o direito) e o pé esquerdo à frente; a andar, baixo e com passos curtos
      const kH = L === LR ? -0.15 : -1.35, kK = L === LR ? 1.85 : 1.4, wH = sw * 0.35 - 1.0, wK = 1.25 + 0.4 * Math.max(0, Math.sin(q - 0.6)), cH = kH * (1 - A) + wH * A, cK = kK * (1 - A) + wK * A;
      const hc = hip + (cH - hip) * cr, kc = knee + (cK - knee) * cr;
      const hp2 = hc + (-0.06 + sw * 0.16 * A - hc) * pr, kp2 = kc + (0.12 + 0.6 * A * Math.max(0, Math.sin(q)) - kc) * pr; // deitado: pernas esticadas, a rastejar
      this.limb(L, hp2, sg * (0.03 + 0.02 * idle + 0.12 * pr), kp2); }
    if (climb >= 0) { const c = climb, k = Math.sin(c * Math.PI); this.limb(AR, -2.6 + c * 1.8, -0.2, -0.4 + c * 0.3); this.limb(AL, -2.6 + c * 1.8, 0.2, -0.4 + c * 0.3); this.limb(LL, -1.4 * k, -0.05, 1.7 * k); this.limb(LR, -0.5 * k, 0.05, 0.6 * k); this.torso.rotation.x = 0.45 * k; this.hips.position.y = HIP - 0.12 * k; return; }
    const re0 = rl >= 0 ? Math.min(1, rl * 6, (1 - rl) * 6) : 0, lo = (1 - raise) * (1 - re0), wk = this.wk && this.weps[this.wk]; // a recarregar, a arma sobe para o peito
    // recarga: a arma inclina (poço do carregador para cima e para o lado), o carregador sai com a mão esquerda e volta
    const re = rl >= 0 ? Math.min(1, rl * 8, (1 - rl) * 8) : 0, sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const magOff = rl < 0 ? 0 : rl < 0.12 ? 0 : rl < 0.3 ? sm(0.12, 0.3, rl) * 0.3 : rl < 0.5 ? 0.3 : rl < 0.66 ? 0.3 * (1 - sm(0.5, 0.66, rl)) : 0;
    const wp = this._wp || (this._wp = new THREE.Vector3()); { const th = -1.47 * pr, P = SHY - HIP - 0.12; wp.set(0, P * (1 - Math.cos(th)), -P * Math.sin(th)); } // deitado: a arma roda à volta do ombro e fica à frente da cara
    if (wk && LONG.includes(this.wk)) { const rx = lo * 0.62 * (1 - pr) + 0.18 * re - 1.47 * pr, rz = -0.45 * re, ry = 0.15 * re; wk.rotation.set(rx, ry, rz); wk.position.copy(wp); for (const a of this.wkAtt || []) if (a) { this.weps[a].rotation.set(rx, ry, rz); this.weps[a].position.copy(wp); }
      if (this.wkMag) { this.wkMag.position.set(0, -magOff, 0).applyEuler(wk.rotation).add(wp); this.wkMag.visible = wk.visible && !(rl > 0.28 && rl < 0.46); } }
    else if (this.wkMag) { this.wkMag.position.set(0, 0.53, -magOff * 0.8); this.wkMag.visible = !(rl > 0.28 && rl < 0.46); }
    // braços a balançar (sem arma na mão): opostos às pernas, cotovelo dobra mais a correr
    const swingArms = (onlyL) => { for (const [Ar, sg, off] of [[AL, -1, Math.PI], [AR, 1, 0]]) { if (onlyL && Ar === AR) continue; const q = ph + off, sw = Math.sin(q);
      // a andar: braço quase estendido, dobra só quando vem à frente; a correr: cotovelo a 90° e o braço a bombear (mais atrás do que à frente)
      const walkB = 0.12 + 0.35 * Math.max(0, sw), runB = 1.25 + 0.25 * sw, swA = (0.38 + 0.42 * Rn) * A, back = Math.max(0, -sw) * 0.25 * Rn * A;
      this.limb(Ar, -sw * swA + back + 0.04 * A + Math.sin(t * 1.7) * 0.015 * idle, sg * -(0.06 + 0.05 * Rn), -(0.1 * idle + A * (walkB * (1 - Rn) + runB * Rn))); } };
    if (mode === 'rifle' && wk && GRIP[this.wk]) {
      // as duas mãos na arma: punho e guarda-mão, com a mesma rotação da arma (para baixo quando está em baixo)
      const g = GRIP[this.wk]; _pe.set(wk.rotation.x - recoil * 0.06, wk.rotation.y, wk.rotation.z); _rx.makeRotationFromEuler(_pe);
      AR.position.set(SHX, SHY - HIP, 0); _t.set(WPUSH[0] + 0.03 + g[0][0], WPUSH[1] + g[0][1], WPUSH[2] + g[0][2]).applyMatrix4(_rx).add(wp); _sh.copy(AR.position); _pl.set(1.2, -0.6, -0.5);
      AR.userData.hand.quaternion.identity(); ik2(AR, AR.userData.fore, _sh, _t, _pl);
      _t.set(WPUSH[0] - 0.05 + g[1][0], WPUSH[1] + g[1][1], WPUSH[2] + g[1][2]).applyMatrix4(_rx).add(wp); _sh.set(-SHX + 0.04, SHY - HIP - 0.02, 0.07); AL.position.copy(_sh); _pl.set(-1, -0.8, -0.3);
      if (rl >= 0) { // mão ao carregador → à bolsa do cinto → de volta ao poço → ao guarda-mão
        const mp = this.wkPiv ? _t2.copy(this.wkPiv).add(_t3.set(0, -0.05 - magOff, 0)).applyMatrix4(_rx) : _t2.set(0.07, -0.02, 0.22).applyMatrix4(_rx), belt = _t3.set(-0.16, -0.05, 0.12);
        const k1 = sm(0.0, 0.12, rl), k2 = sm(0.3, 0.4, rl) * (1 - sm(0.46, 0.56, rl)), k3 = sm(0.68, 0.84, rl);
        _t4.copy(_t).lerp(mp, k1); _t4.lerp(belt, k2); _t4.lerp(_t, k3); _t.copy(_t4); }
      ik2(AL, AL.userData.fore, _sh, _t, _pl);
      this.torso.rotation.y = twist - 0.14 * raise;
    } else if (mode === 'pistol') {
      // pistola a duas mãos à frente do peito (em baixo, a apontar para o chão)
      AR.position.set(SHX, SHY - HIP, 0); _t.set(0.02, SHY - HIP - 0.06 - lo * 0.34 + recoil * 0.03, 0.42 - lo * 0.14 - recoil * 0.05); if (pr > 0) { const an = -1.47 * pr, c0 = Math.cos(an), s0 = Math.sin(an), yy = _t.y - (SHY - HIP), zz = _t.z; _t.y = SHY - HIP + yy * c0 - zz * s0; _t.z = yy * s0 + zz * c0; } /* deitado: a pistola vai para a frente da cara */ _sh.copy(AR.position); _pl.set(1, -0.7, -0.3); ik2(AR, AR.userData.fore, _sh, _t, _pl);
      _t.x -= 0.06; _t.y -= 0.03; _t.z -= 0.03; if (rl >= 0) { const k = sm(0.05, 0.2, rl) * (1 - sm(0.5, 0.68, rl)); _t.lerp(_t2.set(-0.16, -0.05, 0.12), k); _t.y -= 0.12 * re * (1 - k); } _sh.set(-SHX + 0.03, SHY - HIP, 0.05); AL.position.copy(_sh); _pl.set(-1, -0.7, -0.3); ik2(AL, AL.userData.fore, _sh, _t, _pl);
      // a mão da arma fica sempre virada para a frente (a pistola aponta para onde olhas), seja qual for a dobra do cotovelo
      const H = AR.userData.hand; _hq.copy(AR.quaternion).multiply(AR.userData.fore.quaternion).invert(); _hq2.setFromEuler(_pe.set(-Math.PI / 2 + lo * 0.9 - recoil * 0.25 - 1.47 * pr, 0, 0)); H.quaternion.copy(_hq).multiply(_hq2);
    } else {
      AL.position.set(-SHX, SHY - HIP, 0); AR.position.set(SHX, SHY - HIP, 0);
      if (mode === 'melee') {
        if (swing >= 0) { // golpe: levanta atrás do ombro, desce com o tronco a rodar e acompanha
          let rx, el; if (swing < 0.22) { const e = swing / 0.22; rx = -0.6 - 2.1 * e; el = -0.4 - 1.2 * e; } else if (swing < 0.5) { const e = 1 - Math.pow(1 - (swing - 0.22) / 0.28, 3); rx = -2.7 + 2.4 * e; el = -1.6 + 1.45 * e; } else { const e = (swing - 0.5) / 0.5; rx = -0.3 - 0.25 * e; el = -0.15 - 0.3 * e; }
          this.limb(AR, rx, swing < 0.5 ? -0.35 + swing * 0.7 : 0, el);
          this.torso.rotation.y = twist + (swing < 0.22 ? -0.4 * (swing / 0.22) : swing < 0.5 ? -0.4 + 0.8 * ((swing - 0.22) / 0.28) : 0.4 * (1 - (swing - 0.5) / 0.5));
          this.limb(AL, -0.5, 0.25, -1.1);
        } else { this.limb(AR, -0.45 - s * 0.2 * A, -0.12, -0.9); swingArms(true); }
      } else swingArms(false);
    }
    if (thr >= 0 && !(mode === 'rifle' || mode === 'pistol')) { const back = thr < 0.42 ? sm(0, 0.42, thr) : 1 - sm(0.42, 0.62, thr), fw = thr < 0.42 ? 0 : Math.sin(Math.min(1, (thr - 0.42) / 0.45) * Math.PI);
      AR.position.set(SHX, SHY - HIP, 0); AL.position.set(-SHX, SHY - HIP, 0); this.limb(AR, -2.3 * back - 1.2 * fw, -0.25 * back, -1.4 * back - 0.2 * fw); this.limb(AL, -1.2 * back - 0.3 * fw, 0.2, -0.3);
      this.torso.rotation.y = twist - 0.45 * back + 0.35 * fw; this.torso.rotation.x += 0.12 * fw; }
    if (pr > 0.01 && !(mode === 'rifle' || mode === 'pistol') && thr < 0 && swing < 0) { AL.position.set(-SHX, SHY - HIP, 0); AR.position.set(SHX, SHY - HIP, 0); const q = Math.sin(ph) * 0.25 * A; this.limb(AR, (-2.55 + q) * pr, -0.3 * pr, -0.9 * pr); this.limb(AL, (-2.55 - q) * pr, 0.3 * pr, -0.9 * pr); } // deitado sem arma: braços à frente, a rastejar
    this.props.gran.visible = thr >= 0 && thr < 0.45;
    // a usar alguma coisa: a arma vai para o lado e as mãos fazem o gesto (levar à boca, beber, enrolar a ligadura)
    const uk = use ? use.kind : null; for (const k in this.props) if (k !== 'gran') this.props[k].visible = k === uk;
    if (this.wk && this.weps[this.wk]) { const hide = !!uk; this.weps[this.wk].visible = !hide; for (const a of this.wkAtt || []) if (a) this.weps[a].visible = !hide; }
    if (this.wkMag && rl > 0.28 && rl < 0.46) this.wkMag.visible = false;
    if (uk) { const tt = use.t, e = Math.min(1, tt * 6, (1 - tt) * 6), w = Math.sin(tt * Math.PI * (uk === 'heal' ? 10 : uk === 'drink' ? 3 : 6));
      AL.position.set(-SHX, SHY - HIP, 0); AR.position.set(SHX, SHY - HIP, 0); AR.userData.hand.rotation.set(0, 0, 0);
      if (uk === 'heal') { this.limb(AR, -0.9 + w * 0.2 * e, -0.45 + w * 0.1, -1.0, 0.35); this.limb(AL, -0.8 - w * 0.2 * e, 0.5, -1.0, -0.35); this.torso.rotation.x += 0.22 * e; this.head.rotation.x += 0.3 * e; }
      else { this.limb(AR, -0.3 - (uk === 'drink' ? 1.0 : 0.8) * e + w * 0.08 * e, -0.35 * e, -(0.4 + 1.6 * e), 0.2); this.limb(AL, -0.3 * e, 0.15, -0.4); this.torso.rotation.x += (uk === 'drink' ? -0.14 : 0.06) * e; this.head.rotation.x += (uk === 'drink' ? -0.35 : 0.1) * e; } }
  }
  lie() { this.root.rotation.x = -Math.PI / 2; this.root.position.y = 0.16; for (const l of this.legs) this.limb(l, 0, 0, 0); this.limb(this.arms[0], 0, 0.5, -0.2); this.limb(this.arms[1], 0, -0.5, -0.2); }
}

export class Horde {
  // zombies: cada parte é uma malha repetida por instância (tronco, cabeça, coxas, canelas, braços, antebraços)
  constructor(scene, mats, max = 28, silMat = null) {
    this.max = max;
    const P = partGeos({ skin: 0x8f9a7e, top: 0x8a8274, legs: 0x3a3d44, shoes: 0x26221e, hair: 0x2a2520, blood: 0x5a0e0b, eye: 0xd8d0a0, zombie: true, torn: true, sleeve: 0x9a948a });
    const mk = (g, own) => { const m = new THREE.InstancedMesh(g.v, mats.v, max); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; m.renderOrder = 3; scene.add(m); return m; };
    this.K = ['torso', 'head', 'legL', 'legR', 'shinL', 'shinR', 'armL', 'armR', 'foreL', 'foreR']; const G = { torso: P.torso, head: P.head, legL: P.thighL, legR: P.thighR, shinL: P.shin, shinR: P.shin, armL: P.upper, armR: P.upper, foreL: P.fore, foreR: P.fore };
    this.parts = this.K.map(k => mk(G[k]));
    // proteção: capacete (na cabeça) e colete (no tronco), tingidos por zombie
    const arm = geoOf(b => { b.sph(0.165, 0, 0.16, 0.0, 0xffffff, { th: Math.PI * 0.5, ws: 14, hs: 7 }); b.box(0.34, 0.03, 0.04, 0, 0.16, 0.155, 0xd8d8d8); });
    const vst = geoOf(b => { b.rbox(0.52, 0.42, 0.33, 0.06, 0, 0.44, 0, 0xffffff); for (const x of [-0.13, 0, 0.13]) b.rbox(0.1, 0.12, 0.06, 0.02, x, 0.34, 0.17, 0xd0d0d0); });
    this.helm = mk(arm, true); this.vest = mk(vst, true);
    this.sil = silMat ? this.K.map(k => { const m = new THREE.InstancedMesh(G[k].v, silMat, max); m.frustumCulled = false; m.count = 0; m.renderOrder = 1; scene.add(m); return m; }) : null;
    const tints = [0xffffff, 0xb8c8e8, 0xe8d0b0, 0xc8e0c0, 0xd8c0c8, 0x9aa0b0, 0xf0e8d8];
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) { c.set(tints[i % tints.length]); for (const m of this.parts) m.setColorAt(i, c); }
    this._m = new THREE.Matrix4();
  }
  update(list, noSil = false, fr = null) {
    const { _m } = this, sp = this._sp || (this._sp = new THREE.Sphere(new THREE.Vector3(), 3.5)); let n = 0, ns = 0, nh = 0, nv = 0; const c = this._c || (this._c = new THREE.Color()), K = this.K, PT = this.parts;
    for (const z of list) {
      if (n >= this.max) break;
      if (z.hide || z.an) continue; // os animais têm desenho próprio (animals.js)
      if (fr) { sp.center.set(z.x, (z.base || 0) + 1, z.z); if (!fr.intersectsSphere(sp)) continue; } // fora da vista (e longe demais para a sombra entrar nela): nem se calcula
      const dead = z.state === 'dead', M = zombiePose(z, this.M || (this.M = newPose()));
      for (let k = 0; k < K.length; k++) PT[k].setMatrixAt(n, M[K[k]]);
      z.inst = n;
      if (z.helm && !dead) { this.helm.setMatrixAt(nh, M.head); this.helm.setColorAt(nh, c.set(z.kind === 'pol' ? 0x2a3442 : 0x55603e)); nh++; }
      if (z.vest && !dead) { this.vest.setMatrixAt(nv, M.torso); this.vest.setColorAt(nv, c.set(z.kind === 'pol' ? 0x2c3a52 : 0x6a6448)); nv++; }
      if (this.sil && z.sees && !dead && !noSil) { const S = this.sil; for (let k = 0; k < K.length; k++) { PT[k].getMatrixAt(n, _m); S[k].setMatrixAt(ns, _m); } ns++; }
      n++;
    }
    for (const m of PT) { m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true; } // vazias: nem chamada de desenho
    for (const [m, k] of [[this.helm, nh], [this.vest, nv]]) { m.count = k; m.visible = k > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    if (this.sil) for (const m of this.sil) { m.count = ns; m.visible = ns > 0; m.instanceMatrix.needsUpdate = true; }
  }
}

// saco no chão (loot largado ou de zombie) e saco de corpo
export function bagMesh(mats, body = false) {
  const g = geoOf(b => { if (body) { b.rbox(0.7, 0.28, 1.7, 0.12, 0, 0.14, 0, 0x2a2b2c); b.box(0.05, 0.02, 1.5, 0, 0.29, 0, 0x6a6e72); } else { b.sph(0.26, 0, 0.18, 0, 0x5a4a32, { sy: 0.75, ws: 10, hs: 7 }); b.cyl(0.07, 0.1, 0.12, 8, 0, 0.38, 0, 0x4a3a28); } });
  return meshOf(g, mats);
}

// ---------- zombies com corpo realista (blender/human.py, malha base do MakeHuman, CC0) ----------
// Um só corpo com pele: cada vértice segue até 4 das 10 partes que o jogo anima (as mesmas matrizes de zombiePose), por isso
// não há juntas à vista. Todos os zombies desenham-se numa chamada por nível de detalhe: as matrizes de cada um vão numa textura
// (uma linha por zombie, 3 texels por parte). Perto: ~5200 triângulos; longe: ~1500.
const zbuf = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; };
export function bodyGeo(D) {
  const g = new THREE.BufferGeometry(), P = new Int16Array(zbuf(D.p)), pos = new Float32Array(P.length);
  for (let i = 0; i < P.length; i++) pos[i] = P[i] / 32767 * 2;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(zbuf(D.nm)), 3, true));
  g.setAttribute('tangent', new THREE.BufferAttribute(new Int8Array(zbuf(D.tg)), 4, true)); g.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(zbuf(D.uv)), 2, true));
  g.setAttribute('segI', new THREE.BufferAttribute(new Uint8Array(zbuf(D.si)), 4)); g.setAttribute('segW', new THREE.BufferAttribute(new Uint8Array(zbuf(D.sw)), 4, true));
  g.setIndex(new THREE.BufferAttribute(D.n < 65536 ? new Uint16Array(zbuf(D.i)) : new Uint32Array(zbuf(D.i)), 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.2); return g;
}
// injeta a pele no shader (material normal, sombra do sol e sombra das luzes de ponto)
export function skinPatch(m, uni, key, extra) {
  m.onBeforeCompile = sh => {
    sh.uniforms.boneTex = uni.boneTex;
    sh.vertexShader = `uniform highp sampler2D boneTex;\nattribute vec4 segI;\nattribute vec4 segW;
mat4 zbm(float s) { int c = int(s + 0.5) * 3; int r = gl_InstanceID; vec4 a = texelFetch(boneTex, ivec2(c, r), 0), b = texelFetch(boneTex, ivec2(c + 1, r), 0), d = texelFetch(boneTex, ivec2(c + 2, r), 0);
  return mat4(a.x, b.x, d.x, 0., a.y, b.y, d.y, 0., a.z, b.z, d.z, 0., a.w, b.w, d.w, 1.); }
mat4 zskin() { return zbm(segI.x) * segW.x + zbm(segI.y) * segW.y + zbm(segI.z) * segW.z + zbm(segI.w) * segW.w; }\n` + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  mat3 zN = mat3(zskin()); objectNormal = normalize(zN * objectNormal);
#ifdef USE_TANGENT
  objectTangent = normalize(zN * objectTangent);
#endif`).replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = (zskin() * vec4(transformed, 1.0)).xyz;');
    if (extra) extra(sh);
  };
  m.customProgramCacheKey = () => 'zskin-' + key;
  return m;
}
const _zi = new THREE.Matrix4(), _zk = new THREE.Matrix4();
export class ZHorde {
  constructor(scene, mat, vmat, caps = [96, 420, 420]) {
    const D = ZBODY; this.seg = D.seg; this.Ginv = D.seg.map(s => new THREE.Matrix4().makeTranslation(-D.bind[s][0], -D.bind[s][1], -D.bind[s][2]));
    this.lods = [D.lod0, D.lod1, D.lod1].map((L, li) => { // 0: perto (detalhe); 1: médio (leve, com sombra); 2: longe (leve, sem sombra: a sombra fica fora do mapa de sombras e custava o dobro)
      const cap = caps[li], data = new Float32Array(30 * cap * 4), tex = new THREE.DataTexture(data, 30, cap, THREE.RGBAFormat, THREE.FloatType); tex.needsUpdate = true;
      const uni = { boneTex: { value: tex } };
      const m = skinPatch(mat.clone(), uni, 'm' + li); m.map = mat.map; m.normalMap = mat.normalMap;
      const mesh = new THREE.InstancedMesh(li === 2 && this._g1 ? this._g1 : bodyGeo(L), m, cap); if (li === 1) this._g1 = mesh.geometry; mesh.frustumCulled = false; mesh.castShadow = li < 2; mesh.receiveShadow = true; mesh.count = 0; mesh.renderOrder = 3;
      mesh.customDepthMaterial = skinPatch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uni, 'd' + li);
      mesh.customDistanceMaterial = skinPatch(new THREE.MeshDistanceMaterial(), uni, 'p' + li);
      const c = new THREE.Color(), tints = [0xffffff, 0xd8dcec, 0xeee2d0, 0xdce8d6, 0xe6d8dc, 0xc8ccd6, 0xf2ece0];
      for (let i = 0; i < cap; i++) mesh.setColorAt(i, c.set(tints[i % tints.length]));
      scene.add(mesh); return { mesh, tex, data, cap, m };
    });
    this.mat = mat; this.M = newPose();
    // capacete e colete (provisórios, ajustados à cabeça e ao tronco novos; o equipamento a sério vem depois)
    const hc = ZBODY.headC, hr = ZBODY.headR;
    const arm = geoOf(b => { b.sph(hr + 0.024, hc[0], hc[1] + 0.02, hc[2] - 0.005, 0xffffff, { th: Math.PI * 0.52, ws: 18, hs: 9, sy: 1.05 }); b.box(0.2, 0.024, 0.03, 0, hc[1] + 0.035, hc[2] + hr + 0.012, 0xd8d8d8); });
    const vst = geoOf(b => { b.rbox(0.4, 0.4, 0.28, 0.06, 0, 0.36, 0.01, 0xffffff); for (const x of [-0.1, 0, 0.1]) b.rbox(0.085, 0.11, 0.05, 0.018, x, 0.27, 0.15, 0xd0d0d0); });
    const mk = g => { const m = new THREE.InstancedMesh(g.v, vmat, 400); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; m.renderOrder = 3; scene.add(m); return m; };
    const one = k => { const g = geoOf(b => { for (const T of dataTpl(GEARDATA, k)) b.add(T.g, T.c, 'v'); }); return g; };
    if (GEARDATA.capacete) { const h = one('capacete'); h.v.translate(0, 0, -0.02); this.helm = mk(h); this.vest = mk(one('colete')); this.realGear = true; } // equipamento novo (a cabeça dos zombies tem o ponto de rotação 2 cm mais à frente)
    else { this.helm = mk(arm); this.vest = mk(vst); } this._c = new THREE.Color();
  }
  // a textura chegou depois de criar os materiais: passa-a às cópias
  setMaps(map, nmap) { for (const L of this.lods) { L.m.map = map; L.m.normalMap = nmap; L.m.color.set(0xffffff); L.m.needsUpdate = true; } }
  update(list, fr, near) {
    const sp = this._sp || (this._sp = new THREE.Sphere(new THREE.Vector3(), 3.5)), n = [0, 0], K = this.seg, P = this.M; let nh = 0, nv = 0;
    for (const z of list) {
      if (z.hide || z.an) continue;
      if (fr) { sp.center.set(z.x, (z.base || 0) + 1, z.z); if (!fr.intersectsSphere(sp)) continue; }
      const t = near(z); let li = t === true ? 0 : t === false ? 1 : t; if (n[li] >= this.lods[li].cap) li = li ? 2 : 1; if (n[li] >= this.lods[li].cap) li = 2; if (n[li] >= this.lods[li].cap) continue; // cheio: passa para a versão mais leve
      const LL = this.lods[li], r = n[li]++;
      const M = zombiePose(z, P); LL.mesh.setMatrixAt(r, M.r); _zi.copy(M.r).invert();
      const d = LL.data, o0 = r * 120;
      for (let k = 0; k < K.length; k++) {
        _zk.multiplyMatrices(_zi, M[K[k]]).multiply(this.Ginv[k]); const e = _zk.elements, o = o0 + k * 12;
        d[o] = e[0]; d[o + 1] = e[4]; d[o + 2] = e[8]; d[o + 3] = e[12]; d[o + 4] = e[1]; d[o + 5] = e[5]; d[o + 6] = e[9]; d[o + 7] = e[13]; d[o + 8] = e[2]; d[o + 9] = e[6]; d[o + 10] = e[10]; d[o + 11] = e[14];
      }
      z.inst = r;
      if (z.state !== 'dead') { if (z.helm && nh < 400) { this.helm.setMatrixAt(nh, M.head); this.helm.setColorAt(nh++, this._c.set(this.realGear ? (z.kind === 'pol' ? 0x6a7c9a : 0xffffff) : (z.kind === 'pol' ? 0x2a3442 : 0x55603e))); } if (z.vest && nv < 400) { this.vest.setMatrixAt(nv, M.torso); this.vest.setColorAt(nv++, this._c.set(this.realGear ? (z.kind === 'pol' ? 0x5a6a8a : 0xffffff) : (z.kind === 'pol' ? 0x2c3a52 : 0x6a6448))); } }
    }
    for (let li = 0; li < this.lods.length; li++) { const L = this.lods[li]; L.mesh.count = n[li]; L.mesh.visible = n[li] > 0; if (n[li]) { L.mesh.instanceMatrix.needsUpdate = true; L.tex.needsUpdate = true; } }
    for (const [m, k] of [[this.helm, nh], [this.vest, nv]]) { m.count = k; m.visible = k > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
}
export const ZHEAD = { c: ZBODY.headC, r: ZBODY.headR };
