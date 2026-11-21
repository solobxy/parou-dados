// Bases: fundações, paredes, portas, janelas e tetos numa grelha de 3 m, em três materiais
// (madeira, pedra, metal), mais baús, fornalha, bancadas e camas. Só se constrói em terreno natural,
// longe da cidade, dos monumentos e das estradas.
import * as THREE from 'three';
import { ITEMS } from './items.js';
import { Grid, mkItem } from './bag.js';

export const CELL = 3, FH = 0.3, WH = 3.0; // lado da célula, altura da fundação, altura das paredes
export const TIERS = [
  { n: 'Madeira', hp: 250, col: 0x8a6a48 },
  { n: 'Pedra', hp: 600, col: 0x9a958c },
  { n: 'Metal', hp: 1200, col: 0x5f666b },
];
// custo de cada peça (nível 0) e de melhorar para pedra e metal
export const PIECES = {
  fund: { n: 'Fundação', cost: { madeira: 60 }, up: [{ pedraR: 150 }, { metalR: 90 }] },
  parede: { n: 'Parede', cost: { madeira: 60 }, up: [{ pedraR: 150 }, { metalR: 90 }] },
  porta: { n: 'Porta', cost: { madeira: 90 }, up: [{ pedraR: 150 }, { metalR: 120 }] },
  janela: { n: 'Janela', cost: { madeira: 60 }, up: [{ pedraR: 120 }, { metalR: 80 }] },
  teto: { n: 'Teto', cost: { madeira: 60 }, up: [{ pedraR: 150 }, { metalR: 90 }] },
};
export const MODES = ['fund', 'parede', 'porta', 'janela', 'teto'];
// objetos que se colocam (baús, fornalha, bancadas, camas)
export const DEPLOY = {
  bau: { n: 'Baú', slots: [6, 3], hp: 300, r: [0.95, 0.6], h: 0.7 },
  bauG: { n: 'Baú grande', slots: [6, 5], hp: 500, r: [1.4, 0.75], h: 0.9 },
  fornalha: { n: 'Fornalha', slots: [3, 2], hp: 500, r: [1.0, 1.0], h: 1.4 },
  bancada1: { n: 'Bancada (nível 1)', lvl: 1, hp: 400, r: [1.7, 0.85], h: 0.95 },
  bancada2: { n: 'Bancada (nível 2)', lvl: 2, hp: 600, r: [1.7, 0.85], h: 0.95 },
  bancada3: { n: 'Bancada (nível 3)', lvl: 3, hp: 900, r: [1.9, 0.9], h: 1.0 },
  cama: { n: 'Cama', bed: 1, hp: 200, r: [1.1, 2.1], h: 0.5 },
  saco: { n: 'Saco-cama', bed: 1, hp: 80, r: [0.85, 2.0], h: 0.15 },
};

const canvasTex = (base, draw) => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 256, 256); draw(x); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const R = Math.random;

export function makeBase({ scene, W, G, audio, addRect, removeRect, visDirty, inCity, toast }) {
  // texturas: tábuas, blocos de pedra e chapas com rebites
  const TX = [
    canvasTex('#8a6a48', x => { for (let i = 0; i < 8; i++) { x.fillStyle = `rgba(${60 + R() * 40},${40 + R() * 25},${20 + R() * 15},.35)`; x.fillRect(0, i * 32, 256, 30); x.fillStyle = 'rgba(30,18,8,.55)'; x.fillRect(0, i * 32 + 30, 256, 2); for (let k = 0; k < 14; k++) { x.fillStyle = `rgba(40,25,10,${0.06 + R() * 0.1})`; x.fillRect(R() * 256, i * 32 + R() * 30, 30 + R() * 80, 1); } x.fillStyle = 'rgba(40,40,40,.7)'; x.fillRect(8, i * 32 + 13, 3, 3); x.fillRect(245, i * 32 + 13, 3, 3); } }),
    canvasTex('#9a958c', x => { for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) { const off = r % 2 ? 32 : 0; x.fillStyle = `rgba(${130 + R() * 30},${125 + R() * 28},${115 + R() * 25},.55)`; x.fillRect(c * 64 + off - 62 + 64, r * 43 + 2, 60, 39); x.fillStyle = 'rgba(60,58,52,.6)'; x.fillRect(c * 64 + off, r * 43, 2, 43); } for (let r = 0; r < 6; r++) { x.fillStyle = 'rgba(60,58,52,.6)'; x.fillRect(0, r * 43, 256, 2); } for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(0,0,0,${R() * 0.08})`; x.fillRect(R() * 256, R() * 256, 2, 2); } }),
    canvasTex('#5f666b', x => { for (let c = 0; c < 2; c++) { x.fillStyle = `rgba(${80 + R() * 20},${86 + R() * 20},${92 + R() * 20},.4)`; x.fillRect(c * 128 + 2, 2, 124, 252); x.fillStyle = 'rgba(25,28,30,.7)'; x.fillRect(c * 128, 0, 2, 256); for (let k = 0; k < 9; k++) { x.fillStyle = 'rgba(30,32,34,.8)'; x.beginPath(); x.arc(c * 128 + 8, 10 + k * 30, 2.5, 0, 7); x.arc(c * 128 + 120, 10 + k * 30, 2.5, 0, 7); x.fill(); } } for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(120,70,40,${R() * 0.12})`; x.fillRect(R() * 256, R() * 256, 4 + R() * 10, 2 + R() * 6); } }),
  ];
  const MAT = TX.map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0.05 }));
  MAT[2].metalness = 0.45; MAT[2].roughness = 0.6;
  const DARK = new THREE.MeshStandardMaterial({ color: 0x23201c, roughness: 0.9 });
  const GHOST = [new THREE.MeshBasicMaterial({ color: 0x7fd38a, transparent: true, opacity: 0.38, depthWrite: false }), new THREE.MeshBasicMaterial({ color: 0xe0574a, transparent: true, opacity: 0.38, depthWrite: false })];
  const root = new THREE.Group(); scene.add(root);
  const pieces = new Map(); // chave → peça
  const deps = []; // objetos colocados
  // camas e sacos-cama: quando morres escolhes em qual renasces (cada um com o seu nome e uma espera entre usos, como no Rust)
  const BED_CD = { cama: 120e3, saco: 300e3 };
  const bedLabel = d => DEPLOY[d.k].n + ' · ' + d.name;

  const box = (w, h, d, x, y, z, mat, g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const uvScale = (m, w, h) => { const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 3, uv.getY(i) * h / 3); };
  // chaves: célula 'c:i:j' ; aresta horizontal (ao longo de x, na linha z = j*3) 'h:i:j' ; vertical (linha x = i*3) 'v:i:j'
  const cellKey = (i, j) => i + ':' + j;
  const edgeKey = (i, j, s) => s === 0 ? 'h:' + i + ':' + j : s === 2 ? 'h:' + i + ':' + (j + 1) : s === 3 ? 'v:' + i + ':' + j : 'v:' + (i + 1) + ':' + j;
  const edgeGeom = k => { const [t, a, b] = k.split(':'); const i = +a, j = +b; return t === 'h' ? { horiz: true, x0: i * CELL, x1: i * CELL + CELL, z: j * CELL, c: [[i, j - 1], [i, j]] } : { horiz: false, z0: j * CELL, z1: j * CELL + CELL, x: i * CELL, c: [[i - 1, j], [i, j]] }; };
  const hasFund = (i, j) => pieces.has('f:' + cellKey(i, j));

  // ---------- validação do terreno
  const groundOk = (x0, z0, x1, z1) => {
    if (inCity((x0 + x1) / 2, (z0 + z1) / 2)) return 'Na cidade não se constrói';
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) { if (W.paved(x, z)) return 'Só em terreno natural'; for (const r of W.roads) if (x > r.x0 - 4 && x < r.x1 + 4 && z > r.z0 - 4 && z < r.z1 + 4) return 'Muito perto da estrada'; }
    for (const zn of W.zones) if (Math.hypot((x0 + x1) / 2 - zn.x, (z0 + z1) / 2 - zn.z) < zn.r + 20) return 'Muito perto de ' + zn.name;
    for (const r of W.rects) if (!r.base && (r.lv || 0) === 0 && r.x0 < x1 && r.x1 > x0 && r.z0 < z1 && r.z1 > z0) return 'Há alguma coisa no caminho';
    for (const c of W.circles) if (c.on !== false && (c.lv || 0) === 0 && c.x + c.r > x0 && c.x - c.r < x1 && c.z + c.r > z0 && c.z - c.r < z1) return 'Árvore ou rocha no caminho';
    return null;
  };
  const MAPL = 3996;

  // ---------- peças
  const tierMat = t => MAT[t];
  const buildMesh = P => {
    if (P.g) { root.remove(P.g); P.g.traverse(o => o.geometry && o.geometry.dispose()); }
    const g = new THREE.Group(), m = tierMat(P.tier); P.g = g; root.add(g);
    if (P.t === 'fund') { const x0 = P.i * CELL, z0 = P.j * CELL; const b = box(CELL, FH, CELL, x0 + CELL / 2, FH / 2, z0 + CELL / 2, m, g); uvScale(b, CELL, FH); box(CELL - 0.06, 0.02, CELL - 0.06, x0 + CELL / 2, FH + 0.005, z0 + CELL / 2, m, g); }
    else if (P.t === 'teto') { const x0 = P.i * CELL, z0 = P.j * CELL; const b = box(CELL + 0.04, 0.2, CELL + 0.04, x0 + CELL / 2, FH + WH + 0.1, z0 + CELL / 2, m, g); uvScale(b, CELL, CELL); P.roof = g; }
    else {
      const E = edgeGeom(P.k), T = 0.22, y0 = FH, H = WH;
      const seg = (a0, a1, yb, yt) => { const L = a1 - a0, c = (a0 + a1) / 2, h = yt - yb; const b = E.horiz ? box(L, h, T, c, yb + h / 2, E.z, m, g) : box(T, h, L, E.x, yb + h / 2, c, m, g); uvScale(b, L, h); };
      const a0 = E.horiz ? E.x0 : E.z0, a1 = E.horiz ? E.x1 : E.z1;
      if (P.t === 'parede') seg(a0, a1, y0, y0 + H);
      else if (P.t === 'porta') { seg(a0, a0 + 0.95, y0, y0 + H); seg(a1 - 0.95, a1, y0, y0 + H); seg(a0 + 0.95, a1 - 0.95, y0 + 2.25, y0 + H); }
      else if (P.t === 'janela') { seg(a0, a0 + 0.9, y0, y0 + H); seg(a1 - 0.9, a1, y0, y0 + H); seg(a0 + 0.9, a1 - 0.9, y0, y0 + 1.0); seg(a0 + 0.9, a1 - 0.9, y0 + 2.1, y0 + H); const bars = 4; for (let k = 1; k <= bars; k++) { const c = a0 + 0.9 + (a1 - a0 - 1.8) * k / (bars + 1); if (E.horiz) box(0.04, 1.1, 0.04, c, y0 + 1.55, E.z, DARK, g); else box(0.04, 1.1, 0.04, E.x, y0 + 1.55, c, DARK, g); } }
    }
  };
  // colisões e linha de vista das peças (retângulos no mesmo sistema das paredes do mapa)
  const pieceRects = P => {
    for (const r of P.rects || []) removeRect(r); P.rects = [];
    if (P.t === 'fund') return;
    if (P.t === 'teto') return;
    const E = edgeGeom(P.k), T = 0.24, add = (a0, a1, k, h, yb, extra) => { const r = E.horiz ? { x0: a0, x1: a1, z0: E.z - T / 2, z1: E.z + T / 2 } : { x0: E.x - T / 2, x1: E.x + T / 2, z0: a0, z1: a1 }; Object.assign(r, { k, h, yb: yb || 0, lv: 0, base: P }, extra || {}); addRect(r); P.rects.push(r); return r; };
    const a0 = E.horiz ? E.x0 : E.z0, a1 = E.horiz ? E.x1 : E.z1, top = FH + WH;
    if (P.t === 'parede') add(a0, a1, 's', top);
    else if (P.t === 'porta') { add(a0, a0 + 0.95, 's', top); add(a1 - 0.95, a1, 's', top); add(a0 + 0.95, a1 - 0.95, 'g', top, FH + 2.25, { lintel: 1 }); }
    else if (P.t === 'janela') { add(a0, a0 + 0.9, 's', top); add(a1 - 0.9, a1, 's', top); add(a0 + 0.9, a1 - 0.9, 'g', top, 0, { win: 1, sill: FH + 1.0 }); }
  };
  // porta de verdade (abre, fecha, trava zombies e balas), integrada no sistema de portas do mapa
  const doorGeo = new THREE.BoxGeometry(1, 2.2, 0.06); doorGeo.translate(0.5, 1.1, 0);
  const mkDoor = P => {
    const E = edgeGeom(P.k), a0 = E.horiz ? E.x0 : E.z0, a1 = E.horiz ? E.x1 : E.z1, s0 = a0 + 0.95, s1 = a1 - 0.95, w = s1 - s0, fixed = E.horiz ? E.z : E.x;
    const D = { base: P, x: E.horiz ? (s0 + s1) / 2 : fixed, z: E.horiz ? fixed : (s0 + s1) / 2, horiz: E.horiz, inward: 1, lv: 0, C: null, col: 0, w, leaves: [], ro: [], t: 0, target: 0, auto: false };
    D.rc = { x0: E.horiz ? s0 : fixed - 0.1, z0: E.horiz ? fixed - 0.1 : s0, x1: E.horiz ? s1 : fixed + 0.1, z1: E.horiz ? fixed + 0.1 : s1, k: 's', h: FH + 2.25, lv: 0, door: D, base: P };
    addRect(D.rc); W.doors.push(D);
    const leaf = new THREE.Mesh(doorGeo, MAT[Math.min(2, P.dtier ?? P.tier)]); leaf.castShadow = leaf.receiveShadow = true; leaf.scale.x = w;
    leaf.position.set(E.horiz ? s0 : fixed, FH, E.horiz ? fixed : s0); leaf.userData.a0 = E.horiz ? 0 : -Math.PI / 2; root.add(leaf); D.mesh = leaf; P.door = D;
  };
  const rmDoor = P => { const D = P.door; if (!D) return; removeRect(D.rc); const i = W.doors.indexOf(D); if (i >= 0) W.doors.splice(i, 1); root.remove(D.mesh); P.door = null; };
  const addStep = P => { P.step = { x0: P.i * CELL, z0: P.j * CELL, x1: P.i * CELL + CELL, z1: P.j * CELL + CELL, y: FH + 0.02, base: P }; W.steps.push(P.step); };
  const add = (t, key, o) => {
    const P = { t, k: key, tier: 0, hp: TIERS[0].hp, ...o }; pieces.set(key, P); buildMesh(P); pieceRects(P);
    if (t === 'fund') addStep(P); if (t === 'porta') mkDoor(P);
    visDirty(); return P;
  };
  const remove = P => { pieces.delete(P.k); if (P.g) root.remove(P.g); for (const r of P.rects || []) removeRect(r); rmDoor(P); if (P.step) { const i = W.steps.indexOf(P.step); if (i >= 0) W.steps.splice(i, 1); } visDirty(); };

  // ---------- custos
  const can = need => Object.entries(need).every(([k, n]) => G.inv.count(k) >= n);
  const pay = need => { for (const [k, n] of Object.entries(need)) G.inv.take(k, n); };
  const costTxt = need => Object.entries(need).map(([k, n]) => n + ' ' + ITEMS[k].s.toLowerCase()).join(' + ');

  // ---------- onde vai a peça (à frente da personagem)
  const front = (d = 2.4) => { const p = G.p; return [p.x + Math.sin(p.yaw) * d, p.z + Math.cos(p.yaw) * d]; };
  const target = mode => {
    const p = G.p; if ((p.lv || 0) !== 0) return { bad: 'Só no chão' };
    if (mode === 'fund') { const [fx, fz] = front(2.6); const i = Math.floor(fx / CELL), j = Math.floor(fz / CELL), x0 = i * CELL, z0 = j * CELL;
      if (hasFund(i, j)) return { bad: 'Já tem fundação', i, j, x0, z0 };
      if (Math.max(Math.abs(x0), Math.abs(z0), Math.abs(x0 + CELL), Math.abs(z0 + CELL)) > MAPL - 4) return { bad: 'Fora do mapa', i, j, x0, z0 };
      return { i, j, x0, z0, bad: groundOk(x0 + 0.05, z0 + 0.05, x0 + CELL - 0.05, z0 + CELL - 0.05) }; }
    if (mode === 'teto') { const [fx, fz] = front(1.2); const i = Math.floor(fx / CELL), j = Math.floor(fz / CELL), x0 = i * CELL, z0 = j * CELL;
      if (!hasFund(i, j)) return { bad: 'Precisa de fundação', i, j, x0, z0 }; if (pieces.has('t:' + cellKey(i, j))) return { bad: 'Já tem teto', i, j, x0, z0 };
      const walls = [0, 1, 2, 3].filter(s => pieces.has(edgeKey(i, j, s))).length; return { i, j, x0, z0, bad: walls < 2 ? 'Precisa de pelo menos 2 paredes' : null }; }
    // paredes: a aresta mais perto do ponto à frente, de uma célula com fundação
    const [fx, fz] = front(1.6); let best = null, bd = 2.2;
    for (let i = Math.floor(fx / CELL) - 1; i <= Math.floor(fx / CELL) + 1; i++) for (let j = Math.floor(fz / CELL) - 1; j <= Math.floor(fz / CELL) + 1; j++) { if (!hasFund(i, j)) continue;
      for (let s = 0; s < 4; s++) { const k = edgeKey(i, j, s), E = edgeGeom(k), mx = E.horiz ? (E.x0 + E.x1) / 2 : E.x, mz = E.horiz ? E.z : (E.z0 + E.z1) / 2, d = Math.hypot(mx - fx, mz - fz); if (d < bd) { bd = d; best = { k, E, mx, mz }; } } }
    if (!best) return { bad: 'Põe primeiro uma fundação' };
    if (pieces.has(best.k)) return { ...best, bad: 'Já tem ' + PIECES[pieces.get(best.k).t].n.toLowerCase() };
    const p2 = G.p, E = best.E, inLine = E.horiz ? Math.abs(p2.z - E.z) < 0.45 && p2.x > E.x0 - 0.3 && p2.x < E.x1 + 0.3 : Math.abs(p2.x - E.x) < 0.45 && p2.z > E.z0 - 0.3 && p2.z < E.z1 + 0.3;
    return { ...best, bad: inLine ? 'Estás no caminho' : null };
  };

  // ---------- fantasma (pré-visualização)
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), GHOST[0]); ghost.visible = false; ghost.renderOrder = 6; scene.add(ghost);
  const B = { mode: 'fund', tgt: null };
  const showGhost = (tg, mode) => {
    if (!tg || (tg.x0 === undefined && !tg.E)) { ghost.visible = false; return; }
    ghost.visible = true; ghost.material = GHOST[tg.bad || !can(PIECES[mode].cost) ? 1 : 0];
    if (mode === 'fund') { ghost.scale.set(CELL, FH, CELL); ghost.position.set(tg.x0 + CELL / 2, FH / 2, tg.z0 + CELL / 2); }
    else if (mode === 'teto') { ghost.scale.set(CELL, 0.2, CELL); ghost.position.set(tg.x0 + CELL / 2, FH + WH + 0.1, tg.z0 + CELL / 2); }
    else { const E = tg.E; ghost.scale.set(E.horiz ? CELL : 0.24, WH, E.horiz ? 0.24 : CELL); ghost.position.set(tg.mx, FH + WH / 2, tg.mz); }
  };
  // martelo: a peça para onde estás virado
  const aimPiece = () => { const [fx, fz] = front(1.4), p = G.p; let best = null, bd = 2.6;
    for (const P of pieces.values()) { let mx, mz; if (P.t === 'fund' || P.t === 'teto') { mx = P.i * CELL + CELL / 2; mz = P.j * CELL + CELL / 2; } else { const E = edgeGeom(P.k); mx = E.horiz ? (E.x0 + E.x1) / 2 : E.x; mz = E.horiz ? E.z : (E.z0 + E.z1) / 2; }
      let d = Math.hypot(mx - fx, mz - fz) + (P.t === 'fund' ? 0.9 : P.t === 'teto' ? 1.2 : 0); if (d < bd) { bd = d; best = P; } }
    return best; };
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xf2a33a, transparent: true, opacity: 0.22, depthWrite: false })); hl.visible = false; hl.renderOrder = 6; scene.add(hl);
  const showHl = P => { if (!P) { hl.visible = false; return; } hl.visible = true;
    if (P.t === 'fund') { hl.scale.set(CELL + 0.05, FH + 0.05, CELL + 0.05); hl.position.set(P.i * CELL + CELL / 2, FH / 2, P.j * CELL + CELL / 2); }
    else if (P.t === 'teto') { hl.scale.set(CELL + 0.05, 0.25, CELL + 0.05); hl.position.set(P.i * CELL + CELL / 2, FH + WH + 0.1, P.j * CELL + CELL / 2); }
    else { const E = edgeGeom(P.k); hl.scale.set(E.horiz ? CELL + 0.05 : 0.3, WH + 0.05, E.horiz ? 0.3 : CELL + 0.05); hl.position.set(E.horiz ? (E.x0 + E.x1) / 2 : E.x, FH + WH / 2, E.horiz ? E.z : (E.z0 + E.z1) / 2); } };

  // ---------- objetos colocados
  const depMesh = (k, tier) => {
    const g = new THREE.Group(), W0 = MAT[0], ST = MAT[1], MT = MAT[2];
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, metalness: 0.5, roughness: 0.6 });
    if (k === 'bau' || k === 'bauG') { const s = k === 'bauG' ? 1.4 : 1; box(0.9 * s, 0.5 * s, 0.55 * s, 0, 0.25 * s, 0, W0, g); box(0.92 * s, 0.14 * s, 0.57 * s, 0, 0.55 * s, 0, W0, g); for (const x of [-0.3, 0.3]) box(0.05, 0.66 * s, 0.58 * s, x * s, 0.33 * s, 0, iron, g); box(0.08, 0.1, 0.03, 0, 0.45 * s, 0.29 * s, iron, g); }
    else if (k === 'fornalha') { box(0.95, 1.1, 0.95, 0, 0.55, 0, ST, g); box(0.7, 0.35, 0.7, 0, 1.27, 0, ST, g); box(0.24, 0.5, 0.24, 0, 1.6, 0, iron, g); const mouth = box(0.5, 0.34, 0.05, 0, 0.42, 0.48, new THREE.MeshStandardMaterial({ color: 0x120b08, emissive: 0xff6a1a, emissiveIntensity: 0 }), g); g.userData.mouth = mouth; }
    else if (k.startsWith('bancada')) { const lv = +k.slice(-1); box(1.6, 0.08, 0.8, 0, 0.9, 0, lv >= 3 ? MT : W0, g); for (const [x, z] of [[-0.72, -0.32], [0.72, -0.32], [-0.72, 0.32], [0.72, 0.32]]) box(0.08, 0.9, 0.08, x, 0.45, z, lv >= 2 ? iron : W0, g); box(1.5, 0.05, 0.7, 0, 0.3, 0, W0, g); box(0.3, 0.12, 0.2, -0.4, 0.99, 0, iron, g); if (lv >= 2) box(0.18, 0.3, 0.18, 0.55, 1.08, -0.15, iron, g); if (lv >= 3) { box(0.5, 0.25, 0.35, 0.3, 1.07, 0.1, MT, g); box(1.6, 0.6, 0.05, 0, 1.25, -0.42, MT, g); } }
    else if (k === 'cama') { box(1.0, 0.25, 2.0, 0, 0.2, 0, W0, g); box(0.92, 0.14, 1.9, 0, 0.38, 0, new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 1 }), g); box(0.6, 0.1, 0.35, 0, 0.5, -0.72, new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 1 }), g); box(0.94, 0.06, 1.1, 0, 0.47, 0.35, new THREE.MeshStandardMaterial({ color: 0x5a6a4a, roughness: 1 }), g); }
    else if (k === 'saco') { box(0.8, 0.1, 1.85, 0, 0.05, 0, new THREE.MeshStandardMaterial({ color: 0x4f6a3a, roughness: 1 }), g); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.8, 12), new THREE.MeshStandardMaterial({ color: 0x5a7544, roughness: 1 })); r.rotation.z = Math.PI / 2; r.position.set(0, 0.14, -0.85); r.castShadow = true; g.add(r); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  };
  const placeDep = (k, x, z, yaw, o = {}) => {
    const D = DEPLOY[k], y = o.y ?? 0;
    const d = { k, x, z, yaw, y, hp: o.hp ?? D.hp, g: depMesh(k), on: !!o.on, burn: o.burn || 0 };
    if (D.bed) { d.name = o.name || DEPLOY[k].n + ' ' + (deps.filter(e => e.k === k).length + 1); d.cd = o.cd || 0; }
    d.g.position.set(x, y, z); d.g.rotation.y = yaw; root.add(d.g);
    const [w, l] = D.r, c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), hw = (w * c + l * s) / 2, hl2 = (w * s + l * c) / 2;
    if (D.h > 0.3) { d.rc = { x0: x - hw, x1: x + hw, z0: z - hl2, z1: z + hl2, k: 's', h: y + D.h, lv: 0, base: d, dep: 1 }; addRect(d.rc); }
    if (D.slots) { d.c = { id: 'b' + Math.random().toString(36).slice(2, 8), x, z, y: y + 0.6, lv: 0, own: true, dep: d, label: (k === 'fornalha' ? 'Abrir ' : 'Abrir ') + D.n.toLowerCase(), slots: D.slots, grid: o.grid || new Grid(D.slots[0], D.slots[1]) }; W.containers.push(d.c); }
    else if (D.lvl) { d.c = { id: 'b' + Math.random().toString(36).slice(2, 8), x, z, y: y + 0.9, lv: 0, own: true, dep: d, bench: D.lvl, label: 'Usar ' + D.n.toLowerCase(), slots: [0, 0], grid: null }; W.containers.push(d.c); }
    else if (D.bed) { d.c = { id: 'b' + Math.random().toString(36).slice(2, 8), x, z, y: y + 0.3, lv: 0, own: true, dep: d, bed: 1, label: bedLabel(d), slots: [0, 0], grid: null }; W.containers.push(d.c); }
    deps.push(d); visDirty(); return d;
  };
  const removeDep = d => { const i = deps.indexOf(d); if (i >= 0) deps.splice(i, 1); root.remove(d.g); if (d.rc) removeRect(d.rc); if (d.c) { const j = W.containers.indexOf(d.c); if (j >= 0) W.containers.splice(j, 1); } visDirty(); };

  // ---------- API
  const Base = {
    B, pieces, deps,
    // camas: lista, renascer (com espera), mudar o nome, apanhar e remover
    beds() { return deps.filter(d => DEPLOY[d.k].bed); },
    bedReady(d) { return Math.max(0, (d.cd || 0) - Date.now()); },
    respawnAt(d) { if (!d || !deps.includes(d) || (d.cd || 0) > Date.now()) return null; d.cd = Date.now() + BED_CD[d.k]; G.save && G.save(); return [d.x + Math.cos(d.yaw) * 0.9, d.z - Math.sin(d.yaw) * 0.9, d.y]; },
    renameBed(d, name) { name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 24); if (!name) return false; d.name = name; if (d.c) d.c.label = bedLabel(d); G.save && G.save(); return true; },
    pickBed(d) { if (!deps.includes(d)) return false; const ik = Object.keys(ITEMS).find(k => ITEMS[k].deploy === d.k); removeDep(d); if (ik) { const it = mkItem(ik, 1); const left = G.inv.give(it); if (left) G.dropItem(it); } audio.play('apanhar'); G.save && G.save(); return true; },
    removeBed(d) { if (!deps.includes(d)) return false; removeDep(d); G.save && G.save(); return true; },
    modes: MODES, costOf: m => PIECES[m].cost, costTxt, can,
    setMode(m) { if (PIECES[m]) B.mode = m; },
    // chamado em cada imagem: mostra o fantasma ou o realce conforme o que tens na mão
    frame() {
      const p = G.p, it = G.inv && G.inv.belt[G.sel];
      const k = p && p.alive && G.playing && !G.invOpen && it ? it.k : null;
      if (k === 'planta') { B.tgt = target(B.mode); showGhost(B.tgt, B.mode); showHl(null); B.hp = null; }
      else if (k === 'martelo') { ghost.visible = false; const P = aimPiece(); B.tgt = P; showHl(P); }
      else { ghost.visible = false; hl.visible = false; B.tgt = null; }
      // tetos: escondem-se quando estás em cima de uma fundação (dentro da base)
      const inside = p && (p.lv || 0) === 0 && hasFund(Math.floor(p.x / CELL), Math.floor(p.z / CELL)) && !G.fp;
      for (const P of pieces.values()) if (P.t === 'teto' && P.g) P.g.visible = !inside;
      for (const P of pieces.values()) if (P.door) { const D = P.door, e = D.t * D.t * (3 - 2 * D.t); D.mesh.rotation.y = D.mesh.userData.a0 + e * Math.PI / 2 * 0.95; }
      return k;
    },
    // pôr a peça escolhida
    place() {
      const m = B.mode, tg = target(m), P0 = PIECES[m];
      if (tg.bad) { toast(tg.bad); return false; }
      if (!can(P0.cost)) { toast('Precisas de ' + costTxt(P0.cost)); return false; }
      pay(P0.cost);
      if (m === 'fund') add('fund', 'f:' + cellKey(tg.i, tg.j), { i: tg.i, j: tg.j });
      else if (m === 'teto') add('teto', 't:' + cellKey(tg.i, tg.j), { i: tg.i, j: tg.j });
      else add(m, tg.k, {});
      audio.play('construir'); G.buzz && G.buzz(12); G.save && G.save(); return true;
    },
    // martelo: melhorar a peça (madeira → pedra → metal)
    upgrade() {
      const P = aimPiece(); if (!P) { toast('Vira-te para uma peça da tua base'); return false; }
      if (P.tier >= 2) { toast(PIECES[P.t].n + ' já é de metal'); return false; }
      const need = PIECES[P.t].up[P.tier]; if (!can(need)) { toast('Para ' + TIERS[P.tier + 1].n.toLowerCase() + ': ' + costTxt(need)); return false; }
      pay(need); P.tier++; P.hp = TIERS[P.tier].hp; buildMesh(P); if (P.door) { P.door.mesh.material = MAT[P.tier]; }
      audio.play('construir'); G.buzz && G.buzz(16); toast(PIECES[P.t].n + ' de ' + TIERS[P.tier].n.toLowerCase()); G.save && G.save(); return true;
    },
    upgradeInfo() { const P = aimPiece(); if (!P) return null; return { n: PIECES[P.t].n, tier: TIERS[P.tier].n, hp: Math.round(P.hp), max: TIERS[P.tier].hp, next: P.tier < 2 ? TIERS[P.tier + 1].n : null, need: P.tier < 2 ? costTxt(PIECES[P.t].up[P.tier]) : null }; },
    // demolir com o martelo: devolve metade do custo de madeira
    demolish() { const P = aimPiece(); if (!P) return false;
      if (P.t === 'fund') { const i = P.i, j = P.j; for (let s = 0; s < 4; s++) { const k = edgeKey(i, j, s), Q = pieces.get(k); if (!Q) continue; const E = edgeGeom(k), other = E.c.find(([a, b]) => !(a === i && b === j)); if (!hasFund(other[0], other[1])) remove(Q); } const T = pieces.get('t:' + cellKey(i, j)); if (T) remove(T); }
      remove(P); for (const [k, n] of Object.entries(PIECES[P.t].cost)) { const it = mkItem(k, Math.floor(n / 2)); const left = G.inv.give(it); if (left) { it.n = left; G.dropItem(it); } }
      audio.play('partir'); G.save && G.save(); return true; },
    // colocar um baú, fornalha, bancada ou cama à tua frente
    deploy(it) { if (!it || !ITEMS[it.k] || !ITEMS[it.k].deploy) return false; const k = ITEMS[it.k].deploy, D = DEPLOY[k], p = G.p; if ((p.lv || 0) !== 0) { toast('Só no chão'); return false; }
      const yaw = Math.round((p.yaw + Math.PI) / (Math.PI / 2)) * (Math.PI / 2), [w, l] = D.r, c = Math.abs(Math.cos(yaw)), s2 = Math.abs(Math.sin(yaw)), hw = (w * c + l * s2) / 2 + 0.04, hl2 = (w * s2 + l * c) / 2 + 0.04;
      let why = 'Não há espaço aqui';
      const cands = []; for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) for (const dist of [1.3, 1.0, 1.7, 0.8, 2.1]) cands.push([p.yaw + da, dist]);
      for (const [ang, dist] of cands) {
        const x = p.x + Math.sin(ang) * dist, z = p.z + Math.cos(ang) * dist, onF = hasFund(Math.floor(x / CELL), Math.floor(z / CELL)), y = onF ? FH : 0;
        if (inCity(x, z)) { why = 'Na cidade não'; continue; }
        let zn0 = null; for (const zn of W.zones) if (Math.hypot(x - zn.x, z - zn.z) < zn.r + 10) zn0 = zn; if (zn0) { why = 'Muito perto de ' + zn0.name; continue; }
        if (!onF && W.paved(x, z)) { why = 'Só em terreno natural'; continue; }
        if (Math.hypot(x - p.x, z - p.z) < 0.3) continue;
        let hit = false; for (const r of W.rects) if ((r.lv || 0) === 0 && !r.off && r.k !== 'l' && r.x0 < x + hw && r.x1 > x - hw && r.z0 < z + hl2 && r.z1 > z - hl2 && r.h > (onF ? FH + 0.1 : 0.4)) { hit = true; break; } if (hit) continue;
        for (const q of W.circles) if (q.on !== false && (q.lv || 0) === 0 && q.x + q.r > x - hw && q.x - q.r < x + hw && q.z + q.r > z - hl2 && q.z - q.r < z + hl2) { hit = true; break; } if (hit) continue;
        // não pode ficar por cima de ti
        if (Math.abs(p.x - x) < hw + 0.15 && Math.abs(p.z - z) < hl2 + 0.15) continue;
        const d = placeDep(k, x, z, yaw, { y }); if (D.bed) toast(d.name + ': quando morreres, podes renascer aqui'); audio.play('construir'); G.save && G.save(); return true;
      }
      toast(why); return false; },
    // interagir com o que foi colocado
    use(c) { const d = c.dep; if (c.bed) { G.ui.bedMenu(d); return true; } return false; },
    // bancada mais alta a menos de 4 m
    benchNear() { const p = G.p; let lv = 0; if (!p) return 0; for (const d of deps) { const D = DEPLOY[d.k]; if (D.lvl && Math.hypot(d.x - p.x, d.z - p.z) < 4 && (p.lv || 0) === 0) lv = Math.max(lv, D.lvl); } return lv; },
    // fornalha: com madeira acesa, cada 2,5 s queima 1 de madeira (dá carvão) e refina 1 de minério de metal
    tick(dt) { for (const d of deps) { if (d.k !== 'fornalha' || !d.c) continue; const g = d.c.grid, mouth = d.g.userData.mouth;
      if (d.on && g.count('madeira') <= 0) { d.on = false; }
      if (mouth) mouth.material.emissiveIntensity = d.on ? 1.6 + Math.sin(G.t * 9) * 0.3 : 0;
      if (!d.on) continue; d.burn += dt; while (d.burn >= 2.5) { d.burn -= 2.5; g.take('madeira', 1); const out = [['carvao', 1]]; if (g.count('metal') > 0) { g.take('metal', 1); out.push(['metalR', 1]); }
        for (const [k, n] of out) { const it = mkItem(k, n); const left = g.insert(it); if (left) { d.on = false; toast('A fornalha está cheia'); } } if (g.count('madeira') <= 0) { d.on = false; } } } },
    toggleFurnace(c) { const d = c.dep; if (!d || d.k !== 'fornalha') return; if (!d.on && c.grid.count('madeira') <= 0) { toast('Põe madeira na fornalha'); return; } d.on = !d.on; audio.play(d.on ? 'fogo' : 'ui'); },
    // dano (explosivos): a peça perde vida e cai quando chega a zero
    damage(x, z, r, dmg) { let n = 0; for (const P of [...pieces.values()]) { let mx, mz; if (P.t === 'fund' || P.t === 'teto') { mx = P.i * CELL + CELL / 2; mz = P.j * CELL + CELL / 2; } else { const E = edgeGeom(P.k); mx = E.horiz ? (E.x0 + E.x1) / 2 : E.x; mz = E.horiz ? E.z : (E.z0 + E.z1) / 2; }
        const d = Math.hypot(mx - x, mz - z) - (P.t === 'fund' || P.t === 'teto' ? 1.2 : 0.9); if (d > r) continue; const f = d <= 0 ? 1 : (1 - d / r) * (1 - d / r); P.hp -= dmg * f * (P.t === 'fund' ? 0.5 : 1); n++; if (P.hp <= 0) remove(P); }
      for (const d of [...deps]) { const dd = Math.hypot(d.x - x, d.z - z); if (dd > r) continue; d.hp -= dmg * (1 - dd / r); if (d.hp <= 0) { if (d.c && d.c.grid && !d.c.grid.empty) G.dropGrid && G.dropGrid(d.x, d.z, d.c.grid); removeDep(d); } } return n; },
    // debaixo de um teto: a área coberta (tetos ligados) para a chuva não cair lá dentro
    roofBox(x, z) { const i0 = Math.floor(x / CELL), j0 = Math.floor(z / CELL); if (!pieces.has('t:' + cellKey(i0, j0))) return null; let a = i0, b = j0, c = i0, d = j0; const seen = new Set([cellKey(i0, j0)]), q = [[i0, j0]];
      while (q.length && seen.size < 60) { const [i, j] = q.pop(); a = Math.min(a, i); b = Math.min(b, j); c = Math.max(c, i); d = Math.max(d, j); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = cellKey(i + di, j + dj); if (!seen.has(k) && pieces.has('t:' + k)) { seen.add(k); q.push([i + di, j + dj]); } } }
      return [a * CELL, b * CELL, (c + 1) * CELL, (d + 1) * CELL]; },
    pieceAt(x, z, r) { for (const P of pieces.values()) for (const q of P.rects || []) if (x > q.x0 - r && x < q.x1 + r && z > q.z0 - r && z < q.z1 + r) return P; return null; },
    // gravar e repor
    save(encG) { return { p: [...pieces.values()].map(P => [P.t, P.k, P.i ?? null, P.j ?? null, P.tier, Math.round(P.hp), P.door ? P.door.target : 0]), d: deps.map(d => [d.k, +d.x.toFixed(2), +d.z.toFixed(2), +d.yaw.toFixed(3), d.y, Math.round(d.hp), d.c && d.c.grid ? encG(d.c.grid) : null, d.on ? 1 : 0, 0, d.name || null, d.cd || 0]) }; },
    load(s, decG) { Base.clear(); if (!s) return;
      for (const [t, k, i, j, tier, hp, open] of s.p || []) { const P = add(t, k, t === 'fund' || t === 'teto' ? { i, j } : {}); P.tier = tier; P.hp = hp; buildMesh(P); if (P.door) { P.door.mesh.material = MAT[P.tier]; P.door.t = P.door.target = open ? 1 : 0; } }
      for (const [k, x, z, yaw, y, hp, gl, on, sp, name, cd] of s.d || []) { const D = DEPLOY[k]; if (!D) continue; const grid = gl && D.slots ? decG(gl, new Grid(D.slots[0], D.slots[1])) : null; placeDep(k, x, z, yaw, { y, hp, grid, on, name, cd }); } },
    clear() { for (const P of [...pieces.values()]) remove(P); for (const d of [...deps]) removeDep(d); },
  };
  return Base;
}
