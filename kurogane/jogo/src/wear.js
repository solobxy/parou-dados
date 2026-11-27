import * as THREE from 'three';
// desgaste nas personagens, proteções e armas: uma textura pequena (256 px) feita aqui, posta pelas coordenadas do próprio objeto
// (não escorrega quando a personagem anda). Sujidade em manchas, grão fino e riscos que mostram o metal por baixo, com brilho.
let TEX = null;
const tex = () => { if (TEX) return TEX; const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N);
  const rnd = (i, j, s) => { const h = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
  const vn = (u, v, f, s) => { const X = u * f, Y = v * f, i = Math.floor(X), j = Math.floor(Y), fx = X - i, fy = Y - j, w = q => q * q * (3 - 2 * q), m = a => ((a % f) + f) % f;
    const a = rnd(m(i), m(j), s), b = rnd(m(i + 1), m(j), s), cc = rnd(m(i), m(j + 1), s), d = rnd(m(i + 1), m(j + 1), s); return a + (b - a) * w(fx) + (cc - a) * w(fy) + (a - b - cc + d) * w(fx) * w(fy); };
  const S = new Float32Array(N * N); // riscos: segmentos finos ao acaso, a dar a volta à textura
  let sd = 9; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 260; n++) { let px = r() * N, py = r() * N; const a = r() * Math.PI, len = 4 + r() * (r() < 0.15 ? 60 : 18), str = 0.35 + r() * 0.65, dx = Math.cos(a), dy = Math.sin(a);
    for (let t = 0; t < len; t += 0.5) { const qx = ((Math.round(px + dx * t) % N) + N) % N, qy = ((Math.round(py + dy * t) % N) + N) % N; S[qy * N + qx] = Math.max(S[qy * N + qx], str * (1 - t / len * 0.5)); } }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const u = i / N, v = j / N, o = (j * N + i) * 4;
    const big = vn(u, v, 4, 11) * 0.5 + vn(u, v, 8, 12) * 0.3 + vn(u, v, 16, 13) * 0.2;
    const fine = vn(u, v, 64, 14) * 0.45 + vn(u, v, 128, 15) * 0.3 + rnd(i, j, 16) * 0.25;
    const chip = vn(u, v, 32, 17); // lascas de tinta nas arestas e manchas
    im.data[o] = big * 255; im.data[o + 1] = fine * 255; im.data[o + 2] = Math.max(S[j * N + i], Math.max(0, chip - 0.72) * 3.2) * 255; im.data[o + 3] = 255; }
  x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 2; return (TEX = t); };
// met: 0 = pano e plástico (só grão e sujidade), 1 = metal (riscos claros e brilhantes). sc: escala (o objeto em metros).
export const wear = (m, key, met = 0, sc = 1) => { if (typeof window !== 'undefined' && window.__noWear) return m; const prev = m.onBeforeCompile, pk = m.customProgramCacheKey && m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => { if (prev) prev.call(m, sh, r); sh.uniforms.uWear = { value: tex() };
    sh.vertexShader = 'varying vec3 vWrP; varying vec3 vWrN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWrP = transformed; vWrN = objectNormal;');
    sh.fragmentShader = 'uniform sampler2D uWear; varying vec3 vWrP; varying vec3 vWrN;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    float wrR = 0.0, wrM = 0.0;
    { vec3 an = abs( normalize( vWrN ) ); vec2 du = ( an.x > an.y && an.x > an.z ? vWrP.zy : ( an.y > an.z ? vWrP.xz : vWrP.xy ) ) * ${sc.toFixed(2)};
      vec4 w1 = texture2D( uWear, du * 2.3 + 0.37 ), w2 = texture2D( uWear, du * 7.1 );
      float gr = w1.r - 0.5, fn = w2.g - 0.5, sk = smoothstep( 0.3, 0.85, w2.b ) * smoothstep( 0.35, 0.6, w1.g );
      diffuseColor.rgb *= 1.0 + gr * 0.6 + fn * 0.24;
      ${met ? 'diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 0.55 + vec3( 0.32, 0.31, 0.3 ), sk * 0.7 ); wrR = gr * 0.3 + fn * 0.12 - sk * 0.32; wrM = sk * 0.35;' : `wrR = gr * 0.16 + fn * 0.12; diffuseColor.rgb *= 1.0 - sk * 0.16;
        vec3 c0 = diffuseColor.rgb; float sat = max(c0.r, max(c0.g, c0.b)) - min(c0.r, min(c0.g, c0.b));
        if (c0.r > c0.g * 2.0 && c0.g > c0.b * 2.5 && sat > 0.04) { /* madeira (coronhas, guarda-mãos, cabos): veios ao longo da peça e anéis escuros */
          float w1 = texture2D(uWear, vec2(vWrP.z * 0.9, (vWrP.x * 0.8 + vWrP.y) * 16.0) * ${sc.toFixed(2)}).r, w2 = texture2D(uWear, vec2(vWrP.z * 2.3 + 0.4, (vWrP.x * 0.8 + vWrP.y) * 42.0) * ${sc.toFixed(2)}).g;
          diffuseColor.rgb *= 0.74 + 0.42 * w1 + 0.16 * (w2 - 0.5); diffuseColor.rgb *= 1.0 - 0.28 * smoothstep(0.62, 0.7, fract(w1 * 7.0)); wrR -= 0.12 * w1; }
        else { diffuseColor.rgb *= 0.93 + 0.14 * texture2D(uWear, du * 26.0).g; } /* tecido e plástico: grão fino */`} }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp( roughnessFactor + wrR, 0.06, 1.0 );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = clamp( metalnessFactor + wrM, 0.0, 1.0 );'); };
  m.customProgramCacheKey = () => (pk ? pk() : '') + '|wear-' + key; return m; };
