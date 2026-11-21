// Carros: conduzir (com gasolina e estragos), levar passageiros, atropelar zombies. Online, quem conduz simula o carro
// e manda a posição; os outros veem-no a andar. Parados ficam onde os deixaram (para todos).
import * as THREE from 'three';

const MAXF = 17, MAXOFF = 9, MAXR = 5, ACC = 6.5, BRK = 14, HP = 400, TANK = 40, USE = 0.012; // m/s, m/s², litros, litros por metro
const SEATS = [[-0.42, 0.75, 0.15], [0.42, 0.75, 0.15], [-0.42, 0.75, -0.9], [0.42, 0.75, -0.9]]; // condutor à esquerda
const COLS = [0x8a2a22, 0x2a5a8a, 0xd8d6d0, 0x3a3d40, 0x4a5a3a, 0xc8a23a];
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function makeCars({ scene, G, W, collide, solidAt, groundY, addRect, removeRect, audio, hurtZombie, sameLevel }) {
  const list = [], byId = new Map();
  const M = (hex, o = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: o.r ?? 0.55, metalness: o.m ?? 0.25, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 0 });
  const glass = M(0x1c242a, { r: 0.15, m: 0.6 }), tyre = M(0x1b1b1c, { r: 0.9, m: 0 }), rim = M(0x8a8e92, { r: 0.4, m: 0.7 }), lamp = M(0xfff4d8, { e: 0xfff1c8, ei: 0.2, r: 0.3 }), tail = M(0x7a1410, { e: 0xc02010, ei: 0.3 }), dark = M(0x26282a, { r: 0.8 });
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16); wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 10); rimGeo.rotateZ(Math.PI / 2);
  const box = (w, h, d, m, x, y, z, g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  const mkMesh = col => {
    const g = new THREE.Group(), body = M(col), wheels = [];
    box(1.84, 0.62, 4.1, body, 0, 0.62, 0, g); // carroçaria
    box(1.66, 0.58, 2.05, body, 0, 1.2, -0.25, g); // cabine
    box(1.62, 0.5, 0.06, glass, 0, 1.2, 0.79, g).rotation.x = -0.38; box(1.62, 0.46, 0.06, glass, 0, 1.2, -1.29, g).rotation.x = 0.35; // vidros da frente e de trás
    for (const sx of [-1, 1]) box(0.04, 0.4, 1.7, glass, sx * 0.84, 1.22, -0.25, g);
    box(1.86, 0.16, 0.12, dark, 0, 0.42, 2.06, g); box(1.86, 0.16, 0.12, dark, 0, 0.42, -2.06, g); // para-choques
    for (const sx of [-1, 1]) { box(0.36, 0.14, 0.05, lamp, sx * 0.62, 0.72, 2.06, g); box(0.34, 0.14, 0.05, tail, sx * 0.64, 0.74, -2.06, g); }
    for (const [x, z] of [[-0.86, 1.3], [0.86, 1.3], [-0.86, -1.3], [0.86, -1.3]]) { const w = new THREE.Group(); w.position.set(x, 0.34, z); const t = new THREE.Mesh(wheelGeo, tyre); t.castShadow = true; w.add(t); w.add(new THREE.Mesh(rimGeo, rim)); g.add(w); wheels.push(w); }
    // pessoas sentadas (cabeças), para se ver quem vai lá dentro
    const heads = SEATS.map(([x, y, z]) => { const h = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), M(0xd9a882, { r: 0.8, m: 0 })); h.position.set(x, y + 0.6, z); h.visible = false; g.add(h); return h; });
    scene.add(g); return { g, wheels, heads, lamp, tail };
  };
  // obstáculo para quem anda a pé e para os zombies (só quando está parado)
  const setRect = c => { if (c.rc) { removeRect(c.rc); c.rc = null; } if (c.dead === 'gone') return; const cs = Math.abs(Math.cos(c.yaw)), sn = Math.abs(Math.sin(c.yaw)), hw = (1.84 * cs + 4.1 * sn) / 2, hl = (1.84 * sn + 4.1 * cs) / 2; c.rc = { x0: c.x - hw, x1: c.x + hw, z0: c.z - hl, z1: c.z + hl, k: 's', h: 1.4, lv: 0, car: c }; addRect(c.rc); c.rcx = c.x; c.rcz = c.z; c.rcy = c.yaw; };
  const add = (id, x, z, yaw, o = {}) => {
    const c = { id, x, z, yaw, v: 0, fuel: o.fuel ?? 20, hp: o.hp ?? HP, seats: [0, 0, 0, 0], buf: null, spin: 0, col: COLS[Math.abs(Math.round(x * 7 + z * 13)) % COLS.length] };
    c.m = mkMesh(c.col); list.push(c); byId.set(id, c); setRect(c); place(c); return c;
  };
  const del = c => { if (c.rc) removeRect(c.rc); scene.remove(c.m.g); const i = list.indexOf(c); if (i >= 0) list.splice(i, 1); byId.delete(c.id); };
  const place = c => { c.m.g.position.set(c.x, groundY(c.x, c.z, 0), c.z); c.m.g.rotation.y = c.yaw; };
  const burnt = M(0x2a2624, { r: 0.95, m: 0.1 });
  const wreck = c => { if (c.dead) return; c.dead = true; c.v = 0; c.m.g.traverse(o => { if (o.isMesh && o.material !== glass && o.material !== tyre) o.material = burnt; }); };
  const onRoad = (x, z) => { for (const r of W.roads) if (x > r.x0 - 0.5 && x < r.x1 + 0.5 && z > r.z0 - 0.5 && z < r.z1 + 0.5) return true; return false; };
  const me = () => (G.net && G.net.on ? G.net.id : -1);
  const C = {
    list,
    get mine() { return G.car || null; },
    // onde há carros no início: na estrada, perto das vilas (iguais em todos os aparelhos)
    spawnPoints() { const out = []; for (const zn of W.zones) { if (zn.kind !== 'town') continue;
        for (let k = 0; k < 40; k++) { const a = k * 2.39996, d = 14 + (k % 8) * 3, x = zn.x + Math.sin(a) * d, z = zn.z + Math.cos(a) * d; if (!onRoad(x, z) || solidAt(x, z, 2.6)) continue; let yaw = 0; for (const r of W.roads) if (x > r.x0 - 0.5 && x < r.x1 + 0.5 && z > r.z0 - 0.5 && z < r.z1 + 0.5) { yaw = r.x1 - r.x0 > r.z1 - r.z0 ? Math.PI / 2 : 0; break; } out.push([+x.toFixed(1), +z.toFixed(1), yaw]); break; } }
      return out; },
    // sem servidor: os carros são deste aparelho
    spawnLocal() { for (const c of [...list]) del(c); this.spawnPoints().forEach(([x, z, yaw], i) => add('L' + i, x, z, yaw, { fuel: 10 + (i * 7) % 21 })); },
    clear() { G.car = null; for (const c of [...list]) del(c); },
    // perto de um carro (para entrar ou pôr gasolina)
    nearest(p, r = 3.2) { let best = null, bd = r; for (const c of list) { if (c.hp <= 0) continue; const d = Math.hypot(c.x - p.x, c.z - p.z) - 1.2; if (d < bd) { bd = d; best = c; } } return best; },
    seatFree(c) { return c.seats.findIndex(s => !s); },
    // entrar: o primeiro lugar livre (o do condutor primeiro)
    enter(c) { const i = this.seatFree(c); if (i < 0) { G.ui.toast('O carro está cheio'); return; } if (G.net && G.net.world) { G.net.raw({ t: 'cin', id: c.id, seat: i }); return; } this.seated(c, i); },
    seated(c, i) { c.seats[i] = me(); G.car = c; G.carSeat = i; G.aimEnd && G.aimEnd(); G.setAuto && G.setAuto(false); audio.play('porta', 0.7); if (i === 0) { G.ui.toast(c.fuel > 0.5 ? 'A conduzir · gasolina ' + Math.round(c.fuel) + ' L' : 'Sem gasolina: precisas de um galão'); if (c.rc) { removeRect(c.rc); c.rc = null; } } else G.ui.toast('Vais de passageiro'); },
    exit(net = true) { const c = G.car; if (!c) return; const p = G.p, s = G.carSeat; c.seats[s] = 0; G.car = null; if (net && G.net && G.net.world) G.net.raw({ t: 'cout', id: c.id });
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw); // lado esquerdo do carro
      for (const [a, b] of [[1.5, 0], [-1.5, 0], [0, -2.8], [0, 2.8], [2.4, 1], [-2.4, 1]]) { const x = c.x + lx * a * (s % 2 ? -1 : 1) + fx * b, z = c.z + lz * a * (s % 2 ? -1 : 1) + fz * b; if (!solidAt(x, z, 0.4)) { p.x = x; p.z = z; break; } }
      p.vx = p.vz = 0; audio.play('portaF', 0.7); if (!c.seats[0] && Math.abs(c.v) < 0.5) { c.v = 0; setRect(c); } },
    refuel(c, it) { const add = Math.min(TANK - c.fuel, 20); if (add < 0.5) { G.ui.toast('O depósito está cheio'); return false; } c.fuel += add; if (G.net && G.net.world) G.net.raw({ t: 'cf', id: c.id, add }); G.ui.toast('Gasolina: ' + Math.round(c.fuel) + ' L'); audio.play('apanhar'); return true; },
    // conduzir: polegar = para onde queres ir no ecrã (para trás faz marcha-atrás); no PC, W/S acelera e trava, A/D vira
    drive(dt, inp) {
      const c = G.car; if (!c || G.carSeat !== 0) return;
      let t = 0, sy = 0;
      if (inp.kb) { t = inp.t; sy = inp.s; }
      else if (inp.m > 0.15) { const diff = angDiff(inp.yaw, c.yaw); if (Math.abs(diff) > 2.2 && c.v < 2) { t = -inp.m; sy = -clamp(angDiff(inp.yaw + Math.PI, c.yaw) * 1.4, -1, 1); } else { t = inp.m * (Math.abs(diff) > 1.6 ? 0.35 : 1); sy = clamp(diff * 1.4, -1, 1); } }
      if (c.hp <= 0 || c.fuel <= 0) t = 0;
      const road = onRoad(c.x, c.z), vmax = t >= 0 ? (road ? MAXF : MAXOFF) : MAXR;
      if (t > 0) c.v += (c.v < 0 ? BRK : ACC) * t * dt; else if (t < 0) c.v += (c.v > 0 ? BRK : ACC * 0.7) * t * dt; else c.v -= Math.sign(c.v) * Math.min(Math.abs(c.v), 2.2 * dt);
      c.v = clamp(c.v, -MAXR, vmax + (Math.abs(c.v) > vmax ? 0 : 0)); if (c.v > vmax) c.v = Math.max(vmax, c.v - 6 * dt);
      c.yaw += sy * 1.75 * Math.min(1, Math.abs(c.v) / 5) * Math.sign(c.v || 1) * dt;
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); c.x += fx * c.v * dt; c.z += fz * c.v * dt;
      c.fuel = Math.max(0, c.fuel - Math.abs(c.v) * dt * USE);
      // batidas: três círculos ao longo do carro
      let px = 0, pz = 0, n = 0; for (const k of [-1.45, 0, 1.45]) { const o = { x: c.x + fx * k, z: c.z + fz * k, lv: 0, h: 0 }, ox = o.x, oz = o.z; collide(o, 0.95); if (Math.abs(o.x - ox) + Math.abs(o.z - oz) > 1e-4) { px += o.x - ox; pz += o.z - oz; n++; } }
      if (n) { c.x += px / n; c.z += pz / n; const sp = Math.abs(c.v); if (sp > 4) { c.hp = Math.max(0, c.hp - (sp - 4) * 9); audio.play('partir', Math.min(1, sp / 12)); G.buzz && G.buzz(40); G.shakeT = Math.max(G.shakeT || 0, Math.min(0.5, sp / 30)); if (c.hp <= 0) G.ui.toast('O carro ficou desfeito'); } c.v *= sp > 4 ? -0.2 : 0.4; }
      // atropelar: zombies (e, online, outros jogadores)
      const sp = Math.abs(c.v); const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
      const inside = (x, z) => { const dx = x - c.x, dz = z - c.z, a = dx * fx + dz * fz, b = dx * rx + dz * rz; return Math.abs(a) < 2.35 && Math.abs(b) < 1.25 ? { a, b } : null; };
      for (const z of G.zs) { if (z.state === 'dead' || (z.lv || 0) !== 0 || Math.abs(z.x - c.x) > 3 || Math.abs(z.z - c.z) > 3) continue; const q = inside(z.x, z.z); if (!q) continue;
        if (sp > 3.5 && (z.carT || 0) < G.t) { z.carT = G.t + 0.6; hurtZombie(z, sp * 9, fx * Math.sign(c.v), fz * Math.sign(c.v), { zone: 'body', at: new THREE.Vector3(z.x, 1, z.z) }); c.hp = Math.max(0, c.hp - 2); c.v *= 0.85; }
        else if (!z.remote) { const s = q.b >= 0 ? 1 : -1; z.x += rx * s * 0.25; z.z += rz * s * 0.25; } }
      if (G.net && G.net.on && sp > 3.5) for (const r of G.net.R.values()) { if (!r.s1 || !r.s1[10] || (r.s1[7] & 8)) continue; if (!inside(r.x, r.z) || (r.carT || 0) > G.t) continue; r.carT = G.t + 0.8; G.net.raw({ t: 'ck', to: r.id, dmg: +(sp * 6).toFixed(1) }); }
      c.spin += c.v * dt / 0.34;
    },
    // cada imagem: mexe os carros dos outros (suave), as rodas, as luzes e quem vai lá dentro; põe-te no teu lugar
    update(dt) {
      const now = performance.now();
      for (const c of list) {
        if (c.buf && c.buf.length && !(c === G.car && G.carSeat === 0)) { const B = c.buf, tR = now - 120; let a = null, b = null; for (let k = B.length - 1; k >= 0; k--) if (B[k].t <= tR) { a = B[k]; b = B[k + 1] || B[k]; break; } if (!a) a = b = B[0];
          const f = b === a ? 1 : clamp((tR - a.t) / (b.t - a.t), 0, 1); const nx = a.x + (b.x - a.x) * f, nz = a.z + (b.z - a.z) * f; c.spin += Math.hypot(nx - c.x, nz - c.z) * Math.sign(b.v || 1) / 0.34; c.x = nx; c.z = nz; c.yaw = a.yaw + angDiff(b.yaw, a.yaw) * f; c.v = b.v; }
        if (c.hp <= 0) wreck(c); place(c); for (const w of c.m.wheels) w.rotation.x = c.spin;
        const night = 1 - (G.day ?? 1); c.m.lamp.emissiveIntensity = c.seats[0] ? 0.4 + night * 2.4 : 0.15; c.m.tail.emissiveIntensity = c.seats[0] ? (c.v < -0.2 || (c === G.car && c.brk) ? 1.8 : 0.5) : 0.2;
        c.m.heads.forEach((h, i) => h.visible = !!c.seats[i] && !(c === G.car && G.fp));
        // parado e sem condutor: volta a ser um obstáculo
        if (!c.seats[0] && Math.abs(c.v) < 0.3 && (!c.rc || Math.hypot(c.x - c.rcx, c.z - c.rcz) > 0.15 || Math.abs(angDiff(c.yaw, c.rcy)) > 0.05)) setRect(c);
        else if (c.seats[0] && c.rc && (c === G.car || Math.abs(c.v) > 0.3)) { removeRect(c.rc); c.rc = null; }
      }
      const c = G.car, p = G.p; if (!c || !p) { if (audio.engine) audio.engine(0, 0); return; }
      const [sx, , sz] = SEATS[G.carSeat]; const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw); p.x = c.x + sx * cs + sz * sn; p.z = c.z - sx * sn + sz * cs; p.vx = p.vz = 0; p.root = p.yaw = p.aim = c.yaw; p.lv = 0; p.base = 0;
      audio.engine && audio.engine(G.carSeat === 0 && c.fuel > 0 && c.hp > 0 ? 1 : 0, Math.abs(c.v) / MAXF);
    },
    // online: os carros que o servidor manda (e quem vai em cada lugar)
    rows(U) { const now = performance.now(), my = me();
      for (const [id, x10, z10, y100, v10, fuel, hp, d0, s1, s2, s3] of U) { let c = byId.get(id); const x = x10 / 10, z = z10 / 10, yaw = y100 / 100;
        if (!c) { c = add(id, x, z, yaw, { fuel, hp }); }
        const seats = [d0, s1, s2, s3]; c.seats = seats; c.hp = hp;
        if (G.car === c && !seats.includes(my)) { c.seats[G.carSeat] = my; this.exit(false); c.seats = seats; G.ui.toast(hp <= 0 ? 'O carro ficou desfeito' : 'Saíste do carro'); }
        if (G.car === c && G.carSeat === 0) continue; // o teu: a posição és tu que mandas
        c.fuel = fuel; if (d0) { (c.buf || (c.buf = [])).push({ t: now, x, z, yaw, v: v10 / 10 }); if (c.buf.length > 10) c.buf.shift(); } else { c.buf = null; c.x = x; c.z = z; c.yaw = yaw; c.v = 0; }
        if (hp <= 0) wreck(c); }
    },
    gone(ids) { for (const id of ids) { const c = byId.get(id); if (c && c !== G.car) del(c); } },
    up() { const c = G.car; if (!c || G.carSeat !== 0) return null; const a = [c.id, Math.round(c.x * 10), Math.round(c.z * 10), Math.round(c.yaw * 100), Math.round(c.v * 10), +c.fuel.toFixed(1), Math.round(c.hp)], sg = a.join(); if (sg === c.sent) return null; c.sent = sg; return a; },
  };
  return C;
}
