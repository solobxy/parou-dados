// Ícones 3D dos objetos e retrato da personagem (desenhados uma vez numa tela à parte).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function makeIcons(DPR = 2) {
  // ---------- materiais e peças (as mesmas da cidade)
  const mats = new Map();
  // camuflados (capacete e colete): textura de manchas em vez de cor lisa
  const CAMO = { camo: ['#4b5a32', '#6e6b3e', '#3b3326', '#25271d'], urb: ['#8e9092', '#5f6265', '#b7b8b4', '#3c3e41'] }, camoT = {};
  const camoTex = k => { if (camoT[k]) return camoT[k]; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), P = CAMO[k]; x.fillStyle = P[0]; x.fillRect(0, 0, 128, 128); let s = 5; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < (k === 'urb' ? 160 : 34); i++) { x.fillStyle = P[1 + Math.floor(r() * 3)]; if (k === 'urb') { const q = 8; x.fillRect(Math.floor(r() * 16) * q, Math.floor(r() * 16) * q, q * (1 + Math.floor(r() * 3)), q * (1 + Math.floor(r() * 2))); } else { x.beginPath(); const cx = r() * 128, cy = r() * 128; for (let a = 0; a < 7; a++) { const t = a / 7 * Math.PI * 2, rr = 8 + r() * 14; x.lineTo(cx + Math.cos(t) * rr * 1.5, cy + Math.sin(t) * rr); } x.fill(); } }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return camoT[k] = t; };
  const M = (hex, o = {}) => { const k = [hex, o.r, o.m, o.e, o.ei, o.flat, o.tr, o.op].join('|'); if (!mats.has(k) && typeof hex === 'string') mats.set(k, new THREE.MeshStandardMaterial({ color: 0xffffff, map: camoTex(hex), roughness: o.r ?? 0.8 })); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: hex, flatShading: o.flat ?? false, roughness: o.r ?? 0.75, metalness: o.m ?? 0, emissive: o.e ?? 0, emissiveIntensity: o.ei ?? 1, transparent: !!o.tr, opacity: o.op ?? 1 })); return mats.get(k); };
  const shade = (hex, f) => { if (typeof hex === 'string') return hex; const c = new THREE.Color(hex); c.multiplyScalar(f); return c.getHex(); };
  const mesh = (geo, hex, o) => new THREE.Mesh(geo, M(hex, o));
  const B = (w, h, d, hex, o) => mesh(new THREE.BoxGeometry(w, h, d), hex, o);
  const RB = (w, h, d, r, hex, o) => mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2 - 0.0005)), hex, o);
  const Cy = (r1, r2, h, n, hex, o) => mesh(new THREE.CylinderGeometry(r1, r2, h, n), hex, o);
  const Sp = (r, hex, o) => mesh(new THREE.SphereGeometry(r, 20, 14), hex, o);
  const Ico = (r, hex, o) => mesh(new THREE.IcosahedronGeometry(r, 0), hex, { flat: true, ...o });
  const put = (obj, x, y, z, parent, ry = 0) => { obj.position.set(x, y, z); obj.rotation.y += ry; parent.add(obj); return obj; };
  const G = (x = 0, y = 0, z = 0, parent) => { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; };
  const X = m => { m.rotation.z = Math.PI / 2; return m; }; // cilindro deitado ao longo de x
  const BLK = 0x1c1e21, OLV = 0x535c3b, TAN = 0x8a7a55, WOOD = 0x7a5232;
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; const rr = (a, b) => a + (b - a) * rnd();

  const rifle = (o = {}) => {
    const g = new THREE.Group(), fur = o.fur ?? 0x7a6a4e;
    put(RB(0.07, 0.11, 0.5, 0.015, BLK, { m: 0.4, r: 0.5 }), 0, 0, 0.12, g);
    put(RB(0.08, 0.09, 0.34, 0.02, fur), 0, 0, 0.52, g);
    const br = Cy(0.016, 0.016, 0.3, 10, BLK); br.rotation.x = Math.PI / 2; put(br, 0, 0.005, 0.83, g);
    put(RB(0.06, 0.13, 0.3, 0.02, fur), 0, -0.02, -0.26, g);
    const mg = RB(0.05, 0.22, 0.09, 0.015, BLK); mg.rotation.x = 0.25; put(mg, 0, -0.14, 0.18, g);
    const gp = RB(0.045, 0.13, 0.06, 0.012, BLK); gp.rotation.x = -0.3; put(gp, 0, -0.1, -0.02, g);
    if (o.scope) { const s = Cy(0.035, 0.035, 0.24, 16, BLK, { m: 0.5, r: 0.35 }); s.rotation.x = Math.PI / 2; put(s, 0, 0.1, 0.12, g); const l = Cy(0.042, 0.035, 0.05, 16, BLK); l.rotation.x = Math.PI / 2; put(l, 0, 0.1, 0.26, g); for (const z of [0.04, 0.2]) put(B(0.03, 0.05, 0.03, BLK), 0, 0.06, z, g); }
    if (o.sup) { const s = Cy(0.03, 0.03, 0.22, 16, 0x2a2c2e, { m: 0.5, r: 0.4 }); s.rotation.x = Math.PI / 2; put(s, 0, 0.005, 1.08, g); }
    if (o.laser) put(RB(0.045, 0.045, 0.1, 0.012, 0x2c2f33), 0.055, -0.01, 0.6, g);
    return g;
  };
  const person = (o = {}) => {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const skin = o.skin ?? 0xd9a882, top = o.top ?? 0x5c6846, legs = o.legs ?? 0x3a3f33, shoes = o.shoes ?? 0x23211f, stride = o.stride ?? 0.08;
    for (const sx of [-1, 1]) {
      const leg = G(sx * 0.12, 0.92, 0, body); leg.rotation.x = sx * stride; leg.rotation.z = sx * 0.04;
      put(mesh(new THREE.CapsuleGeometry(0.1, 0.34, 6, 14), legs), 0, -0.23, 0, leg);
      put(B(0.2, 0.05, 0.12, shade(legs, 0.8)), sx * 0.02, -0.2, 0.06, leg); // bolso de perna
      const kn = G(0, -0.46, 0, leg);
      put(mesh(new THREE.CapsuleGeometry(0.088, 0.3, 6, 14), legs), 0, -0.2, 0, kn);
      put(mesh(new RoundedBoxGeometry(0.2, 0.14, 0.33, 3, 0.05), shoes), 0, -0.42, 0.05, kn);
    }
    const up = G(0, 0.92, 0, body); up.rotation.x = 0.03;
    put(RB(0.44, 0.2, 0.26, 0.07, legs), 0, 0.04, 0, up);
    put(RB(0.5, 0.56, 0.28, 0.1, top), 0, 0.38, 0, up);
    put(B(0.47, 0.06, 0.29, 0x2a2623), 0, 0.12, 0, up);
    put(Cy(0.07, 0.08, 0.1, 12, skin), 0, 0.7, 0, up);
    const head = G(0, 0.86, 0.01, up);
    const hd = Sp(0.15, skin); hd.scale.set(1, 1.12, 1.02); head.add(hd);
    for (const sx of [-1, 1]) put(B(0.035, 0.024, 0.012, 0x1a1a1a), sx * 0.055, 0.02, 0.152, head);
    if (o.hair != null && !o.helmet) { const hs = o.hairS ?? 0, hc = o.hair, stub = new THREE.Color(hc).lerp(new THREE.Color(skin), 0.55).getHex();
      const cap = mesh(new THREE.SphereGeometry(hs === 1 || hs === 4 ? 0.153 : 0.158, 22, 12, 0, Math.PI * 2, 0, Math.PI * (hs === 1 || hs === 4 ? 0.5 : 0.53)), hs === 1 || hs === 4 ? stub : hc, { r: 0.9 }); cap.position.set(0, 0.02, -0.012); head.add(cap);
      if (hs === 2) { put(RB(0.3, 0.28, 0.09, 0.04, hc, { r: 0.9 }), 0, -0.07, -0.12, head); for (const sx of [-1, 1]) put(RB(0.05, 0.22, 0.17, 0.02, hc, { r: 0.9 }), sx * 0.145, -0.03, -0.03, head); }
      if (hs === 3) { put(Sp(0.05, hc, { r: 0.9 }), 0, 0.02, -0.17, head); put(mesh(new THREE.CapsuleGeometry(0.035, 0.14, 6, 10), hc, { r: 0.9 }), 0, -0.09, -0.19, head); }
      if (hs === 4) put(RB(0.055, 0.075, 0.28, 0.025, hc, { r: 0.9 }), 0, 0.165, -0.015, head); }
    if (o.beard && o.beardS === 2) put(B(0.1, 0.022, 0.02, o.beard), 0, -0.035, 0.15, head);
    if (o.beard && (o.beardS ?? 1) === 1) { const bd = mesh(new THREE.SphereGeometry(0.152, 18, 10, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.62, Math.PI * 0.38), o.beard); bd.scale.set(1.02, 1.08, 1.06); head.add(bd); }
    if (o.helmet) { const hm = mesh(new THREE.SphereGeometry(0.19, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), o.helmet, { r: 0.6 }); hm.position.y = 0.02; head.add(hm); put(RB(0.09, 0.07, 0.05, 0.015, 0x2a2b2c), 0, 0.14, 0.17, head); for (const sx of [-1, 1]) put(RB(0.03, 0.09, 0.12, 0.01, shade(o.helmet, 0.8)), sx * 0.18, 0.05, 0.02, head); }
    if (o.mask) put(RB(0.25, 0.13, 0.1, 0.04, o.mask), 0, -0.06, 0.12, head);
    if (o.nvg) { put(RB(0.12, 0.05, 0.05, 0.012, 0x1e2022), 0, o.helmet ? 0.12 : 0.1, 0.17, head); for (const sx of [-1, 1]) put(mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.08, 14), 0x26292c), sx * 0.034, o.helmet ? 0.09 : 0.07, 0.22, head).rotation.x = Math.PI / 2; }
    const arm = (sx, ax, az, el) => { const sh = G(sx * 0.3, 0.6, 0, up); sh.rotation.set(ax, 0, az); put(Sp(0.095, o.sleeve ?? top), 0, 0, 0, sh); put(mesh(new THREE.CapsuleGeometry(0.075, 0.2, 6, 14), o.sleeve ?? top), 0, -0.15, 0, sh); const e = G(0, -0.3, 0, sh); e.rotation.x = el; put(mesh(new THREE.CapsuleGeometry(0.068, 0.2, 6, 14), o.sleeve ?? top), 0, -0.14, 0, e); put(Sp(0.07, o.glove ?? skin), 0, -0.3, 0, e); };
    const A = o.arms ?? [[0.05, 0.16, -0.12], [0.05, -0.16, -0.12]];
    arm(-1, ...A[0]); arm(1, ...A[1]);
    if (o.vest) { put(RB(0.55, 0.44, 0.37, 0.06, o.vest), 0, 0.4, 0, up); for (const sx of [-0.15, 0, 0.15]) put(RB(0.12, 0.16, 0.07, 0.02, shade(o.vest, 0.8)), sx, 0.3, 0.2, up); put(RB(0.07, 0.15, 0.05, 0.015, 0x2a2b2c), 0.2, 0.55, 0.19, up); put(B(0.2, 0.05, 0.02, 0x3a6a3a), -0.14, 0.56, 0.19, up); }
    if (o.pack) { put(RB(0.42, 0.52, 0.27, 0.08, o.pack), 0, 0.42, -0.28, up); put(RB(0.3, 0.2, 0.09, 0.03, shade(o.pack, 0.8)), 0, 0.3, -0.44, up); const roll = Cy(0.1, 0.1, 0.5, 14, o.roll ?? 0x6b7d5a); roll.rotation.z = Math.PI / 2; put(roll, 0, 0.74, -0.28, up); for (const sx of [-0.13, 0.13]) put(B(0.05, 0.46, 0.02, shade(o.pack, 0.7)), sx, 0.45, 0.16, up); }
    if (o.ghillie) { const GH = [0x4a5a2c, 0x5f6a34, 0x3c4a26, 0x6b6440, 0x2f3a1f]; let q = 9; const r = () => { q = (q * 16807) % 2147483647; return q / 2147483647; };
      for (let i = 0; i < 110; i++) { const a = r() * Math.PI * 2, y = r() * 0.78, m = Ico(0.05 + r() * 0.045, GH[i % 5], { r: 1 }); m.rotation.set(r() * 3, r() * 3, 0); put(m, Math.sin(a) * 0.27, y, Math.cos(a) * 0.18, up); }
      for (let i = 0; i < 34; i++) { const a = r() * Math.PI * 2, t = r() * 1.5, m = Ico(0.05 + r() * 0.03, GH[i % 5], { r: 1 }); put(m, Math.sin(a) * Math.sin(t) * 0.2, 0.88 + Math.cos(t) * 0.18, Math.cos(a) * Math.sin(t) * 0.2 - 0.02, up); }
      for (let i = 0; i < 50; i++) { const a = r() * Math.PI * 2, m = Ico(0.05 + r() * 0.04, GH[i % 5], { r: 1 }); put(m, Math.sin(a) * 0.2 + (i % 2 ? 0.12 : -0.12), 0.85 - r() * 0.85, Math.cos(a) * 0.11, body); } }
    if (o.slung) { const gm = rifle(o.slung); gm.rotation.set(0.2, 0, 2.35); gm.position.set(0.06, 0.42, -0.46); up.add(gm); }
    if (o.holster) { put(RB(0.08, 0.2, 0.06, 0.02, 0x2a2b2c), 0.27, -0.02, 0.04, up); }
    return root;
  };

  // ---------- objetos do inventário, desenhados em 3D
  const IT = {
    shotgun: () => { const g = new THREE.Group(); put(X(Cy(0.028, 0.028, 1.0, 14, BLK, { m: 0.5, r: 0.4 })), 0.15, 0.04, 0, g); put(X(Cy(0.024, 0.024, 0.85, 14, 0x2a2c2e, { m: 0.4 })), 0.08, -0.02, 0, g); put(RB(0.26, 0.08, 0.08, 0.025, WOOD), 0.2, -0.02, 0, g); put(RB(0.32, 0.13, 0.07, 0.02, BLK, { m: 0.35 }), -0.5, 0.01, 0, g); const st = RB(0.44, 0.12, 0.06, 0.03, WOOD); st.rotation.z = 0.1; put(st, -0.86, -0.03, 0, g); const gp = RB(0.06, 0.15, 0.06, 0.02, WOOD); gp.rotation.z = -0.45; put(gp, -0.66, -0.11, 0, g); put(B(0.08, 0.02, 0.02, BLK), -0.5, -0.09, 0, g); return g; },
    pistol: () => { const g = new THREE.Group(); put(RB(0.21, 0.05, 0.035, 0.012, 0x2a2c2e, { m: 0.55, r: 0.35 }), 0, 0.03, 0, g); put(RB(0.17, 0.03, 0.033, 0.01, BLK), -0.01, -0.005, 0, g); const gp = RB(0.05, 0.12, 0.036, 0.012, BLK); gp.rotation.z = -0.28; put(gp, -0.065, -0.07, 0, g); put(B(0.04, 0.008, 0.03, BLK), 0.0, -0.035, 0, g); return g; },
    rifle: () => { const g = rifle({ scope: true, sup: true, laser: true }); g.rotation.y = Math.PI / 2; const w = new THREE.Group(); w.add(g); return w; },
    katana: () => { const g = new THREE.Group(); put(RB(0.78, 0.05, 0.01, 0.004, 0xd6dade, { m: 0.95, r: 0.18 }), 0.27, 0, 0, g); put(B(0.66, 0.012, 0.011, 0x9aa0a6, { m: 0.9, r: 0.3 }), 0.25, -0.016, 0, g); put(X(Cy(0.045, 0.045, 0.012, 20, 0x3a3328, { m: 0.6 })), -0.13, 0, 0, g); put(X(Cy(0.02, 0.022, 0.26, 12, 0x2a2230)), -0.27, 0, 0, g); for (let i = 0; i < 6; i++) { const r = X(Cy(0.023, 0.023, 0.012, 12, 0xd9c9a3)); put(r, -0.38 + i * 0.045, 0, 0, g); } put(X(Cy(0.024, 0.024, 0.02, 12, 0x3a3328, { m: 0.6 })), -0.41, 0, 0, g); g.rotation.z = 0.08; return g; },
    scope: () => { const g = new THREE.Group(); put(X(Cy(0.032, 0.032, 0.2, 18, BLK, { m: 0.45, r: 0.35 })), 0, 0.06, 0, g); put(X(Cy(0.046, 0.034, 0.06, 18, BLK, { m: 0.45 })), 0.12, 0.06, 0, g); put(X(Cy(0.04, 0.032, 0.05, 18, BLK, { m: 0.45 })), -0.12, 0.06, 0, g); put(X(Cy(0.042, 0.042, 0.005, 18, 0x6a9ac8, { m: 0.3, r: 0.05, e: 0x2a4a6a, ei: 0.6 })), 0.152, 0.06, 0, g); put(Cy(0.016, 0.016, 0.03, 12, BLK), 0, 0.1, 0, g); for (const x of [-0.06, 0.06]) put(B(0.025, 0.05, 0.05, 0x2a2c2e, { m: 0.4 }), x, 0.02, 0, g); put(B(0.17, 0.012, 0.045, 0x2a2c2e), 0, -0.002, 0, g); return g; },
    fuel: () => { const g = new THREE.Group(); put(B(0.15, 0.2, 0.07, 0xb3261e, { r: 0.45 }), 0, 0, 0, g); put(B(0.07, 0.025, 0.03, 0x2a2b2c), -0.02, 0.115, 0, g); put(Cy(0.012, 0.012, 0.05, 8, 0x2a2b2c), 0.055, 0.12, 0, g); put(B(0.13, 0.006, 0.072, 0x8a1a14), 0, 0.04, 0, g); put(B(0.13, 0.006, 0.072, 0x8a1a14), 0, -0.04, 0, g); return g; },
    explo: () => { const g = new THREE.Group(); for (const [x, z] of [[-0.035, 0], [0.035, 0], [0, 0.03]]) put(Cy(0.032, 0.032, 0.2, 14, 0xa8322a, { r: 0.7 }), x, 0, z, g); put(B(0.12, 0.03, 0.08, 0x2a2b2c), 0, 0.02, 0.01, g); put(Cy(0.004, 0.004, 0.08, 6, 0xd8c8a0), 0, 0.13, 0, g); return g; },
    ingot: () => { const g = new THREE.Group(); for (const [x, y, z] of [[-0.07, 0, 0.02], [0.07, 0, -0.02], [0, 0.06, 0]]) put(RB(0.13, 0.05, 0.07, 0.012, 0x8d9298, { m: 0.8, r: 0.3 }), x, y, z, g); return g; },
    coal: () => { const g = new THREE.Group(); for (let i = 0; i < 6; i++) { const m = mesh(new THREE.DodecahedronGeometry(0.04 + Math.random() * 0.02, 0), 0x1c1a19, { r: 0.9 }); put(m, (Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.1, g); } return g; },
    powder: () => { const g = new THREE.Group(); put(Cy(0.06, 0.07, 0.13, 16, 0x6b5a3a, { r: 0.9 }), 0, 0, 0, g); put(Cy(0.062, 0.062, 0.02, 16, 0x2a2622), 0, 0.075, 0, g); put(B(0.08, 0.04, 0.002, 0xd8c8a0), 0, 0, 0.066, g); return g; },
    plan: () => { const g = new THREE.Group(); put(X(Cy(0.035, 0.035, 0.24, 14, 0x3a6aa8, { r: 0.8 })), 0, 0, 0, g); put(B(0.2, 0.12, 0.003, 0x4a7ab8, { r: 0.8 }), 0.02, -0.06, 0.03, g); put(B(0.16, 0.004, 0.004, 0xe8eef6), 0.02, -0.04, 0.032, g); put(B(0.004, 0.08, 0.004, 0xe8eef6), -0.02, -0.06, 0.032, g); return g; },
    hammer: () => { const g = new THREE.Group(); put(X(Cy(0.014, 0.017, 0.34, 10, 0x8a5a32, { r: 0.7 })), -0.03, 0, 0, g); put(RB(0.05, 0.13, 0.05, 0.008, 0x55595e, { m: 0.7, r: 0.35 }), 0.15, 0, 0, g); return g; },
    chest: () => { const g = new THREE.Group(); put(RB(0.24, 0.13, 0.15, 0.01, 0x8a6a48), 0, -0.03, 0, g); put(RB(0.25, 0.05, 0.16, 0.012, 0x7a5a3a), 0, 0.06, 0, g); for (const x of [-0.08, 0.08]) put(B(0.015, 0.2, 0.165, 0x3a3c3e, { m: 0.6 }), x, 0, 0, g); return g; },
    chestL: () => { const g = IT.chest(); g.scale.set(1.25, 1.15, 1.2); return g; },
    furnace: () => { const g = new THREE.Group(); put(RB(0.2, 0.22, 0.2, 0.02, 0x9a958c), 0, -0.02, 0, g); put(RB(0.14, 0.07, 0.14, 0.015, 0x8a857c), 0, 0.12, 0, g); put(B(0.1, 0.07, 0.01, 0x1a0e08, { e: 0xff6a1a, ei: 1.4 }), 0, -0.05, 0.101, g); put(Cy(0.025, 0.025, 0.1, 10, 0x3a3c3e, { m: 0.5 }), 0, 0.2, 0, g); return g; },
    bench1: () => { const g = new THREE.Group(); put(B(0.3, 0.025, 0.16, 0x8a6a48), 0, 0.06, 0, g); for (const x of [-0.13, 0.13]) for (const z of [-0.06, 0.06]) put(B(0.02, 0.16, 0.02, 0x7a5a3a), x, -0.03, z, g); put(B(0.07, 0.03, 0.05, 0x3a3c3e, { m: 0.6 }), -0.07, 0.085, 0, g); return g; },
    bench2: () => { const g = IT.bench1(); put(B(0.04, 0.08, 0.04, 0x3a3c3e, { m: 0.6 }), 0.09, 0.11, -0.03, g); return g; },
    bench3: () => { const g = IT.bench2(); put(B(0.3, 0.12, 0.012, 0x5f666b, { m: 0.6 }), 0, 0.13, -0.08, g); return g; },
    bed: () => { const g = new THREE.Group(); put(RB(0.32, 0.06, 0.16, 0.01, 0x8a6a48), 0, -0.03, 0, g); put(RB(0.3, 0.04, 0.15, 0.015, 0xd8d2c4, { r: 1 }), 0, 0.02, 0, g); put(RB(0.07, 0.03, 0.12, 0.012, 0xece6da, { r: 1 }), -0.11, 0.05, 0, g); put(RB(0.18, 0.025, 0.155, 0.01, 0x5a6a4a, { r: 1 }), 0.06, 0.04, 0, g); return g; },
    sbag: () => { const g = new THREE.Group(); put(Cy(0.07, 0.07, 0.3, 16, 0x5a7544, { r: 1 }), 0, 0, 0, g); for (const y of [-0.08, 0.08]) put(Cy(0.072, 0.072, 0.015, 16, 0x2a2b2c), 0, y, 0, g); return g; },
    reddot: () => { const g = new THREE.Group(); put(RB(0.16, 0.025, 0.06, 0.008, 0x2a2c2e, { m: 0.4 }), 0, 0, 0, g); put(RB(0.12, 0.08, 0.012, 0.01, BLK, { m: 0.4 }), 0.0, 0.05, 0.03, g); put(RB(0.12, 0.08, 0.012, 0.01, BLK, { m: 0.4 }), 0.0, 0.05, -0.03, g); put(RB(0.12, 0.014, 0.07, 0.006, BLK, { m: 0.4 }), 0, 0.09, 0, g); put(B(0.004, 0.06, 0.05, 0x8ab8d8, { m: 0.2, r: 0.05, e: 0x305a7a, ei: 0.5 }), 0.055, 0.05, 0, g); put(Cy(0.006, 0.006, 0.004, 10, 0xff3a2a, { e: 0xff2a1a, ei: 2 }), 0.058, 0.05, 0, g); put(B(0.03, 0.03, 0.03, 0x2a2c2e), -0.04, 0.04, 0.045, g); return g; },
    wlight: () => { const g = new THREE.Group(); put(X(Cy(0.024, 0.024, 0.14, 16, BLK, { m: 0.45, r: 0.35 })), 0, 0, 0, g); put(X(Cy(0.032, 0.026, 0.04, 16, BLK, { m: 0.45 })), 0.085, 0, 0, g); put(X(Cy(0.027, 0.027, 0.004, 16, 0xfff4d8, { e: 0xfff0c0, ei: 1.2 })), 0.106, 0, 0, g); put(B(0.08, 0.02, 0.03, 0x2a2c2e, { m: 0.4 }), 0, 0.03, 0, g); put(B(0.02, 0.012, 0.012, 0x8a8c8e), -0.04, -0.028, 0, g); return g; },
    sup: () => { const g = new THREE.Group(); put(X(Cy(0.032, 0.032, 0.22, 18, 0x2a2c2e, { m: 0.5, r: 0.4 })), 0, 0, 0, g); for (const x of [-0.08, -0.03, 0.02, 0.07]) put(X(Cy(0.0335, 0.0335, 0.008, 18, 0x17181a)), x, 0, 0, g); put(X(Cy(0.02, 0.026, 0.03, 18, BLK)), -0.125, 0, 0, g); return g; },
    mag: () => { const g = new THREE.Group(); put(RB(0.06, 0.11, 0.025, 0.008, BLK, { m: 0.3 }), 0, 0.05, 0, g); const b = RB(0.06, 0.1, 0.025, 0.008, BLK, { m: 0.3 }); b.rotation.z = 0.22; put(b, 0.012, -0.05, 0, g); put(X(Cy(0.008, 0.008, 0.03, 8, 0xc9a14a, { m: 0.8, r: 0.3 })), -0.01, 0.112, 0, g); return g; },
    pmag: () => { const g = new THREE.Group(); put(RB(0.035, 0.13, 0.02, 0.006, BLK, { m: 0.3 }), 0, 0, 0, g); put(RB(0.045, 0.015, 0.026, 0.004, 0x2a2c2e), 0, -0.07, 0, g); put(X(Cy(0.006, 0.006, 0.02, 8, 0xc9a14a, { m: 0.8, r: 0.3 })), 0, 0.068, 0, g); return g; },
    ammo: () => { const g = new THREE.Group(); put(RB(0.16, 0.08, 0.1, 0.012, OLV), 0, 0, 0, g); put(B(0.1, 0.03, 0.002, 0xd9cfae), 0, 0.005, 0.051, g); for (let i = 0; i < 5; i++) { put(Cy(0.007, 0.007, 0.05, 8, 0xc9a14a, { m: 0.85, r: 0.3 }), -0.05 + i * 0.025, 0.065, 0, g); put(mesh(new THREE.ConeGeometry(0.007, 0.018, 8), 0xb87333, { m: 0.85, r: 0.3 }), -0.05 + i * 0.025, 0.099, 0, g); } return g; },
    shells: () => { const g = new THREE.Group(); put(RB(0.15, 0.07, 0.1, 0.012, 0x8a2a22), 0, 0, 0, g); for (let i = 0; i < 4; i++) { put(Cy(0.012, 0.012, 0.05, 12, 0xc23a2e, { r: 0.5 }), -0.045 + i * 0.03, 0.06, 0, g); put(Cy(0.0125, 0.0125, 0.012, 12, 0xc9a14a, { m: 0.85 }), -0.045 + i * 0.03, 0.035, 0, g); } return g; },
    grenade: () => { const g = new THREE.Group(); const b = Sp(0.035, OLV, { r: 0.6 }); b.scale.set(1, 1.25, 1); g.add(b); put(Cy(0.014, 0.014, 0.02, 12, 0x6a6d70, { m: 0.6 }), 0, 0.05, 0, g); const l = RB(0.012, 0.06, 0.01, 0.004, 0x6a6d70, { m: 0.6 }); l.rotation.z = -0.15; put(l, 0.02, 0.03, 0, g); const ring = mesh(new THREE.TorusGeometry(0.013, 0.0025, 6, 16), 0xb9bcbe, { m: 0.8 }); put(ring, -0.02, 0.07, 0, g); return g; },
    codelock: () => { const g = new THREE.Group(); put(RB(0.12, 0.17, 0.05, 0.012, 0x2a2d30, { m: 0.5, r: 0.5 }), 0, 0, 0, g); put(B(0.09, 0.022, 0.004, 0x5a8f6a, { e: 0x5a8f6a, ei: 0.6 }), 0, 0.055, 0.026, g); for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) put(B(0.022, 0.016, 0.006, 0xb9bcbe, { m: 0.6 }), -0.028 + q * 0.028, 0.02 - r * 0.024, 0.027, g); put(X(Cy(0.012, 0.012, 0.03, 10, 0x8a8d90, { m: 0.8 })), 0, 0.1, 0, g); return g; },
    c4: () => { const g = new THREE.Group(); put(RB(0.26, 0.06, 0.14, 0.01, 0xb6a37a), 0, 0, 0, g); for (const x of [-0.07, 0.07]) put(B(0.03, 0.062, 0.142, 0x1d1f22), x, 0, 0, g); put(RB(0.06, 0.03, 0.05, 0.006, 0x2a2c2e), 0.02, 0.045, 0, g); put(B(0.012, 0.006, 0.012, 0xff2a1a, { e: 0xff2a1a, ei: 2 }), 0.035, 0.062, 0.012, g); for (const [hex, dz] of [[0xc23a2e, -0.01], [0x2a5aa8, 0.01]]) { const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0.0, 0.05, dz), new THREE.Vector3(-0.05, 0.08, dz), new THREE.Vector3(-0.1, 0.05, dz * 2), new THREE.Vector3(-0.11, 0.035, dz)]); put(mesh(new THREE.TubeGeometry(c, 12, 0.004, 6), hex), 0, 0, 0, g); } return g; },
    ration: () => { const g = new THREE.Group(); put(RB(0.2, 0.05, 0.28, 0.02, 0x6b5a3a, { r: 0.85 }), 0, 0, 0, g); put(B(0.14, 0.002, 0.1, 0xd9cfae), 0, 0.026, -0.03, g); put(B(0.2, 0.012, 0.02, 0x4a3e28), 0, 0.02, 0.13, g); return g; },
    medkit: () => { const g = new THREE.Group(); put(RB(0.3, 0.15, 0.22, 0.05, 0xc8322a, { r: 0.6 }), 0, 0, 0, g); put(B(0.12, 0.004, 0.035, 0xf2f2ee), 0, 0.076, 0, g); put(B(0.035, 0.004, 0.12, 0xf2f2ee), 0, 0.076, 0, g); put(mesh(new THREE.TorusGeometry(0.045, 0.01, 8, 16, Math.PI), 0x1d1f22), 0, 0.075, -0.08, g); put(B(0.3, 0.008, 0.008, 0x1d1f22), 0, 0.03, 0.111, g); return g; },
    bandage: () => { const g = new THREE.Group(); const r = Cy(0.04, 0.04, 0.06, 20, 0xf0ede4, { r: 0.95 }); r.rotation.x = Math.PI / 2; g.add(r); put(B(0.08, 0.004, 0.058, 0xf0ede4, { r: 0.95 }), 0.06, -0.038, 0, g); put(Cy(0.014, 0.014, 0.062, 12, 0xd9d4c6), 0, 0, 0, g).rotation.x = Math.PI / 2; return g; },
    water: () => { const g = new THREE.Group(); put(Cy(0.042, 0.042, 0.19, 20, 0x8ec5e8, { r: 0.08, m: 0.1, tr: true, op: 0.85 }), 0, 0, 0, g); put(Cy(0.038, 0.038, 0.12, 20, 0x3a8ac8, { r: 0.1 }), 0, -0.03, 0, g); put(Cy(0.043, 0.043, 0.05, 20, 0x2a6aa8), 0, 0.02, 0, g); put(Cy(0.02, 0.042, 0.04, 20, 0x8ec5e8, { r: 0.08, tr: true, op: 0.85 }), 0, 0.115, 0, g); put(Cy(0.018, 0.018, 0.025, 14, 0xf2f2ee), 0, 0.148, 0, g); return g; },
    can: () => { const g = new THREE.Group(); put(Cy(0.05, 0.05, 0.075, 22, 0xc6cacb, { m: 0.85, r: 0.3 }), 0, 0, 0, g); put(Cy(0.0505, 0.0505, 0.045, 22, 0x2a5aa8), 0, 0, 0, g); put(B(0.04, 0.02, 0.002, 0xf2c84a), 0, 0, 0.051, g); return g; },
    onigiri: () => { const g = new THREE.Group(); const s = new THREE.Shape(); const R = 0.06; s.moveTo(0, R); s.quadraticCurveTo(R * 0.25, R * 0.75, R * 0.85, -R * 0.45); s.quadraticCurveTo(R, -R * 0.75, R * 0.6, -R * 0.75); s.lineTo(-R * 0.6, -R * 0.75); s.quadraticCurveTo(-R, -R * 0.75, -R * 0.85, -R * 0.45); s.quadraticCurveTo(-R * 0.25, R * 0.75, 0, R); const geo = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3 }); geo.translate(0, 0, -0.0175); put(mesh(geo, 0xf4f1e8, { r: 0.9 }), 0, 0, 0, g); put(RB(0.052, 0.05, 0.062, 0.006, 0x1d2a1d, { r: 0.6 }), 0, -0.032, 0, g); return g; },
    drink: () => { const g = new THREE.Group(); put(Cy(0.03, 0.03, 0.14, 22, 0x1d1f22, { m: 0.6, r: 0.3 }), 0, 0, 0, g); put(Cy(0.0305, 0.0305, 0.05, 22, 0x6ad04a, { m: 0.3 }), 0, 0.01, 0, g); put(Cy(0.026, 0.03, 0.01, 22, 0xc6cacb, { m: 0.9, r: 0.25 }), 0, 0.075, 0, g); return g; },
    sulfur: () => { const g = new THREE.Group(); for (const [x, y, z, r] of [[0, 0, 0, 0.05], [0.055, -0.01, 0.02, 0.038], [-0.05, -0.012, 0.015, 0.035], [0.02, 0.035, -0.01, 0.03]]) { const m = Ico(r, 0xd9c14a, { r: 0.7 }); m.rotation.set(rr(0, 3), rr(0, 3), 0); put(m, x, y, z, g); } return g; },
    metal: () => { const g = new THREE.Group(); for (let i = 0; i < 6; i++) { const m = Ico(rr(0.02, 0.035), 0x8c9196, { m: 0.8, r: 0.35 }); m.scale.set(1.4, 0.5, 1); m.rotation.set(rr(0, 3), rr(0, 3), rr(0, 3)); put(m, rr(-0.05, 0.05), rr(-0.02, 0.02), rr(-0.03, 0.03), g); } return g; },
    wood: () => { const g = new THREE.Group(); for (const [x, y] of [[-0.03, -0.02], [0.03, -0.02], [0, 0.03]]) { put(Cy(0.028, 0.028, 0.16, 12, 0x6a4a2e), x, y, 0, g).rotation.x = Math.PI / 2; put(Cy(0.024, 0.024, 0.162, 12, 0xc9a877), x, y, 0, g).rotation.x = Math.PI / 2; } return g; },
    stone: () => { const g = new THREE.Group(); for (const [x, y, z, r] of [[0, 0, 0, 0.05], [0.055, -0.012, 0.01, 0.036], [-0.05, -0.014, 0.012, 0.034]]) { const m = Ico(r, 0x8f8d86, { r: 0.95 }); m.rotation.set(rr(0, 3), rr(0, 3), 0); put(m, x, y, z, g); } return g; },
    torch: () => { const g = new THREE.Group(); put(X(Cy(0.016, 0.016, 0.12, 14, BLK, { m: 0.4 })), 0, 0, 0, g); put(X(Cy(0.024, 0.017, 0.04, 14, BLK, { m: 0.4 })), 0.075, 0, 0, g); put(X(Cy(0.021, 0.021, 0.004, 14, 0xfff2c8, { e: 0xfff2c8, ei: 0.6 })), 0.096, 0, 0, g); put(B(0.012, 0.008, 0.012, 0x6a6d70), -0.01, 0.017, 0, g); return g; },
    helmet: (t = 0x5f6844) => { const g = new THREE.Group(), t2 = t === 0x5f6844 ? 0x4a5136 : shade(t, 0.78); put(mesh(new THREE.SphereGeometry(0.15, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), t, { r: 0.6 }), 0, 0, 0, g); put(mesh(new THREE.TorusGeometry(0.143, 0.008, 8, 30), t2), 0, 0.023, 0, g).rotation.x = Math.PI / 2; put(RB(0.07, 0.05, 0.04, 0.012, 0x2a2b2c), 0, 0.09, 0.13, g); for (const sx of [-1, 1]) put(RB(0.025, 0.07, 0.1, 0.01, t2), sx * 0.145, 0.04, 0, g); g.rotation.y = -0.5; return g; },
    mask: () => { const g = new THREE.Group(); const f = RB(0.17, 0.2, 0.09, 0.05, 0x2e3236, { r: 0.7 }); put(f, 0, 0, 0, g); for (const sx of [-1, 1]) { put(X(Cy(0.032, 0.032, 0.02, 20, 0x1a1c1e)), sx * 0.045, 0.04, 0.05, g).rotation.set(0, Math.PI / 2, 0); const l = Cy(0.026, 0.026, 0.012, 20, 0x5a7a8a, { m: 0.4, r: 0.1 }); l.rotation.x = Math.PI / 2; put(l, sx * 0.045, 0.04, 0.056, g); } const fl = Cy(0.035, 0.035, 0.05, 18, 0x4a4e52, { m: 0.3 }); fl.rotation.x = Math.PI / 2; put(fl, 0, -0.06, 0.07, g); for (let i = 0; i < 3; i++) { const r = Cy(0.036, 0.036, 0.005, 18, 0x2a2c2e); r.rotation.x = Math.PI / 2; put(r, 0, -0.06, 0.055 + i * 0.015, g); } g.rotation.y = -0.45; return g; },
    vest: (t = TAN) => { const g = new THREE.Group(); put(RB(0.36, 0.3, 0.1, 0.04, t), 0, 0, 0, g); for (const x of [-0.1, 0, 0.1]) put(RB(0.08, 0.11, 0.05, 0.015, shade(t, 0.8)), x, -0.06, 0.06, g); put(RB(0.05, 0.1, 0.04, 0.01, 0x2a2b2c), 0.13, 0.08, 0.06, g); for (const x of [-0.13, 0.13]) put(RB(0.07, 0.08, 0.06, 0.02, t), x, 0.17, -0.01, g); return g; },
    pack: () => { const g = new THREE.Group(); put(RB(0.3, 0.38, 0.18, 0.06, 0x7a5f3c), 0, 0, 0, g); put(RB(0.22, 0.14, 0.06, 0.025, 0x634c30), 0, -0.07, 0.1, g); put(X(Cy(0.07, 0.07, 0.34, 16, 0x8a4b36)), 0, 0.22, 0, g); for (const x of [-0.08, 0.08]) put(B(0.03, 0.14, 0.01, 0x4e3c24), x, 0.08, 0.095, g); g.rotation.y = 0.35; return g; },
    gloves: () => { const g = new THREE.Group(); for (const sx of [-1, 1]) { const h = G(sx * 0.055, 0, 0, g); h.rotation.z = sx * -0.18; put(RB(0.07, 0.075, 0.03, 0.012, 0x2c2c2a), 0, 0, 0, h); for (let i = 0; i < 4; i++) put(mesh(new THREE.CapsuleGeometry(0.008, 0.035, 4, 8), 0x2c2c2a), -0.024 + i * 0.016, 0.055, 0, h); const t = mesh(new THREE.CapsuleGeometry(0.009, 0.03, 4, 8), 0x2c2c2a); t.rotation.z = sx * 0.9; put(t, sx * 0.045, 0.01, 0, h); put(RB(0.075, 0.03, 0.034, 0.008, 0x4a4a46), 0, -0.045, 0, h); } return g; },
    boots: () => { const g = new THREE.Group(); for (const x of [-0.06, 0.06]) { put(RB(0.08, 0.12, 0.1, 0.02, 0x2b2622), x, 0.03, 0, g); put(RB(0.085, 0.04, 0.2, 0.015, 0x1d1a17), x, -0.04, 0.045, g); } g.rotation.y = -0.4; return g; },
  };

  // ---------- render de ícones com luz de estúdio
  const ir = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  ir.setPixelRatio(DPR); ir.toneMapping = THREE.ACESFilmicToneMapping; ir.outputColorSpace = THREE.SRGBColorSpace;
  const env = new THREE.PMREMGenerator(ir).fromScene(new RoomEnvironment(), 0.04).texture;
  const lights = () => { const k = new THREE.DirectionalLight(0xfff0dc, 2.6); k.position.set(-1.5, 2.5, 2.2); const r = new THREE.DirectionalLight(0xbcd4ff, 1.6); r.position.set(2, 1, -2); return [k, r, new THREE.HemisphereLight(0xdfe6ff, 0x3a332c, 0.7)]; };
  const iconOf = (key, w, h, view = 'side', pad = 0.84, tint) => {
    const W = w, H = h;
    ir.setSize(W, H, false);
    const sc = new THREE.Scene(); sc.environment = env; sc.environmentIntensity = 0.55; lights().forEach(l => sc.add(l));
    const obj = IT[key](tint); const wrap = new THREE.Group(); wrap.add(obj); sc.add(wrap);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    const el = view === 'iso' ? 0.55 : view === 'top' ? 1.1 : 0.22, az = view === 'iso' ? 0.55 : 0.12;
    cam.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
    wrap.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wrap), inv = cam.matrixWorldInverse;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) { const v = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = W / H; let hw = (x1 - x0) / 2 / pad, hh = (y1 - y0) / 2 / pad;
    if (hw / hh > a) hh = hw / a; else hw = hh * a;
    cam.left = cx - hw; cam.right = cx + hw; cam.top = cy + hh; cam.bottom = cy - hh; cam.updateProjectionMatrix();
    ir.render(sc, cam);
    return ir.domElement.toDataURL('image/png');
  };


  // ---------- ferramentas novas
  IT.pedra = () => { const g = new THREE.Group(); const m = Ico(0.07, 0x8f8d86, { r: 0.95 }); m.scale.set(1.2, 0.9, 1); m.rotation.set(0.4, 0.7, 0.2); g.add(m); return g; };
  IT.machado = () => { const g = new THREE.Group(); put(X(Cy(0.018, 0.02, 0.5, 10, WOOD)), 0, 0, 0, g); put(B(0.04, 0.05, 0.06, 0x6a4a2e), 0.2, 0, 0, g); const hd = Ico(0.06, 0x8f8d86, { r: 0.9 }); hd.scale.set(0.7, 1.5, 0.55); put(hd, 0.2, 0.06, 0, g); put(B(0.03, 0.1, 0.03, 0x4a3a2a), 0.2, 0.02, 0, g); g.rotation.z = -0.5; return g; };
  IT.picareta = () => { const g = new THREE.Group(); put(X(Cy(0.018, 0.02, 0.55, 10, WOOD)), 0, 0, 0, g); const hd = Cy(0.022, 0.012, 0.34, 6, 0x8f8d86, { flat: true }); hd.rotation.x = Math.PI / 2; put(hd, 0.25, 0, 0, g); put(B(0.05, 0.06, 0.07, 0x5a4a3a), 0.25, 0, 0, g); g.rotation.z = -0.5; g.rotation.y = 0.5; return g; };
  IT.lanca = () => { const g = new THREE.Group(); put(X(Cy(0.016, 0.018, 1.1, 8, 0x8a6a42)), 0, 0, 0, g); const tip = mesh(new THREE.ConeGeometry(0.03, 0.16, 6), 0x6a4a2e, { flat: true }); tip.rotation.z = -Math.PI / 2; put(tip, 0.62, 0, 0, g); for (let i = 0; i < 3; i++) put(X(Cy(0.02, 0.02, 0.012, 8, 0x3a2a1a)), 0.48 + i * 0.02, 0, 0, g); g.rotation.z = 0.1; return g; };

  IT.revolver = () => { const g = new THREE.Group(); put(X(Cy(0.014, 0.014, 0.17, 10, 0x2a2c2e, { m: 0.6, r: 0.3 })), 0.06, 0.035, 0, g); put(X(Cy(0.03, 0.03, 0.05, 6, 0x3a3c3e, { m: 0.6 })), -0.02, 0.02, 0, g); put(RB(0.07, 0.05, 0.032, 0.01, 0x2a2c2e, { m: 0.5 }), -0.05, 0.03, 0, g); const gp = RB(0.045, 0.11, 0.034, 0.012, 0x6a4a2e); gp.rotation.z = -0.35; put(gp, -0.09, -0.04, 0, g); return g; };
  IT.smg = () => { const g = new THREE.Group(); put(RB(0.34, 0.08, 0.06, 0.015, BLK, { m: 0.4 }), 0, 0, 0, g); put(X(Cy(0.014, 0.014, 0.14, 8, BLK)), 0.23, 0.01, 0, g); const mg = RB(0.04, 0.17, 0.04, 0.01, BLK); mg.rotation.z = 0.12; put(mg, 0.02, -0.12, 0, g); const gp = RB(0.045, 0.1, 0.045, 0.012, BLK); gp.rotation.z = -0.3; put(gp, -0.08, -0.08, 0, g); put(B(0.18, 0.025, 0.02, 0x3a3c3e), -0.25, 0.0, 0, g); put(B(0.02, 0.07, 0.02, 0x3a3c3e), -0.33, -0.03, 0, g); return g; };
  IT.ak = () => { const g = new THREE.Group(); put(RB(0.5, 0.09, 0.06, 0.015, 0x3a3c3e, { m: 0.4 }), 0, 0, 0, g); put(RB(0.22, 0.06, 0.065, 0.015, 0x8a5a32), 0.32, -0.005, 0, g); put(X(Cy(0.012, 0.012, 0.3, 8, BLK)), 0.55, 0.01, 0, g); const mg = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.024, 6, 12, 1.0), M(0x3a3c3e, { m: 0.4 })); mg.rotation.z = -2.3; put(mg, 0.15, -0.06, 0, g); const st = RB(0.3, 0.08, 0.05, 0.02, 0x8a5a32); st.rotation.z = 0.12; put(st, -0.38, -0.03, 0, g); const gp = RB(0.045, 0.1, 0.045, 0.012, 0x8a5a32); gp.rotation.z = -0.3; put(gp, -0.17, -0.08, 0, g); return g; };
  IT.hunting = () => { const g = new THREE.Group(); put(X(Cy(0.016, 0.016, 0.62, 10, BLK, { m: 0.5 })), 0.2, 0.03, 0, g); put(RB(0.6, 0.07, 0.055, 0.025, 0x7a4a2a), 0.02, -0.005, 0, g); const st = RB(0.32, 0.12, 0.05, 0.03, 0x7a4a2a); st.rotation.z = 0.1; put(st, -0.42, -0.03, 0, g); put(X(Cy(0.025, 0.025, 0.24, 12, BLK, { m: 0.5 })), 0.0, 0.1, 0, g); put(B(0.02, 0.04, 0.02, BLK), -0.08, 0.07, 0, g); return g; };
  IT.ammo3 = () => { const g = new THREE.Group(); put(RB(0.16, 0.08, 0.1, 0.012, 0x6a3a2a), 0, 0, 0, g); put(B(0.1, 0.03, 0.002, 0xd9cfae), 0, 0.005, 0.051, g); for (let i = 0; i < 5; i++) { put(Cy(0.0075, 0.0075, 0.075, 8, 0xb89a4a, { m: 0.85, r: 0.3 }), -0.05 + i * 0.025, 0.077, 0, g); put(mesh(new THREE.ConeGeometry(0.0075, 0.024, 8), 0x9a6a3a, { m: 0.85, r: 0.3 }), -0.05 + i * 0.025, 0.126, 0, g); } return g; };
  const box = (col, cart, n, len, tip, sph) => () => { const g = new THREE.Group(); put(RB(0.16, 0.08, 0.1, 0.012, col), 0, 0, 0, g); put(B(0.1, 0.03, 0.002, 0xd9cfae), 0, 0.005, 0.051, g); for (let i = 0; i < n; i++) { const x = -0.05 + i * (0.1 / (n - 1)); put(Cy(0.0075, 0.0075, len, 8, cart, { m: 0.85, r: 0.3 }), x, 0.04 + len / 2, 0, g); if (sph) put(Sp(0.0078, tip, { m: 0.6 }), x, 0.04 + len, 0, g); else put(mesh(new THREE.ConeGeometry(0.0075, 0.022, 8), tip, { m: 0.85, r: 0.3 }), x, 0.051 + len, 0, g); } return g; };
  IT.ammoS = box(0x2f4a3a, 0xc9a14a, 5, 0.05, 0x5a5048, true);
  IT.ammo308 = box(0x4a4038, 0xb89a4a, 4, 0.09, 0xb87333, false);
  IT.slug = () => { const g = new THREE.Group(); put(RB(0.15, 0.07, 0.1, 0.012, 0x2a4a7a), 0, 0, 0, g); for (let i = 0; i < 4; i++) { put(Cy(0.012, 0.012, 0.05, 12, 0x2f6ac2, { r: 0.5 }), -0.045 + i * 0.03, 0.06, 0, g); put(Cy(0.0125, 0.0125, 0.012, 12, 0xc9a14a, { m: 0.85 }), -0.045 + i * 0.03, 0.035, 0, g); put(Sp(0.009, 0x8a8e92, { m: 0.7 }), -0.045 + i * 0.03, 0.088, 0, g); } return g; };
  IT.supR = () => { const g = new THREE.Group(); put(X(Cy(0.04, 0.04, 0.3, 18, 0x3a3e36, { m: 0.45, r: 0.45 })), 0, 0, 0, g); for (const x of [-0.11, -0.04, 0.03, 0.1]) put(X(Cy(0.0415, 0.0415, 0.01, 18, 0x17181a)), x, 0, 0, g); put(X(Cy(0.024, 0.032, 0.04, 18, BLK)), -0.17, 0, 0, g); return g; };
  IT.scope8 = () => { const g = IT.scope(); g.scale.set(1.25, 1.1, 1.1); return g; };
  IT.ammo4 = () => { const g = new THREE.Group(); put(RB(0.14, 0.07, 0.09, 0.012, 0x2a3a6a), 0, 0, 0, g); put(B(0.09, 0.025, 0.002, 0xd9cfae), 0, 0.005, 0.046, g); for (let i = 0; i < 4; i++) { put(Cy(0.009, 0.009, 0.04, 8, 0xc9a14a, { m: 0.85, r: 0.3 }), -0.04 + i * 0.027, 0.055, 0, g); put(Sp(0.009, 0x9a7a6a, { m: 0.6 }), -0.04 + i * 0.027, 0.077, 0, g); } return g; };
  IT.faca = () => { const g = new THREE.Group(); put(RB(0.2, 0.035, 0.008, 0.004, 0xd6dade, { m: 0.9, r: 0.2 }), 0.08, 0, 0, g); put(RB(0.11, 0.03, 0.022, 0.01, 0x2a2a2a), -0.08, -0.002, 0, g); g.rotation.z = 0.3; return g; };
  IT.bastao = () => { const g = new THREE.Group(); put(X(Cy(0.035, 0.016, 0.72, 14, 0xc9a877, { r: 0.6 })), 0, 0, 0, g); put(X(Cy(0.02, 0.02, 0.03, 10, 0x2a2a2a)), -0.36, 0, 0, g); for (let i = 0; i < 3; i++) put(X(Cy(0.019, 0.019, 0.02, 10, 0x2a2a2a)), -0.32 + i * 0.03, 0, 0, g); g.rotation.z = 0.25; return g; };
  IT.pecabra = () => { const g = new THREE.Group(); put(X(Cy(0.012, 0.012, 0.42, 8, 0xb8322a, { m: 0.6, r: 0.4 })), 0, 0, 0, g); const h = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 10, Math.PI * 1.2), M(0xb8322a, { m: 0.6 })); put(h, 0.22, 0.03, 0, g); put(B(0.04, 0.012, 0.02, 0x8a8e92, { m: 0.8 }), -0.22, -0.01, 0, g); g.rotation.z = 0.4; return g; };
  IT.machete = () => { const g = new THREE.Group(); put(RB(0.38, 0.06, 0.008, 0.005, 0xb8bcc0, { m: 0.9, r: 0.25 }), 0.12, 0.005, 0, g); put(RB(0.13, 0.035, 0.024, 0.01, 0x2a2a2a), -0.13, 0, 0, g); g.rotation.z = 0.35; return g; };
  IT.can2 = () => { const g = new THREE.Group(); put(RB(0.13, 0.03, 0.08, 0.02, 0xc6cacb, { m: 0.85, r: 0.3 }), 0, 0, 0, g); put(B(0.1, 0.002, 0.06, 0x2a7aa8), 0, 0.016, 0, g); put(mesh(new THREE.TorusGeometry(0.012, 0.003, 5, 10), 0x9a9ea2, { m: 0.8 }), 0.045, 0.018, 0, g).rotation.x = Math.PI / 2; return g; };
  IT.ramen = () => { const g = new THREE.Group(); put(Cy(0.055, 0.04, 0.09, 18, 0xf2efe6, { r: 0.7 }), 0, 0, 0, g); put(Cy(0.0555, 0.05, 0.03, 18, 0xd8322a), 0, 0.012, 0, g); put(Cy(0.057, 0.057, 0.006, 18, 0xe8e2c8, { m: 0.5 }), 0, 0.047, 0, g); return g; };
  IT.chocolate = () => { const g = new THREE.Group(); put(RB(0.15, 0.015, 0.07, 0.005, 0x5a3220), 0, 0, 0, g); put(B(0.09, 0.017, 0.072, 0x7a2a8a), -0.03, 0, 0, g); put(B(0.04, 0.018, 0.073, 0xe8c84a), 0.0, 0, 0, g); return g; };
  IT.maca = () => { const g = new THREE.Group(); const a = Sp(0.045, 0xc8322a, { r: 0.4 }); a.scale.set(1, 0.9, 1); g.add(a); put(Cy(0.004, 0.004, 0.025, 6, 0x5a3a20), 0, 0.045, 0, g); const l = mesh(new THREE.SphereGeometry(0.014, 8, 6), 0x4a8a32); l.scale.set(1.4, 0.3, 0.8); put(l, 0.015, 0.052, 0, g); return g; };
  IT.sumo = () => { const g = new THREE.Group(); put(RB(0.06, 0.1, 0.04, 0.006, 0xf2a03a), 0, 0, 0, g); put(B(0.061, 0.03, 0.041, 0xffffff), 0, 0.02, 0, g); put(Cy(0.003, 0.003, 0.05, 6, 0xffffff), 0.015, 0.07, 0, g).rotation.z = -0.2; return g; };
  IT.cafe = () => { const g = new THREE.Group(); put(Cy(0.028, 0.028, 0.1, 18, 0x6a4a32, { m: 0.6, r: 0.35 }), 0, 0, 0, g); put(Cy(0.0285, 0.0285, 0.03, 18, 0xe8e2d4), 0, 0.02, 0, g); put(Cy(0.024, 0.028, 0.008, 18, 0xc6cacb, { m: 0.9 }), 0, 0.053, 0, g); return g; };
  IT.m4 = IT.rifle;
  // armas pesadas
  const bolt = (o) => { const g = new THREE.Group(), c = o.col; put(RB(0.62, 0.085, 0.06, 0.015, c, { m: 0.35, r: 0.5 }), 0, 0, 0, g); put(X(Cy(o.br, o.br, o.blen, 12, BLK, { m: 0.5 })), 0.31 + o.blen / 2, 0.012, 0, g);
    put(X(Cy(o.br * 1.9, o.br * 1.9, 0.09, 12, BLK, { m: 0.5 })), 0.31 + o.blen + 0.04, 0.012, 0, g); for (const z of [-1, 1]) put(B(0.06, 0.02, 0.012, BLK), 0.31 + o.blen + 0.04, 0.012, z * 0.022, g);
    const st = RB(0.34, 0.11, 0.05, 0.02, c); st.rotation.z = 0.06; put(st, -0.46, -0.02, 0, g); put(RB(0.05, 0.12, 0.045, 0.012, c), -0.15, -0.09, 0, g).rotation.z = -0.3;
    put(X(Cy(0.032, 0.032, 0.34, 16, BLK, { m: 0.5, r: 0.35 })), -0.02, 0.1, 0, g); put(X(Cy(0.044, 0.034, 0.06, 16, BLK)), 0.16, 0.1, 0, g); put(X(Cy(0.04, 0.034, 0.05, 16, BLK)), -0.2, 0.1, 0, g); for (const x of [-0.08, 0.06]) put(B(0.03, 0.05, 0.03, BLK), x, 0.055, 0, g);
    put(RB(0.07, 0.1, 0.05, 0.012, BLK), o.magx, -0.09, 0, g); for (const s of [-1, 1]) { const l = Cy(0.007, 0.007, 0.2, 6, BLK); l.rotation.z = s * 0.5 + Math.PI; put(l, 0.36 + s * 0.04, -0.12, 0, g); } return g; };
  IT.cheytac = () => bolt({ col: 0x6b6450, br: 0.017, blen: 0.42, magx: -0.05 });
  IT.barrett = () => { const g = bolt({ col: 0x2b2d30, br: 0.024, blen: 0.4, magx: 0.0 }); put(RB(0.12, 0.13, 0.055, 0.012, BLK), 0.0, -0.11, 0, g); g.scale.setScalar(1.05); return g; };
  const lmg = (c, box) => { const g = new THREE.Group(); put(RB(0.54, 0.1, 0.07, 0.015, c, { m: 0.4 }), 0, 0, 0, g); put(X(Cy(0.016, 0.016, 0.42, 10, BLK, { m: 0.5 })), 0.47, 0.01, 0, g); put(X(Cy(0.03, 0.03, 0.2, 12, 0x2b2d30)), 0.37, 0.01, 0, g);
    put(B(0.03, 0.03, 0.03, BLK), 0.44, 0.07, 0, g); const st = RB(0.3, 0.1, 0.05, 0.02, c); st.rotation.z = 0.1; put(st, -0.4, -0.03, 0, g); put(RB(0.045, 0.1, 0.045, 0.012, c), -0.18, -0.08, 0, g).rotation.z = -0.3;
    put(RB(0.13, 0.13, 0.1, 0.015, box, { r: 0.8 }), 0.04, -0.12, 0.02, g); put(B(0.05, 0.03, 0.01, 0xc9a14a, { m: 0.8, r: 0.3 }), 0.1, -0.04, 0.045, g); put(X(Cy(0.012, 0.012, 0.1, 8, 0x3a3c3e)), -0.02, 0.09, 0, g);
    for (const s of [-1, 1]) { const l = Cy(0.007, 0.007, 0.2, 6, BLK); l.rotation.z = s * 0.5 + Math.PI; put(l, 0.5 + s * 0.04, -0.1, 0, g); } return g; };
  IT.m249 = () => lmg(0x2b2d30, 0x4b5a32);
  IT.pkm = () => { const g = lmg(0x3a3c3e, 0x3a3c3e); put(RB(0.22, 0.07, 0.055, 0.015, 0x8a5a32), -0.42, -0.03, 0, g); return g; };
  IT.ammo408 = box(0x2f3a4a, 0xc9a14a, 3, 0.12, 0xb87333, false);
  IT.ammo50 = box(0x3a3226, 0xc9a14a, 3, 0.13, 0x2a2b2c, false);
  IT.boxmag = () => { const g = new THREE.Group(); put(RB(0.2, 0.14, 0.12, 0.015, 0x4b5a32, { r: 0.8 }), 0, 0, 0, g); put(B(0.12, 0.04, 0.002, 0xd9cfae), 0, 0.01, 0.061, g); for (let i = 0; i < 5; i++) { put(Cy(0.007, 0.007, 0.05, 8, 0xc9a14a, { m: 0.85, r: 0.3 }), 0.115 + i * 0.006, -0.02 - i * 0.022, 0.02, g).rotation.z = Math.PI / 2 - 0.3; } return g; };
  IT.nvg = () => { const g = new THREE.Group(); put(RB(0.16, 0.06, 0.07, 0.015, 0x1e2022, { r: 0.6 }), 0, 0.03, 0, g); for (const s of [-1, 1]) { put(mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.12, 20), 0x26292c, { r: 0.5 }), s * 0.045, 0, 0.07, g).rotation.x = Math.PI / 2; put(mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.006, 20), 0x3c8a56, { m: 0.2, r: 0.1, e: 0x2a6a3e, ei: 0.5 }), s * 0.045, 0, 0.132, g).rotation.x = Math.PI / 2; } put(B(0.05, 0.08, 0.03, 0x2a2b2c), 0, 0.09, -0.01, g); g.rotation.y = -0.6; return g; };
  IT.ghillie = () => { const g = new THREE.Group(); const GH = [0x4a5a2c, 0x5f6a34, 0x3c4a26, 0x6b6440, 0x2f3a1f]; let s = 3; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 90; i++) { const y = r() * 0.6 - 0.3, w = 0.1 + 0.04 * Math.cos(y * 4) + (y < -0.1 ? 0.03 : 0), x = (r() - 0.5) * 2 * w, z = (r() - 0.5) * 0.12, m = Ico(0.025 + r() * 0.03, GH[i % 5], { r: 1 }); m.rotation.set(r() * 3, r() * 3, 0); put(m, x, y, z, g); }
    for (let i = 0; i < 30; i++) { const m = B(0.01, 0.1 + r() * 0.08, 0.006, GH[(i + 2) % 5], { r: 1 }); m.rotation.z = (r() - 0.5) * 0.8; put(m, (r() - 0.5) * 0.26, -0.28 - r() * 0.05, (r() - 0.5) * 0.1, g); } return g; };
  IT.ammo2 = () => { const g = new THREE.Group(); put(RB(0.16, 0.08, 0.1, 0.012, 0x8a7a55), 0, 0, 0, g); put(B(0.1, 0.03, 0.002, 0x2a2b2c), 0, 0.005, 0.051, g); for (let i = 0; i < 5; i++) { put(Cy(0.006, 0.006, 0.07, 8, 0xc9a14a, { m: 0.85, r: 0.3 }), -0.05 + i * 0.025, 0.075, 0, g); put(mesh(new THREE.ConeGeometry(0.006, 0.022, 8), 0xb87333, { m: 0.85, r: 0.3 }), -0.05 + i * 0.025, 0.121, 0, g); } return g; };
  IT.saco = () => { const g = new THREE.Group(); const s = Sp(0.12, 0x5a4a32, { r: 0.95 }); s.scale.set(1.1, 0.8, 0.9); g.add(s); put(Cy(0.03, 0.05, 0.06, 10, 0x4a3a28), 0, 0.1, 0, g); return g; };
  const PCOL = { skin: 0xd9a882, top: 0x5c6846, legs: 0x3a3f33 };
  let LOOK = {}; const setLook = l => { LOOK = l || {}; };
  const portrait = (eq, W, H, look) => { const L = look || LOOK;
    ir.setSize(W, H, false);
    const sc = new THREE.Scene(); sc.environment = env; sc.environmentIntensity = 0.55; lights().forEach(l => sc.add(l));
    const p = person({ beard: 0x6a4a32, helmet: eq.head ? (eq.head === true ? 0x5f6844 : eq.head) : null, vest: eq.vest ? (eq.vest === true ? TAN : eq.vest) : null, nvg: !!eq.eyes, ghillie: !!eq.suit, pack: eq.back ? 0x7a5f3c : null, slung: eq.rifle ? {} : null, ...PCOL, hair: 0x2a211b, ...L, beard: L.beardS === 0 ? null : (L.hair ?? 0x2a211b) === 0x2a211b ? 0x6a4a32 : L.hair, arms: [[0.05, 0.12, -0.1], [0.05, -0.12, -0.1]] });
    p.rotation.y = -0.45; sc.add(p);
    const cam = new THREE.PerspectiveCamera(24, W / H, 0.1, 20); cam.position.set(0, 1.2, 5.4); cam.lookAt(0, 0.98, 0);
    ir.render(sc, cam); return ir.domElement.toDataURL('image/png');
  };
  return { IT, iconOf, portrait, setLook, dispose: () => { ir.dispose(); } };
}
