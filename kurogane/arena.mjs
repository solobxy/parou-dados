// Arena PvP de Tóquio: sala à parte no mesmo servidor (WebSocket em /arena). Vermelha contra Azul, sem rondas:
// entras, escolhes equipa e kit, morres e voltas a nascer na tua zona. Sem inventário guardado, sem zombies, sem loot.
// Fala o mesmo protocolo do mundo de sobrevivência (ok, st, s, shot, fx, hit, hitc), por isso o jogo usa o mesmo código de rede.
const NAME = /^[A-Za-z0-9_À-ÖØ-öø-ÿ-]{3,16}$/;
const AX = 3650, AZ = 3650, HW = 52, HD = 35; // limites da arena (com folga)
// munições: [velocidade, dano, penetração, arrasto] (iguais às do mundo)
const AM = { a9: [360, 30, 1.5, 0.0018], a9s: [300, 27, 1.3, 0.002], a556: [940, 34, 2.8, 0.0012], a762: [715, 40, 2.6, 0.0011], a308: [850, 95, 3.4, 0.0007], a357: [440, 48, 2, 0.0016], c12: [400, 16, 1, 0.004, 8], c12s: [490, 85, 2.2, 0.0022], a408: [900, 140, 4, 0.0005], a50: [850, 175, 5, 0.0004], a754: [825, 44, 3, 0.001] };
const HEAVY = new Set(['a408', 'a50']);
const TEAMS = [{ id: 'arena-r', nome: 'Equipa Vermelha' }, { id: 'arena-b', nome: 'Equipa Azul' }];
const KITS = ['atirador', 'assalto', 'sniper', 'pesado', 'apoio'];
const PROT = 2500; // proteção ao nascer (ms)
const num = (v, a, b, d = 0) => { v = +v; return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };

export function makeArena({ send }) {
  const players = new Map(); let nextId = 1e6, tickN = 0;
  const score = [0, 0]; let emptyT = 0;
  const bcast = (o, pred = () => true) => { for (const c of players.values()) if (c.p && pred(c)) send(c, o); };
  const info = t => ({ id: TEAMS[t].id, nome: TEAMS[t].nome, codigo: '', membros: [...players.values()].filter(c => c.p && c.p.team === t).map(c => c.p.name), arena: 1 });
  const counts = () => { const n = [0, 0]; for (const c of players.values()) if (c.p) n[c.p.team]++; return n; };
  const board = () => ({ t: 'asc', s: score, n: counts(), L: [...players.values()].filter(c => c.p).map(c => [c.p.name, c.p.team, c.p.k, c.p.d, c.p.kit]).sort((a, b) => b[2] - a[2] || a[3] - b[3]).slice(0, 40) });

  const hitTest = (O, D, k, L, tgt) => {
    const A = AM[k]; if (!A) return null; const [v0, dmg, pen, cd] = A; let x = O[0], y = O[1], z = O[2], vx = D[0] * v0, vy = D[1] * v0, vz = D[2] * v0, dist = 0; const h = 1 / 240;
    const segPt = (ax, ay, az, bx, by2, bz, px, py, pz) => { const dx = bx - ax, dy = by2 - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz || 1e-9; let t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(ax + dx * t - px, ay + dy * t - py, az + dz * t - pz); };
    for (let i = 0; i < 240 * 2 && dist < L + 0.6; i++) { const v = Math.hypot(vx, vy, vz), k2 = cd * v; vx -= vx * k2 * h; vy -= (vy * k2 + 9.81) * h; vz -= vz * k2 * h; const nx = x + vx * h, ny = y + vy * h, nz = z + vz * h, step = Math.hypot(nx - x, ny - y, nz - z);
      if (dist >= L) break;
      for (const T of tgt) { const by = T.y; if (Math.abs(nx - T.x) > 3 || Math.abs(nz - T.z) > 3) continue;
        if (segPt(x, y, z, nx, ny, nz, T.x, by + 1.62, T.z) < 0.17) return { T, zone: 'head', dmg, pen, v: Math.hypot(vx, vy, vz) / v0, dist };
        for (let s = 0; s <= 4; s++) { const sy = by + 0.15 + s * 0.3; if (segPt(x, y, z, nx, ny, nz, T.x, sy, T.z) < 0.3) return { T, zone: sy > 0.85 ? 'body' : 'legs', dmg, pen, v: Math.hypot(vx, vy, vz) / v0, dist }; } }
      x = nx; y = ny; z = nz; dist += step; }
    return null;
  };
  const kill = (killer, victim, how) => {
    victim.d++; if (killer && killer !== victim && killer.team !== victim.team) { killer.k++; score[killer.team]++; }
    bcast({ t: 'akf', k: killer && killer !== victim ? killer.name : null, kt: killer ? killer.team : -1, v: victim.name, vt: victim.team, w: how || '' }); bcast(board());
  };
  const shot = (c, m) => {
    const p = c.p, now = Date.now(); if (!p.alive) return; if (now - (p.spawnT || 0) < PROT) p.spawnT = now - PROT; // quem dispara perde a proteção de nascer { p.shB = Math.min(3, (p.shB ?? 3) + (now - (p.lastShot || 0)) / 60); p.lastShot = now; if (p.shB < 1) return; p.shB -= 1; }
    const O = Array.isArray(m.o) ? m.o.map(v => num(v, -4100, 4100)) : null, D = Array.isArray(m.d) ? m.d.map(v => num(v, -1, 1)) : null; if (!O || !D || O.length !== 3 || D.length !== 3) return;
    if (Math.hypot(O[0] - p.x, O[2] - p.z) > 3) return; const dl = Math.hypot(D[0], D[1], D[2]) || 1; D[0] /= dl; D[1] /= dl; D[2] /= dl;
    const k = String(m.k || ''), n = Math.min(8, num(m.n, 1, 8, 1) | 0), L = num(m.L, 0, 400, 200), sup = !!m.sup;
    bcast({ t: 'fx', id: c.id, o: O, d: D, sup, hv: HEAVY.has(k) ? 1 : 0, k: k.slice(0, 16) }, o => o !== c);
    const tgt = [];
    for (const o of players.values()) if (o !== c && o.p && o.p.alive && o.p.team !== p.team && now - (o.p.spawnT || 0) > PROT && (o.p.lv || 0) === (p.lv || 0)) {
      const P = (o.p.hist || []).filter(h => now - h[0] <= 600).map(h => [h[1], h[2], h[3]]); P.push([o.p.x, o.p.y, o.p.z]); tgt.push({ x: o.p.x, y: o.p.y, z: o.p.z, c: o });
      for (let i = P.length - 1; i > 0; i--) { const a = P[i], b = P[i - 1], dd = Math.hypot(b[0] - a[0], b[2] - a[2]); if (dd < 0.15 || dd > 6) continue; const nn = Math.min(8, Math.ceil(dd / 0.25)); for (let q = 1; q <= nn; q++) { const f = q / nn; tgt.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: a[2] + (b[2] - a[2]) * f, c: o }); } } }
    if (!tgt.length) return;
    const ds = Array.isArray(m.ds) ? m.ds.slice(0, n) : null, Ls = Array.isArray(m.Ls) ? m.Ls : null;
    for (let i = 0; i < n; i++) {
      let d = D; if (ds && Array.isArray(ds[i]) && ds[i].length === 3) { const q = ds[i].map(v => num(v, -1, 1)), ql = Math.hypot(q[0], q[1], q[2]) || 1; q[0] /= ql; q[1] /= ql; q[2] /= ql; if (q[0] * D[0] + q[1] * D[1] + q[2] * D[2] > Math.cos(0.3)) d = q; }
      const Li = Ls ? Math.min(L, num(Ls[i], 0, 400, L)) : L;
      const hh = hitTest(O, d, k, Li, tgt); if (!hh) continue; const T = hh.T, v = T.c.p; if (!v.alive) continue;
      let dmg = hh.dmg * (n > 1 ? Math.min(1, Math.max(0.25, 1 - hh.dist / 35)) : Math.max(0.3, Math.pow(hh.v, 1.5))) * (0.9 + Math.random() * 0.2);
      const [helm, vest] = v.ar || [0, 0]; let pop = null;
      if (hh.zone === 'head') { if (helm && hh.pen <= helm) { v.hd = (v.hd ?? 20) - dmg; dmg *= 0.8; if (v.hd <= 0) { pop = 'head'; v.ar[0] = 0; v.hd = null; } } else dmg = n > 1 ? dmg * 2.5 : 999; }
      else if (hh.zone === 'body') { dmg *= 1.2; if (vest && hh.pen <= vest) { v.vd = (v.vd ?? (vest >= 3 ? 50 : 25)) - dmg; dmg *= 0.8; if (v.vd <= 0) { pop = 'vest'; v.ar[1] = 0; v.vd = null; } } else if (vest) dmg *= 0.85; }
      else dmg *= 0.6;
      v.hp = Math.max(0, v.hp - dmg); const kl = v.hp <= 0; if (kl) { v.alive = false; v.deadT = now; kill(p, v, k); }
      send(T.c, { t: 'hit', by: p.name, dmg: +dmg.toFixed(1), zone: hh.zone, hp: v.hp, pop });
      send(c, { t: 'hitc', on: T.c.id, zone: hh.zone, kill: kl, name: v.name });
    }
  };
  const msg = (c, m) => {
    if (m.t === 'hi') {
      if (c.p) return; const name = String(m.name || ''); if (!NAME.test(name)) return send(c, { t: 'erro', e: 'nome' });
      if ((m.pv | 0) < 4) return send(c, { t: 'erro', e: 'versao' });
      if ([...players.values()].some(o => o.p && o.p.name.toLowerCase() === name.toLowerCase())) return send(c, { t: 'erro', e: 'nome_em_uso' });
      const n = counts(); let team = m.team === 0 || m.team === 1 ? m.team : (n[0] <= n[1] ? 0 : 1);
      const look = m.look && typeof m.look === 'object' ? Object.fromEntries(Object.entries(m.look).filter(([k, v]) => ['skin', 'hair', 'top', 'legs', 'hairS', 'beardS'].includes(k) && typeof v === 'number')) : {};
      const now = Date.now();
      c.p = { name, look, team, kit: KITS.includes(m.kit) ? m.kit : 'atirador', clan: TEAMS[team].id, x: AX, z: AZ, y: 0, lv: 0, yaw: 0, mv: 0, an: 0, w: '', hp: 100, alive: false, ar: [0, 0], k: 0, d: 0, spawnT: now, hist: [], lastSt: 0 };
      send(c, { t: 'ok', id: c.id, tok: '', killed: false, resume: null, drop: null, role: null, players: [...players.values()].filter(o => o.p && o !== c).map(o => [o.id, o.p.name, o.p.look, o.p.clan]), sleep: [], clan: info(team), uid: '', vapid: null, inv: null,
        w: { cyc0: now - 1920e3 * 0.62, now, wx: 0, base: { p: [], d: [] }, locks: [], doors: [], nodes: [], bags: [], zseed: false }, arena: { team, score, n: counts() } });
      bcast({ t: 'join', id: c.id, name, look, clan: c.p.clan, quiet: 0 }, o => o !== c); bcast({ t: 'clan', info: info(team) }, o => o !== c && o.p.team === team); bcast(board());
      return;
    }
    const p = c.p; if (!p) return; const now = Date.now();
    if (m.t === 'st') {
      if (!m.al && p.alive) { p.alive = false; p.deadT = now; } // só se volta à vida com 'aspawn' (um 'st' atrasado não ressuscita quem o servidor já matou)
      p.x = num(m.x, AX - HW, AX + HW, AX); p.z = num(m.z, AZ - HD, AZ + HD, AZ); p.y = num(m.y, -5, 20); p.lv = num(m.lv, 0, 3) | 0;
      { const H = p.hist; H.push([now, p.x, p.y, p.z]); while (H.length > 2 && now - H[0][0] > 650) H.shift(); }
      p.ts = num(m.ts, 0, 1e13, 0); p.yaw = num(m.yaw, -10, 10); p.mv = num(m.mv, 0, 3); p.an = num(m.an, 0, 127) | 0; p.w = typeof m.w === 'string' ? m.w.slice(0, 12) : '';
      if (p.alive) p.hp = Math.min(num(m.hp, 0, 100, p.hp), p.hp + 3);
      if (Array.isArray(m.ar)) { const a = [num(m.ar[0], 0, 4) | 0, num(m.ar[1], 0, 4) | 0]; if (a[0] !== p.ar[0]) p.hd = null; if (a[1] !== p.ar[1]) p.vd = null; p.ar = a; }
      p.gk = typeof m.gk === 'string' ? m.gk.slice(0, 80) : ''; return;
    }
    if (m.t === 'shot') { shot(c, m); return; }
    if (m.t === 'aspawn') { if (p.alive) return; if (p.deadT && now - p.deadT < 2500) return; p.alive = true; p.hp = 100; p.spawnT = now; p.hd = p.vd = null; p.hist = []; p.x = num(m.x, AX - HW, AX + HW, AX); p.z = num(m.z, AZ - HD, AZ + HD, AZ); return; } // renascer (no mínimo 2,5 s depois de morrer)
    if (m.t === 'died') { if (!p.alive) return; p.alive = false; p.hp = 0; p.deadT = now; let by = typeof m.by === 'string' ? [...players.values()].find(o => o.p && o.p.name === m.by) : null;
      // morte que não foi por tiro (granada): só conta para o outro se ele lançou uma granada há pouco, perto daqui
      if (by && !(by.p.thrs || []).some(q => q.B && now - q.t < 12000 && Math.hypot(q.B[0] - p.x, q.B[1] - p.z) < 12)) by = null; // só se uma granada dele rebentou perto de ti
      kill(by ? by.p : null, p, by ? 'granada' : (m.how || 'queda')); return; }
    if (m.t === 'ateam') { const t = m.team === 1 ? 1 : 0; if (t === p.team) return; const old = p.team; p.team = t; p.clan = TEAMS[t].id; if (p.alive) { p.alive = false; } send(c, { t: 'clan', info: info(t) }); bcast({ t: 'pclan', id: c.id, clan: p.clan }); for (const tt of [old, t]) bcast({ t: 'clan', info: info(tt) }, o => o !== c && o.p.team === tt); bcast(board()); return; }
    if (m.t === 'akit') { if (KITS.includes(m.kit)) p.kit = m.kit; return; }
    if (m.t === 'thr') { if (m.k !== 'gran') return; const P = Array.isArray(m.P) ? m.P.slice(0, 3).map(v => num(v, -4100, 4100)) : null; if (!P || P.length !== 3 || Math.hypot(P[0] - p.x, P[2] - p.z) > 6) return;
      p.thrs = (p.thrs || []).filter(q => now - q.t < 8000); p.thrs.push({ t: now, P });
      bcast({ t: 'thr', k: 'gran', P, lv: num(m.lv, 0, 6) | 0, V: Array.isArray(m.V) ? m.V.slice(0, 3).map(v => num(v, -60, 60)) : [0, 0, 0], base: num(m.base, 0, 30), by: p.name }, o => o !== c); return; }
    if (m.t === 'boom') { if (m.k !== 'gran') return; const x = num(m.x, -4100, 4100), z = num(m.z, -4100, 4100), y = num(m.y, -5, 40), lv = num(m.lv, 0, 6) | 0; // granada que rebentou: só se a lançou há pouco e perto
      const q0 = (p.thrs || []).find(q => !q.used && now - q.t < 9000 && Math.hypot(q.P[0] - x, q.P[2] - z) < 60); if (!q0) return; q0.used = true; q0.B = [x, z]; // cada granada rebenta uma vez; fica registada para dar a baixa a quem a lançou
      for (const o of players.values()) if (o !== c && o.p) send(o, { t: 'boom', k: 'gran', x, y, z, lv, by: p.name, nd: o.p.team === p.team ? 1 : 0 }); return; }
    if (m.t === 'ping') { send(c, { t: 'pong', k: m.k }); return; }
    if (m.t === 'lb' || m.t === 'asc') { send(c, board()); return; }
  };
  const drop = c => { const p = c.p; players.delete(c.id); if (!p) return; bcast({ t: 'left', id: c.id, quiet: 0, arena: 1 }); bcast({ t: 'clan', info: info(p.team) }, o => o.p.team === p.team); bcast(board()); };
  const add = c => { c.id = nextId++; players.set(c.id, c); };
  setInterval(() => {
    const L = [...players.values()].filter(c => c.p); tickN++;
    if (!L.length) { if (!emptyT) emptyT = Date.now(); else if (Date.now() - emptyT > 120e3) { score[0] = score[1] = 0; } return; } emptyT = 0;
    for (const c of L) { const out = []; for (const o of L) { if (o === c) continue; const q = o.p; out.push([o.id, +q.x.toFixed(2), +q.z.toFixed(2), +q.y.toFixed(2), q.lv, +q.yaw.toFixed(2), +q.mv.toFixed(2), q.an, q.w, Math.round(q.hp), q.alive ? 1 : 0, 0, q.ar, Math.round(q.ts || 0), q.gk || '']); } send(c, { t: 's', ps: out }); }
  }, 33);
  return { add, msg, drop, count: () => [...players.values()].filter(c => c.p).length, score };
}
