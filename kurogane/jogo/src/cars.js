// Carros: conduzir (com gasolina e estragos), levar passageiros, atropelar zombies. Online, quem conduz simula o carro
// e manda a posição; os outros veem-no a andar. Parados ficam onde os deixaram (para todos).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { track, push, sample } from './interp.js';
import { VT, vt, pickVT, HELIPADS } from './vtypes.js';

const MAXR = 5, BRK = 14, USE = 0.012; // marcha-atrás (m/s), travão (m/s²), litros por metro; o resto vem do tipo (vtypes.js)
const COLS = [0x8a2a22, 0x2a5a8a, 0xd8d6d0, 0x3a3d40, 0x4a5a3a, 0xc8a23a];
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function makeCars({ scene, G, W, collide, solidAt, tallAt = () => 0, groundY, addRect, removeRect, audio, hurtZombie, sameLevel }) {
  const list = [], byId = new Map();
  const M = (hex, o = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: o.r ?? 0.55, metalness: o.m ?? 0.25, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 0 });
  const glass = M(0x1c242a, { r: 0.15, m: 0.6 }), tyre = M(0x1b1b1c, { r: 0.9, m: 0 }), rim = M(0x8a8e92, { r: 0.4, m: 0.7 }), lamp = M(0xfff4d8, { e: 0xfff1c8, ei: 0.2, r: 0.3 }), tail = M(0x7a1410, { e: 0xc02010, ei: 0.3 }), dark = M(0x26282a, { r: 0.8 });
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16); wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 10); rimGeo.rotateZ(Math.PI / 2);
  // caixas com as arestas boleadas (carroçarias, cabines, para-choques); as finas (vidros, faróis, frisos) ficam direitas
  const GC = new Map(), bgeo = (w, h, d) => { const k = w + ',' + h + ',' + d; let q = GC.get(k); if (!q) { const mn = Math.min(w, h, d); q = mn >= 0.14 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(0.08, mn * 0.22)) : new THREE.BoxGeometry(w, h, d); GC.set(k, q); } return q; };
  const box = (w, h, d, m, x, y, z, g) => { const o = new THREE.Mesh(bgeo(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  const olive = M(0x535c3b, { r: 0.7, m: 0.2 }), chrome = M(0x9aa0a4, { r: 0.3, m: 0.8 }), seatM = M(0x2a2420, { r: 0.9, m: 0 }), skin = M(0xd9a882, { r: 0.8, m: 0 }), cloth = M(0x4a5048, { r: 0.9, m: 0 });
  const wheel = (g, wheels, x, y, z, r, w = 0.24) => { const q = new THREE.Group(); q.position.set(x, y, z); const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2), tyre); t.castShadow = true; q.add(t); q.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.58, r * 0.58, w + 0.02, 10).rotateZ(Math.PI / 2), rim)); g.add(q); wheels.push(q); };
  const lights = (g, wid, len, y) => { for (const sx of [-1, 1]) { box(0.34, 0.14, 0.05, g.userData.lm, sx * (wid / 2 - 0.28), y, len / 2 + 0.01, g); box(0.32, 0.14, 0.05, g.userData.tm, sx * (wid / 2 - 0.26), y + 0.02, -len / 2 - 0.01, g); } };
  // um modelo por tipo, feito de caixas e cilindros (leve), virado para +z
  const mkMesh = (k, col) => {
    const T = vt(k), g = new THREE.Group(), body = M(k === 'humvee' ? 0x535c3b : col), wheels = [], L = T.len, Wd = T.wid, lampM = lamp.clone(), tailM = tail.clone(); g.userData.lm = lampM; g.userData.tm = tailM; // luzes de cada um (acendem só no que tem condutor)
    if (k === 'sport') { box(Wd, 0.48, L, body, 0, 0.5, 0, g); box(1.7, 0.4, 1.75, body, 0, 0.93, -0.35, g); box(1.62, 0.36, 0.05, glass, 0, 0.95, 0.53, g).rotation.x = -0.75; box(1.62, 0.3, 0.05, glass, 0, 0.95, -1.22, g).rotation.x = 0.7; for (const sx of [-1, 1]) box(0.04, 0.3, 1.4, glass, sx * 0.86, 0.95, -0.35, g); box(1.7, 0.06, 0.4, dark, 0, 1.0, -1.95, g); for (const sx of [-0.7, 0.7]) box(0.06, 0.28, 0.06, dark, sx, 0.84, -1.95, g); box(Wd + 0.02, 0.12, 0.1, dark, 0, 0.32, L / 2, g); lights(g, Wd, L, 0.58); for (const [x, z] of [[-0.88, 1.35], [0.88, 1.35], [-0.88, -1.35], [0.88, -1.35]]) wheel(g, wheels, x, 0.33, z, 0.33, 0.28); }
    else if (k === 'coupe') { box(Wd, 0.58, L, body, 0, 0.6, 0, g); box(1.64, 0.5, 1.9, body, 0, 1.14, -0.3, g); box(1.6, 0.46, 0.05, glass, 0, 1.14, 0.62, g).rotation.x = -0.6; box(1.6, 0.42, 0.05, glass, 0, 1.12, -1.25, g).rotation.x = 0.55; for (const sx of [-1, 1]) box(0.04, 0.36, 1.5, glass, sx * 0.83, 1.16, -0.3, g); box(Wd + 0.02, 0.16, 0.12, dark, 0, 0.42, L / 2, g); box(Wd + 0.02, 0.16, 0.12, dark, 0, 0.42, -L / 2, g); lights(g, Wd, L, 0.7); for (const [x, z] of [[-0.86, 1.3], [0.86, 1.3], [-0.86, -1.3], [0.86, -1.3]]) wheel(g, wheels, x, 0.34, z, 0.34); }
    else if (k === 'suv') { box(Wd, 0.9, L, body, 0, 0.88, 0, g); box(1.88, 0.72, 3.0, body, 0, 1.68, -0.45, g); box(1.8, 0.6, 0.05, glass, 0, 1.68, 1.06, g).rotation.x = -0.3; box(1.8, 0.58, 0.05, glass, 0, 1.68, -1.96, g); for (const sx of [-1, 1]) { box(0.04, 0.5, 2.7, glass, sx * 0.95, 1.7, -0.45, g); box(0.06, 0.06, 2.6, chrome, sx * 0.75, 2.08, -0.45, g); } box(Wd + 0.04, 0.24, 0.16, dark, 0, 0.55, L / 2, g); box(Wd + 0.04, 0.24, 0.16, dark, 0, 0.55, -L / 2, g); lights(g, Wd, L, 1.05); for (const [x, z] of [[-0.9, 1.5], [0.9, 1.5], [-0.9, -1.45], [0.9, -1.45]]) wheel(g, wheels, x, 0.42, z, 0.42, 0.3); }
    else if (k === 'van') { box(Wd, 1.9, L, body, 0, 1.3, -0.1, g); box(1.9, 0.75, 0.05, glass, 0, 1.75, L / 2 - 0.08, g).rotation.x = -0.25; for (const sx of [-1, 1]) box(0.04, 0.55, 3.6, glass, sx * 1.01, 1.8, -0.2, g); box(Wd + 0.04, 0.22, 0.14, dark, 0, 0.5, L / 2, g); box(Wd + 0.04, 0.22, 0.14, dark, 0, 0.5, -L / 2 - 0.1, g); lights(g, Wd, L, 0.95); for (const [x, z] of [[-0.92, 1.7], [0.92, 1.7], [-0.92, -1.6], [0.92, -1.6]]) wheel(g, wheels, x, 0.38, z, 0.38, 0.28); }
    else if (k === 'jeep') { box(Wd, 0.72, L, body, 0, 0.82, 0, g); box(1.7, 0.08, 1.9, seatM, 0, 1.2, -0.45, g); box(1.8, 0.5, 0.06, chrome, 0, 1.45, 0.55, g); box(1.7, 0.42, 0.04, glass, 0, 1.45, 0.58, g); for (const sx of [-1, 1]) { box(0.07, 1.0, 0.07, chrome, sx * 0.85, 1.7, -0.9, g); } box(1.77, 0.07, 0.07, chrome, 0, 2.2, -0.9, g); wheel(g, wheels, 0, 1.15, -L / 2 - 0.15, 0.4, 0.26); wheels.pop(); box(Wd + 0.06, 0.22, 0.16, dark, 0, 0.6, L / 2, g); lights(g, Wd, L, 1.0); for (const [x, z] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.25], [0.9, -1.25]]) wheel(g, wheels, x, 0.42, z, 0.42, 0.32); }
    else if (k === 'humvee') { box(Wd, 0.95, L, body, 0, 0.95, 0, g); box(2.1, 0.8, 2.6, body, 0, 1.8, -0.4, g); box(1.9, 0.32, 0.05, glass, 0, 1.92, 0.91, g); box(1.9, 0.3, 0.05, glass, 0, 1.9, -1.71, g); for (const sx of [-1, 1]) box(0.04, 0.3, 2.0, glass, sx * 1.06, 1.92, -0.4, g); box(1.0, 0.3, 1.0, olive, 0, 2.35, -0.6, g); box(0.1, 0.1, 1.3, dark, 0, 2.5, 0.0, g); box(Wd + 0.1, 0.3, 0.22, dark, 0, 0.65, L / 2, g); box(Wd + 0.1, 0.3, 0.22, dark, 0, 0.65, -L / 2, g); lights(g, Wd, L, 1.15); for (const [x, z] of [[-1.0, 1.55], [1.0, 1.55], [-1.0, -1.55], [1.0, -1.55]]) wheel(g, wheels, x, 0.48, z, 0.48, 0.36); }
    else if (k === 'heli') { // ligeiro de turbina (tipo Bell 206 militar): fuselagem arredondada, bolha de vidro, cauda afunilada, patins
      const hb = M(0x3d4a36, { r: 0.55, m: 0.25 }), hb2 = M(0x2c3628, { r: 0.6, m: 0.25 });
      const mesh = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
      mesh(new THREE.SphereGeometry(1, 22, 14), hb, 0, 1.55, 0.2).scale.set(1.0, 0.95, 2.05);
      mesh(new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), glass, 0, 1.62, 1.05).scale.set(0.93, 0.82, 1.35);
      mesh(new THREE.CapsuleGeometry(0.42, 1.3, 4, 12).rotateX(Math.PI / 2), hb2, 0, 2.45, -0.45);
      mesh(new THREE.CylinderGeometry(0.14, 0.42, 5.0, 12).rotateX(-Math.PI / 2), hb, 0, 1.95, -3.75);
      mesh(new THREE.BoxGeometry(0.08, 1.35, 0.75), hb, 0, 2.45, -6.05).rotation.x = -0.35;
      mesh(new THREE.BoxGeometry(1.9, 0.06, 0.42), hb, 0, 1.92, -5.2);
      for (const sx of [-1, 1]) { mesh(new THREE.BoxGeometry(0.06, 0.36, 0.32), hb2, sx * 0.95, 1.92, -5.2); // derivas nas pontas do estabilizador
        mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 8).rotateX(Math.PI / 2), chrome, sx * 1.05, 0.08, 0.35); mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8).rotateX(0.93), chrome, sx * 1.05, 0.28, 2.2);
        for (const z of [-0.55, 1.25]) mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 6), chrome, sx * 0.82, 0.48, z).rotation.z = sx * 0.45; }
      mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 10), dark, 0, 2.95, 0.1);
      const rot = new THREE.Group(); rot.position.set(0, 3.2, 0.1); rot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12), dark));
      for (const a of [0, Math.PI]) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 5.3), dark); bl.position.set(Math.sin(a) * 2.75, 0, Math.cos(a) * 2.75); bl.rotation.y = a; bl.castShadow = true; rot.add(bl); }
      g.add(rot); g.userData.rotor = rot;
      const tr = new THREE.Group(); tr.position.set(0.14, 2.55, -6.15); tr.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 8).rotateZ(Math.PI / 2), dark)); for (const s2 of [-1, 1]) { const tb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.75, 0.13), dark); tb.position.y = s2 * 0.38; tr.add(tb); } g.add(tr); g.userData.trot = tr;
      box(0.22, 0.08, 0.05, lampM, 0, 0.75, 2.2, g); box(0.12, 0.12, 0.05, tailM, 0, 2.95, -6.35, g); }
    else if (k === 'moto') { box(0.22, 0.32, 1.2, body, 0, 0.62, 0.05, g); box(0.34, 0.24, 0.5, body, 0, 0.86, 0.25, g); box(0.3, 0.1, 0.7, seatM, 0, 0.88, -0.35, g); box(0.7, 0.05, 0.05, chrome, 0, 1.12, 0.62, g); box(0.06, 0.5, 0.06, chrome, 0, 0.85, 0.7, g).rotation.x = -0.35; box(0.14, 0.12, 0.6, chrome, 0.16, 0.42, -0.45, g); box(0.12, 0.1, 0.04, lampM, 0, 0.98, 0.8, g); box(0.12, 0.08, 0.04, tailM, 0, 0.8, -0.8, g); for (const z of [0.78, -0.72]) wheel(g, wheels, 0, 0.33, z, 0.33, 0.12); }
    else if (k === 'bike') { box(0.04, 0.04, 0.95, chrome, 0, 0.62, 0.0, g).rotation.x = 0.12; box(0.04, 0.5, 0.04, chrome, 0, 0.55, -0.2, g).rotation.x = 0.3; box(0.05, 0.55, 0.05, chrome, 0, 0.62, 0.45, g).rotation.x = -0.3; box(0.18, 0.06, 0.28, seatM, 0, 0.85, -0.28, g); box(0.56, 0.04, 0.04, dark, 0, 0.95, 0.52, g); for (const z of [0.6, -0.6]) wheel(g, wheels, 0, 0.34, z, 0.34, 0.05); }
    else { box(Wd, 0.62, L, body, 0, 0.62, 0, g); box(1.66, 0.58, 2.05, body, 0, 1.2, -0.25, g); box(1.62, 0.5, 0.06, glass, 0, 1.2, 0.79, g).rotation.x = -0.38; box(1.62, 0.46, 0.06, glass, 0, 1.2, -1.29, g).rotation.x = 0.35; for (const sx of [-1, 1]) box(0.04, 0.4, 1.7, glass, sx * 0.84, 1.22, -0.25, g); box(1.86, 0.16, 0.12, dark, 0, 0.42, 2.06, g); box(1.86, 0.16, 0.12, dark, 0, 0.42, -2.06, g); lights(g, Wd, L, 0.72); for (const [x, z] of [[-0.86, 1.3], [0.86, 1.3], [-0.86, -1.3], [0.86, -1.3]]) wheel(g, wheels, x, 0.34, z, 0.34); }
    // quem vai lá dentro: só a cabeça nos fechados; corpo e cabeça nos abertos (mota, bicicleta, jipe)
    const heads = T.seats.map(([x, y, z]) => { const h = new THREE.Group(); h.position.set(x, y + 0.6, z); h.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), skin)); if (T.open) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.26), cloth); b.position.y = -0.38; b.castShadow = true; h.add(b); } h.visible = false; g.add(h); return h; });
    scene.add(g); return { g, wheels, heads, lamp: lampM, tail: tailM, rotor: g.userData.rotor, trot: g.userData.trot };
  };
  // obstáculo para quem anda a pé e para os zombies (só quando está parado)
  const setRect = c => { if (c.rc) { removeRect(c.rc); c.rc = null; } if (c.dead === 'gone') return; const T = vt(c.k), cs = Math.abs(Math.cos(c.yaw)), sn = Math.abs(Math.sin(c.yaw)), hw = (T.wid * cs + T.len * sn) / 2, hl = (T.wid * sn + T.len * cs) / 2; c.rc = { x0: c.x - hw, x1: c.x + hw, z0: c.z - hl, z1: c.z + hl, k: T.two ? 'l' : 's', h: T.two ? 0.9 : 1.4, lv: 0, car: c }; addRect(c.rc); c.rcx = c.x; c.rcz = c.z; c.rcy = c.yaw; };
  const add = (id, x, z, yaw, o = {}) => {
    const k = VT[o.k] ? o.k : 'sedan', T = VT[k], c = { id, k, x, z, yaw, v: 0, fuel: o.fuel ?? 20, hp: o.hp ?? T.hp, seats: T.seats.map(() => 0), buf: null, spin: 0, col: COLS[Math.abs(Math.round(x * 7 + z * 13)) % COLS.length] };
    c.m = mkMesh(k, c.col); list.push(c); byId.set(id, c); setRect(c); place(c); return c;
  };
  const del = c => { if (c.rc) removeRect(c.rc); scene.remove(c.m.g); const i = list.indexOf(c); if (i >= 0) list.splice(i, 1); byId.delete(c.id); };
  const place = c => { c.m.g.position.set(c.x, groundY(c.x, c.z, 0) + (c.alt || 0), c.z); c.m.g.rotation.set(VT[c.k].fly ? -(c.pt || 0) : 0, c.yaw, VT[c.k].two ? (c.seats[0] ? (c.lean || 0) : 0.28) : VT[c.k].fly ? c.rl || 0 : 0, 'YXZ'); }; // motas e bicicletas paradas ficam no descanso
  const burnt = M(0x2a2624, { r: 0.95, m: 0.1 });
  const wreck = c => { if (c.dead) return; c.dead = true; c.v = 0; c.m.g.traverse(o => { if (o.isMesh && o.material !== glass && o.material !== tyre) o.material = burnt; }); };
  const HL = [0, 1].map(i => { const L = new THREE.SpotLight(0xfff2d6, 0, 42, 0.62, 0.6, 1.1); if (!i) { L.castShadow = true; L.shadow.mapSize.set(512, 512); L.shadow.bias = -0.0008; L.shadow.camera.near = 0.5; L.shadow.camera.layers.enable(1); } scene.add(L, L.target); return L; });
  const onRoad = (x, z) => { for (const r of W.roads) if (x > r.x0 - 0.5 && x < r.x1 + 0.5 && z > r.z0 - 0.5 && z < r.z1 + 0.5) return true; return false; };
  const me = () => (G.net && G.net.on ? G.net.id : -1);
  // helicóptero: acelerar inclina o nariz e ganha velocidade aos poucos; trás trava até pairar (não há marcha-atrás) e, já parado, desce a pique
  // controlado até aterrar. Virar só roda o aparelho (com inércia e inclinação para dentro da curva), nunca mexe na altura. Ao arrancar,
  // o rotor ganha rotação durante uns segundos antes de levantar. Sem gasolina ou desfeito, desce em autorrotação.
  const CRU = 22;
  const fly = (c, T, dt, inp) => {
    let f = 0, s = 0;
    if (inp.kb) { f = inp.t; s = inp.s; }
    else if (inp.m > 0.15) { const d = angDiff(inp.yaw, c.yaw); f = inp.m * Math.max(0, Math.cos(d)); s = clamp(d * 1.2, -1, 1); }
    const ok = c.hp > 0 && c.fuel > 0, alt0 = c.alt || 0, to = (a, b, r) => a + clamp(b - a, -r, r);
    c.cf = to(c.cf || 0, f, dt * 2.2); c.cs = to(c.cs || 0, s, dt * 2.6); // cíclico e pedais: chegam devagar, sem saltos
    c.rot = clamp((c.rot || 0) + (ok ? dt / 2.6 : -dt * 0.25), 0, 1); // o rotor demora a ganhar rotação
    const wet = W.wet(c.x, c.z, 3), canLand = !wet && !solidAt(c.x, c.z, 3.2);
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); let vx = c.vx || 0, vz = c.vz || 0;
    let vf = vx * fx + vz * fz, vl = vx * fz - vz * fx; const sp0 = Math.hypot(vx, vz);
    // altura: sobe sozinho até à altura de cruzeiro quando pedes para andar; parado e a travar, desce; a virar não muda nada
    if (!c.air && ok && c.rot > 0.92 && f > 0.2) c.air = true;
    // c.uAlt = a altura que o piloto pede (cruzeiro, ou a descer devagar enquanto trava parado); c.tAlt = essa ou mais, se houver prédios
    const below = tallAt(c.x, c.z, 4); let ahead = below; for (let k = 1; k <= 3; k++) ahead = Math.max(ahead, tallAt(c.x + vx * k, c.z + vz * k, 5));
    const floor = canLand ? 0 : wet ? 3 : Math.max(3, below + 2.5);
    if (c.air) { if (f < -0.2 && sp0 < 2.5) c.uAlt = Math.max(floor, Math.min(c.uAlt ?? alt0, alt0 + 1) - dt * 4.5); else if (f > 0.05) c.uAlt = CRU; else c.uAlt = Math.max(floor, c.uAlt ?? alt0); }
    else c.uAlt = 0;
    if (c.air && f < -0.2 && sp0 < 2.5 && !canLand && c.uAlt <= floor + 0.01 && !(c.nlT > 0)) { c.nlT = 4; G.ui.toast(wet ? 'Não dá para aterrar na água' : 'Aqui não dá para aterrar: procura um sítio livre'); } c.nlT = (c.nlT || 0) - dt;
    c.tAlt = !ok ? 0 : c.air && c.uAlt > 0.5 ? Math.max(c.uAlt, ahead + 6) : c.uAlt;
    const blocked = ok && ahead + 2.5 > alt0;
    let vy = c.vy || 0; const want = !ok ? (alt0 > 0.2 ? -5 : 0) : clamp((c.tAlt - alt0) * 0.9, -3.5, blocked ? 7 : 4.2);
    vy += (want - vy) * (1 - Math.exp(-dt * 2.4)); c.alt = Math.max(0, alt0 + vy * dt);
    if (c.alt <= 0) { if (vy < -6 && c.hp > 0) { c.hp = Math.max(1, c.hp - (-vy - 6) * 60); audio.play('partir', 0.7); G.shakeT = 0.4; } vy = 0; if (c.air && c.tAlt <= 0.01) c.air = false; }
    c.vy = vy;
    const air = c.alt > 1.2;
    // à frente: força do cíclico menos o arrasto (a velocidade máxima sai daqui); travar puxa o nariz para cima e corta a velocidade, sem passar para trás
    const A = T.acc * 0.75, drag = A / T.vmax;
    if (air && ok) { vf += (Math.max(0, c.cf) * A - vf * drag * (0.6 + 0.4 * Math.abs(vf) / T.vmax) - (c.cf < 0.05 ? vf * 0.22 : 0)) * dt; if (c.cf < 0 && vf > 0) vf = Math.max(0, vf + c.cf * 11 * dt); }
    else vf *= Math.exp(-dt * (air ? 0.3 : 6));
    if (vf < 0) vf *= Math.exp(-dt * 1.6); // nunca anda para trás de propósito: o que vier de trás (vento da curva) morre
    if (blocked && air && vf > 3) vf *= Math.exp(-dt * 2.5); // obstáculo à frente mais alto do que o helicóptero
    vl *= Math.exp(-dt * (air ? 1.1 : 6)); // o deslize de lado morre aos poucos (dá aquele arrasto ao sair das curvas)
    // pedais: rodar com inércia; em velocidade roda menos (o aparelho prefere seguir a direito)
    const yrT = air || c.alt > 0.3 ? c.cs * (1.25 - 0.5 * Math.min(1, vf / T.vmax)) : 0;
    c.yr = (c.yr || 0) + (yrT - (c.yr || 0)) * (1 - Math.exp(-dt * 2.2)); c.yaw += c.yr * dt;
    { const da = c.yr * dt * (air ? 0.9 : 0), ca = Math.cos(da), sa = Math.sin(da), nf = vf * ca - vl * sa; vl = vf * sa + vl * ca; vf = nf; } // curva coordenada: a inclinação leva quase toda a velocidade para o rumo novo
    // de volta ao mundo; o que sobra de lado escorrega e morre aos poucos
    vx = fx * vf + fz * vl; vz = fz * vf - fx * vl; // (componentes no rumo antigo, já rodadas)
    c.vx = vx; c.vz = vz;
    // inclinação: nariz em baixo a acelerar, em cima a travar; inclina para dentro da curva
    const ptT = air ? clamp(-0.2 * Math.max(0, c.cf) * (1 - 0.5 * vf / T.vmax) - 0.05 * vf / T.vmax + (c.cf < 0 && vf > 1 ? 0.16 * -c.cf : 0), -0.24, 0.2) : 0;
    const rlT = air ? clamp(-c.yr * (0.12 + 0.3 * vf / T.vmax), -0.35, 0.35) : 0;
    const kk = 1 - Math.exp(-dt * 3); c.pt = (c.pt || 0) + (ptT - (c.pt || 0)) * kk; c.rl = (c.rl || 0) + (rlT - (c.rl || 0)) * kk;
    const sp = Math.hypot(vx, vz); c.x = clamp(c.x + vx * dt, -3990, 3990); c.z = clamp(c.z + vz * dt, -3990, 3990); c.v = sp;
    if (c.alt < 6) { const o = { x: c.x, z: c.z, lv: 0, h: 0 }; collide(o, 2.4); if (Math.abs(o.x - c.x) + Math.abs(o.z - c.z) > 1e-3) { c.x = o.x; c.z = o.z; if (sp > 6) { c.hp = Math.max(1, c.hp - sp); audio.play('partir', 0.6); G.shakeT = 0.3; } c.vx *= -0.2; c.vz *= -0.2; } }
    if (ok) c.fuel = Math.max(0, c.fuel - dt * (c.rot > 0.1 ? 0.05 + sp * 0.002 : 0)); c.spin += c.rot * dt * 40;
  };
  // um veículo parado aqui consegue sair para longe? procura em largura numa grelha de 2 m, com a largura de um carro;
  // as casas por onde já se saiu ficam marcadas e servem de atalho às procuras seguintes
  const GOOD = new Set(), gk = (x, z) => Math.round(x / 2) * 8192 + Math.round(z / 2);
  const escapes = (x0, z0, R) => { const S = 2, H = Math.ceil(R / S) + 1, N = H * 2 + 1, seen = new Uint8Array(N * N), q = new Int32Array(N * N); let qh = 0, qt = 0; q[qt++] = H * N + H; seen[H * N + H] = 1; const path = [];
    while (qh < qt) { const c = q[qh++], i = (c % N) - H, j = ((c / N) | 0) - H, x = x0 + i * S, z = z0 + j * S; path.push(c);
      if (i * i + j * j >= (R / S) * (R / S) || GOOD.has(gk(x, z))) { for (let n = 0; n < path.length; n += 7) { const p = path[n]; GOOD.add(gk(x0 + ((p % N) - H) * S, z0 + (((p / N) | 0) - H) * S)); } return true; }
      for (let d = 0; d < 4; d++) { const a = i + (d === 0 ? 1 : d === 1 ? -1 : 0), b = j + (d === 2 ? 1 : d === 3 ? -1 : 0); if (a < -H || a > H || b < -H || b > H) continue; const k = (b + H) * N + a + H; if (seen[k]) continue; seen[k] = 1;
        const px = x0 + a * S, pz = z0 + b * S; if (Math.abs(px) > 3990 || Math.abs(pz) > 3990 || solidAt(px, pz, 2.35) || W.wet(px, pz, 1)) continue; q[qt++] = k; } }
    return false; };
  const C = {
    list, escapes, goodClear: () => GOOD.clear(), free: (x, z) => ({ wet: W.wet(x, z, 3), solid: solidAt(x, z, 3.2) }),
    get mine() { return G.car || null; },
    // onde há carros no início: na estrada, perto das vilas (iguais em todos os aparelhos)
    spawnPoints(raw) { const out = [];
      const roadYaw = (x, z) => { for (const r of W.roads) if (x > r.x0 - 0.5 && x < r.x1 + 0.5 && z > r.z0 - 0.5 && z < r.z1 + 0.5) return r.x1 - r.x0 > r.z1 - r.z0 ? Math.PI / 2 : 0; return null; };
      for (const zn of W.zones) { const mil = zn.kind === 'mil', big = zn.r > 100, n = mil ? 2 : zn.kind === 'city' ? 3 : big ? 4 : zn.kind === 'town' || (zn.small && zn.kind === 'mon') ? 1 : 0; let made = 0;
        for (let k = 0; k < 80 && made < n; k++) { const a = k * 2.39996, d = 10 + (k % 10) * (big ? 9 : 3), x = zn.x + Math.sin(a) * d, z = zn.z + Math.cos(a) * d;
          const y = roadYaw(x, z), pad = mil && W.paved(x, z); if ((y === null && !pad) || solidAt(x, z, 2.8)) continue; if (out.some(q => Math.hypot(q[0] - x, q[1] - z) < 7)) continue;
          if (!raw && !escapes(x, z, Math.min(mil ? zn.r + 40 : 120, 520))) continue; // nada de carros presos atrás de vedações ou muros
          out.push([+x.toFixed(1), +z.toFixed(1), y ?? 0, pickVT(out.length + Math.round(zn.x) * 0.013 + Math.round(zn.z) * 0.007, mil)]); made++; } }
      for (const [x, z, yaw] of HELIPADS) out.push([x, z, yaw, 'heli']);
      return out; },
    // sem servidor: os carros são deste aparelho
    spawnLocal() { for (const c of [...list]) del(c); this.spawnPoints().forEach(([x, z, yaw, k], i) => add('L' + i, x, z, yaw, { k, fuel: 10 + (i * 7) % 21 })); },
    clear() { G.car = null; for (const c of [...list]) del(c); },
    dbgAdd(k, x, z, yaw) { return add('T' + Math.random().toString(36).slice(2, 7), x, z, yaw, { k, fuel: 30 }); }, dbgDel(c) { del(c); }, // só para testes
    // perto de um carro (para entrar ou pôr gasolina)
    nearest(p, r = 3.2) { let best = null, bd = r; for (const c of list) { if (c.hp <= 0) continue; const d = Math.hypot(c.x - p.x, c.z - p.z) - (VT[c.k].two ? 0.4 : 1.2); if (d < bd) { bd = d; best = c; } } return best; },
    seatFree(c) { return c.seats.findIndex(s => !s); },
    // entrar: o primeiro lugar livre (o do condutor primeiro)
    enter(c) { const i = this.seatFree(c); if (i < 0) { G.ui.toast(VT[c.k].two ? 'Já não cabe mais ninguém' : 'O carro está cheio'); return; } if (G.net && G.net.world) { G.net.raw({ t: 'cin', id: c.id, seat: i }); return; } this.seated(c, i); },
    seated(c, i) { c.seats[i] = me(); G.car = c; G.carSeat = i; if (i === 0) c.idle = 99; /* o helicóptero só levanta quando mexes o polegar */ G.aimEnd && G.aimEnd(); G.setAuto && G.setAuto(false); audio.play('porta', 0.7); if (i === 0) { const T = VT[c.k]; G.ui.toast(T.fuel === false ? T.n + ' · a pedalar' : c.fuel > 0.5 ? T.n + ' · gasolina ' + Math.round(c.fuel) + ' L' : 'Sem gasolina: precisas de um galão'); if (c.rc) { removeRect(c.rc); c.rc = null; } } else G.ui.toast(VT[c.k].two ? 'Vais à pendura · aponta para disparar' : 'Vais de passageiro · aponta para disparar da janela'); },
    exit(net = true) { const c = G.car; if (!c) return; if (net && (c.alt || 0) > 0.8) { G.ui.toast('Aterra primeiro'); return; } G.leanOut = false; G.aimEnd && G.aimEnd(); const p = G.p, s = G.carSeat; c.seats[s] = 0; G.car = null; if (net && G.net && G.net.world) G.net.raw({ t: 'cout', id: c.id });
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw); // lado esquerdo do carro
      for (const [a, b] of [[1.5, 0], [-1.5, 0], [0, -2.8], [0, 2.8], [2.4, 1], [-2.4, 1]]) { const x = c.x + lx * a * (s % 2 ? -1 : 1) + fx * b, z = c.z + lz * a * (s % 2 ? -1 : 1) + fz * b; if (!solidAt(x, z, 0.4)) { p.x = x; p.z = z; break; } }
      p.vx = p.vz = 0; audio.play('portaF', 0.7); if (!c.seats[0] && Math.abs(c.v) < 0.5) { c.v = 0; setRect(c); } },
    refuel(c, it) { const T = VT[c.k]; if (T.fuel === false) { G.ui.toast('As bicicletas não levam gasolina'); return false; } const add = Math.min(T.tank - c.fuel, 20); if (add < 0.5) { G.ui.toast('O depósito está cheio'); return false; } c.fuel += add; if (G.net && G.net.world) G.net.raw({ t: 'cf', id: c.id, add }); G.ui.toast('Gasolina: ' + Math.round(c.fuel) + ' L'); audio.play('apanhar'); return true; },
    // conduzir: polegar = para onde queres ir no ecrã (para trás faz marcha-atrás); no PC, W/S acelera e trava, A/D vira
    drive(dt, inp) {
      const c = G.car; if (!c || G.carSeat !== 0) return; const T = VT[c.k], pedal = T.fuel === false;
      if (T.fly) return fly(c, T, dt, inp);
      // pedais e volante: acelerar/travar (t) e virar (s, positivo = esquerda); chegam aos poucos, como num carro a sério
      let t = 0, sy = 0;
      if (inp.kb) { t = inp.t; sy = inp.s; }
      else if (inp.m > 0.15) { const diff = angDiff(inp.yaw, c.yaw); if (Math.abs(diff) > 2.2 && c.v < 2) { t = -inp.m; sy = -clamp(angDiff(inp.yaw + Math.PI, c.yaw) * 1.4, -1, 1); } else { t = inp.m * (Math.abs(diff) > 1.6 ? 0.35 : 1); sy = clamp(diff * 1.4, -1, 1); } }
      if (c.hp <= 0 || (!pedal && c.fuel <= 0)) t = t < 0 && c.v > 0.3 ? t : 0; // sem gasolina ou desfeito: só trava
      const to = (a, b, r) => a + clamp(b - a, -r, r); c.thr = to(c.thr || 0, t, dt * (t ? 5 : 9)); c.st = to(c.st || 0, sy, dt * (sy ? (Math.sign(sy) !== Math.sign(c.st || 0) ? 7 : 3.6) : 6));
      const road = onRoad(c.x, c.z), vtop = road ? T.vmax : T.voff, ACC = T.acc, th = c.thr, sp0 = Math.abs(c.v);
      // motor (perde força perto da velocidade máxima), travão, marcha-atrás e, sem pedal, o carro rola até parar
      if (th > 0.02) { if (c.v < -0.3) c.v += BRK * th * dt; else c.v += ACC * th * Math.max(0.15, 1 - Math.max(0, c.v) / vtop) * 1.35 * dt; }
      else if (th < -0.02) { if (c.v > 0.3) c.v += BRK * th * dt; else c.v += ACC * 0.75 * th * Math.max(0, 1 + c.v / (T.two ? 1.5 : MAXR)) * dt; }
      else c.v -= Math.sign(c.v) * Math.min(sp0, (1.4 + sp0 * 0.06) * dt);
      if (c.v > vtop) c.v = Math.max(vtop, c.v - 6 * dt); c.v = Math.max(c.v, -(T.two ? 1.5 : MAXR));
      // direção (modelo de bicicleta): o volante vira menos quanto mais depressa vais, por isso a alta velocidade não fica nervoso
      const sv = Math.abs(c.v), wb = T.len * 0.6, agil = T.turn / 1.75, ang = c.st * (0.5 + (0.11 - 0.5) * Math.min(1, sv / (T.vmax * 0.95))) * agil, yr = c.v / wb * Math.tan(ang);
      c.yaw += yr * dt;
      // um pouco de deriva nas curvas rápidas (mais fora da estrada); o carro endireita sozinho
      c.slip = to(c.slip || 0, -yr * sv * (road ? 0.012 : 0.03), dt * 6);
      c.lean = (c.lean || 0) + ((T.two ? -c.st * Math.min(1, sv / 8) * 0.38 : -c.slip * 0.04) - (c.lean || 0)) * Math.min(1, dt * 6);
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), ox0 = c.x, oz0 = c.z; c.x += (fx * c.v + Math.cos(c.yaw) * c.slip) * dt; c.z += (fz * c.v - Math.sin(c.yaw) * c.slip) * dt;
      // água: o carro não entra (para à beira)
      { const s = Math.sign(c.v) || 1, h = T.len / 2 + 0.2; if (W.wet(c.x + fx * h * s, c.z + fz * h * s)) { c.x = ox0; c.z = oz0; if (Math.abs(c.v) > 6) c.hp = Math.max(0, c.hp - (Math.abs(c.v) - 6) * 6); c.v = 0; if (!c.wetT || G.t > c.wetT) { c.wetT = G.t + 4; G.ui.toast('O carro não entra na água'); } } }
      if (!pedal) c.fuel = Math.max(0, c.fuel - Math.abs(c.v) * dt * USE * (c.k === 'humvee' ? 1.8 : c.k === 'moto' ? 0.4 : 1));
      // batidas: três círculos ao longo do carro
      const cr = T.wid / 2 + 0.03, ce = Math.max(0, T.len / 2 - cr); let px = 0, pz = 0, n = 0; for (const k of [-ce, 0, ce]) { const o = { x: c.x + fx * k, z: c.z + fz * k, lv: 0, h: 0 }, ox = o.x, oz = o.z; collide(o, cr); if (Math.abs(o.x - ox) + Math.abs(o.z - oz) > 1e-4) { px += o.x - ox; pz += o.z - oz; n++; } }
      if (n) { c.x += px / n; c.z += pz / n; const sp = Math.abs(c.v); if (sp > 4) { c.hp = Math.max(0, c.hp - (sp - 4) * 9 * (c.k === 'humvee' ? 0.4 : 1)); audio.play('partir', Math.min(1, sp / 12)); G.buzz && G.buzz(40); G.shakeT = Math.max(G.shakeT || 0, Math.min(0.5, sp / 30)); if (c.hp <= 0) G.ui.toast('O carro ficou desfeito'); } c.v *= sp > 4 ? -0.2 : 0.4; }
      // atropelar: zombies (e, online, outros jogadores)
      const sp = Math.abs(c.v); const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
      const inside = (x, z) => { const dx = x - c.x, dz = z - c.z, a = dx * fx + dz * fz, b = dx * rx + dz * rz; return Math.abs(a) < T.len / 2 + 0.3 && Math.abs(b) < T.wid / 2 + 0.33 ? { a, b } : null; };
      for (const z of G.zs) { if (z.state === 'dead' || (z.lv || 0) !== 0 || Math.abs(z.x - c.x) > 3 || Math.abs(z.z - c.z) > 3) continue; const q = inside(z.x, z.z); if (!q) continue;
        if (sp > 3.5 && (z.carT || 0) < G.t) { z.carT = G.t + 0.6; hurtZombie(z, sp * (T.two ? 5 : 9), fx * Math.sign(c.v), fz * Math.sign(c.v), { zone: 'body', at: new THREE.Vector3(z.x, 1, z.z) }); c.hp = Math.max(0, c.hp - (T.two ? 6 : 2)); c.v *= T.two ? 0.6 : 0.85; }
        else if (!z.remote) { const s = q.b >= 0 ? 1 : -1; z.x += rx * s * 0.25; z.z += rz * s * 0.25; } }
      if (G.net && G.net.on && sp > 3.5) for (const r of G.net.R.values()) { if (!r.s1 || !r.s1[10] || (r.s1[7] & 8)) continue; if (!inside(r.x, r.z) || (r.carT || 0) > G.t) continue; r.carT = G.t + 0.8; G.net.raw({ t: 'ck', to: r.id, dmg: +(sp * (T.two ? 3 : 6)).toFixed(1) }); }
      c.spin += c.v * dt / 0.34;
    },
    // cada imagem: mexe os carros dos outros (suave), as rodas, as luzes e quem vai lá dentro; põe-te no teu lugar
    update(dt) {
      const now = performance.now();
      for (const c of list) {
        // de outro condutor: desenhado um pouco atrás, entre as duas imagens certas (pela hora a que o condutor as mandou)
        if (c.T && !(c === G.car && G.carSeat === 0)) { const S = sample(c.T, now, c.o || (c.o = {})); if (S) { c.spin += Math.hypot(S.x - c.x, S.z - c.z) * Math.sign(S.s.v || 1) / 0.34; c.x = S.x; c.z = S.z; c.yaw = S.yaw; c.v = S.s.v; c.alt = S.y || 0; c.rot = c.alt > 0.05 ? 1 : 0; } }
        if (VT[c.k].fly && !c.T && !(c === G.car && G.carSeat === 0)) { c.rot = Math.max(0, (c.rot || 0) - dt * 0.08); c.pt = (c.pt || 0) * 0.9; c.rl = (c.rl || 0) * 0.9; } // sem piloto: o rotor perde rotação e o aparelho assenta
        else if (VT[c.k].fly && c.T && !(c === G.car && G.carSeat === 0)) { const a = c.alt > 1 ? clamp(-0.07 * (c.v || 0) / VT[c.k].vmax * 2, -0.2, 0) : 0; c.pt = (c.pt || 0) + (a - (c.pt || 0)) * Math.min(1, dt * 3); }
        if (c.hp <= 0) wreck(c); place(c); for (const w of c.m.wheels) w.rotation.x = c.spin; if (c.m.rotor) { c.m.rotor.rotation.y += (c.rot || (c.alt > 0.05 ? 1 : 0)) * dt * 22; c.m.trot.rotation.x += (c.rot || (c.alt > 0.05 ? 1 : 0)) * dt * 30; }
        const night = 1 - (G.day ?? 1); if (c.m.lamp) c.m.lamp.emissiveIntensity = c.seats[0] ? 0.4 + night * 2.4 : 0.15; if (c.m.tail) c.m.tail.emissiveIntensity = c.seats[0] ? (c.v < -0.2 || (c === G.car && c.brk) ? 1.8 : 0.5) : 0.2;
        c.m.heads.forEach((h, i) => h.visible = !!c.seats[i] && !(c === G.car && (G.fp || (G.leanOut && i === G.carSeat))));
        // parado e sem condutor: volta a ser um obstáculo
        if (!c.seats[0] && Math.abs(c.v) < 0.3 && (!c.rc || Math.hypot(c.x - c.rcx, c.z - c.rcz) > 0.15 || Math.abs(angDiff(c.yaw, c.rcy)) > 0.05)) setRect(c);
        else if (c.seats[0] && c.rc && (c === G.car || Math.abs(c.v) > 0.3)) { removeRect(c.rc); c.rc = null; }
      }
      // faróis a sério: os 2 carros com condutor mais perto de ti acendem um foco à frente (mais forte de noite)
      { const night = 1 - (G.day ?? 1), P = G.p || { x: 0, z: 0 }, on = list.filter(q => q.seats[0] && q.hp > 0 && Math.hypot(q.x - P.x, q.z - P.z) < 90).sort((a, b) => (a === G.car ? -1 : b === G.car ? 1 : Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z)));
        HL.forEach((L, i) => { const q = on[i]; if (!q) { L.intensity = 0; return; } const fx = Math.sin(q.yaw), fz = Math.cos(q.yaw); L.position.set(q.x + fx * 2.2, 0.85, q.z + fz * 2.2); L.target.position.set(q.x + fx * 20, 0, q.z + fz * 20); L.intensity = 6 + night * 140; }); }
      const c = G.car, p = G.p; if (!c || !p) { if (audio.engine) audio.engine(0, 0); return; }
      const T = VT[c.k], [sx0, , sz] = T.seats[G.carSeat] || T.seats[0]; const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
      // passageiro a apontar: debruça-se pela janela (fica à mostra, fora da carroçaria); quem conduz não dispara
      G.leanOut = G.carSeat > 0 && c.hp > 0 && !!(G.aimS && G.aimS.on); const sx = G.leanOut && !T.open ? Math.sign(sx0 || 1) * (T.wid / 2 + 0.4) : sx0;
      p.x = c.x + sx * cs + sz * sn; p.z = c.z - sx * sn + sz * cs; p.vx = p.vz = 0; if (!G.leanOut) p.root = p.yaw = p.aim = c.yaw; p.lv = 0; p.base = c.alt || 0; p.y = groundY(c.x, c.z, 0) + (c.alt || 0);
      audio.engine && audio.engine((G.carSeat === 0 || VT[c.k].fly) && VT[c.k].fuel !== false && c.fuel > 0 && c.hp > 0 && (!VT[c.k].fly || (c.rot || 0) > 0.05) ? (VT[c.k].fly ? c.rot || 0 : 1) : 0, VT[c.k].fly ? Math.min(1, Math.hypot(c.vx || 0, c.vz || 0) / VT[c.k].vmax + (c.alt || 0) / 60) : Math.abs(c.v) / VT[c.k].vmax, VT[c.k].fly ? 1 : 0);
    },
    // online: os carros que o servidor manda (e quem vai em cada lugar)
    rows(U) { const now = performance.now(), my = me();
      for (const [id, x10, z10, y100, v10, fuel, hp, k, seats, ts, a10] of U) { let c = byId.get(id); const x = x10 / 10, z = z10 / 10, yaw = y100 / 100;
        if (c && c.k !== k && c !== G.car) { del(c); c = null; }
        if (!c) { c = add(id, x, z, yaw, { k, fuel, hp }); }
        const d0 = seats[0]; c.seats = seats.slice(); c.hp = hp;
        if (G.car === c && !seats.includes(my)) { c.seats[G.carSeat] = my; this.exit(false); c.seats = seats.slice(); G.ui.toast(hp <= 0 ? 'O veículo ficou desfeito' : 'Saíste do veículo'); }
        if (G.car === c && G.carSeat === 0) continue; // o teu: a posição és tu que mandas
        c.fuel = fuel; if (d0) { if (!c.T || c.drv !== d0) { c.T = track(); c.drv = d0; } push(c.T, ts || now, now, { x, z, y: (a10 || 0) / 10, yaw, v: v10 / 10 }); } else { c.T = null; c.drv = 0; c.x = x; c.z = z; c.yaw = yaw; c.v = 0; c.alt = (a10 || 0) / 10; }
        if (hp <= 0) wreck(c); }
    },
    gone(ids) { for (const id of ids) { const c = byId.get(id); if (c && c !== G.car) del(c); } },
    up() { const c = G.car; if (!c || G.carSeat !== 0) return null; const a = [c.id, Math.round(c.x * 10), Math.round(c.z * 10), Math.round(c.yaw * 100), Math.round(c.v * 10), +c.fuel.toFixed(1), Math.round(c.hp), Math.round((c.alt || 0) * 10)], sg = a.join(); if (sg === c.sent) return null; c.sent = sg; a.push(Math.round(performance.now())); return a; },
  };
  return C;
}
