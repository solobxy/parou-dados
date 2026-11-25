// Mundo de fora (à volta do mapa do centro): floresta, rochas, arbustos e erva gerados por setores de 100 m,
// sempre iguais para o mesmo sítio (semente fixa), carregados perto de ti e largados quando te afastas.
import * as THREE from 'three';

export const SECT = 100;
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return (h ^ (h >>> 16)) >>> 0; };
const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// ruído suave (valor) para manchas de floresta e clareiras
const vn = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, s = t => t * t * (3 - 2 * t); const h = (a, b) => hash(a, b) / 4294967296;
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1), u = s(xf), v = s(zf); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
export const forestDens = (x, z) => { const n = vn(x / 260, z / 260) * 0.6 + vn(x / 90 + 50, z / 90 - 30) * 0.3 + vn(x / 35 - 9, z / 35 + 4) * 0.1; return Math.max(0, Math.min(1, (n - 0.32) * 1.9)); };

export function makeSectors({ scene, W, nodes, addCirc, removeCirc, iMesh, geos, mats, CORE, MAP, near }) {
  const loaded = new Map(); let busy = false;
  const inCore = (x, z) => Math.max(Math.abs(x), Math.abs(z)) < CORE + 2;
  // sítios construídos longe do centro (vilas, monumentos, quintas): aí não nascem árvores, rochas nem arbustos
  const clr = new Map(); for (const L of W.lazy || []) for (let sx = Math.floor(L.x0 / SECT); sx <= Math.floor(L.x1 / SECT); sx++) for (let sz = Math.floor(L.z0 / SECT); sz <= Math.floor(L.z1 / SECT); sz++) { const k = sx * 1000 + sz; if (!clr.has(k)) clr.set(k, []); clr.get(k).push(L); }
  const cleared = (x, z, m) => { const l = clr.get(Math.floor(x / SECT) * 1000 + Math.floor(z / SECT)); if (l) for (const L of l) if (x > L.x0 - m && x < L.x1 + m && z > L.z0 - m && z < L.z1 + m) return true; return false; };
  const freeAt = (x, z, m) => {
    if (Math.abs(x) > MAP - 3 || Math.abs(z) > MAP - 3 || inCore(x, z)) return false;
    if (W.wet(x, z, m + 1.5)) return false; if (cleared(x, z, m)) return false;
    for (const r of W.roads) if (x > r.x0 - m - 2 && x < r.x1 + m + 2 && z > r.z0 - m - 2 && z < r.z1 + m + 2) return false;
    for (const zn of W.zones) if ((x - zn.x) ** 2 + (z - zn.z) ** 2 < (zn.r + m + 4) ** 2) return false;
    let hit = false; near(x - m - 1, z - m - 1, x + m + 1, z + m + 1, r => { if (!hit && (r.lv || 0) === 0 && x > r.x0 - m - 1 && x < r.x1 + m + 1 && z > r.z0 - m - 1 && z < r.z1 + m + 1) hit = true; }, () => { });
    return !hit;
  };
  const build = (sx, sz) => {
    const R = rng(hash(sx * 7 + 3, sz * 13 + 5)), x0 = sx * SECT, z0 = sz * SECT, S = { sx, sz, meshes: [], nodes: [], circs: [] };
    const pts = [], add = (x, z) => pts.push([x, z]), close = (x, z, d) => pts.some(p => (p[0] - x) ** 2 + (p[1] - z) ** 2 < d * d);
    // árvores: grelha com tremor (rápido e sem amontoados), densidade pela mancha de floresta
    const trees = [[], []];
    for (let gx = 0; gx < SECT; gx += 6) for (let gz = 0; gz < SECT; gz += 6) { const x = x0 + gx + R() * 5.2, z = z0 + gz + R() * 5.2, dn = forestDens(x, z); if (R() > dn * 0.85 + 0.03) continue; if (!freeAt(x, z, 1)) continue; if (close(x, z, 3.2)) continue; add(x, z); const t = { x, z, s: 0.85 + R() * 0.45, v: R() < 0.55 ? 0 : 1, ry: R() * 6.28 }; trees[t.v].push(t); }
    // rochas com minério
    const rocks = { stone: [], sulfur: [], metal: [] }; const nr = 2 + Math.floor(R() * 4);
    for (let i = 0; i < nr * 3 && rocks.stone.length + rocks.sulfur.length + rocks.metal.length < nr; i++) { const x = x0 + 4 + R() * (SECT - 8), z = z0 + 4 + R() * (SECT - 8); if (!freeAt(x, z, 2) || close(x, z, 5)) continue; add(x, z); const q = R(), kind = q < 0.55 ? 'stone' : q < 0.78 ? 'sulfur' : 'metal'; rocks[kind].push({ x, z, kind, s: 0.9 + R() * 0.35, ry: R() * 6.28 }); }
    // pedras soltas e plantas de fibra (apanham-se com um toque: pedra para bater; a planta dá tecido)
    const picks = { seixo: [], fibra: [] };
    for (let i = 0; i < 14; i++) { const x = x0 + 3 + R() * (SECT - 6), z = z0 + 3 + R() * (SECT - 6), kind = R() < 0.5 ? 'seixo' : 'fibra'; if (picks[kind].length >= 4 || !freeAt(x, z, 0.8) || close(x, z, 2) || W.wet(x, z, 0.5) || W.paved(x, z)) continue; add(x, z); picks[kind].push({ x, z, kind, s: 0.85 + R() * 0.4, ry: R() * 6.28 }); }
    // arbustos e erva
    const bushes = [], grass = [];
    for (let i = 0; i < 40; i++) { const x = x0 + R() * SECT, z = z0 + R() * SECT; if (!freeAt(x, z, 0.5) || close(x, z, 1.4)) continue; bushes.push({ x, z, s: 0.7 + R() * 0.6, ry: R() * 6.28 }); }
    for (let i = 0; i < 260; i++) { const x = x0 + R() * SECT, z = z0 + R() * SECT; if (inCore(x, z) || W.paved(x, z) || W.wet(x, z, 0.3)) continue; grass.push({ x, z, s: 0.7 + R() * 0.9, ry: R() * 6 }); }
    // malhas e colisões; as árvores e rochas são recursos (dá para cortar e partir)
    const mat4 = (x, y, z, ry, s) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
    trees.forEach((l, v) => { if (!l.length) return; for (const t of l) { t.kind = 'tree'; t.r = 0.32 * t.s; t.hp = t.max = Math.round(150 * t.s); t.alive = true; t.sec = S; nodes.push(t); S.nodes.push(t); t.col = { x: t.x, z: t.z, r: t.r, k: 's', on: true, node: t }; addCirc(t.col); S.circs.push(t.col); } S.meshes.push(...iMesh(v ? geos.broad : geos.cedar, mats.tree, l, t => mat4(t.x, 0, t.z, t.ry, t.s), true, SECT)); });
    for (const kind in rocks) { const l = rocks[kind]; if (!l.length) continue; for (const r of l) { r.r = 0.95 * r.s; r.hp = r.max = kind === 'stone' ? 220 : 130; r.alive = true; r.sec = S; nodes.push(r); S.nodes.push(r); r.col = { x: r.x, z: r.z, r: r.r * 0.85, k: 's', on: true, node: r }; addCirc(r.col); S.circs.push(r.col); } S.meshes.push(...iMesh(geos.rock[kind], mats.tree, l, r => mat4(r.x, 0, r.z, r.ry, r.s), true, SECT)); }
    for (const kind in picks) { const l = picks[kind]; if (!l.length || !geos[kind]) continue; for (const r of l) { r.r = 0.25; r.hp = r.max = 1; r.alive = true; r.pick = 1; r.sec = S; nodes.push(r); S.nodes.push(r); r.col = { on: true }; } S.meshes.push(...iMesh(geos[kind], mats.tree, l, r => mat4(r.x, 0, r.z, r.ry, r.s), false, SECT)); }
    if (bushes.length) S.meshes.push(...iMesh(geos.bush, mats.tree, bushes, b => mat4(b.x, 0, b.z, b.ry, b.s), true, SECT));
    if (grass.length) S.meshes.push(...iMesh(geos.grass, mats.grass, grass, g => mat4(g.x, 0, g.z, g.ry, g.s), false, SECT));
    S.trees = trees[0].concat(trees[1]); S.rocks = [...rocks.stone, ...rocks.sulfur, ...rocks.metal];
    S.nodes.forEach((n, i) => n.key = 's' + sx + ',' + sz + ':' + i); if (W.onSector) W.onSector(S); // chave igual em todos os aparelhos (online)
    return S;
  };
  const drop = S => { for (const m of S.meshes) { scene.remove(m); m.dispose && m.dispose(); } for (const c of S.circs) removeCirc(c); const set = new Set(S.nodes); for (let i = nodes.length - 1; i >= 0; i--) if (set.has(nodes[i])) nodes.splice(i, 1); };
  return {
    loaded,
    // em cada imagem: carrega no máximo um setor (o mais perto que falta) e larga os que ficaram longe
    tick(px, pz, rIn = 170, rOut = 260) {
      for (const [k, S] of loaded) { const cx = (S.sx + 0.5) * SECT, cz = (S.sz + 0.5) * SECT; if (Math.max(Math.abs(cx - px), Math.abs(cz - pz)) > rOut) { drop(S); loaded.delete(k); } }
      let best = null, bd = 1e9; const s0x = Math.floor((px - rIn) / SECT), s1x = Math.floor((px + rIn) / SECT), s0z = Math.floor((pz - rIn) / SECT), s1z = Math.floor((pz + rIn) / SECT);
      for (let sx = s0x; sx <= s1x; sx++) for (let sz = s0z; sz <= s1z; sz++) { const k = sx + ',' + sz; if (loaded.has(k)) continue; const x0 = sx * SECT, z0 = sz * SECT; if (Math.max(Math.abs(x0), Math.abs(x0 + SECT)) <= CORE && Math.max(Math.abs(z0), Math.abs(z0 + SECT)) <= CORE) { loaded.set(k, { sx, sz, meshes: [], nodes: [], circs: [], trees: [], rocks: [] }); continue; } if (Math.abs(x0) > MAP + SECT || Math.abs(z0) > MAP + SECT) continue; const d = Math.hypot(x0 + SECT / 2 - px, z0 + SECT / 2 - pz); if (d < bd) { bd = d; best = [sx, sz, k]; } }
      if (best) loaded.set(best[2], build(best[0], best[1]));
      return !!best;
    },
    // tudo à volta já carregado (para o arranque)
    fill(px, pz) { for (let i = 0; i < 40 && this.tick(px, pz); i++); },
    clear() { for (const S of loaded.values()) drop(S); loaded.clear(); },
    trees() { const out = []; for (const S of loaded.values()) out.push(...(S.trees || [])); return out; },
  };
}
