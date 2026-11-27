// Hitboxes por osso, iguais para o servidor e para o jogo: cabeça, pescoço, peito, barriga, bacia, braços, antebraços,
// coxas e canelas, como cápsulas (segmento + raio) que seguem a pose do corpo (de pé, agachado, deitado; arma comprida,
// pistola ou nada; a apontar ou não; parado ou a andar) e a direção para onde está virado.
// As articulações vêm do esqueleto do próprio jogo (hitpose.js, gerado por texphit.cjs), por isso batem com o que se vê.
import { HITPOSE } from './hitpose.js';

// [articulação A, articulação B, raio (m), zona, até onde vai de A para B (1 = até B)]
export const BONES = [
  ['head', 'top', 0.118, 'head'], // cabeça: do centro ao alto da cabeça (cápsula, cobre a cara e a nuca)
  ['neck', 'head', 0.065, 'body', 0.45], // pescoço: só até ao queixo (o resto é cabeça)
  ['spine', 'neck', 0.16, 'body', 0.6], // peito (até aos ombros; a cabeça não fica dentro dele)
  ['pelvis', 'spine', 0.155, 'body'], // barriga
  ['hiL', 'hiR', 0.12, 'body'], // bacia
  ['shL', 'elL', 0.058, 'arms'], ['elL', 'haL', 0.05, 'arms'],
  ['shR', 'elR', 0.058, 'arms'], ['elR', 'haR', 0.05, 'arms'],
  ['hiL', 'knL', 0.085, 'legs'], ['knL', 'ftL', 0.065, 'legs'],
  ['hiR', 'knR', 0.085, 'legs'], ['knR', 'ftR', 0.065, 'legs'],
];
const LEGJ = new Set(['hiL', 'hiR', 'knL', 'knR', 'ftL', 'ftR']);
// postura (0 de pé, 1 agachado, 2 deitado), arma pelo modo da animação (an & 3: 2 comprida, 1 pistola), a apontar (an & 4), a andar
export const poseKey = (sc, an, mv) => { const s = sc >= 1.5 ? 2 : sc >= 0.5 ? 1 : 0, m = (an & 3) === 2 ? 'r' : (an & 3) === 1 ? 'p' : 'n'; return s + m + (an & 4 ? 1 : 0) + (mv > 0.15 ? 1 : 0); };

// cápsulas no mundo para um alvo { x, y, z, yaw, sc, an, mv }; infl alarga um pouco (folga da rede)
export const capsules = (T, infl = 0) => {
  const P = T.lie ? HITPOSE['0n00'] : HITPOSE[poseKey(T.sc || 0, T.an | 0, T.mv || 0)] || HITPOSE['0n00']; // lie: quem dorme, de costas no chão (o corpo de pé deitado para trás, como o jogo o desenha)
  const c = Math.cos(T.yaw || 0), s = Math.sin(T.yaw || 0), out = [], ly = (T.yaw || 0) + (T.lr || 0), lc = Math.cos(ly), ls = Math.sin(ly);
  // pernas viradas para onde anda (a andar de lado ou para trás) e o tronco a apontar, como o jogo desenha
  const W = (q, leg) => { if (T.lie) q = [q[0], q[2], -q[1]]; const C = leg ? lc : c, S = leg ? ls : s; return [T.x + q[0] * C + q[2] * S, (T.y || 0) + q[1], T.z - q[0] * S + q[2] * C]; };
  const J = {}; for (const k in P) J[k] = W(P[k], !T.lie && LEGJ.has(k));
  for (const [a, b, r, zone, tb = 1] of BONES) { const A = J[a], B0 = J[b], B = [A[0] + (B0[0] - A[0]) * tb, A[1] + (B0[1] - A[1]) * tb, A[2] + (B0[2] - A[2]) * tb]; out.push([A[0], A[1], A[2], B[0], B[1], B[2], r + infl, zone]); }
  return out;
};

// distância mínima entre dois segmentos (P0→P1 e Q0→Q1); devolve [distância, fração em P]
const segSeg = (p0x, p0y, p0z, p1x, p1y, p1z, q0x, q0y, q0z, q1x, q1y, q1z) => {
  const ux = p1x - p0x, uy = p1y - p0y, uz = p1z - p0z, vx = q1x - q0x, vy = q1y - q0y, vz = q1z - q0z, wx = p0x - q0x, wy = p0y - q0y, wz = p0z - q0z;
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, cc = vx * vx + vy * vy + vz * vz, d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz, D = a * cc - b * b;
  let sN, sD = D, tN, tD = D;
  if (D < 1e-9) { sN = 0; sD = 1; tN = e; tD = cc; } else { sN = b * e - cc * d; tN = a * e - b * d; if (sN < 0) { sN = 0; tN = e; tD = cc; } else if (sN > sD) { sN = sD; tN = e + b; tD = cc; } }
  if (tN < 0) { tN = 0; if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; } } else if (tN > tD) { tN = tD; if (-d + b < 0) sN = 0; else if (-d + b > a) sN = sD; else { sN = -d + b; sD = a; } }
  const sc = Math.abs(sN) < 1e-9 ? 0 : sN / sD, tc = Math.abs(tN) < 1e-9 ? 0 : tN / (tD || 1);
  const dx = wx + sc * ux - tc * vx, dy = wy + sc * uy - tc * vy, dz = wz + sc * uz - tc * vz;
  return [Math.hypot(dx, dy, dz), sc];
};
// troço de bala A→B contra as cápsulas: a primeira que toca (a mais perto de A); devolve { zone, f } ou null
export const hitCapsules = (ax, ay, az, bx, by, bz, caps) => {
  let best = null; const L = Math.hypot(bx - ax, by - ay, bz - az) || 1e-6;
  // ordem pela entrada na cápsula (onde a bala começa a tocar), não pelo ponto mais perto do eixo
  for (const q of caps) { const [d, f] = segSeg(ax, ay, az, bx, by, bz, q[0], q[1], q[2], q[3], q[4], q[5]); if (d >= q[6]) continue; const fe = Math.max(0, f - Math.sqrt(q[6] * q[6] - d * d) / L);
    if (!best || fe < best.f - 0.004 / L || (fe < best.f + 0.004 / L && q[7] === 'head')) best = { zone: q[7], f: fe }; }
  return best;
};
const angD = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
// para onde as pernas estão viradas: a direção em que anda (últimos ~150 ms), no máximo 1 rad para cada lado; a recuar, ao contrário
const legTurn = (H, i, yaw) => { if (i < 1 || (H[i][6] || 0) >= 1.5) return 0; let j = i; while (j > 0 && H[i][0] - H[j - 1][0] < 160) j--; if (j === i) j = i - 1; const dt = (H[i][0] - H[j][0]) / 1000 || 0.033, dx = H[i][1] - H[j][1], dz = H[i][3] - H[j][3];
  if (Math.hypot(dx, dz) / dt < 0.6) return 0; const my = Math.atan2(dx, dz), rel = angD(my, yaw), back = Math.abs(rel) > 1.95; return Math.max(-1, Math.min(1, back ? angD(my + Math.PI, yaw) : rel)); };
// onde estava o alvo na hora em que quem disparou o via (ts = hora do alvo, como o cliente a desenhou)
// hist: [[hora do servidor, x, y, z, ts, yaw, sc, an, mv], ...]; sem ts válido usa o sítio atual
export const rewind = (p, ts) => {
  const H = p.hist || [], cur = { x: p.x, y: p.y || 0, z: p.z, yaw: p.yaw || 0, sc: p.sc || 0, an: p.an | 0, mv: p.mv || 0, lr: legTurn(H, H.length - 1, p.yaw || 0) };
  if (!(ts > 0) || H.length < 2) return cur;
  const last = H[H.length - 1][4]; if (ts > last || ts < last - 600) return cur; // mais de 0,6 s para trás não vale (não se pode escolher onde o alvo estava)
  for (let i = H.length - 1; i > 0; i--) { const b = H[i], a = H[i - 1]; if (a[4] <= ts && ts <= b[4]) { const f = (ts - a[4]) / Math.max(1, b[4] - a[4]); let dy = b[5] - a[5]; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    const n = f < 0.5 ? a : b, yaw = a[5] + dy * f; return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, z: a[3] + (b[3] - a[3]) * f, yaw, sc: n[6], an: n[7], mv: n[8], lr: legTurn(H, i, yaw) }; } }
  return cur;
};
// guardar o estado (chamar a cada 'st' ou passo do bot); fica ~1 s
export const histPush = (p, now) => { const H = p.hist || (p.hist = []); H.push([now, p.x, p.y || 0, p.z, p.ts || 0, p.yaw || 0, p.sc || 0, p.an | 0, p.mv || 0]); while (H.length > 2 && now - H[0][0] > 1000) H.shift(); };
