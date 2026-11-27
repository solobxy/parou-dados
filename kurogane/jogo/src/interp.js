// movimento suave dos outros (jogadores e carros): cada imagem traz a hora de quem a mandou.
// A hora a que chega varia (rede do telemóvel, espera no servidor); a hora a que saiu não. Desenha-se um pouco atrás,
// entre as duas imagens certas, e o atraso ajusta-se sozinho à rede de cada um (mais atraso quando a rede dá solavancos).
const MAX = 48, WIN = 90; // até 48 imagens guardadas; a rede mede-se nas últimas 90 (3 s a 30 por segundo)
export const track = () => ({ buf: [], off: null, jit: 25, delay: 80, os: [] });
// ts: hora de envio (ms, relógio de quem mandou); recv: hora de chegada (ms, o nosso relógio)
export const push = (T, ts, recv, s) => {
  const B = T.buf; if (B.length) { const last = B[B.length - 1].ts; if (ts < last - 1000 || ts - last > 5000) { B.length = 0; T.off = null; T.offS = null; T.os.length = 0; } else if (ts <= last) return false; } // relógio novo ou parado há muito: recomeça; repetida ou fora de ordem: fora
  const o = recv - ts, O = T.os; O.push(o); if (O.length > WIN) O.shift();
  // diferença de relógios = a chegada mais rápida da janela; o solavanco = quanto as outras chegam depois dessa (90.º percentil)
  let mn = Infinity; for (const v of O) if (v < mn) mn = v; T.off = mn;
  if (O.length >= 8) { const d = O.map(v => v - mn).sort((a, b) => a - b); T.jit = d[Math.min(d.length - 1, Math.floor(d.length * 0.9))]; } else T.jit = Math.max(T.jit, o - mn);
  s.ts = ts; B.push(s); if (B.length > MAX) B.shift();
  return true;
};
const angLerp = (a, b, f) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * f; };
// onde está agora (para desenhar); devolve null se ainda não há nada
export const sample = (T, now, out) => {
  const B = T.buf; if (!B.length) return null;
  // atraso: o necessário para quase nunca ficar sem imagem seguinte (antes ficava fixo em 110 ms e com rede móvel saltava)
  const want = Math.min(350, Math.max(48, 36 + T.jit * 1.15)), lt = T.lt ?? now, dtm = Math.min(100, now - lt); T.lt = now;
  T.delay += Math.max(-dtm * 0.05, Math.min(dtm * 0.25, (want - T.delay) * Math.min(1, dtm / 400))); // sobe depressa, desce devagar (sem dar saltos no tempo)
  // a diferença de relógios também muda devagar (a mínima da janela salta quando sai da janela: antes isso fazia o boneco saltar para trás)
  if (T.offS == null) T.offS = T.off; else T.offS += Math.max(-dtm * 0.08, Math.min(dtm * 0.08, T.off - T.offS));
  const rt = now - T.offS - T.delay; out.rt = rt;
  let a = B[0], b = null;
  if (rt <= a.ts) { out.x = a.x; out.z = a.z; out.y = a.y; out.yaw = a.yaw; out.s = a; out.lag = 0; return out; }
  for (let i = B.length - 1; i >= 0; i--) if (B[i].ts <= rt) { a = B[i]; b = B[i + 1] || null; break; }
  // descarta o que já passou (fica uma para trás)
  while (B.length > 2 && B[1].ts < rt - 200) B.shift();
  if (b) { const f = (rt - a.ts) / Math.max(1, b.ts - a.ts); out.x = a.x + (b.x - a.x) * f; out.z = a.z + (b.z - a.z) * f; out.y = a.y + (b.y - a.y) * f; out.yaw = angLerp(a.yaw, b.yaw, f); out.s = f < 0.5 ? a : b; out.lag = 0; return out; }
  // passou da última: continua no mesmo andamento até 150 ms (e abranda), depois espera
  const p = B[B.length - 2], ex = Math.min(150, rt - a.ts), exs = ex < 80 ? ex : 80 + (ex - 80) * 0.4;
  if (p && a.ts > p.ts && a.ts - p.ts < 250) { const k = exs / (a.ts - p.ts); out.x = a.x + (a.x - p.x) * k; out.z = a.z + (a.z - p.z) * k; out.y = a.y; } else { out.x = a.x; out.z = a.z; out.y = a.y; }
  out.yaw = a.yaw; out.s = a; out.lag = rt - a.ts; return out;
};
