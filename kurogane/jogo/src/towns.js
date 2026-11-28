// Vilas estilo DayZ (campo japonês) e monumentos à volta do bairro.
import * as THREE from 'three';

export function buildTowns(H) {
  const { b, A, W, rect, circ, mp, container, shell, car, pole, wires, lamp, crate, cabinet, counter, table, chair, bed, shelf, fridge, woodFence, blood, bags, cone, barrier, hsign, vsign, bench, bike, vend, road, dirt, rr, ri, pick, rnd, shade, mat4, tower, lantern, sofa, books, stove, kfridge, toilet, sinkI, lampF, plantI, deskPC, boxes, tvI, wardrobe, rugI, clutter, level } = H;
  const zone = (name, jp, x, z, r, kind, sub) => W.zones.push({ name, jp, x, z, r, kind, sub });

  // muro de blocos baixo (as balas passam por cima)
  const bwall = (x0, z0, x1, z1, c = 0xb8b2a6) => { const hor = Math.abs(z1 - z0) < 0.01, L = hor ? x1 - x0 : z1 - z0; if (L <= 0.05) return; b.box(hor ? L : 0.16, 1.15, hor ? 0.16 : L, (x0 + x1) / 2, 0.575, (z0 + z1) / 2, c, { jit: 0.04 }); b.box(hor ? L : 0.22, 0.06, hor ? 0.22 : L, (x0 + x1) / 2, 1.18, (z0 + z1) / 2, shade(c, 0.85)); rect(x0 - 0.08, z0 - 0.08, x1 + 0.08, z1 + 0.08, 'l', 1.2); };
  const plant = (x, z) => { b.cyl(0.18, 0.13, 0.32, 8, x, 0.16, z, 0x8a5a3a); b.ico(0.28, x, 0.48, z, pick([0x3f6a2a, 0x4a7a32, 0x5a6a2a]), { mat: 'vf', det: 1 }); };
  const laundry = (x, z, ry) => { b.push(x, 0, z, ry); for (const s of [-1, 1]) b.cyl(0.03, 0.03, 1.8, 5, s * 1.2, 0.9, 0, 0x8a8e92, { mat: 'm' }); b.cyl(0.015, 0.015, 2.4, 4, 0, 1.75, 0, 0x8a8e92, { rz: Math.PI / 2 }); for (let i = 0; i < 3; i++) b.box(0.45, 0.6, 0.02, -0.7 + i * 0.7, 1.4, 0, pick([0xe8e4da, 0x7aa0c8, 0xd88a8a, 0x9ac08a])); b.pop(); };

  // casa onde se entra, com interior e quintal; porta virada para 'door' e porta das traseiras
  const house = (cx, cz, w, d, door, style, name = 'Casa') => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, along = door === 'n' || door === 's';
    const Wd = along ? w : d, D = along ? d : w;
    const dU = rr(-Wd / 5, Wd / 5);
    const P = (u, v) => door === 's' ? [cx + u, z1 - v] : door === 'n' ? [cx - u, z0 + v] : door === 'e' ? [x1 - v, cz - u] : [x0 + v, cz + u];
    const ryOf = (du, dv) => { const [ax, az] = P(0, 0), [bx, bz] = P(du, dv); return Math.atan2(bx - ax, bz - az); };
    const face = ryOf(0, -1);
    const st = style ?? pick(['minka', 'plaster', 'plaster', 'modern', 'modern']);
    const two = st === 'modern' && D >= 6.4 && Wd >= 6.4 && rnd() < 0.7;
    const at = (u) => along ? P(u, 0)[0] : P(u, 0)[1];
    const back = { s: 'n', n: 's', e: 'w', w: 'e' }[door], bU = two ? -0.2 : 0.6;
    const ops = { n: [], s: [], e: [], w: [] }; ops[door].push({ at: at(dU), w: 1.3, k: 'd' }); ops[back].push({ at: at(bU), w: 1.2, k: 'd' });
    for (const sd of ['n', 's', 'e', 'w']) { const hs = sd === 'n' || sd === 's', a0 = hs ? x0 : z0, a1 = hs ? x1 : z1, L = a1 - a0, n = Math.max(1, Math.floor(L / 3.4)); for (let i = 0; i < n; i++) { const p0 = a0 + L * (i + 0.5) / n; if (ops[sd].some(o => o.k === 'd' && Math.abs(o.at - p0) < 1.6)) continue; if (rnd() < 0.85) ops[sd].push({ at: p0, w: 1.2, k: 'w' }); } }
    const wall = st === 'minka' ? pick([0x6e5238, 0x5e4630, 0x7a5a3a]) : st === 'plaster' ? pick([0xe2dccf, 0xd8cfbd, 0xd2c6ae]) : pick([0xb8b6b0, 0xcac6bc, 0xa7aaa8]);
    const box2 = (u0, v0, u1, v1) => { const [ax, az] = P(u0, v0), [bx, bz] = P(u1, v1); return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)]; };
    const stairs = [];
    if (two) { const [sx0, sz0, sx1, sz1] = box2(Wd / 2 - 1.42, 1.5, Wd / 2 - 0.22, 5.3); stairs.push({ x0: sx0, z0: sz0, x1: sx1, z1: sz1, axis: along ? 'z' : 'x', dir: { s: -1, n: 1, e: -1, w: 1 }[door], lv: 0, open: { s: 'w', n: 'e', e: 's', w: 'n' }[door] }); }
    const Q = (u, v) => P(u, v);
    const L0 = () => {
      // estar: sofá, televisão, tapete, estante
      { const [x, z] = Q(-Wd / 2 + 0.55, D * 0.42); sofa(x, z, ryOf(1, 0), pick([0x6a5a8a, 0x8a5a4a, 0x4a6a7a, 0x7a6a4a])); const [tx, tz] = Q(-Wd / 2 + 2.75, D * 0.42); tvI(tx, tz, ryOf(-1, 0)); const [rx, rz] = Q(-Wd / 2 + 1.65, D * 0.42); rugI(rx, rz, along ? 1.6 : 2.2, along ? 2.2 : 1.6, pick([0x8a5a4a, 0x5a6a7a, 0x7a6a4a])); const [bx, bz] = Q(-Wd / 2 + 0.2, 1.05); books(bx, bz, ryOf(1, 0), 1.2); }
      if (!two) {
        { const [ax, az, bx, bz] = box2(Wd / 2 - 0.97, D - 3.0, Wd / 2 - 0.22, D - 0.25); counter(ax, az, bx, bz, 0x9a8a72); const [kx, kz] = Q(Wd / 2 - 1.25, D - 1.6); container(kx, kz, 'Revistar cozinha', 'casa', { y: 1.0 }); const [sx, sz] = Q(Wd / 2 - 0.6, D - 3.45); stove(sx, sz, ryOf(-1, 0)); const [fx, fz] = Q(Wd / 2 - 0.58, D * 0.3); kfridge(fx, fz, ryOf(-1, 0), 'Abrir frigorífico', rnd() < 0.5 ? 'bebida' : 'casa'); }
        { const [x, z] = Q(-Wd / 2 + 0.75, D - 1.3); bed(x, z, ryOf(0, 1), pick([0xd8d0c0, 0xc8b8a8, 0xa8b8c8])); container(x, z, 'Revistar futon', 'casa', { y: 0.6 }); const [wx, wz] = Q(-Wd / 2 + 2.05, D - 0.52); wardrobe(wx, wz, ryOf(0, -1), st === 'minka' ? 0x6a4a2e : 0xb8ae9e); }
        { const [x, z] = Q(Wd * 0.2, D * 0.62); table(x, z, 1.1, 0.7, 0x6a4a2e); const [c1x, c1z] = Q(Wd * 0.2, D * 0.62 - 0.6); chair(c1x, c1z, ryOf(0, 1)); }
      } else {
        { const [ax, az, bx, bz] = box2(Wd / 2 - 2.9, D - 0.97, Wd / 2 - 0.24, D - 0.22); counter(ax, az, bx, bz, 0x9a8a72); const [kx, kz] = Q(Wd / 2 - 1.6, D - 1.3); container(kx, kz, 'Revistar cozinha', 'casa', { y: 1.0 }); }
        { const [x, z] = Q(-Wd / 2 + 1.3, D - 1.4); table(x, z, 1.2, 0.8, 0x6a4a2e); const [c1x, c1z] = Q(-Wd / 2 + 1.3, D - 2.0); chair(c1x, c1z, ryOf(0, 1)); }
      }
      { const [x, z] = Q(two ? dU - 1.0 : dU + 1.0, 0.55); plantI(x, z); const [lx, lz] = Q(-Wd / 2 + 0.4, D * 0.7); lampF(lx, lz); const [c0x, c0z] = Q(-Wd / 2, 0), [c1x, c1z] = Q(Wd / 2, D); clutter(Math.min(c0x, c1x), Math.min(c0z, c1z), Math.max(c0x, c1x), Math.max(c0z, c1z), 4); }
      if (rnd() < 0.4) { const [x, z] = Q(rr(-1, 1), D * 0.6); blood(x, z, 0.7); }
    };
    const L1 = () => {
      { const [x, z] = Q(-Wd / 2 + 0.75, D - 1.3); bed(x, z, ryOf(0, 1), pick([0xd8d0c0, 0xc8b8a8, 0xa8b8c8])); container(x, z, 'Revistar cama', 'casa', { y: 0.6 }); const [wx, wz] = Q(-Wd / 2 + 0.3, D * 0.35); wardrobe(wx, wz, ryOf(1, 0), 0xb8ae9e); }
      { const [x, z] = Q(-Wd / 2 + 2.6, D - 0.55); deskPC(x, z, ryOf(0, -1)); const [cx2, cz2] = Q(-Wd / 2 + 2.6, D - 1.2); chair(cx2, cz2, ryOf(0, 1)); const [bx, bz] = Q(0.3, 0.6); boxes(bx, bz); container(bx, bz, 'Revistar caixas', 'casa', { y: 0.5 }); const [rx, rz] = Q(-0.6, D * 0.55); rugI(rx, rz, 1.8, 1.8, pick([0x7a5a6a, 0x5a6a7a])); const [lx, lz] = Q(-Wd / 2 + 0.4, 0.5); lampF(lx, lz); }
      { const [c0x, c0z] = Q(-Wd / 2, 0), [c1x, c1z] = Q(Wd / 2, D); clutter(Math.min(c0x, c1x), Math.min(c0z, c1z), Math.max(c0x, c1x), Math.max(c0z, c1z), 4); }
    };
    shell(x0, z0, x1, z1, { name: two ? 'Casa de dois pisos' : name, wall, floor: st === 'modern' ? 0xb6ae9e : 0xb9aa7a, floorUp: 0xa8946a, roof: st === 'modern' ? 'flat' : 'kawara', roofC: st === 'minka' ? pick([0x3b4048, 0x4a3a30]) : pick([0x3b4048, 0x6a3a2a, 0x3a4a5a]), h: 2.9, mapc: '#6e665b', ops, trim: st === 'minka' ? 0x3a2a1c : 0x5a5a58, doorC: pick([0x6a4a32, 0x4a5a6a, 0x7a3a2a]), floors: two ? 2 : 1, stairs, levels: two ? [L0, L1] : [L0] });
    const dAt = at(dU);
    // quintal: muro, portão, vasos, bicicleta, estendal
    const m = 2.2, X0 = x0 - m, X1 = x1 + m, Z0 = z0 - m, Z1 = z1 + m;
    const sides = { n: [X0, Z0, X1, Z0], s: [X0, Z1, X1, Z1], w: [X0, Z0, X0, Z1], e: [X1, Z0, X1, Z1] };
    const bAt = at(bU);
    for (const sd in sides) {
      const [a, c, e2, f] = sides[sd]; const g0 = sd === door ? dAt : sd === back ? bAt : null;
      if (g0 === null) { bwall(a, c, e2, f); continue; }
      const gw = sd === door ? 1.6 : 1.0;
      if (along) { bwall(a, c, g0 - gw, f); bwall(g0 + gw, c, e2, f); b.box(0.35, 1.5, 0.35, g0 - gw, 0.75, c, 0x8a8478); b.box(0.35, 1.5, 0.35, g0 + gw, 0.75, c, 0x8a8478); }
      else { bwall(a, c, e2, g0 - gw); bwall(a, g0 + gw, e2, f); b.box(0.35, 1.5, 0.35, a, 0.75, g0 - gw, 0x8a8478); b.box(0.35, 1.5, 0.35, a, 0.75, g0 + gw, 0x8a8478); }
    }
    const pp = (u, v) => P(u, v); // exterior: v negativo = fora, à frente da porta
    { const [x, z] = pp(dU - 1.0, -0.8); plant(x, z); const [x2, z2] = pp(dU + 1.0, -0.8); plant(x2, z2); }
    if (rnd() < 0.6) { const [x, z] = pp(-Wd / 2 + 0.3, -1.1); bike(x, z, face + Math.PI / 2 + rr(-0.3, 0.3)); }
    if (rnd() < 0.6) { const [x, z] = P(-Wd / 2 + 1.4, D + 1.1); laundry(x, z, along ? 0 : Math.PI / 2); }
    { const [x, z] = pp(Wd / 2 - 0.6, -0.15); b.box(0.5, 0.55, 0.3, x, 1.0, z, 0xdcdad4, { ry: face }); }
    mp(X0, Z0, X1, Z1, 'rgba(110,104,92,.35)');
  };
  // grinalda de lâmpadas (fio a cair entre dois pontos); as lâmpadas ficam em W.festoon para o brilho de noite
  const FEST = new THREE.Color(1.9, 1.35, 0.7);
  const festoon = (ax, az, bx, bz, y, sag) => { const L = Math.hypot(bx - ax, bz - az), n = Math.max(4, Math.round(L / 0.55)); let px = 0, py = 0, pz = 0;
    for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, yy = y - sag * 4 * t * (1 - t);
      if (i) { const dx = x - px, dy = yy - py, dz = z - pz, l = Math.hypot(dx, dy, dz); b.box(0.012, 0.012, l, (x + px) / 2, (yy + py) / 2, (z + pz) / 2, 0x1a1a1a, { ry: Math.atan2(dx, dz), rx: -Math.atan2(dy, Math.hypot(dx, dz)) }); }
      if (i && i < n) { b.box(0.012, 0.05, 0.012, x, yy - 0.025, z, 0x1a1a1a); b.sph(0.038, x, yy - 0.07, z, FEST, { mat: 'lit', ws: 6, hs: 4 }); (W.festoon || (W.festoon = [])).push([x, yy - 0.07, z]); }
      px = x; py = yy; pz = z; } };
  const shop = (cx, cz, w, d, door, jp, pt) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, along = door === 'n' || door === 's';
    const ops = { n: [], s: [], e: [], w: [] }; const mid = along ? cx : cz;
    ops[door] = [{ at: mid - 2.2, w: 2.2, k: 'w' }, { at: mid, w: 1.6, k: 'd' }, { at: mid + 2.2, w: 2.2, k: 'w' }];
    ops[{ s: 'n', n: 's', e: 'w', w: 'e' }[door]] = [{ at: mid + (along ? w : d) / 4, w: 1.2, k: 'd' }];
    shell(x0, z0, x1, z1, { name: pt, wall: 0xe4e2dc, floor: 0xd8dad6, h: 3.2, mapc: '#9aa7a3', ops, roofC: 0x8f8b84, trim: 0x6a6e72 });
    if (door === 's' || door === 'n') { const z = door === 's' ? z1 : z0; hsign(cx, 3.5, door === 's' ? z1 + 0.17 : z0 - 0.17, jp, '#f4f2ea', '#c8321e', Math.min(w - 1, 4.5), 0.75, { sub: pt.toUpperCase(), ry: door === 's' ? 0 : Math.PI }); /* à frente da beira do telhado (antes a beira tapava a 2.ª linha) e virada para a rua */ b.box(w - 0.6, 0.12, 1.0, cx, 2.85, door === 's' ? z1 + 0.5 : z0 - 0.5, 0xc8321e, { rx: door === 's' ? 0.18 : -0.18 }); }
    else { const s = A.sign(jp, { w: 96, h: 320, bg: '#f4f2ea', fg: '#c8321e', vertical: true }); const x = door === 'e' ? x1 + 0.1 : x0 - 0.1; b.box(0.12, 2.4, 0.8, x, 1.9, z1 - 0.6, 0x2a2b2c); b.plane(0.7, 2.2, x + (door === 'e' ? 0.07 : -0.07), 1.9, z1 - 0.6, 0xffffff, { mat: 'sign', uv: s, ry: door === 'e' ? Math.PI / 2 : -Math.PI / 2 }); }
    if (along) { const fz = door === 's' ? z1 + 1.06 : z0 - 1.06, wz = door === 's' ? z1 - 0.2 : z0 + 0.2, ry = door === 's' ? 0 : Math.PI;
      festoon(x0 + 0.25, fz, x1 - 0.25, fz, 2.78, 0.28); // grinalda de lâmpadas à frente da loja
      const s = A.sign('営業中', { w: 192, h: 72, bg: '#140806', fg: '#ff6a2a', pad: 0.12 }); b.plane(0.72, 0.27, cx - 2.75, 1.85, wz, 0xffffff, { mat: 'sign', uv: s, ry }); } // letreiro aceso na montra
    const sx = (x0 + x1) / 2, sz = (z0 + z1) / 2;
    if (along) { shelf(sx - w / 4, sz, w / 2 - 1.2, 0); shelf(sx + w / 4, sz, w / 2 - 1.2, 0); fridge(sx - w / 4, door === 's' ? z0 + 0.62 : z1 - 0.62, w / 2 - 1); counter(sx + w / 2 - 2.6, door === 's' ? z1 - 1.6 : z0 + 0.8, sx + w / 2 - 0.4, door === 's' ? z1 - 0.8 : z0 + 1.6, 0xd8dad6); container(sx + w / 2 - 1.5, door === 's' ? z1 - 1.9 : z0 + 1.9, 'Revistar caixa registadora', 'casa', { y: 1.0 }); }
    else { shelf(sx, sz - d / 4, d / 2 - 1.2, Math.PI / 2); shelf(sx, sz + d / 4, d / 2 - 1.2, Math.PI / 2); }
  };

  // ---------- Kitamura (北村): vila ao longo da estrada principal, a oeste
  { const X = -170; zone('Kitamura', '北村', X, 0, 52, 'town', 'Vila · casas e uma loja');
    const lots = [[-205, 's'], [-192, 'n'], [-180, 's'], [-166, 'n'], [-153, 's'], [-140, 'n'], [-212, 'n'], [-130, 's']];
    lots.forEach(([x, door], i) => { const w = rr(7.4, 9), d = rr(6.4, 7.6); const cz = door === 's' ? -(6.8 + 2.4 + d / 2) - rr(0, 2) : (6.8 + 2.4 + d / 2) + rr(0, 2); house(x, cz, w, d, door === 's' ? 's' : 'n'); });
    shop(-167, -16.5, 11, 8, 's', '商店', 'Mercearia');
    shell(-168, 24, -159, 32, { name: 'Posto médico', wall: 0xeeece6, floor: 0xd8dcd8, h: 3.0, mapc: '#9aa7a3', roofC: 0x6a7a8a, trim: 0x6a6e72, ops: { n: [{ at: -163.5, w: 1.6, k: 'd' }, { at: -166, w: 1.6, k: 'w' }, { at: -161, w: 1.6, k: 'w' }], s: [{ at: -163.5, w: 2, k: 'w' }] } });
    dirt(-165, 19.6, -162, 24);
    { const s = A.sign('診療所', { w: 96, h: 288, bg: '#ffffff', fg: '#1f6a9a', vertical: true }); b.box(0.12, 2.2, 0.75, -158.9, 1.8, 25.0, 0x2a2b2c); b.plane(0.66, 2.0, -158.83, 1.8, 25.0, 0xffffff, { mat: 'sign', uv: s, ry: Math.PI / 2 }); }
    bed(-166.6, 29.6, 0); cabinet(-160.0, 30.6, 1.2, 'Abrir armário de medicamentos', 'hospital', 0, 0xe6eae8); container(-162.5, 26.5, 'Revistar carrinho', 'hospital'); b.box(0.6, 0.9, 0.5, -162.5, 0.45, 26.5, 0xb8bcbf, { mat: 'm' }); rect(-162.8, 26.25, -162.2, 26.75, 'l', 0.9);
    for (let x = -215; x <= -125; x += 18) { pole(x, -6.4, 8.5); }
    for (const [x, z, ry, c, o] of [[-199, 2.1, -Math.PI / 2 + 0.1, 0xd8d6d0, {}], [-148, -1.9, Math.PI / 2, 0x5a7a4a, { wreck: true }], [-176, 19.5, 0.2, 0x8a2a22, {}]]) car(x, z, ry, c, o);
    vend(-171.6, -11.9, 0, 0x2f6fb3); vend(-170.5, -11.9, 0, 0xc23a2e); bench(-160, -7.5, 0); blood(-185, 1, 1.1); blood(-150, -3, 0.8);
  }
  // ---------- Minamisato (南里): vila ao longo do caminho para sul
  { zone('Minamisato', '南里', 0, 185, 48, 'town', 'Vila · casas e uma loja');
    const lots = [[150, 'e'], [164, 'w'], [178, 'e'], [192, 'w'], [206, 'e'], [220, 'w'], [160, 'w'], [212, 'e']];
    lots.forEach(([z, door], i) => { const w = rr(6.4, 7.6), d = rr(7.4, 9); const cx = door === 'e' ? -(2.6 + 3.2 + w / 2) - rr(0, 2) - (i > 5 ? 14 : 0) : (2.6 + 3.2 + w / 2) + rr(0, 2) + (i > 5 ? 14 : 0); house(cx, z, w, d, door); });
    shop(13.5, 178, 8, 11, 'w', '酒屋', 'Loja');
    for (let z = 140; z <= 230; z += 18) pole(-3.6, z, 8.2);
    car(-1.4, 200, 0.15, 0x3a3d40, { wreck: true }); car(1.6, 168, Math.PI - 0.1, 0xe8e6e0);
    // campos de arroz e hortas
    for (const [x0, z0] of [[-60, 150], [-60, 190], [30, 220], [40, 140]]) { b.floor(x0, z0, x0 + 20, z0 + 30, 0.015, 0xffffff, 'dirt'); mp(x0, z0, x0 + 20, z0 + 30, '#6b5b44'); for (let x = x0 + 1; x < x0 + 20; x += 1.4) for (let z = z0 + 1; z < z0 + 30; z += 1.6) b.box(0.25, rr(0.25, 0.5), 0.25, x, 0.2, z, pick([0x5a7a32, 0x6a8a3a, 0x7a8a3a])); }
  }
  // ---------- posto de combustível na estrada principal, a leste
  { const X = 148, Z = -17; zone('Posto de combustível', 'ガソリン', X, Z, 24, 'mon', 'Monumento · loja e carros');
    b.floor(X - 18, Z - 11, X + 18, -4.2, 0.025, 0xffffff, 'asph'); mp(X - 18, Z - 11, X + 18, -4.2, '#55565a');
    for (const px of [X - 7, X + 7]) for (const pz of [Z + 2, Z + 8]) { b.box(0.6, 6.0, 0.6, px, 3, pz, 0xd8d6d0); rect(px - 0.3, pz - 0.3, px + 0.3, pz + 0.3, 's', 6); }
    b.box(18, 0.6, 9, X, 6.2, Z + 5, 0xe8e6e0); b.box(18.1, 0.4, 9.1, X, 6.0, Z + 5, 0xc8321e); for (let i = 0; i < 6; i++) b.box(1.2, 0.05, 0.3, X - 7.5 + i * 3, 5.7, Z + 5, new THREE.Color(1.6, 1.6, 1.5), { mat: 'lit' });
    for (const px of [X - 3.5, X + 3.5]) { b.box(0.8, 1.6, 1.2, px, 0.8, Z + 5, 0xe8e6e0); b.box(0.82, 0.4, 1.22, px, 1.5, Z + 5, 0xc8321e); b.box(0.5, 0.3, 0.02, px, 1.1, Z + 5.62, 0x1a2a1a); rect(px - 0.4, Z + 4.4, px + 0.4, Z + 5.6, 's', 1.6); b.box(1.0, 0.25, 1.6, px, 0.12, Z + 5, 0xb8b4aa); }
    shop(X + 10, Z - 6, 10, 7, 's', 'ガソリン', 'Loja do posto');
    { const s = A.sign('ガソリン', { w: 128, h: 384, bg: '#c8321e', fg: '#ffffff', vertical: true }); b.cyl(0.12, 0.12, 7, 8, X - 16, 3.5, -6, 0x8a8e92, { mat: 'm' }); b.box(1.4, 3.6, 0.3, X - 16, 6.4, -6, 0x2a2b2c); b.plane(1.25, 3.4, X - 16, 6.4, -5.84, 0xffffff, { mat: 'sign', uv: s }); circ(X - 16, -6, 0.2); }
    car(X - 3.5, Z + 9.2, 0.05, 0x2a5a8a); car(X + 3.5, Z + 1.6, Math.PI + 0.1, 0xd8d6d0, { wreck: true });
    for (const [x, z] of [[X - 13, Z - 7], [X - 11, Z - 7]]) { b.cyl(0.9, 0.9, 2.6, 12, x, 1.3, z, 0xd8d6d0, { mat: 'm', rz: Math.PI / 2 }); rect(x - 1.3, z - 0.9, x + 1.3, z + 0.9, 's', 2); }
    crate(X - 6, Z - 8, 0.2, 'Abrir caixa de ferramentas', 'oficina', 0x9a2a22); blood(X, Z + 3, 1);
  }
  // ---------- base militar (melhor loot fora da cidade)
  { const X = 190, Z = -178, hw = 32, hd = 24; zone('Base militar', '基地', X, Z, 40, 'mil', 'Monumento · loot militar');
    dirt(X - 3, Z + hd, X + 3, -4.2); b.floor(X - hw, Z - hd, X + hw, Z + hd, 0.02, 0xffffff, 'conc'); mp(X - hw, Z - hd, X + hw, Z + hd, '#6e7062');
    const fence = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 3); for (let i = 0; i <= n; i++) b.cyl(0.05, 0.05, 2.8, 6, x0 + (x1 - x0) * i / n, 1.4, z0 + (z1 - z0) * i / n, 0x6a6e72, { mat: 'm' }); const hor = Math.abs(z0 - z1) < 0.01; b.box(hor ? L : 0.03, 2.5, hor ? 0.03 : L, (x0 + x1) / 2, 1.3, (z0 + z1) / 2, 0x9aa0a4, { mat: 'fence' }); for (let i = 0; i < 3; i++) b.cyl(0.02, 0.02, L, 4, (x0 + x1) / 2, 2.75 + i * 0.12, (z0 + z1) / 2 + (hor ? (i - 1) * 0.08 : 0), 0x5a5e62, hor ? { rz: Math.PI / 2 } : { rx: Math.PI / 2 }); rect(Math.min(x0, x1) - 0.05, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, Math.max(z0, z1) + 0.05, 'g', 2.8); };
    fence(X - hw, Z - hd, X + hw, Z - hd); fence(X - hw, Z - hd, X - hw, Z + hd); fence(X + hw, Z - hd, X + hw, Z + hd); fence(X - hw, Z + hd, X - 4, Z + hd); fence(X + 4, Z + hd, X + hw, Z + hd);
    barrier(X - 1.2, Z + hd + 1.5, 0); barrier(X + 1.4, Z + hd + 2.6, 0.2);
    const tw = (x, z) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.18, 5.2, 0.18, x + sx * 1.1, 2.6, z + sz * 1.1, 0x5a4a32); b.box(3.0, 0.2, 3.0, x, 5.2, z, 0x6a5a3a); b.box(3.0, 1.0, 0.1, x, 5.8, z + 1.45, 0x535c3b); b.box(3.0, 1.0, 0.1, x, 5.8, z - 1.45, 0x535c3b); b.box(0.1, 1.0, 3.0, x + 1.45, 5.8, z, 0x535c3b); b.box(0.1, 1.0, 3.0, x - 1.45, 5.8, z, 0x535c3b); b.box(3.4, 0.15, 3.4, x, 7.4, z, 0x3a4228); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.1, 1.4, 0.1, x + sx * 1.4, 6.7, z + sz * 1.4, 0x5a4a32); circ(x, z, 1.4); };
    tw(X - hw + 3, Z - hd + 3); tw(X + hw - 3, Z - hd + 3); tw(X - hw + 3, Z + hd - 3); tw(X + hw - 3, Z + hd - 3);
    const OD = 0x535c3b;
    for (const [x0, z0] of [[X - 26, Z - 18], [X + 8, Z - 18]]) { shell(x0, z0, x0 + 18, z0 + 8, { name: 'Caserna', wall: 0x6e7458, floor: 0x7a7a70, h: 3.2, roofC: 0x4a5236, mapc: '#5a6048', trim: 0x3a3f2a, ops: { s: [{ at: x0 + 9, w: 1.6, k: 'd' }, { at: x0 + 3.5, w: 1.6, k: 'w' }, { at: x0 + 14.5, w: 1.6, k: 'w' }], n: [{ at: x0 + 6, w: 1.4, k: 'w' }, { at: x0 + 12, w: 1.4, k: 'w' }], e: [{ at: z0 + 4, w: 1.4, k: 'd' }] } });
      for (let i = 0; i < 4; i++) bed(x0 + 1.4 + i * 1.6, z0 + 1.6, 0, 0x6a7058); cabinet(x0 + 15.8, z0 + 0.6, 1.2, 'Abrir cacifo militar', 'militar', 0, 0x5a6048); crate(x0 + 12.5, z0 + 5.6, 0, 'Abrir caixa militar', 'militar'); table(x0 + 5, z0 + 5.4, 1.8, 0.9, 0x6a6e5a); container(x0 + 5, z0 + 5.4, 'Revistar mesa', 'policia', { y: 0.8 }); }
    for (const [x, z] of [[X - 18, Z + 6], [X - 8, Z + 6], [X + 12, Z + 8]]) { b.push(x, 0, z); b.box(5.0, 2.0, 4.0, 0, 1.0, 0, OD); b.add(new THREE.CylinderGeometry(2.05, 2.05, 5.0, 12, 1, false, 0, Math.PI), OD, 'v', mat4(0, 2.0, 0, 0, 0, Math.PI / 2)); b.box(1.6, 1.8, 0.05, 0, 0.9, 2.02, 0x2a2e20); b.pop(); rect(x - 2.5, z - 2, x + 2.5, z + 2, 's', 3.5); crate(x, z + 3.0, 0, 'Abrir caixa militar', 'militar'); }
    for (const [x, z, L, hor] of [[X - 4, Z + 14, 8, 1], [X + 6, Z - 4, 6, 0], [X - 22, Z - 4, 7, 1], [X + 20, Z + 18, 6, 1]]) { const n = Math.floor(L / 0.7); for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) b.rbox(0.7, 0.3, 0.42, 0.1, hor ? x + i * 0.7 + (k % 2) * 0.35 : x, 0.15 + k * 0.28, hor ? z : z + i * 0.7 + (k % 2) * 0.35, 0x8a7a55); rect(x - 0.3, z - 0.3, hor ? x + L : x + 0.3, hor ? z + 0.3 : z + L, 'l', 0.9); }
    { const g = new THREE.CircleGeometry(6, 24); g.rotateX(-Math.PI / 2); b.add(g, 0x3a3c36, 'decal', mat4(X + 18, 0.04, Z - 4)); const s = A.sign('H', { w: 128, h: 128, fg: '#e8e4da', font: 'UI', weight: 700 }); b.plane(4.5, 4.5, X + 18, 0.05, Z - 4, 0xffffff, { mat: 'paint', uv: s, rx: -Math.PI / 2 }); mp(X + 12, Z - 10, X + 24, Z + 2, '#4a4c46'); }
    const mtruck = (x, z, ry) => { b.push(x, 0, z, ry); b.rbox(2.3, 2.0, 2.0, 0.2, 0, 1.4, 3.0, OD, { mat: 'm' }); b.box(2.0, 0.7, 0.06, 0, 2.0, 4.02, 0x1f2a33, { mat: 'win' }); b.box(2.4, 1.0, 5.0, 0, 1.2, -0.6, OD, { mat: 'm' }); b.add(new THREE.CylinderGeometry(1.25, 1.25, 5.0, 10, 1, false, 0, Math.PI), 0x5a6244, 'v', mat4(0, 1.7, -0.6, 0, Math.PI / 2, Math.PI / 2)); for (const sz of [-2.4, -0.8, 3.0]) for (const sx of [-1, 1]) b.cyl(0.5, 0.5, 0.35, 12, sx * 1.1, 0.5, sz, 0x1b1b1c, { rz: Math.PI / 2 }); b.pop(); const cs = Math.abs(Math.sin(ry)) > 0.5; rect(x - (cs ? 4.3 : 1.25), z - (cs ? 1.25 : 4.3), x + (cs ? 4.3 : 1.25), z + (cs ? 1.25 : 4.3), 's', 3); mp(x - (cs ? 4.3 : 1.25), z - (cs ? 1.25 : 4.3), x + (cs ? 4.3 : 1.25), z + (cs ? 1.25 : 4.3), '#535c3b'); };
    // paiol: porta de metal trancada; só abre com explosivos. Dentro, o melhor loot militar
    { const x0 = X - 12, z0 = Z - 8.6, x1 = X - 4, z1 = Z - 3.6; shell(x0, z0, x1, z1, { name: 'Paiol', wall: 0x7a7c74, floor: 0x6a6a64, h: 3.0, roofC: 0x55574f, mapc: '#5c5e56', trim: 0x3a3c36, doorC: 0x4a5056, ops: { s: [{ at: X - 8, w: 1.4, k: 'd' }] } });
      const D = W.doors[W.doors.length - 1]; D.lock = { hp: 1400, max: 1400 }; D.t = D.target = 0;
      crate(x0 + 1.4, z0 + 1.1, 0, 'Abrir caixa do paiol', 'paiol'); crate(x1 - 1.4, z0 + 1.1, 0, 'Abrir caixa do paiol', 'paiol'); cabinet(x0 + 0.5, z0 + 3.4, 1.1, 'Abrir armário do paiol', 'paiol', Math.PI / 2, 0x4a5044); }
    mtruck(X + 4, Z + 16, 0); mtruck(X - 26, Z + 16, Math.PI / 2 + 0.05); container(X + 4, Z + 11.2, 'Abrir caixa do camião', 'militar', { y: 1.0 });
    for (let i = 0; i < 6; i++) crate(X + rr(-24, 24), Z + rr(-2, 4), rr(-0.4, 0.4), 'Abrir caixa de munições', i % 2 ? 'militar' : 'policia');
    blood(X, Z + 10, 1.4); blood(X - 12, Z - 2, 1);
  }
  // ---------- pedreira (muita pedra, enxofre e metal)
  { const X = -232, Z = 176; zone('Pedreira', '採石場', X, Z, 40, 'mon', 'Monumento · minérios');
    dirt(X - 3, 4.2, X + 3, Z - 32); b.floor(X - 36, Z - 32, X + 36, Z + 30, 0.015, 0xffffff, 'dirt'); mp(X - 36, Z - 32, X + 36, Z + 30, '#7a6a52');
    for (let i = 0; i < 26; i++) { const x = X + rr(-32, 32), z = Z + rr(-26, 26); if (W.rocks.some(r => (r.x - x) ** 2 + (r.z - z) ** 2 < 25)) continue; W.rocks.push({ x, z, kind: pick(['stone', 'stone', 'sulfur', 'metal']), s: rr(1.0, 1.35), ry: rr(0, 6.28) }); }
    for (let i = 0; i < 8; i++) { const x = X + rr(-30, 30), z = Z + rr(-24, 24); b.add(new THREE.ConeGeometry(rr(2, 3.5), rr(1.5, 2.6), 9), pick([0x9a948a, 0x8a8478, 0xa8a090]), 'vf', mat4(x, 0.9, z, rr(0, 3))); circ(x, z, 2.2); }
    // escavadora
    { const x = X + 8, z = Z - 6; b.push(x, 0, z, 0.6); b.box(2.6, 0.8, 4.0, 0, 0.4, 0, 0x2a2b2c); b.rbox(2.6, 1.4, 2.6, 0.2, 0, 1.6, -0.3, 0xe0a42a, { mat: 'm' }); b.box(1.2, 1.2, 1.2, -0.6, 2.8, 0.4, 0xe0a42a, { mat: 'm' }); b.box(1.1, 0.9, 0.05, -0.6, 2.9, 1.02, 0x1f2a33, { mat: 'win' }); b.box(0.35, 0.35, 3.2, 0.6, 3.0, 2.2, 0xe0a42a, { mat: 'm', rx: -0.5 }); b.box(0.3, 0.3, 2.4, 0.6, 2.6, 4.2, 0xe0a42a, { mat: 'm', rx: 0.9 }); b.box(1.2, 0.8, 0.9, 0.6, 1.0, 5.0, 0x5a5650, { mat: 'm' }); b.pop(); rect(x - 2, z - 2, x + 2, z + 2, 's', 3); }
    shell(X - 30, Z - 28, X - 20, Z - 20, { name: 'Barracão', wall: 0x8a8f92, floor: 0x7a7a76, h: 3.6, roofC: 0x6a6e72, mapc: '#686c70', trim: 0x4a4e52, ops: { e: [{ at: Z - 24, w: 2.8, k: 'd' }], s: [{ at: X - 25, w: 1.6, k: 'w' }] } });
    crate(X - 28.6, Z - 26.6, 0, 'Abrir caixa de ferramentas', 'oficina', 0x9a2a22); cabinet(X - 21, Z - 27.3, 1.4, 'Abrir armário', 'oficina', 0, 0x6a7078); table(X - 25, Z - 22, 1.8, 0.8, 0x6a6e72); container(X - 25, Z - 22, 'Revistar bancada', 'oficina', { y: 0.8 });
  }
  // ---------- quinta
  { const X = 160, Z = 168; zone('Quinta', '農家', X, Z, 38, 'town', 'Celeiro, casa e campos');
    dirt(X - 2.6, 4.2, X + 2.6, Z - 20); house(X - 12, Z - 8, 8.4, 7, 'e', 'minka', 'Casa da quinta');
    shell(X + 4, Z - 6, X + 18, Z + 5, { name: 'Celeiro', wall: 0x8a3a2a, floor: 0x7a6a52, h: 4.2, roof: 'kawara', roofC: 0x4a3a30, mapc: '#6a3a2a', trim: 0x4a2a1c, ops: { w: [{ at: Z - 0.5, w: 3.2, k: 'd' }], s: [{ at: X + 11, w: 1.6, k: 'w' }] } });
    for (let i = 0; i < 3; i++) { b.cyl(0.8, 0.8, 1.4, 12, X + 15.5 - i * 1.8, 0.7, Z + 3, 0xd8b85a, { rz: Math.PI / 2, rx: 0 }); } rect(X + 10.5, Z + 2.2, X + 16.4, Z + 3.8, 'l', 1.4);
    crate(X + 6, Z - 4.4, 0, 'Revistar caixote', 'cabana', 0x7a5a3a); crate(X + 16.5, Z - 4.4, 0, 'Revistar caixote', 'oficina', 0x7a5a3a);
    b.cyl(2.2, 2.2, 10, 14, X + 22, 5, Z - 2, 0xc8c4b8, { mat: 'm' }); b.sph(2.2, X + 22, 10, Z - 2, 0xa8acb0, { mat: 'm', th: Math.PI / 2 }); circ(X + 22, Z - 2, 2.2);
    { b.push(X - 2, 0, Z + 12, 0.4); b.box(1.6, 1.2, 2.4, 0, 1.0, 0, 0x2a7a3a, { mat: 'm' }); b.box(1.2, 1.2, 1.1, 0, 2.1, -0.5, 0x2a7a3a, { mat: 'm' }); b.box(1.1, 0.9, 0.05, 0, 2.2, 0.08, 0x1f2a33, { mat: 'win' }); for (const sx of [-1, 1]) { b.cyl(0.75, 0.75, 0.45, 14, sx * 0.95, 0.75, -0.6, 0x1b1b1c, { rz: Math.PI / 2 }); b.cyl(0.45, 0.45, 0.3, 12, sx * 0.85, 0.45, 1.0, 0x1b1b1c, { rz: Math.PI / 2 }); } b.pop(); rect(X - 3.2, Z + 10.4, X - 0.8, Z + 13.6, 's', 2.5); }
    for (const [x0, z0] of [[X - 34, Z + 6], [X + 8, Z + 12], [X - 34, Z - 34]]) { b.floor(x0, z0, x0 + 24, z0 + 18, 0.016, 0xffffff, 'dirt'); mp(x0, z0, x0 + 24, z0 + 18, '#6b5b44'); for (let z = z0 + 1; z < z0 + 18; z += 1.5) b.box(23, 0.18, 0.5, x0 + 12, 0.09, z, 0x5a4a36); for (let x = x0 + 1; x < x0 + 24; x += 1.1) for (let z = z0 + 1; z < z0 + 18; z += 1.5) if (rnd() < 0.7) b.ico(0.22, x, 0.32, z, pick([0x5a8a32, 0x6a9a3a, 0x7a8a3a]), { mat: 'vf' }); }
    woodFence(X - 36, Z - 32, X - 4, Z - 32); woodFence(X + 4, Z - 32, X + 26, Z - 32); woodFence(X - 36, Z - 32, X - 36, Z + 26);
  }
  // ---------- torre de rádio
  { const X = -118, Z = -205; zone('Torre de rádio', '電波塔', X, Z, 26, 'mon', 'Monumento · vista e loot');
    dirt(X - 2.6, Z + 14, X + 2.6, -4.2); b.floor(X - 16, Z - 14, X + 16, Z + 14, 0.02, 0xffffff, 'conc'); mp(X - 16, Z - 14, X + 16, Z + 14, '#7a7870');
    const tx = X + 6, tz = Z - 4, Hh = 42;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.push(tx + sx * 2.4, 0, tz + sz * 2.4); b.cyl(0.1, 0.16, Hh, 6, -sx * 1.15, Hh / 2, -sz * 1.15, 0xc8c4bc, { mat: 'm', rx: sz * 0.055, rz: -sx * 0.055 }); b.pop(); rect(tx + sx * 2.4 - 0.25, tz + sz * 2.4 - 0.25, tx + sx * 2.4 + 0.25, tz + sz * 2.4 + 0.25, 's', Hh); }
    for (let y = 3; y < Hh; y += 3.5) { const k = 1 - y / Hh * 0.48, s = 2.4 * k; const c = Math.floor(y / 7) % 2 ? 0xc8321e : 0xe8e6e0; b.box(s * 2, 0.12, 0.12, tx, y, tz + s, c, { mat: 'm' }); b.box(s * 2, 0.12, 0.12, tx, y, tz - s, c, { mat: 'm' }); b.box(0.12, 0.12, s * 2, tx + s, y, tz, c, { mat: 'm' }); b.box(0.12, 0.12, s * 2, tx - s, y, tz, c, { mat: 'm' }); }
    b.sph(0.3, tx, Hh + 0.6, tz, new THREE.Color(2.4, 0.2, 0.1), { mat: 'lit' }); b.cyl(0.6, 0.6, 0.4, 10, tx, Hh * 0.7, tz + 1.4, 0xe8e6e0, { rx: Math.PI / 2 });
    shell(X - 12, Z - 2, X - 3, Z + 6, { name: 'Casa das máquinas', wall: 0xd2d0c8, floor: 0x9a9a92, h: 3.2, roofC: 0x6a6e72, mapc: '#7a7870', trim: 0x5a5e62, ops: { s: [{ at: X - 7.5, w: 1.4, k: 'd' }, { at: X - 10.4, w: 1.4, k: 'w' }], e: [{ at: Z + 2, w: 1.4, k: 'w' }] } });
    for (let i = 0; i < 3; i++) b.box(0.9, 1.9, 0.6, X - 11 + i * 1.1, 0.95, Z - 1.4, 0x5a6068, { mat: 'm' }); rect(X - 11.5, Z - 1.7, X - 8.3, Z - 1.1, 's', 1.9);
    crate(X - 5, Z + 4.6, 0, 'Abrir caixa militar', 'militar'); cabinet(X - 11.4, Z + 3.5, 1.2, 'Abrir armário', 'policia', Math.PI / 2, 0x6a7078);
    const f = (x0, z0, x1, z1) => { const hor = Math.abs(z0 - z1) < 0.01, L = hor ? x1 - x0 : z1 - z0; b.box(hor ? L : 0.03, 2.2, hor ? 0.03 : L, (x0 + x1) / 2, 1.1, (z0 + z1) / 2, 0x9aa0a4, { mat: 'fence' }); for (let i = 0; i <= Math.ceil(L / 3); i++) b.cyl(0.04, 0.04, 2.3, 5, hor ? x0 + i * L / Math.ceil(L / 3) : x0, 1.15, hor ? z0 : z0 + i * L / Math.ceil(L / 3), 0x7a7e82, { mat: 'm' }); rect(Math.min(x0, x1) - 0.05, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, Math.max(z0, z1) + 0.05, 'g', 2.2); };
    f(X - 16, Z - 14, X + 16, Z - 14); f(X - 16, Z - 14, X - 16, Z + 14); f(X + 16, Z - 14, X + 16, Z + 14); f(X - 16, Z + 14, X - 3, Z + 14); f(X + 3, Z + 14, X + 16, Z + 14);
  }
  // postes ao longo das estradas novas
  for (let z = -20; z > -150; z -= 22) pole(193.8, z, 8);
  for (let z = 20; z < 140; z += 22) pole(-234.6, z, 8);
  return { house, shop };
}
