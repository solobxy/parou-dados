// Arena PvP «Tóquio»: mapa pequeno e igual dos dois lados (espelhado em x), como os mapas pequenos do CS2.
// Vermelha a oeste, Azul a este. Três caminhos: viela norte (lojas e janelas), praça ao meio (casa de 2 pisos) e
// parque sul (cerejeiras e plataformas com rampa). Fica no canto sudeste do mundo, longe de tudo, e só se constrói no modo arena.
import * as THREE from 'three';

export const ARENA = { x: 3650, z: 3650, hw: 48, hd: 31 };
// onde cada equipa nasce (0 = vermelha a oeste, 1 = azul a este): pontos espalhados na zona de partida
export const arenaSpawns = t => { const s = t ? 1 : -1, X = ARENA.x, Z = ARENA.z; return [[X + s * 43, Z - 4], [X + s * 43, Z + 4], [X + s * 41, Z], [X + s * 44.5, Z - 1.5], [X + s * 44.5, Z + 1.5], [X + s * 41.5, Z - 6], [X + s * 41.5, Z + 6]]; };
export const inArena = (x, z, m = 0) => Math.abs(x - ARENA.x) < ARENA.hw + m && Math.abs(z - ARENA.z) < ARENA.hd + m;

// kits: o que trazes ao nascer (belt: cinto [item, acessórios ou quantidade]; bag: [item, quantidade ou n.º de carregadores])
export const ARENA_KITS = {
  atirador: { n: 'Atirador', d: 'Equilibrado: a M4 serve a qualquer distância.', head: 'capacete', vest: 'colete', belt: [['m4', { scope: 'reddot' }], ['pistola'], ['granada', 1], ['ligadura', 3]], bag: [['cStanag', 3], ['cPist', 2]] },
  assalto: { n: 'Assalto', d: 'Para entrar a correr: AK de perto e caçadeira na casa.', vest: 'colete', belt: [['ak'], ['cacadeira'], ['granada', 2], ['ligadura', 3]], bag: [['cAk', 3], ['c12', 18]] },
  sniper: { n: 'Sniper', d: 'Um tiro, uma baixa. Fica atrás e segura as janelas.', head: 'capacete', belt: [['cheytac', { scope: 'mira8' }], ['pistola'], ['ligadura', 2]], bag: [['c408', 3], ['cPist', 2]] },
  pesado: { n: 'Pesado', d: 'Muito fogo e muita proteção, mas mais lento a mirar.', head: 'capacete', vest: 'colete', belt: [['m249'], ['revolver'], ['ligadura', 3]], bag: [['cM249', 1], ['a357', 18]] },
  apoio: { n: 'Apoio', d: 'Cura-te e aos outros: SMG, kits médicos e granadas.', vest: 'colete', belt: [['smg', { scope: 'reddot' }], ['pistola'], ['medkit', 2], ['granada', 2], ['ligadura', 6]], bag: [['cSmg', 3], ['cPist', 1]] },
};
export const ARENA_KIT_ORDER = ['atirador', 'assalto', 'sniper', 'pesado', 'apoio'];
// símbolo de cada kit (SVG, 24×24, traço na cor do texto)
export const ARENA_KIT_SVG = {
  atirador: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2l10 10-10 10L2 12z"/><circle cx="12" cy="12" r="3"/><path d="M12 6v3M12 15v3M6 12h3M15 12h3"/></svg>',
  assalto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M13 6l-4 7h4l-2 5 5-8h-4z" fill="currentColor" stroke="none"/></svg>',
  sniper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>',
  pesado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="9" width="4.2" height="11" rx="1"/><rect x="9.9" y="6" width="4.2" height="14" rx="1"/><rect x="16.8" y="9" width="4.2" height="11" rx="1"/><path d="M3 9l2.1-4L7.2 9M9.9 6l2.1-4 2.1 4M16.8 9l2.1-4L21 9"/></svg>',
  apoio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M10 6h4v4h4v4h-4v4h-4v-4H6v-4h4z" fill="currentColor" stroke="none"/></svg>',
};

export function buildArena(T) {
  const { b, A, W, rect, circ, mp, shell, lamp, lantern, vend, bench, shade, mat4, pole, wires, bike } = T;
  const X = ARENA.x, Z = ARENA.z, HW = ARENA.hw, HD = ARENA.hd;
  const VERM = 0xc8321e, DARK = 0x24262b, WOOD = 0x6a4a32, STONE = 0x9a968c;
  W.zones.push({ name: 'Arena de Tóquio', jp: '東京', x: X, z: Z, r: 40, kind: 'city', sub: 'PvP · Vermelha contra Azul', arena: true });
  // chão: betão, praça de ladrilho ao meio, terra batida no parque
  b.floor(X - HW - 6, Z - HD - 6, X + HW + 6, Z + HD + 6, 0.02, 0xffffff, 'conc'); mp(X - HW, Z - HD, X + HW, Z + HD, '#8e8a82');
  b.floor(X - 22, Z - 9, X + 22, Z + 9, 0.03, 0xd6cfc0, 'tile'); mp(X - 22, Z - 9, X + 22, Z + 9, '#b3ab9b');
  b.floor(X - 30, Z + 13, X + 30, Z + HD - 1, 0.025, 0xffffff, 'dirt'); mp(X - 30, Z + 13, X + 30, Z + HD - 1, '#7a6a52');
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) b.box(0.9, 0.04, 0.5, X + s * (24 + i * 1.6), 0.04, Z + 20 + Math.sin(i) * 0.6, 0x8a867c); // pedras do caminho

  // ---------- muros à volta (não se sai): fachadas de Tóquio a norte e a sul, muros de templo a oeste e a este
  rect(X - HW - 1, Z - HD - 1, X + HW + 1, Z - HD, 's', 12); rect(X - HW - 1, Z + HD, X + HW + 1, Z + HD + 1, 's', 12);
  rect(X - HW - 1, Z - HD, X - HW, Z + HD, 's', 12); rect(X + HW, Z - HD, X + HW + 1, Z + HD, 's', 12);
  const SIGNS = [['ラーメン', 0xc23a2e, 0xfff2d8], ['カラオケ', 0x6a2a8a, 0xffe0f8], ['薬局', 0x2a6a8a, 0xe8f8ff], ['寿司', 0x1d1d1d, 0xf6c86a], ['居酒屋', 0x8a2a1e, 0xffe8c8], ['ゲーム', 0x1e4a8a, 0x9ff0ff], ['喫茶店', 0x3a2a1e, 0xf0dcc0], ['コンビニ', 0x2a7a4a, 0xffffff], ['本屋', 0x5a3a2a, 0xffe8b8], ['焼肉', 0x9a2a1a, 0xffd08a]];
  const PAL = [0xcfc6b6, 0x9fa3a6, 0xb8aa94, 0x8c8f92, 0xd8cfbf, 0x7a6e64, 0xa8a094, 0xc2b8a8];
  // fila de prédios: face = +1 olha para sul (+z), -1 para norte
  const row = (z0, face) => {
    let u = -HW, i = face > 0 ? 0 : 5;
    while (u < HW) { const w = Math.min(HW - u, 7 + ((i * 7) % 5)), h = 7 + ((i * 5) % 4) * 2.2, c = PAL[i % PAL.length], cx = X + u + w / 2, d = 6, cz = z0 - face * d / 2;
      b.box(w - 0.1, h, d, cx, h / 2, cz, c, { mat: 'vf' }); b.box(w, 0.4, d + 0.2, cx, h + 0.2, cz, shade(c, 0.6));
      const fz = z0 + face * 0.02; // janelas (escuras, com reflexo frio) e toldo da loja no rés-do-chão
      for (let y = 3.6; y < h - 1; y += 2.6) for (let k = 0; k < Math.floor(w / 2.2); k++) b.box(1.2, 1.3, 0.06, X + u + 1.1 + k * 2.2 + (w - Math.floor(w / 2.2) * 2.2) / 2, y, fz, 0x2a3644, { mat: 'm' });
      b.box(w - 1, 2.4, 0.06, cx, 1.3, fz, 0x1d2228, { mat: 'm' }); b.box(w - 0.6, 0.12, 1.3, cx, 2.75, z0 + face * 0.65, [0xc23a2e, 0x2a4a7a, 0x3a6a3a, 0xd8a03a][i % 4]);
      const [tx, bg, fg] = SIGNS[i % SIGNS.length];
      b.push(cx, 0, z0 + face * 0.08, face > 0 ? 0 : Math.PI); T.hsign(0, 3.4, 0, tx, bg, fg, Math.min(w - 1.5, 3.4), 0.8); b.pop();
      if (i % 2 === 0) T.vsign(X + u + 0.8, 4.2, z0 + face * 0.5, SIGNS[(i + 3) % SIGNS.length][0], SIGNS[(i + 3) % SIGNS.length][1], SIGNS[(i + 3) % SIGNS.length][2], Math.PI / 2, 0.7, 3.0);
      for (let k = 0; k < 2; k++) lantern(X + u + 1 + k * (w - 2), 2.4, z0 + face * 0.4);
      u += w; i++; }
  };
  row(Z - HD, 1); row(Z + HD, -1);
  // muros de templo a oeste e a este (atrás das zonas de partida), com telhado de telha
  for (const s of [-1, 1]) { const x = X + s * (HW + 0.5); b.box(1, 3.4, HD * 2, x, 1.7, Z, 0xe8e2d4); b.box(1.6, 0.35, HD * 2, x, 3.55, Z, 0x2c3038); b.box(1.1, 0.4, HD * 2, x, 0.2, Z, STONE); }

  const hsignJP = (x, y, z, t) => { b.push(x, 0, z + 0.14, 0); T.hsign(0, y, 0, t, 0x1d1d1d, 0xf6c86a, 2.6, 0.6); b.pop(); };
  // ---------- cada lado (espelhado): zona de partida, viela norte, plataformas do parque, coberturas
  const torii = (x, z, s = 1, ry = 0) => { b.push(x, 0, z, ry); for (const sx of [-1, 1]) { b.cyl(0.17 * s, 0.21 * s, 4.1 * s, 12, sx * 1.6 * s, 2.05 * s, 0, VERM); b.cyl(0.24 * s, 0.24 * s, 0.35 * s, 12, sx * 1.6 * s, 0.17 * s, 0, 0x1d1d1d); } b.box(4.6 * s, 0.3 * s, 0.42 * s, 0, 4.25 * s, 0, 0x1d1d1d); b.box(4.3 * s, 0.14 * s, 0.36 * s, 0, 4.05 * s, 0, VERM); b.box(3.9 * s, 0.22 * s, 0.28 * s, 0, 3.5 * s, 0, VERM); b.box(0.22 * s, 0.6 * s, 0.24 * s, 0, 3.78 * s, 0, VERM); b.pop(); for (const sx of [-1, 1]) circ(x + Math.cos(ry) * sx * 1.6 * s, z - Math.sin(ry) * sx * 1.6 * s, 0.24 * s); };
  const sakura = (x, z, s = 1) => { b.cyl(0.13 * s, 0.2 * s, 2.4 * s, 8, x, 1.2 * s, z, 0x5a3a2e, { mat: 'vf' }); b.cyl(0.07 * s, 0.09 * s, 1.4 * s, 6, x + 0.5 * s, 2.4 * s, z, 0x5a3a2e, { mat: 'vf', rz: -0.7 }); for (const [dx, dy, dz, r, c] of [[0, 3.1, 0, 1.5, 0xf2b8c8], [0.9, 3.5, 0.4, 1.1, 0xf6c8d6], [-0.8, 3.4, -0.3, 1.05, 0xeaa8bc], [0.1, 4.1, -0.1, 0.95, 0xf8d4de]]) b.ico(r * s, x + dx * s, dy * s, z + dz * s, c, { mat: 'vf', det: 1 }); for (let k = 0; k < 7; k++) { const a = k * 2.4, rr = 0.8 + (k % 3) * 0.6; b.box(0.5, 0.01, 0.5, x + Math.cos(a) * rr * s, 0.035, z + Math.sin(a) * rr * s, 0xf2b8c8, { ry: a }); } circ(x, z, 0.24 * s); };
  const stoneLantern = (x, z) => { b.box(0.5, 0.15, 0.5, x, 0.08, z, STONE); b.cyl(0.1, 0.12, 0.8, 8, x, 0.55, z, STONE); b.box(0.45, 0.35, 0.45, x, 1.1, z, STONE); b.box(0.28, 0.2, 0.3, x, 1.1, z, new THREE.Color(1.6, 1.1, 0.6), { mat: 'lit' }); b.cyl(0.02, 0.42, 0.25, 4, x, 1.42, z, STONE, { ry: Math.PI / 4 }); circ(x, z, 0.3); };
  // cobertura: caixa de madeira (1,1 m) ou pilha (2,2 m), sólida para tiros e passos
  const box = (x, z, w = 1.1, d = 1.1, h = 1.1, c = 0x8a6a42) => { b.box(w, h, d, x, h / 2, z, c, { mat: 'vf' }); b.box(w + 0.02, 0.08, d + 0.02, x, h - 0.2, z, shade(c, 0.7)); b.box(w + 0.02, 0.08, d + 0.02, x, 0.2, z, shade(c, 0.7)); rect(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 's', h); };
  const lowWall = (x0, z0, x1, z1, h = 1.15, c = 0xb8b2a6) => { b.box(x1 - x0, h, z1 - z0, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, c, { mat: 'vf' }); b.box(x1 - x0 + 0.06, 0.08, z1 - z0 + 0.06, (x0 + x1) / 2, h, (z0 + z1) / 2, shade(c, 0.75)); rect(x0, z0, x1, z1, 's', h); };
  const wall = (x0, z0, x1, z1, h = 3.2, c = 0xd2c8b6) => { b.box(x1 - x0, h, z1 - z0, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, c, { mat: 'vf' }); rect(x0, z0, x1, z1, 's', h); };
  // plataforma de madeira com rampa: chão a 1,3 m (W.steps), beiras sólidas, rampa em degraus finos
  const deck = (x0, z0, x1, z1, rampSide, y = 1.3) => {
    b.box(x1 - x0, y, z1 - z0, (x0 + x1) / 2, y / 2, (z0 + z1) / 2, 0x5a4030, { mat: 'vf' }); b.floor(x0, z0, x1, z1, y + 0.02, 0x8a6a48, 'v');
    for (let k = x0 + 0.6; k < x1; k += 0.6) b.box(0.03, 0.01, z1 - z0, k, y + 0.03, (z0 + z1) / 2, 0x5a4030);
    W.steps.push({ x0, z0, x1, z1, y });
    const e = 0.12; // beiras (parapeito baixo) em todos os lados menos o da rampa
    if (rampSide !== 'n') { rect(x0, z0 - e, x1, z0 + e, 's', y + 0.9); b.box(x1 - x0, 0.9, 0.1, (x0 + x1) / 2, y + 0.45, z0, WOOD); }
    if (rampSide !== 's') { rect(x0, z1 - e, x1, z1 + e, 's', y + 0.9); b.box(x1 - x0, 0.9, 0.1, (x0 + x1) / 2, y + 0.45, z1, WOOD); }
    if (rampSide !== 'w') { rect(x0 - e, z0, x0 + e, z1, 's', y + 0.9); b.box(0.1, 0.9, z1 - z0, x0, y + 0.45, (z0 + z1) / 2, WOOD); }
    if (rampSide !== 'e') { rect(x1 - e, z0, x1 + e, z1, 's', y + 0.9); b.box(0.1, 0.9, z1 - z0, x1, y + 0.45, (z0 + z1) / 2, WOOD); }
    // rampa: 4,2 m de comprido, degraus de 0,15 m (andas por ela sem saltar), com rampa visível por cima
    const L = 4.2, n = 9;
    for (let k = 0; k < n; k++) { const f0 = k / n, f1 = (k + 1) / n, yy = y * (k + 1) / (n + 1);
      if (rampSide === 'w') W.steps.push({ x0: x0 - L * (1 - f0), z0, x1: x0 - L * (1 - f1), z1, y: yy });
      if (rampSide === 'e') W.steps.push({ x0: x1 + L * (1 - f1), z0, x1: x1 + L * (1 - f0), z1, y: yy });
      if (rampSide === 's') W.steps.push({ x0, z0: z1 + L * (1 - f1), x1, z1: z1 + L * (1 - f0), y: yy });
      if (rampSide === 'n') W.steps.push({ x0, z0: z0 - L * (1 - f0), x1, z1: z0 - L * (1 - f1), y: yy }); }
    const ang = Math.atan2(y, L), len = Math.hypot(y, L), cx = rampSide === 'w' ? x0 - L / 2 : rampSide === 'e' ? x1 + L / 2 : (x0 + x1) / 2, cz = rampSide === 's' ? z1 + L / 2 : rampSide === 'n' ? z0 - L / 2 : (z0 + z1) / 2;
    if (rampSide === 'w' || rampSide === 'e') b.box(len, 0.12, z1 - z0, cx, y / 2, cz, 0x7a5a3a, { rz: rampSide === 'w' ? ang : -ang });
    else b.box(x1 - x0, 0.12, len, cx, y / 2, cz, 0x7a5a3a, { rx: rampSide === 's' ? ang : -ang });
  };
  for (const s of [-1, 1]) {
    const U = u => X + s * u, R = (u0, z0, u1, z1, fn) => fn(Math.min(U(u0), U(u1)), z0, Math.max(U(u0), U(u1)), z1);
    // zona de partida: torii, cerejeiras, lanternas e muros com 3 saídas (norte, meio, sul)
    torii(U(37.5), Z, 1.1, Math.PI / 2); for (const dz of [-7, 7]) sakura(U(44), Z + dz, 1.1); for (const dz of [-2.8, 2.8]) stoneLantern(U(38.5), Z + dz);
    b.floor(Math.min(U(36), U(47.5)), Z - 9, Math.max(U(36), U(47.5)), Z + 9, 0.035, s < 0 ? 0x8a4a42 : 0x42568a, 'tile'); mp(Math.min(U(36), U(47.5)), Z - 9, Math.max(U(36), U(47.5)), Z + 9, s < 0 ? '#b8544a' : '#4a6ab8');
    R(36, Z - 10, 36.6, Z - 4, (a, c, d, e) => wall(a, c, d, e, 3.2)); R(36, Z + 4, 36.6, Z + 10, (a, c, d, e) => wall(a, c, d, e, 3.2));
    R(36, Z - 10.6, 47.9, Z - 10, (a, c, d, e) => wall(a, c, d, e, 3.2)); R(36, Z + 10, 47.9, Z + 10.6, (a, c, d, e) => wall(a, c, d, e, 3.2));
    // a cor da equipa por cima da entrada
    b.push(U(36.3), 3.5, Z, s < 0 ? Math.PI / 2 : -Math.PI / 2); b.box(5, 0.6, 0.1, 0, 0, 0, s < 0 ? 0xc8321e : 0x2a5ac8); b.pop();
    // viela norte: fila de lojas baixas com janelas para a praça (peeks), máquinas de venda, caixas
    R(14, Z - 14, 30, Z - 10.4, (x0, z0, x1, z1) => shell(x0, z0, x1, z1, { name: 'Loja', wall: s < 0 ? 0xd8cfbd : 0xd2c6ae, floor: 0xb6ae9e, h: 3.0, roofC: 0x3b4048, mapc: '#6e665b', trim: 0x5a5a58,
      ops: { n: [{ at: U(18), w: 1.4, k: 'd' }, { at: U(25), w: 1.2, k: 'w' }], s: [{ at: U(17), w: 1.4, k: 'w' }, { at: U(22), w: 1.6, k: 'd' }, { at: U(27), w: 1.4, k: 'w' }], e: [{ at: Z - 12.2, w: 1.2, k: 'w' }], w: [{ at: Z - 12.2, w: 1.2, k: 'w' }] } }));
    vend(U(31.2), Z - 19, s < 0 ? Math.PI / 2 : -Math.PI / 2, 0xc23a2e); vend(U(31.2), Z - 17.9, s < 0 ? Math.PI / 2 : -Math.PI / 2, 0x2a5a9a);
    box(U(9), Z - 21); box(U(9), Z - 22.2); box(U(10.2), Z - 21.6, 1.1, 1.1, 2.2); box(U(20), Z - 24.5, 2.2, 1.1);
    lowWall(Math.min(U(4), U(6.5)), Z - 18.6, Math.max(U(4), U(6.5)), Z - 18);
    // praça: caixas e muretas de cobertura a caminho da casa
    box(U(16), Z - 4.5); box(U(16), Z + 4.5); box(U(17.1), Z - 4.5, 1.1, 1.1, 2.2); box(U(17.1), Z + 4.5, 1.1, 1.1, 2.2);
    lowWall(Math.min(U(11), U(11.6)), Z - 2.2, Math.max(U(11), U(11.6)), Z + 2.2);
    box(U(24), Z - 1.6, 2.4, 1.2, 1.2, 0x5a6a7a); box(U(24), Z + 1.6, 2.4, 1.2, 1.2, 0x5a6a7a);
    for (const dz of [-7.5, 7.5]) { lamp(U(20), Z + dz, s < 0 ? Math.PI / 2 : -Math.PI / 2); }
    // parque sul: plataforma com rampa (vê-se por cima das muretas), cerejeiras, bancos e caixas
    if (s < 0) deck(U(22), Z + 17, U(16), Z + 23, 'w'); else deck(U(16), Z + 17, U(22), Z + 23, 'e');
    for (const [u, v] of [[28, 15.5], [12, 26], [27, 27], [8, 16]]) sakura(U(u), Z + v, 1.05);
    bench(U(13), Z + 14.5, 0); box(U(6), Z + 21); box(U(6), Z + 22.1); lowWall(Math.min(U(30), U(32.5)), Z + 21, Math.max(U(30), U(32.5)), Z + 21.6);
    for (const v of [14, 28]) stoneLantern(U(33.5), Z + v);
  }
  // ---------- meio: casa de dois pisos (portas a oeste e a este, janelas em todos os lados, escada ao longo da parede norte)
  { const x0 = X - 6, x1 = X + 6, z0 = Z - 4.5, z1 = Z + 4.5;
    const stairs = [{ x0: X - 2.6, z0: z0 + 0.22, x1: X + 2.6, z1: z0 + 1.4, axis: 'x', dir: 1, lv: 0, open: 's' }];
    shell(x0, z0, x1, z1, { name: 'Casa do meio', wall: 0xe2dccf, floor: 0xb9aa7a, floorUp: 0xa8946a, roof: 'kawara', roofC: 0x3b4048, h: 3.0, mapc: '#6e665b', trim: 0x3a2a1c, doorC: 0x6a4a32, floors: 2, stairs,
      ops: { w: [{ at: Z + 2, w: 1.4, k: 'd' }, { at: Z - 2, w: 1.2, k: 'w' }], e: [{ at: Z + 2, w: 1.4, k: 'd' }, { at: Z - 2, w: 1.2, k: 'w' }], n: [{ at: X - 3.5, w: 1.2, k: 'w' }, { at: X + 3.5, w: 1.2, k: 'w' }], s: [{ at: X, w: 1.4, k: 'd' }, { at: X - 3.8, w: 1.2, k: 'w' }, { at: X + 3.8, w: 1.2, k: 'w' }] },
      opsUp: { w: [{ at: Z - 2, w: 1.2, k: 'w' }, { at: Z + 2, w: 1.2, k: 'w' }], e: [{ at: Z - 2, w: 1.2, k: 'w' }, { at: Z + 2, w: 1.2, k: 'w' }], n: [{ at: X - 4, w: 1.2, k: 'w' }, { at: X + 4, w: 1.2, k: 'w' }], s: [{ at: X - 3, w: 1.4, k: 'w' }, { at: X + 3, w: 1.4, k: 'w' }] } });
    // dentro: balcão e caixas para te esconderes
    box(X - 3.2, Z + 2.6, 1.1, 1.1, 1.1, 0x8a6a42); box(X + 3.2, Z + 2.6, 1.1, 1.1, 1.1, 0x8a6a42);
    lantern(X - 6.4, 2.6, Z + 3.4); lantern(X + 6.4, 2.6, Z + 3.4); }
  // noren e lanternas vermelhas penduradas ao longo da viela norte; cerejeira grande ao centro do parque
  for (let u = -24; u <= 24; u += 6) lantern(X + u, 3.4, Z - 24);
  // detalhes de Tóquio: postes com fios por cima da viela, bicicletas, bandeiras nobori, cortinas noren, passadeiras pintadas
  { const P = []; for (const u of [-30, -15, 0, 15, 30]) P.push(pole(X + u, Z - 26.2, 8)); for (let i = 0; i + 1 < P.length; i++) wires(P[i], P[i + 1]); }
  for (const s of [-1, 1]) { for (const [u, v, r] of [[26, -26.5, 0.1], [27.2, -26.6, -0.1], [3.5, -26.4, 0.05]]) bike(X + s * u, Z + v, r + (s < 0 ? 0 : Math.PI));
    const nob = (u, v, c, c2) => { const x = X + s * u, z = Z + v; b.cyl(0.03, 0.03, 3.4, 6, x, 1.7, z, 0xd8d8d0, { mat: 'm' }); b.box(0.02, 2.1, 0.55, x, 2.15, z + 0.3, c); b.box(0.025, 0.25, 0.56, x, 3.05, z + 0.3, c2); b.box(0.025, 2.1, 0.06, x, 2.15, z + 0.03, c2); };
    nob(29.5, 13.2, 0xc8321e, 0xf2f2ea); nob(31, 13.2, 0x2a5ac8, 0xf2f2ea); nob(9, 12.6, 0xe8b820, 0xc8321e); nob(30, -8.8, 0xc8321e, 0x1d1d1d);
    for (const v of [-26.8]) for (const u of [8, 20, 33]) { const x = X + s * u; for (let k = -1; k <= 1; k++) b.box(0.48, 1.0, 0.03, x + k * 0.5, 2.25, Z + v + 0.1, k === 0 ? 0xf2efe6 : 0x24324a); } // noren à porta das lojas
    for (let k = 0; k < 6; k++) b.box(0.45, 0.012, 3.2, X + s * (31 + k * 0.9), 0.04, Z, 0xf2f0ea); // passadeira à saída da zona de partida
    for (const [u, v] of [[33, -14], [33, 12.5]]) { b.cyl(0.32, 0.36, 0.55, 12, X + s * u, 0.3, Z + v, 0x6a6e72); b.ico(0.5, X + s * u, 0.85, Z + v, 0x4a7a3a, { mat: 'vf', det: 1 }); circ(X + s * u, Z + v, 0.38); } // vasos
  }
  hsignJP(X, 3.6, Z + 4.5, '中央の家');
  sakura(X, Z + 22, 1.5); circ(X, Z + 22, 0.4); lowWall(X - 1.6, Z + 16, X + 1.6, Z + 16.6);
  box(X - 0.55, Z - 20.5, 1.1, 1.1, 1.1); box(X + 0.55, Z - 20.5, 1.1, 1.1, 1.1);
}
