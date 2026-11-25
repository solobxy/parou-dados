// Arma e braços na primeira pessoa (com a mira de ponto vermelho): desenhados por cima do mundo, com o vidro da mira
// exatamente no centro da mira. Usa os mesmos modelos das armas que se veem no boneco.
import * as THREE from 'three';
import { Builder } from './builder.js';
import { weaponGeos, RDP, WPUSH } from './chars.js';

// onde pegam as mãos (no espaço da arma, antes do empurrão para o ombro): punho e guarda-mão
// (x positivo da arma fica à esquerda no ecrã: a mão de apoio agarra o guarda-mão por esse lado)
const HANDS = { m4: [[-0.035, -0.1, -0.02], [0.068, -0.03, 0.44]], ak: [[-0.035, -0.09, -0.06], [0.062, -0.025, 0.42]], smg: [[-0.03, -0.07, 0.04], [0.055, -0.02, 0.28]], caca: [[-0.035, -0.06, -0.12], [0.058, -0.02, 0.3]], m249: [[-0.04, -0.1, -0.04], [0.068, -0.035, 0.4]], pkm: [[-0.04, -0.1, -0.04], [0.066, -0.035, 0.42]] };
const EYE = 0.3; // distância do olho ao vidro da mira (m)
// a mira com vidro transparente (no boneco o vidro é opaco, mas aqui olha-se através dele)
const rdGeo = (y, z) => { const b = new Builder(0), BLK = 0x1c1e21; b.push(...WPUSH); b.box(0.045, 0.012, 0.07, 0, y - 0.02, z, 0x2a2c2e, { mat: 'm' }); for (const s of [-1, 1]) b.box(0.006, 0.05, 0.06, s * 0.022, y + 0.01, z, BLK, { mat: 'm' }); b.box(0.05, 0.008, 0.06, 0, y + 0.038, z, BLK, { mat: 'm' }); b.box(0.038, 0.04, 0.004, 0, y + 0.012, z + 0.028, 0xffffff, { mat: 'gl' }); b.pop(); const o = {}; for (const [k] of b.buckets) o[k] = b.merged(k); return o; };

export function makeVM() {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(46, 1, 0.01, 6);
  const hemi = new THREE.HemisphereLight(0xdfe6ff, 0x3a332c, 1), key = new THREE.DirectionalLight(0xfff0dc, 1); key.position.set(-0.4, 1, 0.5); scene.add(hemi, key);
  // cores da arma um pouco mais claras do que no mundo: vista tão de perto, o preto puro fica um borrão
  const M = { v: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.35 }), lit: new THREE.MeshBasicMaterial({ vertexColors: true }),
    gl: new THREE.MeshBasicMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.1, depthWrite: false }), arm: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }) };
  M.v.color.setScalar(1.7); M.m.color.setScalar(2.4);
  M.vf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true });
  const rig = new THREE.Group(); scene.add(rig);
  const W = weaponGeos(); let cur = '', gun = null, arms = null;
  const meshOf = geos => { const g = new THREE.Group(); for (const k in geos) g.add(new THREE.Mesh(geos[k], M[k] || M.v)); return g; };
  // braço: do ombro (fora do ecrã) até à mão; manga da cor da camisola e mão da cor da pele (ou luva)
  const armTo = (b, from, to, sleeve, skin) => { const d = new THREE.Vector3().subVectors(to, from), L = d.length(), mid = from.clone().addScaledVector(d, 0.5), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    const g = new THREE.CapsuleGeometry(0.045, L - 0.02, 4, 10); g.applyQuaternion(q); g.translate(mid.x, mid.y, mid.z); b.add(g, sleeve);
    const h = new THREE.SphereGeometry(0.042, 12, 8); h.scale(0.9, 0.75, 1.25); h.applyQuaternion(q); h.translate(to.x, to.y, to.z); b.add(h, skin); };
  const set = (k, att, look) => {
    const key = k + ':' + (att.scope || '') + ':' + (att.sup || '') + ':' + (att.light || '') + ':' + look.top + ':' + look.skin;
    if (key === cur) return; cur = key;
    if (gun) { rig.remove(gun); gun = null; } if (arms) { rig.remove(arms); arms.traverse(o => o.geometry && o.geometry.dispose()); arms = null; }
    if (!RDP[k] || att.scope !== 'reddot') return;
    gun = new THREE.Group(); for (const w of [k, att.sup && 'sup_' + k, att.light && 'lt_' + k]) if (w && W[w]) gun.add(meshOf(W[w])); gun.add(meshOf(rdGeo(...RDP[k])));
    // arma virada para a frente (−z da câmara) e o vidro da mira no eixo da vista
    const [ry, rz] = RDP[k], S = new THREE.Vector3(WPUSH[0], WPUSH[1] + ry + 0.012, WPUSH[2] + rz);
    gun.rotation.y = Math.PI; gun.position.set(S.x, -S.y, -EYE + S.z); rig.add(gun); gun.updateMatrix();
    const hp = (HANDS[k] || HANDS.m4).map(h => new THREE.Vector3(WPUSH[0] + h[0], WPUSH[1] + h[1], WPUSH[2] + h[2]).applyMatrix4(gun.matrix));
    const b = new Builder(0); armTo(b, new THREE.Vector3(0.16, -0.36, -0.02), hp[0], look.top, look.skin); armTo(b, new THREE.Vector3(-0.2, -0.3, -0.3), hp[1], look.top, look.skin); // do cotovelo à mão
    arms = new THREE.Group(); for (const [kk] of b.buckets) arms.add(new THREE.Mesh(b.merged(kk), M.arm)); rig.add(arms);
  };
  let kick = 0, bob = 0;
  return {
    scene, cam, set,
    get on() { return !!gun; },
    fire() { kick = 1; },
    // a mesma projeção da câmara do mundo (o centro fica onde está a mira), luz do dia/noite, recuo e balanço
    update(dt, main, o) {
      if (!gun) return;
      cam.aspect = main.aspect; cam.updateProjectionMatrix(); const e = cam.projectionMatrix.elements, f = main.projectionMatrix.elements; e[8] = f[8]; e[9] = f[9]; cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      const D = o.day ?? 1, nv = o.nv || 0; hemi.intensity = 0.4 + 1.1 * D + 1.2 * nv; key.intensity = 0.3 + 2.2 * D;
      kick *= Math.exp(-dt * 16); bob += dt * (o.mv || 0) * 7;
      const sw = (o.mv || 0) * 0.004; rig.position.set(Math.sin(bob) * sw, Math.abs(Math.cos(bob)) * sw - 0.004 * (o.mv || 0), kick * 0.035); rig.rotation.set(kick * 0.05, 0, 0);
    },
  };
}
