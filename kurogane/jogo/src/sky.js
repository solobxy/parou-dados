import * as THREE from 'three';
// Céu: gradiente do horizonte ao zénite, sol (e brilho à volta ao fim da tarde), lua, estrelas e nuvens a andar.
// No horizonte tem a cor exata do nevoeiro, para o fim do mapa se fundir com o céu. Uma textura de 256 px para as nuvens; o resto são contas simples.
const cloudTex = () => {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N);
  const rnd = (i, j, s) => { const h = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
  const vn = (u, v, f, s) => { const X = u * f, Y = v * f, i = Math.floor(X), j = Math.floor(Y), fx = X - i, fy = Y - j, w = q => q * q * (3 - 2 * q), m = a => ((a % f) + f) % f;
    const a = rnd(m(i), m(j), s), b = rnd(m(i + 1), m(j), s), cc = rnd(m(i), m(j + 1), s), d = rnd(m(i + 1), m(j + 1), s); return a + (b - a) * w(fx) + (cc - a) * w(fy) + (a - b - cc + d) * w(fx) * w(fy); };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const u = i / N, v = j / N, o = (j * N + i) * 4;
    const big = vn(u, v, 3, 1) * 0.5 + vn(u, v, 6, 2) * 0.27 + vn(u, v, 12, 3) * 0.14 + vn(u, v, 24, 4) * 0.09;
    const fine = vn(u, v, 16, 5) * 0.45 + vn(u, v, 32, 6) * 0.3 + vn(u, v, 64, 7) * 0.25;
    im.data[o] = big * 255; im.data[o + 1] = fine * 255; im.data[o + 2] = 0; im.data[o + 3] = 255; }
  x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
};
export function makeSky() {
  const U = { uZen: { value: new THREE.Vector3() }, uHor: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoon: { value: 0.99905 }, uDay: { value: 1 }, uNight: { value: 0 }, uDusk: { value: 0 }, uCloud: { value: 0.35 }, uT: { value: 0 }, uTex: { value: cloudTex() } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, depthWrite: false, fog: false, toneMapped: false, side: THREE.BackSide,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); gl_Position = p; gl_Position.z = p.w * 0.99999; }',
    fragmentShader: `uniform vec3 uZen, uHor, uSun, uSunDir; uniform float uMoon, uDay, uNight, uDusk, uCloud, uT; uniform sampler2D uTex; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = d.y, hp = max(h, 0.0);
        vec3 col = mix(uHor, uZen, pow(hp, 0.5));
        float sd = max(dot(d, uSunDir), 0.0), up = smoothstep(-0.08, 0.04, uSunDir.y);
        col += uSun * (pow(sd, 5.0) * (0.12 + 0.5 * uDusk) * (1.0 - 0.6 * hp) + pow(sd, 90.0) * 0.55) * up;
        float disc = smoothstep(0.99935, 0.99965, sd) * up;
        vec3 md = -uSunDir; float mm = max(dot(d, md), 0.0);
        float mk = (1.0 - uMoon) / 0.00095; col += vec3(0.80, 0.84, 0.95) * smoothstep(uMoon, uMoon + 0.0003 * mk, mm) * uNight * (0.85 + 0.15 * texture2D(uTex, d.xy * 9.0).g) + vec3(0.16, 0.2, 0.32) * pow(mm, 40.0 / mk) * uNight;
        if (uNight > 0.02 && h > 0.0) { vec3 q = floor(d * 320.0); float s = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453); col += vec3(0.9) * step(0.9972, s) * uNight * smoothstep(0.0, 0.25, h); }
        float cv = 0.0;
        if (h > -0.02) { vec2 uv = d.xz / (hp + 0.11);
          float a = texture2D(uTex, uv * 0.11 + vec2(uT * 0.0016, uT * 0.0006)).r, b = texture2D(uTex, uv * 0.33 + vec2(-uT * 0.0025, uT * 0.0012)).g;
          float n = a * 0.78 + b * 0.32; cv = smoothstep(0.62 - uCloud * 0.32, 0.92 - uCloud * 0.18, n) * smoothstep(-0.02, 0.2, h);
          float lit = 0.55 + 0.45 * smoothstep(0.3, 0.85, b);
          vec3 cc = mix(uHor, vec3(1.0), 0.55 * uDay) * lit + uSun * pow(sd, 3.0) * (0.25 + 0.7 * uDusk) * up;
          cc = mix(cc, uHor * 0.75 + vec3(0.02), uNight * 0.9);
          cc = mix(cc, uHor, smoothstep(0.18, 0.0, h) * 0.7); // ao longe as nuvens desvanecem no nevoeiro
          col = mix(col, cc, cv * 0.92); }
        col += uSun * disc * 2.2 * (1.0 - cv * 0.85);
        { float az = atan(d.z, d.x); // colinas e montanhas ao longe, recortadas no horizonte (meio escondidas pelo nevoeiro)
          float m1 = texture2D(uTex, vec2(az * 0.16, 0.13)).r, m2 = texture2D(uTex, vec2(az * 0.55, 0.61)).g, hm = 0.018 + 0.1 * m1 * m1 + 0.015 * m2, hm2 = 0.008 + 0.045 * texture2D(uTex, vec2(az * 0.31 + 0.5, 0.37)).r;
          vec3 far = mix(uHor, uHor * vec3(0.72, 0.78, 0.8) + uZen * 0.08, 0.75), near = mix(uHor, uHor * vec3(0.55, 0.62, 0.6), 0.85);
          col = mix(col, far, smoothstep(hm + 0.002, hm - 0.002, h) * smoothstep(-0.05, 0.0, h)); col = mix(col, near, smoothstep(hm2 + 0.002, hm2 - 0.002, h) * smoothstep(-0.05, 0.0, h)); }
        col = mix(col, uHor, smoothstep(0.02, -0.06, h)); // abaixo do horizonte: a cor do nevoeiro
        gl_FragColor = vec4(col, 1.0); }` });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat); mesh.frustumCulled = false; mesh.renderOrder = -1000; mesh.matrixAutoUpdate = true;
  const ZD = new THREE.Color(0x3f77bf), ZS = new THREE.Color(0x4a3d6e), ZN = new THREE.Color(0x03060d), SD = new THREE.Color(0xfff0d0), SS = new THREE.Color(0xff7a3c), _z = new THREE.Color(), _s = new THREE.Color(), _o = { r: 0, g: 0, b: 0 };
  const srgb = (c, v) => { c.getRGB(_o, THREE.SRGBColorSpace); v.set(_o.r, _o.g, _o.b); };
  return { mesh, U,
    // cam: posição da câmara; fog: cor do nevoeiro (THREE.Color); sunDir: direção a sério do sol (pode estar abaixo do horizonte)
    update(cam, fog, sunDir, D, dusk, rain, t) {
      mesh.position.copy(cam); U.uSunDir.value.copy(sunDir); U.uDay.value = D; U.uNight.value = Math.max(0, 1 - D * 2.6); U.uDusk.value = dusk; U.uT.value = t;
      U.uCloud.value = 0.42 + 0.5 * (rain || 0);
      _z.copy(ZN).lerp(ZD, D).lerp(ZS, dusk * 0.9); if (rain) _z.lerp(fog, 0.6 * rain); srgb(_z, U.uZen.value); srgb(fog, U.uHor.value);
      _s.copy(SD).lerp(SS, Math.min(1, dusk * 1.4)).multiplyScalar(0.25 + 0.75 * D); srgb(_s, U.uSun.value); }
  };
}
