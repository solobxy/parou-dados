// Fogo: partículas na placa gráfica (chamas que sobem, encolhem e passam de branco-amarelo a laranja e vermelho,
// faúlhas que voam mais alto e fumo escuro por cima). Tudo é calculado no shader a partir do tempo: zero trabalho no processador.
// Usado na fogueira, na fornalha (boca e chaminé) e no avião caído.
import * as THREE from 'three';

const SH = { uT: { value: 0 }, uScale: { value: 400 } }; // tempo e escala de pixels, partilhados por todos os fogos
let _v = null;
export const fireFrame = (t, renderer, cam) => { SH.uT.value = t; _v = _v || new THREE.Vector2(); renderer.getDrawingBufferSize(_v); SH.uScale.value = _v.y / (2 * Math.tan(cam.fov * Math.PI / 360)); };

const VS = `
attribute vec4 aR;
uniform float uT, uScale, uSize, uH, uR, uOn, uLife, uRise, uSway, uGrow;
varying float vA; varying float vK;
void main() {
  float life = uLife * (0.75 + aR.y * 0.5);
  float a = fract(uT / life + aR.w);
  vec2 o = (aR.xz - 0.5) * 2.0 * uR;
  vec3 p = vec3(o.x, 0.0, o.y);
  p.xz *= mix(1.0, 0.15, pow(a, 0.8) * uRise);           // as chamas juntam-se em bico ao subir
  p.y = a * uH * (0.72 + aR.y * 0.46);
  float sw = uSway * a * uH;
  p.x += sin(uT * 3.1 + aR.w * 31.0) * sw + sin(uT * 7.3 + aR.x * 17.0) * sw * 0.35;
  p.z += cos(uT * 2.6 + aR.z * 23.0) * sw;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float sz = uSize * (0.55 + 0.7 * aR.z) * mix(1.0 - a * 0.75, 0.6 + a * 1.6, uGrow);
  gl_PointSize = uOn * sz * uScale / max(0.2, -mv.z);
  gl_Position = projectionMatrix * mv;
  vA = a; vK = aR.x;
}`;
// chama: núcleo quase branco, depois amarelo, laranja e vermelho escuro nas pontas; forma de gota com orla irregular
const FS_FLAME = `
uniform float uT;
varying float vA; varying float vK;
void main() {
  vec2 c = gl_PointCoord - 0.5; c.y *= 0.85;
  float ang = atan(c.y, c.x);
  float d = length(c) * 2.0 * (1.0 + 0.18 * sin(ang * 5.0 + vK * 40.0 + uT * 6.0));
  float m = 1.0 - smoothstep(0.25, 1.0, d);
  if (m <= 0.0) discard;
  vec3 hot = vec3(1.0, 0.93, 0.68), mid = vec3(1.0, 0.56, 0.14), cool = vec3(0.78, 0.16, 0.03);
  vec3 col = mix(hot, mid, smoothstep(0.05, 0.4, vA));
  col = mix(col, cool, smoothstep(0.4, 0.9, vA));
  col = mix(col, hot, (1.0 - smoothstep(0.0, 0.45, d)) * (1.0 - vA) * 0.35);
  float al = m * smoothstep(0.0, 0.1, vA) * (1.0 - smoothstep(0.5, 0.95, vA));
  gl_FragColor = vec4(col * 1.1, al * 0.9);
}`;
// faúlhas: pontinhos muito quentes que piscam
const FS_SPARK = `
uniform float uT;
varying float vA; varying float vK;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0; float m = 1.0 - smoothstep(0.0, 1.0, d);
  float blink = 0.6 + 0.4 * sin(uT * 25.0 + vK * 60.0);
  float al = m * (1.0 - vA) * blink;
  gl_FragColor = vec4(vec3(1.0, 0.7, 0.3) * 1.6, al);
}`;
// fumo: cinzento escuro, macio, cresce e desaparece
const FS_SMOKE = `
uniform float uDark;
varying float vA; varying float vK;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0 * (1.0 + 0.12 * sin(atan(c.y, c.x) * 4.0 + vK * 30.0));
  float m = 1.0 - smoothstep(0.2, 1.0, d);
  if (m <= 0.0) discard;
  float al = m * smoothstep(0.0, 0.2, vA) * (1.0 - smoothstep(0.45, 1.0, vA)) * uDark;
  gl_FragColor = vec4(vec3(0.16, 0.15, 0.14) + vK * 0.06, al);
}`;

const cloud = (n, o) => {
  const g = new THREE.BufferGeometry(), R = new Float32Array(n * 4), P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { R[i * 4] = Math.random(); R[i * 4 + 1] = Math.random(); R[i * 4 + 2] = Math.random(); R[i * 4 + 3] = i / n + Math.random() * 0.5 / n; }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aR', new THREE.BufferAttribute(R, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, o.h, 0), o.h * 1.5 + o.r + 1);
  const u = { uT: SH.uT, uScale: SH.uScale, uSize: { value: o.size }, uH: { value: o.h }, uR: { value: o.r }, uOn: { value: 1 }, uLife: { value: o.life }, uRise: { value: o.rise ?? 1 }, uSway: { value: o.sway ?? 0.08 }, uGrow: { value: o.grow || 0 }, uDark: { value: o.dark ?? 0.5 } };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: o.fs, transparent: true, depthWrite: false, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
  const pts = new THREE.Points(g, m); pts.renderOrder = o.order || 5; pts.frustumCulled = true; return pts;
};

// s = tamanho (1 = fogueira); smoke = quanto fumo (0 a 1)
export function makeFire(s = 1, o = {}) {
  const g = new THREE.Group();
  const flame = cloud(o.n || Math.round(34 * Math.min(2.5, s)), { size: 0.3 * s, h: 0.78 * s, r: 0.16 * s, life: 0.75 + 0.1 * s, fs: FS_FLAME, add: true, order: 6 });
  const core = cloud(8, { size: 0.17 * s, h: 0.22 * s, r: 0.1 * s, life: 0.45, fs: FS_FLAME, add: true, order: 6, rise: 0.5 });
  const spark = cloud(o.sparks ?? Math.round(9 * Math.min(2, s)), { size: 0.045 * Math.sqrt(s), h: 2.2 * s, r: 0.15 * s, life: 1.6, fs: FS_SPARK, add: true, order: 7, rise: 0.2, sway: 0.35 });
  g.add(flame, core, spark);
  let smoke = null; if ((o.smoke ?? 1) > 0) { smoke = cloud(o.puffs || 14, { size: 0.55 * s, h: (o.smokeH || 3.2) * s, r: 0.12 * s, life: 3.6, fs: FS_SMOKE, order: 4, rise: 0, sway: 0.18, grow: 1, dark: 0.38 * (o.smoke ?? 1) }); g.add(smoke); }
  const parts = [flame, core, spark].concat(smoke ? [smoke] : []);
  return { g, flame, smoke, parts,
    set(on) { g.visible = !!on; },
    // fumo sozinho (ex.: a chaminé da fornalha) ou chama mais baixa
    fade(k) { if (smoke) smoke.material.uniforms.uDark.value = 0.38 * (o.smoke ?? 1) * k; },
    dim(k) { flame.material.uniforms.uOn.value = k; core.material.uniforms.uOn.value = k; spark.material.uniforms.uOn.value = k; },
    dispose() { for (const p of parts) { p.geometry.dispose(); p.material.dispose(); } } };
}

// só fumo (chaminés)
export function makeSmoke(s = 1, o = {}) {
  const smoke = cloud(o.puffs || 12, { size: 0.5 * s, h: (o.h || 3) * s, r: 0.06 * s, life: 3.2, fs: FS_SMOKE, order: 4, rise: 0, sway: 0.2, grow: 1, dark: o.dark ?? 0.35 });
  return { g: smoke, set(on) { smoke.visible = !!on; }, dispose() { smoke.geometry.dispose(); smoke.material.dispose(); } };
}
