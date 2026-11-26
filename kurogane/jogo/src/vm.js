// Arma e braços na primeira pessoa: desenhados por cima do mundo. A apontar, o vidro da mira fica exatamente no centro;
// a andar (sem apontar), a arma vai à anca, a arma branca na mão direita e, de mãos vazias, os punhos.
// Os braços e as mãos são os do próprio corpo (mesma malha e cores), postos por IK em cada frame; as recargas mexem
// as peças soltas de cada arma (carregador, ferrolho, bomba), e há gestos para a ligadura, comer, beber e lançar granadas.
import * as THREE from 'three';
import { Builder } from './builder.js';
import { weaponGeos, RDP, WPUSH, LONG, fpArms, partPivot } from './chars.js';
import { GUNA } from './guns.js';

// onde pegam as mãos (no espaço da arma, antes do empurrão para o ombro): punho e guarda-mão (armas antigas, sem pontos de encaixe)
const HANDS = { m4: [[-0.035, -0.1, -0.02], [0.068, -0.03, 0.44]], ak: [[-0.035, -0.09, -0.06], [0.062, -0.025, 0.42]], smg: [[-0.03, -0.07, 0.04], [0.055, -0.02, 0.28]], caca: [[-0.035, -0.06, -0.12], [0.058, -0.02, 0.3]], m249: [[-0.04, -0.1, -0.04], [0.068, -0.035, 0.4]], pkm: [[-0.04, -0.1, -0.04], [0.066, -0.035, 0.42]] };
const EYE = 0.3; // distância do olho ao vidro da mira (m)
// a mira com vidro transparente (no boneco o vidro é opaco, mas aqui olha-se através dele)
const rdGeo = (y, z) => { const b = new Builder(0), BLK = 0x1c1e21; b.push(...WPUSH); b.box(0.045, 0.012, 0.07, 0, y - 0.02, z, 0x2a2c2e, { mat: 'm' }); for (const s of [-1, 1]) b.box(0.006, 0.05, 0.06, s * 0.022, y + 0.01, z, BLK, { mat: 'm' }); b.box(0.05, 0.008, 0.06, 0, y + 0.038, z, BLK, { mat: 'm' }); b.box(0.038, 0.04, 0.004, 0, y + 0.012, z + 0.028, 0xffffff, { mat: 'gl' }); b.pop(); const o = {}; for (const [k] of b.buckets) o[k] = b.merged(k); return o; };
const geoMap = fn => { const b = new Builder(0); fn(b); const o = {}; for (const [k] of b.buckets) o[k] = b.merged(k); return o; };
// o que se tem na mão ao usar ou lançar (centrado na palma)
const PROPS = {
  heal: () => geoMap(b => { b.cyl(0.034, 0.034, 0.075, 14, 0, 0, 0, 0xf1eee6, { rz: Math.PI / 2 }); b.cyl(0.012, 0.012, 0.077, 10, 0, 0, 0, 0xd8d2c4, { rz: Math.PI / 2 }); b.box(0.074, 0.002, 0.05, 0, -0.034, 0.03, 0xf1eee6); }),
  eat: () => geoMap(b => { b.rbox(0.07, 0.1, 0.035, 0.01, 0, 0.02, 0, 0xd8c8a0); b.box(0.072, 0.03, 0.037, 0, 0.05, 0, 0xc8321e); }),
  drink: () => geoMap(b => { b.cyl(0.032, 0.032, 0.15, 14, 0, 0.03, 0, 0x8ab8d8); b.cyl(0.016, 0.02, 0.03, 10, 0, 0.12, 0, 0x2a6aa8); }),
  gran: () => geoMap(b => { b.sph(0.034, 0, 0, 0, 0x4a5236, { ws: 14, hs: 10 }); b.cyl(0.012, 0.012, 0.022, 10, 0, 0.038, 0, 0x6a6e62, { mat: 'm' }); b.box(0.01, 0.05, 0.006, 0.016, 0.03, 0, 0x8a8e82, { mat: 'm', rz: -0.25 }); b.cyl(0.009, 0.009, 0.003, 10, -0.012, 0.05, 0, 0xb8b4a0, { mat: 'm', rx: Math.PI / 2 }); }),
  shell: () => geoMap(b => { b.cyl(0.0095, 0.0095, 0.05, 12, 0, 0, 0, 0xa82a22, { rx: Math.PI / 2 }); b.cyl(0.0102, 0.0102, 0.014, 12, 0, 0, -0.02, 0xc8a050, { rx: Math.PI / 2, mat: 'm' }); }),
  round: () => geoMap(b => { b.cyl(0.0062, 0.0062, 0.05, 10, 0, 0, 0, 0xc8a050, { rx: Math.PI / 2, mat: 'm' }); b.cyl(0.004, 0.0062, 0.022, 10, 0, 0, 0.036, 0xa8703a, { rx: Math.PI / 2, mat: 'm' }); }),
};
const ease = t => t * t * (3 - 2 * t), cl = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), seg = (t, a, b) => ease(cl((t - a) / (b - a))), bump = (t, a, b) => { const x = cl((t - a) / (b - a)); return Math.sin(x * Math.PI); };
// vetores de usar e deitar fora dentro de uma imagem: um anel pré-feito (sem lixo para o coletor a cada imagem no telemóvel)
const VR = Array.from({ length: 512 }, () => new THREE.Vector3()); let vri = 0;
const V = (x = 0, y = 0, z = 0) => VR[vri++ & 511].set(x, y, z), VP = (x, y, z) => new THREE.Vector3(x, y, z);

const G_DBG = {};
export function makeVM() {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(46, 1, 0.06, 6); // a coronha encostada à cara não entra no ecrã
  const hemi = new THREE.HemisphereLight(0xdfe6ff, 0x3a332c, 1), key = new THREE.DirectionalLight(0xfff0dc, 1); key.position.set(-0.4, 1, 0.5); scene.add(hemi, key);
  // cores da arma um pouco mais claras do que no mundo: vista tão de perto, o preto puro fica um borrão
  const M = { v: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.35 }), lit: new THREE.MeshBasicMaterial({ vertexColors: true }),
    gl: new THREE.MeshBasicMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.1, depthWrite: false }) };
  M.v.color.setScalar(1.7); M.m.color.setScalar(2.4);
  M.vf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }); M.vf.color.setScalar(1.5);
  const rig = new THREE.Group(); scene.add(rig);
  const W = weaponGeos(); let cur = '', kind = '', gun = null, piv = null, hold = null, wk = '', HH = null, parts = {}, A = null;
  const meshOf = geos => { const g = new THREE.Group(); for (const k in geos) g.add(new THREE.Mesh(geos[k], M[k] || M.v)); return g; };
  // modelos "na mão" do boneco vêm virados para o antebraço: aqui desfaz-se essa volta (cabo na origem, ponta para +z)
  const rawOf = k => { const g = new THREE.Group(); for (const m in W[k]) { const geo = W[k][m].clone(); geo.translate(0, 0.56, 0); geo.rotateX(-Math.PI / 2); g.add(new THREE.Mesh(geo, M[m] || M.v)); } return g; };
  const SH = new Set(); for (const w in W) for (const m in W[w]) SH.add(W[w][m]); // geometrias partilhadas com o boneco: não se apagam
  const props = {}; for (const k in PROPS) { props[k] = meshOf(PROPS[k]()); props[k].visible = false; rig.add(props[k]); }
  let arms = null, armsLook = '';
  const clear = () => { for (const o of [piv, hold]) if (o) { rig.remove(o); o.traverse(m => { if (m.geometry && !SH.has(m.geometry)) m.geometry.dispose(); }); } piv = gun = hold = null; parts = {}; kind = ''; wk = ''; HH = null; A = null; };
  const MELEE = { pedra: 1, machado: 1, picareta: 1, lanca: 1, faca: 1, bastao: 1, pecabra: 1, machete: 1, katana: 1 };
  // peça solta da arma: um grupo com o ponto de encaixe na origem (roda e desliza à volta dele)
  const addPart = pk => { if (!W[pk]) return null; const p = partPivot(pk); if (!p) return null; const g = new THREE.Group(), inner = meshOf(W[pk]);
    if (pk.startsWith('bolt_')) p.set(WPUSH[0], WPUSH[1] + (GUNA(pk.slice(5)).boltc ? 0 : 0), p.z); // o ferrolho roda à volta do eixo do cano
    g.position.copy(p); inner.position.copy(p).negate(); g.add(inner); gun.add(g); return { g, p0: p.clone() }; };
  const set = (k, att, look) => {
    const lk = look.top + ':' + look.skin + ':' + look.legs; if (!arms) { arms = fpArms(look); rig.add(arms.mesh); armsLook = lk; } else if (lk !== armsLook) { arms.setColors(look); armsLook = lk; }
    const key = k + ':' + (att.scope || '') + ':' + (att.sup || '') + ':' + (att.light || '');
    if (key === cur) return; cur = key; clear();
    if (!k) return; // nada (vista de cima, ou a luneta tapa o ecrã)
    wk = k;
    if (LONG.includes(k) && W[k]) { // espingarda: o vidro da mira (ou a mira de ferro) no eixo da vista quando aponta
      kind = 'long'; gun = new THREE.Group(); const sk = att.scope ? (att.scope === 'mira8' ? 'sc8_' : att.scope === 'reddot' ? null : att.scope === 'iron' ? null : 'sc_') : null;
      for (const w of [k, att.sup && 'sup_' + k, att.light && 'lt_' + k, sk && sk + k]) if (w && W[w]) gun.add(meshOf(W[w]));
      const [ry, rz] = RDP[k] || [0.085, 0.1]; if (att.scope === 'reddot' && RDP[k]) gun.add(meshOf(rdGeo(ry, rz)));
      for (const t of ['mag', 'bolt', 'pump']) { const P = addPart(t + '_' + k); if (P) parts[t] = P; }
      // arma virada para a frente (−z da câmara) e o vidro da mira no eixo da vista; mira de ferro: o olho um pouco acima, a ver por cima da arma
      A = GUNA(k); const S = A && att.scope !== 'reddot' && !(att.scope && att.scope !== 'iron') ? VP(WPUSH[0], WPUSH[1] + A.iron, WPUSH[2] + A.eyez + EYE) : VP(WPUSH[0], WPUSH[1] + ry + (att.scope === 'reddot' ? 0.012 : 0.035), WPUSH[2] + rz);
      HH = (A ? [[-0.006, A.grip[1] - 0.004, A.grip[2] + 0.006], [0.004, A.fore[1] - 0.026, A.fore[2] - 0.02]] : (HANDS[k] || HANDS.m4)).map(h => VP(WPUSH[0] + h[0], WPUSH[1] + h[1], WPUSH[2] + h[2]));
      gun.rotation.y = Math.PI; gun.position.set(S.x, -S.y, -EYE + S.z); gun.updateMatrix();
      // a arma roda à volta do punho (recargas): grupo de rotação no punho
      piv = new THREE.Group(); const g0 = HH[0].clone().applyMatrix4(gun.matrix); piv.position.copy(g0); piv.userData.p0 = g0.clone(); gun.position.sub(g0); piv.add(gun); rig.add(piv); return;
    }
    if ((k === 'pistola' || k === 'revolver') && W[k]) { // pistola: com as duas mãos, um pouco à direita
      kind = 'pistol'; gun = new THREE.Group(); gun.add(rawOf(k)); if (att.sup && W['sup_' + k]) gun.add(rawOf('sup_' + k)); if (att.light && W['lt_' + k]) gun.add(rawOf('lt_' + k));
      if (W['mag_' + k]) { const g = new THREE.Group(), inner = rawOf('mag_' + k), A2 = GUNA(k), c = A2.magc; g.position.set(c[0], c[1], c[2]); inner.position.set(-c[0], -c[1], -c[2]); g.add(inner); gun.add(g); parts.mag = { g, p0: g.position.clone() }; }
      A = GUNA(k); gun.rotation.set(0.02, Math.PI + 0.07, 0); gun.position.set(0, 0, 0); piv = new THREE.Group(); piv.position.set(0.1, -0.135, -0.4); piv.userData.p0 = piv.position.clone(); piv.add(gun); rig.add(piv); return;
    }
    // arma branca na mão direita, granada ou punhos
    if (MELEE[k] && W[k]) { kind = 'melee'; hold = new THREE.Group(); const g = rawOf(k); g.position.z = -0.04; hold.add(g); rig.add(hold); }
    else if (k === 'granada' || k === 'c4') kind = 'throw';
    else if (k.startsWith('use:')) kind = 'use';
    else if (k === 'climb') kind = 'climb';
    else kind = 'fists';
  };
  let kick = 0, bob = 0, punch = -1, swayX = 0, swayY = 0, lastQ = new THREE.Quaternion(), hasQ = false, tt = 0;
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
  const SR = VP(0.17, -0.3, 0.06), SL = VP(-0.19, -0.3, 0.04); // ombros (um pouco abaixo e atrás da câmara)
  const PR = VP(1, -0.9, 0.35), PL = VP(-1, -0.9, 0.25); // cotovelos: para fora e para baixo
  const HR = VP(0, 0, 0), HL = VP(0, 0, 0), palmR = VP(0, 0, 0), palmL = VP(0, 0, 0), tmp = VP(0, 0, 0);
  // ponto da arma (espaço da arma) no espaço do rig
  const atGun = (p, out) => { piv.updateMatrix(); gun.updateMatrix(); _m.multiplyMatrices(piv.matrix, gun.matrix); return out.copy(p).applyMatrix4(_m); };
  const dirGun = (d, out) => { _m.multiplyMatrices(piv.matrix, gun.matrix); return out.copy(d).transformDirection(_m); };
  const lerpV = (a, b, t, out) => out.copy(a).lerp(b, t);
  // antebraço sempre a vir de baixo e de trás (nunca à frente da cara, mesmo com a arma inclinada na recarga)
  const safeF = f => { f.normalize(); if (f.y < 0.3) f.y = 0.3; if (f.z > -0.45) f.z = -0.45; return f.normalize(); };
  const showProp = (k, at, R, off) => { const p = props[k]; p.visible = true; p.position.copy(at); if (R) p.quaternion.setFromRotationMatrix(R); if (off) p.position.add(off); return p; };
  return {
    scene, cam, set, dbg: () => ({ arms, rig, piv, gun, props, D: G_DBG }),
    get on() { return !!kind; },
    get kind() { return kind; },
    fire() { kick = 1; },
    // a mesma projeção da câmara do mundo (o centro fica onde está a mira), luz do dia/noite, recuo, balanço, golpes e recarregar
    // o: { day, nv, mv (0..1 a andar), ads (0 à anca .. 1 a apontar), sw (golpe 0..1 ou −1), rel (a recarregar 0..1, suave), rp (progresso da recarga 0..1 ou −1),
    //      rm ('swap' troca de carregador, 'fill' balas à mão), spr (a correr), up (a entrar na 1.ª pessoa 0..1), raise (arma levantada 0..1), use ({ kind, t }), thr (lançar 0..1 ou −1) }
    update(dt, main, o) {
      for (const k in props) props[k].visible = false;
      if (!kind) { if (arms) arms.mesh.visible = false; return; }
      arms.mesh.visible = true; tt += dt;
      // ao alto (telemóvel em pé) abre o campo para a arma não encher o ecrã
      cam.aspect = main.aspect; cam.fov = kind === 'long' ? Math.max(46, 2 * Math.atan(Math.tan(31 * Math.PI / 180) / Math.max(0.2, main.aspect)) * 180 / Math.PI) : 46 + 24 * Math.min(1, Math.max(0, (1 - main.aspect) / 0.54)); cam.updateProjectionMatrix(); const e = cam.projectionMatrix.elements, f = main.projectionMatrix.elements; e[8] = f[8]; e[9] = f[9]; cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      const D = o.day ?? 1, nv = o.nv || 0; hemi.intensity = 0.4 + 1.1 * D + 1.2 * nv; key.intensity = 0.3 + 2.2 * D;
      const th = Math.tan(cam.fov * Math.PI / 360), hw = th * cam.aspect * 0.42, bot = -th * 0.42, H = -2 * bot, fr = cam.aspect < 1 ? 0.24 : 0; // ecrã à distância das mãos (0,42 m)
      const rp = o.rp ?? -1, rel = rp >= 0 ? Math.min(1, rp * 8, (1 - rp) * 8) : (o.rel || 0) * 0; // a recarregar: sai da mira no início e volta no fim
      const ads = kind === 'long' ? (o.ads ?? 1) * (1 - rel) : 0, hip = 1 - ads, mv = o.mv || 0, spr = (o.spr || 0) * (1 - rel), up = o.up ?? 1, dn = 1 - (o.raise ?? 1);
      kick *= Math.exp(-dt * 16); bob += dt * mv * (7 + 3 * spr);
      // balanço ao rodar a vista: a arma fica um pouco para trás e volta (mais à anca do que a apontar)
      main.getWorldQuaternion(_q); if (hasQ) { const dq = lastQ.clone().invert().multiply(_q); _e.setFromQuaternion(dq, 'YXZ'); swayX += (-_e.y * 0.6 - swayX) * Math.min(1, dt * 10); swayY += (_e.x * 0.6 - swayY) * Math.min(1, dt * 10); } lastQ.copy(_q); hasQ = true;
      swayX *= Math.exp(-dt * 6); swayY *= Math.exp(-dt * 6); const sk = 0.25 + 0.75 * hip, sX = cl(swayX, -0.05, 0.05) * sk, sY = cl(swayY, -0.04, 0.04) * sk;
      const bw = mv * (0.006 + 0.016 * hip) * (1 + 0.6 * spr), breath = Math.sin(tt * 1.6) * 0.0018 * (0.3 + hip); // a andar: oito com a cabeça; parado: respiração
      const lo = (1 - ease(up)) * 0.32 + spr * 0.04 + dn * hip * 0.01;
      const px0 = kind === 'pistol' ? Math.min(0.1, hw * 0.36) - 0.1 : 0, py0 = kind === 'pistol' ? bot + (cam.aspect < 1 ? 0.36 : 0.27) * H + 0.135 : 0;
      rig.position.set(px0 + Math.sin(bob) * bw + hip * (kind === 'long' ? 0.17 : 0) + spr * 0.03 + sX, py0 + Math.abs(Math.cos(bob)) * bw * 0.8 - 0.004 * mv - hip * (kind === 'long' ? 0.004 : 0) - lo + breath + sY, kick * (kind === 'pistol' ? 0.05 : 0.035) + hip * (kind === 'long' ? 0.04 : 0));
      rig.rotation.set(kick * (kind === 'pistol' ? 0.16 : 0.05) - spr * 0.12 - dn * hip * 0.035 + sY * 1.5, hip * (kind === 'long' ? 0.1 : 0) + spr * 0.5 * (kind === 'long' ? 1 : 0.4) + sX * 2, -hip * (kind === 'long' ? 0.06 : 0) + Math.sin(bob) * bw * 1.5);
      if (G_DBG.place) { arms.hide(0); arms.hide(1); for (const q of G_DBG.place) { if (q[6]) arms.setPose(q[0], q[6]); arms.place(q[0], V(...q[1]), V(...q[2]), V(...q[3]), V(...q[4]).normalize(), q[5] ? V(...q[5]).normalize() : undefined); } if (piv) piv.visible = false; return; }
      if (G_DBG.rest) { const r = G_DBG.rest; arms.hide(0); arms.hide(1); if (r[6]) arms.setPose(r[0], r[6]); arms.restAt(r[0], r[1], r[2], r[3], r[4], r[5]); if (piv) piv.visible = false; return; }
      if (kind === 'long') { this.long(o, rp); if (G_DBG.only != null) arms.hide(1 - G_DBG.only); return; }
      if (kind === 'pistol') return this.pistol(o, rp);
      return this.hands(o, hw, bot, H, fr);
    },
    // espingardas: mão direita no punho, esquerda no guarda-mão; recarga por arma
    long(o, rp) {
      const p0 = piv.userData.p0, mag = parts.mag, bolt = parts.bolt, pump = parts.pump; piv.position.copy(p0); piv.rotation.set(0, 0, 0);
      if (mag) { mag.g.position.copy(mag.p0); mag.g.rotation.set(0, 0, 0); mag.g.visible = true; } if (bolt) { bolt.g.position.copy(bolt.p0); bolt.g.rotation.set(0, 0, 0); } if (pump) pump.g.position.copy(pump.p0);
      const t = rp, R = rp >= 0; let lT = HH[1], rT = HH[0], lPalm = V(0, 0.2, 1), rPalm = V(0, 1, -0.35), rFwd = V(0.35, 0.55, 1), lFwd = V(-0.6, 0.35, 1); // 'palm' = direção do polegar (eixo do que se agarra), no espaço da arma
      const fore = HH[1], grip = HH[0];
      if (R) {
        const env = seg(t, 0, 0.12) * (1 - seg(t, 0.86, 1));
        // a arma inclina para mostrar o poço do carregador (e o ferrolho, nas de ferrolho)
        if (bolt && !mag) { piv.rotation.set(0.1 * env, -0.08 * env, 0.32 * env); piv.position.x -= 0.08 * env; piv.position.y += 0.0 * env; piv.position.z -= 0.32 * env; }
        else if (pump) { piv.rotation.set(0.04 * env, 0.12 * env, -0.5 * env); piv.position.x -= 0.08 * env; piv.position.y += 0.03 * env; piv.position.z -= 0.3 * env; }
        else { piv.rotation.set(0.12 * env, 0.2 * env, -0.45 * env); piv.position.x -= 0.08 * env; piv.position.y += 0.03 * env; piv.position.z -= 0.3 * env; }
        // roda à volta do meio da arma (poço do carregador), não do punho: assim a arma não passa à frente da cara
        { const Pc = atGun(_v.copy(HH[0]).lerp(HH[1], 0.45), V()); piv.updateMatrix(); const q0 = piv.quaternion.clone(); piv.quaternion.identity(); piv.updateMatrix(); const Pc0 = atGun(_v.copy(HH[0]).lerp(HH[1], 0.45), V()); piv.quaternion.copy(q0); piv.updateMatrix(); const Pc1 = atGun(_v.copy(HH[0]).lerp(HH[1], 0.45), V()); piv.position.add(Pc0.sub(Pc1)); }
        if (mag) { // troca do carregador: a mão esquerda tira-o, vai buscar outro abaixo do ecrã e mete-o
          const grab = _w.copy(mag.p0).add(tmp.set(0, -0.055, 0.012));
          const tOut = bolt ? [0.22, 0.32, 0.4] : [0.1, 0.2, 0.3], tIn = bolt ? [0.5, 0.66] : [0.42, 0.62];
          let off = 0, side = 0;
          if (t < tOut[0]) off = 0; else if (t < tOut[1]) off = seg(t, tOut[0], tOut[1]) * 0.16; else if (t < tOut[2]) { off = 0.16 + seg(t, tOut[1], tOut[2]) * 0.4; side = seg(t, tOut[1], tOut[2]); }
          else if (t < tIn[0]) { off = 0.56; side = 1; } else if (t < tIn[1]) { const a = seg(t, tIn[0], tIn[1]); off = 0.56 * (1 - a) * (1 - a) + (a > 0.85 ? 0 : 0.012 * (1 - a)); side = 1 - a; } else off = 0;
          mag.g.position.copy(mag.p0).add(tmp.set(-0.05 * side, -off, -0.04 * side * 0)); mag.g.rotation.set(-0.35 * side, 0, 0.2 * side);
          if (t > tIn[1] - 0.02 && t < tIn[1] + 0.05) piv.position.y += 0.008 * bump(t, tIn[1] - 0.02, tIn[1] + 0.05); // encaixe: a arma dá um toque
          const onMag = t >= tOut[0] - 0.05 && t < tIn[1] + 0.03, toMag = seg(t, tOut[0] - 0.1, tOut[0]), back = seg(t, tIn[1], tIn[1] + 0.1);
          const mp = atGun(_v.copy(mag.g.position).add(tmp.set(0, -0.06, 0.012)).applyEuler(_e.set(0, 0, 0)), V());
          const fw = atGun(fore, V());
          if (t < tOut[0]) { lT = lerpV(fw, mp, toMag, V()); lPalm = V(0, 0.2, 1); }
          else if (onMag) { lT = mp; lPalm = V(0, 0.2, 1); }
          if (onMag || t < tOut[0]) { const k = t < tOut[0] ? toMag : 1; lFwd = lerpV(V(-0.6, 0.35, 1), V(-0.25, 1, 0.35), k, V()); }
          // depois de meter o carregador: armar (puxar o manípulo) e voltar ao guarda-mão
          if (t >= tIn[1]) { const a2 = seg(t, tIn[1] + 0.02, bolt ? 0.92 : 0.8); lT = lerpV(mp, fw, a2, V()); lPalm = V(0, 0.2, 1); lFwd = lerpV(V(-0.25, 1, 0.35), V(-0.6, 0.35, 1), a2, V()); }
          if (bolt) { const bOpen = seg(t, 0.04, 0.12) * (1 - seg(t, 0.74, 0.82)), bBack = seg(t, 0.12, 0.2) * (1 - seg(t, 0.68, 0.76)); this.boltPose(bolt, bOpen, bBack); rT = this.boltHand(bolt, t, 0.02, 0.86, grip); rPalm = V(0, 0.3, 1); }
          else if (t >= tIn[1] && t < tIn[1] + 0.25) { const pull = bump(t, tIn[1] + 0.05, tIn[1] + 0.22); piv.position.z += 0.01 * pull; }
        } else if (bolt) { // ferrolho sem carregador: abre, meter balas uma a uma pela janela, fecha
          const bOpen = seg(t, 0.12, 0.18) * (1 - seg(t, 0.8, 0.86)), bBack = seg(t, 0.18, 0.24) * (1 - seg(t, 0.74, 0.8)); this.boltPose(bolt, bOpen, bBack);
          rT = this.boltHand(bolt, t, 0.12, 0.84, grip); rPalm = V(0, 0.3, 1);
          if (t > 0.26 && t < 0.72) { const n = 3, q = (t - 0.26) / 0.46 * n, i = Math.floor(q), f = q - i, port = atGun(_v.copy(bolt.p0).add(tmp.set(0.035, 0.012, 0.1)), V()), away = V(0.2, -0.55, -0.15);
            rT = lerpV(away, port, f < 0.5 ? ease(f * 2) : 1 - ease((f - 0.5) * 2) * 0.9, V()); if (f < 0.62) showProp('round', rT, null, dirGun(V(0, -0.01, 0), V())); rPalm = V(0, 0.3, 1); }
        } else if (pump) { // caçadeira: cartuchos um a um por baixo, depois bomba atrás e à frente
          const port = atGun(_v.copy(HH[0]).lerp(HH[1], 0.32).add(tmp.set(0, -0.012, 0)), V()), away = atGun(_v.copy(HH[0]).add(tmp.set(0.12, -0.3, 0.05)), V());
          const fw = atGun(_v.copy(fore), V());
          if (t < 0.1) lT = lerpV(fw, away, seg(t, 0, 0.1), V());
          else if (t < 0.74) { const n = 4, q = (t - 0.1) / 0.64 * n, i = Math.floor(q), f = q - i; const near = f < 0.55 ? ease(f / 0.55) : 1 - ease((f - 0.55) / 0.45); lT = lerpV(away, port, near, V()); if (f > 0.4 && f < 0.6) lT.addScaledVector(dirGun(V(0, 0, 1), V()), 0.03 * bump(f, 0.4, 0.6)); if (f < 0.55) showProp('shell', lT, _m.extractRotation(_m.multiplyMatrices(piv.matrix, gun.matrix)), dirGun(V(0, 0.025, 0.02), V())); lPalm = V(0, 0.2, 1); }
          else { const a = seg(t, 0.74, 0.8); lT = lerpV(away, atGun(_v.copy(pump.p0).add(tmp.set(0, -0.03, 0)), V()), a, V()); const rk = bump(t, 0.8, 0.94); pump.g.position.z = pump.p0.z - 0.075 * rk; lT.addScaledVector(dirGun(V(0, 0, -1), V()), 0.075 * rk); }
        } else { // sem peças soltas: só a inclinação e a mão esquerda por baixo
          const fw = atGun(fore, V()), dw = atGun(_v.copy(grip).add(tmp.set(0.06, -0.14, 0.12)), V()); lT = lerpV(fw, dw, bump(t, 0.1, 0.8), V());
        }
      }
      // caçadeira a disparar: a bomba vai atrás e à frente depois de cada tiro
      if (!R && pump && kick > 0.05) { const k = Math.min(1, kick * 1.4); pump.g.position.z = pump.p0.z - 0.07 * Math.sin(Math.min(1, (1 - k) * 1.6) * Math.PI) * (kick < 0.7 ? 1 : 0); }
      const lw = lT === HH[1] ? atGun(lT, V()) : lT, rw = rT === HH[0] ? atGun(rT, V()) : rT;
      arms.setPose(1, R && bolt && rT !== HH[0] ? 'pega' : 'gatilho'); arms.setPose(0, lT === HH[1] ? 'larga' : R && pump ? 'pega' : 'pega');
      if (pump && !R) lw.z += pump.g.position.z - pump.p0.z; // a mão acompanha a bomba
      arms.place(1, SR, rw, PR, dirGun(rPalm, V()).normalize(), safeF(dirGun(rFwd, V()))); arms.place(0, SL, lw, PL, dirGun(lPalm, V()).normalize(), safeF(dirGun(lFwd, V())));
    },
    // ferrolho: levantar (roda à volta do cano) e puxar atrás
    boltPose(bolt, open, back) { bolt.g.rotation.set(0, 0, -1.05 * open); bolt.g.position.z = bolt.p0.z - 0.085 * back; },
    boltHand(bolt, t, a, b, grip) { const at = atGun(_v.copy(bolt.g.position).add(tmp.set(-0.035, 0.02, 0).applyEuler(bolt.g.rotation)), V()), gw = atGun(grip, V()); const k = seg(t, a, a + 0.05) * (1 - seg(t, b - 0.06, b)); return lerpV(gw, at, k, V()); },
    // pistola e revólver: duas mãos; recarga com a mão esquerda por baixo do punho
    pistol(o, rp) {
      const p0 = piv.userData.p0, mag = parts.mag; piv.position.copy(p0); piv.rotation.set(0, 0, 0); if (mag) { mag.g.position.copy(mag.p0); mag.g.visible = true; }
      gun.updateMatrix(); const R = rp >= 0, t = rp, gripP = A ? V(A.grip[0], A.grip[1] + 0.012, A.grip[2] + 0.01) : V(0, -0.05, -0.02);
      let rT = gripP, lT = V(0.012, -0.062, 0.004), lPalm = V(0, 0.6, 1), rPalm = V(0, 1, -0.25), rFwd = V(0.15, 0.25, 1), lFwd = V(-0.4, 0.25, 1);
      if (R) { const env = seg(t, 0, 0.12) * (1 - seg(t, 0.85, 1));
        if (wk === 'revolver') { // revólver: tambor de lado, balas, fecha
          piv.rotation.set(0.35 * env, 0.2 * env, 0.6 * env); piv.position.x -= 0.05 * env; piv.position.y += 0.03 * env; piv.position.z -= 0.06 * env;
          const cyl = V(0.02, 0.036, 0.02), away = V(0.06, -0.2, -0.04); const k = t < 0.15 ? seg(t, 0.05, 0.15) : t < 0.8 ? 1 : 1 - seg(t, 0.8, 0.95);
          let aw = 0; if (t > 0.25 && t < 0.7) aw = bump(t, 0.25, 0.48) + bump(t, 0.47, 0.7) * 0.6; lT = lerpV(lerpV(lT, cyl, k, V()), away, aw * 0.8, V()); lPalm = V(0, 1, 0.2);
        } else { // pistola: carregador cai, outro entra por baixo
          piv.rotation.set(-0.12 * env, 0.25 * env, -0.32 * env); piv.position.x -= 0.03 * env; piv.position.y += 0.03 * env; piv.position.z -= 0.05 * env;
          if (mag) { let off = 0; if (t < 0.12) off = 0; else if (t < 0.3) off = 0.03 + (t - 0.12) * 2.2 * (t - 0.12) * 10; else if (t < 0.46) { off = 0.6; } else if (t < 0.66) { const a = seg(t, 0.46, 0.66); off = 0.6 * (1 - a) * (1 - a); } mag.g.position.y = mag.p0.y - Math.min(0.6, off); mag.g.visible = !(t > 0.3 && t < 0.46); }
          const away = V(0.06, -0.2, -0.04), magB = V(0, (mag ? mag.g.position.y : -0.05) - 0.085, -0.01);
          if (t < 0.1) lT = lerpV(lT, away, seg(t, 0, 0.1), V()); else if (t < 0.46) lT = away; else if (t < 0.66) lT = lerpV(away, magB, seg(t, 0.46, 0.6), V()); else { const slide = V(0, 0.045, -0.05), kk = seg(t, 0.66, 0.74), back = seg(t, 0.84, 0.96); lT = lerpV(lerpV(magB, slide, kk, V()), V(-0.006, -0.062, 0.004), back, V()); if (t > 0.72 && t < 0.86) { lT.z -= 0.05 * bump(t, 0.72, 0.86); } lPalm = V(0, 0.2, 1); }
          if (t >= 0.46 && t < 0.68) lPalm = V(0, 0.2, 1);
        }
      }
      piv.updateMatrix(); _m.multiplyMatrices(piv.matrix, gun.matrix);
      const rw = rT.clone().applyMatrix4(_m), lw = lT.clone().applyMatrix4(_m); arms.setPose(1, 'gatilho'); arms.setPose(0, 'pega');
      arms.place(1, V(0.22, -0.4, 0.05), rw, V(0.6, -1, 0.3), dirGun(rPalm, V()).normalize(), safeF(dirGun(rFwd, V()))); arms.place(0, V(-0.24, -0.42, 0.05), lw, V(-0.8, -1, 0.2), dirGun(lPalm, V()).normalize(), safeF(dirGun(lFwd, V())));
    },
    // mãos vazias, arma branca, granada e gestos (ligadura, comer, beber)
    hands(o, hw, bot, H, fr) {
      const s = o.sw ?? -1, t = s >= 0 ? s : -1, hx = Math.min(0.2, hw * 0.58), hy = bot + fr * H + 0.03, use = o.use, thr = o.thr ?? -1;
      if (kind === 'melee') {
        arms.setPose(1, 'pega'); arms.setPose(0, 'punho');
        let px = 0, ry = 0, dx = 0, dy = 0, dz = 0;
        if (t >= 0) { if (t < 0.3) { const a = ease(t / 0.3); px = 0.55 * a; dy = 0.05 * a; dz = 0.03 * a; } else if (t < 0.52) { const a = ease((t - 0.3) / 0.22); px = 0.55 - 1.95 * a; dx = -0.09 * a; dy = 0.05 - 0.12 * a; dz = 0.03 - 0.2 * a; ry = 0.25 * a; } else { const a = ease((t - 0.52) / 0.48); px = -1.4 * (1 - a); dx = -0.09 * (1 - a); dy = -0.07 * (1 - a); dz = -0.17 * (1 - a); ry = 0.25 * (1 - a); } }
        HR.set(hx * 0.95 + dx, hy + 0.02 + dy, -0.4 + dz);
        // o cabo sobe e aponta um pouco para a frente e para o centro (como quem segura um machado)
        _e.set(-2.3 + px, ry, 0.3, 'ZYX'); hold.quaternion.setFromEuler(_e); hold.position.copy(HR);
        // palma virada para o cabo: o cabo passa pela mão fechada (eixo do punho = de lado)
        palmR.set(0, 0, 1).applyQuaternion(hold.quaternion);
        arms.place(1, V(0.2, -0.36, 0.08), HR, V(1, -1, 0.2), palmR.normalize());
        HL.set(-hx, hy - 0.06, -0.36); arms.place(0, V(-0.2, -0.36, 0.08), HL, V(-1, -1, 0.2), V(0.4, 1, 0).normalize());
        return;
      }
      if (kind === 'throw') { arms.setPose(1, 'pega'); arms.setPose(0, 'aberta'); // granada na mão direita: puxar atrás por cima do ombro e lançar; a esquerda aponta
        let k = 0, fwd = 0; if (thr >= 0) { k = thr < 0.4 ? ease(thr / 0.4) : 1 - ease((thr - 0.4) / 0.25); fwd = thr < 0.4 ? 0 : bump(thr, 0.4, 0.85); }
        HR.set(hx * 0.8 + 0.06 * k - 0.12 * fwd, hy + 0.05 + 0.2 * k + 0.1 * fwd, -0.4 + 0.1 * k - 0.16 * fwd);
        palmR.set(-0.2, 1, 0.3 * k).normalize();
        arms.place(1, V(0.2, -0.36, 0.08), HR, V(1, -0.4, 0.3), palmR);
        if (thr < 0.5) showProp('gran', HR, null, _v.copy(palmR).multiplyScalar(-0.012).add(tmp.set(0, 0.012, 0)));
        HL.set(-hx * 0.75 + 0.06 * k, hy + 0.05 + 0.1 * k, -0.44 - 0.04 * k); arms.place(0, V(-0.2, -0.36, 0.08), HL, V(-1, -1, 0.2), V(1, 0.3, 0).normalize());
        return;
      }
      if (kind === 'climb' && o.climb) { arms.setPose(0, 'aberta'); arms.setPose(1, 'aberta'); // trepar: as duas mãos vão à borda e empurram o corpo para cima
        const c = o.climb, reach = ease(cl(c.t / 0.3)), push = ease(cl((c.t - 0.3) / 0.5)), y = c.dy * (1 - push) - 0.32 * push, z = -0.42 + 0.12 * push;
        for (const sd of [0, 1]) { const sx = sd ? 1 : -1, H = (sd ? HR : HL).set(sx * 0.17, hy + (y - hy) * reach, z - 0.04 * (1 - reach)); arms.place(sd, V(sx * 0.2, -0.36, 0.08), H, V(sx, -1, 0.2), V(-sx, 0, 0), V(-sx * 0.15, 0.25 + 0.6 * push, -1).normalize()); }
        return;
      }
      if (kind === 'use' && use) { // ligadura: à volta do antebraço esquerdo; comer e beber: à boca
        const u = use.t, e = Math.min(1, u * 6, (1 - u) * 6), w = u * Math.PI * 2 * (use.kind === 'heal' ? 5 : 3);
        if (use.kind === 'heal') { arms.setPose(0, 'aberta'); arms.setPose(1, 'pega');
          // antebraço esquerdo deitado à frente; a direita dá voltas à ligadura à volta dele
          HL.set(0.1, hy + 0.09 + 0.04 * e, -0.42); const EL = arms.place(0, V(-0.22, -0.4, 0.04), HL, V(-1, -0.6, 0), V(0, 0.2, -1).normalize(), V(0.88, 0.22, -0.42).normalize()).clone();
          const C = _w.copy(EL).lerp(HL, 0.72), ax = tmp.subVectors(HL, EL).normalize(), up = V(0, 1, 0).addScaledVector(ax, -ax.y).normalize(), sd = V().crossVectors(ax, up);
          HR.copy(C).addScaledVector(up, Math.cos(w) * 0.055 * e + 0.01).addScaledVector(sd, Math.sin(w) * 0.055 * e).addScaledVector(ax, 0.02 * Math.sin(w * 0.5));
          arms.place(1, V(0.22, -0.4, 0.06), HR, V(1, -1, 0.1), ax.clone().negate());
          showProp('heal', HR, null, null); props.heal.quaternion.setFromUnitVectors(V(1, 0, 0), ax);
        } else {
          arms.setPose(1, 'pega'); arms.setPose(0, 'punho'); const lift = ease(cl(u * 3)) * (1 - ease(cl((u - 0.85) * 6.6))), sip = Math.sin(w) * 0.008 * lift;
          HR.set(hx * 0.6 - 0.12 * lift, hy + 0.03 + 0.12 * lift + sip, -0.42 + 0.08 * lift); arms.place(1, V(0.2, -0.36, 0.08), HR, V(1, -1, 0.2), V(-0.3, 1, 0.2).normalize());
          const P = showProp(use.kind === 'drink' ? 'drink' : 'eat', HR, null, V(-0.025, 0.03, 0)); P.rotation.set(use.kind === 'drink' ? 0.5 * lift : 0.1, 0, use.kind === 'drink' ? 0.5 * lift : 0.2 * lift);
          HL.set(-hx, hy - 0.06, -0.4); arms.place(0, V(-0.2, -0.36, 0.08), HL, V(-1, -1, 0.2), V(0.4, 1, 0).normalize());
        }
        return;
      }
      // punhos: a mão direita vai à frente e volta; guarda alta (de boxe)
      arms.setPose(0, 'punho'); arms.setPose(1, 'punho');
      let pr = 0; if (t >= 0) pr = t < 0.35 ? ease(t / 0.35) : 1 - ease((t - 0.35) / 0.65);
      HR.set(hx - 0.1 * pr, hy + 0.05 + 0.07 * pr, -0.4 - 0.2 * pr); HL.set(-hx + 0.02, hy + 0.04, -0.43);
      arms.place(1, V(0.2, -0.36, 0.08), HR, V(1, -1, 0.1 - 0.5 * pr), V(-0.45, 1, 0.1).normalize());
      arms.place(0, V(-0.2, -0.36, 0.08), HL, V(-1, -1, 0.1), V(0.45, 1, 0.1).normalize());
    },
  };
}
