// Mundo de fora, 2.ª parte: estradas que ligam as terras umas às outras (já não vai tudo dar ao centro), três cidades, oito vilas,
// postos de combustível, aeroporto, prisão, base de radar, fábrica, serração, castelo, barragem, parque de campismo, quintas soltas,
// dois rios e vários lagos. O que tem geometria pesada é preguiçoso (lazy): no arranque só ficam as colisões, portas e loot;
// as paredes fazem-se quando chegas perto.
import * as THREE from 'three';

export function buildRegions(H, house, shop) {
  const { lazy, b, A, W, rect, circ, mp, container, shell, car, pole, lamp, crate, cabinet, counter, table, chair, bed, shelf, fridge, woodFence, blood, bags, cone, barrier, bench, bike, vend, dirt, rr, ri, pick, rnd, shade, mat4, tower, lantern, sofa, books, boxes, clutter, toilet, sinkI, deskPC, plantI, wardrobe } = H;
  const zone = (name, jp, x, z, r, kind, sub, o = {}) => W.zones.push({ name, jp, x, z, r, kind, sub, ...o });
  const VERM = 0xc8321e, OD = 0x535c3b, CONC = 0xb4b0a6, STONE = 0x8f8b82;
  const LIT = (r, g, bl) => new THREE.Color(r, g, bl);

  // ---------- referencial local: u ao longo da estrada, v para dentro (v = 0 na berma). Dentro de F.g(), a geometria vai em (u, y, -v)
  const FR = { s: [[1, 0], [0, -1], 0, 'w', 'e'], n: [[-1, 0], [0, 1], Math.PI, 'e', 'w'], e: [[0, -1], [-1, 0], Math.PI / 2, 's', 'n'], w: [[0, 1], [1, 0], -Math.PI / 2, 'n', 's'] };
  const OPP = { s: 'n', n: 's', e: 'w', w: 'e' };
  const mkF = (X, Z, face) => {
    const [U, V, ry, Ls, Rs] = FR[face], sw = face === 'e' || face === 'w';
    const P = (u, v) => [X + u * U[0] + v * V[0], Z + u * U[1] + v * V[1]];
    const bx = (u0, v0, u1, v1) => { const [a, c] = P(u0, v0), [d, e] = P(u1, v1); return [Math.min(a, d), Math.min(c, e), Math.max(a, d), Math.max(c, e)]; };
    const side = s => ({ front: face, back: OPP[face], left: Ls, right: Rs }[s]);
    const F = {
      P, bx, ry, face,
      R: (u0, v0, u1, v1, k = 's', h = 3) => { const q = bx(u0, v0, u1, v1); rect(q[0], q[1], q[2], q[3], k, h); },
      mp: (u0, v0, u1, v1, col) => { const q = bx(u0, v0, u1, v1); mp(q[0], q[1], q[2], q[3], col); },
      floor: (u0, v0, u1, v1, y, hex, mat) => { const q = bx(u0, v0, u1, v1); b.floor(q[0], q[1], q[2], q[3], y, hex, mat); },
      C: (u, v, label, tbl, o) => { const [x, z] = P(u, v); return container(x, z, label, tbl, o); },
      g: fn => { b.push(X, 0, Z, ry); fn(); b.pop(); },
      at: (u, v, lry = 0) => { const [x, z] = P(u, v); return [x, z, ry + lry]; },
      shell: (u0, v0, u1, v1, o, ops = {}) => { const q = bx(u0, v0, u1, v1), wo = {};
        for (const s in ops) { const ws = side(s), ns = ws === 'n' || ws === 's', fb = s === 'front' || s === 'back';
          wo[ws] = ops[s].map(op => { const p = fb ? P(op.at, 0) : P(0, op.at); return { ...op, at: ns ? p[0] : p[1] }; }); }
        return shell(q[0], q[1], q[2], q[3], { ...o, ops: wo }); },
      house: (u, v, w, d, name, style) => { const [x, z] = P(u, v); return house(x, z, sw ? d : w, sw ? w : d, face, style, name); },
      shop: (u, v, w, d, jp, pt) => { const [x, z] = P(u, v); return shop(x, z, sw ? d : w, sw ? w : d, face, jp, pt); },
      car: (u, v, lry, c, o) => { const [x, z] = P(u, v); car(x, z, ry + lry, c, o); },
    };
    return F;
  };
  // letreiro virado para a estrada (em coordenadas locais)
  const sgn = (F, u, y, v, txt, bg, fg, w, h, o = {}) => { const s = h > w ? A.sign(txt, { w: 128, h: 384, bg, fg, vertical: true }) : A.sign(txt, { w: 320, h: Math.max(48, Math.round(320 * h / w)), bg, fg, pad: 0.12, sub: o.sub }); F.g(() => { b.push(u, y, -v, o.ry || 0); b.box(w + 0.12, h + 0.12, 0.1, 0, 0, -0.06, 0x2a2b2c); b.plane(w, h, 0, 0, 0.0, 0xffffff, { mat: 'sign', uv: s }); b.pop(); }); };

  // ---------- peças
  const torii = (x, z, s = 1, ry = 0) => { b.push(x, 0, z, ry); for (const sx of [-1, 1]) { b.cyl(0.17 * s, 0.21 * s, 4.1 * s, 12, sx * 1.6 * s, 2.05 * s, 0, VERM); b.cyl(0.24 * s, 0.24 * s, 0.35 * s, 12, sx * 1.6 * s, 0.17 * s, 0, 0x1d1d1d); } b.box(4.6 * s, 0.3 * s, 0.42 * s, 0, 4.25 * s, 0, 0x1d1d1d); b.box(4.3 * s, 0.14 * s, 0.36 * s, 0, 4.05 * s, 0, VERM); b.box(3.9 * s, 0.22 * s, 0.28 * s, 0, 3.5 * s, 0, VERM); b.pop(); for (const sx of [-1, 1]) circ(x + Math.cos(ry) * sx * 1.6 * s, z - Math.sin(ry) * sx * 1.6 * s, 0.24 * s); };
  const sakura = (x, z, s = 1) => { b.cyl(0.13 * s, 0.2 * s, 2.4 * s, 8, x, 1.2 * s, z, 0x5a3a2e, { mat: 'vf' }); for (const [dx, dy, dz, r, c] of [[0, 3.1, 0, 1.5, 0xf2b8c8], [0.9, 3.5, 0.4, 1.1, 0xf6c8d6], [-0.8, 3.4, -0.3, 1.05, 0xeaa8bc]]) b.ico(r * s, x + dx * s, dy * s, z + dz * s, c, { mat: 'vf', det: 1 }); circ(x, z, 0.24 * s); };
  const pine = (x, z, s = 1) => { b.cyl(0.14 * s, 0.2 * s, 1.6 * s, 6, x, 0.8 * s, z, 0x4a3426, { mat: 'vf' }); for (let i = 0; i < 3; i++) b.add(new THREE.ConeGeometry((1.7 - i * 0.45) * s, 1.9 * s, 7), 0x2f4a2a, 'vf', mat4(x, (1.9 + i * 1.05) * s, z, i)); circ(x, z, 0.24 * s); };
  const toro = (x, z) => { b.cyl(0.3, 0.36, 0.25, 8, x, 0.12, z, STONE); b.cyl(0.1, 0.12, 0.8, 8, x, 0.65, z, STONE); b.box(0.5, 0.42, 0.5, x, 1.25, z, STONE); b.box(0.32, 0.22, 0.04, x, 1.25, z + 0.24, LIT(1.4, 1.0, 0.5), { mat: 'lit' }); b.add(new THREE.ConeGeometry(0.5, 0.35, 4), STONE, 'v', mat4(x, 1.64, z, Math.PI / 4)); circ(x, z, 0.3); };
  // vedação de rede (só em linha reta, x ou z); trava e não se salta
  const fenceL = (x0, z0, x1, z1, h = 2.4) => { const hor = Math.abs(z1 - z0) < 0.01, L = hor ? x1 - x0 : z1 - z0; if (L <= 0.05) return;
    b.box(hor ? L : 0.04, h, hor ? 0.04 : L, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, 0x9aa0a4, { mat: 'fence' });
    const n = Math.ceil(L / 3.5); for (let i = 0; i <= n; i++) b.cyl(0.05, 0.05, h + 0.12, 5, hor ? x0 + L * i / n : x0, (h + 0.12) / 2, hor ? z0 : z0 + L * i / n, 0x6a6e72, { mat: 'm' });
    if (hor) rect(x0, z0 - 0.08, x1, z0 + 0.08, 'g', h); else rect(x0 - 0.08, z0, x0 + 0.08, z1, 'g', h); }; // 'g': trava, mas vê-se e dispara-se através dela
  // retângulo de vedação com portões (gaps: lista de [lado, a0, a1])
  const fenceBox = (x0, z0, x1, z1, gaps = [], h = 2.4) => { const seg = (sd, a0, a1, f) => { let pts = [[a0, a1]]; for (const [s, g0, g1] of gaps) if (s === sd) pts = pts.flatMap(([p, q]) => g1 <= p || g0 >= q ? [[p, q]] : [[p, Math.max(p, g0)], [Math.min(q, g1), q]]); for (const [p, q] of pts) if (q - p > 0.3) f(p, q); };
    seg('n', x0, x1, (p, q) => fenceL(p, z0, q, z0, h)); seg('s', x0, x1, (p, q) => fenceL(p, z1, q, z1, h)); seg('w', z0, z1, (p, q) => fenceL(x0, p, x0, q, h)); seg('e', z0, z1, (p, q) => fenceL(x1, p, x1, q, h)); };
  const cwall = (x0, z0, x1, z1, h = 5, c = 0xa8a49a) => { b.box(x1 - x0, h, z1 - z0, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, c, { jit: 0.03 }); b.box(x1 - x0 + 0.1, 0.18, z1 - z0 + 0.1, (x0 + x1) / 2, h + 0.09, (z0 + z1) / 2, shade(c, 0.8)); rect(x0, z0, x1, z1, 's', h); };
  const wtower = (x, z, tbl = 'militar', c = 0x5a4a32) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.box(0.22, 6.2, 0.22, x + sx * 1.3, 3.1, z + sz * 1.3, c); rect(x + sx * 1.3 - 0.15, z + sz * 1.3 - 0.15, x + sx * 1.3 + 0.15, z + sz * 1.3 + 0.15, 's', 6); }
    b.box(3.4, 0.22, 3.4, x, 6.1, z, shade(c, 1.15)); for (const [dx, dz, w, d] of [[0, -1.65, 3.4, 0.1], [0, 1.65, 3.4, 0.1], [-1.65, 0, 0.1, 3.4], [1.65, 0, 0.1, 3.4]]) b.box(w, 1.0, d, x + dx, 6.7, z + dz, shade(c, 1.05));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.12, 1.6, 0.12, x + sx * 1.6, 7.9, z + sz * 1.6, c); b.box(3.9, 0.18, 3.9, x, 8.75, z, 0x4a4a3a, { rx: 0.06 });
    b.box(0.5, 0.35, 0.5, x + 1, 7.5, z - 1, LIT(1.8, 1.7, 1.4), { mat: 'lit' });
    crate(x + 2.3, z, Math.PI / 2, 'Abrir caixa da torre', tbl); };
  // torre de iluminação (aeroporto, bases): mastro de 12 m com quatro projetores; de noite ilumina uma área grande
  const mast = (x, z) => { W.lamps.push([x, 12, z]); b.cyl(0.16, 0.24, 12, 8, x, 6, z, 0x8a8e92, { mat: 'm' }); b.box(2.4, 0.16, 0.16, x, 12.2, z, 0x6a6e72, { mat: 'm' }); for (const dx of [-0.9, -0.3, 0.3, 0.9]) { b.box(0.5, 0.36, 0.22, x + dx, 12.0, z, 0x3a3c3e, { mat: 'm' }); b.box(0.42, 0.28, 0.04, x + dx, 11.95, z - 0.12, new THREE.Color(1.9, 1.75, 1.4), { mat: 'lit', rx: 0.5 }); } circ(x, z, 0.3); };
  const bunker = (x0, z0, x1, z1, door, tbl = 'paiol', name = 'Bunker') => { const mid = door === 'n' || door === 's' ? (x0 + x1) / 2 : (z0 + z1) / 2;
    shell(x0, z0, x1, z1, { name, wall: 0x7a7c74, floor: 0x5a5c56, h: 2.8, roofC: 0x55574f, mapc: '#5c5e56', trim: 0x3a3c36, doorC: 0x4a5056, ops: { [door]: [{ at: mid, w: 1.4, k: 'd' }] } });
    const D = W.doors[W.doors.length - 1]; D.lock = { hp: 1400, max: 1400 }; D.t = D.target = 0;
    // terra dos lados (trava como as paredes)
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    for (const [sd, ux, uz] of [['n', 0, -1], ['s', 0, 1], ['w', -1, 0], ['e', 1, 0]]) if (sd !== door) { const hor = uz !== 0; b.box(hor ? w + 2 : 2.2, 2.4, hor ? 2.2 : d + 2, cx + ux * (w / 2 + 0.9), 1.0, cz + uz * (d / 2 + 0.9), 0x5e6a3e, { mat: 'vf', rx: hor ? -uz * 0.5 : 0, rz: hor ? 0 : ux * 0.5 });
      if (hor) rect(cx - w / 2 - 1, uz < 0 ? z0 - 2 : z1, cx + w / 2 + 1, uz < 0 ? z0 : z1 + 2, 's', 2.4); else rect(ux < 0 ? x0 - 2 : x1, cz - d / 2 - 1, ux < 0 ? x0 : x1 + 2, cz + d / 2 + 1, 's', 2.4); } // a terra também trava (antes dava para entrar nela)
    for (let i = 0; i < 2; i++) crate(x0 + 1.4 + i * (w - 2.8), z0 + (door === 'n' ? d - 1.1 : 1.1), 0, 'Abrir caixa do bunker', tbl);
    cabinet(door === 'w' ? x1 - 0.5 : x0 + 0.5, cz, 1.1, 'Abrir armário do bunker', tbl, door === 'w' ? -Math.PI / 2 : Math.PI / 2, 0x4a5056); };
  const truck = (x, z, ry, c = OD) => { b.push(x, 0, z, ry); b.rbox(2.3, 2.0, 2.0, 0.2, 0, 1.4, 3.0, c, { mat: 'm' }); b.box(2.0, 0.7, 0.06, 0, 2.0, 4.02, 0x1f2a33, { mat: 'win' }); b.box(2.4, 1.0, 5.0, 0, 1.2, -0.6, c, { mat: 'm' }); b.add(new THREE.CylinderGeometry(1.25, 1.25, 5.0, 10, 1, false, 0, Math.PI), shade(c, 0.8), 'v', mat4(0, 1.7, -0.6, 0, Math.PI / 2, 0, 1, 1, 1));
    for (const sx of [-1, 1]) for (const sz of [-2.4, 0, 3.0]) b.cyl(0.5, 0.5, 0.36, 12, sx * 1.15, 0.5, sz, 0x1b1b1c, { rz: Math.PI / 2 }); b.pop();
    const cs = Math.abs(Math.sin(ry)) > 0.5; rect(x - (cs ? 4.2 : 1.3), z - (cs ? 1.3 : 4.2), x + (cs ? 4.2 : 1.3), z + (cs ? 1.3 : 4.2), 's', 2.6); mp(x - (cs ? 4 : 1.2), z - (cs ? 1.2 : 4), x + (cs ? 4 : 1.2), z + (cs ? 1.2 : 4), '#4a5236');
    container(x - Math.sin(ry) * 3.6, z - Math.cos(ry) * 3.6, 'Abrir caixa do camião', 'militar', { y: 1.0 }); };
  const box20 = (x, z, ry, c) => { b.push(x, 0, z, ry); b.box(2.44, 2.6, 6.06, 0, 1.3, 0, c, { mat: 'm', jit: 0.05 }); for (let i = -2; i <= 2; i++) b.box(2.48, 2.5, 0.08, 0, 1.3, i * 1.2, shade(c, 0.8), { mat: 'm' }); b.pop(); const cs = Math.abs(Math.sin(ry)) > 0.5; rect(x - (cs ? 3.05 : 1.24), z - (cs ? 1.24 : 3.05), x + (cs ? 3.05 : 1.24), z + (cs ? 1.24 : 3.05), 's', 2.6); mp(x - (cs ? 3 : 1.2), z - (cs ? 1.2 : 3), x + (cs ? 3 : 1.2), z + (cs ? 1.2 : 3), '#6a6e66'); };
  const drum = (x, z, c = 0x3a5a8a) => { if (!b.model('bidao', x, 0, z, 0, c, { jit: 0.08 })) { b.cyl(0.3, 0.3, 0.9, 10, x, 0.45, z, c, { mat: 'm', jit: 0.08 }); b.cyl(0.31, 0.31, 0.04, 10, x, 0.7, z, shade(c, 0.7), { mat: 'm' }); } circ(x, z, 0.3); };
  const sandbags = (x0, z0, x1, z1) => { const hor = Math.abs(z1 - z0) < 0.01, L = hor ? x1 - x0 : z1 - z0, n = Math.max(1, Math.floor(L / 0.7)); for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const t = (i + 0.5 + (k % 2) * 0.5) / n; if (t > 1) continue; b.rbox(hor ? 0.68 : 0.42, 0.26, hor ? 0.42 : 0.68, 0.1, hor ? x0 + L * t : x0, 0.14 + k * 0.25, hor ? z0 : z0 + L * t, 0x8a7a5a, { jit: 0.06 }); } if (hor) rect(x0, z0 - 0.22, x1, z0 + 0.22, 'l', 0.8); else rect(x0 - 0.22, z0, x0 + 0.22, z1, 'l', 0.8); };
  const hay = (x, z) => { b.cyl(0.8, 0.8, 1.3, 12, x, 0.8, z, 0xd8b85a, { rz: Math.PI / 2 }); circ(x, z, 0.8); };
  const tent = (x, z, ry, c) => { b.add(new THREE.ConeGeometry(1.7, 1.9, 4), c, 'vf', mat4(x, 0.95, z, Math.PI / 4 + ry)); rect(x - 1.2, z - 1.2, x + 1.2, z + 1.2, 'l', 1.2); container(x + Math.sin(ry) * 1.4, z + Math.cos(ry) * 1.4, 'Revistar tenda', 'cabana', { y: 0.3 }); };
  const field = (x0, z0, x1, z1, crop = 0x5a7a32) => { b.floor(x0, z0, x1, z1, 0.015, 0xffffff, 'dirt'); mp(x0, z0, x1, z1, '#6b5b44'); const hor = x1 - x0 > z1 - z0; if (hor) for (let z = z0 + 1; z < z1 - 0.5; z += 1.5) b.box(x1 - x0 - 1, 0.35, 0.45, (x0 + x1) / 2, 0.18, z, crop, { mat: 'vf', jit: 0.08 }); else for (let x = x0 + 1; x < x1 - 0.5; x += 1.5) b.box(0.45, 0.35, z1 - z0 - 1, x, 0.18, (z0 + z1) / 2, crop, { mat: 'vf', jit: 0.08 }); };
  const CARC = [0x8a2a22, 0x3a3d40, 0xd8d6d0, 0x2a5a8a, 0x4a5a3a, 0xe8e6e0, 0x6a6a4a, 0x2a2b2c];

  // ---------- estradas: asfalto (7 m) e terra (5 m), em troços retos que dobram em ângulo reto
  const ASPH = 0x8a8b8e, WHITE = 0xe9e7e1, HW = 3.5, HD = 2.5;
  const segs = [];
  const asph = (x0, z0, x1, z1) => { W.roads.push({ x0, z0, x1, z1, rg: 1 }); b.floor(x0, z0, x1, z1, 0.016, ASPH, 'asph'); mp(x0, z0, x1, z1, '#4b4c4f'); };
  const path = (pts, kind = 'a') => { const hw = kind === 'a' ? HW : HD;
    for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], hor = az === bz;
      const e0 = i > 0 ? hw : 0, e1 = i < pts.length - 2 ? hw : 0; // nas curvas, o troço horizontal cobre o canto
      let x0, z0, x1, z1;
      if (hor) { const lo = Math.min(ax, bx), hi = Math.max(ax, bx), el = ax < bx ? e0 : e1, eh = ax < bx ? e1 : e0; x0 = lo - el; x1 = hi + eh; z0 = az - hw; z1 = az + hw; }
      else { const lo = Math.min(az, bz), hi = Math.max(az, bz), el = az < bz ? e0 : e1, eh = az < bz ? e1 : e0; x0 = ax - hw; x1 = ax + hw; z0 = lo + (el ? hw : 0); z1 = hi - (eh ? hw : 0); }
      if (kind === 'a') asph(x0, z0, x1, z1); else dirt(x0, z0, x1, z1);
      segs.push({ ax, az, bx, bz, hor, kind, x0, z0, x1, z1 });
      if (kind === 'a') { const L = hor ? x1 - x0 : z1 - z0; for (let s = 12; s < L - 12; s += 14) b.box(hor ? 3 : 0.16, 0.01, hor ? 0.16 : 3, hor ? x0 + s : ax, 0.03, hor ? az : z0 + s, WHITE, { mat: 'decal' }); } } };

  path([[-900, 0], [-900, -2700], [-2545, -2700]]);
  path([[-2756, -2700], [-3300, -2700], [-3300, -3226]]);
  path([[-2650, -2595], [-2650, -900], [-3850, -900]]);
  path([[-1500, -2700], [-1500, -3356]], 'd');
  path([[0, -3300], [1700, -3300], [1700, -2520], [3300, -2520], [3300, 0]]);
  path([[2000, -2000], [2000, -2520]]);
  path([[1500, 0], [1500, -900], [2000, -900]]);
  path([[0, 1500], [3300, 1500]]); path([[3300, 0], [3300, 1500]]);
  path([[2650, 1500], [2650, 2295]]);
  path([[0, 3300], [652, 3300]], 'd');
  path([[-1500, 0], [-1500, 900], [-2300, 900], [-2300, 2606]]);
  path([[-2300, 1600], [-3242, 1600]], 'd');
  path([[-2300, 2714], [-2300, 3200], [0, 3200]]);
  path([[-1500, 900], [-1500, 1250], [-1300, 1250], [-1300, 1452]], 'd');

  // ---------- água: lagos com margem irregular e rios em curva suave; nada-se (devagar e sem armas), os carros não entram
  const lakes = [], rivers = [], WG = 64, wgrid = new Map();
  const lakeR = (L, a) => 1 + 0.1 * Math.sin(3 * a + L.p1) + 0.06 * Math.sin(5 * a + L.p2) + 0.03 * Math.sin(9 * a + L.p1 * 2);
  const lake = (x, z, rx, rz, name) => { const L = { x, z, rx, rz, name, p1: rr(0, 6.28), p2: rr(0, 6.28) }; L.rf = a => lakeR(L, a); lakes.push(L); return L; };
  const river = (cp, w, name) => { const c = new THREE.CatmullRomCurve3(cp.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'); const n = Math.ceil(c.getLength() / 10);
    const P = c.getSpacedPoints(n).map((v, i) => [v.x, v.z, w * (0.8 + 0.25 * Math.sin(i * 0.21 + w) + 0.12 * Math.sin(i * 0.67))]); const R = { P, name }; rivers.push(R);
    for (let i = 0; i < P.length - 1; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1]; for (let gx = Math.floor((Math.min(ax, bx) - w) / WG); gx <= Math.floor((Math.max(ax, bx) + w) / WG); gx++) for (let gz = Math.floor((Math.min(az, bz) - w) / WG); gz <= Math.floor((Math.max(az, bz) + w) / WG); gz++) { const k = gx * 1000 + gz; if (!wgrid.has(k)) wgrid.set(k, []); wgrid.get(k).push([R, i]); } }
    return R; };
  // dentro de água (sem contar pontes): m = margem a mais (em metros)
  const wetRaw = (x, z, m = 0) => {
    for (const L of lakes) { const dx = (x - L.x) / L.rx, dz = (z - L.z) / L.rz; if (dx * dx + dz * dz > 2.2) continue; const a = Math.atan2(dz, dx), r = lakeR(L, a); const ex = Math.cos(a) * r * L.rx + Math.sign(Math.cos(a)) * m, ez = Math.sin(a) * r * L.rz + Math.sign(Math.sin(a)) * m; if ((x - L.x) ** 2 + (z - L.z) ** 2 < ex * ex + ez * ez) return L; }
    const l = wgrid.get(Math.floor(x / WG) * 1000 + Math.floor(z / WG)); if (l) for (const [R, i] of l) { const [ax, az, aw] = R.P[i], [bx, bz, bw] = R.P[i + 1], vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz))), hw = aw + (bw - aw) * t + m; if ((ax + vx * t - x) ** 2 + (az + vz * t - z) ** 2 < hw * hw) return R; }
    return null; };
  const onRoad = (x, z, m = 0) => { for (const r of W.roads) if (x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m) return true; return false; };
  W.wetRaw = wetRaw; W.wet = (x, z, m = 0) => !!wetRaw(x, z, m) && !onRoad(x, z, 0.2);

  const L1 = lake(-1300, 1760, 250, 150, 'Lago Shirako'), L2 = lake(1550, 1230, 230, 150, 'Lago Ōike'), L3 = lake(2350, -1650, 190, 130, 'Lago Kagami');
  for (const [x, z, r] of [[-600, -2300, 45], [900, -2050, 40], [3000, -600, 50], [-3000, 300, 55], [600, 2300, 45], [-2900, 3420, 50], [3500, 3200, 60], [-3600, -1800, 40], [-500, 2450, 35], [2950, 3600, 40]]) lake(x, z, r, r * rr(0.75, 0.95), 'Lagoa');
  river([[-2250, -4040], [-2300, -3400], [-2230, -2950], [-2120, -2500], [-1850, -2050], [-1700, -1500], [-1640, -900], [-1720, -300], [-1760, 350], [-1640, 820], [-1560, 1300], [-1470, 1760]], 13, 'Rio Akagawa');
  river([[-1190, 1880], [-1140, 2080], [-1080, 2500], [-1110, 2900], [-1180, 3200], [-1250, 3600], [-1300, 4040]], 12, 'Rio Akagawa');
  river([[1350, 450], [1450, 900], [1520, 1120]], 7, 'Ribeira');
  river([[1760, 1330], [1790, 1700], [1850, 2000], [2050, 2400], [2250, 3100], [2350, 3600], [2400, 4040]], 11, 'Rio Hoshi');
  W.water = { lakes, rivers };
  // desenho: água escura e lisa por cima de uma margem de lama; partido em pedaços para só se desenhar o que está à vista
  { const WC = 0x24464f, SHAL = 0x3a6468, MUD = 0x5d5a46;
    const ribbon = (P, i0, i1, add, y, col) => { const cx = P[i0][0], cz = P[i0][1], pos = [], idx = [];
      for (let i = i0; i <= i1; i++) { const p = P[i], q = P[Math.min(i + 1, P.length - 1)], o = P[Math.max(i - 1, 0)], dx = q[0] - o[0], dz = q[1] - o[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, w = p[2] + add;
        pos.push(p[0] + nx * w - cx, 0, p[1] + nz * w - cz, p[0] - nx * w - cx, 0, p[1] - nz * w - cz); if (i > i0) { const k = (i - i0) * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
      b.add(g, col, add > 0 ? 'v' : 'water', mat4(cx, y, cz)); };
    for (const R of rivers) for (let i = 0; i < R.P.length - 1; i += 10) { const i1 = Math.min(R.P.length - 1, i + 10); ribbon(R.P, i, i1, 1.8, 0.003, MUD); ribbon(R.P, i, i1, 0, 0.007, SHAL); ribbon(R.P, i, i1, -2.2, 0.009, WC); }
    for (const L of lakes) { for (const [add, y, col] of [[2.2, 0.003, MUD], [0, 0.007, SHAL], [-4, 0.009, WC]]) { const sh = new THREE.Shape(), N = 72; for (let k = 0; k <= N; k++) { const a = k / N * Math.PI * 2, r = lakeR(L, a); const px = Math.cos(a) * (r * L.rx + add), pz = Math.sin(a) * (r * L.rz + add); if (k) sh.lineTo(px, -pz); else sh.moveTo(px, -pz); }
      const g = new THREE.ShapeGeometry(sh, 2); g.rotateX(-Math.PI / 2); const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); b.add(g, col, add > 0 ? 'v' : 'water', mat4(L.x, y, L.z)); } }
    // juncos e pedras na margem dos lagos
    for (const L of lakes) { const n = Math.round(L.rx / 5); for (let k = 0; k < n; k++) { const a = rr(0, 6.28), r = lakeR(L, a), x = L.x + Math.cos(a) * (r * L.rx + rr(-1, 2)), z = L.z + Math.sin(a) * (r * L.rz + rr(-1, 2)); if (onRoad(x, z, 2)) continue; if (rnd() < 0.7) for (let j = 0; j < 4; j++) b.cyl(0.02, 0.03, rr(0.8, 1.4), 3, x + rr(-0.5, 0.5), 0.5, z + rr(-0.5, 0.5), 0x6a7a3a, { mat: 'vf' }); else b.ico(rr(0.4, 0.9), x, 0.1, z, 0x8a867c, { mat: 'vf' }); } }
  }
  // pontes: onde uma estrada passa por cima de água, guardas dos dois lados e pilares
  { for (const r of W.roads) { const hor = r.x1 - r.x0 > r.z1 - r.z0, L = hor ? r.x1 - r.x0 : r.z1 - r.z0; let s0 = null;
      for (let s = 0; s <= L; s += 2) { const x = hor ? r.x0 + s : (r.x0 + r.x1) / 2, z = hor ? (r.z0 + r.z1) / 2 : r.z0 + s, w = !!wetRaw(x, z, 3);
        if (w && s0 === null) s0 = s; if ((!w || s + 2 > L) && s0 !== null) { const a0 = s0 - 4, a1 = s + 2; s0 = null; if (a1 - a0 < 6) continue;
          const B = hor ? [r.x0 + a0, r.z0, r.x0 + a1, r.z1] : [r.x0, r.z0 + a0, r.x1, r.z0 + a1], Lb = a1 - a0, cx = (B[0] + B[2]) / 2, cz = (B[1] + B[3]) / 2;
          b.floor(B[0] - (hor ? 0 : 0.6), B[1] - (hor ? 0.6 : 0), B[2] + (hor ? 0 : 0.6), B[3] + (hor ? 0.6 : 0), 0.013, 0x8a8478, 'conc');
          for (const sd of [-1, 1]) { const ex = hor ? cx : sd > 0 ? B[2] + 0.4 : B[0] - 0.4, ez = hor ? (sd > 0 ? B[3] + 0.4 : B[1] - 0.4) : cz;
            b.box(hor ? Lb : 0.3, 0.55, hor ? 0.3 : Lb, ex, 0.28, ez, CONC, { jit: 0.03 }); b.box(hor ? Lb : 0.08, 0.08, hor ? 0.08 : Lb, ex, 1.05, ez, 0x8a8e92, { mat: 'm' });
            for (let t = 0; t <= Lb; t += 2.5) b.box(0.08, 0.5, 0.08, hor ? B[0] + t : ex, 0.8, hor ? ez : B[1] + t, 0x8a8e92, { mat: 'm' });
            if (hor) rect(B[0], ez - 0.18, B[2], ez + 0.18, 's', 1.1); else rect(ex - 0.18, B[1], ex + 0.18, B[3], 's', 1.1); }
          (W.bridges = W.bridges || []).push(B); } } } }

  // ---------- quintas e casas soltas pelas estradas novas (antes de tudo, para não calharem em cima das terras)
  const far = (x, z, d) => { for (const zn of W.zones) if (Math.hypot(x - zn.x, z - zn.z) < zn.r + d) return false; return !wetRaw(x, z, 25); };
  const places = [];
  const placeOk = (x, z, r) => { if (Math.max(Math.abs(x), Math.abs(z)) < 520 || Math.max(Math.abs(x), Math.abs(z)) > 3930) return false; for (const p of places) if (Math.hypot(x - p[0], z - p[1]) < r + p[2]) return false; return far(x, z, r); };

  // ---------- vilas
  const NMV = []; // vilas novas (para o mapa)
  const koban = F => { F.shell(-3.2, 3, 3.2, 8.4, { name: 'Posto da polícia', wall: 0xe8e6e0, floor: 0xc8ccd0, h: 3.0, mapc: '#8a9aa8', roofC: 0x3a4a6a, trim: 0x5a6a7a }, { front: [{ at: -1, w: 1.3, k: 'd' }, { at: 1.6, w: 1.4, k: 'w' }], back: [{ at: 1.2, w: 1.2, k: 'w' }] });
    F.g(() => { b.sph(0.22, -1, 2.75, -2.85, LIT(2.4, 0.25, 0.15), { mat: 'lit' }); }); sgn(F, 1.6, 2.65, 2.88, '交番', '#f4f2ea', '#1f3a6a', 1.5, 0.4, { sub: 'POLÍCIA' });
    { const [x, z, r] = F.at(-2.4, 7.8, 0); cabinet(x, z, 1.0, 'Abrir cacifo da polícia', 'policia', r, 0x5a6a7a); } { const [x, z] = F.P(1.6, 6.6); table(x, z, 1.3, 0.7, 0x6a6e72); F.C(1.6, 6.6, 'Revistar secretária', 'policia', { y: 0.8 }); }
    F.car(5.5, 2.2, Math.PI / 2, 0xf2f2f0, { police: true }); };
  const clinic = F => { F.shell(-5, 3, 5, 11, { name: 'Clínica', wall: 0xeeece6, floor: 0xd8dcd8, h: 3.0, mapc: '#9aa7a3', roofC: 0x6a7a8a, trim: 0x6a6e72 }, { front: [{ at: 0, w: 1.6, k: 'd' }, { at: -3, w: 1.6, k: 'w' }, { at: 3, w: 1.6, k: 'w' }], back: [{ at: 3.2, w: 1.2, k: 'd' }] });
    sgn(F, 0, 2.7, 2.88, '診療所', '#ffffff', '#1f6a9a', 2.2, 0.45, { sub: 'CLÍNICA' });
    { const [x, z, r] = F.at(-3.5, 9.6, 0); bed(x, z, r); } { const [x, z, r] = F.at(3.6, 10.4, 0); cabinet(x, z, 1.2, 'Abrir armário de medicamentos', 'hospital', r, 0xe6eae8); } F.C(0, 7, 'Revistar carrinho', 'farmacia'); F.C(-3.8, 4.4, 'Revistar balcão', 'hospital', { y: 0.9 }); };
  const garage = F => { F.shell(-6, 3, 6, 13, { name: 'Oficina', wall: 0x9a9690, floor: 0x7a7a76, h: 4.0, mapc: '#686c70', roofC: 0x5a5e62, trim: 0x4a4e52 }, { front: [{ at: -1.2, w: 3.4, k: 'd' }, { at: 3.8, w: 1.2, k: 'd' }], right: [{ at: 8, w: 1.4, k: 'w' }] });
    sgn(F, 0, 3.6, 2.88, '整備工場', '#2a2b2c', '#e8c040', 3, 0.5, { sub: 'OFICINA' });
    F.car(-1.5, 8.5, 0, pick(CARC), { wreck: true }); { const [x, z, r] = F.at(-5.4, 11, Math.PI / 2); crate(x, z, r, 'Abrir caixa de ferramentas', 'oficina', 0x9a2a22); } { const [x, z, r] = F.at(4.5, 12.4, 0); cabinet(x, z, 1.4, 'Abrir armário', 'oficina', r, 0x6a7078); } F.C(4, 6, 'Revistar bancada', 'oficina', { y: 0.9 });
    { const [x, z] = F.P(5, 9); drum(x, z, 0x8a2a22); } };
  const shrine = F => { const [x, z] = F.P(0, 4), [hx, hz] = F.P(0, 12); torii(x, z, 0.85, F.ry); F.g(() => { b.box(5, 0.5, 4.2, 0, 0.25, -12, 0x8a8478); b.box(4.2, 2.6, 3.4, 0, 1.8, -12, 0x6a4a32); b.add(new THREE.ConeGeometry(3.9, 1.6, 4), 0x3a3a3c, 'v', mat4(0, 3.9, -12, Math.PI / 4, 0, 0, 1, 1, 0.9)); b.box(1.4, 0.8, 0.6, 0, 0.9, -9.6, 0x5a3a22); });
    F.R(-2.5, 9.9, 2.5, 14.1, 's', 3); F.mp(-2.5, 9.9, 2.5, 14.1, '#6a4a32'); F.C(0, 9.4, 'Revistar caixa de oferendas', 'casa', { y: 0.9 }); const [a, c] = F.P(-2.4, 7), [d, e] = F.P(2.4, 7); toro(a, c); toro(d, e); sakura(...F.P(-5, 9), 1); };
  const barn = F => { F.shell(-6, 3, 6, 12, { name: 'Celeiro', wall: 0x8a3a2a, floor: 0x7a6a52, h: 4.2, roof: 'kawara', roofC: 0x4a3a30, mapc: '#6a3a2a', trim: 0x4a2a1c }, { front: [{ at: 0, w: 3.0, k: 'd' }], left: [{ at: 7, w: 1.2, k: 'w' }] });
    hay(...F.P(-3.5, 10.4)); hay(...F.P(-1.6, 10.4)); { const [x, z, r] = F.at(4.6, 10.8, 0); crate(x, z, r, 'Revistar caixote', 'cabana', 0x7a5a3a); } F.C(4, 5, 'Revistar sacos', 'casa', { y: 0.4 }); };
  // vila ao longo de uma estrada que já existe: casas dos dois lados, e lojas e serviços pelo meio
  const town = (name, jp, X, Z, ax, n, extra = ['shop', 'koban', 'garage', 'shrine', 'clinic']) => { zone(name, jp, X, Z, Math.max(70, n * 8 + 12), 'town', 'Vila · casas e serviços', { nz: 18 + n }); places.push([X, Z, n * 8 + 40]); NMV.push(name);
    const lots = []; for (let i = 0; i < n; i++) lots.push([(Math.floor(i / 2) - (Math.ceil(n / 2) - 1) / 2) * 17 + rr(-1.5, 1.5), i % 2 ? 1 : -1]);
    const kinds = lots.map(() => 'house'); extra.forEach((k, j) => { const i = Math.min(lots.length - 1, 1 + j * 2 + (j % 2)); kinds[i] = k; });
    lots.forEach(([a, side], i) => { const lx = ax === 'x' ? X + a : X + side * (HW + 1.6), lz = ax === 'x' ? Z + side * (HW + 1.6) : Z + a, face = ax === 'x' ? (side < 0 ? 's' : 'n') : (side < 0 ? 'e' : 'w');
      lazy(lx - 22, lz - 22, lx + 22, lz + 22, () => { const F = mkF(lx, lz, face), k = kinds[i];
        if (k === 'house') { const w = rr(7.4, 9.2), d = rr(6.4, 7.8); F.house(rr(-1, 1), 2.6 + d / 2 + rr(0, 2.5), w, d); if (rnd() < 0.45) F.car(w / 2 + 2.2, 4.5, rr(-0.2, 0.2), pick(CARC), { wreck: rnd() < 0.5 }); if (rnd() < 0.3) { const [x, z] = F.P(-w / 2 - 1.5, 1.2); vend(x, z, F.ry, pick([0xc23a2e, 0x2f6fb3, 0x3a7a4a])); } }
        else if (k === 'shop') { F.shop(0, 2.4 + 4, 11, 8, pick(['商店', '酒屋', 'スーパー']), pick(['Mercearia', 'Loja', 'Supermercado'])); const [x, z] = F.P(-6.6, 1.2); vend(x, z, F.ry, 0xc23a2e); bike(...F.P(6.6, 1.4), F.ry); }
        else if (k === 'koban') koban(F); else if (k === 'clinic') clinic(F); else if (k === 'garage') garage(F); else if (k === 'shrine') shrine(F); else if (k === 'barn') barn(F); }); });
    // postes e candeeiros ao longo da rua
    lazy(X - (ax === 'x' ? n * 9 + 20 : 12), Z - (ax === 'x' ? 12 : n * 9 + 20), X + (ax === 'x' ? n * 9 + 20 : 12), Z + (ax === 'x' ? 12 : n * 9 + 20), () => { const L = n * 8.5 + 10; for (let a = -L; a <= L; a += 22) { const x = ax === 'x' ? X + a : X - HW - 0.9, z = ax === 'x' ? Z - HW - 0.9 : Z + a; pole(x, z, 8.2); } for (let a = -L + 11; a <= L; a += 22) { if (ax === 'x') lamp(X + a, Z + HW + 0.9, Math.PI); else lamp(X + HW + 0.9, Z + a, -Math.PI / 2); } /* candeeiros do outro lado da rua: de noite vê-se a vila */ blood(X + rr(-10, 10), Z + rr(-10, 10), 1.1); });
    // campos à volta
    for (let k = 0; k < 2; k++) { const sd = k ? 1 : -1, off = 40 + rr(0, 10), x0 = ax === 'x' ? X + rr(-n * 6, n * 3) : X + sd * off, z0 = ax === 'x' ? Z + sd * off : Z + rr(-n * 6, n * 3); lazy(x0 - 2, z0 - 2, x0 + 30, z0 + 24, () => field(x0, z0, x0 + 26, z0 + 20, pick([0x5a7a32, 0x6a8a3a, 0x7a8a2a]))); } };

  // ---------- postos de combustível (X, Z = berma da estrada; face = lado onde fica a estrada)
  const posto = (X, Z, face, nm = 'Posto de combustível') => { const [cx, cz] = mkF(X, Z, face).P(0, 12); zone(nm, 'ガソリン', cx, cz, 24, 'mon', 'Bombas de gasolina e loja', { nz: 6, small: 1 }); places.push([cx, cz, 40]);
    lazy(cx - 30, cz - 30, cx + 30, cz + 30, () => { const F = mkF(X, Z, face);
      F.floor(-19, 0.2, 19, 24, 0.024, 0xffffff, 'asph'); F.mp(-19, 0, 19, 24, '#55565a');
      F.g(() => { for (const u of [-7, 7]) for (const v of [6, 12]) b.box(0.6, 6.0, 0.6, u, 3, -v, 0xd8d6d0); b.box(18, 0.6, 9, 0, 6.2, -9, 0xe8e6e0); b.box(18.1, 0.4, 9.1, 0, 6.0, -9, VERM); for (let i = 0; i < 6; i++) b.box(1.2, 0.05, 0.3, -7.5 + i * 3, 5.7, -9, LIT(1.6, 1.6, 1.5), { mat: 'lit' });
        for (const u of [-3.5, 3.5]) { b.box(0.8, 1.6, 1.2, u, 0.8, -9, 0xe8e6e0); b.box(0.82, 0.4, 1.22, u, 1.5, -9, VERM); b.box(0.5, 0.3, 0.02, u, 1.1, -8.38, 0x1a2a1a); b.cyl(0.03, 0.03, 1.2, 4, u + 0.5, 0.9, -8.6, 0x1b1b1c); }
        b.cyl(0.12, 0.12, 7, 8, -16, 3.5, -1.5, 0x8a8e92, { mat: 'm' }); b.box(1.4, 3.6, 0.3, -16, 6.4, -1.5, 0x2a2b2c);
        for (const u of [-13, -10.6]) b.cyl(0.9, 0.9, 2.6, 12, u, 1.3, -21, 0xd8d6d0, { mat: 'm', rz: Math.PI / 2 }); });
      for (const u of [-7, 7]) for (const v of [6, 12]) F.R(u - 0.3, v - 0.3, u + 0.3, v + 0.3, 's', 6);
      for (const u of [-3.5, 3.5]) { F.R(u - 0.4, 8.4, u + 0.4, 9.6, 's', 1.6); F.C(u, 7.9, 'Bomba de gasolina', 'bomba', { y: 1.0 }); }
      F.R(-14.4, 20.1, -9.2, 21.9, 's', 2); sgn(F, -16, 6.4, 1.32, 'ガソリン', '#c8321e', '#ffffff', 1.2, 3.3);
      F.shop(10, 18.5, 10, 7, 'ガソリン', 'Loja do posto');
      F.car(-3.5, 12.2, 0.05, pick(CARC)); if (rnd() < 0.6) F.car(3.5, 5.6, Math.PI + 0.1, pick(CARC), { wreck: true });
      { const [x, z, r] = F.at(-6, 21, 0); crate(x, z, r, 'Abrir caixa de ferramentas', 'oficina', 0x9a2a22); } { const [x, z] = F.P(-17, 18); drum(x, z, 0x8a2a22); drum(x + 0.7, z + 0.3, 0x3a5a8a); }
      blood(...F.P(rr(-5, 5), rr(4, 14)), 1); }); };

  // ---------- cidades em grelha (quarteirões de 44 m, ruas de 7 m); cada quarteirão constrói-se à parte
  const PIT = 51;
  const city = (name, jp, X, Z, nx, nz, plan) => { const x0 = X - nx * PIT / 2 - HW, z0 = Z - nz * PIT / 2 - HW, x1 = x0 + nx * PIT + 2 * HW, z1 = z0 + nz * PIT + 2 * HW;
    zone(name, jp, X, Z, Math.hypot(x1 - x0, z1 - z0) / 2 + 6, 'town', 'Cidade · lojas, polícia e hospital', { nz: nx * nz * 5 + 20 }); places.push([X, Z, Math.hypot(x1 - x0, z1 - z0) / 2 + 30]);
    for (let j = 0; j <= nz; j++) { const z = z0 + HW + j * PIT; asph(x0, z - HW, x1, z + HW); for (let s = x0 + 10; s < x1 - 10; s += 14) if ((s - x0 - HW) % PIT > 12 && (s - x0 - HW) % PIT < PIT - 12) b.box(3, 0.01, 0.16, s, 0.03, z, WHITE, { mat: 'decal' }); }
    for (let i = 0; i <= nx; i++) { const x = x0 + HW + i * PIT; for (let j = 0; j < nz; j++) { const za = z0 + HW + j * PIT + HW, zb = za + PIT - 2 * HW; asph(x - HW, za, x + HW, zb); } }
    let k = 0; for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const bx0 = x0 + 2 * HW + i * PIT, bz0 = z0 + 2 * HW + j * PIT, bx1 = bx0 + PIT - 2 * HW, bz1 = bz0 + PIT - 2 * HW, kind = plan[k++ % plan.length];
      lazy(bx0 - 8, bz0 - 8, bx1 + 8, bz1 + 8, () => block(kind, bx0, bz0, bx1, bz1)); } };
  const walkS = (x0, z0, x1, z1) => { W.steps.push({ x0, z0, x1, z1, y: 0.14 }); b.box(x1 - x0, 0.14, z1 - z0, (x0 + x1) / 2, 0.07, (z0 + z1) / 2, 0xd6cfc0, { mat: 'tile' }); mp(x0, z0, x1, z1, '#b3ab9b'); };
  const block = (kind, x0, z0, x1, z1) => { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, S = mkF(cx, z1, 's'), N = mkF(cx, z0, 'n');
    // passeio à volta do quarteirão, com candeeiros
    walkS(x0, z0, x1, z0 + 2); walkS(x0, z1 - 2, x1, z1); walkS(x0, z0 + 2, x0 + 2, z1 - 2); walkS(x1 - 2, z0 + 2, x1, z1 - 2);
    for (const x of [x0 + 6, x1 - 6]) { lamp(x, z1 - 1, 0); lamp(x, z0 + 1, Math.PI); }
    const inner = (u0, v0, u1, v1) => { b.floor(...S.bx(u0, v0, u1, v1), 0.03, 0xffffff, 'conc'); S.mp(u0, v0, u1, v1, '#8e8a82'); };
    if (kind === 'torres') { inner(-20, 2, 20, 40);
      const H1 = ri(4, 8), H2 = ri(3, 7); tower(x0 + 3, z1 - 16, x0 + 19, z1 - 3, H1, { sign: rnd() < 0.6 ? [pick(['薬局', 'カフェ', '本屋', '居酒屋', 'ラーメン']), '#f4f2ea', '#c8321e', pick(['FARMÁCIA', 'CAFÉ', 'LIVRARIA', 'TASCA', 'RAMEN'])] : null });
      tower(x1 - 18, z1 - 15, x1 - 3, z1 - 3, H2, {}); tower(x0 + 3, z0 + 3, x0 + 17, z0 + 15, ri(3, 6), { shop: false });
      for (let i = 0; i < 4; i++) car(x1 - 15 + i * 3.2, z0 + 9, 0, pick(CARC), { wreck: rnd() < 0.4 }); vend(x0 + 20, z1 - 3.6, 0, 0xc23a2e); vend(x0 + 21, z1 - 3.6, 0, 0x2f6fb3); bike(x0 + 21.5, z0 + 4, 0.3);
      container(x0 + 20.5, z0 + 17, 'Revistar caixote do lixo', 'casa', { y: 0.6 }); b.model('lixo', x0 + 20.5, 0, z0 + 16.3, 0, 0x3a5a3a) || b.box(1.4, 1.1, 0.9, x0 + 20.5, 0.55, z0 + 16.3, 0x3a5a3a); rect(x0 + 19.8, z0 + 15.85, x0 + 21.2, z0 + 16.75, 's', 1.1); }
    else if (kind === 'lojas') { F_shops(S, [-14, 0, 14]); N.house(-12, 2.6 + 4, 8.6, 7.4); N.house(10, 2.6 + 4, 8.6, 7.4); }
    else if (kind === 'casas') { S.house(-11, 6.4, 8.6, 7.6); S.house(11, 6.4, 8.4, 7.2); N.house(-11, 6.2, 8.8, 7.4); N.house(11, 6.6, 8, 7); for (let i = 0; i < 2; i++) car(cx - 2 + i * 4, cz, 0.1, pick(CARC), { wreck: rnd() < 0.5 }); }
    else if (kind === 'policia') { inner(-20, 2, 20, 40);
      S.shell(-11, 3, 11, 16, { name: 'Esquadra', wall: 0xdcdcd4, floor: 0xb8bcc0, h: 3.4, mapc: '#7c8a98', roofC: 0x3a4a6a, trim: 0x3a4a5a }, { front: [{ at: 0, w: 1.6, k: 'd' }, { at: -5, w: 1.8, k: 'w' }, { at: 5, w: 1.8, k: 'w' }, { at: -8.5, w: 1.6, k: 'w' }, { at: 8.5, w: 1.6, k: 'w' }], back: [{ at: -7, w: 1.2, k: 'd' }], left: [{ at: 9, w: 1.4, k: 'w' }] });
      sgn(S, 0, 3.1, 2.86, '警察署', '#f4f2ea', '#1f3a6a', 3.6, 0.6, { sub: 'ESQUADRA DA POLÍCIA' });
      for (const u of [-9.6, -7.8, 7.8, 9.6]) { const [x, z, r] = S.at(u, 15.3, 0); cabinet(x, z, 1.0, 'Abrir cacifo da polícia', 'policia', r, 0x5a6a7a); }
      for (const u of [-4, 4]) { const [x, z] = S.P(u, 8); table(x, z, 1.6, 0.8, 0x6a6e72); S.C(u, 8, 'Revistar secretária', 'policia', { y: 0.8 }); }
      { const [x, z, r] = S.at(0, 14.6, 0); crate(x, z, r, 'Abrir caixa de provas', 'policia', 0x3a4a5a); }
      for (let i = 0; i < 3; i++) S.car(-14 + i * 4.5, 24, 0, 0xf2f2f0, { police: true }); cone(...S.P(-16, 20)); barrier(...S.P(14, 2.6), S.ry); }
    else if (kind === 'clinica') { inner(-20, 2, 20, 40);
      S.shell(-12, 3, 12, 15, { name: 'Hospital', wall: 0xf0eee8, floor: 0xd8dcd8, h: 3.4, mapc: '#9aa7a3', roofC: 0x6a7a8a, trim: 0x6a7a8a }, { front: [{ at: 0, w: 2.2, k: 'd' }, { at: -6, w: 1.8, k: 'w' }, { at: 6, w: 1.8, k: 'w' }, { at: -10, w: 1.4, k: 'w' }, { at: 10, w: 1.4, k: 'w' }], back: [{ at: 9, w: 1.4, k: 'd' }] });
      sgn(S, 0, 3.15, 2.86, '病院', '#ffffff', '#c8321e', 2.6, 0.6, { sub: 'HOSPITAL' });
      for (let i = 0; i < 4; i++) { const [x, z, r] = S.at(-10 + i * 2.4, 13.4, 0); bed(x, z, r); } for (const u of [6, 8.4]) { const [x, z, r] = S.at(u, 14.3, 0); cabinet(x, z, 1.2, 'Abrir armário de medicamentos', 'hospital', r, 0xe6eae8); }
      { const [x, z] = S.P(-3, 6); shelf(x, z, 3.2, S.ry, 'Revistar prateleira da farmácia', 'farmacia'); } S.C(3, 6, 'Revistar balcão', 'hospital', { y: 0.9 }); S.C(9, 6, 'Revistar carrinho', 'farmacia');
      S.car(-14, 22, Math.PI / 2, 0xf2f2ee); }
    else if (kind === 'armazem') { inner(-20, 2, 20, 40);
      S.shell(-15, 4, 15, 22, { name: 'Armazém', wall: 0x9a9690, floor: 0x7a7a76, h: 6.0, mapc: '#686c70', roofC: 0x5a5e62, trim: 0x4a4e52 }, { front: [{ at: -6, w: 4, k: 'd' }, { at: 6, w: 1.4, k: 'd' }], back: [{ at: 0, w: 4, k: 'd' }] });
      for (let i = 0; i < 4; i++) { const [x, z, r] = S.at(-12 + i * 3, 20.6, 0); crate(x, z, r, 'Abrir caixa', i % 2 ? 'oficina' : 'casa', 0x7a5a3a); } for (const u of [-12, -9, 9, 12]) { const [x, z] = S.P(u, 12); boxes(x, z); }
      { const [x, z, r] = S.at(13, 8, -Math.PI / 2); cabinet(x, z, 1.4, 'Abrir armário', 'oficina', r, 0x6a7078); } box20(...S.P(-12, 32), Math.PI / 2, 0x7a3a2a); box20(...S.P(2, 32), Math.PI / 2, 0x2a5a8a); }
    else if (kind === 'praca') { b.floor(x0 + 2, z0 + 2, x1 - 2, z1 - 2, 0.03, 0xd6cfc0, 'tile'); mp(x0 + 2, z0 + 2, x1 - 2, z1 - 2, '#b3ab9b');
      b.cyl(3.2, 3.4, 0.6, 20, cx, 0.3, cz, 0xb8b2a6); b.cyl(2.9, 2.9, 0.05, 20, cx, 0.56, cz, 0x2a4e58, { mat: 'water' }); b.cyl(0.4, 0.5, 1.6, 10, cx, 1.1, cz, 0xb8b2a6); circ(cx, cz, 3.3);
      for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12], [0, -15], [0, 15]]) sakura(cx + dx, cz + dz, rr(0.9, 1.2)); for (const [dx, dz, r] of [[-7, -3, 0], [7, 3, Math.PI], [-3, 7, Math.PI / 2], [3, -7, -Math.PI / 2]]) bench(cx + dx, cz + dz, r);
      vend(x0 + 4, z1 - 4, 0, 0xc23a2e); vend(x0 + 5, z1 - 4, 0, 0x3a7a4a); container(x1 - 5, z0 + 5, 'Revistar quiosque', 'konbini', { y: 0.9 }); b.box(2.2, 2.4, 1.6, x1 - 5, 1.2, z0 + 4, 0x2f5a8a); rect(x1 - 6.1, z0 + 3.2, x1 - 3.9, z0 + 4.8, 's', 2.4); }
    else if (kind === 'posto') { posto0(S); N.house(0, 6.6, 9, 7.6); }
    else if (kind === 'konbini') { inner(-20, 2, 20, 40); S.shop(-8, 3 + 5, 14, 10, 'コンビニ', 'Konbini'); S.shop(11, 3 + 4, 10, 8, '薬局', 'Farmácia'); for (let i = 0; i < 5; i++) S.car(-16 + i * 3.2, 26, 0, pick(CARC), { wreck: rnd() < 0.35 }); N.house(12, 6.4, 8.4, 7.2); }
    else if (kind === 'escritorios') { inner(-20, 2, 20, 40);
      S.shell(-13, 3, 13, 17, { name: 'Escritórios', wall: 0xc8c6c0, floor: 0xb0aca4, h: 3.4, mapc: '#7c7a74', roofC: 0x4a4e52, trim: 0x3a3e42 }, { front: [{ at: 0, w: 1.8, k: 'd' }, { at: -5, w: 1.8, k: 'w' }, { at: 5, w: 1.8, k: 'w' }, { at: -9.5, w: 1.8, k: 'w' }, { at: 9.5, w: 1.8, k: 'w' }], back: [{ at: -10, w: 1.2, k: 'd' }], right: [{ at: 10, w: 1.6, k: 'w' }] });
      for (let r2 = 0; r2 < 2; r2++) for (let c2 = 0; c2 < 3; c2++) { const [x, z, r] = S.at(-8 + c2 * 6.5, 8 + r2 * 4.5, Math.PI); deskPC(x, z, r); } for (const u of [-10, 10]) S.C(u, 15.6, 'Revistar arquivo', 'casa', { y: 1.0 });
      { const [x, z] = S.P(0, 15.5); plantI(x, z); } tower(x0 + 4, z0 + 3, x1 - 4, z0 + 15, ri(5, 9), { shop: false }); }
  };
  const F_shops = (F, us) => { const SH = [['薬局', 'Farmácia'], ['コンビニ', 'Konbini'], ['酒屋', 'Loja de bebidas'], ['本屋', 'Livraria'], ['電器店', 'Eletrónica'], ['スーパー', 'Supermercado']]; for (const u of us) { const s = pick(SH); F.shop(u, 3 + 4, 12, 8, s[0], s[1]); } };
  const posto0 = F => { F.floor(-19, 0.2, 19, 24, 0.035, 0xffffff, 'asph');
    F.g(() => { for (const u of [-7, 7]) for (const v of [6, 12]) b.box(0.6, 6.0, 0.6, u, 3, -v, 0xd8d6d0); b.box(18, 0.6, 9, 0, 6.2, -9, 0xe8e6e0); b.box(18.1, 0.4, 9.1, 0, 6.0, -9, VERM); for (const u of [-3.5, 3.5]) { b.box(0.8, 1.6, 1.2, u, 0.8, -9, 0xe8e6e0); b.box(0.82, 0.4, 1.22, u, 1.5, -9, VERM); } });
    for (const u of [-7, 7]) for (const v of [6, 12]) F.R(u - 0.3, v - 0.3, u + 0.3, v + 0.3, 's', 6); for (const u of [-3.5, 3.5]) { F.R(u - 0.4, 8.4, u + 0.4, 9.6, 's', 1.6); F.C(u, 7.9, 'Bomba de gasolina', 'bomba', { y: 1.0 }); }
    F.shop(11, 18.5, 9, 7, 'ガソリン', 'Loja do posto'); F.car(-3.5, 12, 0.05, pick(CARC)); };

  // ---------- as terras novas
  city('Akagawa', '赤川', -2650, -2700, 4, 4, ['lojas', 'torres', 'casas', 'policia', 'torres', 'konbini', 'praca', 'escritorios', 'clinica', 'casas', 'armazem', 'torres', 'casas', 'posto', 'lojas', 'casas']);
  city('Hoshimachi', '星町', 2650, 2400, 4, 4, ['torres', 'lojas', 'clinica', 'casas', 'konbini', 'praca', 'torres', 'policia', 'casas', 'escritorios', 'lojas', 'armazem', 'posto', 'casas', 'torres', 'casas']);
  city('Yukimura', '雪村', -2300, 2660, 4, 2, ['casas', 'lojas', 'policia', 'torres', 'konbini', 'clinica', 'praca', 'casas']);
  town('Midorigaoka', '緑ヶ丘', -900, -1450, 'z', 12);
  town('Shiozaki', '塩崎', -3300, -900, 'x', 10, ['shop', 'shrine', 'koban', 'barn']);
  town('Asahi', '旭', 900, -3300, 'x', 10, ['shop', 'garage', 'koban', 'barn']);
  town('Sakuragi', '桜木', 1500, -560, 'z', 12, ['shop', 'clinic', 'koban', 'shrine', 'garage']);
  town('Hinode', '日の出', 3300, -1300, 'z', 10, ['shop', 'garage', 'shrine', 'barn']);
  town('Oikawa', '大川', 900, 1500, 'x', 12, ['shop', 'koban', 'clinic', 'garage', 'shrine']);
  town('Kanemori', '金森', -1500, 550, 'z', 10, ['shop', 'garage', 'clinic', 'barn']);
  town('Komorebi', '木漏れ日', -760, 3200, 'x', 10, ['shop', 'shrine', 'koban', 'barn']);
  posto(-896.5, -1100, 'w'); posto(-2900, -4.2, 's'); posto(2300, 4.2, 'n'); posto(-2646.5, -1500, 'w'); posto(2400, -2516.5, 'n'); posto(560, 1503.5, 'n'); posto(3296.5, -700, 'e'); posto(-1700, 3196.5, 's'); posto(-2296.5, 1900, 'w');

  // ---------- aeroporto internacional: pista de 1,1 km, terminal, torre de controlo, hangares, zona militar com bunkers e torres de vigia
  { const AX = 2700;
    zone('Aeroporto', '空港', 2600, -2600, 70, 'mil', 'Monumento · o melhor loot fora da cidade', { nz: 30 }); zone('Hangares', '格納庫', 3070, -2712, 50, 'mil', 'Aeroporto · hangares', { nz: 24, nolabel: 1 });
    zone('Zona militar do aeroporto', '基地', 2260, -2640, 80, 'mil', 'Aeroporto · bunkers e torres', { nz: 34, nolabel: 1 }); zone('Pista', '滑走路', 2700, -2810, 120, 'mon', 'Aeroporto · pista', { nz: 14, nolabel: 1 }); zone('Depósitos de combustível', '燃料', 3195, -2650, 32, 'mon', 'Aeroporto · combustível', { nz: 6, nolabel: 1 });
    places.push([2700, -2690, 640]);
    // pista e caminho de rolagem (não são estradas: não dão ponte nem riscas de estrada)
    lazy(2130, -2860, 3270, -2720, () => { b.floor(2150, -2830, 3250, -2790, 0.02, 0x6a6b6e, 'asph'); mp(2150, -2830, 3250, -2790, '#55565a');
      for (let x = 2180; x < 3220; x += 30) b.box(12, 0.01, 0.5, x, 0.03, -2810, WHITE, { mat: 'decal' });
      for (const xe of [2160, 3240]) for (let i = -6; i <= 6; i++) if (i) b.box(10, 0.01, 1.3, xe + (xe < AX ? 8 : -8), 0.03, -2810 + i * 2.6, WHITE, { mat: 'decal' });
      for (let x = 2155; x <= 3245; x += 30) for (const z of [-2831.5, -2788.5]) b.box(0.4, 0.25, 0.4, x, 0.12, z, LIT(1.8, 1.5, 0.6), { mat: 'lit' });
      b.floor(2250, -2755, 3150, -2738, 0.02, 0x7a7b7e, 'asph'); mp(2250, -2755, 3150, -2738, '#5d5e62'); for (let x = 2260; x < 3140; x += 8) b.box(3, 0.01, 0.2, x, 0.03, -2746.5, 0xe0b23a, { mat: 'decal' });
      for (const x of [2360, 2700, 3040]) { b.floor(x - 9, -2790, x + 9, -2755, 0.019, 0x7a7b7e, 'asph'); mp(x - 9, -2790, x + 9, -2755, '#5d5e62'); }
      // avião caído no fim da pista
      { b.push(3190, 0, -2846, 0.5); b.cyl(1.9, 1.9, 22, 12, 0, 1.6, 0, 0xd8d6d0, { rx: Math.PI / 2, jit: 0.06 }); b.box(13, 0.35, 3.6, -7, 1.4, 1, 0xc8c6c0, { rz: 0.15 }); b.box(0.3, 4, 3, 0, 4, -10, 0xc8321e); b.pop(); rect(3180, -2856, 3200, -2836, 's', 3); blood(3185, -2842, 1.4); } });
    // placa, avental, terminal e torre de controlo
    lazy(2380, -2740, 3010, -2500, () => { b.floor(2400, -2738, 3000, -2610, 0.022, 0xffffff, 'conc'); mp(2400, -2738, 3000, -2610, '#8e8a82');
      for (let x = 2420; x < 2980; x += 40) { b.box(0.2, 0.01, 20, x, 0.035, -2675, 0xe0b23a, { mat: 'decal' }); }
      for (const mx of [2420, 2490, 2560, 2620, 2700, 2770, 2840, 2910, 2980]) for (const mz of [-2625, -2725]) mast(mx, mz); mast(2546, -2552); mast(2654, -2552); // torres de luz no avental e no parque
      shell(2560, -2606, 2640, -2580, { name: 'Terminal', wall: 0xdedcd6, floor: 0xc8c4bc, h: 4.4, mapc: '#8a8f92', roofC: 0x5a6068, trim: 0x3a4048, ops: { n: [{ at: 2575, w: 2.2, k: 'd' }, { at: 2625, w: 2.2, k: 'd' }, ...[2565, 2585, 2595, 2605, 2615, 2635].map(at => ({ at, w: 2.2, k: 'w' }))], s: [{ at: 2590, w: 2.4, k: 'd' }, { at: 2610, w: 2.4, k: 'd' }, ...[2566, 2574, 2582, 2600, 2618, 2626, 2634].map(at => ({ at, w: 2.2, k: 'w' }))], w: [{ at: -2593, w: 1.4, k: 'd' }], e: [{ at: -2593, w: 1.8, k: 'w' }] } });
      { const s = A.sign('空港 · AEROPORTO', { w: 512, h: 96, bg: '#1d2a3a', fg: '#e8e4da', pad: 0.12 }); b.box(16.2, 1.7, 0.2, 2600, 5.6, -2579.9, 0x1d2a3a); b.plane(16, 1.5, 2600, 5.6, -2579.78, 0xffffff, { mat: 'sign', uv: s }); }
      for (let i = 0; i < 6; i++) { const x = 2566 + i * 6; counter(x, -2600, x + 4, -2599, 0xc8ccd0); container(x + 2, -2598.4, 'Revistar balcão de check-in', i % 3 ? 'casa' : 'policia', { y: 1.0 }); }
      for (let i = 0; i < 4; i++) bench(2584 + i * 4, -2588, Math.PI); for (let i = 0; i < 4; i++) bench(2584 + i * 4, -2592, 0);
      { shelf(2628, -2588, 4, 0, 'Revistar prateleira da loja', 'konbini'); shelf(2628, -2584, 4, 0, 'Revistar prateleira da loja', 'konbini'); fridge(2634, -2583, 3); }
      cabinet(2562, -2583, 1.2, 'Abrir cacifo da segurança', 'policia', Math.PI / 2, 0x5a6a7a); cabinet(2562, -2586, 1.2, 'Abrir cacifo da segurança', 'policia', Math.PI / 2, 0x5a6a7a); crate(2638, -2602, 0, 'Abrir mala perdida', 'casa', 0x2a3a5a);
      // torre de controlo
      { const x = 2660, z = -2620; tower(x - 4, z - 4, x + 4, z + 4, 9, { shop: false, col: 0xd8d6d0, style: 'band' }); const top = 3.8 + 8 * 3.2; b.box(10, 3, 10, x, top + 1.5, z, 0x1e2a30, { mat: 'win' }); b.box(10.6, 0.4, 10.6, x, top + 3.2, z, 0xd8d6d0); b.cyl(0.08, 0.08, 6, 6, x + 3, top + 6, z, 0x8a8e92, { mat: 'm' }); b.sph(0.25, x + 3, top + 9.1, z, LIT(2.4, 0.2, 0.1), { mat: 'lit' }); }
      // aviões parados
      const airliner = (x, z, c) => { b.push(x, 0, z, 0); b.cyl(2.0, 2.0, 34, 14, 0, 3.0, 0, 0xeeece6, { rx: Math.PI / 2 }); b.sph(2.0, 0, 3.0, 17, 0xeeece6, { sy: 1 }); b.add(new THREE.ConeGeometry(2.0, 7, 14), 0xeeece6, 'v', mat4(0, 3.4, -20.5, 0, -Math.PI / 2, 0)); b.box(32, 0.4, 5, 0, 2.4, 1, 0xd8d6d0); b.box(12, 0.3, 3, 0, 4.2, -20, 0xd8d6d0); b.box(0.4, 6, 4, 0, 7, -21, c);
        for (const sx of [-1, 1]) { b.cyl(0.9, 0.9, 3.6, 12, sx * 7, 1.6, 2.2, 0x9a9ea2, { mat: 'm', rx: Math.PI / 2 }); b.box(0.5, 1.6, 0.5, sx * 2.2, 0.8, -2, 0x2a2b2c); } b.box(0.4, 1.6, 0.4, 0, 0.8, 13, 0x2a2b2c); b.box(4.05, 0.3, 30, 0, 3.6, 0, c, { mat: 'decal' }); b.pop();
        rect(x - 2, z - 24, x + 2, z + 19, 's', 5); rect(x - 7.9, z + 0.4, x - 6.1, z + 4, 's', 2.4); rect(x + 6.1, z + 0.4, x + 7.9, z + 4, 's', 2.4); mp(x - 2, z - 24, x + 2, z + 19, '#c8c6c0'); mp(x - 16, z - 1.5, x + 16, z + 3.5, '#c8c6c0');
        container(x + 2.6, z + 10, 'Revistar porão de bagagem', 'casa', { y: 1.4 }); container(x - 2.6, z - 6, 'Revistar porão de bagagem', 'casa', { y: 1.4 }); };
      airliner(2470, -2680, 0x2a5a8a); airliner(2780, -2675, VERM);
      // estacionamento e carros
      b.floor(2550, -2576, 2650, -2526, 0.022, 0xffffff, 'asph'); mp(2550, -2576, 2650, -2526, '#55565a'); for (let x = 2554; x < 2650; x += 3.2) b.box(0.12, 0.01, 4.5, x, 0.035, -2570, WHITE, { mat: 'decal' });
      for (let i = 0; i < 10; i++) if (rnd() < 0.6) car(2555.6 + i * 9.6, -2570, rnd() < 0.5 ? 0 : Math.PI, pick(CARC), { wreck: rnd() < 0.5, taxi: rnd() < 0.15 });
      for (let i = 0; i < 6; i++) container(2580 + i * 8, -2560, 'Revistar mala abandonada', 'casa', { y: 0.3 }); blood(2600, -2570, 1.4); blood(2570, -2620, 1.2); });
    // hangares
    lazy(2995, -2740, 3145, -2650, () => { for (let i = 0; i < 3; i++) { const x0 = 3010 + i * 44, x1 = x0 + 38, z0 = -2730, z1 = -2696;
      shell(x0, z0, x1, z1, { name: 'Hangar', wall: 0x9aa0a4, floor: 0x7a7a76, h: 8, mapc: '#6a7076', roofC: 0x6a7078, trim: 0x4a5056, ops: { n: [{ at: (x0 + x1) / 2, w: 14, k: 'd' }], s: [{ at: x0 + 6, w: 1.4, k: 'd' }, { at: x1 - 8, w: 2, k: 'w' }] } });
      if (i === 1) { b.push((x0 + x1) / 2, 0, -2714, 0); b.cyl(1.2, 1.2, 12, 10, 0, 1.8, 0, 0x5a6a4a, { rx: Math.PI / 2 }); b.box(14, 0.25, 2.4, 0, 1.6, 1, 0x5a6a4a); b.box(0.25, 2.4, 1.8, 0, 3, -5.5, 0x5a6a4a); b.pop(); rect((x0 + x1) / 2 - 1.3, -2721, (x0 + x1) / 2 + 1.3, -2707, 's', 3); }
      else { const hx = (x0 + x1) / 2; b.push(hx, 0, -2712, 0.3); b.cyl(1.4, 1.2, 7, 10, 0, 1.6, 0, 0x3a4a3a, { rx: Math.PI / 2 }); b.box(0.15, 0.15, 14, 0, 3.2, 0.8, 0x2a2b2c); b.box(14, 0.15, 0.15, 0, 3.2, 0.8, 0x2a2b2c); b.box(1.2, 0.2, 6, 0, 1.6, -6, 0x3a4a3a); b.pop(); rect(hx - 1.6, -2717, hx + 1.6, -2707, 's', 3); }
      for (let k = 0; k < 3; k++) crate(x0 + 3 + k * 2.4, z1 - 1.4, 0, 'Abrir caixa militar', k === 1 ? 'paiol' : 'militar'); cabinet(x1 - 1.2, z1 - 0.6, 1.4, 'Abrir armário', 'oficina', Math.PI, 0x6a7078); for (const dz of [-2726, -2723]) drum(x1 - 2, dz, 0x3a5a3a); container(x0 + 4, z0 + 6, 'Revistar bancada', 'oficina', { y: 0.9 }); } });
    // depósitos de combustível
    lazy(3150, -2700, 3250, -2600, () => { for (const [x, z] of [[3172, -2680], [3200, -2680], [3186, -2650]]) { b.cyl(9, 9, 10, 20, x, 5, z, 0xd8d6d0, { mat: 'm' }); b.cyl(9.1, 9.1, 0.5, 20, x, 10.2, z, 0xa8acb0, { mat: 'm' }); circ(x, z, 9); mp(x - 9, z - 9, x + 9, z + 9, '#a8acb0'); }
      fenceBox(3158, -2700, 3240, -2628, [['s', 3192, 3202]]); for (const x of [3176, 3190]) { b.box(0.8, 1.6, 1.2, x, 0.8, -2622, 0xe8e6e0); rect(x - 0.4, -2622.6, x + 0.4, -2621.4, 's', 1.6); container(x, -2620.6, 'Bomba de gasolina', 'bomba', { y: 1.0 }); }
      truck(3215, -2618, Math.PI / 2, 0xd8d6d0); });
    // zona militar a oeste: vedação, torres de vigia, bunkers, caserna, heliporto
    lazy(2140, -2730, 2380, -2550, () => { b.floor(2160, -2720, 2360, -2560, 0.022, 0xffffff, 'conc'); mp(2160, -2720, 2360, -2560, '#6e7062');
      fenceBox(2160, -2720, 2360, -2560, [['s', 2300, 2312], ['e', -2650, -2635]]); barrier(2306, -2556, 0);
      for (const [x, z] of [[2165, -2715], [2355, -2715], [2165, -2565], [2355, -2565], [2260, -2715]]) wtower(x + (x < 2260 ? 3 : x > 2260 ? -3 : 0), z + (z < -2600 ? 3 : -3));
      for (const [mx, mz] of [[2200, -2580], [2320, -2580], [2260, -2660], [2350, -2700]]) mast(mx, mz);
      bunker(2180, -2700, 2192, -2690, 's'); bunker(2205, -2700, 2217, -2690, 's'); bunker(2330, -2640, 2340, -2628, 'w', 'paiol', 'Paiol do aeroporto');
      for (const [x0, z0] of [[2230, -2700], [2275, -2700]]) { shell(x0, z0, x0 + 20, z0 + 9, { name: 'Caserna', wall: 0x6e7458, floor: 0x7a7a70, h: 3.2, roofC: 0x4a5236, mapc: '#5a6048', trim: 0x3a3f2a, ops: { s: [{ at: x0 + 5, w: 1.4, k: 'd' }, { at: x0 + 12, w: 1.4, k: 'w' }, { at: x0 + 16, w: 1.4, k: 'w' }] } });
        for (let i = 0; i < 4; i++) bed(x0 + 1.4 + i * 1.6, z0 + 1.6, 0, 0x6a7058); cabinet(x0 + 18, z0 + 0.6, 1.2, 'Abrir cacifo militar', 'militar', 0, 0x5a6048); crate(x0 + 14, z0 + 6.4, 0, 'Abrir caixa militar', 'militar'); }
      { const g = new THREE.CircleGeometry(8, 24); g.rotateX(-Math.PI / 2); b.add(g, 0x3a3c36, 'decal', mat4(2205, 0.04, -2600)); const s = A.sign('H', { w: 128, h: 128, fg: '#e8e4da', font: 'UI', weight: 700 }); b.plane(7, 7, 2205, 0.05, -2600, 0xffffff, { mat: 'paint', uv: s, rx: -Math.PI / 2 }); }
      { b.push(2240, 0, -2605, 0.8); b.cyl(1.4, 1.1, 7, 10, 0, 1.5, 0, 0x3a4a2a, { rx: Math.PI / 2, rz: 0.4 }); b.box(0.15, 0.15, 13, 0, 2.6, 0, 0x2a2b2c, { ry: 0.6 }); b.box(1.1, 0.25, 5, 0, 1.3, -5.5, 0x3a4a2a); b.pop(); rect(2236, -2610, 2244, -2600, 's', 3); blood(2244, -2602, 1.2); crate(2246, -2610, 0.4, 'Abrir caixa do helicóptero', 'paiol'); }
      truck(2290, -2620, 0); truck(2320, -2600, Math.PI / 2); sandbags(2250, -2585, 2280, -2585); sandbags(2180, -2640, 2180, -2620); for (let i = 0; i < 5; i++) crate(2250 + i * 8, -2575, rr(-0.3, 0.3), 'Abrir caixa de munições', i % 2 ? 'militar' : 'policia'); });
    // vedação à volta de tudo, com portões
    lazy(2120, -2870, 3280, -2510, () => { fenceBox(2130, -2860, 3270, -2530, [['s', 2540, 2660], ['s', 2290, 2322], ['s', 3150, 3170], ['e', -2560, -2540]]); for (let x = 2140; x < 3270; x += 160) if (Math.abs(x - 2600) > 80) wtower(x + 20, -2852, 'militar'); });
  }

  // ---------- prisão
  { const X = -1500, Z = -3420, x0 = X - 80, x1 = X + 80, z0 = Z - 60, z1 = Z + 60; zone('Prisão', '刑務所', X, Z, 88, 'mil', 'Monumento · polícia e armas', { nz: 44 }); places.push([X, Z, 130]);
    lazy(x0 - 10, z0 - 10, x1 + 10, z1 + 20, () => { b.floor(x0, z0, x1, z1, 0.02, 0xffffff, 'conc'); mp(x0, z0, x1, z1, '#7a7870');
      cwall(x0, z0, x1, z0 + 1); cwall(x0, z0 + 1, x0 + 1, z1); cwall(x1 - 1, z0 + 1, x1, z1); cwall(x0 + 1, z1 - 1, X - 5, z1); cwall(X + 5, z1 - 1, x1 - 1, z1);
      for (const [x, z] of [[x0 + 4, z0 + 4], [x1 - 4, z0 + 4], [x0 + 4, z1 - 4], [x1 - 4, z1 - 4]]) wtower(x, z, 'policia', 0x6a6e72);
      barrier(X - 1.5, z1 + 2, 0); barrier(X + 1.5, z1 + 3, 0.15); car(X - 10, z1 + 8, Math.PI / 2, 0xf2f2f0, { police: true }); truck(X + 14, z1 + 8, Math.PI / 2, 0x3a4a6a);
      // pavilhões das celas: celas ao longo da parede do fundo, com grades e portas abertas
      for (const [bx0, bz0] of [[x0 + 8, z0 + 8], [X + 10, z0 + 8]]) { const bx1 = bx0 + 60, bz1 = bz0 + 16;
        shell(bx0, bz0, bx1, bz1, { name: 'Pavilhão', wall: 0xc8c4b8, floor: 0xa8a49a, h: 3.6, mapc: '#8a867c', roofC: 0x5a5e62, trim: 0x4a4e52, ops: { s: [{ at: bx0 + 6, w: 1.4, k: 'd' }, { at: bx1 - 6, w: 1.4, k: 'd' }, ...[14, 22, 30, 38, 46].map(d => ({ at: bx0 + d, w: 1.4, k: 'w' }))] } });
        for (let c = 0; c < 12; c++) { const cx0 = bx0 + 0.3 + c * 4.95; if (c) { b.box(0.15, 3.4, 4.4, cx0, 1.7, bz0 + 2.4, 0xb8b4a8); rect(cx0 - 0.08, bz0 + 0.2, cx0 + 0.08, bz0 + 4.6, 's', 3.4); }
          for (let k = 0; k < 6; k++) if (k !== 3 && k !== 4) { b.box(0.06, 3, 0.06, cx0 + 0.6 + k * 0.75, 1.5, bz0 + 4.6, 0x3a3c40, { mat: 'm' }); } rect(cx0 + 0.3, bz0 + 4.55, cx0 + 2.5, bz0 + 4.65, 'g', 3);
          bed(cx0 + 1, bz0 + 1.4, Math.PI / 2, 0xb8bcbf); if (c % 3 === 1) container(cx0 + 3.6, bz0 + 1, 'Revistar cela', 'casa', { y: 0.5 }); toilet(cx0 + 4.2, bz0 + 3.8, -Math.PI / 2); } }
      // administração e arsenal (porta trancada: só com explosivos)
      shell(X - 30, Z + 18, X - 6, Z + 34, { name: 'Administração', wall: 0xdcdcd4, floor: 0xb8bcc0, h: 3.4, mapc: '#7c8a98', roofC: 0x3a4a6a, trim: 0x3a4a5a, ops: { s: [{ at: X - 18, w: 1.6, k: 'd' }, { at: X - 25, w: 1.6, k: 'w' }, { at: X - 11, w: 1.6, k: 'w' }], n: [{ at: X - 24, w: 1.2, k: 'w' }] } });
      for (const dx of [-28, -26.2]) cabinet(X + dx, Z + 19, 1.0, 'Abrir cacifo dos guardas', 'policia', 0, 0x5a6a7a); for (const dx of [-21, -15]) { table(X + dx, Z + 26, 1.6, 0.8, 0x6a6e72); container(X + dx, Z + 26, 'Revistar secretária', 'policia', { y: 0.8 }); }
      shell(X + 8, Z + 20, X + 20, Z + 30, { name: 'Arsenal', wall: 0x7a7c74, floor: 0x6a6a64, h: 3.0, roofC: 0x55574f, mapc: '#5c5e56', trim: 0x3a3c36, doorC: 0x4a5056, ops: { s: [{ at: X + 14, w: 1.4, k: 'd' }] } });
      { const D = W.doors[W.doors.length - 1]; D.lock = { hp: 1400, max: 1400 }; D.t = D.target = 0; } crate(X + 10, Z + 21.2, 0, 'Abrir caixa do arsenal', 'paiol'); crate(X + 18, Z + 21.2, 0, 'Abrir caixa do arsenal', 'policia'); cabinet(X + 8.5, Z + 25, 1.1, 'Abrir armário do arsenal', 'militar', Math.PI / 2, 0x4a5056);
      // pátio
      { b.floor(X + 30, Z + 4, X + 70, Z + 30, 0.03, 0x8a5a3a, 'v'); for (const x of [X + 32, X + 68]) { b.cyl(0.08, 0.08, 3.2, 6, x, 1.6, Z + 17, 0x8a8e92, { mat: 'm' }); b.box(0.1, 1.0, 1.6, x + (x < X + 50 ? 0.3 : -0.3), 3.1, Z + 17, 0xe8e6e0); circ(x, Z + 17, 0.1); } for (let i = 0; i < 3; i++) bench(X + 40 + i * 8, Z + 33, Math.PI); }
      blood(X, Z + 40, 1.6); blood(X - 30, Z - 30, 1.2); bags(X + 25, Z + 44); });
  }

  // ---------- base de radar
  { const X = -3300, Z = -3310, x0 = X - 78, x1 = X + 78, z0 = Z - 80, z1 = Z + 80; zone('Base de radar', 'レーダー', X, Z, 86, 'mil', 'Monumento · loot militar e bunkers', { nz: 34 }); places.push([X, Z, 125]);
    lazy(x0 - 6, z0 - 6, x1 + 10, z1 + 10, () => { b.floor(x0, z0, x1, z1, 0.02, 0xffffff, 'dirt'); mp(x0, z0, x1, z1, '#6e7062'); fenceBox(x0, z0, x1, z1, [['s', X - 6, X + 6]]); barrier(X, z1 + 2, 0);
      for (const [x, z] of [[x0 + 4, z0 + 4], [x1 - 4, z0 + 4], [x0 + 4, z1 - 4], [x1 - 4, z1 - 4]]) wtower(x, z);
      { b.cyl(6.5, 7, 6, 18, X + 20, 3, Z - 30, 0xb8b4aa); b.sph(9, X + 20, 6, Z - 30, 0xeeece6, { th: Math.PI / 2 }); circ(X + 20, Z - 30, 7); mp(X + 13, Z - 37, X + 27, Z - 23, '#c8c6c0'); }
      for (let k = 0; k < 2; k++) { const ax = X - 40 + k * 22, az = Z - 50; for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.12, 0.18, 22, 6, ax + sx * 1.6, 11, az + sz * 1.6, 0xc8c4bc, { mat: 'm' }); b.box(9, 4, 0.3, ax, 23, az, 0xd8d6d0, { mat: 'm', rx: 0.3 }); circ(ax, az, 2); }
      bunker(X - 50, Z + 30, X - 38, Z + 40, 's'); bunker(X + 40, Z + 30, X + 52, Z + 40, 's'); bunker(X - 10, Z - 10, X + 2, Z, 'e', 'paiol', 'Paiol');
      for (const [ax0, az0] of [[X - 30, Z + 55], [X + 10, Z + 55]]) { shell(ax0, az0, ax0 + 20, az0 + 9, { name: 'Caserna', wall: 0x6e7458, floor: 0x7a7a70, h: 3.2, roofC: 0x4a5236, mapc: '#5a6048', trim: 0x3a3f2a, ops: { n: [{ at: ax0 + 5, w: 1.4, k: 'd' }, { at: ax0 + 12, w: 1.4, k: 'w' }] } });
        for (let i = 0; i < 4; i++) bed(ax0 + 1.4 + i * 1.6, az0 + 7.4, Math.PI, 0x6a7058); cabinet(ax0 + 18, az0 + 8.4, 1.2, 'Abrir cacifo militar', 'militar', Math.PI, 0x5a6048); crate(ax0 + 14, az0 + 2.6, 0, 'Abrir caixa militar', 'militar'); }
      truck(X + 30, Z + 10, 0); truck(X - 25, Z + 10, Math.PI / 2 + 0.1); sandbags(X - 8, Z + 70, X + 8, Z + 70); for (let i = 0; i < 4; i++) crate(X - 60 + i * 9, Z - 70, rr(-0.3, 0.3), 'Abrir caixa de munições', 'militar'); blood(X, Z + 20, 1.4); });
  }

  // ---------- fábrica (a leste da estrada)
  { const F0 = mkF(3303.5, 900, 'w'), [X, Z] = F0.P(0, 60); zone('Fábrica abandonada', '工場', X, Z, 70, 'mon', 'Monumento · ferramentas e metal', { nz: 18 }); places.push([X, Z, 110]);
    lazy(X - 70, Z - 70, X + 70, Z + 70, () => { const F = mkF(3303.5, 900, 'w'); F.floor(-60, 0.2, 60, 120, 0.02, 0xffffff, 'conc'); F.mp(-60, 0, 60, 120, '#7a7870');
      F.shell(-50, 20, -10, 50, { name: 'Pavilhão da fábrica', wall: 0x9a8a7a, floor: 0x7a7a76, h: 7, mapc: '#6a6460', roofC: 0x5a5450, trim: 0x4a4440 }, { front: [{ at: -30, w: 4, k: 'd' }, { at: -16, w: 1.4, k: 'd' }], back: [{ at: -20, w: 4, k: 'd' }], left: [{ at: 30, w: 1.6, k: 'w' }, { at: 40, w: 1.6, k: 'w' }] });
      F.shell(10, 30, 50, 60, { name: 'Armazém da fábrica', wall: 0x8a8f92, floor: 0x7a7a76, h: 6, mapc: '#686c70', roofC: 0x6a6e72, trim: 0x4a4e52 }, { front: [{ at: 30, w: 4, k: 'd' }], right: [{ at: 45, w: 1.4, k: 'd' }] });
      for (let i = 0; i < 5; i++) { const [x, z, r] = F.at(-46 + i * 8, 48.6, 0); crate(x, z, r, 'Abrir caixa', i % 2 ? 'oficina' : 'casa', 0x7a5a3a); } for (let i = 0; i < 4; i++) { const [x, z, r] = F.at(14 + i * 9, 58.6, 0); cabinet(x, z, 1.4, 'Abrir armário', 'oficina', r, 0x6a7078); }
      for (const [u, v] of [[-30, 35], [-22, 30], [30, 45]]) { const [x, z] = F.P(u, v); boxes(x, z); } F.C(-38, 26, 'Revistar bancada', 'oficina', { y: 0.9 }); F.C(25, 36, 'Revistar paletes', 'casa', { y: 0.6 });
      for (const [u, v] of [[-5, 70], [5, 70]]) { const [x, z] = F.P(u, v); b.cyl(1.6, 2.0, 32, 12, x, 16, z, 0x8a6a5a); b.cyl(1.7, 1.7, 0.6, 12, x, 30, z, 0x6a4a3a); circ(x, z, 2); }
      for (let i = 0; i < 8; i++) { const [x, z] = F.P(-50 + (i % 4) * 7, 85 + Math.floor(i / 4) * 2.7); box20(x, z, F.ry + Math.PI / 2, pick([0x7a3a2a, 0x2a5a8a, 0x3a6a3a, 0x8a7a2a])); }
      { const [x, z] = F.P(40, 90); b.cyl(4, 4, 6, 14, x, 12, z, 0xa8acb0, { mat: 'm' }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.15, 0.15, 9, 6, x + sx * 3, 4.5, z + sz * 3, 0x6a6e72, { mat: 'm' }); circ(x, z, 3.4); }
      for (let i = 0; i < 6; i++) { const [x, z] = F.P(rr(-55, 55), rr(65, 115)); drum(x, z, pick([0x3a5a8a, 0x8a2a22, 0x3a5a3a])); } F.car(30, 15, 0.2, 0x2a2b2c, { wreck: true }); { const [x, z] = F.P(-30, 12); truck(x, z, F.ry + 0.1, 0x8a7a6a); }
      blood(...F.P(0, 40), 1.4); });
  }

  // ---------- serração (a oeste, no fim do caminho de terra)
  { const F0 = mkF(-3242, 1600, 'e'), [X, Z] = F0.P(0, 40); zone('Serração', '製材所', X, Z, 55, 'mon', 'Monumento · madeira e ferramentas', { nz: 12 }); places.push([X, Z, 90]);
    lazy(X - 55, Z - 55, X + 55, Z + 55, () => { const F = mkF(-3242, 1600, 'e'); F.floor(-40, 0.2, 40, 80, 0.015, 0xffffff, 'dirt'); F.mp(-40, 0, 40, 80, '#6b5b44');
      F.g(() => { for (const u of [-14, -4, 6, 16]) for (const v of [20, 34]) b.box(0.4, 5, 0.4, u, 2.5, -v, 0x5a4a32); b.box(34, 0.4, 16, 1, 5.2, -27, 0x5a5e62, { rx: 0.05 }); b.box(16, 1.0, 1.6, 1, 0.5, -27, 0x6a6e72, { mat: 'm' }); b.cyl(1.2, 1.2, 0.08, 20, 1, 1.2, -27, 0xc8ccd0, { mat: 'm', rx: Math.PI / 2 }); });
      for (const u of [-14, -4, 6, 16]) for (const v of [20, 34]) F.R(u - 0.2, v - 0.2, u + 0.2, v + 0.2, 's', 5); F.R(-7, 26.2, 9, 27.8, 's', 1); F.C(-6, 25, 'Revistar bancada da serra', 'oficina', { y: 0.9 });
      for (let k = 0; k < 5; k++) { const u = -30 + (k % 3) * 9, v = 50 + Math.floor(k / 3) * 10; F.g(() => { for (let j = 0; j < 9; j++) b.cyl(0.35, 0.35, 7, 8, u + (j % 3) * 0.72 - 0.7, 0.36 + Math.floor(j / 3) * 0.62, -v, 0x8a6a4a, { rz: Math.PI / 2, rx: Math.PI / 2, jit: 0.08 }); }); F.R(u - 1.6, v - 3.6, u + 1.6, v + 3.6, 's', 1.9); }
      F.shell(18, 50, 30, 60, { name: 'Escritório da serração', wall: 0x7a5a3a, floor: 0x8a7a62, h: 3.0, mapc: '#6a4a32', roofC: 0x4a3a30, trim: 0x3a2a1c }, { front: [{ at: 22, w: 1.3, k: 'd' }, { at: 27, w: 1.3, k: 'w' }] });
      { const [x, z, r] = F.at(28.8, 58.6, 0); cabinet(x, z, 1.2, 'Abrir armário', 'cabana', r, 0x6a5a4a); } F.C(21, 57, 'Revistar secretária', 'casa', { y: 0.8 }); { const [x, z] = F.P(-20, 12); truck(x, z, F.ry, 0x6a3a2a); } F.car(20, 12, 0.2, 0x4a5a3a, { wreck: true });
      for (let i = 0; i < 3; i++) { const [x, z, r] = F.at(-34 + i * 2.5, 72, 0); crate(x, z, r, 'Revistar caixote', i ? 'cabana' : 'oficina', 0x7a5a3a); } blood(...F.P(0, 40), 1); });
  }

  // ---------- castelo em ruínas
  { const F0 = mkF(652, 3300, 'w'), [X, Z] = F0.P(0, 45); zone('Ruínas do castelo', '城跡', X, Z, 55, 'mon', 'Monumento · vista e loot escondido', { nz: 14 }); places.push([X, Z, 90]);
    lazy(X - 50, Z - 50, X + 50, Z + 50, () => { const S = 0x8a8478, x0 = X - 30, x1 = X + 30, z0 = Z - 26, z1 = Z + 26;
      const ruin = (a0, c0, a1, c1, h) => { const hor = Math.abs(c1 - c0) < Math.abs(a1 - a0), L = hor ? a1 - a0 : c1 - c0, n = Math.max(1, Math.round(L / 5)); for (let i = 0; i < n; i++) { if (rnd() < 0.22) continue; const s0 = (hor ? a0 : c0) + L * i / n, s1 = s0 + L / n, hh = h * rr(0.35, 1);
        if (hor) { b.box(s1 - s0, hh, 1.6, (s0 + s1) / 2, hh / 2, c0, S, { mat: 'vf', jit: 0.06 }); rect(s0, c0 - 0.8, s1, c0 + 0.8, hh < 1.3 ? 'l' : 's', hh); } else { b.box(1.6, hh, s1 - s0, a0, hh / 2, (s0 + s1) / 2, S, { mat: 'vf', jit: 0.06 }); rect(a0 - 0.8, s0, a0 + 0.8, s1, hh < 1.3 ? 'l' : 's', hh); } } };
      b.floor(x0 - 4, z0 - 4, x1 + 4, z1 + 4, 0.02, 0xffffff, 'dirt'); mp(x0 - 4, z0 - 4, x1 + 4, z1 + 4, '#7a6a52');
      ruin(x0, z0, x1, z0, 6); ruin(x0, z1, x1, z1, 6); ruin(x0, z0, x0, z1, 6); ruin(x1, z0, x1, z1, 6);
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { const h = rr(5, 9); b.cyl(3, 3.4, h, 10, x, h / 2, z, S, { mat: 'vf', jit: 0.05 }); circ(x, z, 3.2); }
      { const h = 7; b.box(14, h, 12, X, h / 2, Z - 6, shade(S, 0.92), { mat: 'vf' }); b.box(15, 0.6, 13, X, h + 0.3, Z - 6, 0x3a3a3c); b.add(new THREE.ConeGeometry(9.6, 3.5, 4), 0x3a3a3c, 'v', mat4(X, h + 2.3, Z - 6, Math.PI / 4, 0, 0, 1, 1, 0.85)); rect(X - 7, Z - 12, X + 7, Z, 's', h); mp(X - 7, Z - 12, X + 7, Z, '#5a564e'); }
      torii(X, z1 + 8, 1, 0); for (const dx of [-3, 3]) toro(X + dx, z1 + 4); for (const [dx, dz] of [[-20, 14], [20, 14], [-22, -16], [22, -16]]) pine(X + dx, Z + dz, rr(1, 1.3));
      crate(X - 18, Z + 8, 0.3, 'Abrir baú antigo', 'casa', 0x5a3a22); crate(X + 16, Z - 18, -0.2, 'Abrir baú antigo', 'militar', 0x5a3a22); container(X, Z + 2, 'Revistar altar', 'casa', { y: 0.9 }); b.box(3, 0.9, 1.2, X, 0.45, Z + 2, 0x5a3a22); rect(X - 1.5, Z + 1.4, X + 1.5, Z + 2.6, 'l', 0.9);
      blood(X + 4, Z + 12, 1); });
  }

  // ---------- barragem (à saída do Lago Shirako) e parque de campismo
  { const R = rivers[1], i = 5, [px, pz, w] = R.P[i], [qx, qz] = R.P[i + 1], ang = Math.atan2(qx - px, qz - pz), hor = Math.abs(Math.sin(ang)) < 0.7, L = w * 2 + 26;
    const dx0 = hor ? px - L / 2 : px - 4, dz0 = hor ? pz - 4 : pz - L / 2, dx1 = hor ? px + L / 2 : px + 4, dz1 = hor ? pz + 4 : pz + L / 2;
    W.roads.push({ x0: dx0, z0: dz0, x1: dx1, z1: dz1, dam: 1 }); zone('Barragem', 'ダム', px, pz, 40, 'mon', 'Monumento · central e ferramentas', { nz: 9 }); places.push([px, pz, 60]);
    lazy(px - 45, pz - 45, px + 45, pz + 45, () => { b.box(dx1 - dx0, 0.6, dz1 - dz0, (dx0 + dx1) / 2, -0.28, (dz0 + dz1) / 2, CONC); b.floor(dx0, dz0, dx1, dz1, 0.03, 0xa8a49a, 'conc'); mp(dx0, dz0, dx1, dz1, '#a8a49a');
      for (const s of [-1, 1]) { if (hor) { b.box(L, 1.0, 0.4, px, 0.5, pz + s * 3.8, CONC); rect(dx0, pz + s * 3.8 - 0.2, dx1, pz + s * 3.8 + 0.2, 's', 1.0); } else { b.box(0.4, 1.0, L, px + s * 3.8, 0.5, pz, CONC); rect(px + s * 3.8 - 0.2, dz0, px + s * 3.8 + 0.2, dz1, 's', 1.0); } }
      for (let k = -1; k <= 1; k++) { const x = hor ? px + k * 6 : px + 5.5, z = hor ? pz + 5.5 : pz + k * 6; b.box(hor ? 3 : 2, 0.4, hor ? 2 : 3, x, 0.05, z, 0xe8f0f2, { mat: 'lit' }); }
      const hx = hor ? dx1 + 8 : px + 12, hz = hor ? pz - 10 : dz1 + 8; shell(hx - 6, hz - 5, hx + 6, hz + 5, { name: 'Central da barragem', wall: 0xc8c4b8, floor: 0x9a9a92, h: 3.6, mapc: '#7a7870', roofC: 0x5a5e62, trim: 0x4a4e52, ops: { s: [{ at: hx - 2, w: 1.4, k: 'd' }, { at: hx + 3, w: 1.4, k: 'w' }], w: [{ at: hz, w: 1.4, k: 'w' }] } });
      for (let k = 0; k < 3; k++) b.box(0.9, 1.9, 0.6, hx - 4.5 + k * 1.1, 0.95, hz - 4.2, 0x5a6068, { mat: 'm' }); rect(hx - 5, hz - 4.5, hx - 1.5, hz - 3.9, 's', 1.9); cabinet(hx + 5.4, hz, 1.2, 'Abrir armário', 'oficina', -Math.PI / 2, 0x6a7078); container(hx + 2, hz - 2, 'Revistar secretária', 'casa', { y: 0.8 }); });
  }
  { const X = -1300, Z = 1500; zone('Parque de campismo', 'キャンプ場', X, Z, 46, 'mon', 'Tendas, caravanas e um lago', { nz: 10 }); places.push([X, Z, 60]);
    lazy(X - 50, Z - 50, X + 50, Z + 50, () => { b.floor(X - 6, Z - 46, X + 6, Z + 30, 0.012, 0xffffff, 'dirt');
      for (let k = 0; k < 8; k++) { const a = -2.6 + k * 0.62, r = rr(22, 34); tent(X + Math.cos(a) * r, Z + Math.sin(a) * r * 0.7 - 6, rr(0, 6.28), pick([0x6a7a4a, 0x3a5a8a, 0xc8642a, 0x8a3a2a])); }
      for (const [dx, dz, c] of [[-16, -26, 0xe8e6e0], [16, -24, 0xd8c8a8], [-26, 4, 0xe8e6e0]]) { b.rbox(2.3, 2.4, 5.5, 0.4, X + dx, 1.5, Z + dz, c); b.box(2.32, 0.3, 5.52, X + dx, 1.0, Z + dz, 0x3a6a8a); b.box(0.06, 1.8, 0.8, X + dx + 1.17, 1.2, Z + dz + 1, 0x6a6e72); rect(X + dx - 1.2, Z + dz - 2.8, X + dx + 1.2, Z + dz + 2.8, 's', 2.6); mp(X + dx - 1.2, Z + dz - 2.8, X + dx + 1.2, Z + dz + 2.8, '#c8c6c0'); container(X + dx + 1.6, Z + dz + 1, 'Revistar caravana', k2(), { y: 0.9 }); }
      shell(X + 20, Z - 4, X + 28, Z + 4, { name: 'Balneários', wall: 0xd8d4cc, floor: 0xb8b4ac, h: 2.8, mapc: '#9a968e', roofC: 0x6a6e72, trim: 0x5a5e62, ops: { w: [{ at: Z, w: 1.2, k: 'd' }] } }); toilet(X + 27, Z - 2.6, -Math.PI / 2); sinkI(X + 21, Z + 3.4, Math.PI); container(X + 25, Z + 3, 'Revistar cacifo', 'casa', { y: 0.9 });
      for (const [dx, dz] of [[0, 0], [-8, -14]]) { table(X + dx, Z + dz, 1.8, 0.9, 0x8a5a32); b.cyl(0.6, 0.7, 0.3, 10, X + dx + 3, 0.15, Z + dz, 0x3a3a3a); for (let j = 0; j < 5; j++) b.ico(0.18, X + dx + 3 + rr(-0.3, 0.3), 0.3, Z + dz + rr(-0.3, 0.3), 0x2a2420); }
      for (let j = 0; j < 3; j++) { b.rbox(0.8, 0.4, 4.5, 0.2, X + 30 + j * 1.4, 0.2, Z + 26, 0xc8642a); } for (const [dx, dz] of [[-38, -10], [36, -30], [-30, 20], [30, 22]]) pine(X + dx, Z + dz, rr(1, 1.4)); blood(X + 4, Z - 10, 1); });
    function k2() { return rnd() < 0.5 ? 'cabana' : 'casa'; }
  }

  // ---------- quintas soltas ao longo das estradas novas (não em cima de vilas, água ou outras estradas)
  { let n = 0; for (const s of segs) { const L = s.hor ? Math.abs(s.bx - s.ax) : Math.abs(s.bz - s.az); for (let t = 180; t < L - 120; t += rr(260, 420)) { if (rnd() > 0.55 || n > 34) continue;
      const sd = rnd() < 0.5 ? -1 : 1, hw = s.kind === 'a' ? HW : HD, along = (s.hor ? Math.min(s.ax, s.bx) : Math.min(s.az, s.bz)) + t, X = s.hor ? along : s.ax + sd * hw, Z = s.hor ? s.az + sd * hw : along, face = s.hor ? (sd < 0 ? 's' : 'n') : (sd < 0 ? 'e' : 'w');
      const [cx, cz] = mkF(X, Z, face).P(0, 16); if (!placeOk(cx, cz, 34)) continue; let clash = false; for (const r of W.roads) if (r !== s && cx > r.x0 - 30 && cx < r.x1 + 30 && cz > r.z0 - 30 && cz < r.z1 + 30 && !(Math.abs((s.hor ? cz : cx) - (s.hor ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2)) < 20)) clash = true; if (clash) continue;
      places.push([cx, cz, 34]); n++; const kind = pick(['quinta', 'quinta', 'casa', 'paragem', 'barreira', 'cabana']);
      zone(kind === 'barreira' ? 'Barreira policial' : kind === 'paragem' ? 'Paragem' : kind === 'cabana' ? 'Cabana de caça' : 'Quinta', '', cx, cz, 18, kind === 'barreira' ? 'mon' : 'cabin', kind === 'barreira' ? 'Carros da polícia' : 'Casa isolada', { nz: kind === 'barreira' ? 6 : 3, nolabel: kind === 'paragem' ? 1 : 0, small: 1 });
      lazy(cx - 36, cz - 36, cx + 36, cz + 36, () => { const F = mkF(X, Z, face);
        if (kind === 'quinta') { const w = rr(8, 9.2), d = rr(7, 8); F.house(-8, 3 + d / 2 + rr(0, 4), w, d, 'Casa da quinta', 'minka'); barn(mkF(...F.P(10, 4), face)); F.floor(-4, 2.6, 4, 12, 0.012, 0xffffff, 'dirt'); const [fx, fz] = F.P(-24, 8); field(fx - 10, fz - 9, fx + 10, fz + 9); for (const [u, v] of [[-14, 20], [18, 20]]) { const [x0, z0] = F.P(u - 6, v), [x1, z1] = F.P(u + 6, v); woodFence(x0, z0, x1, z1); } if (rnd() < 0.5) F.car(0, 6, Math.PI / 2, pick(CARC), { wreck: rnd() < 0.5 }); }
        else if (kind === 'casa') { const w = rr(7.4, 9), d = rr(6.4, 7.6); F.house(0, 3 + d / 2 + rr(0, 3), w, d); F.car(w / 2 + 2.5, 5, 0, pick(CARC), { wreck: rnd() < 0.6 }); const [x, z] = F.P(-w / 2 - 1.5, 1.2); vend(x, z, F.ry, 0xc23a2e); }
        else if (kind === 'paragem') { F.g(() => { b.box(3.4, 0.08, 1.6, 0, 2.4, -1.6, 0x5a6a7a); for (const u of [-1.6, 1.6]) b.box(0.08, 2.4, 0.08, u, 1.2, -2.3, 0x8a8e92, { mat: 'm' }); b.box(3.4, 1.8, 0.04, 0, 1.4, -2.4, 0x9ab8c8, { mat: 'gl' }); }); F.R(-1.7, 2.3, 1.7, 2.5, 'g', 2); const [x, z] = F.P(0, 1.9); bench(x, z, F.ry); F.C(1, 1.4, 'Revistar mochila esquecida', 'casa', { y: 0.3 }); blood(...F.P(2, -2), 0.8); }
        else if (kind === 'barreira') { const [a, c] = F.P(-4, -1.5), [d, e] = F.P(4, -1.5); barrier(a, c, F.ry); barrier(d, e, F.ry); for (let k = 0; k < 5; k++) cone(...F.P(-6 + k * 3, -3)); F.car(-7, 3, Math.PI / 2 + 0.3, 0xf2f2f0, { police: true }); F.car(7, 4, -Math.PI / 2 - 0.2, 0xf2f2f0, { police: true }); const [sx, sz] = F.P(0, 6); sandbags(sx - 4, sz, sx + 4, sz); F.C(0, 8, 'Revistar caixa da polícia', 'policia', { y: 0.6 }); blood(...F.P(0, 1), 1.4); }
        else { F.shell(-3.5, 4, 3.5, 10, { name: 'Cabana de caça', wall: 0x6e5238, floor: 0x8a7a62, h: 2.8, mapc: '#5e4630', roofC: 0x4a3a30, trim: 0x3a2a1c }, { front: [{ at: 0, w: 1.2, k: 'd' }], left: [{ at: 7, w: 1.0, k: 'w' }] }); { const [x, z, r] = F.at(2.6, 9.4, 0); crate(x, z, r, 'Revistar caixote', 'cabana', 0x7a5a3a); } const [x, z, r] = F.at(-2.4, 9.2, 0); bed(x, z, r, 0x8a6a4a); for (const [u, v] of [[-8, 14], [8, 16], [0, 22]]) pine(...F.P(u, v), rr(1, 1.3)); }
      }); } } }

  // aviso (só em testes): zonas em cima de água
  W.regionWarn = [...W.zones.filter(zn => zn.r > 15 && zn.name !== 'Barragem' && wetRaw(zn.x, zn.z, 0)).map(zn => zn.name), ...W.lazy.filter(L => [[L.x0 + 8, L.z0 + 8], [L.x1 - 8, L.z0 + 8], [L.x0 + 8, L.z1 - 8], [L.x1 - 8, L.z1 - 8], [(L.x0 + L.x1) / 2, (L.z0 + L.z1) / 2]].filter(([x, z]) => W.wet(x, z)).length >= 2 && !W.zones.some(zn => zn.name === 'Barragem' && Math.hypot(zn.x - (L.x0 + L.x1) / 2, zn.z - (L.z0 + L.z1) / 2) < 10)).map(L => 'lazy@' + Math.round(L.x0) + ',' + Math.round(L.z0))];
  W.newTowns = NMV;
}
