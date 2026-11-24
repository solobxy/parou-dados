// Monumentos e vilas do anel exterior do mapa (mapa de 900 × 900 m).
// Cada um tem identidade própria: templo com pagode, estação, hospital, escola, zona industrial, central elétrica, aeródromo e duas vilas.
import * as THREE from 'three';

export function buildMonuments(H, house) {
  const { lazy, b, A, W, rect, circ, mp, container, shell, car, pole, lamp, crate, cabinet, counter, table, chair, bed, shelf, fridge, woodFence, blood, bags, cone, barrier, bench, bike, vend, dirt, road, rr, ri, pick, rnd, shade, mat4, lantern, sofa, books, toilet, sinkI, plantI, deskPC, boxes, tvI, wardrobe, rugI, clutter } = H;
  const zone = (name, jp, x, z, r, kind, sub) => W.zones.push({ name, jp, x, z, r, kind, sub });
  const LIT = (r, g, bl) => new THREE.Color(r, g, bl);
  const VERM = 0xc8321e, DARK = 0x2c3038, GOLD = 0xc8a040, STONE = 0x9a968c;
  const vsignAt = (x, y, z, txt, bg, fg, ry = 0, w = 0.9, h = 3.0) => { const s = A.sign(txt, { w: 96, h: Math.round(96 * h / w), bg, fg, vertical: true }); b.push(x, 0, z, ry); b.box(w + 0.12, h + 0.12, 0.14, 0, y, 0, 0x2a2b2c); b.plane(w, h, 0, y, 0.08, 0xffffff, { mat: 'sign', uv: s }); b.pop(); };
  const hsignAt = (x, y, z, txt, bg, fg, ry = 0, w = 4, h = 1) => { const s = A.sign(txt, { w: 320, h: Math.max(48, Math.round(320 * h / w)), bg, fg }); b.push(x, 0, z, ry); b.box(w + 0.12, h + 0.12, 0.12, 0, y, 0, 0x2a2b2c); b.plane(w, h, 0, y, 0.07, 0xffffff, { mat: 'sign', uv: s }); b.pop(); };
  // lanterna de pedra (tōrō): acende-se à noite
  const toro = (x, z, s = 1) => { b.cyl(0.32 * s, 0.38 * s, 0.25 * s, 8, x, 0.12 * s, z, STONE); b.cyl(0.11 * s, 0.13 * s, 0.9 * s, 8, x, 0.7 * s, z, STONE); b.box(0.5 * s, 0.12 * s, 0.5 * s, x, 1.2 * s, z, STONE); b.box(0.34 * s, 0.34 * s, 0.34 * s, x, 1.43 * s, z, LIT(1.7, 1.25, 0.7), { mat: 'lit' }); b.add(new THREE.ConeGeometry(0.48 * s, 0.32 * s, 4), STONE, 'v', mat4(x, 1.76 * s, z, Math.PI / 4)); b.sph(0.07 * s, x, 1.97 * s, z, STONE); circ(x, z, 0.35 * s); };
  const torii = (x, z, s = 1, ry = 0) => { b.push(x, 0, z, ry); for (const sx of [-1, 1]) { b.cyl(0.17 * s, 0.21 * s, 4.1 * s, 12, sx * 1.6 * s, 2.05 * s, 0, VERM); b.cyl(0.24 * s, 0.24 * s, 0.35 * s, 12, sx * 1.6 * s, 0.17 * s, 0, 0x1d1d1d); } b.box(4.6 * s, 0.3 * s, 0.42 * s, 0, 4.25 * s, 0, 0x1d1d1d); b.box(4.3 * s, 0.14 * s, 0.36 * s, 0, 4.05 * s, 0, VERM); b.box(3.9 * s, 0.22 * s, 0.28 * s, 0, 3.5 * s, 0, VERM); b.box(0.22 * s, 0.6 * s, 0.24 * s, 0, 3.78 * s, 0, VERM); b.pop(); for (const sx of [-1, 1]) circ(x + Math.cos(ry) * sx * 1.6 * s, z - Math.sin(ry) * sx * 1.6 * s, 0.24 * s); };
  // árvore de cerejeira (rosa), feita à mão para os sítios especiais
  const sakura = (x, z, s = 1) => { b.cyl(0.13 * s, 0.2 * s, 2.4 * s, 8, x, 1.2 * s, z, 0x5a3a2e, { mat: 'vf' }); b.cyl(0.07 * s, 0.09 * s, 1.4 * s, 6, x + 0.5 * s, 2.4 * s, z, 0x5a3a2e, { mat: 'vf', rz: -0.7 }); for (const [dx, dy, dz, r, c] of [[0, 3.1, 0, 1.5, 0xf2b8c8], [0.9, 3.5, 0.4, 1.1, 0xf6c8d6], [-0.8, 3.4, -0.3, 1.05, 0xeaa8bc], [0.1, 4.1, -0.1, 0.95, 0xf8d4de]]) b.ico(r * s, x + dx * s, dy * s, z + dz * s, c, { mat: 'vf', det: 1 }); circ(x, z, 0.24 * s); };
  // contentor de carga (pode empilhar)
  const box20 = (x, y, z, ry, c) => { b.push(x, y, z, ry); b.box(2.44, 2.6, 6.06, 0, 1.3, 0, c, { mat: 'm', jit: 0.05 }); for (let i = -2; i <= 2; i++) b.box(2.46, 2.3, 0.06, 0, 1.3, i * 1.15, shade(c, 0.82), { mat: 'm' }); b.box(2.3, 2.4, 0.05, 0, 1.3, 3.05, shade(c, 0.7), { mat: 'm' }); b.pop(); const cs = Math.abs(Math.sin(ry)) > 0.5; if (y < 0.5) rect(x - (cs ? 3.03 : 1.22), z - (cs ? 1.22 : 3.03), x + (cs ? 3.03 : 1.22), z + (cs ? 1.22 : 3.03), 's', 2.6 + y); };
  const chainFence = (x0, z0, x1, z1) => { const hor = Math.abs(z0 - z1) < 0.01, L = hor ? x1 - x0 : z1 - z0; if (L <= 0.05) return; b.box(hor ? L : 0.03, 2.2, hor ? 0.03 : L, (x0 + x1) / 2, 1.1, (z0 + z1) / 2, 0x9aa0a4, { mat: 'fence' }); const n = Math.ceil(L / 3); for (let i = 0; i <= n; i++) b.cyl(0.04, 0.04, 2.3, 5, hor ? x0 + i * L / n : x0, 1.15, hor ? z0 : z0 + i * L / n, 0x7a7e82, { mat: 'm' }); rect(Math.min(x0, x1) - (hor ? 0 : 0.05), Math.min(z0, z1) - (hor ? 0.05 : 0), Math.max(x0, x1) + (hor ? 0 : 0.05), Math.max(z0, z1) + (hor ? 0.05 : 0), 'g', 2.2); };

  // ========== Templo Kinzan (金山寺): pagode de cinco andares, salão principal, sino, caminho de torii
  { const X = -330, Z = -140; zone('Templo Kinzan', '金山寺', X, Z, 44, 'mon', 'Monumento · pagode e templo');
    dirt(X - 3, Z + 30, X + 3, -4.2);
    b.floor(X - 34, Z - 34, X + 34, Z + 30, 0.02, 0xd8d2c2, 'conc'); mp(X - 34, Z - 34, X + 34, Z + 30, '#9a9282');
    // muro baixo de telha à volta, com entrada a sul
    const tw = (x0, z0, x1, z1) => { const hor = Math.abs(z0 - z1) < 0.01, L = hor ? x1 - x0 : z1 - z0; if (L <= 0.05) return; b.box(hor ? L : 0.4, 1.5, hor ? 0.4 : L, (x0 + x1) / 2, 0.75, (z0 + z1) / 2, 0xe6dfcf); b.box(hor ? L + 0.3 : 0.75, 0.22, hor ? 0.75 : L + 0.3, (x0 + x1) / 2, 1.6, (z0 + z1) / 2, DARK); rect(Math.min(x0, x1) - 0.2, Math.min(z0, z1) - 0.2, Math.max(x0, x1) + 0.2, Math.max(z0, z1) + 0.2, 's', 1.6); };
    tw(X - 34, Z - 34, X + 34, Z - 34); tw(X - 34, Z - 34, X - 34, Z + 30); tw(X + 34, Z - 34, X + 34, Z + 30); tw(X - 34, Z + 30, X - 4, Z + 30); tw(X + 4, Z + 30, X + 34, Z + 30);
    // caminho de torii vermelhos até ao salão
    for (let i = 0; i < 7; i++) torii(X, Z + 26 - i * 3.2, 0.82);
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) toro(X + sx * 3.8, Z + 20 - i * 7, 1.35);
    // pagode (五重塔): cinco corpos que vão estreitando, telhados largos e o pináculo dourado
    { const px = X + 18, pz = Z - 14; b.box(9, 0.9, 9, px, 0.45, pz, STONE); W.steps.push({ x0: px - 4.5, z0: pz - 4.5, x1: px + 4.5, z1: pz + 4.5, y: 0.9 });
      let y = 0.9; for (let i = 0; i < 5; i++) { const w = 6 - i * 0.6, hh = i === 0 ? 3.4 : 2.6; b.box(w, hh, w, px, y + hh / 2, pz, i % 2 ? 0x8a2a1e : 0x9a3222); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.22, hh, 0.22, px + sx * w / 2, y + hh / 2, pz + sz * w / 2, 0x2a1a14); b.box(w + 0.1, 0.3, w + 0.1, px, y + hh - 0.15, pz, 0xe8e2d2); y += hh; const R = (w / 2 + 1.5) * Math.SQRT2; b.add(new THREE.ConeGeometry(R, 1.3, 4, 1), DARK, 'v', mat4(px, y + 0.45, pz, Math.PI / 4)); b.box(w + 2.9, 0.18, w + 2.9, px, y - 0.15, pz, 0x1d2026); y += 0.7; }
      b.cyl(0.12, 0.14, 7, 10, px, y + 3.5, pz, GOLD, { mat: 'm' }); for (let k = 0; k < 9; k++) b.cyl(0.42 - k * 0.025, 0.42 - k * 0.025, 0.12, 14, px, y + 1.0 + k * 0.52, pz, GOLD, { mat: 'm' }); b.sph(0.32, px, y + 7.2, pz, GOLD, { mat: 'm' });
      rect(px - 4.5, pz - 4.5, px + 4.5, pz + 4.5, 's', y + 7); mp(px - 4.5, pz - 4.5, px + 4.5, pz + 4.5, '#8a3a2a'); }
    // salão principal (entra-se): madeira escura, telhado de telha, altar e oferendas
    shell(X - 14, Z - 26, X + 6, Z - 12, { name: 'Salão do templo', wall: 0x5a3a2a, inner: 0x7a5a42, floor: 0xa88a5a, h: 3.6, roof: 'kawara', roofC: 0x2c3038, mapc: '#5a3a2a', trim: 0x2a1a14,
      ops: { s: [{ at: X - 4, w: 2.4, k: 'd' }, { at: X - 10, w: 1.6, k: 'w' }, { at: X + 2, w: 1.6, k: 'w' }], e: [{ at: Z - 19, w: 1.4, k: 'w' }], w: [{ at: Z - 19, w: 1.4, k: 'd' }] } });
    b.box(4, 1.0, 1.4, X - 4, 0.5, Z - 24.6, 0x3a2418); b.box(3.4, 0.1, 1.2, X - 4, 1.05, Z - 24.6, GOLD, { mat: 'm' }); b.sph(0.55, X - 4, 1.7, Z - 24.7, GOLD, { mat: 'm', sy: 1.3 }); rect(X - 6, Z - 25.3, X - 2, Z - 23.9, 'l', 1.0);
    for (const sx of [-1, 1]) { b.cyl(0.05, 0.05, 0.25, 6, X - 4 + sx * 1.4, 1.2, Z - 24.3, LIT(2.2, 1.6, 0.8), { mat: 'lit' }); b.box(0.8, 0.1, 0.8, X - 4 + sx * 2.2, 0.08, Z - 20, 0x8a2a2a); }
    container(X - 4, Z - 23.6, 'Revistar oferendas', 'casa', { y: 1.0 }); crate(X - 12, Z - 24.4, 0, 'Abrir baú do templo', 'cabana', 0x5a3a2a); cabinet(X + 4.6, Z - 22, 1.4, 'Abrir armário', 'casa', -Math.PI / 2, 0x6a4a32);
    // sino (鐘楼)
    { const bx = X - 22, bz = Z - 6; for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.14, 0.16, 3.4, 8, bx + sx * 1.5, 1.7, bz + sz * 1.5, 0x5a3a2a); b.add(new THREE.ConeGeometry(3.1, 1.4, 4), DARK, 'v', mat4(bx, 4.0, bz, Math.PI / 4)); b.cyl(0.65, 0.8, 1.6, 16, bx, 2.4, bz, 0x5a6a52, { mat: 'm' }); b.sph(0.66, bx, 3.2, bz, 0x5a6a52, { mat: 'm', th: Math.PI / 2 }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) circ(bx + sx * 1.5, bz + sz * 1.5, 0.18); }
    for (const [x, z] of [[X - 26, Z + 18], [X + 26, Z + 18], [X - 28, Z - 28], [X + 28, Z + 4], [X - 16, Z + 6], [X + 12, Z + 10]]) sakura(x, z, rr(0.9, 1.15));
    bench(X - 10, Z + 12, Math.PI / 2); bench(X + 10, Z + 12, -Math.PI / 2); blood(X + 3, Z + 4, 0.8);
  }

  // ========== Estação Higashi (東駅): edifício da estação debaixo do viaduto, cais, carruagem parada numa linha de serviço
  { const X = 334, Z = -36; zone('Estação Higashi', '東駅', X, Z - 4, 34, 'mon', 'Monumento · comida e bebida');
    road(X - 4, -4.2, X + 4, Z + 8); b.floor(X - 28, Z - 6, X + 28, Z + 8, 0.022, 0xffffff, 'tile'); mp(X - 28, Z - 6, X + 28, Z + 8, '#8e8a82');
    shell(X - 12, Z - 6, X + 12, Z + 4, { name: 'Estação', wall: 0xe6e2d8, floor: 0xcfcac0, h: 3.8, roofC: 0x6a6e72, mapc: '#8a8a86', trim: 0x2a6a4a,
      ops: { s: [{ at: X - 6, w: 2.4, k: 'd' }, { at: X + 6, w: 2.4, k: 'd' }, { at: X, w: 2.4, k: 'w' }, { at: X - 10, w: 1.4, k: 'w' }, { at: X + 10, w: 1.4, k: 'w' }], n: [{ at: X, w: 2.6, k: 'd' }, { at: X - 7, w: 1.6, k: 'w' }, { at: X + 7, w: 1.6, k: 'w' }] } });
    for (const sx of [-1, 1]) { b.cyl(0.08, 0.08, 3.0, 8, X + sx * 3.4, 1.5, Z + 6.6, 0x2a6a4a, { mat: 'm' }); circ(X + sx * 3.4, Z + 6.6, 0.1); } hsignAt(X, 3.0, Z + 6.6, '東駅 HIGASHI', '#1f5a3a', '#f2f0e8', 0, 7, 1.0);
    for (let i = -2; i <= 2; i++) { b.box(0.25, 1.0, 1.4, X + i * 1.6, 0.5, Z - 1.6, 0x8a8e92, { mat: 'm' }); b.box(0.2, 0.06, 0.8, X + i * 1.6, 1.03, Z - 1.6, LIT(0.4, 1.4, 0.6), { mat: 'lit' }); rect(X + i * 1.6 - 0.13, Z - 2.3, X + i * 1.6 + 0.13, Z - 0.9, 'l', 1.0); }
    counter(X - 11.6, Z - 5.6, X - 8.6, Z - 4.8, 0xd8dad6); container(X - 10, Z - 5.2, 'Revistar quiosque', 'konbini', { y: 1.0 }); shelf(X + 9.6, Z - 5.1, 3.2, 0, 'Revistar prateleira', 'konbini');
    for (const x of [X - 8, X + 8]) bench(x, Z + 1.8, 0); vend(X + 11.2, Z + 0.4, -Math.PI / 2, 0x2f6fb3); vend(X + 11.2, Z - 0.7, -Math.PI / 2, 0xc23a2e);
    // cais e linha de serviço a norte, por baixo do viaduto
    b.box(40, 0.35, 3.2, X, 0.175, Z - 9.8, 0xb8b4aa); W.steps.push({ x0: X - 20, z0: Z - 11.4, x1: X + 20, z1: Z - 8.2, y: 0.35 }); b.box(40, 0.02, 0.25, X, 0.36, Z - 8.4, 0xe8c83a, { mat: 'decal' });
    for (let x = X - 26; x <= X + 26; x += 0.9) b.box(0.22, 0.12, 2.4, x, 0.06, Z - 13, 0x5a4a3a); for (const dz of [-0.72, 0.72]) b.box(54, 0.14, 0.1, X, 0.17, Z - 13 + dz, 0x8a8e92, { mat: 'm' });
    { const wx = X + 2, wz = Z - 13; b.push(wx, 0, wz, Math.PI / 2); b.rbox(2.9, 3.0, 19, 0.3, 0, 2.0, 0, 0xd8dcd8, { mat: 'm' }); b.box(2.95, 0.35, 19.05, 0, 1.4, 0, 0x2a8a4a); for (let k = -3; k <= 3; k++) b.box(2.96, 0.9, 1.4, 0, 2.5, k * 2.6, 0x24303a, { mat: 'win' }); for (const s of [-1, 1]) b.box(2.97, 2.1, 1.2, 0, 1.55, s * 4.2, 0x4a5058, { mat: 'm' }); for (const s of [-7, -3, 3, 7]) b.cyl(0.42, 0.42, 2.4, 12, 0, 0.42, s, 0x2a2b2c, { rz: Math.PI / 2 }); b.pop(); rect(wx - 9.5, wz - 1.5, wx + 9.5, wz + 1.5, 's', 3.5); container(wx, wz + 1.7, 'Revistar carruagem', 'konbini', { y: 1.2 }); container(wx - 6, wz + 1.7, 'Revistar carruagem', 'casa', { y: 1.2 }); }
    for (const x of [X - 24, X + 24]) lamp(x, Z + 6, Math.PI); car(X - 18, Z + 12, Math.PI / 2 + 0.05, 0xe8e6e0); car(X + 20, Z + 13, Math.PI / 2, 0x2a4a7a, { wreck: true }); bike(X + 14, Z + 5, 0.2); bike(X + 15, Z + 5, 0.1); blood(X - 3, Z + 2, 1);
  }

  // ========== Hospital Geral (総合病院): dois pisos, receção, enfermarias, farmácia, heliporto e ambulâncias
  { const X = 300, Z = 150; zone('Hospital Geral', '総合病院', X, Z, 38, 'mon', 'Monumento · loot médico');
    road(X - 4, 4.2, X + 4, Z - 18); b.floor(X - 26, Z - 18, X + 26, Z + 22, 0.022, 0xffffff, 'asph'); mp(X - 26, Z - 18, X + 26, Z + 22, '#55565a');
    const x0 = X - 15, x1 = X + 15, z0 = Z - 8, z1 = Z + 8;
    const L0 = () => { counter(X - 4, Z - 3.2, X + 4, Z - 2.4, 0xe8e8e4); container(X, Z - 2.8, 'Revistar receção', 'hospital', { y: 1.0 }); for (let i = 0; i < 4; i++) { chair(X - 11 + i * 0.8, Z - 6.6, Math.PI); chair(X + 8.6 + i * 0.8, Z - 6.6, Math.PI); }
      for (let i = 0; i < 4; i++) { bed(x0 + 1.4 + i * 2.1, z1 - 1.5, 0, 0xe8ecec); } container(x0 + 3.5, z1 - 1.5, 'Revistar cama', 'hospital', { y: 0.7 }); cabinet(x1 - 0.5, Z + 1.5, 1.4, 'Abrir armário de medicamentos', 'farmacia', -Math.PI / 2, 0xe6eae8); plantI(X - 6, Z - 6.4); plantI(X + 6, Z - 6.4); };
    const L1 = () => { for (let i = 0; i < 5; i++) { bed(x0 + 1.4 + i * 2.2, z0 + 1.5, Math.PI, 0xe8ecec); bed(x0 + 1.4 + i * 2.2, z1 - 1.5, 0, 0xe8ecec); } container(x0 + 5.8, z1 - 1.5, 'Revistar cama', 'hospital', { y: 0.7 }); container(x0 + 3.6, z0 + 1.5, 'Revistar cama', 'hospital', { y: 0.7 });
      cabinet(x1 - 0.5, Z - 3.6, 1.4, 'Abrir farmácia', 'farmacia', -Math.PI / 2, 0xe6eae8); cabinet(x1 - 0.5, Z - 1.8, 1.4, 'Abrir farmácia', 'farmacia', -Math.PI / 2, 0xe6eae8); table(X + 6, Z, 2.0, 0.9, 0xd8dad6); container(X + 6, Z, 'Revistar bloco operatório', 'hospital', { y: 0.8 }); clutter(x0, z0, x1, z1, 5); };
    shell(x0, z0, x1, z1, { name: 'Hospital Geral', wall: 0xf0eee8, floor: 0xdcdedc, floorUp: 0xd0d4d2, floors: 2, h: 3.4, roofC: 0x8a9298, mapc: '#b8bcbc', trim: 0x2a6a9a,
      ops: { n: [{ at: X, w: 2.4, k: 'd' }, { at: X - 9, w: 1.6, k: 'w' }, { at: X - 5, w: 1.6, k: 'w' }, { at: X + 5, w: 1.6, k: 'w' }, { at: X + 9, w: 1.6, k: 'w' }, { at: X + 13, w: 1.4, k: 'w' }], s: [{ at: X - 12, w: 1.4, k: 'd' }, { at: X - 4, w: 1.6, k: 'w' }, { at: X + 4, w: 1.6, k: 'w' }, { at: X + 11, w: 1.6, k: 'w' }], e: [{ at: Z, w: 1.6, k: 'w' }], w: [{ at: Z + 3, w: 1.6, k: 'w' }] },
      stairs: [{ x0: x0 + 1.6, x1: x0 + 5.4, z0: Z - 1.6, z1: Z - 0.4, axis: 'x', dir: -1, lv: 0, open: 'n' }], levels: [L0, L1] });
    for (const sx of [-1, 1]) b.cyl(0.08, 0.08, 3.4, 8, X + sx * 4, 1.7, z0 - 6, 0x8a8e92, { mat: 'm' }); hsignAt(X, 3.4, z0 - 6, '総合病院 HOSPITAL', '#ffffff', '#1f5a9a', Math.PI, 8.4, 1.1); for (const sx of [-1, 1]) circ(X + sx * 4, z0 - 6, 0.1);
    { const s = A.sign('+', { w: 128, h: 128, bg: '#ffffff', fg: '#d0281e', font: 'UI', weight: 900 }); b.plane(1.6, 1.6, x1 + 0.13, 6.0, Z, 0xffffff, { mat: 'sign', uv: s, ry: Math.PI / 2 }); }
    { const g = new THREE.CircleGeometry(7, 32); g.rotateX(-Math.PI / 2); b.add(g, 0x3a3c40, 'decal', mat4(X + 16, 0.04, Z + 15)); const s = A.sign('H', { w: 128, h: 128, fg: '#e8e4da', font: 'UI', weight: 700 }); b.plane(5, 5, X + 16, 0.05, Z + 15, 0xffffff, { mat: 'paint', uv: s, rx: -Math.PI / 2 }); }
    const amb = (x, z, ry) => { car(x, z, ry, 0xf2f2ee); b.push(x, 0, z, ry); b.box(1.76, 0.12, 4.12, 0, 0.82, 0, 0xd0281e); b.box(0.5, 0.12, 0.25, 0, 1.52, -0.25, LIT(2.2, 0.3, 0.2), { mat: 'lit' }); b.pop(); };
    amb(X - 10, Z - 13, Math.PI / 2); amb(X + 9, Z - 12.5, -Math.PI / 2 + 0.2); car(X + 18, Z + 12, 0.05, 0x5a5e62, { wreck: true });
    for (let i = 0; i < 3; i++) { barrier(X - 20 + i * 2.2, Z + 19, 0); cone(X - 22 + i * 1.6, Z + 17); } blood(X + 2, Z + 10, 1.2); blood(X - 8, Z + 3, 0.8);
    for (const x of [X - 22, X + 22]) lamp(x, Z - 16, Math.PI);
  }

  // ========== Escola Sakura (桜学校): edifício de dois pisos, pavilhão, campo com pista e cerejeiras
  { const X = -46, Z = 330; zone('Escola Sakura', '桜学校', X, Z, 44, 'mon', 'Monumento · salas de aula e pavilhão');
    dirt(-2.6, Z - 4, X + 18, Z + 4);
    const x0 = X - 6, x1 = X + 22, z0 = Z - 30, z1 = Z - 18;
    const desks = (L) => { for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { table(x0 + 2.2 + c * 1.5, z0 + 3.2 + r * 1.9, 0.9, 0.6, 0x9a7a52); chair(x0 + 2.2 + c * 1.5, z0 + 3.8 + r * 1.9, Math.PI); } deskPC(x0 + 4, z0 + 1.0, 0); container(x0 + 4, z0 + 1.0, 'Revistar secretária', 'casa', { y: 0.8 }); for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { table(x0 + 15 + c * 1.5, z0 + 3.2 + r * 1.9, 0.9, 0.6, 0x9a7a52); } books(x1 - 0.6, Z - 24, -Math.PI / 2, 2.4); container(x1 - 0.8, Z - 24, 'Revistar estante', 'casa', { y: 1.0 }); clutter(x0, z0, x1, z1, 4); };
    shell(x0, z0, x1, z1, { name: 'Escola', wall: 0xe8e2d4, floor: 0xb8a888, floorUp: 0xb0a080, floors: 2, h: 3.4, roofC: 0x6a7078, mapc: '#a8a090', trim: 0x5a7a9a,
      ops: { s: [{ at: X + 8, w: 2.2, k: 'd' }, { at: X - 3, w: 1.6, k: 'w' }, { at: X + 1, w: 1.6, k: 'w' }, { at: X + 4.5, w: 1.6, k: 'w' }, { at: X + 12, w: 1.6, k: 'w' }, { at: X + 16, w: 1.6, k: 'w' }, { at: X + 20, w: 1.4, k: 'w' }], n: [{ at: X + 2, w: 1.6, k: 'w' }, { at: X + 14, w: 1.6, k: 'w' }, { at: X - 3, w: 1.2, k: 'd' }] },
      stairs: [{ x0: X + 6.2, x1: X + 10, z0: z0 + 0.4, z1: z0 + 1.6, axis: 'x', dir: 1, lv: 0, open: 's' }], levels: [desks, desks] });
    { const s = A.sign('桜', { w: 160, h: 160, bg: '#f6d8e0', fg: '#8a2a4a' }); b.box(1.6, 1.6, 0.1, X + 8, 6.4, z1 + 0.1, 0x2a2b2c); b.plane(1.45, 1.45, X + 8, 6.4, z1 + 0.16, 0xffffff, { mat: 'sign', uv: s }); }
    // pavilhão (ginásio)
    shell(X - 26, Z - 30, X - 10, Z - 14, { name: 'Pavilhão', wall: 0xd0ccc2, floor: 0xc89a5a, h: 6.0, roofC: 0x5a6a7a, mapc: '#8a8478', trim: 0x4a5a6a, ops: { e: [{ at: Z - 22, w: 2.4, k: 'd' }], s: [{ at: X - 18, w: 2.0, k: 'w' }, { at: X - 14, w: 2.0, k: 'w' }, { at: X - 22, w: 2.0, k: 'w' }], n: [{ at: X - 18, w: 2.0, k: 'w' }] } });
    for (const z of [Z - 28.6, Z - 15.4]) { b.box(1.8, 1.0, 0.06, X - 18, 3.4, z, 0xf0f0ee); b.cyl(0.24, 0.24, 0.03, 12, X - 18, 2.9, z + (z < Z - 20 ? 0.3 : -0.3), 0xd0602a); }
    crate(X - 24.5, Z - 16, 0, 'Abrir arrecadação', 'oficina', 0x5a6a7a); container(X - 12, Z - 28.6, 'Revistar balneário', 'casa');
    // campo: pista oval e relvado
    { const cx = X + 4, cz = Z + 18; b.floor(cx - 30, cz - 16, cx + 30, cz + 16, 0.012, 0xffffff, 'dirt'); mp(cx - 30, cz - 16, cx + 30, cz + 16, '#7a6a52');
      const tr = new THREE.RingGeometry(10.5, 13, 48, 1); tr.rotateX(-Math.PI / 2); tr.scale(1.9, 1, 1); b.add(tr, 0xb8563a, 'decal', mat4(cx, 0.03, cz));
      const gr = new THREE.CircleGeometry(10.5, 48); gr.rotateX(-Math.PI / 2); gr.scale(1.9, 1, 1); b.add(gr, 0x4a6a32, 'decal', mat4(cx, 0.028, cz));
      for (const sx of [-1, 1]) { b.cyl(0.05, 0.05, 2.4, 6, cx + sx * 17, 1.2, cz - 2.5, 0xe8e8e4, { mat: 'm' }); b.cyl(0.05, 0.05, 2.4, 6, cx + sx * 17, 1.2, cz + 2.5, 0xe8e8e4, { mat: 'm' }); b.box(0.06, 0.06, 5, cx + sx * 17, 2.4, cz, 0xe8e8e4, { mat: 'm' }); } }
    for (let i = 0; i < 8; i++) sakura(X - 30 + i * 9, Z - 8 + (i % 2) * 2, rr(0.9, 1.2)); for (const x of [x0 - 2, x1 + 2]) sakura(x, Z - 34, 1);
    chainFence(X - 30, Z - 36, X + 40, Z - 36); bike(X + 12, Z - 15, 0); bike(X + 13, Z - 15, 0.1); bike(X + 14, Z - 15, -0.1); blood(X + 8, Z - 12, 1);
  }

  // ========== Zona industrial (工業地帯): armazéns, contentores empilhados, grua, chaminés e tanques
  { const X = -320, Z = 320; zone('Zona industrial', '工業地帯', X, Z, 52, 'mon', 'Monumento · ferramentas e metal');
    dirt(-235, 206, -229, Z - 40); dirt(X + 20, Z - 46, -229, Z - 40);
    b.floor(X - 48, Z - 46, X + 48, Z + 46, 0.02, 0xffffff, 'conc'); mp(X - 48, Z - 46, X + 48, Z + 46, '#6e6c66');
    for (const [x0, z0, w, d, nm] of [[X - 44, Z - 40, 22, 14, 'Armazém'], [X - 44, Z - 18, 22, 14, 'Armazém'], [X + 18, Z - 40, 24, 16, 'Fábrica']]) {
      shell(x0, z0, x0 + w, z0 + d, { name: nm, wall: nm === 'Fábrica' ? 0x8a9298 : 0x9a8e7a, floor: 0x7a7a74, h: 5.2, roofC: 0x5a6068, mapc: '#6a6c70', trim: 0x3a3e42, ops: { s: [{ at: x0 + w / 2, w: 2.6, k: 'd' }, { at: x0 + 3, w: 1.6, k: 'w' }, { at: x0 + w - 3, w: 1.6, k: 'w' }], n: [{ at: x0 + w / 2, w: 1.6, k: 'w' }], e: [{ at: z0 + d / 2, w: 1.4, k: 'd' }] } });
      for (let i = 0; i < 3; i++) shelf(x0 + 3 + i * 5.5, z0 + d - 1.2, 4, 0, 'Revistar prateleira', 'oficina');
      crate(x0 + 2, z0 + 2, 0.1, 'Abrir caixa de ferramentas', 'oficina', 0x9a2a22); crate(x0 + w - 3, z0 + 2.5, -0.1, 'Abrir caixote', i3(nm)); boxes(x0 + w / 2, z0 + 4); }
    function i3(nm) { return nm === 'Fábrica' ? 'militar' : 'oficina'; }
    // contentores (até três de altura)
    const CC = [0xc8321e, 0x2a5a8a, 0x3a7a4a, 0xd88a2a, 0x8a8e92, 0x6a3a7a, 0xb8a03a];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { const x = X - 4 + c * 3.2, z = Z + 8 + r * 7, n = 1 + ((r * 7 + c * 3) % 3); for (let k = 0; k < n; k++) box20(x, k * 2.6, z, 0, CC[(r * 5 + c * 2 + k) % CC.length]); if ((r + c) % 4 === 0) container(x, z + 3.3, 'Abrir contentor', pick(['oficina', 'casa', 'militar'])); }
    // grua pórtico por cima dos contentores
    { const gx = X + 5, gz = Z + 15; for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.box(0.7, 14, 0.7, gx + sx * 12, 7, gz + sz * 10, 0xd8a82a, { mat: 'm' }); rect(gx + sx * 12 - 0.35, gz + sz * 10 - 0.35, gx + sx * 12 + 0.35, gz + sz * 10 + 0.35, 's', 14); } for (const sz of [-1, 1]) b.box(25, 1.0, 0.8, gx, 14.3, gz + sz * 10, 0xd8a82a, { mat: 'm' }); b.box(4, 1.6, 21, gx + 3, 13.4, gz, 0xc89a22, { mat: 'm' }); b.box(2.2, 2.0, 2.4, gx + 3, 12.0, gz + 3, 0x3a3e42, { mat: 'm' }); b.cyl(0.04, 0.04, 6, 4, gx + 3, 9.0, gz + 3, 0x2a2b2c); }
    // chaminés às riscas e tanques
    for (const [x, z, h] of [[X + 36, Z - 6, 34], [X + 42, Z + 2, 28]]) { b.cyl(1.4, 2.0, h, 16, x, h / 2, z, 0xe8e6e0); for (let y = h - 8; y < h; y += 4) b.cyl(1.47 - (y / h) * 0.05, 1.5, 2, 16, x, y + 1, z, VERM); b.sph(0.25, x, h + 0.4, z, LIT(2.4, 0.2, 0.1), { mat: 'lit' }); circ(x, z, 2.0); }
    for (const [x, z] of [[X + 30, Z + 20], [X + 40, Z + 30], [X + 28, Z + 34]]) { b.cyl(4, 4, 7, 24, x, 3.5, z, 0xd8dcd8, { mat: 'm' }); b.sph(4, x, 7, z, 0xc8ccc8, { mat: 'm', th: Math.PI * 0.18 }); for (let a = 0; a < 6.28; a += 0.8) b.cyl(0.05, 0.05, 7, 4, x + Math.cos(a) * 4.05, 3.5, z + Math.sin(a) * 4.05, 0x8a8e92); circ(x, z, 4.1); }
    chainFence(X - 48, Z - 46, X + 48, Z - 46); chainFence(X - 48, Z - 46, X - 48, Z + 46); chainFence(X + 48, Z - 46, X + 48, Z + 46); chainFence(X - 48, Z + 46, X + 48, Z + 46);
    car(X - 10, Z - 30, 0.1, 0xd8d6d0, { wreck: true }); car(X + 6, Z - 2, Math.PI / 2, 0x3a3d40); for (let i = 0; i < 6; i++) cone(X - 20 + i * 1.5, Z - 2); blood(X, Z - 10, 1.2); bags(X - 16, Z + 2);
    for (const [x, z] of [[X - 30, Z - 44], [X + 10, Z - 44], [X - 46, Z + 10]]) lamp(x, z, 0);
  }

  // ========== Central elétrica (発電所): torre de arrefecimento, transformadores e sala de controlo
  { const X = 344, Z = -330; zone('Central elétrica', '発電所', X, Z, 46, 'mon', 'Monumento · vista e loot');
    dirt(X - 13, -56, X - 7, Z + 40);
    b.floor(X - 40, Z - 40, X + 40, Z + 40, 0.02, 0xffffff, 'conc'); mp(X - 40, Z - 40, X + 40, Z + 40, '#727068');
    // torre de arrefecimento (hiperboloide)
    { const tx = X + 14, tz = Z - 12, pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16, y = t * 26; pts.push(new THREE.Vector2(10.5 - 6 * Math.sin(Math.PI * t * 0.82) + t * 2.2, y)); } const g = new THREE.LatheGeometry(pts, 40); b.add(g, 0xd8d6d0, 'v', mat4(tx, 0, tz)); for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; b.box(0.4, 2.2, 0.4, tx + Math.cos(a) * 10.4, 1.1, tz + Math.sin(a) * 10.4, 0x9a968c); }
      rect(tx - 9, tz - 9, tx + 9, tz + 9, 's', 26); mp(tx - 10, tz - 10, tx + 10, tz + 10, '#a8a49c'); }
    // transformadores
    for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) { const x = X - 30 + i * 6, z = Z + 12 + k * 9; b.box(3.2, 2.6, 2.4, x, 1.3, z, 0x6a7a6a, { mat: 'm' }); for (let f = -1; f <= 1; f++) b.box(3.3, 2.2, 0.1, x, 1.2, z + f * 0.6, 0x5a6a5a, { mat: 'm' }); for (const s of [-1, 0, 1]) { b.cyl(0.12, 0.16, 1.4, 8, x + s, 3.3, z, 0xc8a86a); for (let r = 0; r < 4; r++) b.cyl(0.22, 0.22, 0.06, 10, x + s, 2.8 + r * 0.28, z, 0xc8a86a); } rect(x - 1.6, z - 1.2, x + 1.6, z + 1.2, 's', 3); }
    for (let i = 0; i < 5; i++) { const x = X - 32 + i * 7; for (const s of [-1, 1]) b.box(0.3, 9, 0.3, x, 4.5, Z + 30 + s * 1.5, 0x8a8e92, { mat: 'm' }); b.box(0.3, 0.3, 3.4, x, 8.8, Z + 30, 0x8a8e92, { mat: 'm' }); circ(x, Z + 28.5, 0.2); circ(x, Z + 31.5, 0.2); }
    shell(X - 36, Z - 34, X - 18, Z - 22, { name: 'Sala de controlo', wall: 0xd2d0c8, floor: 0x9a9a92, h: 3.4, roofC: 0x5a6068, mapc: '#7a7870', trim: 0x3a5a7a, ops: { e: [{ at: Z - 28, w: 1.6, k: 'd' }], s: [{ at: X - 31, w: 1.8, k: 'w' }, { at: X - 24, w: 1.8, k: 'w' }], n: [{ at: X - 27, w: 1.8, k: 'w' }] } });
    for (let i = 0; i < 5; i++) { b.box(1.4, 1.1, 0.8, X - 34 + i * 3, 0.55, Z - 31, 0x5a6068, { mat: 'm' }); b.box(1.2, 0.5, 0.05, X - 34 + i * 3, 1.3, Z - 31.3, LIT(0.4, 1.0, 1.3), { mat: 'lit', rx: -0.4 }); } rect(X - 35, Z - 31.4, X - 21, Z - 30.6, 'l', 1.1);
    cabinet(X - 19, Z - 25, 1.4, 'Abrir armário', 'policia', -Math.PI / 2, 0x6a7078); crate(X - 34, Z - 24, 0, 'Abrir caixa militar', 'militar'); container(X - 27, Z - 31, 'Revistar consola', 'oficina', { y: 1.0 });
    chainFence(X - 40, Z - 40, X + 40, Z - 40); chainFence(X - 40, Z - 40, X - 40, Z + 40); chainFence(X + 40, Z - 40, X + 40, Z + 40); chainFence(X - 40, Z + 40, X - 14, Z + 40); chainFence(X - 6, Z + 40, X + 40, Z + 40);
    barrier(X - 10, Z + 42, 0); car(X - 4, Z + 34, 0.2, 0x2a2b2c, { wreck: true }); blood(X - 12, Z + 20, 1);
  }

  // ========== Aeródromo (飛行場): pista, hangar, avião, torre de controlo e manga de vento
  { const X = -150, Z = -362; zone('Aeródromo', '飛行場', X, Z, 70, 'mon', 'Monumento · espaço aberto');
    dirt(-121, Z + 30, -115, -219);
    b.floor(X - 80, Z - 9, X + 80, Z + 9, 0.022, 0xffffff, 'asph'); mp(X - 80, Z - 9, X + 80, Z + 9, '#4e4f52');
    for (let x = X - 74; x <= X + 74; x += 8) b.box(4, 0.01, 0.35, x, 0.04, Z, 0xe8e4da, { mat: 'decal' }); for (const sz of [-8.2, 8.2]) b.box(160, 0.01, 0.25, X, 0.04, Z + sz, 0xe8e4da, { mat: 'decal' });
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) b.box(0.45, 0.01, 3.2, X + sx * 76, 0.04, Z - 6.5 + k * 2.6, 0xe8e4da, { mat: 'decal' });
    for (let x = X - 78; x <= X + 78; x += 12) for (const sz of [-9.4, 9.4]) b.cyl(0.08, 0.08, 0.25, 6, x, 0.13, Z + sz, LIT(1.2, 1.6, 2.2), { mat: 'lit' });
    shell(X - 20, Z + 14, X + 4, Z + 32, { name: 'Hangar', wall: 0x8a9298, floor: 0x7a7a76, h: 7.0, roofC: 0x5a6068, mapc: '#6a6e72', trim: 0x3a3e42, ops: { n: [{ at: X - 8, w: 2.6, k: 'd' }, { at: X - 2, w: 2.6, k: 'd' }, { at: X - 14, w: 2.6, k: 'd' }], s: [{ at: X - 8, w: 1.6, k: 'w' }], e: [{ at: Z + 24, w: 1.2, k: 'd' }] } });
    crate(X - 18, Z + 30, 0, 'Abrir caixa de ferramentas', 'oficina', 0x9a2a22); crate(X + 1.5, Z + 30, 0, 'Abrir caixa militar', 'militar'); shelf(X - 8, Z + 31, 6, 0, 'Revistar prateleira', 'oficina'); cabinet(X + 3.4, Z + 18, 1.4, 'Abrir armário', 'policia', -Math.PI / 2, 0x6a7078);
    // avião pequeno
    { const ax = X + 26, az = Z + 20, ry = -0.3; b.push(ax, 0, az, ry); b.cap(0.75, 6.4, 0, 1.4, 0, 0xe8e6e0, { rx: Math.PI / 2 }); b.box(11, 0.14, 1.6, 0, 1.6, 0.6, 0xe8e6e0, { mat: 'm' }); b.box(3.6, 0.1, 1.0, 0, 1.7, -3.6, 0xe8e6e0); b.box(0.1, 1.3, 1.2, 0, 2.3, -3.7, VERM); b.box(1.0, 0.5, 1.2, 0, 2.0, 1.4, 0x1f2a33, { mat: 'win' }); b.cyl(0.18, 0.18, 0.3, 10, 0, 1.4, 4.2, 0x2a2b2c, { rx: Math.PI / 2 }); b.box(0.12, 2.0, 0.08, 0, 1.4, 4.38, 0x3a3e42); for (const sx of [-1.2, 1.2]) { b.cyl(0.25, 0.25, 0.16, 12, sx, 0.25, 1.0, 0x1b1b1c, { rz: Math.PI / 2 }); b.box(0.06, 0.8, 0.06, sx, 0.6, 1.0, 0x8a8e92); } b.box(11, 0.05, 0.25, 0, 1.68, 0.6, 0x2a4a8a); b.pop(); rect(ax - 2.2, az - 3.5, ax + 2.2, az + 3.5, 's', 2.4); container(ax + 0.8, az + 1, 'Revistar avião', 'militar', { y: 1.4 }); }
    // torre de controlo
    { const tx = X + 30, tz = Z + 36; b.box(3.4, 9, 3.4, tx, 4.5, tz, 0xd8d6d0); b.box(5.2, 2.4, 5.2, tx, 10.2, tz, 0x24303a, { mat: 'win' }); b.box(5.6, 0.4, 5.6, tx, 11.6, tz, 0x5a6068); b.box(5.4, 0.3, 5.4, tx, 9.0, tz, 0xd8d6d0); b.cyl(0.05, 0.05, 2.4, 5, tx, 13, tz, 0x555); b.sph(0.14, tx, 14.2, tz, LIT(2.4, 0.2, 0.1), { mat: 'lit' }); rect(tx - 1.7, tz - 1.7, tx + 1.7, tz + 1.7, 's', 12); }
    // manga de vento
    { const wx = X - 40, wz = Z + 16; b.cyl(0.07, 0.09, 6, 6, wx, 3, wz, 0xe8e6e0, { mat: 'm' }); for (let k = 0; k < 4; k++) b.cyl(0.5 - k * 0.08, 0.42 - k * 0.08, 0.7, 10, wx + 0.5 + k * 0.7, 5.7, wz, k % 2 ? 0xe8e6e0 : 0xe86a2a, { rz: Math.PI / 2 }); circ(wx, wz, 0.15); }
    for (let i = 0; i < 4; i++) { box20(X + 50 + i * 3.2, 0, Z + 26, 0, [0x6a7a5a, 0x8a8e92, 0x2a5a8a, 0x6a7a5a][i]); } car(X - 30, Z + 24, 0.3, 0x5a7a4a, { wreck: true }); blood(X + 10, Z + 12, 1.2);
  }

  // ========== vilas novas ao longo da estrada principal (casas onde se entra, com quintal)
  const village = (name, jp, X, sub, xs) => { zone(name, jp, X, 0, 52, 'town', sub); xs.forEach(([x, door]) => { const w = rr(7.4, 9), d = rr(6.4, 7.6); const cz = door === 's' ? -(6.8 + 2.4 + d / 2) - rr(0, 2) : (6.8 + 2.4 + d / 2) + rr(0, 2); house(x, cz, w, d, door); }); for (let x = X - 45; x <= X + 45; x += 18) pole(x, -6.4, 8.5); };
  village('Higashimura', '東村', 392, 'Vila · casas', [[360, 's'], [374, 'n'], [388, 's'], [402, 'n'], [416, 's'], [428, 'n']]);
  car(380, 2.1, -Math.PI / 2 + 0.1, 0x8a2a22); car(410, -1.9, Math.PI / 2, 0xd8d6d0, { wreck: true }); vend(395, -12, 0, 0xc23a2e); blood(398, 1, 1);
  village('Nishiyama', '西山', -392, 'Vila · casas', [[-360, 'n'], [-374, 's'], [-388, 'n'], [-402, 's'], [-416, 'n'], [-428, 's']]);
  car(-370, -2, Math.PI / 2 + 0.05, 0x3a3d40); car(-412, 2, -Math.PI / 2, 0x2a5a8a, { wreck: true }); vend(-396, 12, Math.PI, 0x2f6fb3); blood(-386, -1, 1.1);

  // ---------- mundo de fora (8 km): estrada em anel e vilas ao longo das estradas
  const tOut = performance.now(); const R = 2000; dirt(-R - 2.4, -R, -R + 2.4, R); dirt(R - 2.4, -R, R + 2.4, R); dirt(-R, -R - 2.4, R, -R + 2.4); dirt(-R, R - 2.4, R, R + 2.4);
  // vila genérica: casas viradas para a estrada, dos dois lados (ax 'x' = estrada ao longo de x)
  const vila = (name, jp, X, Z, ax, n) => lazy(X - 75, Z - 75, X + 75, Z + 75, () => vila0(name, jp, X, Z, ax, n));
  const vila0 = (name, jp, X, Z, ax, n) => { zone(name, jp, X, Z, 50, 'town', 'Vila · casas');
    for (let i = 0; i < n; i++) { const along = (i - (n - 1) / 2) * 15 + rr(-1.5, 1.5), side = i % 2 ? 1 : -1, w = rr(7.4, 9), d = rr(6.4, 7.6), off = 6.8 + 2.4 + (ax === 'x' ? d : w) / 2 + rr(0, 2);
      if (ax === 'x') house(X + along, Z + side * off, w, d, side > 0 ? 'n' : 's'); else house(X + side * off, Z + along, w, d, side > 0 ? 'w' : 'e'); }
    const cx = ax === 'x' ? X + rr(-12, 12) : X + rr(-1.6, 1.6), cz = ax === 'x' ? Z + rr(-1.6, 1.6) : Z + rr(-12, 12); car(cx, cz, ax === 'x' ? Math.PI / 2 + rr(-0.15, 0.15) : rr(-0.15, 0.15), pick([0x8a2a22, 0x3a3d40, 0xd8d6d0, 0x2a5a8a, 0x4a5a3a]), { wreck: rnd() < 0.5 });
    if (rnd() < 0.7) vend(ax === 'x' ? X + rr(-20, 20) : X + 9.5, ax === 'x' ? Z + 9.5 : Z + rr(-20, 20), ax === 'x' ? 0 : Math.PI / 2, pick([0xc23a2e, 0x2f6fb3, 0x3a7a4a])); };
  const NM = [['Kawabe', '川辺'], ['Yamada', '山田'], ['Morioka', '森岡'], ['Ishida', '石田'], ['Takano', '高野'], ['Hayashi', '林'], ['Sakaguchi', '坂口'], ['Kitano', '北野'], ['Minamida', '南田'], ['Nakamura', '中村'], ['Ogawa', '小川'], ['Fujimi', '富士見'], ['Aoyama', '青山'], ['Kurosawa', '黒沢'], ['Shirakawa', '白川'], ['Tsurumi', '鶴見']];
  let ni = 0; const nx = () => NM[ni++ % NM.length];
  for (const X of [-3450, -2450, -1250, 1250, 2450, 3450]) { const [n, j] = nx(); vila(n, j, X, 0, 'x', 6); }
  for (const Z of [-3450, -2450, -1250, 1250, 2450, 3450]) { const [n, j] = nx(); vila(n, j, 0, Z, 'z', 6); }
  for (const [X, Z] of [[R, -1100], [R, 1100], [-R, -1100], [-R, 1100]]) { const [n, j] = nx(); vila(n, j, X, Z, 'z', 5); }
  // carros abandonados pelas estradas
  for (let i = 0; i < 26; i++) { const t = rnd(), onX = i % 2 === 0, d = 700 + t * 3100, sgn = rnd() < 0.5 ? -1 : 1, lane = rr(-1.8, 1.8); if (onX) car(sgn * d, lane, Math.PI / 2 + rr(-0.3, 0.3), pick([0x8a2a22, 0x3a3d40, 0xd8d6d0, 0x2a5a8a, 0x6a6a4a]), { wreck: rnd() < 0.6 }); else car(lane, sgn * d, rr(-0.3, 0.3), pick([0x8a2a22, 0x3a3d40, 0xd8d6d0, 0x2a5a8a, 0x6a6a4a]), { wreck: rnd() < 0.6 }); }
  W.outerMs = Math.round(performance.now() - tOut);
}
