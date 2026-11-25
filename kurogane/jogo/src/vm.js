// Arma e braços na primeira pessoa: desenhados por cima do mundo. A apontar, o vidro da mira fica exatamente no centro;
// a andar (sem apontar), a arma vai à anca, a arma branca na mão direita e, de mãos vazias, os punhos. Usa os mesmos modelos do boneco.
import * as THREE from 'three';
import { Builder } from './builder.js';
import { weaponGeos, RDP, WPUSH, LONG } from './chars.js';

// onde pegam as mãos (no espaço da arma, antes do empurrão para o ombro): punho e guarda-mão
// (x positivo da arma fica à esquerda no ecrã: a mão de apoio agarra o guarda-mão por esse lado)
const HANDS = { m4: [[-0.035, -0.1, -0.02], [0.068, -0.03, 0.44]], ak: [[-0.035, -0.09, -0.06], [0.062, -0.025, 0.42]], smg: [[-0.03, -0.07, 0.04], [0.055, -0.02, 0.28]], caca: [[-0.035, -0.06, -0.12], [0.058, -0.02, 0.3]], m249: [[-0.04, -0.1, -0.04], [0.068, -0.035, 0.4]], pkm: [[-0.04, -0.1, -0.04], [0.066, -0.035, 0.42]] };
const EYE = 0.3; // distância do olho ao vidro da mira (m)
// a mira com vidro transparente (no boneco o vidro é opaco, mas aqui olha-se através dele)
const rdGeo = (y, z) => { const b = new Builder(0), BLK = 0x1c1e21; b.push(...WPUSH); b.box(0.045, 0.012, 0.07, 0, y - 0.02, z, 0x2a2c2e, { mat: 'm' }); for (const s of [-1, 1]) b.box(0.006, 0.05, 0.06, s * 0.022, y + 0.01, z, BLK, { mat: 'm' }); b.box(0.05, 0.008, 0.06, 0, y + 0.038, z, BLK, { mat: 'm' }); b.box(0.038, 0.04, 0.004, 0, y + 0.012, z + 0.028, 0xffffff, { mat: 'gl' }); b.pop(); const o = {}; for (const [k] of b.buckets) o[k] = b.merged(k); return o; };

export function makeVM() {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(46, 1, 0.09, 6); // a coronha encostada à cara não entra no ecrã
  const hemi = new THREE.HemisphereLight(0xdfe6ff, 0x3a332c, 1), key = new THREE.DirectionalLight(0xfff0dc, 1); key.position.set(-0.4, 1, 0.5); scene.add(hemi, key);
  // cores da arma um pouco mais claras do que no mundo: vista tão de perto, o preto puro fica um borrão
  const M = { v: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.35 }), lit: new THREE.MeshBasicMaterial({ vertexColors: true }),
    gl: new THREE.MeshBasicMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.1, depthWrite: false }), arm: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }) };
  M.v.color.setScalar(1.7); M.m.color.setScalar(2.4);
  M.vf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }); M.vf.color.setScalar(1.5);
  const rig = new THREE.Group(); scene.add(rig);
  const W = weaponGeos(); let cur = '', gun = null, arms = null, kind = '', hold = null, limbs = null;
  const meshOf = geos => { const g = new THREE.Group(); for (const k in geos) g.add(new THREE.Mesh(geos[k], M[k] || M.v)); return g; };
  // modelos "na mão" do boneco vêm virados para o antebraço: aqui desfaz-se essa volta (cabo na origem, ponta para +z)
  const rawOf = k => { const g = new THREE.Group(); for (const m in W[k]) { const geo = W[k][m].clone(); geo.translate(0, 0.56, 0); geo.rotateX(-Math.PI / 2); g.add(new THREE.Mesh(geo, M[m] || M.v)); } return g; };
  // braço: do ombro (fora do ecrã) até à mão; manga da cor da camisola e mão da cor da pele (ou luva)
  const armTo = (b, from, to, sleeve, skin) => { const d = new THREE.Vector3().subVectors(to, from), L = d.length(), mid = from.clone().addScaledVector(d, 0.5), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    const g = new THREE.CapsuleGeometry(0.045, L - 0.02, 4, 10); g.applyQuaternion(q); g.translate(mid.x, mid.y, mid.z); b.add(g, sleeve);
    const h = new THREE.SphereGeometry(0.042, 12, 8); h.scale(0.9, 0.75, 1.25); h.applyQuaternion(q); h.translate(to.x, to.y, to.z); b.add(h, skin); };
  // braços que mexem (golpes e socos): manga e punho como peças soltas, postas em cada frame entre o ombro e a mão
  const _d = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
  // punho: palma, nós dos dedos dobrados e o polegar por cima (eixo +y = para onde o braço aponta); a manga acaba num punho de camisola
  const fistGeo = (skin, side) => { const b = new Builder(0), sk = skin; b.rbox(0.074, 0.08, 0.066, 0.02, 0, 0, 0, sk, { mat: 'v' }); for (let i = 0; i < 4; i++) b.rbox(0.02, 0.03, 0.034, 0.008, -0.028 + i * 0.0187, 0.044, 0.01, sk, { mat: 'v' }); b.rbox(0.024, 0.05, 0.024, 0.01, side * 0.036, 0.018, -0.026, sk, { mat: 'v', rz: side * 0.35 }); return b.merged('v'); };
  const limb = (top, skin, side = 1) => { const g = new THREE.Group(), sl = new THREE.Mesh(new THREE.CapsuleGeometry(0.043, 1, 4, 10), new THREE.MeshStandardMaterial({ color: top, roughness: 0.9 })), f = new THREE.Mesh(fistGeo(skin, side), M.arm), cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.03, 12), sl.material);
    g.add(sl, f, cuff); rig.add(g);
    return { g, place(from, to) { _d.subVectors(to, from); const L = Math.max(0.05, _d.length()); sl.scale.set(1, (L - 0.09) / 1.086, 1); _d.normalize(); sl.position.copy(from).addScaledVector(_d, (L - 0.06) / 2); sl.quaternion.setFromUnitVectors(_y, _d); cuff.quaternion.copy(sl.quaternion); cuff.position.copy(to).addScaledVector(_d, -0.06); f.quaternion.copy(sl.quaternion); f.position.copy(to).addScaledVector(_d, -0.02); } }; };
  const SH = new Set(); for (const w in W) for (const m in W[w]) SH.add(W[w][m]); // geometrias partilhadas com o boneco: não se apagam
  const clear = () => { for (const o of [gun, arms, hold]) if (o) { rig.remove(o); o.traverse(m => { if (m.geometry && !SH.has(m.geometry)) m.geometry.dispose(); }); } if (limbs) for (const l of limbs) { rig.remove(l.g); l.g.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material && m.material !== M.arm) m.material.dispose(); }); } gun = arms = hold = limbs = null; kind = ''; };
  const MELEE = { pedra: 1, machado: 1, picareta: 1, lanca: 1, faca: 1, bastao: 1, pecabra: 1, machete: 1, katana: 1 };
  const set = (k, att, look) => {
    const key = k + ':' + (att.scope || '') + ':' + (att.sup || '') + ':' + (att.light || '') + ':' + look.top + ':' + look.skin;
    if (key === cur) return; cur = key; clear();
    if (!k) return; // nada (vista de cima, ou a luneta tapa o ecrã)
    if (LONG.includes(k) && W[k]) { // espingarda: o vidro da mira (ou a mira de ferro) no eixo da vista quando aponta
      kind = 'long'; gun = new THREE.Group(); const sk = att.scope ? (att.scope === 'mira8' ? 'sc8_' : att.scope === 'reddot' ? null : att.scope === 'iron' ? null : 'sc_') : null;
      for (const w of [k, att.sup && 'sup_' + k, att.light && 'lt_' + k, sk && sk + k]) if (w && W[w]) gun.add(meshOf(W[w]));
      const [ry, rz] = RDP[k] || [0.085, 0.1]; if (att.scope === 'reddot' && RDP[k]) gun.add(meshOf(rdGeo(ry, rz)));
      // arma virada para a frente (−z da câmara) e o vidro da mira no eixo da vista; mira de ferro: o olho um pouco acima, a ver por cima da arma
      const S = new THREE.Vector3(WPUSH[0], WPUSH[1] + ry + (att.scope === 'reddot' ? 0.012 : 0.035), WPUSH[2] + rz);
      gun.rotation.y = Math.PI; gun.position.set(S.x, -S.y, -EYE + S.z); rig.add(gun); gun.updateMatrix();
      const hp = (HANDS[k] || HANDS.m4).map(h => new THREE.Vector3(WPUSH[0] + h[0], WPUSH[1] + h[1], WPUSH[2] + h[2]).applyMatrix4(gun.matrix));
      const b = new Builder(0); armTo(b, new THREE.Vector3(0.25, -0.3, -0.13), hp[0], look.top, look.skin); armTo(b, new THREE.Vector3(-0.2, -0.3, -0.3), hp[1], look.top, look.skin); // do cotovelo à mão
      arms = new THREE.Group(); for (const [kk] of b.buckets) arms.add(new THREE.Mesh(b.merged(kk), M.arm)); rig.add(arms); return;
    }
    if ((k === 'pistola' || k === 'revolver') && W[k]) { // pistola: com as duas mãos, um pouco à direita
      kind = 'pistol'; gun = new THREE.Group(); const g = rawOf(k); gun.add(g); if (att.sup && W['sup_' + k]) gun.add(rawOf('sup_' + k)); if (att.light && W['lt_' + k]) gun.add(rawOf('lt_' + k));
      gun.rotation.set(0.02, Math.PI + 0.07, 0); gun.position.set(0.1, -0.135, -0.4); rig.add(gun); gun.updateMatrix();
      const gr = new THREE.Vector3(0, -0.05, -0.02).applyMatrix4(gun.matrix), gl = new THREE.Vector3(0.022, -0.06, 0.0).applyMatrix4(gun.matrix);
      const b = new Builder(0); armTo(b, new THREE.Vector3(0.24, -0.56, 0.04), gr, look.top, look.skin); armTo(b, new THREE.Vector3(-0.16, -0.6, 0.04), gl, look.top, look.skin); // os braços vêm de baixo do ecrã (perto da cara tapavam tudo, sobretudo ao alto)
      arms = new THREE.Group(); for (const [kk] of b.buckets) arms.add(new THREE.Mesh(b.merged(kk), M.arm)); rig.add(arms); return;
    }
    // arma branca na mão direita, ou punhos
    limbs = [limb(look.top, look.skin, 1), limb(look.top, look.skin, -1)];
    if (MELEE[k] && W[k]) { kind = 'melee'; hold = new THREE.Group(); const g = rawOf(k); g.position.z = -0.02; hold.add(g); rig.add(hold); }
    else kind = 'fists';
  };
  let kick = 0, bob = 0, punch = -1, swT = -1;
  const SR = new THREE.Vector3(0.3, -0.52, 0.02), SL = new THREE.Vector3(-0.3, -0.54, 0.02), HR = new THREE.Vector3(), HL = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const ease = t => t * t * (3 - 2 * t);
  return {
    scene, cam, set,
    get on() { return !!(gun || limbs); },
    get kind() { return kind; },
    fire() { kick = 1; },
    // a mesma projeção da câmara do mundo (o centro fica onde está a mira), luz do dia/noite, recuo, balanço, golpes e recarregar
    // o: { day, nv, mv (0..1 a andar), ads (0 à anca .. 1 a apontar), sw (golpe 0..1 ou −1), rel (a recarregar 0..1), spr (a correr), up (a entrar na 1.ª pessoa 0..1), raise (arma levantada 0..1) }
    update(dt, main, o) {
      if (!gun && !limbs) return;
      // ao alto (telemóvel em pé) abre o campo para a arma não encher o ecrã
      cam.aspect = main.aspect; cam.fov = kind === 'long' ? Math.max(46, 2 * Math.atan(Math.tan(31 * Math.PI / 180) / Math.max(0.2, main.aspect)) * 180 / Math.PI) : 46 + 24 * Math.min(1, Math.max(0, (1 - main.aspect) / 0.54)); cam.updateProjectionMatrix(); const e = cam.projectionMatrix.elements, f = main.projectionMatrix.elements; e[8] = f[8]; e[9] = f[9]; cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      const D = o.day ?? 1, nv = o.nv || 0; hemi.intensity = 0.4 + 1.1 * D + 1.2 * nv; key.intensity = 0.3 + 2.2 * D;
      const th = Math.tan(cam.fov * Math.PI / 360), hw = th * cam.aspect * 0.42, bot = -th * 0.42, H = -2 * bot, fr = cam.aspect < 1 ? 0.24 : 0; // ecrã à distância das mãos (0,42 m): as mãos espreitam no fundo; ao alto sobem por cima da vida e do cinto
      const ads = kind === 'long' ? (o.ads ?? 1) : 0, hip = 1 - ads, mv = o.mv || 0, rel = o.rel || 0, spr = o.spr || 0, up = o.up ?? 1, dn = 1 - (o.raise ?? 1); // dn: arma em baixo (ainda não levantada)
      kick *= Math.exp(-dt * 16); bob += dt * mv * 7;
      const sw = mv * (0.004 + 0.014 * hip); // a andar a arma balança (muito menos a apontar)
      // à anca: mais em baixo e à direita, a apontar ligeiramente para o centro; a recarregar baixa e roda; a correr inclina-se
      const lo = (1 - ease(up)) * 0.32 + rel * 0.09 + spr * 0.05 + dn * hip * 0.01;
      const px0 = kind === 'pistol' ? Math.min(0.1, hw * 0.36) - 0.1 : 0, py0 = kind === 'pistol' ? bot + (cam.aspect < 1 ? 0.36 : 0.27) * H + 0.135 : 0; // pistola: um pouco à direita, por cima do fundo do ecrã
      rig.position.set(px0 + Math.sin(bob) * sw + hip * (kind === 'long' ? 0.17 : 0) + spr * 0.03, py0 + Math.abs(Math.cos(bob)) * sw - 0.004 * mv - hip * (kind === 'long' ? 0.004 : 0) - lo, kick * (kind === 'pistol' ? 0.05 : 0.035) + hip * (kind === 'long' ? 0.04 : 0));
      rig.rotation.set(kick * (kind === 'pistol' ? 0.16 : 0.05) - rel * 0.55 - spr * 0.12 - dn * hip * 0.035, hip * (kind === 'long' ? 0.1 : 0) + spr * 0.5 * (kind === 'long' ? 1 : 0.4), -hip * (kind === 'long' ? 0.06 : 0) - rel * 0.35);
      if (!limbs) return;
      // golpe (0..1): puxa atrás, desce com força, volta. Soco: a mão direita vai à frente e volta
      const s = o.sw ?? -1, t = s >= 0 ? s : -1;
      if (kind === 'melee') {
        let px = 0, pz = 0, ry = 0, dx = 0, dy = 0, dz = 0;
        if (t >= 0) { if (t < 0.3) { const a = ease(t / 0.3); px = 0.55 * a; dy = 0.05 * a; dz = 0.03 * a; } else if (t < 0.52) { const a = ease((t - 0.3) / 0.22); px = 0.55 - 1.95 * a; dx = -0.09 * a; dy = 0.05 - 0.12 * a; dz = 0.03 - 0.2 * a; ry = 0.25 * a; } else { const a = ease((t - 0.52) / 0.48); px = -1.4 * (1 - a); dx = -0.09 * (1 - a); dy = -0.07 * (1 - a); dz = -0.17 * (1 - a); ry = 0.25 * (1 - a); } }
        const hx = Math.min(0.19, hw * 0.55), hy = bot + fr * H + 0.03; HR.set(hx + dx, hy + dy, -0.42 + dz); hold.position.copy(HR);
        // o cabo sobe e aponta um pouco para a frente e para o centro (como quem segura um machado)
        _e.set(-2.3 + px, ry, 0.3, 'ZYX'); hold.quaternion.setFromEuler(_e);
        HL.set(-hx, hy - 0.1, -0.36); limbs[0].place(SR, HR); limbs[1].place(SL, HL); limbs[1].g.visible = false;
      } else {
        let pr = 0; if (t >= 0) pr = t < 0.35 ? ease(t / 0.35) : 1 - ease((t - 0.35) / 0.65);
        const hx = Math.min(0.21, hw * 0.6), hy = bot + fr * H + 0.03; HR.set(hx - 0.12 * pr, hy + 0.09 * pr, -0.44 - 0.22 * pr); HL.set(-hx, hy - 0.008, -0.46);
        limbs[0].place(SR, HR); limbs[1].place(SL, HL); limbs[1].g.visible = true;
      }
    },
  };
}
