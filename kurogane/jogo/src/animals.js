// Animais: veados, javalis, lobos, cães e galinhas. Vivem na mesma lista que os zombies (G.zs, com z.an = espécie), por isso
// usam o mesmo caminho na rede (o jogador mais perto simula-os, o servidor guarda vida e mortes) e as mesmas balas.
// Aqui ficam: as espécies, onde nascem, como se mexem (cada uma à sua maneira), os volumes onde as balas acertam e o desenho.
import * as THREE from 'three';
import { Builder } from './builder.js';

const geoOf = fn => { const b = new Builder(0); fn(b); return b.merged('v'); };

// k: número da espécie no servidor (0–2 são zombies). hp: vida. walk/run: m/s. sense: a que distância te nota (de dia).
// hip: [x, y, z] das ancas da frente e de trás; leg: comprimento da perna. body: caixa onde as balas acertam (centro e medidas); head: esfera.
export const ANK = {
  veado: { k: 3, n: 'Veado', hp: 90, walk: 1.3, run: 9.5, sense: 32, hipF: [0.17, 0.82, 0.48], hipB: [0.17, 0.84, -0.46], leg: 0.8, body: [0, 1.0, 0, 0.42, 0.48, 1.25], head: [0, 1.48, 0.86, 0.17], r: 0.45, cols: [0xffffff, 0xe8dccb, 0xd8c8b0] },
  javali: { k: 4, n: 'Javali', hp: 140, walk: 1.0, run: 7.0, sense: 9, hipF: [0.15, 0.45, 0.36], hipB: [0.15, 0.48, -0.36], leg: 0.43, body: [0, 0.62, 0, 0.48, 0.55, 1.05], head: [0, 0.56, 0.68, 0.2], r: 0.45, dmg: 12, cols: [0xffffff, 0xd0c8c0, 0xb8b0a8] },
  lobo: { k: 5, n: 'Lobo', hp: 85, walk: 1.4, run: 6.6, sense: 30, hipF: [0.12, 0.52, 0.34], hipB: [0.12, 0.54, -0.34], leg: 0.52, body: [0, 0.7, 0, 0.34, 0.38, 0.95], head: [0, 0.86, 0.6, 0.15], r: 0.38, dmg: 7, cols: [0xffffff, 0xd8d4cc, 0xa8a49c, 0xe8e0d0] },
  cao: { k: 6, n: 'Cão', hp: 80, walk: 1.4, run: 7.4, sense: 14, hipF: [0.1, 0.4, 0.27], hipB: [0.1, 0.42, -0.27], leg: 0.4, body: [0, 0.55, 0, 0.28, 0.32, 0.78], head: [0, 0.7, 0.48, 0.13], r: 0.32, dmg: 22, cols: [0x5a4434, 0xc89a62, 0x2a2622, 0x9a7650, 0x6e5a48, 0xb08a5a] },
  galinha: { k: 7, n: 'Galinha', hp: 12, walk: 0.7, run: 3.6, sense: 5, hipF: [0.05, 0.16, 0.0], hipB: [0.05, 0.16, 0.0], leg: 0.16, body: [0, 0.27, 0, 0.22, 0.24, 0.3], head: [0, 0.43, 0.13, 0.07], r: 0.18, cols: [0xffffff, 0xb87a40, 0x4a3a2c] },
};
export const ANBYK = Object.fromEntries(Object.entries(ANK).map(([n, a]) => [a.k, n]));
// o que cada um deixa quando morre (servidor e jogo a sós)
export const ANLOOT = { veado: [['carneC', 5], ['couro', 2]], javali: [['carneC', 6], ['couro', 2]], lobo: [['carneC', 3], ['couro', 2]], cao: [['carneC', 2], ['couro', 1]], galinha: [['carneC', 1]] };

// ---------- onde nascem: veados e javalis na floresta, lobos em alcateias longe das terras, cães vadios nas vilas e galinhas nas quintas
export function spawnAnimals(W, ok, MAP) {
  const out = [], R = Math.random, add = (an, x, z, o = {}) => out.push({ an, x, z, ...o });
  const free = (x, z, m) => Math.abs(x) < MAP - 20 && Math.abs(z) < MAP - 20 && ok(x, z) && !W.zones.some(zn => Math.hypot(zn.x - x, zn.z - z) < zn.r + m);
  const group = (an, n, cx, cz, rad, o) => { for (let i = 0, t = 0; i < n && t < n * 8; t++) { const a = R() * 6.28, r = R() * rad, x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r; if (!ok(x, z)) continue; add(an, x, z, o); i++; } };
  const wild = (an, groups, n0, n1, m) => { for (let g = 0, t = 0; g < groups && t < groups * 40; t++) { const x = (R() * 2 - 1) * (MAP - 60), z = (R() * 2 - 1) * (MAP - 60); if (!free(x, z, m)) continue; group(an, n0 + Math.floor(R() * (n1 - n0 + 1)), x, z, 8, { pack: an === 'lobo' ? g + 1 : 0 }); g++; } };
  wild('veado', 42, 2, 4, 60);
  wild('javali', 30, 1, 3, 60);
  wild('lobo', 13, 3, 4, 200);
  for (const zn of W.zones) {
    if (zn.kind === 'town' || zn.kind === 'city') group('cao', zn.kind === 'city' ? 3 : 1 + (R() < 0.5 ? 1 : 0), zn.x, zn.z, Math.max(10, zn.r * 0.8));
    if (/quinta/i.test(zn.name || '') || zn.kind === 'farm') group('galinha', 5, zn.x, zn.z, Math.max(8, (zn.r || 20) * 0.6));
  }
  return out;
}

// ---------- pontos onde as balas acertam (no espaço do animal: frente em +z, chão em y = 0)
export const anHit = (a, lp, lq, segSph, segRBox, inflate) => {
  const S = ANK[a]; let best = null;
  const th = segSph(lp, lq, [S.head[0], S.head[1], S.head[2]], S.head[3] * inflate); if (th !== null) best = { s: th, zone: 'head' };
  const b = S.body, tb = segRBox(lp, lq, [b[0], b[1], b[2]], [b[3], b[4], b[5]], Math.min(b[3], b[4]) * 0.3, inflate);
  if (tb !== null && (!best || tb < best.s - 1e-5)) best = { s: tb, zone: 'body' };
  return best;
};
export const anPart = (a, zone) => { const S = ANK[a]; return zone === 'head' ? [S.head[0], S.head[1], S.head[2]] : [S.body[0], S.body[1], S.body[2]]; };

// ---------- comportamento (só nos animais que este jogo simula)
// ctx: { tgts, me, zs, collide, wet, night, hurtTarget(z, t, dmg), hurtZ(z, o, dmg), bark(z), sound(z, kind), myUid, ghillie(t) }
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function animalAI(z, dt, C) {
  const S = ANK[z.an]; if (!S) return;
  if (z.state === 'dead') return;
  z.think = (z.think || 0) - dt; z.atkCd = (z.atkCd || 0) - dt; if (z.atkT > 0) z.atkT -= dt;
  const hurt = z.hp < (z.hpSeen ?? z.hp); z.hpSeen = z.hp;
  // quem está mais perto (jogadores vivos e, para os lobos, também cães)
  let near = null, nd = 1e9; for (const t of C.tgts) { if (!t.alive || (t.lv || 0) !== (z.lv || 0)) continue; const d = Math.hypot(t.x - z.x, t.z - z.z); if (d < nd) { nd = d; near = t; } }
  const pet = z.an === 'cao' && z.pet; let tx = z.tx ?? z.x, tz = z.tz ?? z.z, sp = 0;
  if (pet) { // cão adotado: segue o dono, ataca zombies que se aproximem e ladra quando vem alguém
    const own = C.ownerOf(z);
    if (z.prey && (z.prey.state === 'dead' || Math.hypot(z.prey.x - z.x, z.prey.z - z.z) > 22)) z.prey = null;
    if (z.think <= 0) { z.think = 0.3;
      if (!z.prey && own && !z.stay) { let bz = null, bd = 14; for (const o of C.zs) { if (o === z || o.an || o.state === 'dead') continue; const d = Math.hypot(o.x - own.x, o.z - own.z); if (d < bd && (o.lv || 0) === (z.lv || 0)) { bd = d; bz = o; } } z.prey = bz; }
      // ladrar: zombies a perseguir ou outro jogador por perto que o dono ainda não vê
      z.barkT = (z.barkT || 0) - 0.3; if (z.barkT <= 0 && own) { let why = null; for (const o of C.zs) if (!o.an && o.state === 'chase' && Math.hypot(o.x - z.x, o.z - z.z) < 26) { why = o; break; } if (!why) for (const t of C.tgts) if (t !== own && t.remote && Math.hypot(t.x - z.x, t.z - z.z) < 30) { why = t; break; } if (why) { z.barkT = 4 + Math.random() * 3; C.bark(z, why); } }
    }
    if (z.prey) { tx = z.prey.x; tz = z.prey.z; sp = S.run; const d = Math.hypot(tx - z.x, tz - z.z); if (d < 1.2) { sp = 0; if (z.atkCd <= 0) { z.atkCd = 1.0; z.atkT = 0.35; C.hurtZ(z.prey, z, S.dmg); } } }
    else if (own && !z.stay) { const d = Math.hypot(own.x - z.x, own.z - z.z); if (d > 40) { z.x = own.x - Math.sin(own.yaw || 0) * 2; z.z = own.z - Math.cos(own.yaw || 0) * 2; } else if (d > 2.6) { tx = own.x - Math.sin(own.yaw || 0) * 1.6; tz = own.z - Math.cos(own.yaw || 0) * 1.6; sp = d > 9 ? S.run : d > 4 ? S.walk * 2.6 : S.walk; } }
    z.state = sp > S.walk * 2 ? 'chase' : 'wander';
  } else {
    const night = C.night ? 1.3 : 1, sense = S.sense * night * (near && C.ghillie(near) ? 0.55 : 1) * (near && near.sprint ? 1.6 : 1);
    const loud = C.noiseAt && Math.hypot(C.noiseAt.x - z.x, C.noiseAt.z - z.z) < C.noiseAt.r;
    if (z.think <= 0 || hurt || loud) { z.think = 0.3 + Math.random() * 0.2;
      if (z.an === 'veado' || z.an === 'galinha' || (z.an === 'cao' && !hurt)) { // fogem
        if ((near && nd < sense) || hurt || loud) { const fx = near ? z.x - near.x : z.x - (C.noiseAt ? C.noiseAt.x : z.x - 1), fz = near ? z.z - near.z : z.z - (C.noiseAt ? C.noiseAt.z : z.z), fl = Math.hypot(fx, fz) || 1; z.state = 'alert'; z.fleeT = 6; z.tx = z.x + fx / fl * 40 + (Math.random() - 0.5) * 12; z.tz = z.z + fz / fl * 40 + (Math.random() - 0.5) * 12; }
      } else if (z.an === 'javali') { // não ataca a não ser que chegues muito perto ou lhe acertes
        if (near && (nd < sense || hurt)) { z.state = 'chase'; z.tgt = near; z.mem = 6; } else if (z.state === 'chase' && (z.mem -= 0.3) <= 0) z.state = 'wander';
        if (z.hp < S.hp * 0.25 && near) { z.state = 'alert'; z.fleeT = 8; const fx = z.x - near.x, fz = z.z - near.z, fl = Math.hypot(fx, fz) || 1; z.tx = z.x + fx / fl * 40; z.tz = z.z + fz / fl * 40; }
      } else if (z.an === 'lobo') { // caçam em grupo; à noite veem mais longe; feridos e sozinhos fogem
        if (near && (nd < sense || hurt)) { z.state = 'chase'; z.tgt = near; z.mem = 8; if (!z.howl && C.howl) { z.howl = true; C.howl(z); } } else if (z.state === 'chase' && (z.mem -= 0.3) <= 0) { z.state = 'wander'; z.howl = false; }
        if (z.hp < S.hp * 0.3 && near) { z.state = 'alert'; z.fleeT = 10; const fx = z.x - near.x, fz = z.z - near.z, fl = Math.hypot(fx, fz) || 1; z.tx = z.x + fx / fl * 50; z.tz = z.z + fz / fl * 50; }
        if (z.state === 'chase' && C.pack) for (const o of C.pack(z)) if (o.state === 'wander') { o.state = 'chase'; o.tgt = z.tgt; o.mem = 8; }
      }
    }
    if (z.state === 'alert') { z.fleeT -= dt; sp = S.run; tx = z.tx; tz = z.tz; if (z.fleeT <= 0 || Math.hypot(tx - z.x, tz - z.z) < 2) { z.state = 'wander'; z.wT = 0; } }
    else if (z.state === 'chase' && z.tgt && z.tgt.alive) { tx = z.tgt.x; tz = z.tgt.z; sp = S.run; const d = Math.hypot(tx - z.x, tz - z.z);
      if (d < 1.35) { sp = z.an === 'javali' ? S.run * 0.5 : 0; if (z.atkCd <= 0) { z.atkCd = z.an === 'javali' ? 1.8 : 1.6; z.atkT = 0.4; C.hurtTarget(z, z.tgt, S.dmg * (0.8 + Math.random() * 0.4)); if (z.an === 'javali') { z.state = 'alert'; z.fleeT = 1.6; z.tx = z.x + Math.sin(z.yaw) * 10; z.tz = z.z + Math.cos(z.yaw) * 10; } } }
      if (Math.hypot(z.x - (z.hx ?? z.x), z.z - (z.hz ?? z.z)) > 160) { z.state = 'wander'; z.wT = 0; } }
    else { z.state = 'wander'; z.wT = (z.wT || 0) - dt; // pasta e vagueia à volta de casa, com paragens
      if (z.wT <= 0) { z.wT = 4 + Math.random() * 8; const hx = z.hx ?? z.x, hz = z.hz ?? z.z, far = Math.hypot(z.x - hx, z.z - hz) > 25, rad = z.an === 'galinha' ? 6 : 16; z.tx = (far ? hx : z.x) + (Math.random() - 0.5) * rad * 2; z.tz = (far ? hz : z.z) + (Math.random() - 0.5) * rad * 2; z.graze = Math.random() < 0.45; }
      tx = z.tx; tz = z.tz; sp = z.graze ? 0 : Math.hypot(tx - z.x, tz - z.z) > 0.8 ? S.walk : 0; }
  }
  if (sp > 0 && C.route && (pet || z.state === 'chase')) [tx, tz] = C.route(z, tx, tz, dt);
  // andar: vira com inércia e evita água
  const mx = tx - z.x, mz = tz - z.z, ml = Math.hypot(mx, mz); let des = z.yaw;
  if (ml > 0.2 && sp > 0) des = Math.atan2(mx, mz);
  const ahx = z.x + Math.sin(des) * 2, ahz = z.z + Math.cos(des) * 2; if (sp > 0 && C.wet(ahx, ahz)) { des += 1.6; z.wT = 0; if (z.state === 'alert') { z.tx = z.x + Math.sin(des) * 30; z.tz = z.z + Math.cos(des) * 30; } }
  z.yaw += clamp(angDiff(des, z.yaw), -5 * dt, 5 * dt);
  const al = Math.max(0, Math.cos(Math.min(Math.PI / 2, Math.abs(angDiff(des, z.yaw)))));
  z.v = (z.v || 0) + (sp * (0.25 + 0.75 * al) - (z.v || 0)) * Math.min(1, dt * (sp > z.v ? 2.5 : 4));
  const ox = z.x, oz = z.z; z.x += Math.sin(z.yaw) * z.v * dt; z.z += Math.cos(z.yaw) * z.v * dt; C.collide(z, S.r);
  for (const t of C.tgts) { if (t === z || !t.alive) continue; const qx = z.x - t.x, qz = z.z - t.z, q = Math.hypot(qx, qz), m = S.r + 0.35; if (q < m && q > 1e-4) { z.x = t.x + qx / q * m; z.z = t.z + qz / q * m; } }
  const moved = Math.hypot(z.x - ox, z.z - oz);
  if (sp > 0.3 && moved < sp * dt * 0.25) { z.stuck = (z.stuck || 0) + dt; if (z.stuck > 0.8) { z.stuck = 0; z.wT = 0; z.tx = z.x + (Math.random() - 0.5) * 20; z.tz = z.z + (Math.random() - 0.5) * 20; } } else z.stuck = 0;
  z.mv = moved / Math.max(dt, 1e-4) / 3; z.phase = (z.phase || 0) + moved * (2.2 / S.leg);
}

// ---------- desenho: uma malha repetida por espécie e por parte (corpo com cabeça, quatro pernas, cauda)
export class Fauna {
  constructor(scene, mat, max = 160) {
    this.max = max; this.K = Object.keys(ANK); this.m = {}; const M = this.m;
    const mk = (g, n = max) => { const m = new THREE.InstancedMesh(g, mat, n); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; scene.add(m); return m; };
    const leg = (L, r, hex, hoof) => geoOf(b => { b.cap(r, L * 0.45, 0, -L * 0.28, 0, hex); b.cap(r * 0.7, L * 0.42, 0, -L * 0.72, 0.02, hex); b.box(r * 1.6, 0.05, r * 1.9, 0, -L + 0.025, 0.02, hoof); });
    // veado: castanho-avermelhado, barriga e cauda claras, focinho escuro; hastes à parte (só alguns machos)
    const DE = 0x8a5a36, DEL = 0xd8c2a0;
    const deer = geoOf(b => { b.sph(0.5, 0, 1.02, 0, DE, { sx: 0.55, sy: 0.5, sz: 1.2 }); b.sph(0.32, 0, 0.9, 0.05, DEL, { sx: 0.6, sy: 0.4, sz: 1.1 }); b.cap(0.11, 0.42, 0, 1.28, 0.62, DE, { rx: -0.75 }); b.sph(0.14, 0, 1.5, 0.84, DE, { sx: 0.95, sy: 0.95, sz: 1.2 }); b.cap(0.075, 0.14, 0, 1.44, 0.99, DE, { rx: 1.3 }); b.sph(0.05, 0, 1.42, 1.08, 0x1e1a16); for (const s of [-1, 1]) { b.sph(0.06, s * 0.1, 1.64, 0.78, DE, { sx: 0.6, sy: 1.6, sz: 0.4, rz: s * 0.6 }); b.sph(0.018, s * 0.08, 1.53, 0.93, 0x111111); } b.sph(0.08, 0, 1.0, -0.6, 0xf2ece0, { sy: 1.3 }); });
    const ant = geoOf(b => { for (const s of [-1, 1]) { b.cyl(0.018, 0.026, 0.38, 5, s * 0.1, 1.82, 0.78, 0x6a5240, { rz: s * 0.35, rx: -0.2 }); b.cyl(0.014, 0.018, 0.2, 5, s * 0.2, 1.94, 0.86, 0x6a5240, { rz: s * 0.9, rx: 0.3 }); b.cyl(0.012, 0.016, 0.18, 5, s * 0.15, 2.0, 0.7, 0x6a5240, { rz: s * 0.2, rx: -0.8 }); } });
    // javali: escuro, pelo áspero, cabeça grande e baixa, presas
    const BO = 0x3e342c;
    const boar = geoOf(b => { b.sph(0.5, 0, 0.66, -0.02, BO, { sx: 0.55, sy: 0.6, sz: 1.08 }); b.sph(0.3, 0, 0.92, 0.1, 0x2e2620, { sx: 0.45, sy: 0.4, sz: 1.2 }); b.sph(0.22, 0, 0.6, 0.58, BO, { sx: 0.9, sy: 0.95, sz: 1.2 }); b.cyl(0.085, 0.11, 0.2, 10, 0, 0.5, 0.82, 0x4a3e36, { rx: Math.PI / 2 }); b.cyl(0.09, 0.09, 0.02, 10, 0, 0.5, 0.93, 0x6a5246, { rx: Math.PI / 2 }); for (const s of [-1, 1]) { b.cyl(0.012, 0.018, 0.11, 5, s * 0.08, 0.5, 0.84, 0xeee4d0, { rz: s * -0.5, rx: -0.6 }); b.sph(0.05, s * 0.13, 0.78, 0.5, BO, { sx: 0.6, sy: 1.4, sz: 0.4, rz: s * 0.5 }); b.sph(0.018, s * 0.1, 0.66, 0.72, 0x111111); } b.cyl(0.015, 0.008, 0.25, 5, 0, 0.62, -0.58, BO, { rx: 2.4 }); });
    // lobo: cinzento, peito claro, focinho comprido, orelhas em bico, cauda farta
    const WO = 0x77726a, WL = 0xc8c2b6;
    const wolf = geoOf(b => { b.sph(0.4, 0, 0.72, 0, WO, { sx: 0.48, sy: 0.55, sz: 1.2 }); b.sph(0.26, 0, 0.74, 0.26, WL, { sx: 0.6, sy: 0.8, sz: 0.6 }); b.cap(0.11, 0.18, 0, 0.82, 0.4, WO, { rx: -0.9 }); b.sph(0.14, 0, 0.88, 0.58, WO, { sx: 0.95, sy: 0.9, sz: 1.1 }); b.cap(0.055, 0.14, 0, 0.83, 0.74, WO, { rx: 1.5 }); b.sph(0.03, 0, 0.84, 0.82, 0x111111); for (const s of [-1, 1]) { b.cyl(0.0, 0.05, 0.12, 4, s * 0.07, 1.0, 0.56, WO, { rz: s * -0.2 }); b.sph(0.015, s * 0.06, 0.92, 0.68, 0xd8b040); } });
    const wtail = geoOf(b => { b.cap(0.07, 0.34, 0, -0.1, -0.12, WO, { rx: -2.3 }); b.sph(0.06, 0, -0.26, -0.3, 0x3a3632); });
    // cão: rafeiro de pelo curto (a cor vem de cada cão), coleira
    const DG = 0xffffff;
    const dog = geoOf(b => { b.sph(0.32, 0, 0.56, 0, DG, { sx: 0.48, sy: 0.55, sz: 1.2 }); b.cap(0.09, 0.14, 0, 0.66, 0.32, DG, { rx: -0.8 }); b.sph(0.12, 0, 0.72, 0.46, DG, { sx: 0.95, sy: 0.9, sz: 1.05 }); b.cap(0.05, 0.1, 0, 0.67, 0.58, DG, { rx: 1.5 }); b.sph(0.028, 0, 0.68, 0.65, 0x111111); for (const s of [-1, 1]) b.sph(0.05, s * 0.09, 0.78, 0.42, DG, { sx: 0.5, sy: 1.3, sz: 0.4, rz: s * 0.9 }); b.cyl(0.075, 0.075, 0.04, 10, 0, 0.62, 0.36, 0x9a2a22, { rx: 0.7 }); });
    const dtail = geoOf(b => { b.cap(0.035, 0.24, 0, 0.0, -0.1, DG, { rx: -2.0 }); });
    // galinha
    const hen = geoOf(b => { b.sph(0.15, 0, 0.27, 0, 0xffffff, { sx: 0.85, sy: 0.85, sz: 1.1 }); b.sph(0.07, 0, 0.42, 0.12, 0xffffff); b.cyl(0.0, 0.025, 0.05, 4, 0, 0.41, 0.2, 0xe0a030, { rx: Math.PI / 2 }); b.sph(0.03, 0, 0.5, 0.12, 0xc02020, { sx: 0.5, sy: 1, sz: 1.2 }); b.sph(0.1, 0, 0.33, -0.14, 0xffffff, { sx: 0.4, sy: 1, sz: 0.7, rx: -0.5 }); });
    const hleg = geoOf(b => { b.cyl(0.012, 0.012, 0.16, 5, 0, -0.08, 0, 0xe0a030); b.box(0.06, 0.01, 0.06, 0, -0.16, 0.02, 0xe0a030); });
    const P = { veado: { body: deer, leg: leg(0.8, 0.05, DE, 0x1e1a16), ant }, javali: { body: boar, leg: leg(0.43, 0.06, BO, 0x1a1612) }, lobo: { body: wolf, leg: leg(0.52, 0.045, WO, 0x3a3632), tail: wtail }, cao: { body: dog, leg: leg(0.4, 0.04, DG, 0x3a3632), tail: dtail }, galinha: { body: hen, leg: hleg } };
    for (const k of this.K) { const p = P[k]; M[k] = { body: mk(p.body), legs: [0, 1, 2, 3].map(() => mk(p.leg)), tail: p.tail ? mk(p.tail) : null, ant: p.ant ? mk(p.ant) : null };
      const c = new THREE.Color(), cols = ANK[k].cols; for (let i = 0; i < max; i++) { c.set(cols[i % cols.length]); for (const m of [M[k].body, ...M[k].legs, M[k].tail].filter(Boolean)) m.setColorAt(i, c); } }
    this._r = new THREE.Matrix4(); this._l = new THREE.Matrix4(); this._t = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }
  // matriz do animal no mundo (a mesma que as balas usam)
  root(z, out) { const S = ANK[z.an], dead = z.state === 'dead', y = (z.y || 0) - (z.sink || 0) * 0.5;
    this._e.set(0, z.yaw || 0, 0, 'YXZ'); this._q.setFromEuler(this._e); out.compose(this._v.set(z.x, y, z.z), this._q, this._s.set(1, 1, 1));
    if (dead) { const w = S.body[3] * 0.5; this._t.makeTranslation(0, w, 0).multiply(this._l.makeRotationZ(Math.PI / 2 * 0.97)).multiply(this._r.makeTranslation(0, -S.hipF[1] * 0.05, 0)); out.multiply(this._t); }
    return out; }
  update(list, cam) {
    const n = {}; for (const k of this.K) n[k] = 0; const R = new THREE.Matrix4(), L = this._l, T = this._t;
    for (const z of list) { if (!z.an || z.hide) continue; const k = z.an, S = ANK[k], M = this.m[k]; if (!M || n[k] >= this.max) continue; if (cam && Math.hypot(z.x - cam.x, z.z - cam.z) > 140) continue;
      const i = n[k]++; this.root(z, R); const dead = z.state === 'dead';
      { const cols = S.cols, ci = z.cid ?? (z.cid = (z.nid ?? Math.floor(Math.random() * 997)) * 7 + 3), c = this._c || (this._c = new THREE.Color()); c.set(cols[ci % cols.length]); for (const m of [M.body, ...M.legs, M.tail]) if (m) m.setColorAt(i, c); }
      const bob = dead ? 0 : Math.abs(Math.sin(z.phase || 0)) * 0.03 * Math.min(1, z.mv || 0) + (z.atkT > 0 ? Math.sin(z.atkT * 18) * 0.04 : 0);
      T.makeTranslation(0, bob, z.atkT > 0 ? 0.08 : 0); M.body.setMatrixAt(i, L.copy(R).multiply(T));
      if (M.ant) { M.ant.setMatrixAt(i, (z.male ?? ((z.nid ?? i) % 2 === 0)) ? L : T.makeScale(0, 0, 0).premultiply(R)); }
      const sw = dead ? 0.25 : Math.min(1, (z.mv || 0) * 1.4), ph = z.phase || 0, amp = z.mv > 1.8 ? 0.75 : 0.45;
      for (let j = 0; j < 4; j++) { const front = j < 2, side = j % 2 ? 1 : -1, H = front ? S.hipF : S.hipB, a = Math.sin(ph + (j === 0 || j === 3 ? 0 : Math.PI) + (z.mv > 1.8 && !front ? 0.8 : 0)) * amp * sw + (dead ? (front ? 0.5 : -0.4) : 0);
        T.makeTranslation(side * H[0], H[1], H[2]).multiply(L.makeRotationX(a)); M.legs[j].setMatrixAt(i, this._r.copy(R).multiply(T)); }
      if (M.tail) { const H = S.hipB; T.makeTranslation(0, H[1] + 0.1, H[2] - 0.12).multiply(L.makeRotationX(z.an === 'cao' && !dead ? Math.sin((z.tw = (z.tw || 0) + 0.3)) * 0.2 - 0.3 : 0)).multiply(this._l.makeRotationY(z.an === 'cao' && z.pet && !dead ? Math.sin(z.tw * 2) * 0.5 : 0)); M.tail.setMatrixAt(i, this._r.copy(R).multiply(T)); }
    }
    for (const k of this.K) { const M = this.m[k], c = n[k]; for (const m of [M.body, ...M.legs, M.tail, M.ant]) if (m) { m.count = c; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } }
  }
}
