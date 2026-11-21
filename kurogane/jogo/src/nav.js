// Caminhos dos zombies: A* numa grelha de 35 cm feita na hora, só à volta do zombie e do alvo.
// Paredes, vidros, portas fechadas, árvores e rochas bloqueiam (com a largura do zombie).
// Se não houver caminho (base toda fechada), devolve o caminho até ao ponto mais perto que consegue.
export function makeNav(near, MAP) {
  const C = 0.35, R = 0.2, MAXW = 200; // célula, raio do zombie, lado máximo da janela em células
  let blk = new Uint8Array(MAXW * MAXW), gs = new Float32Array(MAXW * MAXW), from = new Int32Array(MAXW * MAXW), seen = new Uint32Array(MAXW * MAXW), stamp = 1;
  const heap = [], hf = [];
  const push = (i, f) => { heap.push(i); hf.push(f); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hf[p], hf[k]] = [hf[k], hf[p]]; k = p; } };
  const pop = () => { const top = heap[0], lastI = heap.pop(), lastF = hf.pop(); if (heap.length) { heap[0] = lastI; hf[0] = lastF; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m; } } return top; };
  const blocks = (r, lv) => (r.lv || 0) === lv && !r.off && r.h > 0.4 && !((r.yb || 0) > 1.8) && !r.edge;
  return {
    // tenta com uma margem pequena; se não houver caminho, alarga a janela
    find(x0, z0, x1, z1, lv) { const a = this.find1(x0, z0, x1, z1, lv, 10, 7000); if (a.ok) return a; const b = this.find1(x0, z0, x1, z1, lv, 28, 16000); return b.ok || b.pts.length >= a.pts.length ? b : a; },
    find1(x0, z0, x1, z1, lv, mg, maxExp) {
      // janela: caixa à volta dos dois pontos, com margem, limitada
      let ax = Math.min(x0, x1) - mg, az = Math.min(z0, z1) - mg, bx = Math.max(x0, x1) + mg, bz = Math.max(z0, z1) + mg;
      const lim = MAXW * C; if (bx - ax > lim) { const c = (x0 + x1) / 2; ax = c - lim / 2; bx = c + lim / 2; } if (bz - az > lim) { const c = (z0 + z1) / 2; az = c - lim / 2; bz = c + lim / 2; }
      ax = Math.max(ax, -MAP); az = Math.max(az, -MAP); bx = Math.min(bx, MAP); bz = Math.min(bz, MAP);
      const W = Math.min(MAXW, Math.ceil((bx - ax) / C)), H = Math.min(MAXW, Math.ceil((bz - az) / C)), N = W * H;
      blk.fill(0, 0, N);
      const mark = (rx0, rz0, rx1, rz1) => { const i0 = Math.max(0, Math.ceil((rx0 - R - ax) / C - 0.5)), i1 = Math.min(W - 1, Math.floor((rx1 + R - ax) / C - 0.5)), j0 = Math.max(0, Math.ceil((rz0 - R - az) / C - 0.5)), j1 = Math.min(H - 1, Math.floor((rz1 + R - az) / C - 0.5)); if (i1 < i0 || j1 < j0) return; for (let j = j0; j <= j1; j++) blk.fill(1, j * W + i0, j * W + i1 + 1); };
      near(ax, az, bx, bz, r => { if (blocks(r, lv)) mark(r.x0, r.z0, r.x1, r.z1); }, c => { if ((c.lv || 0) === lv && c.on !== false && c.k === 's') mark(c.x - c.r * 0.8, c.z - c.r * 0.8, c.x + c.r * 0.8, c.z + c.r * 0.8); });
      const cl = (v, n) => Math.max(0, Math.min(n - 1, v));
      const si = cl(Math.floor((x0 - ax) / C), W), sj = cl(Math.floor((z0 - az) / C), H); let gi = cl(Math.floor((x1 - ax) / C), W), gj = cl(Math.floor((z1 - az) / C), H);
      // alvo dentro de um móvel ou parede: usa a casa livre mais perto
      if (blk[gj * W + gi]) { let bd = 1e9, bi = gi, bj = gj; for (let r = 1; r <= 6 && bd === 1e9; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const ni = gi + di, nj = gj + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H || blk[nj * W + ni]) continue; const d = di * di + dj * dj; if (d < bd) { bd = d; bi = ni; bj = nj; } } gi = bi; gj = bj; }
      const S = sj * W + si, Gl = gj * W + gi; blk[S] = 0;
      stamp++; if (stamp > 4e9) { seen.fill(0); stamp = 1; }
      heap.length = 0; hf.length = 0; gs[S] = 0; from[S] = -1; seen[S] = stamp; push(S, 0);
      const h = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return (dx + dz + (1.4142 - 2) * Math.min(dx, dz)); };
      let best = S, bh = h(si, sj), exp = 0, done = false;
      while (heap.length && exp < maxExp) { const cur = pop(); exp++; if (cur === Gl) { best = cur; done = true; break; }
        const ci = cur % W, cj = (cur / W) | 0, g0 = gs[cur]; const hh = h(ci, cj); if (hh < bh) { bh = hh; best = cur; }
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue; const n = nj * W + ni; if (blk[n]) continue;
          if (di && dj && (blk[cj * W + ni] || blk[nj * W + ci])) continue; // sem cortar cantos
          const g = g0 + (di && dj ? 1.4142 : 1); if (seen[n] === stamp && g >= gs[n]) continue; seen[n] = stamp; gs[n] = g; from[n] = cur; push(n, g + h(ni, nj)); } }
      // reconstrói e simplifica (só os cantos onde muda de direção)
      const pts = []; for (let k = best; k !== -1; k = from[k]) pts.push(k); pts.reverse();
      const out = []; let pdi = 9, pdj = 9;
      for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], di = (b % W) - (a % W), dj = ((b / W) | 0) - ((a / W) | 0); if (di !== pdi || dj !== pdj) { if (k > 1) out.push([ax + ((a % W) + 0.5) * C, az + (((a / W) | 0) + 0.5) * C]); pdi = di; pdj = dj; } }
      const last = pts[pts.length - 1]; out.push(done ? [x1, z1] : [ax + ((last % W) + 0.5) * C, az + (((last / W) | 0) + 0.5) * C]);
      if (this.dbg) { let t = ''; for (let j = 0; j < H; j++) { let row = ''; for (let i = 0; i < W; i++) { const k = j * W + i; row += k === S ? 'S' : k === Gl ? 'G' : blk[k] ? '#' : seen[k] === stamp ? '.' : ' '; } t += row + '\n'; } this.last = t; }
      return { pts: out, ok: done, exp };
    },
  };
}
