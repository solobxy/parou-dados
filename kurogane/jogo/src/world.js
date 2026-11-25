// O mapa: bairro japonês Shin-Kurogane no centro, floresta à volta.
import * as THREE from 'three';
import { buildMonuments } from './monuments.js';
import { Builder, rnd, rr, ri, pick, shade, mat4, getSeed, setSeed } from './builder.js';
import { buildTowns } from './towns.js';
import { buildRegions } from './regions.js';

// MAP: metade do lado do mundo todo (8 km); CORE: o mapa do centro, feito à mão (900 m)
export const MAP = 4000, CORE = 450;
export const CITY = { x0: -48, x1: 48, z0: -46, z1: 46 };
export const inCity = (x, z) => x > CITY.x0 && x < CITY.x1 && z > CITY.z0 && z < CITY.z1;

export function buildWorld(scene, mats, A) {
  const b = new Builder(40);
  // todo o chão pavimentado (betão, asfalto, ladrilho, terra batida) fica registado: aí não nascem árvores nem arbustos
  const pads = [], floor0 = b.floor.bind(b); b.floor = (x0, z0, x1, z1, y, hex, mat) => { if (y < 0.1 && y >= 0 && mat !== 'grass' && !b.wet) pads.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) }); return floor0(x0, z0, x1, z1, y, hex, mat); };
  const W = {
    rects: [], circles: [], containers: [], cuts: [], map: [], nodes: [], lamps: [], steps: [], zones: [], openings: [], roads: [], rocks: [], stairs: [], doors: [],
    // acordas na berma do mundo (a 3,9 km do centro); o kit de teste começa à beira do mapa do centro
    spawns: [[-3920, 0.5], [3920, -1], [-1, -3920], [1, 3920], [-3900, -2200], [3900, 2300], [-3900, 1700], [3900, -1600], [-1500, -3900], [1800, 3900], [2600, -3900], [-2700, 3900]],
    kitSpawns: [[-432, 0.5], [432, -1], [-1, -432], [1, 432], [-400, -420], [410, 420], [-420, 412], [420, -410], [-430, 150], [430, -170]],
  };
  W.zones.push({ name: 'Shin-Kurogane', jp: '新黒鉄', x: 0, z: 0, r: 62, kind: 'city', sub: 'Zona PvP · melhor loot' });
  let CUR = 0;
  const rect = (x0, z0, x1, z1, k = 's', h = 3) => { W.rects.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), k, h, lv: CUR }); };
  const circ = (x, z, r, k = 's', node = null) => { const c = { x, z, r, k, node, on: true, lv: CUR }; W.circles.push(c); return c; };
  const mp = (x0, z0, x1, z1, c) => W.map.push({ x0, z0, x1, z1, c });
  let cid = 0;
  const container = (x, z, label, table, o = {}) => { const c = { id: 'c' + (cid++), x, z, label, table, slots: o.slots || [6, 4], y: o.y ?? 0.8, grid: null, refill: 0, lv: CUR }; W.containers.push(c); return c; };
  // escadas sempre livres: o pé (no piso de baixo) e o topo (no de cima) têm uma zona onde nenhum móvel pode ficar; quem calhar lá não é construído
  const koOf = lv => { const out = []; for (const st of W.stairs) { const C = st.b, ax = st.ax, d = st.dir; for (const [at, l, sgn] of [[st.bot, st.lv, -d], [st.top, st.lv + 1, d]]) { if (l !== lv) continue; const a0 = Math.min(at, at + sgn * 1.25), a1 = Math.max(at, at + sgn * 1.25); let c0 = ax ? st.z0 : st.x0, c1 = ax ? st.z1 : st.x1; const o2 = st.open; if (o2 === (ax ? 's' : 'e')) c1 += 1.3; else if (o2 === (ax ? 'n' : 'w')) c0 -= 1.3; else { c0 -= 0.6; c1 += 0.6; } let r = ax ? { x0: a0, x1: a1, z0: c0, z1: c1 } : { x0: c0, x1: c1, z0: a0, z1: a1 }; if (C) r = { x0: Math.max(r.x0, C.ix0), x1: Math.min(r.x1, C.ix1), z0: Math.max(r.z0, C.iz0), z1: Math.min(r.z1, C.iz1) }; out.push(r); } } return out; };
  const guard = fn => (...a) => {
    const m = b.mark(), r0 = W.rects.length, c0 = W.containers.length, k0 = W.circles.length, res = fn(...a);
    const KO = koOf(CUR); if (!KO.length) return res;
    const hit = (x0, z0, x1, z1) => KO.some(k => x0 < k.x1 && x1 > k.x0 && z0 < k.z1 && z1 > k.z0);
    let bad = false;
    for (let i = r0; i < W.rects.length && !bad; i++) { const r = W.rects[i]; if (!r.stairRail && (r.lv || 0) === CUR && hit(r.x0, r.z0, r.x1, r.z1)) bad = true; }
    for (let i = k0; i < W.circles.length && !bad; i++) { const c = W.circles[i]; if (hit(c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r)) bad = true; }
    if (bad) { b.rollback(m); W.rects.length = r0; W.containers.length = c0; W.circles.length = k0; W.koSkipped = (W.koSkipped || 0) + 1; return null; }
    return res;
  };

  // ---------- cores
  const ASPH = 0x8a8b8e, CONC = 0xb9b4aa, TILE = 0xd6cfc0, CURB = 0x9d9a93, WHITE = 0xe9e7e1, YEL = 0xe0b23a;

  // ---------- chão
  b.floor(-MAP - 30, -MAP - 30, MAP + 30, MAP + 30, -0.02, 0xffffff, 'grass');
  b.floor(CITY.x0, CITY.z0, CITY.x1, CITY.z1, 0.0, CONC, 'conc');
  mp(-MAP, -MAP, MAP, MAP, '#3f5531'); mp(CITY.x0, CITY.z0, CITY.x1, CITY.z1, '#8e8a82');

  // estradas: principal (x), transversal (z), becos
  const road = (x0, z0, x1, z1) => { W.roads.push({ x0, z0, x1, z1 }); b.floor(x0, z0, x1, z1, 0.02, ASPH, 'asph'); mp(x0, z0, x1, z1, '#4b4c4f'); };
  road(-MAP - 4, -4.2, MAP + 4, 4.2);
  road(-3.6, CITY.z0, 3.6, CITY.z1);
  road(CITY.x0, -26, CITY.x1, -22); road(CITY.x0, 22, CITY.x1, 26);
  // caminhos de terra para norte e sul
  const dirt = (x0, z0, x1, z1) => { W.roads.push({ x0, z0, x1, z1 }); b.floor(x0, z0, x1, z1, 0.012, 0xffffff, 'dirt'); mp(x0, z0, x1, z1, '#6b5b44'); };
  dirt(-2.6, -MAP - 4, 2.6, CITY.z0); dirt(-2.6, CITY.z1, 2.6, MAP + 4);
  // passeios com lancil
  const walk = (x0, z0, x1, z1) => { W.steps.push({ x0, z0, x1, z1, y: 0.14 }); b.box(x1 - x0, 0.14, z1 - z0, (x0 + x1) / 2, 0.07, (z0 + z1) / 2, TILE, { mat: 'tile' }); mp(x0, z0, x1, z1, '#b3ab9b'); };
  for (const [x0, x1] of [[CITY.x0, -3.6], [3.6, CITY.x1]]) { walk(x0, -7, x1, -4.2); walk(x0, 4.2, x1, 7); }
  for (const [z0, z1] of [[CITY.z0, -26], [-22, -7], [7, 22], [26, CITY.z1]]) { walk(-6.4, z0, -3.6, z1); walk(3.6, z0, 6.4, z1); }
  // marcas na estrada
  for (let x = -MAP; x < MAP; x += 6) if (Math.abs(x) > 9) b.box(3, 0.01, 0.16, x, 0.035, 0, WHITE, { mat: 'decal' });
  for (let z = CITY.z0 + 2; z < CITY.z1; z += 6) if (Math.abs(z) > 9 && Math.abs(z + 24) > 4 && Math.abs(z - 24) > 4) b.box(0.16, 0.01, 3, 0, 0.035, z, WHITE, { mat: 'decal' });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) { b.box(0.5, 0.01, 2.4, -3 + i * 1 , 0.035, s * 6.2 + (s > 0 ? 0 : 0), WHITE, { mat: 'decal' }); b.box(2.4, 0.01, 0.5, s * 5.2, 0.035, -3 + i * 1, WHITE, { mat: 'decal' }); }
    b.box(0.3, 0.01, 3.6, s * 4.4, 0.035, -s * 2.1, WHITE, { mat: 'decal' }); // linhas de paragem
  }
  // 止まれ pintado no chão
  { const s = A.sign('止まれ', { w: 384, h: 128, fg: '#efece6', weight: 900, pad: 0.08 }); b.plane(3.2, 1.05, -2.0, 0.04, -10.5, 0xffffff, { mat: 'paint', uv: s, rx: -Math.PI / 2, ry: Math.PI }); b.plane(3.2, 1.05, 2.0, 0.04, 10.5, 0xffffff, { mat: 'paint', uv: s, rx: -Math.PI / 2 }); }

  // ---------- peças de rua
  const pole = (x, z, h = 8.5) => {
    if (Math.abs(x * 7 + z * 3) % 3 < 1) W.lamps.push([x, h - 2.2, z]);
    b.cyl(0.13, 0.17, h, 8, x, h / 2, z, 0x8d8a82, { jit: 0.05 });
    for (const y of [h - 0.4, h - 1.1]) b.box(1.6, 0.1, 0.1, x, y, z, 0x5a5650);
    b.cyl(0.17, 0.17, 0.5, 8, x + 0.35, h - 1.9, z, 0x6d6a64); b.cyl(0.14, 0.14, 0.45, 8, x - 0.35, h - 2.6, z, 0x6d6a64);
    b.box(0.3, 0.42, 0.06, x, 2.4, z + 0.14, 0xe6c84a); // placa amarela
    circ(x, z, 0.25);
    return [x, h - 0.4, z];
  };
  const wire = (p, q, sag = 0.9) => { const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t - Math.sin(Math.PI * t) * sag, p[2] + (q[2] - p[2]) * t)); } b.tube(pts, 0.022, 0x1d1d1d, { seg: 8 }); };
  const wires = (a, c) => { for (const dx of [-0.7, 0.7]) wire([a[0] + dx, a[1], a[2]], [c[0] + dx, c[1], c[2]], 0.6 + rnd() * 0.5); wire([a[0], a[1] - 0.7, a[2]], [c[0], c[1] - 0.7, c[2]], 0.9); };
  const lamp = (x, z, ry = 0) => { W.lamps.push([x + Math.sin(ry) * 1.05, 4.9, z + Math.cos(ry) * 1.05]); b.cyl(0.07, 0.09, 5.2, 8, x, 2.6, z, 0x5f6266, { mat: 'm' }); b.push(x, 5.2, z, ry); b.box(0.12, 0.12, 1.1, 0, 0, 0.5, 0x5f6266, { mat: 'm' }); b.box(0.36, 0.12, 0.5, 0, -0.08, 1.05, 0x3f4246, { mat: 'm' }); b.box(0.3, 0.03, 0.42, 0, -0.15, 1.05, new THREE.Color(1.8, 1.55, 1.1), { mat: 'lit' }); b.pop(); circ(x, z, 0.15); };
  const vend = (x, z, ry = 0, c = 0xc23a2e) => {
    b.push(x, 0.14, z, ry);
    b.box(0.95, 1.85, 0.75, 0, 0.92, 0, c, { mat: 'm' }); b.box(0.82, 1.05, 0.02, 0, 1.2, 0.385, 0xffffff, { mat: 'sign', uv: VEND });
    b.plane(0.82, 1.05, 0, 1.2, 0.39, 0xffffff, { mat: 'sign', uv: VEND }); b.box(0.6, 0.18, 0.06, 0, 0.35, 0.38, 0x1d1f22);
    b.box(0.82, 0.12, 0.05, 0, 1.78, 0.38, new THREE.Color(1.6, 1.6, 1.5), { mat: 'lit' });
    b.pop(); const cs = Math.abs(Math.sin(ry)) > 0.5; rect(x - (cs ? 0.4 : 0.48), z - (cs ? 0.48 : 0.4), x + (cs ? 0.4 : 0.48), z + (cs ? 0.48 : 0.4), 's');
  };
  const VEND = A.draw(128, 160, (x, w, h) => { x.fillStyle = '#eef1ee'; x.fillRect(0, 0, w, h); const cs = ['#d23a2e', '#2f6fb3', '#f0c23a', '#3f9a5a', '#e7e7e7', '#7a3f9a', '#f08a2a', '#1f2a44']; for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) { x.fillStyle = cs[(r * 3 + c) % 8]; x.fillRect(8 + c * 24, 10 + r * 50, 15, 32); x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(10 + c * 24, 13 + r * 50, 3, 24); x.fillStyle = '#c33'; x.fillRect(9 + c * 24, 45 + r * 50, 13, 4); } });
  const car = (x, z, ry, c, o = {}) => {
    b.push(x, 0, z, ry);
    const dmg = o.wreck ? 0.75 : 1;
    b.rbox(1.72, 0.62, 4.1, 0.16, 0, 0.62, 0, shade(c, dmg), { mat: 'm' });
    b.rbox(1.5, 0.55, 2.1, 0.14, 0, 1.18, -0.25, shade(c, dmg * 0.95), { mat: 'm' });
    b.box(1.44, 0.42, 0.06, 0, 1.2, 0.83, 0x1f2a33, { mat: 'win', rx: -0.45 }); b.box(1.44, 0.4, 0.06, 0, 1.2, -1.32, 0x1f2a33, { mat: 'win', rx: 0.4 });
    for (const sx of [-1, 1]) { b.box(0.04, 0.38, 1.7, sx * 0.76, 1.2, -0.25, 0x1f2a33, { mat: 'win' }); for (const sz of [-1.3, 1.3]) b.cyl(0.33, 0.33, 0.24, 12, sx * 0.78, 0.33, sz, 0x1b1b1c, { rz: Math.PI / 2 }); }
    for (const sx of [-0.6, 0.6]) { b.box(0.3, 0.12, 0.04, sx, 0.72, 2.06, o.wreck ? 0x555 : new THREE.Color(1.5, 1.45, 1.3), { mat: o.wreck ? 'v' : 'lit' }); b.box(0.3, 0.1, 0.04, sx, 0.74, -2.06, 0x8a1a14); }
    b.box(1.6, 0.12, 0.1, 0, 0.42, 2.06, 0x2a2b2c); b.box(1.6, 0.12, 0.1, 0, 0.42, -2.06, 0x2a2b2c);
    if (o.taxi) { b.box(0.5, 0.18, 0.28, 0, 1.55, -0.2, new THREE.Color(1.4, 1.2, 0.6), { mat: 'lit' }); }
    if (o.police) { b.box(1.74, 0.3, 2.2, 0, 0.72, 0.2, 0xf2f2f0, { mat: 'm' }); b.box(0.9, 0.12, 0.25, 0, 1.52, -0.3, 0x2a2b2c); b.box(0.35, 0.1, 0.22, -0.22, 1.6, -0.3, 0xd23a2e, { mat: 'lit' }); b.box(0.35, 0.1, 0.22, 0.22, 1.6, -0.3, 0x2a5ad2, { mat: 'lit' }); }
    b.pop();
    const cs = Math.abs(Math.sin(ry)) > 0.5, hw = cs ? 2.05 : 0.86, hd = cs ? 0.86 : 2.05; rect(x - hw, z - hd, x + hw, z + hd, 's', 1.5); W.rects[W.rects.length - 1].car = true;
    container(x - Math.sin(ry) * 2.5, z - Math.cos(ry) * 2.5, o.taxi ? 'Abrir mala do táxi' : o.police ? 'Abrir mala da polícia' : 'Abrir mala do carro', o.police ? 'carropol' : 'carro', { y: 0.7 });
    mp(x - hw, z - hd, x + hw, z + hd, '#5b5e62');
  };
  const cone = (x, z) => { b.cyl(0.04, 0.17, 0.62, 10, x, 0.33, z, 0xe8662a); b.box(0.38, 0.04, 0.38, x, 0.02, z, 0xe8662a); b.cyl(0.11, 0.135, 0.09, 10, x, 0.3, z, WHITE); };
  const barrier = (x, z, ry = 0) => { b.push(x, 0, z, ry); for (const sx of [-0.8, 0.8]) b.box(0.08, 0.9, 0.5, sx, 0.45, 0, 0xd8d4c8); b.box(1.9, 0.22, 0.06, 0, 0.75, 0, 0xe8a62a); b.box(1.9, 0.14, 0.06, 0, 0.45, 0, WHITE); b.pop(); };
  const bags = (x, z) => { for (let i = 0; i < 3; i++) b.ico(rr(0.25, 0.4), x + rr(-0.4, 0.4), 0.22, z + rr(-0.3, 0.3), pick([0x2a2b2c, 0x3c4a8a, 0xd8d8cf]), { det: 1, sy: 0.8 }); };
  const blood = (x, z, s = 1) => { for (let i = 0; i < 4; i++) { const g = new THREE.CircleGeometry(rr(0.15, 0.5) * s, 9); g.rotateX(-Math.PI / 2); b.add(g, 0x6e1812, 'decal', mat4(x + rr(-0.6, 0.6) * s, 0.045, z + rr(-0.6, 0.6) * s)); } };
  const bike = (x, z, ry) => { b.push(x, 0, z, ry); for (const s of [-0.5, 0.5]) b.add(new THREE.TorusGeometry(0.3, 0.03, 5, 14), 0x1b1b1c, 'v', mat4(0, 0.32, s, Math.PI / 2)); b.box(0.04, 0.04, 1.0, 0, 0.55, 0, pick([0x2f6fb3, 0xc23a2e, 0xe9e7e1]), { mat: 'm' }); b.box(0.04, 0.4, 0.04, 0, 0.62, -0.25, 0x333); b.box(0.5, 0.04, 0.04, 0, 0.92, 0.4, 0x333); b.box(0.32, 0.22, 0.3, 0, 0.8, 0.62, 0x333); b.pop(); };
  const bench = (x, z, ry) => { b.push(x, 0, z, ry); b.box(1.6, 0.06, 0.45, 0, 0.45, 0, 0x8a5a32); b.box(1.6, 0.3, 0.05, 0, 0.7, -0.2, 0x8a5a32); for (const s of [-0.7, 0.7]) b.box(0.05, 0.45, 0.4, s, 0.22, 0, 0x3a3b3c, { mat: 'm' }); b.pop(); };
  const lantern = (x, y, z) => { b.cyl(0.18, 0.18, 0.5, 10, x, y, z, new THREE.Color(1.8, 0.35, 0.2), { mat: 'lit' }); b.cyl(0.19, 0.19, 0.05, 10, x, y + 0.27, z, 0x1d1d1d); b.cyl(0.19, 0.19, 0.05, 10, x, y - 0.27, z, 0x1d1d1d); };

  // ---------- edifícios
  // janela: retângulo de vidro escuro com caixilho; cara: 's' (+z) ou 'e' (+x)
  const litW = () => { const r = rnd(); return r < 0.22 ? 'nwin' : r < 0.3 ? 'nwin2' : 'win'; }; // à noite, umas janelas acendem-se
  const winS = (x, y, z, w, h, frame = 0xd9d6cf) => { b.box(w + 0.12, h + 0.12, 0.06, x, y, z + 0.02, frame); b.box(w, h, 0.06, x, y, z + 0.05, 0x40505e, { mat: litW(), jit: 0.15 }); b.box(w + 0.16, 0.07, 0.16, x, y - h / 2 - 0.06, z + 0.08, frame); };
  const winE = (x, y, z, w, h, frame = 0xd9d6cf) => { b.box(0.06, h + 0.12, w + 0.12, x + 0.02, y, z, frame); b.box(0.06, h, w, x + 0.05, y, z, 0x40505e, { mat: litW(), jit: 0.15 }); };
  const ac = (x, y, z, f = 's') => { if (f === 's') { b.box(0.8, 0.55, 0.3, x, y, z + 0.15, 0xdcdad4); b.cyl(0.2, 0.2, 0.02, 12, x - 0.1, y, z + 0.31, 0x5a5a58, { rx: Math.PI / 2 }); } else { b.box(0.3, 0.55, 0.8, x + 0.15, y, z, 0xdcdad4); } };
  const roofKit = (x0, z0, x1, z1, y, R = null) => { // R: telhado onde se pode estar (o que lá está em cima trava quem anda)
    const rr2 = (cx, cz, hw, hd, h) => { if (R) W.rects.push({ x0: cx - hw, z0: cz - hd, x1: cx + hw, z1: cz + hd, k: 's', h, lv: R.lv, yb: R.yb, roof: 1 }); };
    b.box(x1 - x0, 0.45, 0.18, (x0 + x1) / 2, y + 0.22, z1 - 0.09, 0x9a968e); b.box(x1 - x0, 0.45, 0.18, (x0 + x1) / 2, y + 0.22, z0 + 0.09, 0x9a968e);
    b.box(0.18, 0.45, z1 - z0, x0 + 0.09, y + 0.22, (z0 + z1) / 2, 0x9a968e); b.box(0.18, 0.45, z1 - z0, x1 - 0.09, y + 0.22, (z0 + z1) / 2, 0x9a968e);
    const n = ri(1, 3); for (let i = 0; i < n; i++) { const ax = rr(x0 + 1.2, x1 - 1.2), az = rr(z0 + 1.2, z1 - 1.2); b.box(1.1, 0.7, 0.8, ax, y + 0.35, az, 0xcfcbc2); b.cyl(0.28, 0.28, 0.04, 12, ax, y + 0.72, az, 0x555); rr2(ax, az, 0.57, 0.42, 0.75); }
    if (rnd() < 0.5) { const tx = rr(x0 + 1.5, x1 - 1.5), tz = rr(z0 + 1.5, z1 - 1.5); b.cyl(0.8, 0.8, 1.6, 12, tx, y + 1.6, tz, 0xc9c4b8); for (const s of [-0.5, 0.5]) b.box(0.08, 0.9, 0.08, tx + s, y + 0.45, tz, 0x555); rr2(tx, tz, 0.8, 0.8, 2.4); }
    if (rnd() < 0.4) { b.cyl(0.03, 0.03, 3, 5, rr(x0 + 1, x1 - 1), y + 1.5, rr(z0 + 1, z1 - 1), 0x555); }
  };
  const vsign = (x, y0, z, text, bg, fg, ry = 0, w = 0.7, h = 3.2) => { // letreiro vertical saliente, perpendicular à fachada
    const s = A.sign(text, { w: 72, h: Math.max(144, Math.min(432, Math.round(72 * h / w))), bg, fg, vertical: true, pad: 0.08, border: rnd() < 0.5 ? fg : null });
    b.push(x, y0 + h / 2, z, ry); b.box(0.16, h + 0.1, w + 0.1, 0, 0, 0, 0x2a2b2c);
    b.plane(w, h, 0.085, 0, 0, 0xffffff, { mat: 'sign', uv: s, ry: Math.PI / 2 }); b.plane(w, h, -0.085, 0, 0, 0xffffff, { mat: 'sign', uv: s, ry: -Math.PI / 2 }); b.pop();
  };
  const hsign = (x, y, z, text, bg, fg, w = 3, h = 0.8, o = {}) => { const s = A.sign(text, { w: 320, h: Math.max(48, Math.round(320 * h / w)), bg, fg, pad: 0.12, sub: o.sub, font: o.font, weight: o.weight }); b.box(w + 0.1, h + 0.1, 0.12, x, y, z, 0x2a2b2c); b.plane(w, h, x, y, z + 0.065, 0xffffff, { mat: o.dim ? 'paint' : 'sign', uv: s, ry: o.ry || 0 }); };
  const PAL = [0xd9d4ca, 0xc9c2b4, 0xb8b3aa, 0xe2ddd2, 0x9fa3a6, 0xcdb9a0, 0xa8a094, 0x8c8f92, 0xd7cdbb];

  // torre não enterável (a parte de cima some se tapar o jogador)
  let tid = 0;
  const tower = (x0, z0, x1, z1, floors, o = {}) => {
    const id = 't' + (tid++), fh = 3.2, g = 3.8, H = g + (floors - 1) * fh, col = o.col ?? pick(PAL), w = x1 - x0, d = z1 - z0;
    rect(x0, z0, x1, z1, 's', H); mp(x0, z0, x1, z1, '#6f6b64');
    // rés do chão (fica sempre)
    b.box(w, g, d, (x0 + x1) / 2, g / 2, (z0 + z1) / 2, shade(col, 0.82));
    if (o.shop !== false) { // montra com estore ou vidro
      const sw = Math.min(w - 1, o.shopW ?? w * 0.7), sx = (x0 + x1) / 2 + (o.shopOff ?? 0);
      if (rnd() < 0.45) { b.box(sw, 2.5, 0.08, sx, 1.35, z1 + 0.04, 0xa3a5a7, { mat: 'm', jit: 0.1 }); for (let y = 0.25; y < 2.6; y += 0.22) b.box(sw, 0.03, 0.1, sx, y, z1 + 0.05, 0x76787a); }
      else { b.box(sw, 2.4, 0.06, sx, 1.4, z1 + 0.04, 0x1e2a30, { mat: 'win' }); b.box(sw - 0.4, 0.06, 0.06, sx, 2.5, z1 + 0.08, new THREE.Color(1.4, 1.3, 1.1), { mat: 'lit' }); }
      if (o.awn !== false) { const ac2 = o.awnC ?? pick([0x2f5a8a, 0x8a2a2a, 0x2f6a4a, 0x6a6a6a, 0xb8862a]); b.box(sw + 0.4, 0.12, 1.1, sx, 2.95, z1 + 0.55, ac2, { rx: 0.18 }); }
      if (o.sign) hsign(sx, 3.4, z1 + 0.02, o.sign[0], o.sign[1], o.sign[2], Math.min(sw, 4.2), 0.7, { sub: o.sign[3] });
    }
    b.cut = id;
    b.box(w, H - g, d, (x0 + x1) / 2, g + (H - g) / 2, (z0 + z1) / 2, col, { jit: 0.03 });
    b.box(w + 0.1, 0.18, d + 0.1, (x0 + x1) / 2, g, (z0 + z1) / 2, shade(col, 0.7));
    const style = o.style ?? pick(['punch', 'band', 'balc']);
    for (let f = 1; f < floors; f++) {
      const y = g + (f - 1) * fh + fh * 0.52;
      if (style !== 'balc') { b.box(w + 0.08, 0.12, 0.08, (x0 + x1) / 2, g + (f - 1) * fh, z1 + 0.04, shade(col, 0.82)); b.box(0.08, 0.12, d + 0.08, x1 + 0.04, g + (f - 1) * fh, (z0 + z1) / 2, shade(col, 0.82)); }
      if (style === 'band') { b.box(w - 0.6, fh * 0.5, 0.06, (x0 + x1) / 2, y, z1 + 0.03, 0x3e4c58, { mat: rnd() < 0.3 ? 'nwin2' : 'win', jit: 0.1 }); for (let x = x0 + 0.3; x <= x1 - 0.3; x += 1.5) b.box(0.08, fh * 0.5, 0.1, x, y, z1 + 0.06, shade(col, 0.75)); b.box(0.06, fh * 0.5, d - 0.6, x1 + 0.03, y, (z0 + z1) / 2, 0x3e4c58, { mat: 'win' }); }
      else if (style === 'balc') { for (let x = x0 + 1.6; x < x1 - 1; x += 3.2) { winS(x, y, z1, 1.6, 1.7); b.box(2.6, 0.9, 0.04, x, y - 0.75, z1 + 0.9, 0xc9cdd0, { mat: 'gl' }); b.box(2.7, 0.08, 0.9, x, y - 1.25, z1 + 0.45, shade(col, 0.85)); b.box(2.7, 0.05, 0.05, x, y - 0.3, z1 + 0.9, 0x7a7e82, { mat: 'm' }); if (rnd() < 0.5) ac(x + 1.0, y - 0.95, z1 + 0.1); if (rnd() < 0.3) b.box(0.8, 0.5, 0.02, x - 0.6, y - 0.6, z1 + 0.7, pick([0xe8e4da, 0x7aa0c8, 0xd88a8a])); } for (let z = z0 + 1.4; z < z1 - 0.8; z += 2.8) winE(x1, y, z, 1.3, 1.5); }
      else { for (let x = x0 + 1.1; x < x1 - 0.7; x += 2.0) winS(x, y, z1, 1.2, 1.5); for (let z = z0 + 1.2; z < z1 - 0.7; z += 2.2) winE(x1, y, z, 1.1, 1.5); if (rnd() < 0.6) ac(x0 + 0.7, y - 0.5, z1); }
    }
    roofKit(x0, z0, x1, z1, H);
    if (o.vs) vsign(x1 - 0.3, g + 0.6, z1 + 0.45, o.vs[0], o.vs[1], o.vs[2], 0, 0.75, Math.min(H - g - 1.4, o.vs[3] ?? 6));
    if (o.roofSign) { const s = A.sign(o.roofSign[0], { w: 512, h: 128, bg: o.roofSign[1], fg: o.roofSign[2], pad: 0.12 }); b.box(6.2, 1.7, 0.12, (x0 + x1) / 2, H + 1.4, z1 - 1, 0x2a2b2c); b.plane(6, 1.5, (x0 + x1) / 2, H + 1.4, z1 - 0.93, 0xffffff, { mat: 'sign', uv: s }); for (const s2 of [-2, 2]) b.box(0.1, 1, 0.1, (x0 + x1) / 2 + s2, H + 0.5, z1 - 1.05, 0x444); }
    b.cut = null;
    W.cuts.push({ id, x0, z0, x1, z1, y0: g, y1: H + 2, enter: false });
    return H;
  };

  // portas a sério: fechadas travam e tapam; abertas ficam encostadas para dentro (uma ou duas folhas)
  const door = (horiz, fixed, inward, s0, s1, t, L, C, cut, col) => {
    const n = s1 - s0 >= 1.75 ? 2 : 1, lw = (s1 - s0 - 0.03) / n, face = fixed + inward * (t / 2 - 0.03);
    const th = (dx, dz) => Math.atan2(-dz, dx);
    const D = { x: horiz ? (s0 + s1) / 2 : fixed, z: horiz ? fixed : (s0 + s1) / 2, horiz, inward, lv: L, C, cut, col, w: s1 - s0, leaves: [], ro: [], t: 0, auto: false };
    D.t = D.target = rnd() < 0.2 ? 1 : 0;
    D.rc = { x0: horiz ? s0 : fixed - t / 2, z0: horiz ? fixed - t / 2 : s0, x1: horiz ? s1 : fixed + t / 2, z1: horiz ? fixed + t / 2 : s1, k: 's', h: 2.3, lv: L, door: D };
    W.rects.push(D.rc);
    for (let i = 0; i < n; i++) {
      const sg = i === 0 ? 1 : -1, hs = i === 0 ? s0 + 0.012 : s1 - 0.012;
      const hx = horiz ? hs : face, hz = horiz ? face : hs;
      const cdx = horiz ? sg : 0, cdz = horiz ? 0 : sg, odx = horiz ? 0 : inward, odz = horiz ? inward : 0;
      const tc = th(cdx, cdz); let to = th(odx, odz); let d = to - tc; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      D.leaves.push({ hx, hz, tc, to: tc + d, w: lw });
      const ex = hx + odx * lw, ez = hz + odz * lw, e = 0.05;
      const r = { x0: Math.min(hx, ex) - (horiz ? e : 0), z0: Math.min(hz, ez) - (horiz ? 0 : e), x1: Math.max(hx, ex) + (horiz ? e : 0), z1: Math.max(hz, ez) + (horiz ? 0 : e), k: 'l', h: 2.2, lv: L, door: D, leaf: true };
      W.rects.push(r); D.ro.push(r);
    }
    W.doors.push(D);
  };
  // edifício onde se entra: paredes com portas e janelas, telhado e parte de cima das paredes da frente somem
  let eid = 0;
  const shell = (x0, z0, x1, z1, o = {}) => {
    const id = 'e' + (eid++), h = o.h ?? 3.4, t = 0.22, wall = o.wall ?? 0xd9d4ca, cutY = 1.1, trim = o.trim ?? 0x6a6e72, doorC = o.doorC ?? 0x6a4a32;
    const n = o.floors ?? 1, fh = h + 0.3;
    const C = { id, x0, z0, x1, z1, y0: cutY, y1: (n - 1) * fh + h + 2, enter: true, shell: true, n, fh, ix0: x0 + t, iz0: z0 + t, ix1: x1 - t, iz1: z1 - t, name: o.name, stairs: [] };
    mp(x0, z0, x1, z1, o.mapc ?? '#7c776f');
    const derive = ops => { const out = {}; for (const sd of ['n', 's', 'e', 'w']) out[sd] = (ops[sd] || []).filter(op => op.w <= 2.6).map(op => ({ at: op.at, w: Math.min(op.w, 1.6), k: 'w' })); return out; };
    const stairs = (o.stairs || []).map(st => ({ ...st, fh, b: C }));
    for (let L = 0; L < n; L++) {
      CUR = L; const yb = L * fh, gk = L ? id + ':' + L : null, gt = id + ':' + L + 't'; const r0 = W.rects.length;
      const ops = L === 0 ? (o.ops || {}) : (o.opsUp || derive(o.ops || {}));
      b.cut = gk; b.push(0, yb, 0);
      if (L === 0) { b.floor(x0 + t, z0 + t, x1 - t, z1 - t, 0.035, o.floor ?? 0xb9b2a4, o.floorMat ?? 'v'); W.steps.push({ x0, z0, x1, z1, y: 0.05 }); }
      else {
        let parts = [[x0 + t, z0 + t, x1 - t, z1 - t]];
        for (const st of stairs) if (st.lv === L - 1) { const np = []; for (const [a0, c0, a1, c1] of parts) { if (st.x1 <= a0 || st.x0 >= a1 || st.z1 <= c0 || st.z0 >= c1) { np.push([a0, c0, a1, c1]); continue; } if (st.z0 > c0) np.push([a0, c0, a1, st.z0]); if (st.z1 < c1) np.push([a0, st.z1, a1, c1]); const zz0 = Math.max(c0, st.z0), zz1 = Math.min(c1, st.z1); if (st.x0 > a0) np.push([a0, zz0, st.x0, zz1]); if (st.x1 < a1) np.push([st.x1, zz0, a1, zz1]); } parts = np; }
        for (const [a0, c0, a1, c1] of parts) { b.box(a1 - a0, 0.3, c1 - c0, (a0 + a1) / 2, -0.15, (c0 + c1) / 2, shade(wall, 0.8)); b.floor(a0, c0, a1, c1, 0.035, o.floorUp ?? o.floor ?? 0xb9b2a4); }
      }
      const side = (sd) => {
        const horiz = sd === 's' || sd === 'n', a0 = horiz ? x0 : z0, a1 = horiz ? x1 : z1, fixed = sd === 's' ? z1 - t / 2 : sd === 'n' ? z0 + t / 2 : sd === 'e' ? x1 - t / 2 : x0 + t / 2;
        const cut = sd === 's' || sd === 'e';
        const list = (ops[sd] || []).slice().sort((p, q) => p.at - q.at);
        let cur = a0; const segs = [];
        for (const op of list) { segs.push([cur, op.at - op.w / 2, null]); segs.push([op.at - op.w / 2, op.at + op.w / 2, op]); cur = op.at + op.w / 2; }
        segs.push([cur, a1, null]);
        const piece = (s0, s1, y0, y1, hex, m = 'v', inCut = false) => {
          if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return; const Ln = s1 - s0, c = (s0 + s1) / 2;
          b.cut = inCut ? gt : gk;
          if (horiz) b.box(Ln, y1 - y0, t, c, (y0 + y1) / 2, fixed, hex, { mat: m }); else b.box(t, y1 - y0, Ln, fixed, (y0 + y1) / 2, c, hex, { mat: m });
          b.cut = gk;
        };
        const col = (s0, s1, k, hh = h) => { if (horiz) rect(s0, fixed - t / 2, s1, fixed + t / 2, k, hh); else rect(fixed - t / 2, s0, fixed + t / 2, s1, k, hh); };
        const pl = shade(wall, 0.7), jt = t + 0.08;
        const bx = (a0_, a1_, y0, y1, th, hex, m = 'v', o2 = 0) => { const Ln = a1_ - a0_, c = (a0_ + a1_) / 2; if (Ln <= 0.005) return; if (horiz) b.box(Ln, y1 - y0, th, c, (y0 + y1) / 2, fixed + o2, hex, { mat: m }); else b.box(th, y1 - y0, Ln, fixed + o2, (y0 + y1) / 2, c, hex, { mat: m }); };
        const rec = (s0, s1, op, y0, y1) => W.openings.push({ x: horiz ? (s0 + s1) / 2 : fixed, z: horiz ? fixed : (s0 + s1) / 2, horiz, w: s1 - s0, y0: y0 + yb, y1: y1 + yb, k: op.k });
        for (const [s0, s1, op] of segs) {
          if (!op) { if (cut) { piece(s0, s1, 0, cutY, wall); piece(s0, s1, cutY, h, wall, 'v', true); } else piece(s0, s1, 0, h, wall); col(s0, s1, 's'); if (L === 0) bx(s0, s1, 0, 0.3, t + 0.06, pl); }
          else if (op.k === 'd') {
            piece(s0, s1, 2.3, h, wall, 'v', cut);
            bx(s0 - 0.1, s0, 0, 2.35, jt, trim); bx(s1, s1 + 0.1, 0, 2.35, jt, trim);
            b.cut = cut ? gt : gk; bx(s0 - 0.1, s1 + 0.1, 2.3, 2.42, jt, trim); b.cut = gk;
            const inward = (sd === 's' || sd === 'e') ? -1 : 1;
            if (op.w <= 2.4) door(horiz, fixed, inward, s0, s1, t, L, C, cut, doorC);
            else { b.cut = cut ? gt : gk; bx(s0, s1, 1.95, 2.3, 0.45, 0x8a8e92, 'm', inward * 0.12); b.cut = gk; }
            rec(s0, s1, op, 0, 2.3);
          }
          else { // janela: baixo sólido, vidro (as balas passam e dá para saltar por ela), cima sólido
            piece(s0, s1, 0, 0.95, wall); piece(s0, s1, 0.95, 2.25, 0x9ab8c8, 'gl', cut); piece(s0, s1, 2.25, h, wall, 'v', cut);
            if (L === 0) bx(s0, s1, 0, 0.3, t + 0.06, pl);
            b.cut = cut ? gt : gk;
            bx(s0 - 0.05, s1 + 0.05, 0.9, 0.98, t + 0.16, 0xe5e2da); bx(s0 - 0.07, s0 + 0.01, 0.95, 2.29, t + 0.06, trim); bx(s1 - 0.01, s1 + 0.07, 0.95, 2.29, t + 0.06, trim); bx(s0 - 0.07, s1 + 0.07, 2.22, 2.3, t + 0.06, trim);
            bx((s0 + s1) / 2 - 0.025, (s0 + s1) / 2 + 0.025, 0.95, 2.25, t + 0.03, trim); bx(s0, s1, 1.63, 1.67, t + 0.03, trim);
            b.cut = gk;
            col(s0, s1, 'g', 0.95); W.rects[W.rects.length - 1].win = true; rec(s0, s1, op, 0.95, 2.25);
          }
        }
      };
      ['n', 'w', 's', 'e'].forEach(side);
      // escadas que começam neste piso
      for (const st of stairs) if (st.lv === L) {
        const ax = st.axis === 'x', len = ax ? st.x1 - st.x0 : st.z1 - st.z0, N = 14, run = len / N, rise = fh / N;
        const bot = ax ? (st.dir > 0 ? st.x0 : st.x1) : (st.dir > 0 ? st.z0 : st.z1), cw = ax ? st.z1 - st.z0 : st.x1 - st.x0, cc = ax ? (st.z0 + st.z1) / 2 : (st.x0 + st.x1) / 2;
        for (let i = 0; i < N; i++) { const u = bot + st.dir * (i + 0.5) * run, hh = (i + 1) * rise; if (ax) b.box(run + 0.01, hh, cw, u, hh / 2, cc, o.stairC ?? 0x9a8a72); else b.box(cw, hh, run + 0.01, cc, hh / 2, u, o.stairC ?? 0x9a8a72); }
        const op = st.open, oc = op === 's' ? st.z1 : op === 'n' ? st.z0 : op === 'e' ? st.x1 : st.x0;
        for (let i = 0; i <= N; i += 2) { const u = bot + st.dir * Math.min(len - 0.05, i * run + 0.05), hh = Math.max(0.05, i * rise); if (ax) { b.box(0.05, 0.95, 0.05, u, hh + 0.47, oc, 0x5a5e62, { mat: 'm' }); if (i < N) b.box(run * 2, 0.05, 0.06, u + st.dir * run, hh + 0.95 + rise, oc, 0x5a5e62, { mat: 'm', rz: -st.dir * Math.atan(rise / run) }); } else { b.box(0.05, 0.95, 0.05, oc, hh + 0.47, u, 0x5a5e62, { mat: 'm' }); if (i < N) b.box(0.06, 0.05, run * 2, oc, hh + 0.95 + rise, u + st.dir * run, 0x5a5e62, { mat: 'm', rx: st.dir * Math.atan(rise / run) }); } }
        // colisões: corrimão dos dois pisos, topo fechado em baixo, ponta de baixo fechada em cima
        const th = 0.12;
        const rr2 = (lv, a0_, c0, a1_, c1) => { const k = W.rects.push({ x0: Math.min(a0_, a1_), z0: Math.min(c0, c1), x1: Math.max(a0_, a1_), z1: Math.max(c0, c1), k: 'l', h: 1.0, lv, stairRail: true }); };
        if (ax) { rr2(L, st.x0, oc - th, st.x1, oc + th); rr2(L + 1, st.x0, oc - th, st.x1, oc + th); const top = st.dir > 0 ? st.x1 : st.x0; rr2(L, top - th, st.z0, top + th, st.z1); rr2(L + 1, bot - th, st.z0, bot + th, st.z1); }
        else { rr2(L, oc - th, st.z0, oc + th, st.z1); rr2(L + 1, oc - th, st.z0, oc + th, st.z1); const top = st.dir > 0 ? st.z1 : st.z0; rr2(L, st.x0, top - th, st.x1, top + th); rr2(L + 1, st.x0, bot - th, st.x1, bot + th); }
        const sd = { x0: st.x0, z0: st.z0, x1: st.x1, z1: st.z1, axis: st.axis, dir: st.dir, open: st.open, lv: L, fh, b: C, ax, bot, top: ax ? (st.dir > 0 ? st.x1 : st.x0) : (st.dir > 0 ? st.z1 : st.z0), cc };
        W.stairs.push(sd); C.stairs.push(sd);
      }
      b.pop(); b.cut = null;
      if (o.levels && o.levels[L]) level(C, L, o.levels[L]);
      for (let i = r0; i < W.rects.length; i++) W.rects[i].yb = yb; // altura do chão deste piso (para as balas)
    }
    CUR = 0;
    // telhado
    const top = (n - 1) * fh + h;
    b.cut = id + ':R'; b.push(0, top - h, 0);
    if (o.roof === 'kawara') {
      const rh = 1.5, ov = 0.5, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w2 = x1 - x0 + ov * 2, half = (z1 - z0) / 2 + ov;
      const ang = Math.atan2(rh, half), len = Math.hypot(rh, half), RC = o.roofC ?? 0x3b4048;
      for (const s of [-1, 1]) {
        b.box(w2, 0.16, len, cx, h + rh / 2, cz + s * half / 2, RC, { rx: s * ang });
        for (let i = 1; i < 7; i++) b.box(w2, 0.06, 0.08, cx, h + rh * (1 - i / 7) + 0.1, cz + s * half * (i / 7), shade(RC, 0.78), { rx: s * ang });
      }
      b.box(w2 + 0.1, 0.24, 0.32, cx, h + rh + 0.06, cz, shade(RC, 0.75));
      const pk = rh * (1 - ov / half);
      for (const gx of [x0, x1]) { const sh = new THREE.Shape(); sh.moveTo(-(z1 - cz), 0); sh.lineTo(-(z0 - cz), 0); sh.lineTo(0, pk); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false }); g.rotateY(Math.PI / 2); b.add(g, wall, 'v', mat4(gx - 0.1, h, cz)); }
      b.box(x1 - x0 + 0.1, 0.12, z1 - z0 + 0.1, cx, h + 0.06, cz, wall);
    } else {
      b.box(x1 - x0 + 0.2, 0.28, z1 - z0 + 0.2, (x0 + x1) / 2, h + 0.14, (z0 + z1) / 2, o.roofC ?? 0x8f8b84);
      if (!o.upper) { C.roofY = top + 0.28; if (x1 - x0 > 7) roofKit(x0, z0, x1, z1, h + 0.28, { lv: n, yb: C.roofY }); } // telhado plano: dá para estar lá em cima (o helicóptero aterra)
    }
    if (o.upper) {
      const ufh = 3.2, H = h + o.upper * ufh, col2 = o.upperCol ?? pick(PAL);
      b.box(x1 - x0, H - h, z1 - z0, (x0 + x1) / 2, h + (H - h) / 2 + 0.28, (z0 + z1) / 2, col2, { jit: 0.03 });
      for (let f = 0; f < o.upper; f++) { const y = h + 0.28 + f * ufh + ufh * 0.52; for (let x = x0 + 1.1; x < x1 - 0.7; x += 2.0) winS(x, y, z1, 1.2, 1.5); for (let z = z0 + 1.2; z < z1 - 0.7; z += 2.2) winE(x1, y, z, 1.1, 1.5); }
      C.roofY = top - h + H + 0.28; roofKit(x0, z0, x1, z1, H + 0.28, { lv: n, yb: C.roofY });
      C.y1 = H + 2;
    }
    if (o.cutExtra) o.cutExtra();
    b.pop(); b.cut = null;
    if (o.vs) vsign(x1 + 0.1, 1.0, z1 - 0.6, o.vs[0], o.vs[1], o.vs[2], 0, 0.75, Math.min(top + (o.upper ? o.upper * 3.2 : 0) - 2, 8));
    b.cyl(0.05, 0.05, top, 6, x1 + 0.06, top / 2, z1 + 0.06, 0x7a7e82, { mat: 'm' });
    W.cuts.push(C);
    return C;
  };
  // mobília num piso de cima de um edifício (vai para o grupo desse piso)
  const level = (C, L, fn) => { const prev = CUR; CUR = L; b.cut = L ? C.id + ':' + L : null; b.push(0, L * C.fh, 0); fn(C); b.pop(); b.cut = null; CUR = prev; };

  // mobília e contentores
  const shelf = guard((x, z, len, ry = 0, label = 'Revistar prateleira', table = 'konbini') => {
    b.push(x, 0, z, ry);
    // gôndola de loja: rodapé escuro, painel do meio, prateleiras finas com etiqueta de preço e produtos de vários feitios (caixas, garrafas, copos de ramen)
    // (os pormenores usam um sorteio próprio, pela posição: não mexem no resto do mapa)
    for (let s = 0; s < 3; s++) for (let i = 0; i < len / 0.22 - 1; i++) for (let k = 0; k < 2; k++) { rr(0, 1); pick([0]); } // gasta os mesmos sorteios que a versão antiga (o resto do mapa fica igual)
    let hs = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1; const hr = () => (hs = (hs * 9301 + 0.49297) % 1, hs);
    b.box(len, 0.12, 0.72, 0, 0.06, 0, 0x3a3d40); b.box(len, 1.5, 0.08, 0, 0.75, 0, 0xd9dcd8); for (const sx of [-1, 1]) b.box(0.05, 1.56, 0.72, sx * (len / 2 - 0.025), 0.78, 0, 0xc8cbc7, { mat: 'm' });
    b.box(len + 0.04, 0.05, 0.74, 0, 1.55, 0, 0xcfd2cf);
    const COL = [0xd64a3a, 0x3a78c4, 0xf2c84a, 0x4aa86a, 0xf4f1ea, 0xf28a3a, 0x8a4ab0, 0x2a2b2e, 0xe86a8a, 0x5ac8c8];
    for (let s = 0; s < 3; s++) { const y0 = 0.14 + s * 0.46;
      for (const sd of [-1, 1]) { b.box(len - 0.1, 0.025, 0.3, 0, y0, sd * 0.2, 0xe8eae6, { mat: 'm' }); b.box(len - 0.1, 0.045, 0.012, 0, y0 + 0.005, sd * 0.352, 0xf6f3e8); // prateleira e régua de preços
        let px = -len / 2 + 0.12; while (px < len / 2 - 0.14) { const kind = hr(), c = COL[Math.floor(hr() * COL.length)], depth = 0.22;
          if (kind < 0.5) { const w = 0.09 + hr() * 0.1, h = 0.12 + hr() * 0.2; for (let r = 0; r < 2; r++) b.box(w - 0.01, h, depth / 2 - 0.01, px + w / 2, y0 + 0.013 + h / 2, sd * (0.12 + r * 0.11), c); b.box(w - 0.012, h * 0.35, 0.004, px + w / 2, y0 + h * 0.55, sd * 0.33, shade(c, 1.35)); px += w + 0.012; }
          else if (kind < 0.8) { const r0 = 0.032 + hr() * 0.012, h = 0.2 + hr() * 0.1; for (let r = 0; r < 2; r++) { b.cyl(r0, r0, h, 8, px + r0, y0 + 0.013 + h / 2, sd * (0.15 + r * 0.1), c); b.cyl(r0 * 0.45, r0 * 0.6, 0.05, 6, px + r0, y0 + 0.013 + h + 0.025, sd * (0.15 + r * 0.1), shade(c, 0.6)); } b.cyl(r0 + 0.002, r0 + 0.002, h * 0.35, 8, px + r0, y0 + h * 0.45, sd * 0.25, 0xf4f1ea); px += r0 * 2 + 0.014; }
          else { const r0 = 0.055; for (let r = 0; r < 2; r++) { b.cyl(r0, r0 * 0.8, 0.11, 10, px + r0, y0 + 0.068, sd * (0.15 + r * 0.11), 0xf4f1ea); b.cyl(r0 + 0.003, r0 + 0.003, 0.01, 10, px + r0, y0 + 0.126, sd * (0.15 + r * 0.11), c); } px += r0 * 2 + 0.012; } } } }
    b.box(len - 0.3, 0.16, 0.012, 0, 1.68, 0.05, 0xf6f3e8); b.box(len - 0.3, 0.16, 0.012, 0, 1.68, -0.05, 0xf6f3e8); b.box(len - 0.3, 0.04, 0.09, 0, 1.6, 0, 0x9a9ea2, { mat: 'm' }); // letreiro em cima
    b.pop();
    const cs = Math.abs(Math.sin(ry)) > 0.5; rect(x - (cs ? 0.35 : len / 2), z - (cs ? len / 2 : 0.35), x + (cs ? 0.35 : len / 2), z + (cs ? len / 2 : 0.35), 's', 1.5);
    return container(x, z, label, table);
  });
  const fridge = guard((x, z, len) => { b.box(len, 2.1, 0.8, x, 1.05, z, 0xd8dbdc, { mat: 'm' }); b.box(len - 0.2, 1.7, 0.04, x, 1.1, z + 0.41, 0x9ab8c8, { mat: 'gl' }); for (let i = 0; i < 4; i++) b.box(len - 0.3, 0.03, 0.6, x, 0.45 + i * 0.42, z, new THREE.Color(1.3, 1.4, 1.5), { mat: 'lit' }); for (let i = 0; i < len / 0.18; i++) for (let s = 0; s < 4; s++) b.cyl(0.05, 0.05, 0.26, 6, x - len / 2 + 0.2 + i * 0.18, 0.6 + s * 0.42, z + 0.2, pick([0x3a8ac8, 0x6ad04a, 0xd23a2e, 0xf0c23a, 0x8a5a3a])); rect(x - len / 2, z - 0.4, x + len / 2, z + 0.4, 's', 2.1); return container(x, z + 0.4, 'Abrir frigorífico', 'bebida'); });
  const counter = guard((x0, z0, x1, z1, c = 0x8a6a4a) => { b.box(x1 - x0, 1.0, z1 - z0, (x0 + x1) / 2, 0.5, (z0 + z1) / 2, c); b.box(x1 - x0 + 0.05, 0.05, z1 - z0 + 0.05, (x0 + x1) / 2, 1.02, (z0 + z1) / 2, 0xe8e4da); rect(x0, z0, x1, z1, 'l', 1); });
  const cabinet = guard((x, z, w, label, table, ry = 0, c = 0xdcdcd6) => { b.push(x, 0, z, ry); b.box(w, 1.9, 0.5, 0, 0.95, 0, c, { mat: 'm' }); b.box(0.02, 1.8, 0.02, 0, 0.95, 0.26, 0x777); for (const s of [-1, 1]) b.box(0.04, 0.2, 0.04, s * 0.12, 1.0, 0.27, 0x555); b.pop(); const cs = Math.abs(Math.sin(ry)) > 0.5; rect(x - (cs ? 0.25 : w / 2), z - (cs ? w / 2 : 0.25), x + (cs ? 0.25 : w / 2), z + (cs ? w / 2 : 0.25), 's', 1.9); return container(x, z, label, table); });
  const bed = guard((x, z, ry = 0, c = 0xe9ece9) => { b.push(x, 0, z, ry); b.box(0.95, 0.5, 2.0, 0, 0.35, 0, 0xb8bcbf, { mat: 'm' }); b.box(0.9, 0.18, 1.95, 0, 0.66, 0, c); b.box(0.7, 0.12, 0.4, 0, 0.78, -0.75, 0xffffff); b.box(0.9, 0.06, 1.2, 0, 0.77, 0.3, 0x7aa0b8); b.pop(); const cs = Math.abs(Math.sin(ry)) > 0.5; rect(x - (cs ? 1 : 0.48), z - (cs ? 0.48 : 1), x + (cs ? 1 : 0.48), z + (cs ? 0.48 : 1), 'l', 0.8); });
  const crate = guard((x, z, ry, label, table, c = 0x535c3b) => { b.push(x, 0, z, ry); b.rbox(1.3, 0.7, 0.8, 0.05, 0, 0.35, 0, c); b.box(1.32, 0.08, 0.82, 0, 0.55, 0, shade(c, 0.75)); for (const s of [-0.45, 0.45]) b.box(0.1, 0.72, 0.84, s, 0.36, 0, shade(c, 0.8)); b.box(0.5, 0.12, 0.02, 0, 0.4, 0.41, 0xd9cfae); b.pop(); const cs = Math.abs(Math.sin(ry)) > 0.5; rect(x - (cs ? 0.4 : 0.65), z - (cs ? 0.65 : 0.4), x + (cs ? 0.4 : 0.65), z + (cs ? 0.65 : 0.4), 'l', 0.7); return container(x, z, label, table, { y: 0.5 }); });
  const table = guard((x, z, w = 1.4, d = 0.8, c = 0x8a5a32) => { b.box(w, 0.06, d, x, 0.74, z, c); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.06, 0.72, 0.06, x + sx * (w / 2 - 0.08), 0.36, z + sz * (d / 2 - 0.08), shade(c, 0.7)); rect(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 'l', 0.8); });
  const chair = guard((x, z, ry = 0) => { b.push(x, 0, z, ry); b.box(0.42, 0.05, 0.42, 0, 0.45, 0, 0x5a4a3a); b.box(0.42, 0.45, 0.05, 0, 0.68, -0.2, 0x5a4a3a); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.04, 0.45, 0.04, sx * 0.18, 0.22, sz * 0.18, 0x3a3a3a); b.pop(); });

  // mais mobília para interiores
  const sofa = guard((x, z, ry = 0, c = 0x6a5a8a) => { b.push(x, 0, z, ry); b.rbox(1.9, 0.42, 0.85, 0.08, 0, 0.25, 0, c); b.rbox(1.9, 0.5, 0.2, 0.08, 0, 0.62, -0.33, shade(c, 0.85)); for (const sx of [-0.88, 0.88]) b.rbox(0.18, 0.55, 0.85, 0.06, sx, 0.35, 0, shade(c, 0.85)); b.pop(); const cs = Math.abs(Math.sin(ry)) > 0.5; rect(x - (cs ? 0.43 : 0.95), z - (cs ? 0.95 : 0.43), x + (cs ? 0.43 : 0.95), z + (cs ? 0.95 : 0.43), 'l', 0.7); });
  const books = guard((x, z, ry = 0, w = 1.2) => { b.push(x, 0, z, ry); b.box(w, 1.9, 0.35, 0, 0.95, 0, 0x6a4a2e); for (let r = 0; r < 4; r++) for (let i = 0; i < w / 0.07 - 2; i++) if (rnd() < 0.85) b.box(0.05, rr(0.2, 0.3), 0.25, -w / 2 + 0.1 + i * 0.07, 0.25 + r * 0.45, 0.02, pick([0x8a2a22, 0x2a4a7a, 0x3a6a3a, 0xc8a85a, 0x5a3a6a, 0xe8e4d8])); b.pop(); const cs = Math.abs(Math.sin(ry)) > 0.5; rect(x - (cs ? 0.18 : w / 2), z - (cs ? w / 2 : 0.18), x + (cs ? 0.18 : w / 2), z + (cs ? w / 2 : 0.18), 's', 1.9); });
  const stove = guard((x, z, ry = 0) => { b.push(x, 0, z, ry); b.box(0.7, 0.9, 0.6, 0, 0.45, 0, 0xe8e6e0, { mat: 'm' }); for (const sx of [-0.17, 0.17]) for (const sz of [-0.13, 0.13]) b.cyl(0.1, 0.1, 0.02, 10, sx, 0.91, sz, 0x2a2b2c); b.box(0.5, 0.35, 0.02, 0, 0.45, 0.31, 0x2a2b2c); b.pop(); rect(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 'l', 0.9); });
  const kfridge = guard((x, z, ry = 0, label = 'Abrir frigorífico', table = 'casa') => { b.push(x, 0, z, ry); b.box(0.7, 1.8, 0.65, 0, 0.9, 0, 0xe8e6e0, { mat: 'm' }); b.box(0.04, 0.5, 0.04, -0.28, 1.2, 0.34, 0x8a8e92); b.box(0.68, 0.02, 0.02, 0, 1.25, 0.33, 0x9a9ea2); b.pop(); rect(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 's', 1.8); return container(x, z, label, table); });
  const toilet = guard((x, z, ry = 0) => { b.push(x, 0, z, ry); b.cyl(0.18, 0.15, 0.4, 12, 0, 0.2, 0.05, 0xf0f0ee); b.box(0.4, 0.4, 0.18, 0, 0.55, -0.2, 0xf0f0ee); b.pop(); rect(x - 0.22, z - 0.3, x + 0.22, z + 0.3, 'l', 0.6); });
  const sinkI = guard((x, z, ry = 0) => { b.push(x, 0, z, ry); b.box(0.55, 0.8, 0.45, 0, 0.4, 0, 0xd8d4cc); b.box(0.45, 0.06, 0.35, 0, 0.82, 0.02, 0xf0f0ee); b.box(0.05, 0.15, 0.05, 0, 0.92, -0.15, 0xa8acb0, { mat: 'm' }); b.box(0.5, 0.6, 0.03, 0, 1.4, -0.21, 0x9ab0c0, { mat: 'win' }); b.pop(); rect(x - 0.28, z - 0.23, x + 0.28, z + 0.23, 'l', 0.85); });
  const lampF = guard((x, z) => { b.cyl(0.15, 0.18, 0.05, 10, x, 0.03, z, 0x2a2b2c); b.cyl(0.02, 0.02, 1.5, 6, x, 0.78, z, 0x2a2b2c, { mat: 'm' }); b.cyl(0.13, 0.2, 0.25, 10, x, 1.58, z, 0xe8dcc0); });
  const plantI = guard((x, z) => { b.cyl(0.18, 0.14, 0.36, 8, x, 0.18, z, 0xd8d4cc); for (let i = 0; i < 4; i++) b.ico(0.22, x + rr(-0.12, 0.12), 0.5 + i * 0.12, z + rr(-0.12, 0.12), pick([0x3f6a2a, 0x4a7a32, 0x5a8a3a]), { mat: 'vf', det: 0 }); circ(x, z, 0.2, 'l'); });
  const deskPC = guard((x, z, ry = 0) => { b.push(x, 0, z, ry); b.box(1.2, 0.05, 0.6, 0, 0.74, 0, 0x8a7a62); for (const sx of [-0.55, 0.55]) b.box(0.04, 0.72, 0.55, sx, 0.36, 0, 0x5a5e62); b.box(0.5, 0.32, 0.03, 0, 1.0, -0.15, 0x1a1c1e); b.box(0.06, 0.15, 0.06, 0, 0.82, -0.15, 0x2a2b2c); b.box(0.42, 0.02, 0.14, 0, 0.77, 0.1, 0x2a2b2c); b.pop(); const cs = Math.abs(Math.sin(ry)) > 0.5; rect(x - (cs ? 0.3 : 0.6), z - (cs ? 0.6 : 0.3), x + (cs ? 0.3 : 0.6), z + (cs ? 0.6 : 0.3), 'l', 0.8); });
  const ivStand = guard((x, z) => { b.cyl(0.015, 0.015, 1.8, 5, x, 0.9, z, 0xa8acb0, { mat: 'm' }); b.box(0.12, 0.18, 0.05, x, 1.65, z, 0xd8e8f0); b.cyl(0.2, 0.2, 0.03, 8, x, 0.03, z, 0xa8acb0, { mat: 'm' }); });
  const screenI = guard((x, z, ry = 0) => { b.push(x, 0, z, ry); b.box(0.04, 1.6, 1.8, 0, 0.95, 0, 0x8ab8c8); b.box(0.05, 0.08, 1.85, 0, 1.78, 0, 0xa8acb0, { mat: 'm' }); b.pop(); });
  const trolley = guard((x, z) => { b.box(0.6, 0.9, 0.5, x, 0.45, z, 0xb8bcbf, { mat: 'm' }); rect(x - 0.3, z - 0.25, x + 0.3, z + 0.25, 'l', 0.9); });
  const boxes = guard((x, z) => { for (let i = 0; i < 3; i++) { const s2 = rr(0.4, 0.6); b.box(s2, s2 * 0.8, s2, x + rr(-0.3, 0.3), s2 * 0.4 + (i === 2 ? 0.45 : 0), z + rr(-0.3, 0.3), pick([0xb8935a, 0xa8834a, 0xc8a36a]), { ry: rr(0, 1) }); } rect(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 'l', 0.9); });
  const tvI = guard((x, z, ry = 0) => { b.push(x, 0, z, ry); b.box(1.2, 0.45, 0.4, 0, 0.23, 0, 0x4a3a2c); b.box(1.0, 0.6, 0.06, 0, 0.78, -0.05, 0x1a1c1e); b.pop(); const cs = Math.abs(Math.sin(ry)) > 0.5; rect(x - (cs ? 0.2 : 0.6), z - (cs ? 0.6 : 0.2), x + (cs ? 0.2 : 0.6), z + (cs ? 0.6 : 0.2), 'l', 0.5); });
  const wardrobe = guard((x, z, ry = 0, c = 0x8a6a4a) => { b.push(x, 0, z, ry); b.box(1.3, 2.0, 0.55, 0, 1.0, 0, c); b.box(0.02, 1.9, 0.02, 0, 1.0, 0.28, shade(c, 0.7)); for (const sx of [-0.08, 0.08]) b.box(0.03, 0.18, 0.03, sx, 1.1, 0.29, 0xc9c4b8, { mat: 'm' }); b.pop(); const cs = Math.abs(Math.sin(ry)) > 0.5; rect(x - (cs ? 0.28 : 0.65), z - (cs ? 0.65 : 0.28), x + (cs ? 0.28 : 0.65), z + (cs ? 0.65 : 0.28), 's', 2); return container(x, z, 'Abrir roupeiro', 'casa'); });
  const rugI = (x, z, w, d, c) => { b.box(w, 0.012, d, x, 0.042, z, c, { mat: 'decal' }); b.box(w - 0.2, 0.013, d - 0.2, x, 0.043, z, shade(c, 1.25), { mat: 'decal' }); };
  const clutter = guard((x0, z0, x1, z1, n) => { for (let i = 0; i < n; i++) { const x = rr(x0 + 0.6, x1 - 0.6), z = rr(z0 + 0.6, z1 - 0.6), k = rnd(); if (k < 0.5) b.plane(rr(0.2, 0.32), rr(0.28, 0.4), x, 0.05, z, 0xe8e4d8, { mat: 'decal', rx: -Math.PI / 2, rz: rr(0, 3) }); else if (k < 0.75) b.cyl(0.035, 0.035, 0.22, 6, x, 0.05, z, pick([0x3a7a3a, 0x7a5a2a, 0xc8d8e0]), { rz: Math.PI / 2, ry: rr(0, 3) }); else b.box(rr(0.25, 0.4), 0.2, rr(0.2, 0.35), x, 0.1, z, pick([0xb8935a, 0x8a8478]), { ry: rr(0, 3) }); } });
  const vendI = (x, z, ry) => vend(x, z, ry, 0x2f6fb3);

  // ============ BAIRRO ============
  // --- quarteirão NO1 (z -22..-7): clínica de 3 pisos junto ao cruzamento + torres
  { const cl = shell(-21, -19.5, -8, -8.2, { name: 'Clínica Kurogane', wall: 0xe7e5df, floor: 0xd8dcd8, mapc: '#9aa7a3', floors: 3, h: 3.2, vs: ['診療所', '#ffffff', '#1f6a9a'], roofC: 0x8f8b84,
      ops: { s: [{ at: -17.5, w: 2.2, k: 'w' }, { at: -14.2, w: 1.8, k: 'd' }, { at: -11, w: 2.4, k: 'w' }], e: [{ at: -12.5, w: 1.6, k: 'd' }, { at: -16.5, w: 2, k: 'w' }], w: [{ at: -14, w: 1.4, k: 'd' }, { at: -10.6, w: 1.6, k: 'w' }] },
      opsUp: { s: [{ at: -18.6, w: 1.6, k: 'w' }, { at: -14.5, w: 1.6, k: 'w' }, { at: -10.4, w: 1.6, k: 'w' }], e: [{ at: -11.2, w: 1.6, k: 'w' }, { at: -15.5, w: 1.6, k: 'w' }], w: [{ at: -12, w: 1.6, k: 'w' }, { at: -15.6, w: 1.6, k: 'w' }], n: [] },
      stairs: [{ x0: -19.6, x1: -15.8, z0: -19.28, z1: -18.08, axis: 'x', dir: -1, lv: 0, open: 's' }, { x0: -13.6, x1: -9.8, z0: -19.28, z1: -18.08, axis: 'x', dir: -1, lv: 1, open: 's' }],
      levels: [
        () => { counter(-12.8, -14.4, -9.4, -13.6, 0xd8dcd8); container(-11.1, -13.2, 'Revistar receção', 'hospital', { y: 1.0 }); deskPC(-11.1, -15.2, 0); for (let i = 0; i < 4; i++) chair(-19.6 + i * 0.6, -9.0, Math.PI); for (let i = 0; i < 3; i++) chair(-20.4, -11.6 + i * 0.6, Math.PI / 2); plantI(-20.4, -9.0); plantI(-9.0, -9.0); cabinet(-9.2, -16.6, 1.2, 'Abrir armário de medicamentos', 'hospital', -Math.PI / 2, 0xe6eae8); clutter(-20.5, -17.5, -9, -9, 5); blood(-15, -12, 1.0); vendI(-9.2, -10.6, -Math.PI / 2); },
        () => { for (let i = 0; i < 4; i++) { bed(-20.0 + i * 2.2, -15.6, 0); screenI(-18.9 + i * 2.2, -15.6, 0); ivStand(-20.6 + i * 2.2, -16.5); } container(-17.8, -15.6, 'Revistar cama', 'hospital', { y: 0.6 }); cabinet(-9.2, -12.0, 1.2, 'Abrir armário de medicamentos', 'hospital', -Math.PI / 2, 0xe6eae8); trolley(-12.5, -11.5); container(-12.5, -11.5, 'Revistar carrinho', 'hospital'); chair(-19.0, -10.0, 0); clutter(-20.5, -17.5, -9, -9, 4); blood(-14, -12.6, 0.8); },
        () => { shelf(-17.6, -13.4, 3.2, 0, 'Revistar prateleira da farmácia', 'farmacia'); shelf(-12.6, -13.4, 3.2, 0, 'Revistar prateleira da farmácia', 'farmacia'); deskPC(-19.4, -9.6, Math.PI); chair(-19.4, -10.4, 0); boxes(-9.6, -9.6); boxes(-9.5, -15.0); cabinet(-20.5, -12.0, 1.2, 'Abrir armário fechado', 'farmacia', Math.PI / 2, 0xd8d4cc); clutter(-20.5, -17.5, -9, -9, 6); },
      ] });
    hsign(-14.2, 2.9, -8.08, 'クリニック', '#f4f6f6', '#1f6a9a', 3.4, 0.6, { sub: 'KUROGANE CLINIC' });
    b.box(5, 0.12, 0.9, -14.2, 2.62, -7.6, 0x1f6a9a, { rx: 0.15 }); }
  tower(-34, -21, -22.5, -9, 7, { style: 'band', col: 0xc7c2b8, sign: ['ドラッグ', '#ffe14a', '#1a1a1a', 'DRUG STORE'], vs: ['薬局ドラッグ', '#ffd400', '#d01a1a', 8] });
  tower(-47.5, -21, -35.5, -9, 5, { style: 'balc', sign: ['質屋', '#1b2a44', '#f2d27a', 'PAWN'] });
  // --- quarteirão NE1: konbini no rés do chão de um prédio, karaoke
  shell(8, -18.6, 20.5, -8.2, { name: 'KUROMART', wall: 0xe9ece9, floor: 0xd9dcd9, mapc: '#9aa7a3', upper: 4, upperCol: 0xbfc4c6, vs: ['ホテル黒鉄', '#2a1a3a', '#ff7ad9'],
    ops: { s: [{ at: 10.6, w: 3.2, k: 'w' }, { at: 13.8, w: 2.0, k: 'd' }, { at: 17.3, w: 4.2, k: 'w' }], e: [{ at: -13.5, w: 3, k: 'w' }, { at: -10.2, w: 1.4, k: 'd' }] } });
  { const s = A.draw(512, 96, (x, w, h) => { x.fillStyle = '#f6f8f6'; x.fillRect(0, 0, w, h); for (const [c, y] of [['#f08a2a', 0], ['#1f9a5a', 14], ['#d0302a', 28]]) { x.fillStyle = c; x.fillRect(0, y, w, 12); } x.fillStyle = '#1f5a9a'; x.font = `800 46px "Roboto Condensed"`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('KUROMART', w / 2 + 40, 66); x.font = `900 36px ${'"KJP",sans-serif'}`; x.fillStyle = '#d0302a'; x.fillText('クロ', 70, 66); });
    b.box(12.6, 0.95, 0.14, 14.25, 3.05, -8.05, 0x2a2b2c); b.plane(12.4, 0.85, 14.25, 3.05, -7.97, 0xffffff, { mat: 'sign', uv: s }); }
  shelf(11.2, -14.5, 3.4, 0); shelf(15.8, -14.5, 3.4, 0); shelf(11.2, -11.6, 3.4, 0, 'Revistar prateleira', 'konbini'); fridge(14.4, -18.0, 5.0); fridge(19.4, -17.9, 1.4);
  counter(17.2, -11.6, 19.8, -10.8, 0xd9dcd9); container(18.5, -10.4, 'Revistar caixa registadora', 'casa', { y: 1.0 });
  b.box(0.7, 0.4, 0.5, 18.5, 1.2, -11.2, 0x2a2b2c);
  vend(21.4, -7.6, 0, 0xc23a2e); vend(22.5, -7.6, 0, 0x2f6fb3);
  tower(23.5, -21, 34, -8.5, 6, { style: 'punch', col: 0x8c8f92, sign: ['カラオケ', '#2a1a4a', '#ff4ad0', 'KARAOKE'], vs: ['カラオケ歌', '#ff2a8a', '#ffffff', 9], roofSign: ['パチンコ黒鉄', '#1a1a1a', '#ffd23a'] });
  tower(35, -21, 47.5, -9, 8, { style: 'band', col: 0xd2ccc0, sign: ['焼肉', '#1a1a1a', '#ff5a2a', 'YAKINIKU'], vs: ['焼肉酒場', '#d01a1a', '#ffffff', 9] });
  // --- quarteirão SO1 (z 7..22): koban, casa de kawara, izakayas baixos
  shell(-12.2, 7.8, -7.2, 12.6, { name: 'Koban', wall: 0xe8e4dc, floor: 0xbdb8ae, h: 3.0, roofC: 0x5a5e62,
    ops: { n: [{ at: -9.7, w: 1.6, k: 'd' }], e: [{ at: 10.2, w: 1.8, k: 'w' }], s: [{ at: -11.0, w: 1.1, k: 'd' }, { at: -8.6, w: 1.6, k: 'w' }] },
    cutExtra: () => { b.box(2.2, 0.5, 0.1, -9.7, 3.3, 7.65, 0x1f3a6a); } });
  { const s = A.sign('交番', { w: 192, h: 96, bg: '#1f3a6a', fg: '#ffffff', pad: 0.12 }); b.plane(1.6, 0.8, -9.7, 2.6, 7.56, 0xffffff, { mat: 'sign', uv: s, ry: Math.PI }); b.sph(0.14, -8.3, 2.7, 7.55, new THREE.Color(2.2, 0.2, 0.1), { mat: 'lit' }); const s2 = A.sign('交番', { w: 192, h: 96, bg: '#1f3a6a', fg: '#ffffff', pad: 0.12, sub: 'KOBAN' }); b.box(0.1, 0.62, 1.22, -7.1, 2.62, 10.2, 0x2a2b2c); b.plane(1.1, 0.55, -7.04, 2.62, 10.2, 0xffffff, { mat: 'sign', uv: s2, ry: Math.PI / 2 }); }
  cabinet(-11.6, 11.4, 1.0, 'Abrir cacifo da polícia', 'policia', Math.PI / 2, 0x7a8088); table(-9.6, 10.6, 1.3, 0.7, 0x6a6e72); chair(-9.6, 11.3, Math.PI); container(-9.6, 10.6, 'Revistar secretária', 'policia', { y: 0.8 });
  car(-14.5, 10.5, 0, 0xffffff, { police: true });
  shell(-27, 10, -16.5, 19, { name: 'Casa', wall: 0xcdb9a0, floor: 0x9a7a52, roof: 'kawara', h: 3.0, mapc: '#6e665b',
    ops: { n: [{ at: -21.5, w: 1.4, k: 'd' }, { at: -25, w: 1.6, k: 'w' }], s: [{ at: -24.5, w: 2, k: 'w' }, { at: -21.8, w: 1.2, k: 'd' }, { at: -19, w: 2, k: 'w' }], e: [{ at: 14.5, w: 1.6, k: 'w' }] } });
  cabinet(-26.3, 13.5, 1.6, 'Abrir armário', 'casa', Math.PI / 2, 0x8a6a4a); counter(-20, 17.8, -17.2, 18.6, 0x9a8a72); container(-18.6, 17.4, 'Revistar cozinha', 'casa', { y: 1.0 });
  table(-22.5, 14.8, 1.6, 1.0, 0x6a4a2e); chair(-23.4, 14.8, Math.PI / 2); chair(-21.6, 14.8, -Math.PI / 2);
  { b.box(2.8, 0.3, 1.6, -24.4, 0.2, 17.8, 0xd8d0c0); container(-24.4, 17.8, 'Revistar futon', 'casa', { y: 0.4 }); rect(-25.8, 17, -23, 18.6, 'l', 0.4); }
  for (const [x0, x1, n, sg] of [[-47.5, -40.5, 2, ['居酒屋', '#1a1a1a', '#ff6a3a']], [-40, -33.5, 2, ['ラーメン', '#d8261a', '#ffffff']], [-33, -28, 1, ['喫茶', '#4a2a1a', '#ffd9a0']]]) {
    tower(x0, 7.6, x1, 15, n + 1, { style: 'punch', vs: [sg[0], sg[1], sg[2], 2.6], awnC: 0x8a2a2a });
    for (let x = x0 + 1; x < x1; x += 1.6) lantern(x, 2.6, 15.4);
  }
  // --- quarteirão SE1: parque de estacionamento com rede, carros
  { const fx0 = 7.5, fx1 = 26, fz0 = 8, fz1 = 21.5;
    b.floor(fx0, fz0, fx1, fz1, 0.03, 0xffffff, 'asph'); mp(fx0, fz0, fx1, fz1, '#55565a');
    for (let x = fx0 + 2.6; x < fx1; x += 2.6) b.box(0.1, 0.01, 4.6, x, 0.045, fz1 - 2.6, WHITE, { mat: 'decal' });
    const fence = (x0, z0, x1, z1, gap) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 2.5); for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n; b.cyl(0.04, 0.04, 2.2, 6, x, 1.1, z, 0x7a7e82, { mat: 'm' }); } const hor = z0 === z1; b.box(hor ? L : 0.03, 2.0, hor ? 0.03 : L, (x0 + x1) / 2, 1.1, (z0 + z1) / 2, 0x9aa0a4, { mat: 'fence' }); if (gap) return; rect(x0 - 0.05, z0 - 0.05, x1 + 0.05, z1 + 0.05, 'g', 2.2); };
    fence(fx0, fz0, fx0, fz1); fence(fx1, fz0, fx1, fz1); fence(fx0, fz1, fx1, fz1);
    fence(fx0, fz0, 13, fz0); fence(17.5, fz0, fx1, fz0);
    car(9.6, 18.8, 0, 0x2a5a8a); car(14.8, 18.9, 0.04, 0xd8d6d0); car(20.0, 18.7, 0, 0x8a2a22, { wreck: true }); car(22.5, 11.5, Math.PI / 2 + 0.1, 0x3a3d40);
    b.box(1.4, 2.0, 1.2, 24.6, 1.0, 9.0, 0x3a6a8a); b.box(1.2, 0.3, 0.04, 24.6, 2.3, 9.62, new THREE.Color(1.5, 1.5, 1.4), { mat: 'lit' }); rect(23.9, 8.4, 25.3, 9.6, 's', 2);
  }
  for (const [x0, x1, f, sg] of [[27, 35, 3, ['麻雀', '#1a4a2a', '#ffffff']], [35.5, 47.5, 2, ['歯科', '#ffffff', '#1a6a9a']]]) tower(x0, 7.6, x1, 17, f, { style: 'punch', vs: [sg[0], sg[1], sg[2], 3.2] });
  // --- quarteirões de trás (norte): oficina, santuário, prédios
  shell(-44, -43.5, -29, -31, { name: 'Oficina', wall: 0x8a8f92, floor: 0x7a7a76, h: 4.6, roofC: 0x6a6e72, mapc: '#686c70',
    ops: { s: [{ at: -40.5, w: 4.2, k: 'd' }, { at: -34, w: 2.4, k: 'w' }], e: [{ at: -37, w: 1.6, k: 'd' }] } });
  { const s = A.sign('工場', { w: 192, h: 96, bg: '#2a2b2c', fg: '#f2c84a' }); b.box(2.2, 1.1, 0.1, -34, 3.9, -30.85, 0x2a2b2c); b.plane(2.0, 1.0, -34, 3.9, -30.78, 0xffffff, { mat: 'paint', uv: s }); }
  crate(-42.4, -41.8, 0, 'Abrir caixa de ferramentas', 'oficina', 0x9a2a22); crate(-40, -41.8, 0, 'Abrir caixa de ferramentas', 'oficina', 0x9a2a22); cabinet(-30.2, -38, 1.6, 'Abrir armário', 'oficina', -Math.PI / 2, 0x6a7078);
  table(-35, -40, 2.4, 1.0, 0x6a6e72); container(-35, -40, 'Revistar bancada', 'oficina', { y: 0.8 }); car(-38.5, -35.6, 0.15, 0x8a8a82, { wreck: true });
  { const flat = () => { sofa(-24.5, -34.6, 0, pick([0x6a5a8a, 0x8a5a4a, 0x4a6a7a])); tvI(-24.5, -31.3, Math.PI); rugI(-24.5, -33.0, 2.6, 1.8, pick([0x8a5a4a, 0x5a6a7a, 0x7a6a4a])); counter(-17.0, -40.5, -16.25, -38.3, 0x9a8a72); container(-17.4, -39.4, 'Revistar cozinha', 'casa', { y: 1.0 }); stove(-16.62, -37.85, -Math.PI / 2); kfridge(-16.62, -41.2, -Math.PI / 2); table(-20.6, -37.6, 1.4, 0.8, 0x6a4a2e); chair(-20.6, -36.9, Math.PI); chair(-20.6, -38.3, 0); bed(-26.6, -38.6, 0, pick([0xd8d0c0, 0xa8b8c8, 0xc8a8a8])); container(-26.6, -38.6, 'Revistar cama', 'casa', { y: 0.6 }); wardrobe(-26.95, -35.7, Math.PI / 2); toilet(-16.7, -31.0, -Math.PI / 2); sinkI(-16.62, -32.1, -Math.PI / 2); books(-27.1, -31.6, Math.PI / 2); lampF(-26.9, -33.7); plantI(-19.4, -30.9); clutter(-27, -42, -16.5, -30.5, 6); if (rnd() < 0.5) blood(rr(-25, -18), rr(-40, -32), 0.8); };
    shell(-27.5, -43.5, -16, -30, { name: 'Apartamentos', wall: 0xcfc6b2, floor: 0xa8946a, mapc: '#7a7468', floors: 3, h: 3.0, roofC: 0x8f8b84, trim: 0x5a5a58,
      ops: { s: [{ at: -25.5, w: 1.6, k: 'w' }, { at: -21.75, w: 1.4, k: 'd' }, { at: -18.0, w: 1.6, k: 'w' }], e: [{ at: -40, w: 1.4, k: 'w' }, { at: -36, w: 1.4, k: 'd' }, { at: -32, w: 1.4, k: 'w' }], w: [{ at: -39.5, w: 1.4, k: 'w' }, { at: -34, w: 1.4, k: 'w' }], n: [{ at: -21.75, w: 1.2, k: 'w' }] },
      stairs: [{ x0: -26.0, x1: -22.2, z0: -43.28, z1: -42.08, axis: 'x', dir: -1, lv: 0, open: 's' }, { x0: -21.0, x1: -17.2, z0: -43.28, z1: -42.08, axis: 'x', dir: -1, lv: 1, open: 's' }],
      levels: [flat, flat, flat] }); }
  tower(-15, -43.5, -7, -31, 6, { style: 'band', sign: ['二十四時間', '#1a1a1a', '#5aff8a', '24H'] });
  // santuário com torii e árvores (NE2)
  { const cx = 22, cz = -37; b.floor(12, -45, 32, -27.5, 0.03, 0xffffff, 'dirt'); mp(12, -45, 32, -27.5, '#6b5b44');
    const torii = (x, z, s = 1) => { for (const sx of [-1, 1]) b.cyl(0.18 * s, 0.22 * s, 4.2 * s, 10, x + sx * 1.7 * s, 2.1 * s, z, 0xc8321e); b.box(4.8 * s, 0.32 * s, 0.4 * s, x, 4.25 * s, z, 0x1d1d1d); b.box(4.2 * s, 0.24 * s, 0.3 * s, x, 3.6 * s, z, 0xc8321e); for (const sx of [-1, 1]) circ(x + sx * 1.7 * s, z, 0.25); };
    torii(cx, -28.6); torii(cx, -33, 0.85);
    b.box(6.5, 0.6, 4.6, cx, 0.3, -42, 0x8a8278); b.box(5.6, 2.4, 3.6, cx, 1.8, -42, 0x6a3a22); b.box(7.4, 0.25, 5.4, cx, 3.2, -42, 0x2c3038, { rx: 0 }); b.box(7.8, 0.4, 5.8, cx, 3.5, -42, 0x3b4048); b.box(4, 0.4, 3, cx, 3.9, -42, 0x2c3038); rect(cx - 3.3, -44.3, cx + 3.3, -39.7, 's', 4);
    for (const x of [cx - 1.6, cx + 1.6]) { b.cyl(0.25, 0.3, 1.2, 8, x, 0.6, -38.6, 0x9a968e); b.box(0.6, 0.5, 0.6, x, 1.4, -38.6, 0x9a968e); circ(x, -38.6, 0.35); }
    crate(cx + 4.2, -40.5, 0.3, 'Revistar caixa de oferendas', 'casa', 0x6a4a2e);
  }
  tower(34, -43.5, 47.5, -30, 9, { style: 'band', col: 0x9fa3a6, sign: ['ホテル', '#2a1a3a', '#ff9ae9', 'HOTEL'], vs: ['ホテル', '#2a1a3a', '#ff7ad9', 10] });
  // --- quarteirões de trás (sul): casas baixas e prédios baixos
  shell(-44, 29, -34, 38, { name: 'Casa', wall: 0xd8cbb2, floor: 0x9a7a52, roof: 'kawara', h: 3.0, mapc: '#6e665b',
    ops: { n: [{ at: -39, w: 1.4, k: 'd' }], s: [{ at: -41.5, w: 2, k: 'w' }, { at: -39, w: 1.2, k: 'd' }, { at: -36.5, w: 2, k: 'w' }], e: [{ at: 33.5, w: 1.6, k: 'w' }] } });
  cabinet(-43.3, 33.5, 1.6, 'Abrir armário', 'casa', Math.PI / 2, 0x8a6a4a); container(-36, 36.8, 'Revistar cozinha', 'casa', { y: 1.0 }); counter(-37.4, 37.0, -34.6, 37.8, 0x9a8a72);
  tower(-31, 29, -19, 41, 3, { style: 'balc', shop: false });
  tower(-17, 29, -8, 37, 2, { style: 'punch', sign: ['理容', '#ffffff', '#c8321e'] });
  tower(8, 29, 20, 39, 2, { style: 'punch', sign: ['本屋', '#2a3a2a', '#f2e8c8', 'BOOKS'] });
  shell(22, 29, 33, 37.5, { name: 'Casa', wall: 0xcfc4ae, floor: 0x9a7a52, roof: 'kawara', h: 3.0, mapc: '#6e665b',
    ops: { n: [{ at: 27.5, w: 1.4, k: 'd' }], s: [{ at: 24.5, w: 2, k: 'w' }, { at: 27.5, w: 1.2, k: 'd' }, { at: 30.5, w: 2, k: 'w' }], w: [{ at: 33, w: 1.6, k: 'w' }] } });
  cabinet(32.3, 33, 1.4, 'Abrir armário', 'casa', -Math.PI / 2, 0x8a6a4a); container(24, 36.5, 'Revistar cozinha', 'casa', { y: 1.0 }); counter(22.6, 36.6, 25.4, 37.3, 0x9a8a72);
  tower(35, 29, 47.5, 42, 4, { style: 'balc', shop: false });

  // --- helicóptero militar caído no cruzamento (melhor loot)
  { const hx = 1.4, hz = -1.2, ry = 0.62; b.push(hx, 0, hz, ry, 0, 0.12);
    const OD = 0x4a5236; b.rbox(2.6, 2.1, 6.2, 0.6, 0, 1.25, 0, OD, { mat: 'm' }); b.rbox(2.2, 1.4, 2.0, 0.5, 0, 1.4, 3.5, OD, { mat: 'm' }); b.box(1.9, 0.9, 0.06, 0, 1.6, 4.45, 0x1f2a33, { mat: 'win', rx: -0.5 });
    b.box(0.5, 0.6, 5.5, 0, 1.7, -5.6, OD, { mat: 'm', rx: 0.05 }); b.box(0.12, 1.6, 1.0, 0, 2.6, -8.1, OD, { mat: 'm' }); b.box(1.6, 0.1, 0.6, 0, 1.8, -7.9, OD, { mat: 'm' });
    for (const [l, yaw, dr] of [[5.2, 0.3, -0.05], [3.8, 1.9, -0.3], [4.6, 3.4, 0.1], [2.5, 4.9, -0.5]]) { b.push(0, 2.5, 0.4, yaw, dr); b.box(0.32, 0.06, l, 0, 0, l / 2, 0x2a2c2e, { mat: 'm' }); b.pop(); }
    b.cyl(0.3, 0.3, 0.4, 10, 0, 2.4, 0.4, 0x2a2c2e, { mat: 'm' }); for (const s of [-1, 1]) b.box(0.1, 0.1, 3.8, s * 1.1, 0.12, 0.3, 0x2a2c2e, { mat: 'm' });
    b.box(1.3, 1.5, 0.04, 1.31, 1.2, 0.6, 0x111, { ry: 0 }); b.box(0.6, 0.6, 0.04, -0.4, 2.3, 1.6, 0x2a3540, { rx: 0.3 });
    b.pop();
    blood(hx + 2, hz + 2.5, 1.3);
    const c1 = Math.cos(ry), s1 = Math.sin(ry); for (let i = -3; i <= 3; i++) { const px = hx + s1 * i, pz = hz + c1 * i; circ(px, pz, 1.25); }
    for (let i = 4; i <= 8; i++) circ(hx + s1 * -i, hz + c1 * -i, 0.35);
    crate(-1.8, 2.2, 0.2, 'Abrir caixa militar', 'militar'); crate(5.6, 1.0, -0.5, 'Abrir caixa militar', 'militar');
    W.smoke = [hx + s1 * 0.6, 2.2, hz + c1 * 0.6];
    for (const [x, z] of [[-1.5, -4.7], [3.5, 4.6], [-4.8, 1.5]]) barrier(x, z, rr(-0.5, 0.5));
    cone(-3, 3.2); cone(-2.4, 3.6); cone(5.6, -2.8);
  }

  // --- carros abandonados, postes, candeeiros, máquinas, bicicletas
  car(-28, -1.8, Math.PI / 2 + 0.06, 0xf2c23a, { taxi: true }); car(-37, 2.1, -Math.PI / 2 + 0.2, 0xd8d6d0, { wreck: true }); car(30, 2.2, -Math.PI / 2, 0x2a2b2c); car(41, -2.0, Math.PI / 2 - 0.3, 0x5a7a9a, { wreck: true });
  car(-1.6, -30, 0.08, 0xd8d6d0); car(1.8, 33, Math.PI + 0.25, 0x8a2a22, { wreck: true });
  // camião
  { b.push(16, 0, 2.2, -Math.PI / 2); b.rbox(2.2, 2.0, 2.0, 0.2, 0, 1.4, 3.2, 0xe8e6e0, { mat: 'm' }); b.box(2.0, 0.8, 0.06, 0, 1.9, 4.22, 0x1f2a33, { mat: 'win' }); b.box(2.4, 2.6, 5.4, 0, 1.75, -0.6, 0x3a6a9a, { mat: 'm' }); for (const sz of [-2.4, -1, 3.2]) for (const sx of [-1, 1]) b.cyl(0.45, 0.45, 0.3, 12, sx * 1.05, 0.45, sz, 0x1b1b1c, { rz: Math.PI / 2 }); b.pop(); rect(12.2, 1, 20.4, 3.4, 's', 3); mp(12.2, 1, 20.4, 3.4, '#3a6a9a'); container(19.2, 2.2, 'Abrir porta do camião', 'casa', { y: 1 }); }
  const polesN = [], polesS = [];
  for (let x = -46; x <= 46; x += 11.5) { if (Math.abs(x) < 7) continue; polesN.push(pole(x, -6.6)); polesS.push(pole(x + 4, 6.6)); }
  for (let i = 0; i < polesN.length - 1; i++) { wires(polesN[i], polesN[i + 1]); wires(polesS[i], polesS[i + 1]); }
  wires(polesN[3], polesS[3]); wires(polesN[4], polesS[4]);
  for (const [x, z, ry] of [[-6.1, -9, Math.PI / 2], [6.1, 9, -Math.PI / 2], [-6.1, 30, Math.PI / 2], [6.1, -30, -Math.PI / 2], [-24, -6.8, 0], [24, 6.8, Math.PI], [-40, 6.8, Math.PI], [40, -6.8, 0]]) lamp(x, z, ry);
  vend(-22.2, -7.6, 0, 0x2f6fb3); vend(-6.0, 15, Math.PI / 2, 0xc23a2e); vend(36.6, 7.4, Math.PI, 0xe8e6e0);
  for (const [x, z, r] of [[-24.6, -6.2, 0.3], [-25.6, -6.3, 0.1], [8.6, 5.4, 1.2], [-44, 5.2, 0.5], [44.5, -5.4, 2.8]]) bike(x, z, r);
  for (const [x, z] of [[-30.5, -6.4], [12.8, -6.5], [-7.0, -20], [42, 6.4], [6.8, 27], [-45, -24]]) bags(x, z);
  // --- mobiliário de rua japonês: marcos do correio, armários técnicos, pilaretes, floreiras, cabines, sinais e semáforos
  { const post = (x, z) => { b.cyl(0.24, 0.24, 1.0, 16, x, 0.6, z, 0xc8281e, { mat: 'm' }); b.sph(0.24, x, 1.1, z, 0xc8281e, { mat: 'm', th: Math.PI / 2, ws: 16, hs: 6 }); b.box(0.3, 0.04, 0.05, x, 0.95, z + 0.23, 0x2a2b2c); b.cyl(0.26, 0.28, 0.1, 16, x, 0.05, z, 0x3a3c40); circ(x, z, 0.26); };
    const ubox = (x, z, ry = 0) => { b.push(x, 0, z, ry); b.rbox(0.7, 1.3, 0.4, 0.04, 0, 0.65, 0, 0xb8bcbc, { mat: 'm' }); b.box(0.5, 0.05, 0.02, 0, 1.0, 0.21, 0x6a6e72); b.box(0.12, 0.16, 0.02, 0.18, 0.7, 0.21, 0xd8c23a); b.pop(); circ(x, z, 0.36); };
    const bollard = (x, z) => { b.cyl(0.06, 0.07, 0.9, 10, x, 0.45, z, 0xd8b82a, { mat: 'm' }); b.cyl(0.065, 0.065, 0.12, 10, x, 0.72, z, 0x1d1d1d); };
    const planter = (x, z, ry = 0) => { b.push(x, 0, z, ry); b.box(1.6, 0.45, 0.5, 0, 0.22, 0, 0x9a968c); for (let i = -2; i <= 2; i++) b.ico(0.22 + rnd() * 0.06, i * 0.32, 0.55, 0, pick([0x3f6a2a, 0x4a7a32, 0x5a7a3a]), { mat: 'vf', det: 1 }); b.pop(); circ(x, z, 0.45); };
    const booth = (x, z, ry = 0) => { b.push(x, 0, z, ry); b.box(0.95, 0.12, 0.95, 0, 0.06, 0, 0x3a3c40); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.06, 2.2, 0.06, sx * 0.44, 1.16, sz * 0.44, 0x2a8a5a, { mat: 'm' }); for (const [w, d, xx, zz] of [[0.9, 0.03, 0, -0.45], [0.03, 0.9, -0.45, 0], [0.03, 0.9, 0.45, 0]]) b.box(w, 1.7, d, xx, 1.15, zz, 0x9ab8c8, { mat: 'gl' }); b.box(1.0, 0.16, 1.0, 0, 2.32, 0, 0x2a8a5a, { mat: 'm' }); b.box(0.3, 0.45, 0.18, 0, 1.3, -0.33, 0x3aa06a); b.box(0.5, 0.08, 0.5, 0, 2.2, 0, new THREE.Color(1.5, 1.5, 1.4), { mat: 'lit' }); b.pop(); rect(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 's', 2.4); };
    const rack = (x, z) => { for (let i = 0; i < 4; i++) b.add(new THREE.TorusGeometry(0.28, 0.025, 6, 16, Math.PI), 0x8a8e92, 'm', mat4(x + i * 0.45, 0, z)); };
    const stopSign = (x, z, ry) => { b.cyl(0.04, 0.04, 2.4, 8, x, 1.2, z, 0x9a9ea2, { mat: 'm' }); b.push(x, 2.35, z, ry); b.add(new THREE.CircleGeometry(0.32, 3), 0xc8281e, 'v', mat4(0, 0, 0.03, 0, 0, Math.PI)); b.pop(); };
    let k = 0;
    for (const zc of [-4.75, 4.75]) for (let x = -43; x <= 43; x += 7.3) { if (Math.abs(x) < 9) continue; const xx = x + (zc > 0 ? 2.1 : 0); if ([-46, -34.5, -23, -11.5, 11.5, 23, 34.5, 46].some(px => Math.abs(px + (zc > 0 ? 4 : 0) - xx) < 1.6)) continue; const t = k++ % 7;
      if (t === 0) post(xx, zc); else if (t === 1) ubox(xx, zc + (zc > 0 ? 0.6 : -0.6)); else if (t === 2) { bollard(xx - 0.6, zc); bollard(xx, zc); bollard(xx + 0.6, zc); } else if (t === 3) planter(xx, zc + (zc > 0 ? 0.5 : -0.5)); else if (t === 4) rack(xx - 0.7, zc + (zc > 0 ? 1.2 : -1.2)); else if (t === 5) booth(xx, zc + (zc > 0 ? 1.0 : -1.0)); else ubox(xx, zc + (zc > 0 ? 0.6 : -0.6), Math.PI); }
    for (const xc of [-4.75, 4.75]) for (const z of [-40, -33, 12, 18, 33, 40]) { const t = k++ % 4; const zz = z + (xc > 0 ? 1.7 : 0); if (t === 0) post(xc, zz); else if (t === 1) planter(xc + (xc > 0 ? 0.5 : -0.5), zz, Math.PI / 2); else if (t === 2) { bollard(xc, zz - 0.6); bollard(xc, zz); bollard(xc, zz + 0.6); } else ubox(xc + (xc > 0 ? 0.6 : -0.6), zz, Math.PI / 2); }
    // semáforos no cruzamento (acendem-se à noite)
    for (const [sx, sz] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) { const x = sx * 4.9, z = sz * 4.9, ry = Math.atan2(-sx, -sz); b.cyl(0.08, 0.09, 4.4, 10, x, 2.2, z, 0x6a6e72, { mat: 'm' }); circ(x, z, 0.12); b.push(x, 4.2, z, ry); b.box(0.08, 0.08, 2.2, 0, 0, 1.0, 0x6a6e72, { mat: 'm' }); b.box(0.9, 0.32, 0.22, 0, -0.05, 2.0, 0x2a2b2c, { mat: 'm' }); [[0.3, 0.3, 1.6, 0.2], [0.1, 1.6, 0.3, 0], [1.8, 0.25, 0.15, -0.3]].forEach(([r, g, bl, off], i) => b.cyl(0.09, 0.09, 0.05, 12, off, -0.05, 2.12, new THREE.Color(r, g, bl), { mat: i === (sx * sz > 0 ? 0 : 2) ? 'lit' : 'v', rx: Math.PI / 2 })); b.pop(); }
    stopSign(-5.6, -9.5, 0); stopSign(5.6, 9.5, Math.PI); stopSign(9.5, -5.6, -Math.PI / 2); stopSign(-9.5, 5.6, Math.PI / 2);
    // tampas de esgoto
    for (const [x, z] of [[-18, 0.6], [14, -0.8], [0.4, -15], [-0.6, 21], [34, 0.2], [-38, -0.5]]) { const g = new THREE.CircleGeometry(0.42, 18); g.rotateX(-Math.PI / 2); b.add(g, 0x3a3c40, 'decal', mat4(x, 0.03, z)); }
  }
  bench(-4.8, 18, Math.PI / 2); bench(26, -6.4, 0);
  for (const [x, z, s] of [[-9, 2, 1.4], [7, -1, 1], [-31, 0.5, 0.9], [18, -8.6, 0.8], [-14, 10.8, 1], [34, -24, 1]]) blood(x, z, s);
  // sinais de trânsito no cruzamento
  for (const [x, z, ry] of [[-5.6, -5.6, 0], [5.6, 5.6, Math.PI]]) { b.cyl(0.08, 0.08, 4.8, 8, x, 2.4, z, 0x7a7e82, { mat: 'm' }); b.push(x, 4.6, z, ry); b.box(0.1, 0.1, 2.6, 0, 0, 1.3, 0x7a7e82, { mat: 'm' }); b.box(1.1, 0.4, 0.3, 0, 0, 2.4, 0x2a2b2c); b.sph(0.12, -0.34, 0, 2.56, 0x2a3a2a); b.sph(0.12, 0, 0, 2.56, 0x3a3a2a); b.sph(0.12, 0.34, 0, 2.56, new THREE.Color(2.4, 0.25, 0.15), { mat: 'lit' }); b.pop(); circ(x, z, 0.15); }
  // árvores de rua (gingko)
  const street = [];
  for (let x = -42; x <= 42; x += 14) { if (Math.abs(x) < 8) continue; street.push([x + 3, -5.4], [x - 3, 5.4]); }
  W.streetTrees = street;

  // viaduto da linha de comboio a norte
  { const z = -52, y = 7.2; b.box(2 * CORE + 20, 0.8, 7, 0, y, z, 0xb8b3aa); b.box(2 * CORE + 20, 1.1, 0.25, 0, y + 0.9, z + 3.4, 0xa8a39a); b.box(2 * CORE + 20, 1.1, 0.25, 0, y + 0.9, z - 3.4, 0xa8a39a);
    for (let x = -CORE + 7; x <= CORE; x += 14) { b.box(1.4, y - 0.4, 2.6, x, (y - 0.4) / 2, z, 0xc2bdb4); rect(x - 0.7, z - 1.3, x + 0.7, z + 1.3, 's', y); b.cyl(0.05, 0.05, 4, 5, x, y + 2.4, z + 2.8, 0x555); b.box(0.1, 0.1, 6, x, y + 4.3, z, 0x555); }
    for (const sz of [-1.6, 1.6]) for (const sx of [-0.72, 0.72]) b.box(2 * CORE + 20, 0.12, 0.1, 0, y + 0.5, z + sz + sx, 0x6a6e72, { mat: 'm' });
    for (let i = 0; i < 4; i++) { const x = -30 + i * 20.6; b.rbox(20, 3.2, 3, 0.4, x, y + 2.2, z - 1.6, 0xd8dcd8, { mat: 'm' }); b.box(20, 0.35, 3.04, x, y + 1.6, z - 1.6, 0x2a8a4a); for (let k = 0; k < 7; k++) b.box(1.4, 0.9, 3.06, x - 8.4 + k * 2.8, y + 2.6, z - 1.6, 0x24303a, { mat: 'win' }); }
    mp(-CORE, z - 3.5, CORE, z + 3.5, '#8a857c');
  }

  // ============ FLORESTA, VILAS E MONUMENTOS ============
  const woodFence = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 2); const ry = Math.atan2(x1 - x0, z1 - z0); for (let i = 0; i <= n; i++) b.box(0.12, 1.1, 0.12, x0 + (x1 - x0) * i / n, 0.55, z0 + (z1 - z0) * i / n, 0x6a4a2e); for (const y of [0.4, 0.85]) b.box(0.06, 0.12, L, (x0 + x1) / 2, y, (z0 + z1) / 2, 0x7a5a3a, { ry }); };
  const cabin = (cx, cz, name = 'Cabana') => {
    const x0 = cx - 4, x1 = cx + 4, z0 = cz - 3.5, z1 = cz + 3.5, doorAt = cx;
    shell(x0, z0, x1, z1, { name, wall: 0x7a5a3a, inner: 0x8a6a4a, floor: 0x6a4a2e, h: 2.9, roof: 'kawara', mapc: '#5a4632', trim: 0x3a2a1c,
      ops: { s: [{ at: doorAt, w: 1.4, k: 'd' }, { at: x0 + 1.6, w: 1.4, k: 'w' }], n: [{ at: (x0 + x1) / 2, w: 1.6, k: 'w' }], e: [{ at: (z0 + z1) / 2, w: 1.4, k: 'w' }] } });
    cabinet(x0 + 0.6, (z0 + z1) / 2, 1.4, 'Abrir armário', 'casa', Math.PI / 2, 0x6a4a2e); crate(x1 - 1.2, z0 + 1.0, 0, 'Abrir baú', 'cabana', 0x6a4a2e);
    bed(x1 - 1.0, z1 - 1.4, 0, 0x8a6a5a);
    woodFence(x0 - 3, z1 + 3, x0 + 1, z1 + 3); woodFence(x1 - 1, z1 + 3, x1 + 3, z1 + 3); woodFence(x0 - 3, z0 - 3, x0 - 3, z1 + 3);
    W.zones.push({ name, jp: '小屋', x: cx, z: cz, r: 9, kind: 'cabin', sub: 'Cabana na floresta' });
  };
  for (const [x, z] of [[-68, 27.5], [64, -62.5], [-58.5, -71], [-250, -110], [250, 70], [-90, 250], [95, -240], [-40, -150], [90, 95], [-262, 262], [262, -262], [-405, 245], [395, 260], [-300, -425], [120, -400], [215, 405], [-410, -250], [40, 410], [400, -110]]) cabin(x, z);
  const camp = (x, z) => { b.add(new THREE.ConeGeometry(1.8, 2.0, 4), 0x6a7a4a, 'v', mat4(x, 1.0, z, Math.PI / 4)); rect(x - 1.3, z - 1.3, x + 1.3, z + 1.3, 's', 2); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; b.ico(0.2, x + 3 + Math.cos(a) * 0.6, 0.12, z + 1 + Math.sin(a) * 0.6, 0x6a6a66); } b.box(0.9, 0.08, 0.1, x + 3, 0.2, z + 1, 0x3a2a1a, { ry: 0.5 }); crate(x - 2.4, z + 1.6, 0.4, 'Revistar mochila abandonada', 'cabana', 0x5a4a2e); blood(x + 1.5, z + 2.5, 0.8); };
  camp(62, 58); camp(-200, -232); camp(232, -60); camp(-120, 120); camp(400, -160); camp(-420, 90); camp(-250, 400); camp(250, -400);
  W.koCheck = () => { const bad = []; for (let lv = 0; lv < 4; lv++) { const KO = koOf(lv); for (const r of W.rects) if (!r.stairRail && (r.lv || 0) === lv && r.k !== 'g' && KO.some(k => r.x0 < k.x1 - 0.02 && r.x1 > k.x0 + 0.02 && r.z0 < k.z1 - 0.02 && r.z1 > k.z0 + 0.02)) bad.push([lv, +r.x0.toFixed(2), +r.z0.toFixed(2), +r.x1.toFixed(2), +r.z1.toFixed(2), r.k, r.h]); } return bad; };
  // zonas longe do centro: no arranque só se registam colisões, portas e loot (a seco); a geometria só se faz quando chegas perto e sai quando te afastas.
  // Ao construir, repete-se exatamente o mesmo sorteio, por isso as paredes caem onde as colisões já estão
  W.lazy = [];
  const lazy = (x0, z0, x1, z1, fn) => { const L = { x0, z0, x1, z1, fn, s0: getSeed(), c0: [cid, tid, eid], cut0: W.cuts.length, meshes: null };
    const r0 = W.rects.length, k0 = W.containers.length; b.dry = true; try { fn(); } finally { b.dry = false; } L.cuts = W.cuts.slice(L.cut0); L.ck = lzck(W.rects.slice(r0), W.containers.slice(k0)); W.lazy.push(L); return L; };
  const lzck = (R, C) => R.length + ':' + C.length + ':' + R.reduce((a, r) => a + r.x0 * 3 + r.z1 * 7 + r.h, 0).toFixed(2) + ':' + C.map(c => c.id + c.table).join();
  const linkCut = (c, built) => {
    if (!c.shell) { c.group = built.cuts.get(c.id) || new THREE.Group(); return; }
    c.gt = []; c.g = []; c.mats = [];
    for (let L = 0; L < c.n; L++) { c.gt[L] = built.cuts.get(c.id + ':' + L + 't') || new THREE.Group(); if (L) { c.g[L] = built.cuts.get(c.id + ':' + L) || new THREE.Group(); c.mats[L] = []; c.g[L].traverse(m => { if (m.isMesh) { const m0 = m.material; m.material = m0.clone(); m.material.onBeforeCompile = m0.onBeforeCompile; m.material.customProgramCacheKey = m0.customProgramCacheKey; /* o clone perde o detalhe do shader */ m.material.userData.o0 = m.material.opacity; m.material.userData.t0 = m.material.transparent; c.mats[L].push(m.material); } }); } } c.fv = [];
    c.gR = built.cuts.get(c.id + ':R') || new THREE.Group(); };
  // sliced: as peças guardam-se já, mas as malhas fazem-se aos bocados nas imagens seguintes (W.lazyStep), para andar sem soluços
  W.lazyBuild = (L, sliced = false) => { if (L.meshes || L.job) return; const s = getSeed(), C = [cid, tid, eid], lens = {}; for (const k in W) if (Array.isArray(W[k])) lens[k] = W[k].length;
    const bk = b.buckets, lg = b.log, cur = CUR; b.buckets = new Map(); b.log = []; setSeed(L.s0); [cid, tid, eid] = L.c0; let built = null; b.wet = true; b.defer = sliced;
    try { L.fn(); } finally { const ck = lzck(W.rects.slice(lens.rects), W.containers.slice(lens.containers)); if (ck !== L.ck) { console.warn('zona preguiçosa diferente', L.x0, L.z0); W.lazyBad = (W.lazyBad || 0) + 1; } if (sliced) L.job = b.sliced(scene, mats); else built = b.build(scene, mats); for (const k in lens) W[k].length = lens[k]; setSeed(s); [cid, tid, eid] = C; b.buckets = bk; b.log = lg; CUR = cur; b.cut = null; b.wet = false; b.defer = false; }
    if (built) lazyDone(L, built); };
  const lazyDone = (L, built) => { L.job = null; L.meshes = built.meshes; L.groups = [...built.cuts.values()]; for (const c of L.cuts) linkCut(c, built); W.onLazy && W.onLazy(L, true); };
  // continua a zona que está a meio; devolve true se ainda há trabalho
  W.lazyStep = until => { for (const L of W.lazy) if (L.job) { if (L.job.step(until)) { const j = L.job; lazyDone(L, { meshes: j.meshes, cuts: j.cuts }); } return true; } return false; };
  W.lazyDrop = L => { if (L.job) { L.job.cancel(); for (const m of L.job.meshes) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); } for (const g of L.job.cuts.values()) if (g.parent) g.parent.remove(g); L.job = null; } if (!L.meshes) return; W.onLazy && W.onLazy(L, false);
    for (const m of L.meshes) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); } for (const g of L.groups) if (g.parent) g.parent.remove(g);
    for (const c of L.cuts) { if (c.mats) for (const l of c.mats) if (l) l.forEach(m => m.dispose()); linkCut(c, { cuts: new Map() }); } L.meshes = L.groups = null; };
  const TW = buildTowns({ b, A, W, rect, circ, mp, container, shell, car, pole, wires, lamp, crate, cabinet, counter, table, chair, bed, shelf, fridge, woodFence, blood, bags, cone, barrier, hsign, vsign, bench, bike, vend, road, dirt, rr, ri, pick, rnd, shade, mat4, tower, lantern, sofa, books, stove, kfridge, toilet, sinkI, lampF, plantI, deskPC, boxes, tvI, wardrobe, rugI, clutter, level });
  buildMonuments({ lazy, b, A, W, rect, circ, mp, container, shell, car, pole, wires, lamp, crate, cabinet, counter, table, chair, bed, shelf, fridge, woodFence, blood, bags, cone, barrier, hsign, vsign, bench, bike, vend, road, dirt, rr, ri, pick, rnd, shade, mat4, tower, lantern, sofa, books, stove, kfridge, toilet, sinkI, lampF, plantI, deskPC, boxes, tvI, wardrobe, rugI, clutter, level }, TW.house);

  // mundo de fora, 2.ª parte (com a sua própria semente: o resto do mapa fica igual)
  { const sv = getSeed(), t0 = performance.now(); setSeed(20261124); buildRegions({ lazy, b, A, W, rect, circ, mp, container, shell, car, pole, lamp, crate, cabinet, counter, table, chair, bed, shelf, fridge, woodFence, blood, bags, cone, barrier, bench, bike, vend, dirt, rr, ri, pick, rnd, shade, mat4, tower, lantern, sofa, books, boxes, clutter, toilet, sinkI, deskPC, plantI, wardrobe }, TW.house, TW.shop); setSeed(sv); W.regionMs = Math.round(performance.now() - t0); }

  // grelha para saber depressa onde já há coisas
  W.pads = pads; const BG = 16, bgrid = new Map(), padG = new Map();
  for (const r of pads) for (let ix = Math.floor((r.x0 - 3) / BG); ix <= Math.floor((r.x1 + 3) / BG); ix++) for (let iz = Math.floor((r.z0 - 3) / BG); iz <= Math.floor((r.z1 + 3) / BG); iz++) { const k = ix * 1000 + iz; if (!padG.has(k)) padG.set(k, []); padG.get(k).push(r); }
  const padsAt = (x, z) => padG.get(Math.floor(x / BG) * 1000 + Math.floor(z / BG)) || [];
  for (const r of W.rects) for (let ix = Math.floor((r.x0 - 2) / BG); ix <= Math.floor((r.x1 + 2) / BG); ix++) for (let iz = Math.floor((r.z0 - 2) / BG); iz <= Math.floor((r.z1 + 2) / BG); iz++) { const k = ix * 1000 + iz; if (!bgrid.has(k)) bgrid.set(k, []); bgrid.get(k).push(r); }
  const blocked = (x, z, m = 0) => {
    if (Math.abs(x) > CORE - 2 || Math.abs(z) > CORE - 2) return true;
    if (x > CITY.x0 - 4 - m && x < CITY.x1 + 4 + m && z > CITY.z0 - 4 - m && z < CITY.z1 + 4 + m) return true;
    if (Math.abs(z) < 6.5 + m) return true; if (z > -57 && z < -47) return true;
    for (const r of W.roads) if (x > r.x0 - 2 - m && x < r.x1 + 2 + m && z > r.z0 - 2 - m && z < r.z1 + 2 + m) return true;
    for (const r of padsAt(x, z)) if (x > r.x0 - 1.5 - m && x < r.x1 + 1.5 + m && z > r.z0 - 1.5 - m && z < r.z1 + 1.5 + m) return true;
    for (const zn of W.zones) if ((x - zn.x) ** 2 + (z - zn.z) ** 2 < (zn.r + m) ** 2) return true;
    const l = bgrid.get(Math.floor(x / BG) * 1000 + Math.floor(z / BG)); if (l) for (const r of l) if (x > r.x0 - 1.5 - m && x < r.x1 + 1.5 + m && z > r.z0 - 1.5 - m && z < r.z1 + 1.5 + m) return true;
    return false;
  };
  // chão duro (estradas, betão, asfalto, ladrilho, terra batida, edifícios): a erva também não nasce aí
  W.paved = (x, z) => {
    if (x > CITY.x0 - 1 && x < CITY.x1 + 1 && z > CITY.z0 - 1 && z < CITY.z1 + 1) return true;
    for (const r of W.roads) if (x > r.x0 - 0.3 && x < r.x1 + 0.3 && z > r.z0 - 0.3 && z < r.z1 + 0.3) return true;
    for (const r of padsAt(x, z)) if (x > r.x0 - 0.3 && x < r.x1 + 0.3 && z > r.z0 - 0.3 && z < r.z1 + 0.3) return true;
    const l = bgrid.get(Math.floor(x / BG) * 1000 + Math.floor(z / BG)); if (l) for (const r of l) if (x > r.x0 - 0.2 && x < r.x1 + 0.2 && z > r.z0 - 0.2 && z < r.z1 + 0.2) return true;
    return false;
  };
  // espaçamento com grelha (rápido mesmo com milhares)
  const PG = 6, pgrid = new Map();
  const tooClose = (x, z, d) => { const ix = Math.floor(x / PG), iz = Math.floor(z / PG); for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) { const l = pgrid.get((ix + a) * 1000 + iz + c); if (l) for (const p of l) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < d * d) return true; } return false; };
  const addPt = (x, z) => { const k = Math.floor(x / PG) * 1000 + Math.floor(z / PG); if (!pgrid.has(k)) pgrid.set(k, []); pgrid.get(k).push([x, z]); };
  for (const r of W.rocks) addPt(r.x, r.z);
  const pts = [];
  // manchas de floresta densa e clareiras
  const dense = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 - 0.4) + 0.25 * Math.sin((x + z) * 0.05);
  for (let i = 0; i < 150000 && pts.length < 7600; i++) { const x = rr(-CORE + 2, CORE - 2), z = rr(-CORE + 2, CORE - 2); const edge = false; if (!edge && rnd() > dense(x, z)) continue; if (blocked(x, z)) continue; if (tooClose(x, z, edge ? 2.6 : 3.8)) continue; pts.push([x, z]); addPt(x, z); }
  W.trees = pts.map(([x, z]) => ({ x, z, s: rr(0.85, 1.3), v: rnd() < 0.55 ? 0 : 1, ry: rr(0, 6.28) }));
  const place = (n, kind) => { let c = 0; for (let i = 0; i < 20000 && c < n; i++) { const x = rr(-CORE + 5, CORE - 5), z = rr(-CORE + 5, CORE - 5); if (blocked(x, z, 1) || tooClose(x, z, 5)) continue; W.rocks.push({ x, z, kind, s: rr(0.9, 1.25), ry: rr(0, 6.28) }); addPt(x, z); c++; } };
  place(520, 'stone'); place(240, 'sulfur'); place(240, 'metal');
  // arbustos e troncos caídos
  for (let i = 0; i < 3100; i++) { const x = rr(-CORE + 3, CORE - 3), z = rr(-CORE + 3, CORE - 3); if (blocked(x, z) || tooClose(x, z, 1.6)) continue; for (let k = 0; k < 3; k++) b.ico(rr(0.4, 0.75), x + rr(-0.6, 0.6), 0.3, z + rr(-0.6, 0.6), pick([0x3f5a2a, 0x4a6a32, 0x56703a]), { mat: 'vf', det: 1, sy: 0.75 }); }
  for (let i = 0; i < 270; i++) { const x = rr(-CORE + 6, CORE - 6), z = rr(-CORE + 6, CORE - 6); if (blocked(x, z, 2) || tooClose(x, z, 3)) continue; const ry = rr(0, 3.14), L = rr(3, 5); b.cyl(0.28, 0.32, L, 8, x, 0.28, z, 0x5a4230, { rz: Math.PI / 2, ry }); const c = Math.cos(ry), s = Math.sin(ry); for (let t = -L / 2 + 0.4; t < L / 2; t += 0.8) circ(x + c * t, z - s * t, 0.32, 'l'); }
  // candeeiros de rua nas vilas, monumentos e bases (de 30 em 30 m, alternando o lado, virados para a estrada): de noite vê-se por onde se anda
  { const near = (x, z) => W.zones.some(zn => zn.kind !== 'forest' && (x - zn.x) ** 2 + (z - zn.z) ** 2 < (zn.r + 45) ** 2), lp = [];
    const free = (x, z) => { if (x > CITY.x0 - 6 && x < CITY.x1 + 6 && z > CITY.z0 - 6 && z < CITY.z1 + 6) return false; if (Math.abs(x) > CORE - 4 || Math.abs(z) > CORE - 4) return false; if (W.wet && W.wet(x, z, 1)) return false;
      for (const r of W.roads) if (x > r.x0 - 0.4 && x < r.x1 + 0.4 && z > r.z0 - 0.4 && z < r.z1 + 0.4) return false;
      const l = bgrid.get(Math.floor(x / BG) * 1000 + Math.floor(z / BG)); if (l) for (const r of l) if (x > r.x0 - 0.6 && x < r.x1 + 0.6 && z > r.z0 - 0.6 && z < r.z1 + 0.6) return false;
      for (const q of W.circles) if (Math.abs(q.x - x) < q.r + 0.6 && Math.abs(q.z - z) < q.r + 0.6) return false;
      for (const q of lp) if ((q[0] - x) ** 2 + (q[1] - z) ** 2 < 15 * 15) return false; for (const q of W.lamps) if ((q[0] - x) ** 2 + (q[2] - z) ** 2 < 12 * 12) return false; return true; };
    W.roads.forEach((r, ri) => { const hor = r.x1 - r.x0 >= r.z1 - r.z0, L = hor ? r.x1 - r.x0 : r.z1 - r.z0, hw = (hor ? r.z1 - r.z0 : r.x1 - r.x0) / 2; if (L < 20 || hw > 9) return;
      for (let t = 10, i = ri; t < L - 6; t += 30, i++) { const side = i % 2 ? 1 : -1, a = (hor ? r.x0 : r.z0) + t, c = (hor ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2) + side * (hw + 0.9);
        const x = hor ? a : c, z = hor ? c : a; if (!near(x, z) || !free(x, z)) continue; lp.push([x, z]); lamp(x, z, hor ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2)); } }); }
  // postes de eletricidade ao longo da estrada fora da cidade
  { const ps = []; for (let x = -CORE + 4; x < CORE; x += 18) { if (x > CITY.x0 - 2 && x < CITY.x1 + 2) continue; ps.push(pole(x, 5.4, 9)); } for (let i = 0; i < ps.length - 1; i++) if (Math.abs(ps[i + 1][0] - ps[i][0]) < 20) wires(ps[i], ps[i + 1]); }
  // limite do mapa: muro que só trava (não tapa a vista nem faz sombra) e uma linha contínua no chão, a mesma cor de dia e de noite
  rect(-MAP - 5, -MAP - 5, MAP + 5, -MAP, 's', 9); rect(-MAP - 5, MAP, MAP + 5, MAP + 5, 's', 9); rect(-MAP - 5, -MAP, -MAP, MAP, 's', 9); rect(MAP, -MAP, MAP + 5, MAP, 's', 9);
  for (let i = 0; i < 4; i++) W.rects[W.rects.length - 1 - i].edge = true;
  { const E = new THREE.Color(1.05, 0.62, 0.2), lw = 0.26, y = 0.05; b.box(2 * MAP + lw, 0.012, lw, 0, y, -MAP, E, { mat: 'lit' }); b.box(2 * MAP + lw, 0.012, lw, 0, y, MAP, E, { mat: 'lit' }); b.box(lw, 0.012, 2 * MAP, -MAP, y, 0, E, { mat: 'lit' }); b.box(lw, 0.012, 2 * MAP, MAP, y, 0, E, { mat: 'lit' }); }

  const built = b.build(scene, mats);
  for (const c of W.cuts) linkCut(c, built);
  W.meshes = built.meshes;
  return W;
}
