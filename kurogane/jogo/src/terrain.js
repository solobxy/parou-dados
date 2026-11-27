// Relevo do chão: colinas no campo e nas florestas; cidades, estradas, água e construções ficam planas (com rampas suaves à volta).
// Feito igual no jogo e no servidor (só depende do mapa: zonas, estradas, água e o que está construído fora das zonas).
// Grelha de N×N alturas sobre o mapa todo; entre pontos, interpolação bilinear (o chão desenhado usa a mesma grelha).
export const T_N = 1024, T_EXT = 4100, T_CELL = (2 * T_EXT) / (T_N - 1);
const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const vnoise = (x, z, s) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
const fbm = (x, z, s, o) => { let t = 0, a = 0.5, f = 1, n = 0; for (let k = 0; k < o; k++) { t += a * vnoise(x * f, z * f, s + k * 17); n += a; a *= 0.5; f *= 2.03; } return t / n; };
// distância (em células) ao plano mais perto: duas passagens (chanfro 3-4), rápido
const dist = (F, N) => { const D = new Float32Array(N * N); for (let i = 0; i < N * N; i++) D[i] = F[i] ? 0 : 1e9;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; let d = D[k]; if (!d) continue;
    if (i > 0) d = Math.min(d, D[k - 1] + 1); if (j > 0) { d = Math.min(d, D[k - N] + 1); if (i > 0) d = Math.min(d, D[k - N - 1] + 1.414); if (i < N - 1) d = Math.min(d, D[k - N + 1] + 1.414); } D[k] = d; }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) { const k = j * N + i; let d = D[k]; if (!d) continue;
    if (i < N - 1) d = Math.min(d, D[k + 1] + 1); if (j < N - 1) { d = Math.min(d, D[k + N] + 1); if (i < N - 1) d = Math.min(d, D[k + N + 1] + 1.414); if (i > 0) d = Math.min(d, D[k + N - 1] + 1.414); } D[k] = d; }
  return D; };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// M: { zones: [[x, z, r, kind]], roads: [[x0, z0, x1, z1]], lakes: [[x, z, rx, rz]], rivers: [[[x, z, w], ...]], rects: [[x0, z0, x1, z1]] }
export function makeTerrain(M) {
  const N = T_N, C = T_CELL, gi = x => (x + T_EXT) / C;
  // três tipos de plano, cada um com a sua rampa: grandes (zonas, água), estradas, construções soltas
  const FB = new Uint8Array(N * N), FR = new Uint8Array(N * N), FS = new Uint8Array(N * N);
  const disc = (F, x, z, r) => { const i0 = Math.max(0, Math.floor(gi(x - r))), i1 = Math.min(N - 1, Math.ceil(gi(x + r))), j0 = Math.max(0, Math.floor(gi(z - r))), j1 = Math.min(N - 1, Math.ceil(gi(z + r)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const px = -T_EXT + i * C, pz = -T_EXT + j * C; if ((px - x) ** 2 + (pz - z) ** 2 <= r * r) F[j * N + i] = 1; } };
  const rect = (F, x0, z0, x1, z1, m) => { const i0 = Math.max(0, Math.floor(gi(Math.min(x0, x1) - m))), i1 = Math.min(N - 1, Math.ceil(gi(Math.max(x0, x1) + m))), j0 = Math.max(0, Math.floor(gi(Math.min(z0, z1) - m))), j1 = Math.min(N - 1, Math.ceil(gi(Math.max(z0, z1) + m)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) F[j * N + i] = 1; };
  const Z = M.zones || [];
  for (const z of Z) disc(FB, z[0], z[1], z[2] + 18);
  for (const L of M.lakes || []) disc(FB, L[0], L[1], Math.max(L[2], L[3]) * 1.2 + 22);
  for (const R of M.rivers || []) for (const q of R) disc(FB, q[0], q[1], (q[2] || 8) + 14);
  for (const r of M.roads || []) rect(FR, r[0], r[1], r[2], r[3], 4);
  const inZone = (x, z) => { for (const q of Z) if ((x - q[0]) ** 2 + (z - q[1]) ** 2 < (q[2] + 4) ** 2) return true; return false; };
  for (const r of M.rects || []) { const cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2; if (!inZone(cx, cz)) rect(FS, r[0], r[1], r[2], r[3], 3); }
  const DB = dist(FB, N), DR = dist(FR, N), DS = dist(FS, N);
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i, x = -T_EXT + i * C, z = -T_EXT + j * C;
    const m = Math.min(sstep(0, 170 / C, DB[k]), sstep(0, 90 / C, DR[k]), sstep(0, 40 / C, DS[k])); if (m <= 0) continue;
    // mais montanhoso no norte (neve) e junto às bordas; mais suave perto do centro
    const rough = 0.55 + 0.45 * sstep(-800, -2600, z) + 0.25 * sstep(2600, 3900, Math.max(Math.abs(x), Math.abs(z))) + 0.25 * fbm(x / 1400, z / 1400, 3, 2);
    const big = fbm(x / 650, z / 650, 11, 3), mid = fbm(x / 170, z / 170, 23, 3), sm = fbm(x / 42, z / 42, 37, 2);
    const hills = Math.max(0, big - 0.38) * 34 * rough + Math.max(0, mid - 0.3) * 7 * (0.4 + rough) + sm * 0.9;
    H[k] = Math.min(28, hills) * m; }
  const at = (x, z) => { const fx = Math.max(0, Math.min(N - 1.001, gi(x))), fz = Math.max(0, Math.min(N - 1.001, gi(z))), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * N + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + N] * (1 - u) + H[k + N + 1] * u) * v; };
  // linha de vista: o chão tapa o segmento de A a B? (para tiros)
  const blocks = (ax, ay, az, bx, by, bz) => { const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 4); for (let s = 1; s < n; s++) { const t = s / n; if (at(ax + (bx - ax) * t, az + (bz - az) * t) > ay + (by - ay) * t + 0.15) return t; } return 0; };
  let sum = 0; for (let k = 0; k < N * N; k += 97) sum = (sum + Math.round(H[k] * 100)) % 1000000007;
  return { H, N, C, EXT: T_EXT, at, blocks, sum };
}
// o que o servidor tem em mapa.json (e o jogo tem em W) → entrada de makeTerrain
export const terrainInput = (zones, roads, water, rects, pads) => ({ zones, roads, lakes: (water && water.lakes) || [], rivers: (water && water.rivers) || [], rects: pads ? rects.concat(pads) : rects });
