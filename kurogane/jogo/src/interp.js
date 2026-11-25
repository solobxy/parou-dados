// movimento suave dos outros (jogadores e carros): cada imagem traz a hora de quem a mandou.
// A hora a que chega varia (rede do telemóvel, espera no servidor); a hora a que saiu não. Desenha-se um pouco atrás,
// entre as duas imagens certas, e o atraso ajusta-se sozinho à rede de cada um.
const MAX = 40;
export const track = () => ({ buf: [], off: null, jit: 25, delay: 110 });
// ts: hora de envio (ms, relógio de quem mandou); recv: hora de chegada (ms, o nosso relógio)
export const push = (T, ts, recv, s) => {
  const B = T.buf; if (B.length) { const last = B[B.length - 1].ts; if (ts < last - 1000 || ts - last > 5000) { B.length = 0; T.off = null; } else if (ts <= last) return false; } // relógio novo (outra pessoa a simular, página recarregada) ou parado há muito: recomeça; repetida ou fora de ordem: fora
  const o = recv - ts;
  if (T.off === null || o < T.off) T.off = o; else T.off += 0.4; // o mínimo é a ligação mais rápida; sobe devagar se a rede piorar
  T.jit += ((o - T.off) - T.jit) * 0.08;
  s.ts = ts; B.push(s); if (B.length > MAX) B.shift();
  return true;
};
const angLerp = (a, b, f) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * f; };
// onde está agora (para desenhar); devolve null se ainda não há nada
export const sample = (T, now, out) => {
  const B = T.buf; if (!B.length) return null;
  const want = Math.min(320, Math.max(58, 36 + T.jit * 2.2)); // com 30 imagens por segundo chega menos atraso (antes 80 ms no mínimo) T.delay += (want - T.delay) * 0.02;
  const rt = now - T.off - T.delay;
  let a = B[0], b = null;
  if (rt <= a.ts) { out.x = a.x; out.z = a.z; out.y = a.y; out.yaw = a.yaw; out.s = a; out.lag = 0; return out; }
  for (let i = B.length - 1; i >= 0; i--) if (B[i].ts <= rt) { a = B[i]; b = B[i + 1] || null; break; }
  // descarta o que já passou (fica uma para trás)
  while (B.length > 2 && B[1].ts < rt - 200) B.shift();
  if (b) { const f = (rt - a.ts) / Math.max(1, b.ts - a.ts); out.x = a.x + (b.x - a.x) * f; out.z = a.z + (b.z - a.z) * f; out.y = a.y + (b.y - a.y) * f; out.yaw = angLerp(a.yaw, b.yaw, f); out.s = f < 0.5 ? a : b; out.lag = 0; return out; }
  // passou da última: continua no mesmo andamento até 100 ms, depois espera
  const p = B[B.length - 2], ex = Math.min(100, rt - a.ts);
  if (p && a.ts > p.ts) { const k = ex / (a.ts - p.ts); out.x = a.x + (a.x - p.x) * k; out.z = a.z + (a.z - p.z) * k; out.y = a.y; } else { out.x = a.x; out.z = a.z; out.y = a.y; }
  out.yaw = a.yaw; out.s = a; out.lag = rt - a.ts; return out;
};
