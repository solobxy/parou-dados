// Bots da arena: só entram para equilibrar as equipas (num 3 contra 1 entram 2 do lado que tem 1) e saem quando entra gente.
// Jogam como uma pessoa: só sabem o que veem (linha de vista, campo de visão, distância), o que ouvem (tiros) e o que o radar
// da equipa mostra a qualquer jogador. Demoram a reagir, a pontaria começa larga e vai afinando, disparam em rajadas,
// recarregam, procuram cobertura e curam-se. O nível acompanha o dos humanos da outra equipa (precisão e baixas/mortes)
// e ajusta-se ao resultado: se os bots matam demais ficam mais lentos, se morrem demais afinam, sempre com limites humanos.
import fs from 'node:fs';
import { ITEMS } from './jogo/src/items.js';
import { histPush } from './jogo/src/hitbox.js';

const AX = 3650, AZ = 3650, HW = 48, HD = 31, FH = 3.3;
const COL = (() => { try { return JSON.parse(fs.readFileSync(new URL('./arena-col.json', import.meta.url), 'utf8')); } catch (e) { return null; } })();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angD = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const pick = a => a[Math.floor(Math.random() * a.length)];

// ---------- geometria: caixas para a linha de vista (paredes de cada piso, muretas, caixas, janelas só até ao parapeito)
const BOX = [], CYL = [];
if (COL) {
  for (const [x0, z0, x1, z1, h, lv, , door] of COL.rects) { if (door) continue; const y0 = lv * FH; BOX.push([x0, z0, x1, z1, y0, y0 + (h >= 2.9 ? h + 0.32 : h)]); } // portas à parte (abrem e fecham)
  for (const [x, z, r] of COL.circ) CYL.push([x, z, r]);
}
// segmento A→B contra caixa (método das placas): devolve a fração t onde entra, ou 2 se não toca
const segBox = (ax, ay, az, dx, dy, dz, b) => {
  let t0 = 0, t1 = 1;
  const ax3 = [ax, ay, az], d3 = [dx, dy, dz], lo = [b[0], b[4], b[1]], hi = [b[2], b[5], b[3]];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d3[i]) < 1e-9) { if (ax3[i] < lo[i] || ax3[i] > hi[i]) return 2; continue; }
    let ta = (lo[i] - ax3[i]) / d3[i], tb = (hi[i] - ax3[i]) / d3[i]; if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return 2;
  }
  return t0;
};
// primeira coisa sólida entre A e B (fração 0..1), 1 se nada
// portas da arena: [id, x0, z0, x1, z1, aberta no mapa, piso]; começam todas fechadas (como o jogo as põe ao entrar) e o estado é o do servidor
export const DOORS = new Map((COL && COL.doors || []).map(d => [d[0], { id: d[0], x0: d[1], z0: d[2], x1: d[3], z1: d[4], o: 0, lv: d[6], b: [d[1], d[2], d[3], d[4], d[6] * FH, d[6] * FH + 2.3] }]));
export const rayFrac = (ax, ay, az, bx, by, bz) => {
  const dx = bx - ax, dy = by - ay, dz = bz - az; let best = 1;
  const mnx = Math.min(ax, bx), mxx = Math.max(ax, bx), mnz = Math.min(az, bz), mxz = Math.max(az, bz);
  for (const D of DOORS.values()) { if (D.o) continue; const b = D.b; if (b[2] < mnx || b[0] > mxx || b[3] < mnz || b[1] > mxz) continue; const t = segBox(ax, ay, az, dx, dy, dz, b); if (t < best) best = t; } // porta fechada tapa a vista e as balas
  for (const b of BOX) { if (b[2] < mnx || b[0] > mxx || b[3] < mnz || b[1] > mxz) continue; const t = segBox(ax, ay, az, dx, dy, dz, b); if (t < best) best = t; }
  const l2 = dx * dx + dz * dz || 1e-9;
  for (const [cx, cz, r] of CYL) { if (cx + r < mnx || cx - r > mxx || cz + r < mnz || cz - r > mxz) continue; const t = clamp(((cx - ax) * dx + (cz - az) * dz) / l2, 0, 1); if (ay + dy * t > 2.3) continue; if (Math.hypot(ax + dx * t - cx, az + dz * t - cz) < r && t < best) best = Math.max(0, t - 0.01); }
  return best;
};
export const los = (ax, ay, az, bx, by, bz) => rayFrac(ax, ay, az, bx, by, bz) > 0.995;

// ---------- grelha de caminhos (0,5 m): o que é parede, caixa, árvore ou plataforma fica bloqueado; portas fechadas também
const CS = 0.5, GX0 = AX - HW, GZ0 = AZ - HD, NX = Math.ceil(2 * HW / CS), NZ = Math.ceil(2 * HD / CS), RB = 0.42;
const blk = new Uint8Array(NX * NZ);
const cx_ = i => GX0 + (i + 0.5) * CS, cz_ = j => GZ0 + (j + 0.5) * CS;
const ci = x => Math.floor((x - GX0) / CS), cj = z => Math.floor((z - GZ0) / CS);
const markRect = (x0, z0, x1, z1, r) => { for (let i = Math.max(0, ci(x0 - r)); i <= Math.min(NX - 1, ci(x1 + r)); i++) for (let j = Math.max(0, cj(z0 - r)); j <= Math.min(NZ - 1, cj(z1 + r)); j++) { const x = cx_(i), z = cz_(j); if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) blk[i + j * NX] = 1; } };
if (COL) {
  for (const [x0, z0, x1, z1, , lv, , door] of COL.rects) if (!lv && !door) markRect(x0, z0, x1, z1, RB); // as portas não bloqueiam o caminho: o bot abre-as
  for (const [x, z, r] of COL.circ) markRect(x - r, z - r, x + r, z + r, RB);
  for (const [x0, z0, x1, z1, y] of COL.steps) if (y >= 0.2) markRect(x0, z0, x1, z1, RB);
}
for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) if (i < 2 || j < 2 || i >= NX - 2 || j >= NZ - 2) blk[i + j * NX] = 1;
const free = (x, z) => { const i = ci(x), j = cj(z); return i >= 0 && j >= 0 && i < NX && j < NZ && !blk[i + j * NX]; };
// zonas ligadas: só se escolhe destino onde se chega
const comp = new Int32Array(NX * NZ).fill(-1);
{ let id = 0; for (let s = 0; s < NX * NZ; s++) { if (blk[s] || comp[s] >= 0) continue; const Q = [s]; comp[s] = id; while (Q.length) { const c = Q.pop(), i = c % NX, j = (c / NX) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ) continue; const n = ii + jj * NX; if (!blk[n] && comp[n] < 0) { comp[n] = id; Q.push(n); } } } id++; } }
const MAIN = (() => { const s = ci(AX - 40) + cj(AZ) * NX; return comp[s]; })();
const walkLine = (ax, az, bx, bz) => { const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.2)); for (let k = 1; k <= n; k++) { const f = k / n; if (!free(ax + (bx - ax) * f, az + (bz - az) * f)) return false; } return true; };
// A* em 8 direções (sem cortar esquinas) e depois corta-se o caminho pelos troços em linha reta
const nearestFree = (x, z) => { if (free(x, z)) return [x, z]; for (let r = 1; r < 8; r++) for (let a = 0; a < 16; a++) { const xx = x + Math.cos(a / 16 * Math.PI * 2) * r * CS, zz = z + Math.sin(a / 16 * Math.PI * 2) * r * CS; if (free(xx, zz)) return [xx, zz]; } return null; };
export const path = (ax, az, bx, bz) => {
  const A = nearestFree(ax, az), B = nearestFree(bx, bz); if (!A || !B) return null;
  const s = ci(A[0]) + cj(A[1]) * NX, g = ci(B[0]) + cj(B[1]) * NX; if (comp[s] !== comp[g]) return null;
  const gs = new Float32Array(NX * NZ).fill(Infinity), from = new Int32Array(NX * NZ).fill(-1), closed = new Uint8Array(NX * NZ);
  const gi = g % NX, gj = (g / NX) | 0, hh = n => { const i = n % NX, j = (n / NX) | 0, dx = Math.abs(i - gi), dz = Math.abs(j - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const H = [[hh(s), s]]; gs[s] = 0; let it = 0;
  const up = () => { let k = H.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (H[p][0] <= H[k][0]) break; [H[p], H[k]] = [H[k], H[p]]; k = p; } };
  const down = () => { let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === k) break; [H[m], H[k]] = [H[k], H[m]]; k = m; } };
  while (H.length && it++ < 30000) {
    const [, c] = H[0]; const last = H.pop(); if (H.length) { H[0] = last; down(); }
    if (closed[c]) continue; closed[c] = 1; if (c === g) break;
    const i = c % NX, j = (c / NX) | 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { if (!a && !b) continue; const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ) continue; const n = ii + jj * NX; if (blk[n] || closed[n]) continue; if (a && b && (blk[i + a + j * NX] || blk[i + (j + b) * NX])) continue;
      const ng = gs[c] + (a && b ? 1.414 : 1); if (ng < gs[n]) { gs[n] = ng; from[n] = c; H.push([ng + hh(n), n]); up(); } }
  }
  if (from[g] < 0 && g !== s) return null;
  const P = []; for (let c = g; c >= 0 && c !== s; c = from[c]) P.push([cx_(c % NX), cz_((c / NX) | 0)]); P.reverse(); P.push([B[0], B[1]]);
  const out = []; let cx = A[0], cz = A[1], k = 0;
  while (k < P.length) { let far = k; for (let q = Math.min(P.length - 1, k + 40); q > k; q--) if (walkLine(cx, cz, P[q][0], P[q][1])) { far = q; break; } out.push(P[far]); cx = P[far][0]; cz = P[far][1]; k = far + 1; }
  return out;
};

// ---------- pontos de interesse por lado (u = distância ao centro em x, do lado da equipa; v = z relativo)
const LANES = [
  [[30, -17], [18, -18.5], [8, -20], [0, -19.5], [-8, -20], [-18, -18.5]], // viela norte
  [[30, -6.5], [20, -6.8], [12, -5], [7.5, -7.2], [0, -7.3], [-7.5, -7.2], [-12, -5]], // praça, por cima da casa
  [[30, 6.5], [20, 6.8], [12, 5], [7.5, 7.4], [0, 7.6], [-7.5, 7.4], [-12, 5]], // praça, por baixo da casa
  [[30, 12], [24, 14], [13, 18], [4, 14.5], [-4, 14.5], [-13, 18], [-24, 14]], // parque sul
];
const HOLDS = [[15, -5.6], [15, 5.6], [10.2, 0], [23, 0], [8.5, -22], [19, -24.6], [5, 21.5], [29, 20.5], [18.5, -20.5], [12, 24.5]];
const toW = (t, u, v) => [AX + (t ? 1 : -1) * u, AZ + v];
const SPAWN = t => { const s = t ? 1 : -1; return [[AX + s * 43, AZ - 4], [AX + s * 43, AZ + 4], [AX + s * 41, AZ], [AX + s * 44.5, AZ - 1.5], [AX + s * 44.5, AZ + 1.5], [AX + s * 41.5, AZ - 6], [AX + s * 41.5, AZ + 6]]; };

const KITB = {
  atirador: { w: 'm4', k: 'a556', ar: [2, 3], gk: 'capacete,colete,,,mochila', ban: 3, gren: 1 },
  assalto: { w: 'ak', k: 'a762', ar: [0, 3], gk: ',colete,,,mochila', ban: 3, gren: 2 },
  sniper: { w: 'cheytac', k: 'a408', ar: [2, 0], gk: 'capacete,,,,mochila', ban: 2 },
  pesado: { w: 'm249', k: 'a556', ar: [2, 3], gk: 'capacete,colete,,,mochila', ban: 3 },
  apoio: { w: 'smg', k: 'a9', ar: [0, 3], gk: ',colete,,,mochila', ban: 6, gren: 2 },
};
const NAMES = ['Kenji', 'rafa_07', 'TiagoM', 'xNuno', 'Hiro', 'LuisP', 'marta_ss', 'Daichi', 'andre99', 'Ruben_K', 'sakura_x', 'JoaoV', 'Ines_R', 'zekinha', 'Yuki', 'pedrocas', 'Rita_M', 'Kaito', 'vasco23', 'Bia_lx', 'Goncalo', 'Ren_7', 'miguelito', 'Sora', 'duarte_pt', 'Haruto', 'Carol_S', 'Tomas04', 'Akira', 'franzz'];
const LOOK = { skin: [0xf1c9a5, 0xe3b48e, 0xd9a882, 0xb9805a, 0x8d5a3b, 0x5e3a25], hair: [0x2a211b, 0x4a3424, 0x7a5434, 0xb08a4a, 0x8a8a86, 0xb8342a], top: [0x5c6846, 0x3a4a5e, 0x6a3a32, 0x2a2b2c, 0x8a7a5a, 0xc4b9a4, 0x4f5f6a, 0x7a2a3a], legs: [0x3a3f33, 0x2c3440, 0x4a3a2a, 0x2a2a2a, 0x6a6458, 0x3d4a5a] };

// nível de cada humano: precisão (tiros que acertam) e baixas por morte, com valores de partida para não oscilar no início
export const humanSkill = p => { const acc = ((p.hN || 0) + 1) / ((p.sN || 0) + 5), kd = ((p.k || 0) + 1) / ((p.d || 0) + 1); return clamp(0.5 * clamp(acc / 0.5, 0, 1) + 0.5 * clamp(kd / 3, 0, 1), 0.05, 1); };

export function makeBots(A) { // A: { players, add, remove, shot, kill, teamId, bcast, door }
  // A: { players, add, remove, shot, kill, bcast, board, info, now }
  const T0 = Date.now(); let nid = 9e6;
  const adj = [0, 0]; // ajuste de nível por equipa (sobe quando os bots morrem, desce quando matam)
  const bots = () => [...A.players.values()].filter(c => c.bot);
  const humans = () => [...A.players.values()].filter(c => c.p && !c.bot);
  const level = t => { const H = humans().filter(c => c.p.team !== t); const base = H.length ? H.reduce((s, c) => s + humanSkill(c.p), 0) / H.length : 0.35; return clamp(base * 0.92 + adj[t], 0.08, 0.86); };
  const freeName = () => { const used = new Set([...A.players.values()].filter(c => c.p).map(c => c.p.name.toLowerCase())); const L = NAMES.filter(n => !used.has(n.toLowerCase())); return L.length ? pick(L) : 'Jogador' + Math.floor(100 + Math.random() * 900); };

  const spawn = c => { const p = c.p, b = c.bot, now = Date.now();
    const foes = [...A.players.values()].filter(o => o.p && o.p.alive && o.p.team !== p.team);
    let best = null, bd = -1; for (const q of SPAWN(p.team)) { let d = 99; for (const o of foes) d = Math.min(d, Math.hypot(o.p.x - q[0], o.p.z - q[1])); d += Math.random() * 2; if (d > bd) { bd = d; best = q; } }
    const K = KITB[p.kit]; const g = ITEMS[K.w].gun;
    Object.assign(p, { x: best[0], z: best[1], y: 0, lv: 0, yaw: p.team ? -Math.PI / 2 : Math.PI / 2, mv: 0, an: 2, w: K.w, hp: 100, alive: true, ar: [...K.ar], gk: K.gk, spawnT: now, hist: [], sc: 0, hd: null, vd: null });
    Object.assign(b, { st: 'move', path: null, pi: 0, goal: null, tgt: null, seen: new Map(), known: new Map(), mag: g.mag, relT: 0, nextShot: 0, burst: 0, err: [0, 0], strafeT: 0, sdir: 1, holdT: 0, healT: 0, ban: K.ban, gren: K.gren || 0, grenT: 0, hurtT: 0, stuck: 0, lp: [p.x, p.z], lookT: 0, lookY: p.yaw, thinkT: 0, dead: 0, lane: Math.floor(Math.random() * LANES.length), li: 0, crouchT: 0, aimY: 0 });
  };
  const create = team => {
    const c = { id: nid++, bot: {}, dead: false };
    const kits = Object.keys(KITB), S = level(team);
    let kit = pick(['atirador', 'atirador', 'assalto', 'assalto', 'apoio', 'pesado']); if (S > 0.55 && Math.random() < 0.15) kit = 'sniper';
    c.p = { name: freeName(), look: { skin: pick(LOOK.skin), hair: pick(LOOK.hair), top: pick(LOOK.top), legs: pick(LOOK.legs), hairS: Math.floor(Math.random() * 5), beardS: Math.floor(Math.random() * 3) }, team, kit: kits.includes(kit) ? kit : 'atirador', clan: A.teamId(team), k: 0, d: 0, hist: [], alive: false, x: AX, z: AZ, y: 0, lv: 0, yaw: 0, mv: 0, an: 0, w: '', hp: 100, ar: [0, 0], ts: 0 };
    c.p.isBot = 1; c.bot.on = o => onMsg(c, o);
    A.add(c); spawn(c); return c;
  };
  // o que o bot "recebe" do servidor: levar um tiro diz-lhe de onde veio (como o indicador de dano de um jogador)
  const onMsg = (c, o) => { if (o.t !== 'hit') return; const b = c.bot, p = c.p, by = [...A.players.values()].find(q => q.p && q.p.name === o.by); b.hurtT = Date.now();
    if (by && by.p.alive) { const e = Math.hypot(by.p.x - p.x, by.p.z - p.z) * 0.12; b.known.set(by.id, { x: by.p.x + gauss() * e, z: by.p.z + gauss() * e, t: Date.now(), hurt: 1 }); b.lookY = Math.atan2(by.p.x - p.x, by.p.z - p.z) + gauss() * 0.35; b.lookT = Date.now() + 900; } };

  // equilíbrio: os dois lados ficam com o mesmo número (o maior número de humanos); sem humanos, sem bots
  const balance = () => {
    const h = [0, 0]; for (const c of humans()) h[c.p.team]++;
    const want = h[0] + h[1] ? Math.max(h[0], h[1]) : 0;
    for (const t of [0, 1]) { const mine = bots().filter(c => c.p.team === t); const need = Math.max(0, want - h[t]);
      if (mine.length > need) { const out = mine.sort((a, b) => (a.p.alive ? 1 : 0) - (b.p.alive ? 1 : 0)).slice(0, mine.length - need); for (const c of out) A.remove(c); }
      else for (let i = mine.length; i < need; i++) create(t); }
  };

  // ---------- perceção: só o que um jogador poderia saber
  const eyeY = p => (p.sc === 1 ? 1.33 : p.sc === 2 ? 0.36 : 1.72) + (p.lv || 0) * FH + (p.y || 0);
  const canSee = (p, q, fovCos) => {
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); if (d > 95) return false;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw); if (d > 3.5 && (dx * fx + dz * fz) / (d || 1) < fovCos) return false;
    const ey = eyeY(p), qy = (q.y || 0) + (q.lv || 0) * FH, hy = qy + (q.sc === 1 ? 1.38 : q.sc === 2 ? 0.38 : 1.8), cy = qy + (q.sc === 2 ? 0.22 : q.sc === 1 ? 0.95 : 1.3);
    return los(p.x, ey, p.z, q.x, hy, q.z) || los(p.x, ey, p.z, q.x, cy, q.z);
  };
  const heard = (x, z, srcTeam, by) => { const now = Date.now(); for (const c of bots()) { const p = c.p; if (!p.alive || p.team === srcTeam) continue; const d = Math.hypot(x - p.x, z - p.z); if (d > 70) continue; const e = 1.5 + d * 0.15; c.bot.known.set(by, { x: x + gauss() * e, z: z + gauss() * e, t: now, snd: 1 }); } };

  const moveTo = (c, x, z) => { const P = path(c.p.x, c.p.z, x, z); c.bot.path = P; c.bot.pi = 0; c.bot.goal = [x, z]; return !!P; };
  const pickGoal = c => { const b = c.bot, p = c.p, t = p.team; const L = LANES[b.lane]; if (b.li >= L.length) { b.lane = Math.floor(Math.random() * LANES.length); b.li = 0; }
    let [u, v] = LANES[b.lane][b.li++]; if (Math.random() < 0.25) { [u, v] = pick(HOLDS); if (Math.random() < 0.4) u = -u; b.holdNext = 1; }
    const [x, z] = toW(t, u + gauss() * 0.8, v + gauss() * 0.8); if (!moveTo(c, x, z)) b.path = null; };

  const S_ = c => level(c.p.team);
  const think = (c, now) => {
    const b = c.bot, p = c.p, S = S_(c);
    // quem vejo agora (com o campo de visão de um ecrã de telemóvel) e quem já reconheci (o tempo de reação)
    const foes = [...A.players.values()].filter(o => o.p && o.p.alive && o.p.team !== p.team && (o.p.lv || 0) === 0); // outro piso não se vê (como para os jogadores)
    const vis = new Set();
    for (const o of foes) { const q = o.p; const fov = b.tgt === o.id ? -0.2 : 0.42; if (!canSee(p, q, fov)) { b.seen.delete(o.id); continue; } vis.add(o.id);
      if (!b.seen.has(o.id)) { const d = Math.hypot(q.x - p.x, q.z - p.z), react = (520 - 300 * S) + d * (5 - 3 * S) + Math.random() * 180 + (q.sc === 2 ? 250 : q.sc === 1 ? 90 : 0); b.seen.set(o.id, now + react); }
      b.known.set(o.id, { x: q.x, z: q.z, t: now }); }
    p.vis = new Set([...vis].filter(id => (b.seen.get(id) || 1e15) <= now)); p.visT = now; // os colegas veem no radar o que o bot viu
    // o radar da equipa: inimigos que dispararam ou que um colega está a ver (o mesmo que os jogadores têm no ecrã)
    for (const o of foes) { if (vis.has(o.id)) continue; const q = o.p; let sp = now - (q.lastShot || 0) < 2500; if (!sp) for (const m of A.players.values()) if (m.p && m.p.team === p.team && m.p.alive && m.p.vis && now - (m.p.visT || 0) < 1500 && m.p.vis.has(o.id)) { sp = true; break; }
      if (sp) { const e = 1.2; b.known.set(o.id, { x: q.x + gauss() * e, z: q.z + gauss() * e, t: now, radar: 1 }); } }
    for (const [id, k] of b.known) if (now - k.t > 9000) b.known.delete(id);
    // alvo: o mais perto já reconhecido (fica com o atual se ainda o vê)
    let tgt = null, td = 1e9; for (const o of foes) { const r = b.seen.get(o.id); if (r == null || r > now) continue; const d = Math.hypot(o.p.x - p.x, o.p.z - p.z) - (o.id === b.tgt ? 6 : 0); if (d < td) { td = d; tgt = o; } }
    if (tgt && tgt.id !== b.tgt) { b.tgt = tgt.id; b.err = [gauss() * (0.09 - 0.06 * S) + (Math.random() < 0.5 ? -1 : 1) * 0.03 * (1 - S), gauss() * (0.05 - 0.03 * S)]; b.burst = 0; b.nextShot = Math.max(b.nextShot, now + 60 + Math.random() * 120); b.aimHead = Math.random() < 0.08 + 0.22 * S; }
    if (!tgt) { b.tgt = null; tryGrenade(c, now); }
    b.cur = tgt;
    const K = KITB[p.kit], g = ITEMS[K.w].gun;
    // recarregar: com o carregador vazio, ou com pouco e sem ninguém à vista
    if (!b.relT && (b.mag <= 0 || (!tgt && b.mag < g.mag * 0.4 && now - b.hurtT > 2500))) { b.relT = now + g.reload * 1000 * (1.05 + Math.random() * 0.2); b.burst = 0; }
    if (b.relT && now >= b.relT) { b.relT = 0; b.mag = g.mag; }
    // curar com ligadura: ferido, sem inimigos à vista há um bocado
    if (!tgt && !b.healT && p.hp < 65 && b.ban > 0 && now - b.hurtT > 3500 && !b.relT) { b.healT = now + 3000; b.path = null; }
    if (b.healT && (tgt || now - b.hurtT < 200)) b.healT = 0;
    if (b.healT && now >= b.healT) { b.healT = 0; b.ban--; p.hp = Math.min(100, p.hp + 30); }
    // decisões de movimento
    if (tgt) {
      b.st = 'fight'; b.path = null;
      const d = Math.hypot(tgt.p.x - p.x, tgt.p.z - p.z);
      if (b.relT && p.hp < 70) { // a recarregar e ferido: procura cobertura perto
        if (!b.cover || now > b.coverT) { b.cover = findCover(p, tgt.p); b.coverT = now + 1500; } }
      else b.cover = null;
      if (now > b.strafeT) { b.sdir = Math.random() < 0.5 ? -1 : 1; b.strafeT = now + 350 + Math.random() * 900; b.still = Math.random() < (d > 20 ? 0.55 : 0.25); b.crouch = d > 16 && b.still && Math.random() < 0.45; }
      if (d > (K.w === 'cheytac' ? 70 : K.w === 'smg' || K.w === 'ak' ? 26 : 45) && !b.relT) b.push = true; else b.push = false;
    } else {
      b.cover = null; b.crouch = false;
      // investigar o último sítio onde viu, ouviu ou o radar mostrou alguém
      let k = null, kt = 0; for (const v of b.known.values()) if (v.t > kt) { kt = v.t; k = v; }
      if (b.healT) { b.st = 'heal'; }
      else if (k && now - k.t < 8000) { if (b.st !== 'hunt' || !b.goal || Math.hypot(b.goal[0] - k.x, b.goal[1] - k.z) > 4 || !b.path) { b.st = 'hunt'; moveTo(c, k.x, k.z); } b.lookY = Math.atan2(k.x - p.x, k.z - p.z); b.lookT = now + 400; }
      else if (b.st === 'hold') { if (now > b.holdT) { b.st = 'move'; pickGoal(c); } else if (now > b.lookT) { b.lookY = p.yaw + gauss() * 1.1; b.lookT = now + 900 + Math.random() * 1500; } }
      else { b.st = 'move'; if (!b.path || b.pi >= b.path.length) { if (b.holdNext) { b.holdNext = 0; b.st = 'hold'; b.holdT = now + 2000 + Math.random() * 4000; b.path = null; } else pickGoal(c); } }
    }
  };
  // granadas: só a quem sabe onde está (viu, ouviu ou o radar mostrou) e está escondido atrás de alguma coisa, entre 6 e 20 m,
  // sem colegas perto do sítio onde cai e longe do próprio bot; a física é a mesma do jogo (o cliente desenha-a igual)
  const GR = [];
  const tryGrenade = (c, now) => { const b = c.bot, p = c.p; if (!(b.gren > 0) || now < (b.grenT || 0) || b.relT || b.healT) return;
    let k = null; for (const [id, v] of b.known) { if (now - v.t > 4000 || b.seen.has(id)) continue; const d = Math.hypot(v.x - p.x, v.z - p.z); if (d < 6 || d > 20) continue; if (!k || v.t > k.t) k = { ...v, d }; }
    if (!k) return; b.grenT = now + 1500; if (Math.random() > 0.05 + 0.1 * S_(c)) return;
    for (const o of A.players.values()) if (o.p && o.p.alive && o.p.team === p.team && o !== c && Math.hypot(o.p.x - k.x, o.p.z - k.z) < 7) return;
    let dx = k.x + gauss() * (1.6 - S_(c)) - p.x, dz = k.z + gauss() * (1.6 - S_(c)) - p.z; const d = Math.min(22, Math.max(3, Math.hypot(dx, dz))), l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const T = 0.55 + d / 22 * 0.75, h0 = 1.43, vy = (4.9 * T * T - h0) / T, dd = d * 0.88;
    const G = { P: [p.x + dx * 0.5, 1.5, p.z + dz * 0.5], V: [dx * dd / T, vy, dz * dd / T], t: 3.0, c, team: p.team };
    GR.push(G); b.gren--; b.grenT = now + 9000; b.lookY = Math.atan2(dx, dz); b.lookT = now + 700; b.thrT = now + 700;
    A.bcast({ t: 'thr', k: 'gran', P: G.P.map(v => +v.toFixed(2)), lv: 0, V: G.V.map(v => +v.toFixed(2)), base: 0, by: p.name });
  };
  const stepGren = dt => { for (let i = GR.length - 1; i >= 0; i--) { const G = GR[i], P = G.P, V = G.V; V[1] -= 9.8 * dt; const Q = [P[0] + V[0] * dt, P[1] + V[1] * dt, P[2] + V[2] * dt];
      if (rayFrac(P[0], P[1], P[2], Q[0], Q[1], Q[2]) < 1) { V[0] *= -0.35; V[2] *= -0.35; Q[0] = P[0]; Q[1] = P[1]; Q[2] = P[2]; }
      if (Q[1] < 0.07) { Q[1] = 0.07; V[1] = Math.abs(V[1]) * 0.3; V[0] *= 0.55; V[2] *= 0.55; if (Math.abs(V[1]) < 0.6) V[1] = 0; }
      G.P = Q; G.t -= dt;
      if (G.t <= 0) { GR.splice(i, 1); const by = G.c.p; for (const o of A.players.values()) if (o.p && !o.bot) A.send(o, { t: 'boom', k: 'gran', x: +Q[0].toFixed(2), y: +Q[1].toFixed(2), z: +Q[2].toFixed(2), lv: 0, by: by.name, nd: o.p.team === G.team ? 1 : 0 }); } } };
  // cobertura: o ponto livre mais perto (até 6 m) de onde não se vê o inimigo
  const findCover = (p, q) => { let best = null, bd = 1e9; for (let r = 1; r <= 12; r++) for (let a = 0; a < 12; a++) { const x = p.x + Math.cos(a / 12 * Math.PI * 2) * r * 0.5, z = p.z + Math.sin(a / 12 * Math.PI * 2) * r * 0.5; if (!free(x, z) || !walkLine(p.x, p.z, x, z)) continue; if (los(q.x, 1.5, q.z, x, 1.1, z)) continue; const d = r * 0.5; if (d < bd) { bd = d; best = [x, z]; } } return best; };

  // disparo: a pontaria vai do erro inicial para perto do alvo (mais depressa nos bons), com tremor e coice nas rajadas
  const fire = (c, now) => {
    const b = c.bot, p = c.p, t = b.cur; if (!t || b.relT || b.healT || now < b.nextShot || b.mag <= 0) return;
    const S = S_(c), K = KITB[p.kit], g = ITEMS[K.w].gun, q = t.p;
    if ((b.seen.get(t.id) || 1e15) > now) return;
    const want = Math.atan2(q.x - p.x, q.z - p.z); if (Math.abs(angD(want, p.yaw)) > 0.12) return; // ainda a virar-se
    if (now - (q.spawnT || 0) < 2500) return; // proteção de nascer: não vale a pena
    const qy = (q.y || 0) + (q.lv || 0) * FH, ty = qy + (b.aimHead ? (q.sc === 1 ? 1.38 : q.sc === 2 ? 0.38 : 1.8) : (q.sc === 2 ? 0.22 : q.sc === 1 ? 0.95 : 1.3)); // alturas do esqueleto (cabeça e peito)
    const ex = p.x, ey = eyeY(p) - 0.05, ez = p.z; const dx = q.x - ex, dy = ty - ey, dz = q.z - ez, d = Math.hypot(dx, dy, dz) || 1;
    // avanço: quem corre de lado é mais difícil (o bot não adivinha, aponta onde o vê com um pouco de atraso)
    const lag = (q.hist && q.hist.length > 1) ? q.hist[Math.max(0, q.hist.length - 4)] : null; const lx = lag ? (lag[1] - q.x) * (0.5 - 0.35 * S) : 0, lz = lag ? (lag[3] - q.z) * (0.5 - 0.35 * S) : 0;
    let yaw = Math.atan2(dx + lx, dz + lz), pit = Math.asin(clamp(dy / d, -1, 1));
    const rec = b.burst * (g.auto ? (K.w === 'm249' ? 0.0045 : 0.0035) : 0.002) * (1.2 - 0.6 * S);
    yaw += b.err[0] + gauss() * (0.006 + 0.012 * (1 - S)) + gauss() * rec; pit += b.err[1] + gauss() * (0.004 + 0.008 * (1 - S)) + rec * 0.8;
    const spr = (g.acc ?? g.spread * 0.3) * (b.still ? 1 : 2.2) * (p.mv > 0.5 ? 1.6 : 1);
    const D = [Math.sin(yaw) * Math.cos(pit), Math.sin(pit), Math.cos(yaw) * Math.cos(pit)];
    const O = [ex, ey, ez]; const L0 = 300, fr = rayFrac(ex, ey, ez, ex + D[0] * L0, ey + D[1] * L0, ez + D[2] * L0), L = Math.max(0.5, fr * L0);
    const n = ITEMS[K.w].gun.ammo[0] === 'c12' ? 8 : 1, ds = []; for (let i = 0; i < n; i++) { const a = gauss() * spr, e2 = gauss() * spr; ds.push([Math.sin(yaw + a) * Math.cos(pit + e2), Math.sin(pit + e2), Math.cos(yaw + a) * Math.cos(pit + e2)]); }
    A.shot(c, { o: O, d: ds[0], ds, n, k: K.k, L, sup: false });
    b.mag--; b.burst++; p.lastShot = now;
    // o erro inicial vai-se corrigindo a cada tiro (mais nos bons)
    const k2 = 0.55 + 0.3 * S; b.err[0] *= 1 - k2 * 0.6; b.err[1] *= 1 - k2 * 0.6;
    // rajadas: curtas de longe, mais longas de perto; pausa entre elas
    const dist = Math.hypot(q.x - p.x, q.z - p.z);
    if (g.auto) { const maxB = dist > 30 ? 3 + Math.floor(S * 2) : dist > 14 ? 5 + Math.floor(S * 3) : 9; if (b.burst >= maxB + Math.floor(Math.random() * 3)) { b.burst = 0; b.nextShot = now + 180 + Math.random() * 320 + (1 - S) * 200; } else b.nextShot = now + g.cd * 1000 * (1.02 + Math.random() * 0.08); }
    else { b.burst = Math.min(b.burst, 3); b.nextShot = now + g.cd * 1000 * (1.15 + Math.random() * 0.6 + (1 - S) * 0.5); setTimeout(() => { b.burst = Math.max(0, b.burst - 1); }, 500); }
  };

  // movimento e pose a cada passo do servidor (30 por segundo)
  const step = (c, dt, now) => {
    const b = c.bot, p = c.p; if (!p.alive) return;
    let vx = 0, vz = 0, spd = 0, face = null;
    const S = S_(c), turn = (3.2 + 2.8 * S) * dt;
    if (b.st === 'fight' && b.cur) {
      const q = b.cur.p; face = Math.atan2(q.x - p.x, q.z - p.z);
      let tx = 0, tz = 0;
      if (b.cover) { tx = b.cover[0] - p.x; tz = b.cover[1] - p.z; const l = Math.hypot(tx, tz); if (l < 0.25) { tx = tz = 0; } else { tx /= l; tz /= l; spd = 3.0; } }
      else if (b.push) { const P = b.chase && now < b.chaseT ? b.chase : (b.chase = path(p.x, p.z, q.x, q.z), b.chaseT = now + 1200, b.chaseI = 0, b.chase); if (P && P.length) { let w = P[b.chaseI || 0]; if (w && Math.hypot(w[0] - p.x, w[1] - p.z) < 0.35) { b.chaseI++; w = P[b.chaseI]; } if (w) { tx = w[0] - p.x; tz = w[1] - p.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; spd = 2.4; } } }
      else if (!b.still) { tx = Math.cos(face) * b.sdir; tz = -Math.sin(face) * b.sdir; spd = 2.4; }
      vx = tx * spd; vz = tz * spd;
      p.sc = b.crouch && spd === 0 ? 1 : 0;
    } else if (b.st === 'move' || b.st === 'hunt') {
      const P = b.path; if (P && b.pi < P.length) { let w = P[b.pi]; if (Math.hypot(w[0] - p.x, w[1] - p.z) < 0.4) { b.pi++; w = P[b.pi]; } if (w) { const tx = w[0] - p.x, tz = w[1] - p.z, l = Math.hypot(tx, tz) || 1; spd = b.st === 'hunt' ? 3.0 : (b.pi < P.length - 1 ? 5.0 : 3.0); vx = tx / l * spd; vz = tz / l * spd; face = now < b.lookT && b.st === 'hunt' ? b.lookY : Math.atan2(tx, tz); } }
      p.sc = 0;
    } else if (b.st === 'hold' || b.st === 'heal') { face = b.lookY; p.sc = b.st === 'heal' ? 1 : 0; }
    if (now < b.lookT && b.st !== 'fight') face = b.lookY;
    if (face != null) p.yaw += clamp(angD(face, p.yaw), -turn, turn);
    // andar sem atravessar nada (desliza ao longo das paredes)
    // porta fechada à frente: abre-a (como um jogador), e todos a veem abrir
    if (spd > 0.1) { const ax = p.x + vx / spd * 0.9, az = p.z + vz / spd * 0.9; for (const D of DOORS.values()) if (!D.o && !D.lv && ax > D.x0 - 0.35 && ax < D.x1 + 0.35 && az > D.z0 - 0.35 && az < D.z1 + 0.35) A.door(D.id, 1); }
    // velocidade com aceleração (arranca e trava como uma pessoa, sem saltos)
    { const k = Math.min(1, dt * 9); b.vx = (b.vx || 0) + (vx - (b.vx || 0)) * k; b.vz = (b.vz || 0) + (vz - (b.vz || 0)) * k; vx = b.vx; vz = b.vz; spd = Math.hypot(vx, vz); }
    if (spd > 0.05) { const nx = p.x + vx * dt, nz = p.z + vz * dt; if (free(nx, nz)) { p.x = nx; p.z = nz; } else if (free(nx, p.z)) { p.x = nx; b.vz *= 0.3; } else if (free(p.x, nz)) { p.z = nz; b.vx *= 0.3; } else { b.vx = b.vz = 0; b.path = null; b.chase = null; if (b.st === 'fight') { b.still = true; b.strafeT = now + 400; } } }
    // preso: volta a calcular o caminho
    if (now - (b.lpT || 0) > 1500) { if (spd > 0 && Math.hypot(p.x - b.lp[0], p.z - b.lp[1]) < 0.4) { b.path = null; b.chase = null; b.sdir = -b.sdir; } b.lp = [p.x, p.z]; b.lpT = now; }
    p.mv = Math.min(3, Math.hypot(vx, vz) / 3);
    p.an = 2 + (b.st === 'fight' || b.st === 'hunt' ? 4 : 0) + (b.relT ? 16 : 0) + (b.st === 'heal' ? 64 : 0) + (now < (b.thrT || 0) ? 32 : 0); p.w = KITB[p.kit].w;
    p.ts = now - T0;
    histPush(p, now);
  };

  let lastBal = 0, lastT = Date.now();
  const ON = process.env.KG_BOTS !== '0'; // desligado só nos testes que precisam da arena vazia
  const tick = () => {
    if (!ON) return;
    const now = Date.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (now - lastBal > 1000) { lastBal = now; balance(); }
    stepGren(dt);
    for (const c of bots()) {
      const p = c.p, b = c.bot; p.ts = now - T0; // a hora vai sempre para a frente, também morto (senão o jogo ignora as imagens repetidas e o corpo não cai)
      if (!p.alive) { if (!b.dead) b.dead = now; if (now - b.dead > 5200) { b.dead = 0; spawn(c); } continue; }
      if (now >= b.thinkT) { b.thinkT = now + 100; think(c, now); }
      step(c, dt, now); fire(c, now);
    }
    // nível que desce devagar para zero (o ajuste não fica preso)
    for (const t of [0, 1]) adj[t] *= 0.9995;
  };
  // um bot matou um humano: fica mais lento; um humano matou um bot: afina (com limites)
  const onKill = (killer, victim) => { if (!killer || !victim || killer === victim) return; const kb = !!killer.isBot, vb = !!victim.isBot; if (kb && !vb) adj[killer.team] = clamp(adj[killer.team] - 0.035, -0.3, 0.25); if (vb && !kb) adj[victim.team] = clamp(adj[victim.team] + 0.03, -0.3, 0.25); };
  // granada de um jogador perto de bots: dano pela distância, só se não houver parede no meio
  const boom = (by, x, y, z) => { for (const c of bots()) { const p = c.p; if (!p.alive || p.team === by.team) continue; const d = Math.hypot(p.x - x, p.z - z); if (d > 7 || !los(x, y + 0.3, z, p.x, 1.0, p.z)) continue; const dmg = 135 * Math.pow(1 - d / 7, 1.2) * (p.ar[1] ? 0.8 : 1); p.hp = Math.max(0, p.hp - dmg); c.bot.hurtT = Date.now(); if (p.hp <= 0) { p.alive = false; p.deadT = Date.now(); A.kill(by, p, 'granada'); } } };
  const removeAll = () => { for (const c of bots()) A.remove(c); };
  return { tick, heard, onKill, boom, removeAll, level, bots };
}
