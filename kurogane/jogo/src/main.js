// Kurogane (nome provisório) · protótipo jogável de um só jogador.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, Atlas, ctex, mat4, FONT_JP } from './builder.js';
import { buildWorld, MAP, CORE, CITY, inCity } from './world.js';
import { makeSectors } from './sectors.js';
import { Body, ZHorde, ZHEAD, bagMesh, HIP, zombiePose, newPose, LOOK_OPTS, RDP, PCOL, lookCol } from './chars.js';
import * as Conta from './conta.js';
import { makeFire, fireFrame } from './fire.js';
import { ITEMS, RECIPES, ammoOf, attFits } from './items.js';
import { VT } from './vtypes.js';
import { Grid, Inv, mkItem, rollLoot, capOf } from './bag.js';
import { makeIcons } from './items3d.js';
import { audio } from './audio.js';
import { initUI } from './ui.js';
import { makeBase } from './base.js';
import { makeNav } from './nav.js';
import { makeNet } from './net.js';
import { ARENA, arenaSpawns, ARENA_KITS, inArena } from './arena.js';
import { makeCars } from './cars.js';
import { makeVM } from './vm.js';
import { track, push, sample } from './interp.js';
import { TRADERS, PRICE, SELL, TRADE_R } from './traders.js';
import { initPWA } from './pwa.js';
import { ANK, ANBYK, ANLOOT, spawnAnimals, anHit, anPart, animalAI, Fauna } from './animals.js';

const TOUCH = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
const DEBUG = /debug/.test(location.hash) || window.__test;
const FISTS = { n: 'Mãos', melee: { dmg: 9, rng: 1.5, cd: 0.55, arc: 1.6, g: { wood: 2, stone: 1, ore: 1 } } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

boot().catch(e => { console.error(e.stack || String(e)); window.__failed = String(e.stack || e); const el = document.getElementById('err'); if (el) { el.hidden = false; el.textContent = 'Erro ao arrancar: ' + e.message; } });

async function boot() {
  const wait = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  // percentagem no ecrã de carregamento: deixa o browser pintar entre as etapas pesadas (senão parece que bloqueou)
  const LP = (pc, txt) => { (window.__lp = window.__lp || []).push([pc, Math.round(performance.now())]); const L = document.getElementById('load'); if (L) { L.classList.add('pc'); const b = L.querySelector('.bar b'), t = document.getElementById('ldP'); if (b) b.style.width = pc + '%'; if (t) t.textContent = pc + '%' + (txt ? ' · ' + txt : ''); } return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); };
  await LP(3, 'a preparar');
  await wait(Promise.all([document.fonts.load('700 40px "Roboto Condensed"'), document.fonts.load('600 40px "Roboto Condensed"'), document.fonts.load('900 40px "KJP"', '黒鉄'), document.fonts.load('500 16px "Roboto Condensed"')]), 2500);

  // ---------- renderer, cena, luz
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  window.__rinfo = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, progs: renderer.info.programs ? renderer.info.programs.length : 0 }); // testes: o peso do que se desenha
  const PR = Math.min(devicePixelRatio || 1, TOUCH ? 1.5 : 2);
  renderer.setPixelRatio(PR); renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const FOG = 0xb7a991; scene.background = new THREE.Color(FOG); scene.fog = new THREE.Fog(FOG, 62, 150);
  const SUNDIR = new THREE.Vector3(-58, 40, 30).normalize();
  const hemi = new THREE.HemisphereLight(0xa8bde0, 0x5b4a3a, 0.62); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc896, 3.0); sun.castShadow = true;
  const SH = 24, SMAP = TOUCH ? 1024 : 2048; sun.shadow.mapSize.set(SMAP, SMAP);
  Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 160 }); sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; scene.add(sun, sun.target);
  { const pm = new THREE.PMREMGenerator(renderer), sky = new THREE.Scene(), g = new THREE.SphereGeometry(100, 24, 12), p = g.attributes.position, col = [];
    const lo = new THREE.Color(0xf0bf8a), hi = new THREE.Color(0x6a8cc0), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 100; if (t < 0) c.set(0x4a4038); else c.copy(lo).lerp(hi, Math.pow(t, 0.55)); col.push(c.r, c.g, c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); sky.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    scene.environment = pm.fromScene(sky, 0.03).texture; scene.environmentIntensity = 0.5; pm.dispose(); }
  const flash = new THREE.PointLight(0xffc070, 0, 12, 1.5); scene.add(flash);
  // chuva: riscos desenhados na placa gráfica, presos ao mundo (não «nadam» quando a câmara anda)
  const RAIN = (() => { const N = TOUCH ? 1100 : 2000, B = 30, H = 20; const pos = new Float32Array(N * 6), seed = new Float32Array(N * 6), end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { const a = Math.random(), b = Math.random(), c = Math.random(); for (let k = 0; k < 2; k++) { seed.set([a, b, c], (i * 2 + k) * 3); end[i * 2 + k] = k; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 3)); g.setAttribute('end', new THREE.BufferAttribute(end, 1));
    const U = { uT: { value: 0 }, uC: { value: new THREE.Vector3() }, uA: { value: 0 }, uIn: { value: new THREE.Vector4(1, 1, -1, -1) }, uCol: { value: new THREE.Color(0xb8c6d6) } };
    const m = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, fog: false,
      vertexShader: `uniform float uT; uniform vec3 uC; uniform vec4 uIn; attribute vec3 seed; attribute float end; varying float vA;
        void main() { float B = ${B.toFixed(1)}, H = ${H.toFixed(1)}; float x = uC.x - B + mod(seed.x * 2.0 * B - (uC.x - B), 2.0 * B); float z = uC.z - B + mod(seed.y * 2.0 * B - (uC.z - B), 2.0 * B);
          float y = mod(seed.z * H - uT * (17.0 + seed.x * 5.0), H); vec3 p = vec3(x + 0.12 * y, y, z + 0.05 * y); if (end > 0.5) { p.y -= 0.95; p.x -= 0.11; p.z -= 0.05; }
          float inside = step(uIn.x, p.x) * step(p.x, uIn.z) * step(uIn.y, p.z) * step(p.z, uIn.w); vA = (1.0 - inside) * (0.55 + 0.45 * seed.y) * (1.0 - smoothstep(0.75, 1.0, y / H));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float uA; uniform vec3 uCol; varying float vA; void main() { gl_FragColor = vec4(uCol, vA * uA); }` });
    const mesh = new THREE.LineSegments(g, m); mesh.frustumCulled = false; mesh.renderOrder = 8; mesh.visible = false; scene.add(mesh); return { mesh, U }; })();
  const RAINFOG = new THREE.Color(0x6f7680);
  // noite: lanterna (com sombras, por isso as paredes tapam), luz fraca à volta de ti e candeeiros por perto
  const torch = new THREE.SpotLight(0xfff0d8, 0, 28, 0.5, 0.55, 1.3); torch.castShadow = true; torch.shadow.camera.layers.enable(1); torch.shadow.mapSize.set(512, 512); torch.shadow.bias = -0.0008; torch.shadow.camera.near = 0.04; scene.add(torch, torch.target); // near pequeno: encostado a uma parede, a parede ainda entra no mapa de sombras (senão a luz passava para o outro lado)
  const glow = new THREE.PointLight(0xa8b8d8, 0, 4.5, 1.6); // luz fraca à volta do boneco de noite (curta, para não se notar através de paredes) scene.add(glow);
  const lampL = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xffc27a, 0, 20, 1.6); scene.add(l); return l; }); // os candeeiros mais perto da câmara acendem a sério
  // o lume e os candeeiros da base mais perto: luz com sombra (as paredes da base, mesmo baixas, tapam-na; camada 1 = cópias inteiras das paredes)
  const baseL = [0].map(() => { const l = new THREE.PointLight(0xff9a4a, 0, 9, 1.7); l.castShadow = true; l.shadow.mapSize.set(256, 256); l.shadow.camera.near = 0.08; l.shadow.camera.far = 9; l.shadow.bias = -0.004; l.shadow.camera.layers.enable(1); scene.add(l); return l; });
  const FOGD = new THREE.Color(0xb7a991), FOGS = new THREE.Color(0x9a6a52), FOGN = new THREE.Color(0x0c1018), SUNC = new THREE.Color(0xffc896), MOONC = new THREE.Color(0x8aa2d8), _fc = new THREE.Color(), _rc = new THREE.Color();
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---------- texturas e materiais
  let seed = 99; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const noiseTex = (w, base, spots, fn) => ctex(w, w, (x, W, H) => { x.fillStyle = base; x.fillRect(0, 0, W, H); for (const [n, f] of spots) for (let i = 0; i < n; i++) f(x, R() * W, R() * H); if (fn) fn(x, W, H); });
  const TX = {
    asph: noiseTex(512, '#5d5e61', [[9000, (x, a, b) => { const v = 70 + Math.floor(R() * 44); x.fillStyle = `rgba(${v},${v},${v + 3},${0.25 + R() * 0.35})`; x.fillRect(a, b, 1 + R() * 2.5, 1 + R() * 2.5); }], [14, (x, a, b) => { x.fillStyle = `rgba(28,28,30,${0.08 + R() * 0.1})`; x.beginPath(); x.ellipse(a, b, 20 + R() * 60, 10 + R() * 30, R() * 3, 0, 7); x.fill(); }]], (x, W, H) => { x.strokeStyle = 'rgba(24,24,26,.5)'; x.lineWidth = 1.2; for (let i = 0; i < 8; i++) { x.beginPath(); let px = R() * W, py = R() * H; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += R() * 40 - 20; py += R() * 40 - 20; x.lineTo(px, py); } x.stroke(); } }),
    tile: ctex(256, 256, (x, w, h) => { const n = 8, s = w / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 172 + Math.floor(R() * 22); x.fillStyle = `rgb(${v},${v - 3},${v - 10})`; x.fillRect(i * s, j * s, s, s); } x.strokeStyle = 'rgba(95,92,86,.55)'; x.lineWidth = 2; for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s, h); x.stroke(); x.beginPath(); x.moveTo(0, i * s); x.lineTo(w, i * s); x.stroke(); } }),
    grass: noiseTex(512, '#4f6b36', [[60, (x, a, b) => { x.fillStyle = `rgba(${R() < 0.5 ? '96,122,62' : '62,86,42'},${0.25 + R() * 0.3})`; x.beginPath(); x.ellipse(a, b, 20 + R() * 50, 15 + R() * 40, R() * 3, 0, 7); x.fill(); }], [5000, (x, a, b) => { const g = 90 + Math.floor(R() * 60); x.strokeStyle = `rgba(${g * 0.6 | 0},${g},${g * 0.45 | 0},${0.35 + R() * 0.4})`; x.lineWidth = 1; x.beginPath(); x.moveTo(a, b); x.lineTo(a + R() * 4 - 2, b - 3 - R() * 5); x.stroke(); }], [40, (x, a, b) => { x.fillStyle = `rgba(110,92,64,${0.2 + R() * 0.2})`; x.beginPath(); x.ellipse(a, b, 6 + R() * 16, 4 + R() * 10, R() * 3, 0, 7); x.fill(); }]]),
    dirt: noiseTex(256, '#7a6448', [[3000, (x, a, b) => { const v = 90 + Math.floor(R() * 50); x.fillStyle = `rgba(${v + 20},${v},${v - 25},.4)`; x.fillRect(a, b, 2, 2); }], [20, (x, a, b) => { x.fillStyle = 'rgba(70,56,40,.25)'; x.beginPath(); x.ellipse(a, b, 10 + R() * 30, 6 + R() * 20, R() * 3, 0, 7); x.fill(); }]]),
    conc: noiseTex(256, '#b4afa6', [[2600, (x, a, b) => { const v = 150 + Math.floor(R() * 60); x.fillStyle = `rgba(${v},${v - 2},${v - 6},.35)`; x.fillRect(a, b, 2, 2); }], [10, (x, a, b) => { x.fillStyle = 'rgba(70,64,56,.12)'; x.beginPath(); x.ellipse(a, b, 10 + R() * 40, 6 + R() * 30, R() * 3, 0, 7); x.fill(); }]], (x, W) => { x.strokeStyle = 'rgba(60,56,50,.35)'; x.lineWidth = 2; x.strokeRect(0, 0, W, W); }),
    fence: ctex(64, 64, (x, w) => { x.clearRect(0, 0, w, w); x.strokeStyle = '#c8ccd0'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 0); x.lineTo(w, w); x.moveTo(w, 0); x.lineTo(0, w); x.stroke(); }),
  };
  const A = new Atlas(2048, 2048); window.__atlas = A;
  const S = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, ...o });
  const mats = {
    v: S(), vf: S({ flatShading: true }), m: S({ roughness: 0.38, metalness: 0.55 }), win: S({ roughness: 0.18, metalness: 0.45, envMapIntensity: 1.6 }),
    nwin: S({ roughness: 0.2, metalness: 0.3, emissive: 0xffc98a, emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), nwin2: S({ roughness: 0.2, metalness: 0.3, emissive: 0xcfe3ff, emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    gl: new THREE.MeshStandardMaterial({ color: 0x9ab8c8, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.3, depthWrite: false }),
    lit: new THREE.MeshBasicMaterial({ vertexColors: true }),
    asph: S({ map: TX.asph, roughness: 0.95 }), tile: S({ map: TX.tile, roughness: 0.9 }), grass: S({ map: TX.grass, roughness: 1 }), dirt: S({ map: TX.dirt, roughness: 1 }), conc: S({ map: TX.conc, roughness: 0.95 }),
    decal: S({ roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    fence: S({ map: TX.fence, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.5 }),
    water: S({ roughness: 0.32, metalness: 0.05, envMapIntensity: 0.9, normalMap: (() => { const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N), W2 = [[1, 2, 0.5, 0.3], [3, -1, 1.7, 0.22], [-2, 3, 2.9, 0.18], [5, 4, 0.4, 0.1], [-6, 5, 1.1, 0.08]];
      const h = (i, j) => W2.reduce((s, [a, b2, f, k]) => s + k * Math.sin(2 * Math.PI * (a * i + b2 * j) / N + f), 0);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const dx = (h(i + 1, j) - h(i - 1, j)) * 9, dy = (h(i, j + 1) - h(i, j - 1)) * 9, l = Math.hypot(dx, dy, 1), o = (j * N + i) * 4; im.data[o] = (-dx / l * 0.5 + 0.5) * 255; im.data[o + 1] = (-dy / l * 0.5 + 0.5) * 255; im.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; im.data[o + 3] = 255; }
      x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })(), normalScale: new THREE.Vector2(0.16, 0.16) }),
  };
  // texturas realistas do chão (ficheiros ao lado da página; até chegarem, ficam as desenhadas aqui) e duas amostras misturadas
  // com uma mancha larga, para não se ver a repetição dos quadrados
  { const AT = new Set(['grass', 'dirt', 'asph']), BR = new Set(['grass', 'dirt', 'asph', 'conc', 'tile']);
    for (const k of BR) { const m = mats[k]; m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
      vec2 uA = vMapUv; float n1 = 0.5 + 0.5 * sin(uA.x * 1.31 + sin(uA.y * 0.83) * 2.1) * sin(uA.y * 1.17 + sin(uA.x * 0.71) * 1.9);
      vec4 sampledDiffuseColor = texture2D(map, uA);
      ${AT.has(k) ? 'vec2 uB = mat2(0.8, -0.6, 0.6, 0.8) * uA * 0.61 + vec2(0.37, 0.11); vec4 cB = texture2D(map, uB); sampledDiffuseColor = mix(sampledDiffuseColor, cB, smoothstep(0.3, 0.7, n1));' : ''}
      float n2 = 0.5 + 0.5 * sin(uA.x * 0.23 + 1.7) * sin(uA.y * 0.19 + 0.4); sampledDiffuseColor.rgb *= 0.9 + 0.2 * n2;
      diffuseColor *= sampledDiffuseColor;
      #endif`); }; m.customProgramCacheKey = () => 'chao-' + k; }
    const L = new THREE.TextureLoader();
    for (const k of BR) L.load('tex/' + k + '.jpg', t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; const m = mats[k]; const old = m.map; m.map = t; m.needsUpdate = true; if (old && old.dispose) old.dispose(); }, undefined, () => {}); }

  // ---------- mundo
  const atlasTex = A.texture();
  mats.sign = new THREE.MeshStandardMaterial({ map: atlasTex, emissiveMap: atlasTex, emissive: 0xffffff, emissiveIntensity: 1.05, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); // placas e janelas acesas à frente da parede: sem tremer ao longe na luneta
  mats.paint = new THREE.MeshStandardMaterial({ map: atlasTex, roughness: 0.85, alphaTest: 0.4, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  // ---------- detalhe nas construções (paredes, chão, móveis, prateleiras): uma textura de 256 px feita aqui, posta pelas coordenadas do mundo
  // (reboco com grão, manchas, escorridos de chuva e sujidade junto ao chão; chão com desgaste). Uma leitura de textura por píxel: quase não pesa.
  const DET = (() => { const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N);
    const rnd = (i, j, s) => { const h = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
    const vn = (u, v, f, s) => { const X = u * f, Y = v * f, i = Math.floor(X), j = Math.floor(Y), fx = X - i, fy = Y - j, w = q => q * q * (3 - 2 * q), m = (a) => ((a % f) + f) % f;
      const a = rnd(m(i), m(j), s), b = rnd(m(i + 1), m(j), s), cc = rnd(m(i), m(j + 1), s), d = rnd(m(i + 1), m(j + 1), s); return a + (b - a) * w(fx) + (cc - a) * w(fy) + (a - b - cc + d) * w(fx) * w(fy); };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const u = i / N, v = j / N, o = (j * N + i) * 4;
      const big = vn(u, v, 4, 1) * 0.55 + vn(u, v, 8, 2) * 0.3 + vn(u, v, 16, 3) * 0.15; // manchas largas
      const fine = vn(u, v, 64, 4) * 0.5 + vn(u, v, 128, 5) * 0.3 + rnd(i, j, 6) * 0.2; // grão
      const streak = vn(u, v * 0.06 + 0.3, 32, 7) * 0.7 + vn(u, v, 8, 8) * 0.3; // escorridos (verticais)
      im.data[o] = big * 255; im.data[o + 1] = fine * 255; im.data[o + 2] = streak * 255; im.data[o + 3] = 255; }
    x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 2; return t; })();
  const detail = (m, amt, key) => { m.onBeforeCompile = sh => { sh.uniforms.uDet = { value: DET };
      sh.vertexShader = 'varying vec3 vDetP; varying vec3 vDetN;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vec4 dwp = vec4( transformed, 1.0 );\n#ifdef USE_INSTANCING\n dwp = instanceMatrix * dwp;\n#endif\n vDetP = ( modelMatrix * dwp ).xyz; vDetN = normalize( mat3( modelMatrix ) * objectNormal );');
      sh.fragmentShader = 'uniform sampler2D uDet; varying vec3 vDetP; varying vec3 vDetN;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 an = abs( vDetN ); bool up = an.y > 0.6; vec2 du = up ? vDetP.xz : ( an.x > an.z ? vDetP.zy : vDetP.xy );
        vec4 d1 = texture2D( uDet, du * 0.21 ), d2 = texture2D( uDet, du * 1.37 );
        float k = ( d1.r - 0.5 ) * 0.34 + ( d2.g - 0.5 ) * 0.22;
        if ( !up ) { k -= smoothstep( 0.55, 0.95, texture2D( uDet, vec2( du.x * 0.35, du.y * 0.02 ) ).b ) * 0.12; k -= ( 1.0 - smoothstep( 0.0, 0.55, vDetP.y ) ) * 0.14; } // escorridos e sujidade junto ao chão
        else { k = ( d1.r - 0.5 ) * 0.14 + ( d2.g - 0.5 ) * 0.16 + ( d2.r - 0.5 ) * 0.08; // chão: menos manchas
          vec3 c0 = diffuseColor.rgb; float lum = dot( c0, vec3( 0.299, 0.587, 0.114 ) ), sat = max( c0.r, max( c0.g, c0.b ) ) - min( c0.r, min( c0.g, c0.b ) );
          { // chãos dos prédios: mosaico nos claros, tábuas nos castanhos
            if ( lum > 0.45 && sat < 0.12 ) { vec2 g = abs( fract( vDetP.xz / 0.6 ) - 0.5 ); float ln = smoothstep( 0.485, 0.497, max( g.x, g.y ) ); k -= ln * 0.22; k += ( texture2D( uDet, floor( vDetP.xz / 0.6 ) * 0.137 ).g - 0.5 ) * 0.08; }
            else if ( c0.r > c0.g && c0.g > c0.b && sat > 0.08 ) { float row = floor( vDetP.z / 0.19 ), off = fract( row * 0.618 ) * 1.7; float seam = abs( fract( vDetP.z / 0.19 ) - 0.5 ), joint = abs( fract( ( vDetP.x + off ) / 1.7 ) - 0.5 );
              k -= smoothstep( 0.46, 0.5, seam ) * 0.2 + smoothstep( 0.485, 0.5, joint ) * 0.16; k += ( texture2D( uDet, vec2( row * 0.173, vDetP.x * 0.05 ) ).g - 0.5 ) * 0.16 + ( texture2D( uDet, vec2( vDetP.x * 0.9, vDetP.z * 6.0 ) ).g - 0.5 ) * 0.08; } } }
        diffuseColor.rgb *= 1.0 + k * ${amt.toFixed(2)}; }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp( roughnessFactor + ( texture2D( uDet, ( abs( vDetN.y ) > 0.6 ? vDetP.xz : vDetP.xy + vDetP.zy ) * 0.9 ).g - 0.5 ) * 0.18, 0.04, 1.0 );`); };
    m.customProgramCacheKey = () => 'det-' + key; return m; };
  const wmats = { ...mats, v: detail(S(), 1, 'v'), vf: detail(S({ flatShading: true }), 1, 'vf'), m: detail(S({ roughness: 0.38, metalness: 0.55 }), 0.55, 'm') }; // só o que está construído no mapa (personagens e armas ficam sem isto)
  const ARENA_ON = (() => { try { return sessionStorage.getItem('kgArena') === '1' || /[?&]arena\b/.test(location.search); } catch (e) { return false; } })(); // modo arena: só PvP no mapa de Tóquio
  await LP(12, 'a construir a cidade');
  const tW0 = performance.now(); const W = buildWorld(scene, wmats, A, { arena: ARENA_ON }); W.buildMs = Math.round(performance.now() - tW0);
  await LP(50, 'a preparar o mapa');
  atlasTex.needsUpdate = true;
  // sombras dos prédios mesmo com o telhado e as paredes de cima escondidos (quando estás lá dentro): o sol e a lanterna nunca atravessam telhados nem paredes,
  // só entram por janelas (o vidro não faz sombra) e portas abertas. Cópias só para sombra, na camada 1, que a câmara não desenha
  { const shm = new THREE.MeshBasicMaterial(); let SH = null; const add = g => g && g.traverse(m => { if (!m.isMesh || !m.castShadow) return; const sh = new THREE.Mesh(m.geometry, shm); sh.layers.set(1); sh.castShadow = true; sh.receiveShadow = false; sh.matrixAutoUpdate = false; m.updateWorldMatrix(true, false); sh.matrix.copy(m.matrixWorld); sh.matrixWorldNeedsUpdate = true; scene.add(sh); if (SH) SH.push(sh); m.castShadow = false; });
    const addC = c => { if (c.shell) { c.gt.forEach(add); c.g.forEach(add); add(c.gR); } else add(c.group); };
    for (const c of W.cuts) addC(c);
    // zonas que se constroem quando chegas perto: as mesmas cópias de sombra (e saem quando a zona sai)
    W.onLazy = (L, on) => { if (on) { SH = L.sh = []; L.cuts.forEach(addC); SH = null; } else { for (const m of L.sh || []) scene.remove(m); L.sh = null; } };
    sun.shadow.camera.layers.enable(1); }

  // colisões: grelha espacial
  const CS = 8, grid = new Map(); let stamp = 1;
  const cell = (ix, iz) => { const k = ix * 1000 + iz; let c = grid.get(k); if (!c) grid.set(k, c = { r: [], c: [] }); return c; };
  for (const r of W.rects) { r.s = 0; for (let ix = Math.floor(r.x0 / CS); ix <= Math.floor(r.x1 / CS); ix++) for (let iz = Math.floor(r.z0 / CS); iz <= Math.floor(r.z1 / CS); iz++) cell(ix, iz).r.push(r); }
  const addCirc = c => { c.s = 0; for (let ix = Math.floor((c.x - c.r) / CS); ix <= Math.floor((c.x + c.r) / CS); ix++) for (let iz = Math.floor((c.z - c.r) / CS); iz <= Math.floor((c.z + c.r) / CS); iz++) cell(ix, iz).c.push(c); };
  W.circles.forEach(addCirc);
  const removeCirc = c => { for (let ix = Math.floor((c.x - c.r) / CS); ix <= Math.floor((c.x + c.r) / CS); ix++) for (let iz = Math.floor((c.z - c.r) / CS); iz <= Math.floor((c.z + c.r) / CS); iz++) { const q = grid.get(ix * 1000 + iz); if (q) { const j = q.c.indexOf(c); if (j >= 0) q.c.splice(j, 1); } } };
  // paredes que aparecem e desaparecem (bases): entram e saem da grelha
  const addRect = r => { r.s = 0; W.rects.push(r); for (let ix = Math.floor(r.x0 / CS); ix <= Math.floor(r.x1 / CS); ix++) for (let iz = Math.floor(r.z0 / CS); iz <= Math.floor(r.z1 / CS); iz++) cell(ix, iz).r.push(r); };
  const removeRect = r => { const i = W.rects.indexOf(r); if (i >= 0) W.rects.splice(i, 1); for (let ix = Math.floor(r.x0 / CS); ix <= Math.floor(r.x1 / CS); ix++) for (let iz = Math.floor(r.z0 / CS); iz <= Math.floor(r.z1 / CS); iz++) { const c = grid.get(ix * 1000 + iz); if (c) { const j = c.r.indexOf(r); if (j >= 0) c.r.splice(j, 1); } } };
  const near = (x0, z0, x1, z1, fr, fc) => { stamp++; for (let ix = Math.floor(x0 / CS); ix <= Math.floor(x1 / CS); ix++) for (let iz = Math.floor(z0 / CS); iz <= Math.floor(z1 / CS); iz++) { const c = grid.get(ix * 1000 + iz); if (!c) continue; for (const r of c.r) if (r.s !== stamp) { r.s = stamp; if (!r.off) fr(r); } if (fc) for (const k of c.c) if (k.s !== stamp && k.on) { k.s = stamp; fc(k); } } };
  // caminhos dos zombies (A*) e teste rápido de «dá para ir a direito»
  const nav = makeNav(near, MAP - 1);
  const segRect = (x0, z0, x1, z1, r) => { let t0 = 0, t1 = 1; const dx = x1 - x0, dz = z1 - z0; for (const [o, d, a, b] of [[x0, dx, r.x0, r.x1], [z0, dz, r.z0, r.z1]]) { if (Math.abs(d) < 1e-9) { if (o < a || o > b) return false; } else { let ta = (a - o) / d, tb = (b - o) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false; } } return true; };
  const walkLine = (x0, z0, x1, z1, lv) => { const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 0.01) return true; const nx = -dz / L * 0.28, nz = dx / L * 0.28; let ok = true;
    near(Math.min(x0, x1) - 0.5, Math.min(z0, z1) - 0.5, Math.max(x0, x1) + 0.5, Math.max(z0, z1) + 0.5, r => { if (!ok || (r.lv || 0) !== lv || r.off || r.h <= 0.4 || (r.lv ? 0 : r.yb || 0) > 1.8) return; for (let s = -1; s <= 1; s++) if (segRect(x0 + nx * s, z0 + nz * s, x1 + nx * s, z1 + nz * s, r)) { ok = false; return; } },
      c => { if (!ok || (c.lv || 0) !== lv || c.on === false || c.k !== 's') return; const t = clamp(((c.x - x0) * dx + (c.z - z0) * dz) / (L * L), 0, 1), px = x0 + dx * t - c.x, pz = z0 + dz * t - c.z; if (px * px + pz * pz < (c.r + 0.26) ** 2) ok = false; });
    return ok; };
  let navBudget = 0;
  // colisões por piso e por altura: o que é mais baixo do que os teus pés (+ um degrau) não trava
  const collide = (o, rad) => {
    const lv = o.lv || 0, hh = o.h || 0;
    for (let it = 0; it < 2; it++) near(o.x - rad, o.z - rad, o.x + rad, o.z + rad, r => {
      if ((r.lv || 0) !== lv || r.h <= hh + 0.35 || (r.lv ? 0 : r.yb || 0) > hh + 1.75) return; /* nos pisos de cima o yb é a altura do piso (não é uma verga): antes as paredes lá de cima não travavam */ // o que está acima da cabeça (a parede por cima de uma porta) não trava
      const cx = clamp(o.x, r.x0, r.x1), cz = clamp(o.z, r.z0, r.z1), dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= rad * rad) return;
      if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (rad - d) / d; o.x += dx * k; o.z += dz * k; }
      else { const l = o.x - r.x0, rr2 = r.x1 - o.x, t = o.z - r.z0, bb = r.z1 - o.z, m = Math.min(l, rr2, t, bb); if (m === l) o.x = r.x0 - rad; else if (m === rr2) o.x = r.x1 + rad; else if (m === t) o.z = r.z0 - rad; else o.z = r.z1 + rad; }
    }, c => { if ((c.lv || 0) !== lv || hh > 1.2) return; const dx = o.x - c.x, dz = o.z - c.z, d2 = dx * dx + dz * dz, R2 = rad + c.r; if (d2 < R2 * R2 && d2 > 1e-9) { const d = Math.sqrt(d2), k = (R2 - d) / d; o.x += dx * k; o.z += dz * k; } });
  };
  // raio no chão: distância até ao primeiro obstáculo dos tipos pedidos ('s' paredes, 'g' vidros/redes), no mesmo piso
  const ray = (x, z, dx, dz, maxD, ignoreAt = null, kinds = 's', lv = 0, hh = 1.2, yTop = 99) => {
    let best = maxD; const x1 = x + dx * maxD, z1 = z + dz * maxD;
    near(Math.min(x, x1), Math.min(z, z1), Math.max(x, x1), Math.max(z, z1), r => {
      if (!kinds.includes(r.k) || (r.lv || 0) !== lv || r.h < hh || (r.lv ? 0 : r.yb || 0) > yTop) return; if (ignoreAt && ignoreAt[0] >= r.x0 - 0.05 && ignoreAt[0] <= r.x1 + 0.05 && ignoreAt[1] >= r.z0 - 0.05 && ignoreAt[1] <= r.z1 + 0.05) return;
      let t0 = 0, t1 = best;
      for (const [o, d, a, b] of [[x, dx, r.x0, r.x1], [z, dz, r.z0, r.z1]]) { if (Math.abs(d) < 1e-9) { if (o < a || o > b) return; } else { let ta = (a - o) / d, tb = (b - o) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return; } }
      if (t0 < best) best = t0;
    }, c => { if (c.k !== 's' || (c.lv || 0) !== lv) return; const ox = x - c.x, oz = z - c.z, bq = ox * dx + oz * dz, cq = ox * ox + oz * oz - c.r * c.r, disc = bq * bq - cq; if (disc < 0) return; const t = -bq - Math.sqrt(disc); if (t > 0 && t < best) best = t; });
    return best;
  };
  const los = (ax, az, bx, bz, ign, kinds = 's', lv = 0, hh = 1.2) => { const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz); if (d < 0.01) return true; return ray(ax, az, dx / d, dz / d, d, ign, kinds, lv, hh) >= d - 0.05; };
  // altura do que está construído à volta (telhados, torres): o helicóptero passa por cima
  const tallAt = (x, z, m = 4) => { let h = 0; near(x - m, z - m, x + m, z + m, r => { if (x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m) h = Math.max(h, (r.h || 0) + (r.lv || 0) * 3.7); }, () => {}); return h; };
  const solidAt = (x, z, m = 0.4, lv = 0) => { let hit = false; near(x - m, z - m, x + m, z + m, r => { if ((r.lv || 0) === lv && x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m) hit = true; }, c => { if ((c.lv || 0) === lv && Math.hypot(x - c.x, z - c.z) < c.r + m) hit = true; }); return hit; };
  for (const r of W.rects) { const th = Math.min(r.x1 - r.x0, r.z1 - r.z0); r.top = !r.stairRail && !r.door && th >= 0.45 && r.h <= 2.9 && r.k !== 'g'; r.climb = !r.door && r.h > 0.35 && r.h <= 2.9; } // o corrimão também se salta
  // altura do que está por baixo dos pés (tejadilhos, caixas, muros largos)
  const support = (o) => { let sup = 0; const lv = o.lv || 0; near(o.x - 0.05, o.z - 0.05, o.x + 0.05, o.z + 0.05, r => { if (r.top && (r.lv || 0) === lv && r.h <= (o.h || 0) + 0.25 && o.x > r.x0 && o.x < r.x1 && o.z > r.z0 && o.z < r.z1 && r.h > sup) sup = r.h; }); return sup; };
  // escadas: em que piso estás e a que altura
  const stairUpdate = o => {
    const lv = o.lv || 0; let s = null;
    for (const st of W.stairs) if ((lv === st.lv || lv === st.lv + 1) && o.x > st.x0 && o.x < st.x1 && o.z > st.z0 && o.z < st.z1) { s = st; break; }
    if (s) { const a = s.ax ? o.x : o.z, len = s.ax ? s.x1 - s.x0 : s.z1 - s.z0, t = clamp((a - s.bot) * s.dir / len, 0, 1); o.st = s; o.stT = t; o.lv = t > 0.5 ? s.lv + 1 : s.lv; o.fhb = s.fh; o.bld = s.b; o.base = (s.lv + t) * s.fh; }
    else { o.st = null; o.base = o.bld && o.bld.roofY && (o.lv || 0) >= o.bld.n ? o.bld.roofY - 0.05 : (o.lv || 0) * (o.fhb || 3.3); } // no telhado: a altura do telhado
  };
  const inShell = (C, x, z) => x > C.ix0 && x < C.ix1 && z > C.iz0 && z < C.iz1;
  // telhado plano onde cabe um quadrado de meia-largura m (o helicóptero aterra lá e quem sai fica em cima): devolve o edifício
  const roofAt = (x, z, m = 0) => { for (const C of W.cuts) if (C.roofY && x - m > C.ix0 && x + m < C.ix1 && z - m > C.iz0 && z + m < C.iz1) return C; return null; };
  const onRoof = p => !!(p && p.bld && p.bld.roofY && (p.lv || 0) >= p.bld.n);
  // mesmo piso (ou a passar um pelo outro na escada)
  const sameLevel = (a, b) => (a.lv || 0) === (b.lv || 0) ? Math.abs((a.base || 0) - (b.base || 0)) < 1.7 || !(a.st || b.st) : !!(a.st || b.st) && Math.abs((a.base || 0) - (b.base || 0)) < 1.7;
  // escadas: quem está junto à abertura vê e é visto por quem está em baixo (ou em cima) junto às escadas — sempre nos dois sentidos
  const stairVis = (a, b) => {
    const la = a.lv || 0, lb = b.lv || 0; if (Math.abs(la - lb) !== 1) return false;
    const lo = la < lb ? a : b, hi = la < lb ? b : a;
    for (const s of W.stairs) {
      if (s.lv !== (lo.lv || 0) || !inShell(s.b, lo.x, lo.z) || !inShell(s.b, hi.x, hi.z)) continue;
      const dd = o => Math.hypot(o.x - clamp(o.x, s.x0, s.x1), o.z - clamp(o.z, s.z0, s.z1));
      const dl = dd(lo), dh = dd(hi); if (dl > 7 || dh > 7) continue;
      if (!(lo.st === s || hi.st === s || dl < 1.6 || dh < 1.6)) continue;
      const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
      if (los(lo.x, lo.z, cx, cz, null, 's', s.lv) && los(hi.x, hi.z, cx, cz, null, 's', s.lv + 1)) return true;
    }
    return false;
  };
  const canSee = (a, b) => (sameLevel(a, b) && los(a.x, a.z, b.x, b.z, null, 's', Math.min(a.lv || 0, b.lv || 0))) || stairVis(a, b);
  const groundY = (x, z, lv = 0) => { if (lv) return 0.05; let y = 0.03; for (const s of W.steps) if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1 && s.y > y) y = s.y; return y; };

  const G0 = {};
  // ---------- vegetação e recursos (instanciados)
  const TLOD = []; // árvores: cada bloco de 50 m tem também uma versão simples (mesmas posições), usada ao longe na 1.ª pessoa
  const iMesh = (geo, mat, list, matOf, shadow = true, CH = 50, tint = null, low = null) => { const groups = new Map(); for (const o of list) { const k = Math.floor(o.x / CH) + ',' + Math.floor(o.z / CH); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o); } const out = []; for (const l of groups.values()) { const m = new THREE.InstancedMesh(geo, mat, l.length); l.forEach((o, i) => { o.m0 = matOf(o); m.setMatrixAt(i, o.m0); o.mesh = m; o.idx = i; if (tint) m.setColorAt(i, tint(o, i)); }); m.castShadow = shadow; m.receiveShadow = true; m.computeBoundingSphere(); if (geo !== cedar && geo !== broad) m.renderOrder = 3; scene.add(m); out.push(m);
    if (low) { const L = new THREE.InstancedMesh(low, mat, l.length); L.instanceMatrix = m.instanceMatrix; if (m.instanceColor) L.instanceColor = m.instanceColor; L.castShadow = shadow; L.receiveShadow = true; L.computeBoundingSphere(); L.visible = false; scene.add(L); let cx = 0, cz = 0; for (const o of l) { cx += o.x; cz += o.z; } TLOD.push({ hi: m, lo: L, x: cx / l.length, z: cz / l.length }); out.push(L); } } return out; };
  const geo1 = fn => { const b = new Builder(0); fn(b); const out = []; for (const k of [...b.buckets.keys()]) out.push(b.merged(k)); return out.length === 1 ? out[0] : mergeAll(out); };
  const mergeAll = gs => mergeGeometries(gs, false);
  const cedar = geo1(b => { b.cyl(0.14, 0.22, 3.2, 9, 0, 1.6, 0, 0x5a4230, { mat: 'vf' }); for (const [r, h, y, c] of [[1.75, 2.6, 3.0, 0x2f4a2a], [1.45, 2.3, 3.8, 0x324e2c], [1.2, 2.2, 4.6, 0x34522e], [0.95, 2.0, 5.5, 0x3a5a32], [0.55, 1.5, 6.6, 0x426436]]) b.add(new THREE.ConeGeometry(r, h, 11), c, 'vf', mat4(0, y, 0, Math.random())); });
  const broad = geo1(b => { b.cyl(0.13, 0.2, 2.6, 7, 0, 1.3, 0, 0x5a4636, { mat: 'vf' }); b.cyl(0.07, 0.09, 1.2, 5, 0.4, 2.6, 0.1, 0x5a4636, { mat: 'vf', rz: -0.6 }); for (const [x, y, z, r, c] of [[0, 3.4, 0, 1.55, 0x4a6a32], [0.9, 3.9, 0.3, 1.15, 0x56763a], [-0.8, 3.8, -0.4, 1.1, 0x44622e], [0.1, 4.5, -0.2, 1.0, 0x5c7c40], [-0.3, 3.2, 0.9, 0.95, 0x50703a], [0.6, 3.1, -0.8, 0.9, 0x486834]]) b.ico(r, x, y, z, c, { mat: 'vf', det: 1 }); });
  // as mesmas árvores com menos faces (para longe): copas em icosaedros simples e cones de 6 lados
  const cedarLo = geo1(b => { b.cyl(0.14, 0.22, 3.2, 5, 0, 1.6, 0, 0x5a4230, { mat: 'vf' }); for (const [r, h, y, c] of [[1.75, 2.6, 3.0, 0x2f4a2a], [1.3, 2.4, 4.2, 0x34522e], [0.85, 2.0, 5.6, 0x3a5a32], [0.5, 1.4, 6.6, 0x426436]]) b.add(new THREE.ConeGeometry(r, h, 6), c, 'vf', mat4(0, y, 0, 0.3)); });
  const broadLo = geo1(b => { b.cyl(0.13, 0.2, 2.6, 5, 0, 1.3, 0, 0x5a4636, { mat: 'vf' }); for (const [x, y, z, r, c] of [[0, 3.4, 0, 1.55, 0x4a6a32], [0.9, 3.9, 0.3, 1.15, 0x56763a], [-0.8, 3.8, -0.4, 1.1, 0x44622e], [0.1, 4.5, -0.2, 1.0, 0x5c7c40], [-0.3, 3.2, 0.9, 0.95, 0x50703a], [0.6, 3.1, -0.8, 0.9, 0x486834]]) b.ico(r, x, y, z, c, { mat: 'vf', det: 0 }); });
  const tm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const nodes = [];
  const treeList = [[], []];
  for (const t of W.trees) { treeList[t.v].push(t); t.kind = 'tree'; t.r = 0.32 * t.s; t.hp = t.max = Math.round(150 * t.s); t.alive = true; nodes.push(t); t.col = { x: t.x, z: t.z, r: t.r, k: 's', on: true, node: t }; addCirc(t.col); }
  treeList.forEach((l, v) => iMesh(v ? broad : cedar, tm, l, t => mat4(t.x, 0, t.z, t.ry, 0, 0, t.s), true, 50, null, v ? broadLo : cedarLo));
  // ginkgos da rua (amarelos, de novembro)
  { const l = W.streetTrees.map(([x, z]) => ({ x, z })); const c = new THREE.Color(); iMesh(broad, tm, l, t => mat4(t.x, 0.14, t.z, Math.random() * 6, 0, 0, 0.72), true, 50, (t, i) => c.setHex(i % 3 ? 0xffd46a : 0xf2c04a), broadLo); l.forEach(t => { t.col = { x: t.x, z: t.z, r: 0.22, k: 's', on: true }; addCirc(t.col); }); }
  const rockGeo = { stone: geo1(b => { b.ico(0.95, 0, 0.35, 0, 0x8f8d86, { mat: 'vf', det: 1, sy: 0.7 }); b.ico(0.6, 0.7, 0.2, 0.3, 0x85837c, { mat: 'vf', det: 1, sy: 0.7 }); b.ico(0.5, -0.6, 0.15, -0.4, 0x9a988f, { mat: 'vf', det: 0 }); }),
    sulfur: geo1(b => { b.ico(0.9, 0, 0.3, 0, 0x8a8470, { mat: 'vf', det: 1, sy: 0.7 }); for (const [x, y, z, r] of [[0.3, 0.75, 0.2, 0.34], [-0.35, 0.6, 0.35, 0.28], [0.55, 0.4, -0.35, 0.3], [-0.2, 0.7, -0.4, 0.25]]) b.ico(r, x, y, z, 0xe0c43a, { mat: 'vf', det: 0 }); }),
    metal: geo1(b => { b.ico(0.92, 0, 0.32, 0, 0x6e625a, { mat: 'vf', det: 1, sy: 0.72 }); for (const [x, y, z, r] of [[0.35, 0.7, 0.2, 0.3], [-0.4, 0.55, 0.3, 0.26], [0.3, 0.45, -0.45, 0.28]]) b.ico(r, x, y, z, 0x9a5a32, { mat: 'vf', det: 0 }); b.ico(0.22, -0.1, 0.8, -0.2, 0xa8acb0, { mat: 'vf' }); }) };
  const rockM = {};
  for (const kind of ['stone', 'sulfur', 'metal']) { const l = W.rocks.filter(r => r.kind === kind); l.forEach(r => { r.r = 0.95 * r.s; r.hp = r.max = kind === 'stone' ? 220 : 130; r.alive = true; nodes.push(r); r.col = { x: r.x, z: r.z, r: r.r * 0.85, k: 's', on: true, node: r }; addCirc(r.col); }); iMesh(rockGeo[kind], tm, l, r => mat4(r.x, 0, r.z, r.ry, 0, 0, r.s)); }
  // tufos de erva
  const grassGeo = new THREE.BufferGeometry(), grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide });
  { const g = grassGeo, pos = []; for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + Math.random() * 0.5, r = 0.08 + Math.random() * 0.12, h = 0.25 + Math.random() * 0.25, x = Math.cos(a) * r, z = Math.sin(a) * r, tx = x * 2.2, tz = z * 2.2; pos.push(x - 0.03, 0, z, x + 0.03, 0, z, tx, h, tz); } g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const l = []; for (let i = 0; i < 40000 && l.length < (TOUCH ? 13000 : 24000); i++) { const x = (Math.random() * 2 - 1) * (CORE - 1), z = (Math.random() * 2 - 1) * (CORE - 1); if (x > CITY.x0 - 1 && x < CITY.x1 + 1 && z > CITY.z0 - 1 && z < CITY.z1 + 1) continue; if (Math.abs(z) < 4.6) continue; if (Math.abs(x) < 2.8 && Math.abs(z) > CITY.z1) continue; if (W.paved(x, z)) continue; l.push({ x, z, s: 0.7 + Math.random() * 0.9, ry: Math.random() * 6 }); }
    const c = new THREE.Color(); iMesh(g, grassMat, l, o => mat4(o.x, 0, o.z, o.ry, 0, 0, o.s), false, 40, () => c.setHSL(0.22 + Math.random() * 0.05, 0.45, 0.24 + Math.random() * 0.12)); }

  // pedra solta (apanha-se) e planta de fibra (algodão bravo: dá tecido)
  const seixoGeo = geo1(b => { b.ico(0.13, 0, 0.07, 0, 0x8a877e, { mat: 'vf', det: 1, sy: 0.6 }); b.ico(0.07, 0.15, 0.04, 0.06, 0x7c7a72, { mat: 'vf', det: 0, sy: 0.6 }); b.ico(0.05, -0.12, 0.03, 0.09, 0x95928a, { mat: 'vf', det: 0, sy: 0.7 }); });
  const fibraGeo = geo1(b => { for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28, h = 0.55 + (i % 3) * 0.12; b.cyl(0.012, 0.018, h, 4, Math.sin(a) * 0.08, h / 2, Math.cos(a) * 0.08, 0x5a6a32, { mat: 'vf', rz: Math.sin(a) * 0.25, rx: Math.cos(a) * 0.25 }); b.ico(0.055, Math.sin(a) * 0.2, h + 0.02, Math.cos(a) * 0.2, 0xf2efe6, { mat: 'vf', det: 1 }); } for (let i = 0; i < 5; i++) b.ico(0.09, Math.sin(i * 1.3) * 0.14, 0.12, Math.cos(i * 1.3) * 0.14, 0x4a6230, { mat: 'vf', det: 0, sy: 0.5 }); });
  // mundo de fora (8 km): setores carregados à tua volta
  const bushGeo = geo1(b => { b.ico(0.62, 0, 0.32, 0, 0x3f5a2a, { mat: 'vf' }); b.ico(0.46, 0.42, 0.26, 0.2, 0x4a6632, { mat: 'vf' }); b.ico(0.4, -0.36, 0.22, -0.26, 0x36522a, { mat: 'vf' }); });
  const _gc = new THREE.Color();
  await LP(62, 'a preparar as zonas');
  const SECTORS = makeSectors({ scene, W, nodes, addCirc, removeCirc, near, CORE, MAP, mats: { tree: tm, grass: grassMat, grassTint: () => _gc.setHSL(0.22 + Math.random() * 0.05, 0.45, 0.24 + Math.random() * 0.12) }, geos: { cedar, broad, rock: rockGeo, bush: bushGeo, grass: grassGeo, seixo: seixoGeo, fibra: fibraGeo },
    iMesh: (geo, mat, list, matOf, shadow, CH) => iMesh(geo, mat, list, matOf, shadow, CH, geo === grassGeo ? () => _gc.setHSL(0.22 + Math.random() * 0.05, 0.45, 0.24 + Math.random() * 0.12) : null, geo === cedar ? cedarLo : geo === broad ? broadLo : null) }); // árvores da floresta também com a versão leve ao longe
  // pedras soltas e plantas de fibra também no centro do mapa (mesma posição em todos os aparelhos)
  { let sd = 977; const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647, picks = { seixo: [], fibra: [] };
    for (let i = 0; i < 2600 && picks.seixo.length + picks.fibra.length < 420; i++) { const x = (R() * 2 - 1) * (CORE - 6), z = (R() * 2 - 1) * (CORE - 6), kind = R() < 0.5 ? 'seixo' : 'fibra'; if (inCity(x, z) || W.paved(x, z) || W.wet(x, z, 0.5) || solidAt(x, z, 0.8)) continue; picks[kind].push({ x, z, kind, s: 0.85 + R() * 0.4, ry: R() * 6.28 }); }
    for (const kind in picks) { const l = picks[kind]; for (const r of l) { r.r = 0.25; r.hp = r.max = 1; r.alive = true; r.pick = 1; r.col = { on: true }; nodes.push(r); } iMesh(kind === 'seixo' ? seixoGeo : fibraGeo, tm, l, r => mat4(r.x, 0, r.z, r.ry, 0, 0, r.s), false); } }
  // mundo partilhado: caixas, portas e recursos têm a mesma chave em todos os aparelhos (a ordem em que o mundo é construído)
  W.containers.forEach((c, i) => c.wid = i); W.doors.forEach((D, i) => D.wid = i); nodes.forEach((n, i) => n.key = 'c' + i);
  const WV = (() => { let h = 0; const t = W.zones.map(z => z.name + Math.round(z.x) + ',' + Math.round(z.z)).join('|') + W.containers.map(c => c.table || '').join(''); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return [W.containers.length, W.doors.length, nodes.length, (h >>> 0).toString(36)].join('.'); })();
  // contorno das portas e janelas que estão escondidas atrás de paredes e telhados (raio-x)
  { const DOOR = new THREE.Color(0xf2a33a), WIN = new THREE.Color(0x8fc3e8), CHK = 64, byC = new Map(); // em blocos de 64 m: só se desenham os que a câmara vê (antes eram 113 mil triângulos do mapa inteiro em cada imagem)
    for (const o of W.openings) { if (o.y0 > 2.5) continue; const k = Math.floor(o.x / CHK) + ',' + Math.floor(o.z / CHK); if (!byC.has(k)) byC.set(k, []); byC.get(k).push(o); }
    const xm = new THREE.MeshBasicMaterial({ vertexColors: true, depthFunc: THREE.GreaterDepth, depthWrite: false, transparent: true, opacity: 0.5, fog: true }), grp = new THREE.Group();
    for (const L of byC.values()) { const b = new Builder(0);
      for (const o of L) { const c = o.k === 'd' ? DOOR : WIN, th = 0.06, w = o.w, hgt = o.y1 - o.y0, cy = (o.y0 + o.y1) / 2;
        b.push(o.x, 0, o.z, o.horiz ? 0 : Math.PI / 2);
        b.box(w, th, th, 0, o.y1, 0, c); b.box(th, hgt, th, -w / 2, cy, 0, c); b.box(th, hgt, th, w / 2, cy, 0, c); if (o.k !== 'd') b.box(w, th, th, 0, o.y0, 0, c); else b.box(w * 0.5, th, th, 0, 0.06, 0, c);
        b.pop(); }
      const g = b.merged('v'); if (g) { g.computeBoundingSphere(); const m = new THREE.Mesh(g, xm); m.renderOrder = 4; grp.add(m); } }
    scene.add(grp); G0.xray = grp; }
  // ---------- portas: folhas de madeira que rodam na dobradiça; fechadas travam pessoas, zombies e balas
  const DN = W.doors.reduce((n, D) => n + D.leaves.length, 0);
  const leafGeo = geo1(b => { b.box(1, 2.275, 0.05, 0.5, 1.1475, 0, 0xffffff); for (const zz of [0.028, -0.028]) { b.box(0.78, 0.84, 0.008, 0.5, 1.68, zz, 0xd9d4cc); b.box(0.78, 0.9, 0.008, 0.5, 0.64, zz, 0xd9d4cc); } });
  const knobGeo = geo1(b => { for (const zz of [0.05, -0.05]) { b.box(0.12, 0.025, 0.025, 0.86, 1.02, zz, 0xc9c4b8); b.box(0.05, 0.07, 0.012, 0.9, 1.0, zz * 0.6, 0xb8b2a6); } });
  // em blocos de 64 m (antes eram as ~720 portas do mapa inteiro em cada imagem, mais as sombras): só se desenham os blocos que se veem
  const DCH = 64, dBlk = new Map();
  for (const D of W.doors) for (const L of D.leaves) { const k = Math.floor(L.hx / DCH) + ',' + Math.floor(L.hz / DCH); if (!dBlk.has(k)) dBlk.set(k, []); dBlk.get(k).push([D, L]); }
  for (const [k, list] of dBlk) { const [a, b] = k.split(',').map(Number), lm = new THREE.InstancedMesh(leafGeo, mats.v, list.length), km = new THREE.InstancedMesh(knobGeo, mats.m, list.length), sph = new THREE.Sphere(new THREE.Vector3((a + 0.5) * DCH, 8, (b + 0.5) * DCH), DCH * 0.72 + 14);
    for (const m of [lm, km]) { m.castShadow = true; m.receiveShadow = true; m.renderOrder = 3; m.boundingSphere = sph; scene.add(m); }
    const c = new THREE.Color(); list.forEach(([D, L], i) => { L.i = i; L.lm = lm; L.km = km; lm.setColorAt(i, c.setHex(D.col)); }); if (lm.instanceColor) lm.instanceColor.needsUpdate = true; }
  const _dm = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _dv = new THREE.Vector3(), _ds = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const easeD = t => t * t * (3 - 2 * t);
  const doorMats = () => {
    for (const D of W.doors) {
      if (D.base) continue;
      const C = D.C, L = D.lv, show = L === 0 || !C.g[L] || C.g[L].visible, cut = D.cut && C.gt[L] && !C.gt[L].visible && !G.fp;
      const key = (show ? 1 : 0) + (cut ? 2 : 0) + D.t * 4; if (D.key === key) continue; D.key = key;
      for (const lf of D.leaves) { const a = lf.tc + (lf.to - lf.tc) * easeD(D.t); _dq.setFromAxisAngle(_up, a); _dv.set(lf.hx, (C.fh || 3.7) * L, lf.hz); _ds.set(show ? lf.w : 0, show ? (cut ? 0.5 : 1) : 0, show ? 1 : 0); _dm.compose(_dv, _dq, _ds); lf.lm.setMatrixAt(lf.i, _dm); lf.km.setMatrixAt(lf.i, _dm); lf.lm.instanceMatrix.needsUpdate = true; lf.km.instanceMatrix.needsUpdate = true; }
    }
  };
  const doorBlocked = D => { const r = D.rc, m = 0.34, inR = o => (o.lv || 0) === D.lv && o.x > r.x0 - m && o.x < r.x1 + m && o.z > r.z0 - m && o.z < r.z1 + m; if (G.p && G.p.alive && inR(G.p)) return true; for (const z of G.zs) if (z.state !== 'dead' && inR(z)) return true; if (G.net && G.net.on) for (const o of G.net.R.values()) if (o.s1 && o.s1[10] && inR({ x: o.x, z: o.z, lv: o.s1[4] })) return true; return false; };
  const setDoor = (D, open, auto = false, remote = false) => { if (D.target === open) return true; if (D.lock && D.lock.hp > 0) return false; if (D.base && G.net && G.net.world && !remote) { G.net.raw({ t: 'bdo', k: D.base.k, o: open ? 1 : 0 }); return true; } if (!open && doorBlocked(D)) { if (remote && G.net.on && D.wid != null) G.net.door(D.wid, 1); return false; } D.target = open; D.auto = auto && open === 1; D.autoT = 0; if (!remote && G.net && G.net.on && D.wid != null && !D.base) G.net.door(D.wid, open); audio.play(open ? 'porta' : 'portaF', G.p ? clamp(1 - Math.hypot(D.x - G.p.x, D.z - G.p.z) / 30, 0, 1) : 0.5); if (G.p) noise(D.x, D.z, 4); return true; };
  const updDoors = dt => {
    for (const D of W.doors) {
      if (D.t !== D.target) D.t = D.target > D.t ? Math.min(D.target, D.t + dt / 0.55) : Math.max(D.target, D.t - dt / 0.5);
      D.rc.off = D.t > 0.35; for (const r of D.ro) r.off = D.t < 0.8;
      // a porta do paiol volta a ficar trancada uma hora depois de rebentada
      if (D.lock && D.lock.hp <= 0 && Date.now() - (D.lock.broke || 0) > 3600e3 && !doorBlocked(D)) { D.lock.hp = D.lock.max; D.target = 0; }
    }
    // portas automáticas: abrem quando vais contra elas e fecham-se atrás de ti
    const p = G.p; if (!p || !p.alive || !G.cfg.autoDoor) return;
    const sp = Math.hypot(p.vx, p.vz);
    for (const D of W.doors) {
      if (D.lv !== p.lv) continue; if (D.base && G.net.world && D.base.u !== G.net.uid) continue; const dx = D.x - p.x, dz = D.z - p.z, d = Math.hypot(dx, dz); if (d > 6) continue;
      if (D.target === 0 && d < 1.3 && sp > 0.6 && !(D.lock && D.lock.hp > 0) && (p.vx * dx + p.vz * dz) / (d * sp) > 0.55) setDoor(D, 1, true);
      else if (D.auto && D.target === 1 && d > 2.3) { D.autoT += dt; if (D.autoT > 0.6) setDoor(D, 0); } else if (D.auto) D.autoT = 0;
    }
  };
  const doorAt = p => { let best = null, bd = 1.7; for (const D of W.doors) { if (D.lv !== (p.lv || 0)) continue; const d = Math.hypot(D.x - p.x, D.z - p.z); if (d < bd) { best = D; bd = d; } } return best ? { D: best, d: bd } : null; };
  // fumo do helicóptero
  const smokeTex = ctex(64, 64, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(60,58,56,.8)'); g.addColorStop(1, 'rgba(60,58,56,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }, false);
  const smoke = []; for (let i = 0; i < 10; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.6 })); s.userData.t = i / 10; scene.add(s); smoke.push(s); }

  // ---------- efeitos: partículas, traçantes, linha de mira
  const PN = 200, parts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: 0xffffff }), PN); parts.frustumCulled = false; parts.setColorAt(0, new THREE.Color(1, 1, 1)); parts.count = 0; scene.add(parts);
  const pl = []; const burst = (x, y, z, n, col, sp = 2.5, life = 0.6) => { for (let i = 0; i < n && pl.length < PN; i++) pl.push({ x, y, z, vx: (Math.random() - 0.5) * sp, vy: Math.random() * sp * 0.9, vz: (Math.random() - 0.5) * sp, t: life * (0.6 + Math.random() * 0.6), c: new THREE.Color(col).multiplyScalar(0.8 + Math.random() * 0.4) }); };
  const TRN = 64, trGeo = new THREE.BufferGeometry(); trGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRN * 6), 3)); trGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRN * 6), 3));
  const tracers = new THREE.LineSegments(trGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); tracers.frustumCulled = false; scene.add(tracers);
  const trl = []; const tracer = (ax, ay, az, bx, by, bz, dim) => { trl.push({ a: [ax, ay, az], b: [bx, by, bz], t: 0.07, k: dim ? 0.45 : 1 }); if (trl.length > TRN) trl.shift(); };
  const aimTex = ctex(16, 128, (x, w, h) => { const g = x.createLinearGradient(0, h, 0, 0); g.addColorStop(0, 'rgba(255,210,140,.7)'); g.addColorStop(1, 'rgba(255,210,140,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }, false);
  const aimLine = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 1).translate(0, 0.5, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: aimTex, transparent: true, depthWrite: false })); aimLine.visible = false; aimLine.renderOrder = 3; scene.add(aimLine);

  // ---------- câmara: todos veem a mesma área de mundo (os mesmos m²) em qualquer ecrã, ao alto ou deitado; ver longe não depende do tamanho do ecrã
  const AREA = 800, CAP = 50, DIST = 26; // m² visíveis no ecrã; CAP = alcance da máscara de vista (para lá disso, tudo à vista)
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, 260);
  const YAW = THREE.MathUtils.degToRad(20), TILT = THREE.MathUtils.degToRad(57);
  const camT = new THREE.Vector3(0, 0, 0), camOff = (k = 1) => new THREE.Vector3(Math.sin(YAW) * Math.cos(TILT), Math.sin(TILT), Math.cos(YAW) * Math.cos(TILT)).multiplyScalar(DIST * k);
  const FWD = new THREE.Vector2(-Math.sin(YAW), -Math.cos(YAW)), RGT = new THREE.Vector2(Math.cos(YAW), -Math.sin(YAW));
  const PROJ = { f: 1, e8: 0, e9: 0 };
  const fitCam = () => {
    const w = innerWidth, h = innerHeight, S = G.ui ? G.ui.safe() : { x0: 0, y0: 0, x1: w, y1: h };
    const D = camOff().sub(new THREE.Vector3(0, 1, 0)).length(), pxm = Math.sqrt(w * h / AREA);
    const f = 2 * D * pxm / h, nx = ((S.x0 + S.x1) / 2) / w * 2 - 1, ny = 1 - ((S.y0 + S.y1) / 2) / h * 2;
    PROJ.f = f; PROJ.e8 = -nx; PROJ.e9 = -ny; PROJ.dirty = true; G.pxm = pxm; // tu ficas no meio da zona livre do ecrã
  };
  const topProj = () => { cam.near = 1; cam.far = 260; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); const e = cam.projectionMatrix.elements; e[0] = PROJ.f / cam.aspect; e[5] = PROJ.f; e[8] = PROJ.e8; e[9] = PROJ.e9; cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert(); PROJ.dirty = false; PROJ.mode = 'top'; };
  const resize = () => { renderer.setSize(innerWidth, innerHeight, false); fitCam(); G.ui && G.ui.resize(); };
  addEventListener('resize', resize);
  const vc = new THREE.Vector3(); // onde estás (centro da visão)
  for (const C of W.cuts) if (C.shell) C.ops = W.openings.filter(o => o.y0 < 2 && o.x >= C.x0 - 0.3 && o.x <= C.x1 + 0.3 && o.z >= C.z0 - 0.3 && o.z <= C.z1 + 0.3);
  const peekAt = C => { const p = G.p; if (!C.ops || !C.ops.length) return false; if (p.x < C.x0 - 7 || p.x > C.x1 + 7 || p.z < C.z0 - 7 || p.z > C.z1 + 7) return false; for (const o of C.ops) { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < 6 && sees(p.x, p.z, o.x, o.z, 0, null)) return true; } return false; };

  // ---------- linha de vista: paredes altas e portas fechadas tapam; janelas e portas abertas deixam ver.
  // O que não vês fica mais escuro e os zombies e sacos lá não aparecem. De dentro de casa só vês para fora pelas janelas e portas, e de fora só vês para dentro por elas.
  const VN = 512, VS = 2 * CAP; // máscara de VN×VN píxeis a cobrir VS metros à tua volta (sem limite de distância: fora dela vê-se tudo)
  // a máscara desenha-se na placa gráfica, em cada imagem, a partir de onde estás agora (antes era um desenho 2D 30 vezes por segundo: as sombras andavam aos saltos)
  const visRT = new THREE.WebGLRenderTarget(VN, VN, { samples: 4, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }), visTex = visRT.texture;
  const VMAXV = 9000, vPos = new Float32Array(VMAXV * 3), vGeo = new THREE.BufferGeometry(); vGeo.setAttribute('position', new THREE.BufferAttribute(vPos, 3).setUsage(THREE.DynamicDrawUsage)); vGeo.setDrawRange(0, 0);
  const vMesh = new THREE.Mesh(vGeo, new THREE.ShaderMaterial({ vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }', fragmentShader: 'void main() { gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 ); }', depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); vMesh.frustumCulled = false;
  const vScene = new THREE.Scene(); vScene.add(vMesh); const vCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), _vcc = new THREE.Color();
  const VU = { uVis: { value: visTex }, uVisO: { value: new THREE.Vector2() }, uVisS: { value: VS }, uVisK: { value: 1 } };
  const blocksSight = (r, lv, C) => !r.off && !r.edge && ((r.k === 's' && r.h >= 2.4) || r.door) && ((r.lv || 0) === lv || (lv > 0 && (r.lv || 0) === 0 && C && !(r.x0 >= C.x0 - 0.3 && r.x1 <= C.x1 + 0.3 && r.z0 >= C.z0 - 0.3 && r.z1 <= C.z1 + 0.3)));
  const VIS = { x: 1e9, z: 1e9, lv: -1, t: 0, key: '' };
  const visDirty = () => { VIS.x = 1e9; VIS.key = ''; VIS.t = 0; };
  const drawVis = (px, pz, lv, C) => { const t0 = performance.now();
    const ox = px - VS / 2, oz = pz - VS / 2; let n = 0; // coordenadas do recorte: -1..1 (x do mundo → u, z → v)
    const put = (x, z) => { vPos[n * 3] = (x - ox) / VS * 2 - 1; vPos[n * 3 + 1] = (z - oz) / VS * 2 - 1; vPos[n * 3 + 2] = 0; n++; };
    const ext = (x, z) => { const dx = x - px, dz = z - pz, l = Math.hypot(dx, dz) || 1e-3, s = (VS * 1.5) / l; return [px + dx * s, pz + dz * s]; };
    const edge = (ax, az, bx, bz) => { if (n + 6 > VMAXV) return; const B2 = ext(bx, bz), A2 = ext(ax, az); put(ax, az); put(bx, bz); put(B2[0], B2[1]); put(ax, az); put(B2[0], B2[1]); put(A2[0], A2[1]); };
    near(px - CAP, pz - CAP, px + CAP, pz + CAP, r => {
      if (!blocksSight(r, lv, C)) return; if (px > r.x0 && px < r.x1 && pz > r.z0 && pz < r.z1) return;
      // a sombra começa nas faces de trás, para a parede em si continuar à vista
      if (px > r.x0) edge(r.x0, r.z0, r.x0, r.z1); if (px < r.x1) edge(r.x1, r.z0, r.x1, r.z1);
      if (pz > r.z0) edge(r.x0, r.z0, r.x1, r.z0); if (pz < r.z1) edge(r.x0, r.z1, r.x1, r.z1);
    });
    const at = vGeo.attributes.position; at.clearUpdateRanges(); at.addUpdateRange(0, n * 3); at.needsUpdate = true; vGeo.setDrawRange(0, n);
    const prt = renderer.getRenderTarget(), ca = renderer.getClearAlpha(); renderer.getClearColor(_vcc); const se = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(visRT); renderer.setClearColor(0xffffff, 1); renderer.clear(true, false, false); renderer.render(vScene, vCam);
    renderer.setRenderTarget(prt); renderer.setClearColor(_vcc, ca); renderer.shadowMap.autoUpdate = se;
    VU.uVisO.value.set(px, pz); VIS.ms = (VIS.ms || 0) * 0.9 + (performance.now() - t0) * 0.1; VIS.n = (VIS.n || 0) + 1;
  };
  // linha de vista entre dois pontos (mesmas regras da máscara)
  const sees = (ax, az, bx, bz, lv, C) => { const dx = bx - ax, dz = bz - az; let ok = true; near(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), r => { if (!ok || !blocksSight(r, lv, C)) return; let t0 = 0, t1 = 1; for (const [o, d, lo, hi] of [[ax, dx, r.x0, r.x1], [az, dz, r.z0, r.z1]]) { if (Math.abs(d) < 1e-9) { if (o <= lo || o >= hi) return; } else { let ta = (lo - o) / d, tb = (hi - o) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 >= t1) return; } } if (t0 < 0.999 && t1 > 0.001) ok = false; }); return ok; };
  // escurecer o que não vês: injetado nos materiais do mundo (fica no próprio desenho, sem custo extra)
  const visify = m => {
    if (!m || m.userData.vis || m.depthFunc === THREE.GreaterDepth || !(m.isMeshStandardMaterial || m.isMeshBasicMaterial)) return; m.userData.vis = true;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); Object.assign(sh.uniforms, VU);
      sh.vertexShader = 'varying vec3 vVisW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vec4 vwp = vec4( transformed, 1.0 );\n#ifdef USE_INSTANCING\n vwp = instanceMatrix * vwp;\n#endif\n vVisW = ( modelMatrix * vwp ).xyz;');
      sh.fragmentShader = 'uniform sampler2D uVis; uniform vec2 uVisO; uniform float uVisS; uniform float uVisK; varying vec3 vVisW;\nfloat visS( vec2 u ) { float o = 1.1 / 512.0; return ( texture2D( uVis, u ).r * 2.0 + texture2D( uVis, u + vec2( o, 0.0 ) ).r + texture2D( uVis, u - vec2( o, 0.0 ) ).r + texture2D( uVis, u + vec2( 0.0, o ) ).r + texture2D( uVis, u - vec2( 0.0, o ) ).r ) / 6.0; }\n' + sh.fragmentShader.replace('#include <tonemapping_fragment>', ' { vec2 vuv = ( vVisW.xz - uVisO ) / uVisS + 0.5; float vv = ( vuv.x < 0.0 || vuv.y < 0.0 || vuv.x > 1.0 || vuv.y > 1.0 ) ? 1.0 : visS( vuv ); vec3 vc0 = gl_FragColor.rgb; float vl = dot( vc0, vec3( 0.299, 0.587, 0.114 ) ); gl_FragColor.rgb = mix( vec3( vl ) * uVisK * vec3( 0.9, 0.96, 1.1 ), vc0, vv ); }\n#include <tonemapping_fragment>'); };
    const key = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => ''; m.customProgramCacheKey = () => key() + '|vis'; m.needsUpdate = true;
  };
  const visifyScene = () => scene.traverse(o => { if (!o.isMesh || o.userData.sil || o === aimLine) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(visify); });

  // ---------- jogador
  // aparência do jogador (do perfil): cores e cabelo entram na geometria, por isso muda-se reconstruindo o corpo
  await LP(78, 'a preparar as personagens');
  const silMat = new THREE.MeshBasicMaterial({ color: 0xf2a33a, depthFunc: THREE.GreaterDepth, depthWrite: false, fog: false });
  const mkBody = L => { const b = new Body(mats, lookCol(L)); b.forceNear = true; b.root.traverse(o => { if (o.isMesh && !o.userData.sil) { o.renderOrder = 2; const s = new THREE.Mesh(o.geometry, o.userData.skinned ? b.skinMat(silMat) : silMat); s.userData.sil = true; s.renderOrder = 1; s.castShadow = false; o.add(s); } }); scene.add(b.root); return b; };
  let body = mkBody((Conta.ativo() || {}).look); let myLook = lookCol((Conta.ativo() || {}).look);
  const vm = makeVM(); // arma e braços na 1.ª pessoa
  // ---------- comerciantes: 4 pessoas paradas nas zonas de PvP (ver traders.js)
  const npcs = [];
  const npcLooks = [{ skin: 0xc89a78, top: 0x3a3e44, legs: 0x2a2c30, hair: 0x1a1612, hairS: 1 }, { skin: 0xd8b08a, top: 0x55603e, legs: 0x3a4030, hair: 0x2a2520, beard: 1 }, { skin: 0xe0b896, top: 0x7a3a2e, legs: 0x2e3238, hair: 0x3a2618, hairS: 3 }, { skin: 0xb88a68, top: 0x6a6258, legs: 0x3e3a34, hair: 0x8a8480, beard: 1 }];
  const npcInit = () => { for (const T of TRADERS) { const b = mkRemote(npcLooks[T.id] || {}); if (T.id === 1) b.setGear({ head: { k: 'capacete' }, vest: { k: 'colete' } }); const y = groundY(T.x, T.z, 0); b.root.position.set(T.x, y, T.z); b.root.rotation.y = T.yaw; const col = { x: T.x, z: T.z, r: 0.42, k: 's', on: true }; addCirc(col); npcs.push({ T, b, yaw: T.yaw }); } };
  // comprar e vender: aqui muda o inventário; online, o servidor faz o mesmo nas contas dele (e corrige se não bater certo)
  const tradeFn = (T, k, n, sell) => { const p = G.p; if (!p || !p.alive || Math.hypot(T.x - p.x, T.z - p.z) > TRADE_R + 1) { G.ui.toast('Estás longe do comerciante'); return; }
    if (sell) { const have = G.inv.count(k); n = Math.min(n, have); if (n <= 0) return;
      // se for uma arma, primeiro tira o que tem montado (carregador, balas, acessórios) para a mochila
      if (ITEMS[k].gun) { const g = [...G.inv.bag.list.map(e => e.it), ...G.inv.belt.filter(Boolean)].find(o => o.k === k); if (g) { const back = []; if (g.mg) { const m = mkItem(g.mg); m.am = g.ammo || 0; m.ak = g.ak; back.push(m); g.mg = null; g.ammo = 0; } else if (g.ammo) { back.push(mkItem(g.ak || ammoOf(ITEMS[k].gun)[0], g.ammo)); g.ammo = 0; } if (g.att) { for (const s in g.att) if (g.att[s]) back.push(mkItem(g.att[s])); g.att = {}; } for (const it of back) { const left = G.inv.give(it); if (left) G.dropItem(it); } } }
      if (ITEMS[k].clip) { const m = [...G.inv.bag.list.map(e => e.it), ...G.inv.belt.filter(Boolean)].find(o => o.k === k); if (m && m.am) { const b = mkItem(m.ak, m.am); m.am = 0; const left = G.inv.give(b); if (left) G.dropItem(b); } }
      if (G.net.world) G.net.raw({ t: 'tr', id: T.id, k, n, s: 1 });
      G.inv.take(k, n); const got = SELL(k) * n, m = mkItem('iene', got), left = G.inv.give(m); if (left) G.dropItem(m); audio.play('apanhar'); G.ui.toast('Vendeste ' + (n > 1 ? n + ' × ' : '') + ITEMS[k].s.toLowerCase() + ' por ¥ ' + got);
    } else { const cost = PRICE[k] * n; if (G.inv.count('iene') < cost) { G.ui.toast('Não tens ienes que cheguem'); return; } if (!T.sells.includes(k)) return;
      const it = mkItem(k, n); if (ITEMS[k].gun) { it.mg = null; it.ammo = 0; } if (ITEMS[k].clip) it.am = 0;
      if (G.net.world) G.net.raw({ t: 'tr', id: T.id, k, n });
      G.inv.take('iene', cost); const left = G.inv.give(it); if (left) { G.dropItem(it); G.ui.toast('Mochila cheia: ficou no chão'); } else G.ui.toast('Compraste ' + (n > 1 ? n + ' × ' : '') + ITEMS[k].s.toLowerCase()); audio.play('apanhar'); }
    refresh(); G.ui.refresh(true); };
  const mkRemote = L => { const b = new Body(mats, lookCol(L && typeof L === 'object' ? L : {})); scene.add(b.root); return b; };
  await LP(84, 'a preparar os animais');
  const fauna = new Fauna(scene, mats.v, 160); // animais (veados, javalis, lobos, cães, galinhas)
  const _vf = new THREE.Frustum(), _vfM = new THREE.Matrix4();
  // zombies com corpo realista (Blender + MakeHuman): textura de cor e de relevo; enquanto carregam, cor lisa parecida
  const zmat = new THREE.MeshStandardMaterial({ color: 0x7c8270, roughness: 0.88 });
  const horde = new ZHorde(scene, zmat, mats.v);
  { const TL = new THREE.TextureLoader(); let cm = null, nm = null; const done = () => { if (cm && nm) { zmat.color.set(0xffffff); horde.setMaps(cm, nm); } };
    TL.load('tex/zombie.jpg', t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; cm = t; done(); }, undefined, () => { });
    TL.load('tex/zombie_n.jpg', t => { t.anisotropy = 4; nm = t; done(); }, undefined, () => { }); }
  const bagM = bagMesh(mats), bodyBagM = bagMesh(mats, true);
  // sacos no chão: contorno quente que pulsa quando estás perto (casca por trás do saco, sem custo de pós-processamento)
  const haloTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 4, 32, 32, 32); g.addColorStop(0, 'rgba(255,200,110,.9)'); g.addColorStop(0.45, 'rgba(242,170,70,.45)'); g.addColorStop(1, 'rgba(242,160,60,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const haloGeo = new THREE.PlaneGeometry(1, 1), haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.6 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xF2B65A, side: THREE.BackSide, transparent: true, opacity: 0.7, depthWrite: false, fog: false });
  const addGlow = m => { let geo = null; m.traverse(o => { if (!geo && o.isMesh) geo = o.geometry; }); if (!geo) return null; geo.computeBoundingBox(); const c = geo.boundingBox.getCenter(new THREE.Vector3()), sz = geo.boundingBox.getSize(new THREE.Vector3()); const g = new THREE.Mesh(geo, glowMat); const k = 0.12; g.scale.set(1 + k / Math.max(0.2, sz.x) * 2, 1 + k / Math.max(0.2, sz.y) * 2, 1 + k / Math.max(0.2, sz.z) * 2); g.position.copy(c).multiply(new THREE.Vector3(1 - g.scale.x, 1 - g.scale.y, 1 - g.scale.z)); g.renderOrder = -1; g.raycast = () => {}; const grp = new THREE.Group(); grp.add(g); const h = new THREE.Mesh(haloGeo, haloMat); h.rotation.x = -Math.PI / 2; h.position.set(c.x, 0.03, c.z); h.scale.setScalar(Math.max(sz.x, sz.z) * 1.9 + 0.5); h.raycast = () => {}; grp.add(h); grp.visible = false; m.add(grp); m.userData.gl = grp; return grp; };
  const glowBags = () => { const p = G.p; if (!p) return; glowMat.opacity = 0.5 + 0.3 * Math.sin(G.t * 4.2); haloMat.opacity = 0.45 + 0.2 * Math.sin(G.t * 4.2); for (const b of G.bags) { const m = b.mesh; if (!m) continue; const near = p.alive && (b.lv || 0) === (p.lv || 0) && Math.hypot(b.x - p.x, b.z - p.z) < 6; const g = m.userData.gl || (near ? addGlow(m) : null); if (g) g.visible = near; } };

  // ---------- estado
  const G = window.G = { ARENA: ARENA_ON, audio,
    renderer,
    TOUCH, W, ITEMS, RECIPES, CAP, t: 0, playing: false, invOpen: false, mapOpen: false, paused: false,
    p: null, inv: new Inv(), sel: 0, zs: [], bags: [], box: null, prompt: null,
    cam, renderer, scene, camT, YAW,
  };
  G.dbgNav = { nav, walkLine: (a, b, c, d, lv) => walkLine(a, b, c, d, lv || 0), find: (a, b, c, d, lv) => nav.find(a, b, c, d, lv || 0) };
  // bases construídas pelo jogador
  // mancha de luz no chão por baixo de cada candeeiro (barata: dá para todos os do mapa ao mesmo tempo)
  G.poolTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)'); g.addColorStop(0.7, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  // manchas de luz dos candeeiros do mapa (uma só malha com todas)
  let lampPools = null; { const L = W.lamps; if (L.length) { const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: G.poolTex, color: 0xffc27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), L.length); const o = new THREE.Object3D();
    L.forEach((l, i) => { const r = l[1] > 9 ? 40 : 13; o.position.set(l[0], 0.06, l[2]); o.scale.set(r, 1, r); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }); m.renderOrder = 3; m.frustumCulled = false; scene.add(m); lampPools = m; } }
  G.base = makeBase({ scene, W, G, audio, addRect, removeRect, visDirty, inCity, toast: m => G.ui && G.ui.toast(m) });
  G.doorAt = doorAt;
  const newPlayer = (x, z) => ({ x, z, y: 0.03, lv: 0, h: 0, vy: 0, base: 0, onGround: true, climb: null, root: Math.atan2(-x, -z), aim: Math.atan2(-x, -z), vx: 0, vz: 0, yaw: Math.atan2(-x, -z), hp: 100, food: 82, water: 78, stam: 100, sk: { res: 0, mira: 0, rec: 0 }, bleed: 0, alive: true, cd: 0, swing: -1, swingHit: false, recoil: 0, reload: 0, use: null, kills: 0, born: G.t, mv: 0, hurtT: 0, sprint: false, cause: '' });
  const freshKit = () => { const inv = new Inv(); inv.belt[0] = mkItem('pedra'); inv.belt[1] = mkItem('ligadura', 2); inv.bag.insert(mkItem('onigiri', 1)); inv.bag.insert(mkItem('lanterna', 1)); return inv; };
  // kit de teste (protótipo): proteção, armas com acessórios, muitas balas, comida e medicamentos
  const testKit = () => {
    const inv = new Inv(); const gun = (k, att = {}) => { const it = mkItem(k); it.ammo = capOf(it); it.att = att; return it; }; const clip = k => { const m = mkItem(k); m.am = ITEMS[k].clip.cap; return m; };
    inv.eq.head = mkItem('capacete'); inv.eq.vest = mkItem('colete'); inv.eq.back = mkItem('mochila');
    inv.belt = [gun('m4', { scope: 'mira4', sup: 'silR' }), gun('caca', { scope: 'mira8' }), gun('pistola', { sup: 'silP' }), gun('cacadeira'), mkItem('faca'), null];
    const rows = inv.rows();
    for (const [k, n] of [['medkit', 1], ['a556', 60], ['a308', 20], ['a9', 36], ['a9s', 24], ['c12s', 16], ['ligadura', 5], ['lanterna', 1], ['bebida', 2], ['chocolate', 3]]) { const it = n === 1 && ITEMS[k].gun ? gun(k) : mkItem(k, n); inv.bag.insert(it, rows); }
    for (const k of ['cStanag', 'cStanag', 'c308', 'cPist']) inv.bag.insert(clip(k), rows); for (const k of ['reddot', 'lantArma']) inv.bag.insert(mkItem(k), rows);
    return inv;
  };
  const spawnPoint = kit => {
    if (!kit) { // perto de uma vila ou de um monumento (a 60–140 m da borda), fora de qualquer zona, nunca na cidade PvP nem na base militar
      const Z = W.zones.filter(z => z.kind === 'town' || z.kind === 'mon');
      for (let t = 0; t < 60 && Z.length; t++) {
        const zn = Z[Math.floor(Math.random() * Z.length)], a = Math.random() * Math.PI * 2, d = zn.r + 60 + Math.random() * 80, x = zn.x + Math.sin(a) * d, z = zn.z + Math.cos(a) * d;
        if (Math.abs(x) > MAP - 60 || Math.abs(z) > MAP - 60 || Math.hypot(x, z) < 160) continue;
        if (W.zones.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 25)) continue;
        if (solidAt(x, z, 1.2) || W.paved(x, z)) continue;
        G.spawnZone = zn; return [x, z];
      } }
    G.spawnZone = null; const L = kit ? W.kitSpawns : W.spawns, s = L[Math.floor(Math.random() * L.length)]; return [s[0] + (Math.random() - 0.5) * 4, s[1] + (Math.random() - 0.5) * 2]; };
  // texto de onde estás: nome da zona e para onde fica a cidade
  const whereMsg = (x, z) => { const zn = G.spawnZone, d = Math.hypot(x, z), dir = ['norte', 'nordeste', 'este', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'][Math.round(((Math.atan2(-x, z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8], km = d >= 1000 ? (d / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(d / 10) * 10 + ' m';
    return (zn ? 'Acordaste perto de ' + zn.name + '. ' : 'Acordaste. ') + 'Shin-Kurogane fica a ' + km + ', para ' + dir + '.'; };

  // ---------- ícones dos objetos
  const I3 = makeIcons(2); const ICONS = {}, CELLPX = 46;
  for (const k in ITEMS) { const d = ITEMS[k]; ICONS[k] = I3.iconOf(d.icon, d.w * CELLPX + (d.w - 1) * 2, d.h * CELLPX + (d.h - 1) * 2, d.v || 'side', d.w === 1 && d.h === 1 ? 0.7 : 0.82, d.tint); }
  const ICONS_SQ = {}; for (const k in ITEMS) { const d = ITEMS[k]; if (d.w >= d.h * 2 && d.w >= 3) ICONS_SQ[k] = I3.iconOf(d.icon, 96, 96, 'side', 0.94, d.tint, -0.62); } G.ICONS_SQ = ICONS_SQ;
  G.ICONS = ICONS; G.portrait = eq => I3.portrait({ eq }, 160, 300); I3.setLook((Conta.ativo() || {}).look);
  G.portraitLook = L => I3.portrait({}, 168, 252, L); G.LOOK_OPTS = LOOK_OPTS;
  Object.defineProperty(G, 'body', { get: () => body, configurable: true });
  G.setLook = L => { myLook = lookCol(L); const o = body, nb = mkBody(L); nb.root.position.copy(o.root.position); nb.root.rotation.copy(o.root.rotation); nb.root.visible = o.root.visible; scene.remove(o.root); o.dispose(); body = nb; I3.setLook(L); if (G.p && G.inv) refresh(); G.lookV = (G.lookV || 0) + 1; };

  // ---------- ações
  const held = () => G.inv.belt[G.sel];
  const heldDef = () => { const it = held(); return it ? ITEMS[it.k] : FISTS; };
  const noise = (x, z, r) => { r *= 1 - 0.35 * (G.rain || 0); G.lastNoise = { x, z, r: r * 1.3, t: G.t }; for (const zb of G.zs) if (!zb.an && zb.state !== 'dead' && zb.state !== 'chase' && Math.hypot(zb.x - x, zb.z - z) < r) { zb.state = 'alert'; zb.tx = x + (Math.random() - 0.5) * 4; zb.tz = z + (Math.random() - 0.5) * 4; } };
  const vol = (x, z) => clamp(1 - Math.hypot(x - G.p.x, z - G.p.z) / 34, 0, 1);
  const GK = ['head', 'vest', 'suit', 'eyes', 'back']; // equipamento que os outros veem (chaves dos itens, pela mesma ordem do servidor)
  const refresh = () => { body.setGear(G.inv.eq); const d = heldDef(); body.setWeapon(held() ? (d.gun || d.melee ? held().k : null) : null, held() && held().att || {}); G.ui.refresh(); };
  G.refresh = refresh; G.mkItem = mkItem; G.dbgBody = () => body; G.dbgNodes = () => nodes; /* testes */
  const select = i => { if (G.sel === i) return; G.sel = i; if (G.aimEnd) G.aimEnd(); AIM.raise = 0; G.p.reload = 0; G.p.use = null; G.p.swing = -1; G.p.thrT = -1; G.p.thrIt = null; audio.play('ui'); refresh(); };
  G.select = select;
  // ---------- treino: o corpo habitua-se ao que fazes. Cada ganho é proporcional ao que falta (sobe depressa no início, devagar perto do máximo); perde-se tudo ao morrer
  // resistência (a correr): ~20 min de corrida para metade; pontaria (disparos e acertos): ~120 acertos para metade; recolha (golpes em árvores e rochas): ~90 golpes para metade
  const SKN = { res: 'Resistência', mira: 'Pontaria', rec: 'Recolha' };
  const sk = k => (G.p && G.p.sk ? G.p.sk[k] || 0 : 0);
  // peso: até à capacidade não pesa; acima andas mais devagar e cansas-te mais; 18 kg acima já não corres
  let ldT = -1, ldV = { kg: 0, cap: 28 }, ldS = 0;
  const load = () => { if (G.t - ldT > 0.25 || G.t < ldT) { ldT = G.t; const kg = G.inv ? G.inv.weight() : 0, cap = 28 + 7 * sk('res'), st = kg > cap + 18 ? 2 : kg > cap ? 1 : 0; ldV = { kg, cap };
    ldS = st; } return ldV; };
  G.load = () => { ldT = -1; return load(); };
  const skUp = (k, a) => { const p = G.p; if (!p || !p.alive) return; const S = p.sk || (p.sk = { res: 0, mira: 0, rec: 0 }), v = S[k] || 0, b = Math.floor(v * 10 + 0.05); S[k] = Math.min(0.995, v + a * (1 - v)); const n = Math.floor(S[k] * 10 + 0.05); if (n > b) { G.ui.toast(`${SKN[k]} subiu para o nível ${n}`); audio.play('ui'); } };
  G.sk = sk; G.SKN = SKN;
  // durabilidade da proteção: cada bala travada gasta-a; o capacete salta e o colete parte-se
  const armDur = z => { if (z.helm0 == null) { z.helm0 = z.helm || 0; z.vest0 = z.vest || 0; } z.hd = z.helm ? 20 : 0; z.vd = z.vest ? (z.vest >= 3 ? 50 : 25) : 0; };
  const zDie = (z, head) => { z.state = 'dead'; z.deadT = 0; z.sink = 0; z.head = !!head; z.atkT = 0; z.mv = 0; if (!head) audio.play('carne', vol(z.x, z.z)); };
  const hurtZombie = (z, dmg, dx, dz, o = {}) => {
    if (o.zone && z.state !== 'dead' && !o.quiet) skUp('mira', o.zone === 'head' ? 0.011 : 0.0055);
    const kill = z.hp - dmg <= 0, at = o.at, onl = G.net.world && z.nid != null;
    z.hp -= dmg; z.hitT = 0.15; if (!z.remote) { z.x += dx * 0.12; z.z += dz * 0.12; }
    if (o.stop) { burst(at.x, at.y, at.z, 6, 0xffe2a0, 3.2, 0.25); audio.play('ricochete', vol(z.x, z.z)); }
    else if (o.zone === 'head') { burst(at.x, at.y, at.z, 16, 0x6a0c08, 3.6, 0.7); burst(at.x, at.y, at.z, 6, 0xd8c8b0, 2.4, 0.5); audio.play('cabeca', vol(z.x, z.z)); }
    else burst(at ? at.x : z.x, at ? at.y : 1.2, at ? at.z : z.z, 7, 0x7a0e0a, 3);
    if (z.state !== 'chase' && !z.remote && !z.an) { z.state = 'chase'; z.lost = 0; }
    if (o.by && !z.an && !z.remote) z.aggro = o.by; // mordido por um cão: vira-se a ele
    if (!o.quiet) { G.ui.hit(kill, o.zone, o.stop, at || new THREE.Vector3(z.x, (z.y || 0) + 1.25, z.z)); G.buzz(kill ? (o.zone === 'head' ? [20, 30, 60] : [25, 40, 35]) : 14); }
    if (onl) { G.net.zd({ i: z.nid, dmg: +dmg.toFixed(1), zone: o.zone || 'body', h: z.helm || 0, v: z.vest || 0, hd: z.hd, vd: z.vd, dx: +dx.toFixed(2), dz: +dz.toFixed(2), limp: o.limp || 0 });
      if (kill) { zDie(z, o.zone === 'head'); z.predDead = performance.now(); } else if (!o.stop && o.zone !== 'head') audio.play('carne', 0.6 * vol(z.x, z.z)); return; }
    if (kill && z.an) { z.state = 'dead'; z.deadT = 0; audio.play('carne', vol(z.x, z.z)); const g = new Grid(6, 4); for (const [k, n] of ANLOOT[z.an] || []) g.insert(mkItem(k, n)); dropBag(z.x, z.z, g, { lv: 0, y: groundY(z.x, z.z, 0) }); if (z.pet) G.ui.toast('O teu cão morreu'); return; }
    if (kill) { z.state = 'dead'; z.deadT = 0; z.head = o.zone === 'head'; G.p.kills++; if (o.zone !== 'head') audio.play('carne', vol(z.x, z.z)); if (Math.random() < 0.32) { const g = new Grid(6, 4); rollLoot(z.kind === 'mil' ? 'militar' : 'zombie', g); dropBag(z.x, z.z, g, { lv: z.lv || 0, y: (z.base || 0) + groundY(z.x, z.z, z.lv || 0) }); } }
    else if (!o.stop && o.zone !== 'head') audio.play('carne', 0.6 * vol(z.x, z.z));
  };
  // ---------- balística: cada bala voa à velocidade real da munição, cai com a gravidade e acerta em cabeça, corpo ou pernas
  const bullets = [];
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _e = new THREE.Vector3();
  // distância² entre os segmentos P-Q e A-B, e onde fica no P-Q (0..1)
  const segSeg = (P, Q, A, B) => {
    const d1x = Q.x - P.x, d1y = Q.y - P.y, d1z = Q.z - P.z, d2x = B.x - A.x, d2y = B.y - A.y, d2z = B.z - A.z, rx = P.x - A.x, ry = P.y - A.y, rz = P.z - A.z;
    const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
    let s, t; const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) { t = 0; s = clamp(-c / a, 0, 1); } else { const bb = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - bb * bb; s = den > 1e-9 ? clamp((bb * f - c * e) / den, 0, 1) : 0; t = (bb * s + f) / e; if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((bb - c) / a, 0, 1); } }
    const cx = rx + d1x * s - d2x * t, cy = ry + d1y * s - d2y * t, cz = rz + d1z * s - d2z * t; return [cx * cx + cy * cy + cz * cz, s, t];
  };
  // hitboxes: as mesmas matrizes da pose que desenha o zombie (zombiePose), por isso acertas exatamente no que vês, em qualquer animação
  // cabeça: esfera; tronco e anca: caixas; pescoço, braços e pernas: cápsulas; pés: caixas. Capacete e colete alargam a zona que protegem
  const HP = [
    ['head', 'head', 's', ZHEAD.c.slice(), null, ZHEAD.r * 1.12], // a cabeça desenhada (corpo novo)
    ['torso', 'body', 'b', [0, 0.33, 0], [0.19, 0.2, 0.12], 0.08], // tronco do corpo novo (mais baixo e estreito do que o antigo)
    ['torso', 'body', 'c', [0, 0.5, 0.0], [0, 0.6, 0.02], 0.055], // pescoço: acaba onde a cabeça começa
    ['torso', 'body', 'b', [0, 0.06, 0], [0.2, 0.1, 0.12], 0.06],
    ['armL', 'arms', 'c', [0, 0, 0], [0, -0.3, 0], 0.07], ['armR', 'arms', 'c', [0, 0, 0], [0, -0.3, 0], 0.07],
    ['foreL', 'arms', 'c', [0, 0, 0], [0, -0.36, 0], 0.06], ['foreR', 'arms', 'c', [0, 0, 0], [0, -0.36, 0], 0.06],
    ['legL', 'legs', 'c', [0, -0.06, 0], [0, -0.44, 0], 0.1], ['legR', 'legs', 'c', [0, -0.06, 0], [0, -0.44, 0], 0.1],
    ['shinL', 'legs', 'c', [0, 0, 0], [0, -0.38, 0], 0.085], ['shinR', 'legs', 'c', [0, 0, 0], [0, -0.38, 0], 0.085],
    ['shinL', 'legs', 'b', [0, -0.435, 0.055], [0.065, 0.05, 0.14], 0.03], ['shinR', 'legs', 'b', [0, -0.435, 0.055], [0.065, 0.05, 0.14], 0.03]];
  const HELM = [ZHEAD.c[0], ZHEAD.c[1] + 0.02, ZHEAD.c[2]], VESTC = [0, 0.36, 0.01], VESTH = [0.21, 0.2, 0.15], PK = ['torso', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR'];
  const _lp = new THREE.Vector3(), _lq = new THREE.Vector3(), _l1 = new THREE.Vector3(), _l2 = new THREE.Vector3();
  G.zHead = z => { const M = zombiePose(z, newPose()), v = new THREE.Vector3(...ZHEAD.c).applyMatrix4(M.head); return { x: v.x, y: v.y, z: v.z }; }; // testes: onde está a cabeça desenhada
  const poseInv = z => { if (z.an) { if (z._pt !== G.t || !z._inv) { const P = z._pose || (z._pose = { an: new THREE.Matrix4() }), I = z._inv || (z._inv = { an: new THREE.Matrix4() }); fauna.root({ ...z, state: 'live' }, P.an); I.an.copy(P.an).invert(); z._pt = G.t; } return z._inv; }
    if (z._pt !== G.t || !z._inv) { z._pose = zombiePose(z, z._pose || newPose()); const I = z._inv || (z._inv = {}); for (const k of PK) (I[k] || (I[k] = new THREE.Matrix4())).copy(z._pose[k]).invert(); z._pt = G.t; } return z._inv; };
  const segSph = (p, q, c, r) => { const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, fx = p.x - c[0], fy = p.y - c[1], fz = p.z - c[2], a = dx * dx + dy * dy + dz * dz, b = 2 * (fx * dx + fy * dy + fz * dz), cc = fx * fx + fy * fy + fz * fz - r * r; if (cc <= 0) return 0; const disc = b * b - 4 * a * cc; if (disc < 0 || a < 1e-12) return null; const t = (-b - Math.sqrt(disc)) / (2 * a); return t >= 0 && t <= 1 ? t : null; };
  const segBox = (p, q, c, h, k) => { let t0 = 0, t1 = 1; for (const [o, d, lo, hi] of [[p.x, q.x - p.x, c[0] - h[0] * k, c[0] + h[0] * k], [p.y, q.y - p.y, c[1] - h[1] * k, c[1] + h[1] * k], [p.z, q.z - p.z, c[2] - h[2] * k, c[2] + h[2] * k]]) { if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return null; continue; } let ta = (lo - o) / d, tb = (hi - o) / d; if (ta > tb) { const x = ta; ta = tb; tb = x; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return null; } return t0; };
  const segRBox = (p, q, c, h, rr, k) => {
    let t = segBox(p, q, c, h, k); if (t === null || !rr) return t; const hx = h[0] * k, hy = h[1] * k, hz = h[2] * k, r = rr * k, bx = hx - r, by = hy - r, bz = hz - r;
    const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, L = Math.hypot(dx, dy, dz) || 1;
    for (let i = 0; i < 28 && t <= 1; i++) { const x = Math.abs(p.x + dx * t - c[0]) - bx, y = Math.abs(p.y + dy * t - c[1]) - by, zz = Math.abs(p.z + dz * t - c[2]) - bz; const d = Math.hypot(Math.max(x, 0), Math.max(y, 0), Math.max(zz, 0)) + Math.min(Math.max(x, y, zz), 0) - r; if (d < 0.0015) return t; t += d / L; }
    return null;
  };
  const zoneHit = (z, P, Q, inflate = 1) => {
    const mx = (P.x + Q.x) / 2, mz = (P.z + Q.z) / 2, half = Math.hypot(Q.x - P.x, Q.z - P.z) / 2 + 1.6; if (Math.abs(z.x - mx) > half || Math.abs(z.z - mz) > half) return null;
    const I = poseInv(z); let best = null;
    if (z.an) { _lp.copy(P).applyMatrix4(I.an); _lq.copy(Q).applyMatrix4(I.an); const r = anHit(z.an, _lp, _lq, segSph, segRBox, inflate); if (!r) return null; r.i = r.zone === 'head' ? -2 : -1; r.c = new THREE.Vector3().copy(P).lerp(Q, r.s); return r; }
    for (let hi = 0; hi < HP.length; hi++) { const [mk, zone, ty, a, bb, r0] = HP[hi];
      _lp.copy(P).applyMatrix4(I[mk]); _lq.copy(Q).applyMatrix4(I[mk]); let t = null;
      if (ty === 's') t = segSph(_lp, _lq, z.helm ? HELM : a, (z.helm ? ZHEAD.r + 0.035 : r0) * inflate);
      else if (ty === 'b') t = zone === 'body' && z.vest && a[1] > 0.3 ? segRBox(_lp, _lq, VESTC, VESTH, 0.06, inflate) : segRBox(_lp, _lq, a, bb, r0, inflate);
      else { _l1.set(a[0], a[1], a[2]); _l2.set(bb[0], bb[1], bb[2]); const r = r0 * inflate, [d2, sg] = segSeg(_lp, _lq, _l1, _l2); if (d2 <= r * r) { const L = _lp.distanceTo(_lq) || 1; t = Math.max(0, sg - Math.sqrt(r * r - d2) / L); } }
      if (t !== null && (!best || t < best.s - 1e-5)) best = { s: t, zone, i: hi };
    }
    if (best) best.c = new THREE.Vector3().copy(P).lerp(Q, best.s);
    return best;
  };
  // ponto de mira dentro da parte do corpo que o raio da câmara apanhou (o centro da cabeça, o eixo do braço, o meio do tronco), na pose dessa parte.
  // A mira de cima vê a superfície do zombie por um ângulo; a bala sai do ombro por outro. Apontar à superfície vista de cima fazia a bala raspar por cima da cabeça ou do braço e falhar
  const partIn = (z, i, P, Q) => {
    if (z.an) { poseInv(z); return { z, mk: 'an', lp: anPart(z.an, i === -2 ? 'head' : 'body'), zone: i === -2 ? 'head' : 'body' }; }
    poseInv(z); const [mk, zone, ty, a, bb, r0] = HP[i]; const I = z._inv[mk]; _lp.copy(P).applyMatrix4(I); _lq.copy(Q).applyMatrix4(I); let lp;
    if (ty === 's') lp = (z.helm ? HELM : a).slice();
    else if (ty === 'c') { _l1.set(a[0], a[1], a[2]); _l2.set(bb[0], bb[1], bb[2]); const t = clamp(segSeg(_lp, _lq, _l1, _l2)[2], 0.12, 0.88); lp = [a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t]; }
    else { const vest = zone === 'body' && z.vest && a[1] > 0.3, c = vest ? VESTC : a, h = vest ? VESTH : bb; const dx = _lq.x - _lp.x, dy = _lq.y - _lp.y, dz = _lq.z - _lp.z, L2 = dx * dx + dy * dy + dz * dz || 1, t = clamp(((c[0] - _lp.x) * dx + (c[1] - _lp.y) * dy + (c[2] - _lp.z) * dz) / L2, 0, 1);
      lp = [clamp(_lp.x + dx * t, c[0] - h[0] * 0.5, c[0] + h[0] * 0.5), clamp(_lp.y + dy * t, c[1] - h[1] * 0.5, c[1] + h[1] * 0.5), clamp(_lp.z + dz * t, c[2] - h[2] * 0.5, c[2] + h[2] * 0.5)]; }
    return { z, mk, lp, zone };
  };
  // outros jogadores (online): os mesmos volumes que o servidor usa para decidir o tiro (cápsula de 0,3 m no eixo do corpo e esfera de 0,17 m na cabeça; deitado, perto do chão)
  const _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
  const plHit = (P, Q, aim = false) => {
    const T = G.net && G.net.on && G.net.targets ? G.net.targets() : null; if (!T || !T.length) return null; let best = null; const L = P.distanceTo(Q) || 1;
    const mx = (P.x + Q.x) / 2, mz = (P.z + Q.z) / 2, half = Math.hypot(Q.x - P.x, Q.z - P.z) / 2 + 2;
    const ent = (d2, sg, r) => Math.max(0, sg - Math.sqrt(Math.max(0, r * r - d2)) / L);
    for (const t of T) { if (Math.abs(t.x - mx) > half || Math.abs(t.z - mz) > half) continue; let h = null;
      if (t.lying) { _pa.set(t.x, t.y + 0.25, t.z); const [d2, sg] = segSeg(P, Q, _pa, _pa); if (d2 <= 0.25) h = { s: ent(d2, sg, 0.5), zone: 'body', point: _pa.clone() }; }
      else if ((t.sc || 0) > 1.5) { const fx = Math.sin(t.yaw || 0), fz = Math.cos(t.yaw || 0); _pa.set(t.x + fx * 0.72, t.y + 0.24, t.z + fz * 0.72); const [dh, sh] = segSeg(P, Q, _pa, _pa); _pa.set(t.x - fx * 0.95, t.y + 0.18, t.z - fz * 0.95); _pb.set(t.x + fx * 0.45, t.y + 0.2, t.z + fz * 0.45); const [db, sb] = segSeg(P, Q, _pa, _pb); // deitado: ao comprido no chão
        if (dh <= 0.17 * 0.17) h = { s: ent(dh, sh, 0.17), zone: 'head', point: new THREE.Vector3(t.x + fx * 0.72, t.y + 0.24, t.z + fz * 0.72) }; else if (db <= 0.26 * 0.26) h = { s: ent(db, sb, 0.26), zone: 'body', point: new THREE.Vector3(t.x, t.y + 0.2, t.z) }; }
      else {
        const cr = Math.min(1, t.sc || 0), hy = 1.62 - 0.5 * cr, by2 = 1.35 - 0.45 * cr; // agachado: tudo mais baixo
        _pa.set(t.x, t.y + hy, t.z); const [dh, sh] = segSeg(P, Q, _pa, _pa); _pa.set(t.x, t.y + 0.15, t.z); _pb.set(t.x, t.y + by2, t.z); const [db, sb, u] = segSeg(P, Q, _pa, _pb);
        const body = (y) => ({ s: ent(db, sb, 0.33), zone: 'body', point: new THREE.Vector3(t.x, y, t.z) });
        if (!aim) { const hi = dh <= 0.17 * 0.17 ? ent(dh, sh, 0.17) : 9, bi = db <= 0.09 ? ent(db, sb, 0.3) : 9; if (hi < 9 || bi < 9) h = hi < bi ? { s: hi, zone: 'head' } : { s: bi, zone: 'body' }; }
        // a mirar: vista de cima, a cabeça tapa o meio do corpo; só é cabeça com a mira mesmo em cima dela, senão vai ao peito
        else if (dh <= 0.1 * 0.1) h = { s: ent(dh, sh, 0.1), zone: 'head', point: new THREE.Vector3(t.x, t.y + hy, t.z) };
        else if (db <= 0.33 * 0.33) h = body(clamp(t.y + 0.15 + (by2 - 0.15) * u, t.y + 0.4, t.y + by2 - 0.05));
        else if (dh <= 0.2 * 0.2) h = { s: ent(dh, sh, 0.2), zone: 'body', point: new THREE.Vector3(t.x, t.y + by2 - 0.05, t.z) };
      }
      if (h && (!best || h.s < best.s)) best = h; }
    return best;
  };
  const PENC = { head: 0.7, body: 0.9, arms: 0.4, legs: 0.6 }; // quanto custa atravessar cada parte (a bala passa se ainda tiver perfuração que chegue)
  // paredes, portas, árvores, chão e lajes entre pisos (devolve a fração do caminho)
  const wallHit = (P, Q) => {
    let best = 1; const dx = Q.x - P.x, dz = Q.z - P.z, dy = Q.y - P.y;
    near(Math.min(P.x, Q.x), Math.min(P.z, Q.z), Math.max(P.x, Q.x), Math.max(P.z, Q.z), r => {
      if ((r.k === 'l' && !r.leaf) || (r.k === 'g' && !r.win)) return;
      let t0 = 0, t1 = best;
      for (const [o, d, lo, hi] of [[P.x, dx, r.x0, r.x1], [P.z, dz, r.z0, r.z1]]) { if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return; } else { let ta = (lo - o) / d, tb = (hi - o) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return; } }
      const yb = r.yb || 0, top = yb + (r.win ? 0.95 : r.h); const ya = P.y + dy * t0, yz = P.y + dy * t1;
      if (Math.min(ya, yz) > top || Math.max(ya, yz) < yb - 0.05) return;
      const tin = ya <= top ? t0 : (top - P.y) / dy; if (tin < best) best = Math.max(0, tin);
    }, c => { const ox = P.x - c.x, oz = P.z - c.z, A = dx * dx + dz * dz; if (A < 1e-9) return; const B = (ox * dx + oz * dz) / A, Cq = (ox * ox + oz * oz - c.r * c.r) / A, disc = B * B - Cq; if (disc < 0) return; const t = -B - Math.sqrt(disc); if (t < 0 || t >= best) return; const hgt = c.node && c.node.kind !== 'tree' ? 1.0 : 7; if (P.y + dy * t < hgt) best = t; });
    if (Q.y < 0.03 && P.y >= 0.03) { const t = (P.y - 0.03) / (P.y - Q.y); if (t < best) best = t; }
    for (const C of W.cuts) { if (!C.shell || C.n < 2) continue; if (Math.max(P.x, Q.x) < C.x0 || Math.min(P.x, Q.x) > C.x1 || Math.max(P.z, Q.z) < C.z0 || Math.min(P.z, Q.z) > C.z1) continue;
      for (let L = 1; L < C.n; L++) { const h = L * C.fh; if ((P.y - h) * (Q.y - h) > 0) continue; const t = (P.y - h) / (P.y - Q.y); if (t >= best) continue; const x = P.x + dx * t, z = P.z + dz * t; if (!inShell(C, x, z)) continue; if (C.stairs.some(st => st.lv === L - 1 && x > st.x0 && x < st.x1 && z > st.z0 && z < st.z1)) continue; best = t; } }
    return best;
  };
  const updBullets = dt => {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]; const Q = _b.copy(b.P).addScaledVector(b.v, dt); { const sp = b.v.length(); b.v.multiplyScalar(1 - Math.min(0.5, b.cd * sp * dt)); } b.v.y -= 9.81 * dt; b.t += dt;
      let s = wallHit(b.P, Q), hz = null;
      for (const z of G.zs) { if (z.state === 'dead' || (b.skip && b.skip.has(z))) continue; const r = zoneHit(z, b.P, Q); if (r && r.s < s) { s = r.s; hz = { z, r }; } }
      // outro jogador: o servidor decide o dano; aqui a bala só para nele, para o rasto bater certo com o que vês
      const ph = G.net.on ? plHit(b.P, Q) : null; if (ph && ph.s < s) { s = ph.s; hz = null; }
      const E = _c.copy(b.P).lerp(Q, s); { const d0 = b.dist, d1 = d0 + b.P.distanceTo(E); if (b.off && d0 < 14) { const f0 = Math.max(0, 1 - d0 / 14), f1 = Math.max(0, 1 - d1 / 14), o = b.off; tracer(b.P.x + o.x * f0, b.P.y + o.y * f0, b.P.z + o.z * f0, E.x + o.x * f1, E.y + o.y * f1, E.z + o.z * f1, b.sup); } else tracer(b.P.x, b.P.y, b.P.z, E.x, E.y, E.z, b.sup); b.dist = d1; } // 1.ª pessoa: o rasto sai da ponta do cano e junta-se à linha da mira em 14 m
      if (ph && ph.s === s) { burst(E.x, E.y, E.z, 6, 0x7a1010, 2, 0.35); if (G.dbgShots) G.dbgShots.push({ k: 'p', zone: ph.zone }); bullets.splice(i, 1); continue; }
      if (hz) { if (G.dbgShots) G.dbgShots.push({ k: 'z', zone: hz.r.zone, n: b.skip ? b.skip.size : 0 }); const stop = hitZombie(hz.z, hz.r.zone, b, E.clone());
        // atravessa o corpo se a bala tiver força para isso (chumbo ao perto, bala única, espingardas): perde força e segue para o próximo
        const c = PENC[hz.r.zone] || 0.9; if (!stop && b.bp * Math.min(1, b.v.length() / (b.v0 || 1)) > c + 0.05) { b.bp -= c; b.dmg *= 0.7; b.v.multiplyScalar(0.85); (b.skip || (b.skip = new Set())).add(hz.z); b.P.copy(E); continue; }
        bullets.splice(i, 1); continue; }
      if (s < 1) { if (G.dbgShots) G.dbgShots.push({ k: 'w', e: [E.x, E.y, E.z] }); if (!b.pel || Math.random() < 0.4) burst(E.x, E.y, E.z, 4, 0xd8c8a0, 1.6, 0.3); noise(E.x, E.z, b.pel ? 3 : 6); bullets.splice(i, 1); continue; }
      b.P.copy(Q); if (b.t > 4 || b.P.y < -2 || (b.pel && b.dist > 160)) { if (G.dbgShots) G.dbgShots.push({ k: 'a' }); bullets.splice(i, 1); }
    }
  };
  // dano: munição, distância, zona do corpo e proteção (o colete/capacete trava se o nível dele for igual ou maior do que a perfuração da bala)
  const hitZombie = (z, zone, b, E) => {
    const fall = b.pel ? clamp(1 - b.dist / b.fall, 0.25, 1) : clamp(Math.pow(b.v.length() / (b.v0 || 1), 1.5), 0.3, 1);
    let dmg = b.dmg * fall * (0.9 + Math.random() * 0.2), stop = false;
    // travada: o impacto ainda magoa (cerca de 1/3) e gasta a proteção até ela ceder
    if (zone === 'head') { if (z.helm && b.pen <= z.helm) { z.hd = (z.hd ?? 20) - dmg; dmg *= 0.8; stop = true; if (z.hd <= 0) { z.helm = 0; burst(E.x, E.y + 0.1, E.z, 10, 0x55603e, 3, 0.5); } } else dmg = b.pel ? dmg * 3 : 999; }
    else if (zone === 'body') { if (z.vest && b.pen <= z.vest) { z.vd = (z.vd ?? 25) - dmg; dmg *= 0.8; stop = true; if (z.vd <= 0) { z.vest = 0; burst(E.x, E.y, E.z, 10, 0x3d4436, 3, 0.5); } } else if (z.vest) dmg *= 0.8; }
    else if (zone === 'arms') dmg *= 0.7;
    else { dmg *= 0.6; z.limp = Math.min(2, (z.limp || 0) + (b.pel ? 0.3 : 1)); }
    const l = Math.hypot(b.v.x, b.v.z) || 1; hurtZombie(z, dmg, b.v.x / l, b.v.z / l, { zone, stop, at: E, limp: zone === 'legs' ? (b.pel ? 0.3 : 1) : 0 });
    return stop;
  };
  // balística: gravidade e arrasto do ar (cada munição tem o seu). Tabela de queda por distância, calculada uma vez por munição e velocidade
  const BT = {};
  const btab = (k, v0) => { const key = k + ':' + v0; if (BT[key]) return BT[key]; const cd = ITEMS[k].bal.cd || 0.001, out = []; let x = 0, y = 0, vx = v0, vy = 0, t = 0, next = 0; const h = 1 / 500; while (x < 1100 && t < 6) { const v = Math.hypot(vx, vy); vx -= cd * v * vx * h; vy -= (cd * v * vy + 9.81) * h; x += vx * h; y += vy * h; t += h; if (x >= next) { out.push([x, y, Math.hypot(vx, vy)]); next += 20; } } return (BT[key] = out); };
  const dropAt = (k, v0, d) => { const T = btab(k, v0), i = clamp(Math.floor(d / 20), 0, T.length - 2), a = T[i], c = T[i + 1], f = clamp((d - a[0]) / (c[0] - a[0] || 1), 0, 1); return a[1] + (c[1] - a[1]) * f; };
  const elevFor = (k, v0, d) => d > 1 ? -dropAt(k, v0, d) / d : 0; // radianos a subir para acertar a d metros
  G.ballis = { dropAt, elevFor };
  const _sd = new THREE.Vector3(), _sr = new THREE.Vector3(), _su = new THREE.Vector3();
  // desvio: o da mão concentra-se perto do centro (a maior parte dos tiros vai onde apontas; de vez em quando um foge); o do chumbo espalha-se por igual no cone
  const spreadDir = (d, ang, even = false) => { if (ang <= 0) return d.clone(); _sr.crossVectors(d, _up).normalize(); if (_sr.lengthSq() < 1e-6) _sr.set(1, 0, 0); _su.crossVectors(_sr, d).normalize(); const a = Math.tan(ang * (even ? Math.sqrt(Math.random()) : Math.random())), ph = Math.random() * Math.PI * 2; return _sd.copy(d).addScaledVector(_sr, Math.cos(ph) * a).addScaledVector(_su, Math.sin(ph) * a).normalize().clone(); };
  const _wq = new THREE.Vector3();
  // até onde vai uma bala em linha reta: a primeira parede, ou o zombie que a segura (o servidor usa isto para não acertares num jogador escondido atrás de um zombie)
  const stopAt = (O, di, pen) => { _wq.copy(O).addScaledVector(di, 420); let s = wallHit(O, _wq), left = pen; const hs = []; for (const z of G.zs) { if (z.state === 'dead' || z.hide) continue; if (Math.abs(z.x - O.x) > 420 || Math.abs(z.z - O.z) > 420) continue; const r = zoneHit(z, O, _wq); if (r && r.s < s) hs.push(r); }
    hs.sort((a, b) => a.s - b.s); for (const r of hs) { const c = PENC[r.zone] || 0.9; if (left > c + 0.05) left -= c; else { s = r.s; break; } } return s * 420; };
  // som de cada arma (gravações reais) e o som da recarga
  const GSND = { pistola: 'pistola', revolver: 'revolver', smg: 'smg', m4: 'm4', ak: 'ak', cacadeira: 'cacadeira', caca: 'caca', cheytac: 'pesado', barrett: 'pesado', m249: 'm4', pkm: 'ak' };
  const reloadSnd = k => k === 'pistola' || k === 'revolver' ? 'recarregar-pistola' : k === 'cacadeira' ? 'recarregar-caca' : k === 'caca' || k === 'cheytac' ? 'ferrolho' : 'recarregar';
  let thinT = 0, thinN = -1; const thinL = [], THIN_D = 85; // pormenores: até 85 m na 1.ª pessoa (a neblina já os esconde a meio)
  const _mz2 = new THREE.Vector2(), _mz3 = new THREE.Vector3();
  G.vmMuzzle = v => vm.muzzleNDC(v); G.V2 = THREE.Vector2; G.Box3 = THREE.Box3;
  const fire = (it, g) => {
    const p = G.p; if (p.reload > 0 || p.cd > 0) return false;
    const AM = ammoOf(g); if (!it.ak || !AM.includes(it.ak)) it.ak = AM[0];
    if (it.ammo <= 0) { audio.play('vazio'); p.cd = 0.3; startReload(true); return false; }
    const B = ITEMS[it.ak].bal, sup = !!(it.att && it.att.sup), v0 = B.v * (g.vk || 1), n = B.pel || 1;
    it.ammo--; p.cd = g.cd; p.recoil = 1; G.combatT = G.t; p.fireT = G.t; p.sprint = false; // a disparar não se corre (volta a dar logo que paras)
    const AIM = G.aimS, fp = G.fp, hipF = fp && G.fpv.on && AIM.adsT < 0.5; // 1.ª pessoa sem apontar: tiro à anca (espalha como na vista de cima)
    const lo = (AIM.lean || 0) * LEAN, O = fp ? AIM.eye.clone() : new THREE.Vector3(p.x + Math.sin(p.yaw) * 0.15 + Math.cos(p.yaw) * lo, p.y + 1.35, p.z + Math.cos(p.yaw) * 0.15 - Math.sin(p.yaw) * lo);
    const dir = fp ? AIM.dir.clone() : AIM.Aw.clone().sub(O).normalize();
    { const scI = scopeItem(), zd = fp ? (hipF ? clamp(AIM.dist || 30, 5, 400) : scI && scI.rd ? 50 : it.zero || (scI && scI.mag >= 8 ? 200 : 100)) : Math.min(400, AIM.Aw.distanceTo(O)), el = elevFor(it.ak, v0, zd); if (el) { const hz = Math.hypot(dir.x, dir.z) || 1, a = Math.atan2(dir.y, hz) + el; dir.set(dir.x / hz * Math.cos(a), Math.sin(a), dir.z / hz * Math.cos(a)); } }
    const mv = Math.hypot(p.vx, p.vz) > 0.6 ? 1.5 : 1, spread = (G.dbgSpread ?? 1) * (p.stance === 2 ? 0.55 : p.stance === 1 ? 0.75 : 1) * (fp && !hipF ? (g.acc ?? g.spread * 0.2) * sightOf().acc * mv * (p.onGround ? 1 : 2) : g.spread * (1 - 0.6 * AIM.steady) * (1 - 0.2 * sk('mira')) * mv * (p.onGround ? 1 : 2)); // na luneta conta a precisão mecânica da arma; o resto é a tua mão (balanço e respiração)
    const D0 = spreadDir(dir, spread), ds = [];
    let MZ = null; if (fp && FPF.on && vm.muzzleNDC(_mz2)) { MZ = _mz3.set(_mz2.x, _mz2.y, 0.5).unproject(cam).sub(cam.position).normalize().multiplyScalar(0.75).add(cam.position); }
    for (let i = 0; i < n; i++) { const di = n > 1 ? spreadDir(D0, B.pat || 0, true) : D0; ds.push(di); bullets.push({ P: O.clone(), off: MZ ? MZ.clone().sub(O) : null, v: di.clone().multiplyScalar(v0), v0, cd: B.cd || 0.001, t: 0, dmg: B.dmg * (g.dk || 1), pen: B.pen, bp: B.bp ?? B.pen, pel: n > 1, fall: B.fall || 99, dist: 0, rng: g.rng, sup }); }
    AIM.steady *= 0.55; AIM.kick += (g.kick ?? (B.dmg > 60 ? 0.05 : 0.018)) * (1 - 0.35 * sk('mira')); AIM.idle = 0; skUp('mira', 0.0012);
    // som: o silenciador abafa o disparo; com bala subsónica quase não se ouve; supersónica ainda estala
    const ss = v0 > 343, nr = sup ? g.noise * (ss ? 0.5 : 0.2) : g.noise;
    const mx = MZ ? MZ.x : p.x + Math.sin(p.yaw) * 0.85, my = MZ ? MZ.y : p.y + 1.3, mz = MZ ? MZ.z : p.z + Math.cos(p.yaw) * 0.85;
    vm.fire(); flash.position.set(mx, my, mz); flash.intensity = sup ? 0 : 6 + 14 * (1 - (G.day ?? 1)); G.flashT = 0.06; G.buzz(n > 1 ? 30 : 10);
    if (sup) audio.play('abafado', ss ? 0.85 : 0.5); else if (!audio.shot(GSND[it.k] || 'pistola', 1, 0, { vary: 0.04 })) audio.play(ITEMS[it.k].heavy ? 'grosso' : g.auto ? 'm4' : 'pistola', it.k === 'cacadeira' || it.k === 'caca' ? 1.3 : 1);
    noise(p.x, p.z, nr);
    if (G.net && G.net.on) { const far = G.net.near(O.x, O.z, 420), Ls = ds.map(di => far ? stopAt(O, di, B.bp ?? B.pen) : 420); G.net.shot(O, dir, it.ak, n, Math.max(...Ls), sup, ds, Ls); }
    G.ui.refresh(true); return true;
  };
  // carregadores no inventário (mochila e cinto) de um tipo
  const clipsOf = k => { const out = []; for (const e of G.inv.bag.list) if (e.it.k === k) out.push(e.it); for (const b of G.inv.belt) if (b && b.k === k) out.push(b); return out; };
  G.clipsOf = clipsOf;
  // recarregar: com carregadores, troca pelo mais cheio (rápido); se não houver, enche o metido com balas soltas (lento)
  const startReload = quiet => {
    const it = held(); if (!it) return; const g = ITEMS[it.k].gun; if (!g || G.p.reload > 0) return; const AM = ammoOf(g), p = G.p;
    const pickAmmo = () => it.pref && AM.includes(it.pref) && G.inv.count(it.pref) > 0 ? it.pref : (G.inv.count(it.ak) > 0 ? it.ak : AM.find(k => G.inv.count(k) > 0));
    if (g.clip) {
      const cur = it.mg ? it.ammo : -1, best = clipsOf(g.clip).sort((a, b) => (b.am || 0) - (a.am || 0))[0];
      if (best && ((best.am || 0) > Math.max(0, cur) || !it.mg)) { p.reload = g.reload; p.reloadDur = g.reload; p.reloadMode = 'swap'; p.reloadMag = best; audio.play(reloadSnd(it.k)); return; }
      const want = pickAmmo();
      if (it.mg && want && (it.ammo < capOf(it) || want !== it.ak)) { const t = g.reload * 1.8; p.reload = t; p.reloadDur = t; p.reloadMode = 'fill'; p.reloadK = want; audio.play(reloadSnd(it.k)); if (!quiet) G.ui.toast('Sem carregador cheio: a encher este à mão'); return; }
      if (!it.mg) { G.ui.toast('Sem carregador para a ' + ITEMS[it.k].s); return; }
      if (it.ammo >= capOf(it)) return;
      G.ui.toast('Sem balas: ' + AM.map(k => ITEMS[k].s).join(' ou ')); return;
    }
    const want = pickAmmo();
    if (!want) { G.ui.toast('Sem balas: ' + AM.map(k => ITEMS[k].s).join(' ou ')); return; }
    if (it.ammo >= g.mag && want === it.ak) return;
    p.reload = g.reload; p.reloadDur = g.reload; p.reloadMode = 'fill'; p.reloadK = want; audio.play(reloadSnd(it.k));
  };
  // fim da recarga
  const doReload = () => { const p = G.p, it = held(); const g = it && ITEMS[it.k].gun; if (!g) return;
    if (p.reloadMode === 'swap' && p.reloadMag) { const m = p.reloadMag; p.reloadMag = null;
      const w = G.inv.where(m); if (!w) return; if (w.t === 'bag') G.inv.bag.remove(m); else if (w.t === 'belt') G.inv.belt[w.i] = null; else return;
      if (it.mg) { const old = mkItem(it.mg); old.am = it.ammo; old.ak = it.ak; const left = G.inv.give(old); if (left) { G.dropItem(old); G.ui.toast('Sem espaço: o carregador vazio ficou no chão'); } }
      it.mg = m.k; it.ammo = m.am || 0; if (m.ak) it.ak = m.ak; return; }
    const k = p.reloadK || it.ak; if (k !== it.ak && it.ammo > 0) { gain(it.ak, it.ammo); it.ammo = 0; } it.ak = k; const n = G.inv.take(k, capOf(it) - it.ammo); it.ammo += n; };
  G.reload = startReload;
  // ---------- explosivos: granada (lança-se) e C4 (cola-se e rebenta 10 s depois)
  const BOOMS = []; G.booms = BOOMS;
  const useOne = it => { it.n = (it.n || 1) - 1; if (it.n <= 0) { const i = G.inv.belt.indexOf(it); if (i >= 0) G.inv.belt[i] = null; else G.inv.bag.remove(it); } refresh(); };
  const gGeo = new THREE.SphereGeometry(0.07, 10, 8), gMat = new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.6 }), c4Geo = new THREE.BoxGeometry(0.28, 0.08, 0.16), c4Mat = new THREE.MeshStandardMaterial({ color: 0xb6a37a, roughness: 0.8 }), ledMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const ghostBoom = m => { const P = new THREE.Vector3(m.P[0], m.P[1], m.P[2]);
    if (m.k === 'gran') { const g = new THREE.Mesh(gGeo, gMat); g.castShadow = true; g.position.copy(P); scene.add(g); BOOMS.push({ k: 'gran', P, V: new THREE.Vector3(m.V[0], m.V[1], m.V[2]), t: 3.6, m: g, lv: m.lv || 0, base: m.base || 0, ghost: true }); return; }
    const g = new THREE.Group(); const b = new THREE.Mesh(c4Geo, c4Mat); b.castShadow = true; g.add(b); const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.03), ledMat); led.position.set(0.06, 0.05, 0); g.add(led); g.position.copy(P); g.rotation.y = m.yaw || 0; if (m.st) g.rotation.x = Math.PI / 2; scene.add(g);
    BOOMS.push({ k: 'c4', P, V: null, t: 11, m: g, led, lv: m.lv || 0, beep: 0, ghost: true }); };
  // a explosão de outro jogador: tira a granada ou o C4 que se estava a ver
  const ghostGone = (k, x, z) => { let bi = -1, bd = 5; BOOMS.forEach((B, i) => { if (!B.ghost || B.k !== k) return; const d = Math.hypot(B.P.x - x, B.P.z - z); if (d < bd) { bd = d; bi = i; } }); if (bi >= 0) { scene.remove(BOOMS[bi].m); BOOMS.splice(bi, 1); } };
  // lançar: o braço vai atrás e a granada sai a meio do gesto
  const throwGrenade = it => { const p = G.p; if (p.cd > 0 || p.thrT >= 0) return; p.cd = 0.8; p.thrT = 0; p.thrIt = it; };
  const releaseGrenade = it => { const p = G.p; const lv = p.lv || 0;
    const tx = AIM.on && AIM.Aw ? AIM.Aw.x : p.x + Math.sin(p.yaw) * 10, tz = AIM.on && AIM.Aw ? AIM.Aw.z : p.z + Math.cos(p.yaw) * 10;
    let dx = tx - p.x, dz = tz - p.z; const d = Math.min(22, Math.max(3, Math.hypot(dx, dz))); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const T = 0.55 + d / 22 * 0.75, h0 = 1.5 - 0.07, vy = (4.9 * T * T - h0) / T, dd = d * 0.88; const m = new THREE.Mesh(gGeo, gMat); m.castShadow = true; scene.add(m);
    const B1 = { k: 'gran', P: new THREE.Vector3(p.x + dx * 0.5, p.y + 1.5, p.z + dx * 0 + dz * 0.5), V: new THREE.Vector3(dx * dd / T, vy, dz * dd / T), t: 3.0, m, lv, base: p.base || 0 }; BOOMS.push(B1);
    if (G.net.world) G.net.raw({ t: 'thr', k: 'gran', P: [B1.P.x, B1.P.y, B1.P.z].map(v => +v.toFixed(2)), V: [B1.V.x, B1.V.y, B1.V.z].map(v => +v.toFixed(2)), lv, base: B1.base });
    useOne(it); audio.play('swing', 0.7); G.ui.toast('Granada! Afasta-te'); };
  const plantC4 = it => { const p = G.p; if (p.cd > 0) return; p.cd = 0.6; const lv = p.lv || 0, fx = p.x + Math.sin(p.yaw) * 0.9, fz = p.z + Math.cos(p.yaw) * 0.9;
    // cola na parede ou porta à frente (se houver)
    let x = p.x + Math.sin(p.yaw) * 0.7, z = p.z + Math.cos(p.yaw) * 0.7, y = (p.base || 0) + 1.0, stuck = false;
    const dist = ray(p.x, p.z, Math.sin(p.yaw), Math.cos(p.yaw), 1.6, null, 's', lv, 0.5); if (dist < 1.6) { x = p.x + Math.sin(p.yaw) * (dist - 0.12); z = p.z + Math.cos(p.yaw) * (dist - 0.12); stuck = true; } else y = (p.base || 0) + groundY(x, z, lv) + 0.04;
    const m = new THREE.Group(); const b = new THREE.Mesh(c4Geo, c4Mat); b.castShadow = true; m.add(b); const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.03), ledMat); led.position.set(0.06, 0.05, 0); m.add(led); m.position.set(x, y, z); m.rotation.y = p.yaw; if (stuck) { m.rotation.x = Math.PI / 2; } scene.add(m);
    BOOMS.push({ k: 'c4', P: new THREE.Vector3(x, y, z), V: null, t: 10, m, led, lv, beep: 0 }); if (G.net.world) G.net.raw({ t: 'thr', k: 'c4', P: [x, y, z].map(v => +v.toFixed(2)), yaw: +p.yaw.toFixed(2), st: stuck ? 1 : 0, lv }); useOne(it); audio.play('bip'); G.ui.toast('C4 colado: rebenta em 10 s'); };
  const EX = { gran: { r: 6.5, dmg: 140, br: 1.8, bdmg: 40, door: 60 }, c4: { r: 7.5, dmg: 260, br: 1.7, bdmg: 560, door: 560 } };
  const scorchGeo = new THREE.CircleGeometry(1, 20); scorchGeo.rotateX(-Math.PI / 2); const scorchMat = new THREE.MeshBasicMaterial({ color: 0x0c0b0a, transparent: true, opacity: 0.55, depthWrite: false });
  const explode = (B0) => { const X = EX[B0.k], P = B0.P, lv = B0.lv || 0, onl = G.net.world;
    // zombies e tu: menos se houver parede pelo meio
    if (!B0.remote) for (const z of G.zs) { if (z.state === 'dead' || (z.lv || 0) !== lv) continue; const d = Math.hypot(z.x - P.x, z.z - P.z); if (d > X.r) continue; const f = (1 - d / X.r) * (los(P.x, P.z, z.x, z.z, null, 's', lv) ? 1 : 0.3); const l = d || 1; hurtZombie(z, X.dmg * f, (z.x - P.x) / l * 3, (z.z - P.z) / l * 3, { zone: 'body', at: new THREE.Vector3(z.x, 1.1, z.z) }); }
    const p = G.p; if (p && p.alive && (p.lv || 0) === lv) { const d = Math.hypot(p.x - P.x, p.z - P.z); if (d < X.r && !B0.nd && !(G.ARENA && G.p.born != null && G.t - G.p.born < 2.5 && !(G.p.fireT > G.p.born))) { const f = (1 - d / X.r) * (los(P.x, P.z, p.x, p.z, null, 's', lv) ? 1 : 0.3); if (B0.by) G.killer = B0.by; hurtPlayer(X.dmg * 0.8 * f, 'explosao'); } G.shakeT = Math.max(G.shakeT || 0, 0.9 * (1 - Math.min(1, d / 40))); }
    // bases e portas trancadas
    if (lv === 0 && !onl && !B0.remote) G.base.damage(P.x, P.z, X.br, X.bdmg);
    const lk = []; if (!B0.remote) for (const D of W.doors) { if (!D.lock || D.lock.hp <= 0 || D.lv !== lv) continue; const d = Math.hypot(D.x - P.x, D.z - P.z); if (d > 2.6) continue; D.lock.hp -= X.door * (1 - d / 2.6 * 0.6); if (D.wid != null) lk.push([D.wid, Math.max(0, Math.round(D.lock.hp))]); if (D.lock.hp <= 0) { D.lock.hp = 0; D.lock.broke = Date.now(); setDoor(D, 1, false, true); G.ui.toast('A porta cedeu'); } }
    if (onl && !B0.remote) G.net.raw({ t: 'boom', k: B0.k, x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), lv, lk });
    // efeito: clarão, fogo, fumo, marca no chão e muito barulho
    flash.position.set(P.x, P.y + 1, P.z); flash.intensity = 60; G.flashT = 0.18; burst(P.x, P.y + 0.3, P.z, 50, 0xffb040, 9, 0.5); burst(P.x, P.y + 0.3, P.z, 40, 0x3a3632, 5, 1.6); burst(P.x, P.y, P.z, 30, 0x6a5a44, 7, 0.9);
    { const F = makeFire(B0.k === 'c4' ? 4.5 : 3.2, { sparks: 30, smokeH: 3 }); F.g.position.set(P.x, (B0.base || 0) + groundY(P.x, P.z, lv) + 0.05, P.z); scene.add(F.g); FIREB.push({ F, t: 0 }); } // bola de fogo que se apaga e deixa fumo
    const sc = new THREE.Mesh(scorchGeo, scorchMat.clone()); sc.scale.setScalar(B0.k === 'c4' ? 1.8 : 1.3); sc.position.set(P.x, (B0.base || 0) + groundY(P.x, P.z, lv) + 0.03, P.z); sc.renderOrder = 2; scene.add(sc); setTimeout(() => scene.remove(sc), 90000);
    audio.play('explosao', p ? clamp(1.1 - Math.hypot(p.x - P.x, p.z - P.z) / 120, 0.15, 1) : 1); noise(P.x, P.z, B0.k === 'c4' ? 120 : 70); G.buzz(B0.k === 'c4' ? 120 : 70); G.combatT = G.t; if (G.heardShot) G.heardShot();
  };
  const FIREB = [];
  const updBooms = dt => { for (let i = FIREB.length - 1; i >= 0; i--) { const q = FIREB[i]; q.t += dt; q.F.dim(Math.max(0, 1 - q.t / 1.3) ** 0.7); q.F.fade(q.t < 2 ? 1 : Math.max(0, 1 - (q.t - 2) / 2.5)); if (q.t > 4.5) { scene.remove(q.F.g); q.F.dispose(); FIREB.splice(i, 1); } } for (let i = BOOMS.length - 1; i >= 0; i--) { const B0 = BOOMS[i]; B0.t -= dt;
      if (B0.V) { B0.V.y -= 9.8 * dt; const Q = B0.P.clone().addScaledVector(B0.V, dt); const h = wallHit(B0.P, Q); if (h < 1) { B0.V.x *= -0.35; B0.V.z *= -0.35; Q.copy(B0.P); } const gy = (B0.base || 0) + groundY(Q.x, Q.z, B0.lv) + 0.07; if (Q.y < gy) { Q.y = gy; B0.V.y = Math.abs(B0.V.y) * 0.3; B0.V.x *= 0.55; B0.V.z *= 0.55; if (Math.abs(B0.V.y) < 0.6) B0.V.y = 0; } B0.P.copy(Q); B0.m.position.copy(B0.P); B0.m.rotation.x += dt * 8; }
      else if (B0.led) { B0.beep -= dt; const fast = B0.t < 3; if (B0.beep <= 0) { B0.beep = fast ? 0.25 : 1; const p = G.p; audio.play('bip', p ? clamp(1 - Math.hypot(p.x - B0.P.x, p.z - B0.P.z) / 30, 0, 1) : 0.5); B0.led.visible = true; } else if (B0.beep < (fast ? 0.15 : 0.8)) B0.led.visible = false; }
      if (B0.t <= 0) { scene.remove(B0.m); BOOMS.splice(i, 1); if (!B0.ghost) explode(B0); } } };
  // ---------- tempo: céu limpo quase sempre; chuvadas de 3 a 7 min de vez em quando, com trovoada quando é forte
  const WX = { t: 420 + Math.random() * 600, bolt: 30 }, wetBase = {};
  for (const k of ['asph', 'conc', 'tile', 'grass', 'dirt']) if (mats[k]) wetBase[k] = { c: mats[k].color.clone(), r: mats[k].roughness };
  const updWeather = dt => {
    if (G.playing && !G.net.world) { WX.t -= dt; if (WX.t <= 0) { if (G.rainT > 0) { G.rainT = 0; WX.t = 600 + Math.random() * 900; } else { G.rainT = 0.5 + Math.random() * 0.5; WX.t = 180 + Math.random() * 240; } } }
    if (G.ARENA) G.rainT = 0; // na arena não chove
    const r0 = G.rain || 0, tg = G.rainT || 0; G.rain = tg > r0 ? Math.min(tg, r0 + dt / 25) : Math.max(tg, r0 - dt / 35); const rn = G.rain;
    if (G.boltT > 0) G.boltT -= dt;
    if (rn > 0.7 && G.playing) { WX.bolt -= dt; if (WX.bolt <= 0) { WX.bolt = 25 + Math.random() * 50; G.boltT = 0.22; audio.thunder(0.6 + Math.random() * 0.4); } }
    // chão molhado: mais escuro e a brilhar um pouco
    if (Math.abs((WX.wet ?? -1) - rn) > 0.01) { WX.wet = rn; for (const k in wetBase) { const B = wetBase[k], m = mats[k]; m.color.copy(B.c).multiplyScalar(1 - 0.2 * rn); m.roughness = Math.max(0.35, B.r - (k === 'grass' || k === 'dirt' ? 0.15 : 0.5) * rn); } }
    const U = RAIN.U, on = rn > 0.02 && G.playing; RAIN.mesh.visible = on;
    if (on) { U.uT.value += dt; const c = G.fp && AIM.eye ? AIM.eye : camT; U.uC.value.set(c.x, (G.p ? (G.p.base || 0) : 0), c.z); U.uA.value = rn * (0.4 + 0.35 * (G.day ?? 1));
      const C = G.inside, rb = !C && G.p ? G.base.roofBox(G.p.x, G.p.z) : null; if (C) U.uIn.value.set(C.x0, C.z0, C.x1, C.z1); else if (rb) U.uIn.value.set(rb[0], rb[1], rb[2], rb[3]); else U.uIn.value.set(1, 1, -1, -1);
      audio.rain(rn, !!(C || rb)); }
    else audio.rain(0, false);
  };
  G.sectors = SECTORS;
  if (ARENA_ON) { SECTORS.tick = () => false; SECTORS.fill = () => { }; } // arena: sem floresta à volta (só a arena se desenha)
  // vilas e monumentos longe do centro: constrói o mais perto que falta (um por imagem) e larga os que ficaram longe
  // sliced (a jogar): no máximo ~4 ms por imagem a fazer malhas das zonas que se aproximam; sem isso (arranque, testes) faz tudo de uma vez
  const lazyTick = (px, pz, sliced = false) => { if (sliced && W.lazyStep(performance.now() + 4)) return true; let best = null, bd = 1e9; for (const L of W.lazy) { const d = Math.max(L.x0 - px, px - L.x1, L.z0 - pz, pz - L.z1, 0); if (L.meshes || L.job) { if (d > 430) W.lazyDrop(L); } else if (d < 250 && d < bd) { bd = d; best = L; } } if (best) { W.lazyBuild(best, sliced); return true; } return false; };
  G.lazyTick = lazyTick;
  // só para testes: vista de cima (ortográfica) de um quadrado de lado L à volta de (x, z), devolvida como imagem
  G.TR = { PRICE, SELL, TRADERS }; G.trade = tradeFn; npcInit(); G.npcs = npcs; initPWA(G);
  G.dbgDoors = () => W.doors; G.dbgW = W; G.dbgDie = c => die(c || 'teste'); G.vm = vm; G.horde = horde; G.dbgL = { torch, baseL, scene, cam }; G.dbgHurtZ = (z, d) => hurtZombie(z, d, 0, 0, {});
  G.dbgCam = (pos, at, fov = 30, w = 800, h = 600) => { const pc = new THREE.PerspectiveCamera(fov, w / h, 0.05, 300); pc.position.set(...pos); pc.lookAt(...at); const s0 = new THREE.Vector2(); renderer.getSize(s0); const r0 = renderer.getPixelRatio(); renderer.setPixelRatio(1); renderer.setSize(w, h, false); fireFrame(G.t, renderer, pc); renderer.render(scene, pc); const url = renderer.domElement.toDataURL('image/jpeg', 0.88); renderer.setPixelRatio(r0); renderer.setSize(s0.x, s0.y, false); return url; }; // testes: vista de perto
  G.dbgTop = (x, z, L, px = 900) => { for (let i = 0; i < 80 && lazyTick(x, z); i++); const oc = new THREE.OrthographicCamera(-L / 2, L / 2, L / 2, -L / 2, 1, 400); oc.position.set(x, 200, z + 0.01); oc.lookAt(x, 0, z); const s0 = new THREE.Vector2(); renderer.getSize(s0); const r0 = renderer.getPixelRatio(); renderer.setPixelRatio(1); renderer.setSize(px, px, false); const fg = scene.fog; scene.fog = null; renderer.render(scene, oc); scene.fog = fg; const url = renderer.domElement.toDataURL('image/jpeg', 0.85); renderer.setPixelRatio(r0); renderer.setSize(s0.x, s0.y, false); return url; };
  G.weather = (on = true) => { G.rainT = on ? 1 : 0; WX.t = on ? 300 : 900; };
  G.explodeAt = (k, x, z) => explode({ k, P: new THREE.Vector3(x, 0.5, z), lv: 0 });
  const swing = m => { const p = G.p; if (p.cd > 0 || p.use) return; p.cd = m.cd; p.swing = 0; p.swingM = m; p.swingHit = false; audio.play('swing', 0.8); };
  const meleeHit = m => {
    const p = G.p; let hit = 0;
    const tgt = G.zs.filter(z => z.state !== 'dead' && sameLevel(p, z)).map(z => ({ z, d: Math.hypot(z.x - p.x, z.z - p.z), a: Math.abs(angDiff(Math.atan2(z.x - p.x, z.z - p.z), p.yaw)) })).filter(o => o.d < m.rng + 0.35 && o.a < m.arc / 2 && los(p.x, p.z, o.z.x, o.z.z, null, 'sg', p.lv, 0.5)).sort((a, b) => a.d - b.d).slice(0, 2);
    // na 1.ª pessoa conta onde estás a olhar: a mira na cabeça dá golpe na cabeça (antes era sempre no corpo)
    const mEnd = G.fp ? _a.copy(AIM.eye).addScaledVector(AIM.dir, m.rng + 0.9) : null;
    for (const o of tgt) { const zh = mEnd ? zoneHit(o.z, AIM.eye, mEnd) : null, head = zh && zh.zone === 'head'; hurtZombie(o.z, m.dmg * (head ? 2 : 1) * (0.9 + Math.random() * 0.2), (o.z.x - p.x) / o.d, (o.z.z - p.z) / o.d, head ? { zone: 'head', at: zh.point || new THREE.Vector3(o.z.x, (o.z.y || 0) + 1.62, o.z.z) } : { at: new THREE.Vector3(o.z.x, (o.z.y || 0) + 1.25, o.z.z) }); hit++; }
    if (hit) { noise(p.x, p.z, 7); return; }
    let best = null, bd = 9;
    for (const n of nodes) { if (!n.alive || p.lv || n.pick) continue; const d = Math.hypot(n.x - p.x, n.z - p.z) - n.r; if (d > m.rng || d > bd) continue; const a = Math.abs(angDiff(Math.atan2(n.x - p.x, n.z - p.z), p.yaw)); if (a > 0.9) continue; best = n; bd = d; }
    if (!best) return;
    if (best.hp > 0 && !G.farm) { G.farm = best; if (!G.farmTip) { G.farmTip = 1; G.ui.toast('Continuas a bater até partir · mexe-te para parar'); } } // um golpe num recurso: continua sozinho
    const g = m.g, kind = best.kind; let k, n, extra = 0;
    if (kind === 'tree') { k = 'madeira'; n = g.wood; } else if (kind === 'stone') { k = 'pedraR'; n = g.stone; } else { k = kind === 'sulfur' ? 'enxofre' : 'metal'; n = g.ore; extra = Math.round(g.stone * 0.4); }
    n = Math.max(1, Math.min(n, best.hp)); best.hp -= n; best.shake = 0.25; { const f = n * 0.5 * sk('rec'); n += Math.floor(f) + (Math.random() < f % 1 ? 1 : 0); } skUp('rec', 0.0077);
    if (best.hp <= 0) { n += Math.round(best.max * 0.15); best.alive = false; best.col.on = false; best.respawn = G.t + 180; hideNode(best); if (G.net && G.net.on && best.key) G.net.node(best.key); }
    gain(k, n, best.key); if (extra) gain('pedraR', extra, best.key);
    const hx = best.x - Math.sin(p.yaw) * best.r * 0.6, hz = best.z - Math.cos(p.yaw) * best.r * 0.6;
    burst(hx, 1.0, hz, 6, kind === 'tree' ? 0xc9a877 : kind === 'sulfur' ? 0xe0c43a : kind === 'metal' ? 0x9a5a32 : 0x9a988f, 2.6, 0.5);
    audio.play(kind === 'tree' ? 'madeira' : 'rocha'); noise(p.x, p.z, 9);
  };
  const gain = (k, n, nk) => { if (nk && G.net.world) G.net.raw({ t: 'gt', k, n, nk }); const it = mkItem(k, n); const left = G.inv.give(it); if (left) { const g = new Grid(6, 4); g.insert(mkItem(k, left)); dropBag(G.p.x, G.p.z, g); G.ui.toast('Inventário cheio: ficou no chão'); } G.ui.feed(k, n - left); G.ui.refresh(); };
  G.gain = gain;
  const _hm = new THREE.Matrix4(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const hideNode = n => { n.mesh.setMatrixAt(n.idx, _zero); n.mesh.instanceMatrix.needsUpdate = true; };
  const showNode = n => { n.mesh.setMatrixAt(n.idx, n.m0); n.mesh.instanceMatrix.needsUpdate = true; };
  const startUse = it => {
    const p = G.p, d = ITEMS[it.k]; if (!d.use || p.use) return;
    const u = d.use; if (!u.bleed && !u.hp && ((u.food && p.food > 97) || (u.water && !u.food && p.water > 97))) { G.ui.toast('Não precisas agora'); return; }
    if (u.hp && !u.food && p.hp >= 100 && !p.bleed) { G.ui.toast('Estás com a vida cheia'); return; }
    p.use = { it, t: 0, dur: u.t }; audio.play(u.food || u.water ? 'comer' : 'apanhar');
  };
  G.use = startUse;
  const swapItem = (it, k) => { const w = G.inv.where(it); if (!w) return null; const nw = mkItem(k); if (it.n > 1) { it.n--; const left = G.inv.give(nw); if (left) G.dropItem(nw); return nw; } if (w.t === 'belt') G.inv.belt[w.i] = nw; else { G.inv.bag.remove(it); const left = G.inv.give(nw); if (left) G.dropItem(nw); } return nw; };
  const consume = it => { it.n--; if (it.n <= 0) { const w = G.inv.where(it); if (!w) return; if (w.t === 'bag') G.inv.bag.remove(it); else if (w.t === 'belt') G.inv.belt[w.i] = null; } };
  const attack = () => { if (!G.p.alive || G.invOpen) return; const it = held(), d = heldDef(); if (d.gun) return; else if (d.melee) swing(d.melee); else if (d.use) startUse(it); else swing(FISTS.melee); };

  // sacos no chão
  const dropBag = (x, z, grid, o = {}) => {
    if (G.net && G.net.world && !o.net) { if (!grid.empty) G.net.bag(x, z, o.y ?? groundY(x, z), o.lv ?? 0, encG(grid)); return null; }
    if (!o.net) for (const b of G.bags) if (!o.body && !b.body && (b.lv || 0) === (o.lv ?? 0) && Math.hypot(b.x - x, b.z - z) < 1.6) { for (const e of [...grid.list]) b.grid.insert(e.it); return b; }
    const lv = o.lv ?? 0, y0 = o.y ?? groundY(x, z); const m = (o.crate ? crateM : o.body ? bodyBagM : bagM).clone(); m.position.set(x + (o.body || o.crate ? 0 : (Math.random() - 0.5) * 0.4), y0, z + (o.body || o.crate ? 0 : (Math.random() - 0.5) * 0.4)); m.rotation.y = Math.random() * 6; scene.add(m);
    const b = { x, z, grid, mesh: m, label: o.label || (o.body ? 'Revistar o teu corpo' : 'Revistar saco'), body: !!o.body, crate: !!o.crate, t: G.t, bag: true, lv, nid: o.nid, mine: o.mine }; G.bags.push(b); return b;
  };
  // ---------- lançamento aéreo: aviso com zona no mapa, avião caído com fogo e fumo, caixas com o melhor loot
  const crateM = (() => { const g = new THREE.Group(), M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }), mB = M(0x4a5a32), mS = M(0x2c3620);
    const box = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); };
    box(1.3, 0.85, 0.95, 0, 0.43, 0, mB); for (const y of [0.1, 0.8]) box(1.34, 0.1, 0.99, 0, y, 0, mS); for (const x of [-0.45, 0.45]) box(0.1, 0.87, 0.99, x, 0.43, 0, mS);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.2) })); f.position.set(0.5, 0.95, 0.3); f.rotation.z = 0.6; g.add(f); return g; })();
  const puffTex = ctex(64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 2, 32, 32, 31); g.addColorStop(0, 'rgba(60,58,54,.9)'); g.addColorStop(1, 'rgba(60,58,54,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }, false);
  let wreck = null;
  const wreckMake = (x, z, yaw) => { const g = new THREE.Group(), M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.2 }), body = M(0xb8b6ae), burnt = M(0x2a2826);
    const add = (geo, m, px, py, pz, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.rotation.set(rx, ry, rz); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    add(new THREE.CylinderGeometry(1.7, 1.7, 11, 14), body, 0, 1.5, 2, Math.PI / 2 - 0.08, 0, 0.05); add(new THREE.CylinderGeometry(1.7, 1.4, 7, 14), burnt, 1.2, 1.3, -8, Math.PI / 2 + 0.1, 0.35, -0.2);
    add(new THREE.BoxGeometry(13, 0.3, 2.6), body, -6, 0.6, 1.5, 0, 0.2, 0.18); add(new THREE.BoxGeometry(0.3, 3.4, 2.6), M(0x8a2a22), 1.6, 2.8, -11, 0.2, 0.35, 0.3); add(new THREE.CylinderGeometry(0.8, 0.8, 2.6, 10), burnt, 4.5, 0.8, 4, Math.PI / 2, 0.6, 0);
    const sc = new THREE.Mesh(new THREE.CircleGeometry(13, 24), new THREE.MeshStandardMaterial({ color: 0x1e1c18, roughness: 1, transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -2 })); sc.rotation.x = -Math.PI / 2; sc.position.y = 0.04; g.add(sc);
    const fire = new THREE.PointLight(0xff7a2a, 30, 22, 1.6); fire.position.set(0.5, 2.5, -3); g.add(fire);
    const flames = []; for (let i = 0; i < 4; i++) { const F = makeFire(2.6 + (i % 2) * 0.8, { smoke: 0, sparks: 14 }); F.g.position.set(-1 + i * 0.9, 2.75, -4 + i * 1.4); g.add(F.g); flames.push(F); }
    const puffs = []; for (let i = 0; i < 9; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false })); s.userData.t = i / 9; g.add(s); puffs.push(s); }
    g.position.set(x, 0, z); g.rotation.y = yaw; scene.add(g);
    const c = Math.cos(yaw), s = Math.sin(yaw), R = []; for (const [lx, lz, hw, hd] of [[0, 2, 1.7, 5.5], [1.2, -8, 1.6, 3.5]]) { const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c, a = Math.abs(c), b2 = Math.abs(s), ex = hw * a + hd * b2, ez = hw * b2 + hd * a, r = { x0: wx - ex, z0: wz - ez, x1: wx + ex, z1: wz + ez, k: 's', h: 3, lv: 0 }; addRect(r); R.push(r); }
    return { g, fire, flames, puffs, R, x, z }; };
  const wreckDrop = () => { if (!wreck) return; scene.remove(wreck.g); wreck.flames.forEach(F => F.dispose()); wreck.g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); wreck.R.forEach(removeRect); wreck = null; };
  G.drop = { warn: null, cur: null };
  G.airdrop = m => { const D = G.drop, now = Date.now();
    if (m.ph === 9) { D.warn = m.warn ? { mx: m.warn.mx, mz: m.warn.mz, at: now + (m.warn.at - m.warn.now) } : null; D.cur = m.cur || null; wreckDrop(); if (D.cur) wreck = wreckMake(D.cur.x, D.cur.z, D.cur.yaw); return; }
    if (m.ph === 1) { D.warn = { mx: m.mx, mz: m.mz, at: now + (m.at - m.now) }; const s = Math.round((m.at - m.now) / 1000), p = G.p, d = p ? Math.round(Math.hypot(m.mx - p.x, m.mz - p.z) / 100) / 10 : 0; G.ui.toast('Um avião vai cair daqui a ' + s + ' s, a ' + String(d).replace('.', ',') + ' km. A zona está no mapa.'); audio.play('bip'); return; }
    if (m.ph === 2) { D.warn = null; D.cur = { x: m.x, z: m.z, yaw: m.yaw, t: now }; wreckDrop(); wreck = wreckMake(m.x, m.z, m.yaw); const p = G.p, d = p ? Math.hypot(m.x - p.x, m.z - p.z) : 1e9; audio.play('explosao', clamp(1.1 - d / 900, 0.12, 1)); if (d < 400) { G.shakeT = Math.max(G.shakeT || 0, 0.5 * (1 - d / 400)); } G.ui.toast('O avião caiu. Há caixas com loot militar no sítio marcado no mapa.'); return; }
    if (m.ph === 0) { D.cur = null; wreckDrop(); } };
  const wreckTick = dt => { if (!wreck) return; const t = G.t; wreck.fire.intensity = 24 + Math.sin(t * 13) * 6 + Math.sin(t * 7.3) * 5; 
    for (const s of wreck.puffs) { const u = s.userData; u.t = (u.t + dt / 7) % 1; const k = u.t; s.position.set(-1 + Math.sin(k * 5 + u.t) * 0.8 + k * 4, 2 + k * 18, -4 + k * 3); s.scale.setScalar(2 + k * 9); s.material.opacity = (1 - k) * 0.55 * Math.min(1, k * 6); } };
  G.dropGrid = (x, z, g) => dropBag(x, z, g);
  G.dropItem = it => { const g = new Grid(6, 4); g.insert(it); const p = G.p; dropBag(p.x + Math.sin(p.yaw) * 0.6, p.z + Math.cos(p.yaw) * 0.6, g, { lv: p.lv, y: p.base + groundY(p.x, p.z, p.lv) }); };
  const openBox = c => {
    if (G.net && G.net.world && (c.nid || c.did || (c.wid != null && !c.own))) { G.net.open(c); return; } // online: a caixa vem do servidor (só uma pessoa de cada vez)
    if (!c.bag && !c.own) { if (!c.grid) { c.grid = new Grid(c.slots[0], c.slots[1]); rollLoot(c.table, c.grid); c.next = G.t + 300; } else if (G.t > c.next && c.grid.list.length < 2) { rollLoot(c.table, c.grid); c.next = G.t + 300; } }
    G.box = c; G.ui.openInv(c);
  };
  const DOGFOOD = ['carneC', 'carneA', 'lata', 'sardinhas', 'racao', 'onigiri'];
  G.interact = () => { const pr = G.prompt; if (!pr) return;
    if (pr.trader) { G.ui.trOpen(pr.trader); return; }
    if (pr.pickN) { const n = pr.pickN; if (!n.alive) return; n.alive = false; n.col.on = false; n.respawn = G.t + 180; hideNode(n); if (G.net && G.net.on && n.key) G.net.node(n.key); if (n.kind === 'seixo') { gain('pedra', 1, n.key); G.ui.toast('Apanhaste uma pedra'); } else { const q = 2 + (Math.random() < 0.5 ? 1 : 0); gain('tecido', q, n.key); G.ui.toast('Colheste ' + q + ' de tecido'); } audio.play('apanhar'); return; }
    if (pr.dog) { const z = pr.dog; if (z.pet) { z.stay = !z.stay; z.prey = null; G.ui.toast(z.stay ? 'O cão fica aqui à tua espera' : 'O cão vem contigo'); audio.play('ladrar', 0.5); return; }
      if (!pr.food) { G.ui.toast('Precisas de comida (carne, latas, ração) para o adotar'); return; }
      G.inv.take(pr.food, 1); G.ui.refresh(true); if (G.net.world && z.nid != null) G.net.raw({ t: 'adopt', i: z.nid }); z.pet = G.net.world ? G.net.uid : 'local'; z.state = 'wander'; z.prey = null; z.stay = false;
      audio.play('ladrar', 0.8); G.ui.toast('O cão confia em ti: segue-te, ladra quando vem alguém e ataca zombies'); return; } if (pr.drink) { G.p.water = Math.min(100, G.p.water + 20); audio.play('comer'); G.ui.toast('Bebeste água'); G.ui.refresh && G.ui.refresh(true); return; } if (pr.lockPut && G.lockT) { G.ui.lockMenu(G.lockT); return; } if (pr.pumpFill) { const h = held(); if (h && h.k === 'galaoV') { swapItem(h, 'gasolina'); if (G.net.world) G.net.raw({ t: 'gf' }); audio.play('apanhar'); G.ui.toast('Galão cheio: 20 L'); refresh(); G.ui.refresh(true); } return; }
      if (pr.carPump) { const c = G.car, T = VT[c.k]; c.fuel = T.tank; if (G.net.world) G.net.raw({ t: 'cfp', id: c.id }); audio.play('apanhar'); G.ui.toast('Depósito cheio: ' + T.tank + ' L'); return; } if (pr.carExit) { G.cars.exit(); return; } if (pr.car) { if (pr.full) return; if (pr.fuel) { const h = held(); if (h && h.k === 'gasolina' && G.cars.refuel(pr.car, h)) { swapItem(h, 'galaoV'); refresh(); G.ui.refresh(true); } return; } G.cars.enter(pr.car); return; } if (pr.own && pr.bed) { G.base.use(pr); return; } if (pr.own && pr.bench) { G.box = null; G.ui.openInv(null, 'craft'); return; } if (pr.door) { const D = pr.door; if (D.lock && D.lock.hp > 0) { G.ui.toast('Trancada. Só abre com explosivos (' + Math.round(D.lock.hp / D.lock.max * 100) + '%)'); audio.play('vazio'); return; } if (!setDoor(D, D.target ? 0 : 1)) G.ui.toast('Está alguém na porta'); return; } openBox(pr); };

  // ---------- zombies
  await LP(90, 'a espalhar os zombies');
  const zoneAt = (x, z) => { if (inCity(x, z)) return W.zones[0]; let best = null; for (const zn of W.zones) { if (zn.kind === 'city') continue; const d = Math.hypot(x - zn.x, z - zn.z); if (d < zn.r && (!best || zn.r < best.r)) best = zn; } return best; };
  G.zoneAt = zoneAt;
  const zAt = (x, z) => ({ x, z, yaw: Math.random() * 6.28, hp: 80, state: 'wander', tx: x, tz: z, think: Math.random() * 0.3, phase: Math.random() * 6, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 2 + Math.random() * 5, sc: 0.95 + Math.random() * 0.12, lx: x, lz: z, wT: 0, spd: 0.86 + Math.random() * 0.26, lv: 0, base: 0 });
  // população fixa: cada zombie tem a sua casa (zona) e fica lá; guardada com o jogo
  const mkZ = (x, z) => { const zb = zAt(x, z), zn = zoneAt(x, z); zb.hx = x; zb.hz = z; zb.reT = 360 + Math.random() * 300;
    if (zn && zn.kind === 'mil' && Math.random() < 0.55) { zb.kind = 'mil'; zb.helm = 2; zb.vest = Math.random() < 0.6 ? 2 : 3; zb.hp = 70; } else if (zn && zn.kind === 'city' && Math.random() < 0.12) { zb.kind = 'pol'; zb.vest = 2; zb.helm = Math.random() < 0.4 ? 2 : 0; zb.hp = 75; } armDur(zb);
    zb.hpMax = zb.hp; return zb; };
  const reviveZ = z => { Object.assign(z, { x: z.hx, z: z.hz, hp: z.hpMax || 80, state: 'wander', deadT: 0, sink: 0, limp: 0, lv: 0, base: 0, st: null, bld: null, tx: z.hx, tz: z.hz, lost: 0, mem: 0, atkT: 0, head: false, reT: 360 + Math.random() * 300 }); if (z.helm0 != null) { z.helm = z.helm0; z.vest = z.vest0; } armDur(z); };
  const mkA = (an, x, z, o = {}) => { const a = zAt(x, z), S = ANK[an]; Object.assign(a, { an, hp: S.hp, hpMax: S.hp, hx: x, hz: z, reT: 300 + Math.random() * 300, pack: o.pack || 0, pet: o.pet || null }); return a; };
  const popAnimals = () => spawnAnimals(W, (x, z) => !solidAt(x, z, 0.8) && !W.wet(x, z, 2) && !inCity(x, z), MAP).map(a => mkA(a.an, a.x, a.z, a));
  G.popAnimals = popAnimals;
  const popWorld = () => {
    G.zs.length = 0;
    const add = (cx, cz, r, n) => { for (let k = 0, made = 0; k < n * 8 && made < n; k++) { const a = Math.random() * 6.28, rr0 = Math.sqrt(Math.random()) * r, x = cx + Math.sin(a) * rr0, z = cz + Math.cos(a) * rr0; if (Math.abs(x) > MAP - 3 || Math.abs(z) > MAP - 3 || solidAt(x, z, 0.5) || W.wet(x, z, 1)) continue; G.zs.push(mkZ(x, z)); made++; } };
    for (const zn of W.zones) add(zn.x, zn.z, zn.kind === 'city' ? 46 : Math.max(10, zn.r), zn.nz ?? { city: 42, mil: 24, town: 16, mon: 9, cabin: 2 }[zn.kind] ?? 6);
    add(0, 0, CORE - 8, 40); // espalhados pela floresta
    // floresta do mundo de fora: poucos, espalhados
    for (let k = 0, made = 0; k < 2000 && made < 160; k++) { const x = (Math.random() * 2 - 1) * (MAP - 20), z = (Math.random() * 2 - 1) * (MAP - 20); if (Math.max(Math.abs(x), Math.abs(z)) < CORE + 30) continue; add(x, z, 4, 1); made++; }
    G.zs.push(...G.popAnimals());
  };
  G.popWorld = popWorld;
  const spawnZ = (cx, cz, r0, r1) => { for (let k = 0; k < 12; k++) { const a = Math.random() * 6.28, r = r0 + Math.random() * (r1 - r0), x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r; if (Math.abs(x) > MAP - 3 || Math.abs(z) > MAP - 3 || solidAt(x, z, 0.5) || W.wet(x, z, 1)) continue; const zb = zAt(x, z), zn = zoneAt(x, z);
      // soldados na base militar (capacete IIIA e colete III); polícias na cidade (colete IIIA)
      if (zn && zn.kind === 'mil' && Math.random() < 0.55) { zb.kind = 'mil'; zb.helm = 2; zb.vest = Math.random() < 0.6 ? 2 : 3; zb.hp = 70; } else if (zn && zn.kind === 'city' && Math.random() < 0.12) { zb.kind = 'pol'; zb.vest = 2; zb.helm = Math.random() < 0.4 ? 2 : 0; zb.hp = 75; } armDur(zb);
      G.zs.push(zb); return true; } return false; };
  // online: um zombie que outro jogador simula — anda para onde ele diz (com 120 ms de atraso, para ficar suave)
  // passada: devagar, passos curtos e frequentes (arrastar os pés); a correr, passadas compridas
  const zStride = v => 2.6 + 4 / (0.5 + Math.min(4, v));
  const ZST = ['wander', 'alert', 'chase', 'dead', 'chase'];
  const wallFix = z => { const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw), f = ray(z.x, z.z, fx, fz, 1.0, null, 's', z.lv || 0, 1.2); if (f < 0.4) { z.x -= fx * (0.4 - f); z.z -= fz * (0.4 - f); } z.wallK = clamp((0.95 - f) / 0.5, 0, 1); };
  const remoteZ = (z, dt, now) => {
    if (z.hitT > 0) z.hitT -= dt;
    if (z.state === 'dead') { z.deadT += dt; if (z.deadT > 25) z.sink = Math.min(0.6, z.sink + dt * 0.25); return; }
    if (!z.T) return; const S = sample(z.T, now, z.o || (z.o = {})); if (!S) return; const nx = S.x, nz = S.z, moved = Math.hypot(nx - z.x, nz - z.z);
    if (moved > 8) { z.x = nx; z.z = nz; } else { z.x = nx; z.z = nz; z.phase += moved * zStride(moved / Math.max(dt, 1e-3)); }
    const b = S.s; z.yaw = S.yaw; z.mv = b.mv; z.lv = b.lv;
    if (!z.hide) { const f = ray(z.x, z.z, Math.sin(z.yaw), Math.cos(z.yaw), 1.0, null, 's', z.lv || 0, 1.2); z.wallK = clamp((0.95 - f) / 0.5, 0, 1); }
    if (b.st === 4 && z.lastSt !== 4) z.atkT = 0.6; z.lastSt = b.st; z.state = ZST[b.st] || 'wander'; if (z.atkT > 0) z.atkT -= dt;
    stairUpdate(z); z.y = (z.base || 0) + groundY(z.x, z.z, z.lv || 0);
  };
  const updZombies = dt0 => {
    navBudget = 2;
    const me = G.p, onl = G.net.world, now = performance.now();
    // quem os zombies podem perseguir: tu e, online, os outros jogadores vivos por perto
    // dentro de um helicóptero ninguém é atacado (nem por zombies nem por animais)
    const inHeli = id => G.cars.list.some(c => VT[c.k].fly && c.seats.includes(id));
    const tgts = me && G.playing && !(G.car && VT[G.car.k].fly) ? [me] : [];
    if (onl) for (const r of G.net.R.values()) { const b = r.s1; if (!b || !b[10] || b[11] || (b[7] === 8 && inHeli(r.id))) continue; const t = r.tg || (r.tg = { remote: true, rid: r.id, alive: true, h: 0 }); t.x = r.x; t.z = r.z; t.gh = !!r.gh; t.lv = b[4] || 0; t.base = Math.max(0, (r.y || 0) - groundY(r.x, r.z, t.lv)); t.sprint = b[6] > 1.3; tgts.push(t); }
    // animais: quem podem atacar (jogadores e cães) e o que precisam do mundo
    const myUid = onl ? G.net.uid : 'local', pets = []; for (const o of G.zs) if (o.an === 'cao' && o.pet && o.state !== 'dead') { o.alive = true; o.h = 0; pets.push(o); }
    const nz = G.lastNoise && G.t - G.lastNoise.t < 0.4 ? G.lastNoise : null;
    const AC = { tgts: pets.length ? [...tgts, ...pets] : tgts, me, zs: G.zs, collide, wet: (x, z) => W.wet(x, z, 0.5), night: (G.day ?? 1) < 0.35, noiseAt: nz,
      ghillie: t => t === me ? !!G.inv.eq.suit : !!t.gh,
      ownerOf: a => a.pet === myUid && me && me.alive ? { x: me.x, z: me.z, yaw: me.root, lv: me.lv } : null,
      hurtTarget: (a, t, dm) => { if (t === me) hurtPlayer(dm, a.an); else if (t.remote) G.net.zatk(a.nid, t.rid, dm); else if (t.an) hurtZombie(t, dm, Math.sin(a.yaw), Math.cos(a.yaw), { quiet: true }); audio.play(a.an === 'lobo' || a.an === 'cao' ? 'rosnar' : 'pancada', vol(a.x, a.z)); },
      hurtZ: (t, a, dm) => { hurtZombie(t, dm, Math.sin(a.yaw), Math.cos(a.yaw), { quiet: true, by: a }); audio.play('rosnar', 0.7 * vol(a.x, a.z)); },
      bark: (a, why) => { audio.play('ladrar', vol(a.x, a.z)); if (me) G.ui.sound(why.x, why.z, why.an || why.remote ? 'p' : 'z', Math.hypot(why.x - me.x, why.z - me.z)); },
      howl: a => { if (me && Math.hypot(a.x - me.x, a.z - me.z) < 120) { audio.play('uivo', vol(a.x, a.z) * 1.6); G.ui.sound(a.x, a.z, 'z', Math.hypot(a.x - me.x, a.z - me.z)); } },
      // caminho à volta das paredes (como os zombies): a direito se der, senão pelos cantos de um A*
      route: (a, tx, tz, dt) => { if (Math.hypot(tx - a.x, tz - a.z) < 1.2) { a.path = null; return [tx, tz]; } a.navT = (a.navT || 0) - dt;
        if (a.navT <= 0) { a.navT = 0.5 + Math.random() * 0.3; if (walkLine(a.x, a.z, tx, tz, 0)) a.path = null; else if (navBudget > 0 && (!a.path || Math.hypot(tx - a.pgx, tz - a.pgz) > 3)) { navBudget--; const r = nav.find(a.x, a.z, tx, tz, 0); a.path = r.pts; a.pi = 0; a.pgx = tx; a.pgz = tz; } }
        if (a.path) { let wp = a.path[a.pi]; while (wp && a.pi < a.path.length - 1 && Math.hypot(wp[0] - a.x, wp[1] - a.z) < 0.7) { a.pi++; wp = a.path[a.pi]; } if (wp) return [wp[0], wp[1]]; } return [tx, tz]; },
      pack: a => a.pack ? G.zs.filter(o => o !== a && o.an === 'lobo' && o.pack === a.pack && !o.remote && o.state !== 'dead' && Math.hypot(o.x - a.x, o.z - a.z) < 40) : [] };
    // sons dos animais por perto (de todos, mesmo os que outro jogador simula): galinhas, javalis, cães vadios; lobos à noite de longe
    if (me) for (const a of G.zs) { if (!a.an || a.state === 'dead') continue; const d = Math.abs(a.x - me.x) + Math.abs(a.z - me.z); if (d > 140) continue; a.sndT = (a.sndT ?? Math.random() * 10) - dt0; if (a.sndT > 0) continue; a.sndT = 7 + Math.random() * 12;
      const dd = Math.hypot(a.x - me.x, a.z - me.z), snd = a.an === 'galinha' ? ['galinha', 20] : a.an === 'javali' ? ['javali', 22] : a.an === 'cao' && !a.pet ? ['ladrar', 35] : a.an === 'lobo' && (G.day ?? 1) < 0.35 && Math.random() < 0.3 ? ['uivo', 140] : null;
      if (snd && dd < snd[1]) { audio.play(snd[0], 0.8 * Math.max(0.15, 1 - dd / snd[1])); if (a.an === 'lobo' || a.an === 'cao') G.ui.sound(a.x, a.z, 'z', dd); } }
    for (let i = G.zs.length - 1; i >= 0; i--) {
      const z = G.zs[i];
      if (z.remote) { remoteZ(z, dt0, now); continue; }
      if (z.an && z.state !== 'dead') { if (z.frz !== undefined) { z.phase = (z.phase || 0) + dt0 * z.frz * zStride(z.frz); z.mv = z.frz / 3; z.y = groundY(z.x, z.z, 0); continue; }
        if (!z.pet && me && Math.hypot(me.x - z.x, me.z - z.z) > 160) { z.acc = (z.acc || 0) + dt0; if (z.acc < 0.6) continue; animalAI(z, z.acc, AC); z.acc = 0; } else animalAI(z, dt0, AC);
        z.y = groundY(z.x, z.z, 0); continue; }
      // testes: zombie parado no sítio (frz = velocidade a fingir, para a animação de andar)
      if (z.frz !== undefined) { z.phase = (z.phase || 0) + dt0 * z.frz * zStride(z.frz); z.mv = z.frz / 3; wallFix(z); continue; }
      // morto: o corpo fica, afunda devagar e o zombie volta a nascer na zona dele passados uns minutos, longe da tua vista (online, quem decide é o servidor)
      if (z.state === 'dead') { z.deadT += dt0; if (z.deadT > 25) z.sink = Math.min(0.6, z.sink + dt0 * 0.25); if (!onl && z.deadT > (z.reT || 480) && Math.hypot((z.hx ?? z.x) - me.x, (z.hz ?? z.z) - me.z) > 70) reviveZ(z); continue; }
      let p = me; if (tgts.length > 1) { let bq = 1e9; for (const t of tgts) { if (!t.alive) continue; const q = Math.hypot(t.x - z.x, t.z - z.z) + ((t.lv || 0) !== (z.lv || 0) ? 25 : 0); if (q < bq) { bq = q; p = t; } } }
      if (z.aggro) { const a = z.aggro; if (a.state === 'dead' || Math.hypot(a.x - z.x, a.z - z.z) > 8) z.aggro = null; else { p = a; a.alive = true; a.h = 0; a.lv = a.lv || 0; z.state = 'chase'; } }
      const dMe = me ? Math.hypot(me.x - z.x, me.z - z.z) : 99;
      const dx = p.x - z.x, dz = p.z - z.z, d = Math.hypot(dx, dz), zl = z.lv || 0, same = zl === p.lv;
      // longe de ti e fora da vista pensa menos vezes (mais leve); à vista (por exemplo na luneta) anda a cada imagem, sem saltos
      let dt = dt0; const thr = z.state === 'chase' || !z.hide ? 0 : d > 90 ? 0.5 : z.state === 'wander' && d > 25 ? 0.2 : 0; /* fora da vista e a vaguear: pensa e anda 5 vezes por segundo (ninguém vê a diferença; poupa o telemóvel na cidade) */ if (thr) { z.acc = (z.acc || 0) + dt0; if (z.acc < thr) continue; dt = z.acc; z.acc = 0; } else z.acc = 0;
      z.think -= dt;
      if (z.think <= 0) {
        z.think = 0.22 + Math.random() * 0.12;
        const face = Math.abs(angDiff(Math.atan2(dx, dz), z.yaw)) < 1.05;
        const sr = (6 + 4 * (G.day ?? 1) + (p === me && G.lightOn ? 8 : 0)) * ((p === me ? G.inv.eq.suit : p.gh) ? 0.6 : 1); /* ghillie: só te veem mais perto */ const sees = p.alive && G.playing && !(p === me && G.admF && G.admF.spec) && d < sr && (d < 3.5 || face) && canSee(z, p); z.sees = sees;
        if (sees) { if (z.state !== 'chase') { audio.play('grunhido', 0.8 * vol(z.x, z.z)); G.ui.sound(z.x, z.z, 'z', dMe); } z.state = 'chase'; z.tx = p.x; z.tz = p.z; z.lost = 0; z.mem = 6; }
        else if (z.state === 'chase') { z.lost += 0.28; if (z.lost > 3.2 || !p.alive) { z.state = 'alert'; } }
        if (p.alive && p.sprint && d < 7 && same && z.state === 'wander') { z.state = 'alert'; z.tx = p.x; z.tz = p.z; }
      }
      z.mem = Math.max(0, (z.mem || 0) - dt);
      let tx = z.tx, tz = z.tz, sp = 0.6;
      if (z.state === 'wander') { z.wT -= dt; if (z.wT <= 0) { z.wT = 3 + Math.random() * 5; const hx = z.hx ?? z.x, hz = z.hz ?? z.z, far = Math.hypot(z.x - hx, z.z - hz) > 14; z.tx = (far ? hx : z.x) + (Math.random() - 0.5) * 12; z.tz = (far ? hz : z.z) + (Math.random() - 0.5) * 12; } sp = Math.hypot(z.tx - z.x, z.tz - z.z) > 0.6 ? 0.55 : 0; }
      else if (z.state === 'alert') { sp = 1.5; if (Math.hypot(tx - z.x, tz - z.z) < 1) { z.state = 'wander'; z.wT = 0; } }
      else if (z.state === 'chase') { tx = p.x; tz = p.z; sp = 2.65 * (z.spd || 1); if (z.lost > 0) { tx = z.tx; tz = z.tz; sp *= 0.85; } }
      if (z.limp) sp *= z.limp >= 2 ? 0.38 : 0.6; // tiros nas pernas: coxeia
      // noutro piso do mesmo prédio: vai pelas escadas
      if ((z.state === 'chase' || z.mem > 0) && !same && p.alive) {
        const goingUp = zl < p.lv, C = p.bld || (p.st && p.st.b);
        const s = W.stairs.find(st => st.b === C && st.lv === (goingUp ? zl : zl - 1));
        if (s) { const onIt = z.st === s, endA = goingUp ? (onIt ? s.top + s.dir * 0.7 : s.bot - s.dir * 0.7) : (onIt ? s.bot - s.dir * 0.7 : s.top + s.dir * 0.7); if (s.ax) { tx = endA; tz = s.cc; } else { tx = s.cc; tz = endA; } sp = Math.max(sp, 2.2); z.state = 'chase'; z.lost = 0.1; }
      }
      // caminho: se não dá para ir a direito, segue os cantos de um caminho A* (refeito quando o alvo foge ou fica velho)
      if (same && (z.state === 'chase' || z.state === 'alert') && sp > 0 && Math.hypot(tx - z.x, tz - z.z) > 1.0) {
        z.navT = (z.navT || 0) - dt;
        if (z.navT <= 0) { z.navT = 0.4 + Math.random() * 0.25;
          if (walkLine(z.x, z.z, tx, tz, zl)) z.path = null;
          else if (navBudget > 0 && (!z.path || Math.hypot(tx - z.pgx, tz - z.pgz) > 2 || z.pathAge > 3)) { navBudget--; const r = nav.find(z.x, z.z, tx, tz, zl); z.path = r.pts; z.pi = 0; z.pgx = tx; z.pgz = tz; z.pathAge = 0; } }
        if (z.path) { z.pathAge = (z.pathAge || 0) + dt; let wp = z.path[z.pi]; while (wp && z.pi < z.path.length - 1 && (Math.hypot(wp[0] - z.x, wp[1] - z.z) < 0.6 || (z.pi < z.path.length - 1 && Math.random() < 0.1 && walkLine(z.x, z.z, z.path[z.pi + 1][0], z.path[z.pi + 1][1], zl)))) { z.pi++; wp = z.path[z.pi]; } if (wp) { tx = wp[0]; tz = wp[1]; } }
      } else if (z.path) z.path = null;
      // ataque: só no mesmo piso, ao alcance e sem parede nem vidro pelo meio
      z.atkCd -= dt;
      const close = sameLevel(z, p), reach = close && d < 1.3 && p.h < 1.7 && los(z.x, z.z, p.x, p.z, null, 'sg', zl, 0.5);
      if (z.state === 'chase' && p.alive && reach) { sp = 0; if (z.atkT <= 0 && z.atkCd <= 0) { z.atkT = 0.6; z.atkCd = 1.6; } }
      if (z.atkT > 0) { z.atkT -= dt; if (z.atkT <= 0 && p.alive && close && d < 1.45 && p.h < 1.7 && los(z.x, z.z, p.x, p.z, null, 'sg', zl, 0.5)) { const dm = 6 + Math.random() * 4; if (p.an) hurtZombie(p, dm, Math.sin(z.yaw), Math.cos(z.yaw), { quiet: true }); else if (p.remote) G.net.zatk(z.nid, p.rid, dm); else hurtPlayer(dm, 'zombie'); } sp = 0; }
      // rumo: vira devagar e anda para onde está virado (menos aos solavancos)
      let mx = tx - z.x, mz = tz - z.z; const ml = Math.hypot(mx, mz);
      let des = z.yaw;
      if (ml > 0.05 && sp > 0) { des = Math.atan2(mx, mz); if (z.det > 0) { z.det -= dt; des += z.detDir * 1.2; } }
      z.yaw += clamp(angDiff(des, z.yaw), -4.5 * dt, 4.5 * dt);
      const al = Math.max(0, Math.cos(Math.min(Math.PI / 2, Math.abs(angDiff(des, z.yaw)))));
      z.v = (z.v || 0) + (sp * (0.3 + 0.7 * al) - (z.v || 0)) * Math.min(1, dt * 4);
      mx = Math.sin(z.yaw) * z.v; mz = Math.cos(z.yaw) * z.v;
      for (const o of G.zs) { if (o === z || o.state === 'dead' || (o.lv || 0) !== zl) continue; const ox = z.x - o.x, oz = z.z - o.z, od = ox * ox + oz * oz; if (od < 0.5 && od > 1e-6) { const k = (0.7 - Math.sqrt(od)) * 1.6; mx += ox * k; mz += oz * k; } }
      const ox = z.x, oz = z.z; z.x += mx * dt; z.z += mz * dt; collide(z, 0.3);
      // de frente para uma parede: não encosta o tronco inclinado nem estica os braços através dela
      if (dMe < 45) wallFix(z); else z.wallK = 0;
      for (const t of tgts) if (sameLevel(z, t) && t.alive && t.h < 1) { const qx = z.x - t.x, qz = z.z - t.z, qd = Math.hypot(qx, qz); if (qd < 0.62 && qd > 1e-4) { z.x = t.x + qx / qd * 0.62; z.z = t.z + qz / qd * 0.62; } }
      const moved = Math.hypot(z.x - ox, z.z - oz);
      if (sp > 0.3 && moved < sp * dt * 0.3) { z.stuck += dt; if (z.stuck > 0.6) { z.stuck = 0; if (z.state === 'wander') z.wT = 0; else if (z.path) { z.path = null; z.navT = 0; z.det = 0.5; z.detDir = Math.random() < 0.5 ? -1 : 1; } else { z.det = 1.0; z.detDir = Math.random() < 0.5 ? -1 : 1; z.navT = 0; } } } else z.stuck = Math.max(0, z.stuck - dt);
      { const v = moved / Math.max(dt, 1e-3); z.mv += (v / 3.0 - (z.mv || 0)) * Math.min(1, dt * 10); z.phase += moved * zStride(v); }
      stairUpdate(z); z.y = (z.base || 0) + groundY(z.x, z.z, z.lv || 0);
      if (z.state === 'chase' && dMe < 22) { z.groan -= dt; if (z.groan <= 0) { z.groan = 3 + Math.random() * 5; audio.play('grunhido', 0.6 * vol(z.x, z.z)); G.ui.sound(z.x, z.z, 'z', dMe); } }
      if (G.playing && z.state === 'chase' && dMe < 16 && dMe > 2.5 && z.v > 1) { z.stepT = (z.stepT || 0) - dt; if (z.stepT <= 0) { z.stepT = 0.8; G.ui.sound(z.x, z.z, 'p', dMe); } }
    }
  };
  const hurtPlayer = (dmg, cause, raw) => {
    const p = G.p; if (!p || !p.alive || (G.admF && G.admF.god)) return; if ((cause === 'zombie' || cause === 'lobo' || cause === 'javali') && G.car && VT[G.car.k].fly) return; G.combatT = G.t; let arm = 0; if (!raw) for (const s in G.inv.eq) if (G.inv.eq[s]) arm += ITEMS[G.inv.eq[s].k].armor || 0;
    const real = dmg * (1 - Math.min(0.6, arm)); p.hp -= real; p.hurtT = 0.4; p.hitAt = G.t; if (cause !== 'queda') dmgLog.push({ t: G.t, d: dmg }); audio.play('dor'); G.ui.damage(); G.buzz(60);
    if (Math.random() < 0.12 && !p.bleed) { p.bleed = 1; G.ui.toast('Estás a sangrar. Usa uma ligadura.'); }
    burst(p.x, 1.2, p.z, 5, 0x7a0e0a, 2.2);
    if (p.hp <= 0) die(cause);
  };
  const die = cause => {
    const p = G.p; if (!p.alive) return; if (G.car) G.cars.exit(); p.alive = false; p.hp = 0; p.cause = cause; G.deadAt = { x: p.x, z: p.z }; audio.play('morte'); if (G.aimEnd) G.aimEnd(); try { window.estat && window.estat('morte', cause); } catch (e) { }
    if (G.ARENA) { if (G.net && G.net.on) G.net.died(G.killer); G.inv = new Inv(); G.ui.refresh(true); body.root.visible = false; G.ui.closeInv(); G.box = null; setTimeout(() => G.ui.arenaDeath({ cause, by: G.killer }), 1200); return; }
    if (G.net && G.net.on) { if (cause !== 'dormir') G.net.died(); }
    else { const g = new Grid(6, 10); for (const it of G.inv.all()) g.insert(it); if (!g.empty) dropBag(p.x, p.z, g, { body: true, lv: p.lv, y: p.base + groundY(p.x, p.z, p.lv) }); }
    G.inv = new Inv(); G.ui.refresh(true);
    body.root.visible = false; G.ui.closeInv(); G.box = null;
    setTimeout(() => G.ui.death({ cause, by: G.killer, time: G.t - p.born, kills: p.kills }), 1400);
    Conta.apagarPersonagem(); try { saveWorld(); Conta.enviar(true); } catch (e) { }
  };
  G.respawn = d => {
    let bed = null; if (d) { bed = G.base.respawnAt(d); if (!bed) { G.ui.toast('Ainda não dá para renascer em ' + d.name); return; } }
    setTimeout(save, 50);
    const [x, z] = bed ? [bed[0], bed[1]] : spawnPoint(); G.p = newPlayer(x, z); G.inv = freshKit(); G.sel = 0; body.root.rotation.set(0, 0, 0); body.root.position.set(x, 0, z); body.root.visible = true;
    refresh(); G.ui.closeDeath(); camT.set(x, 0, z); G.killer = null; if (!bed) setTimeout(() => G.ui.toast(whereMsg(x, z)), 400); else setTimeout(() => G.ui.toast('Acordaste em ' + d.name), 400);
  };

  // ---------- guardar: personagem e mundo do perfil ativo, neste aparelho (e na nuvem, se o perfil tiver conta)
  const enc = it => it && { k: it.k, n: it.n, r: it.r ? 1 : undefined, mg: it.mg === undefined ? undefined : it.mg, am: it.am, ammo: it.ammo, ak: it.ak, att: it.att, pref: it.pref, zero: it.zero };
  const dec = o => { if (!o || !ITEMS[o.k]) return null; const it = mkItem(o.k, o.n); if (o.r) it.r = true; if (o.ammo !== undefined) it.ammo = o.ammo; if (o.mg !== undefined && it.att) it.mg = o.mg; if (ITEMS[o.k].clip) { it.am = o.am || 0; if (o.ak && ITEMS[o.ak]) it.ak = o.ak; } if (it.att) { if (o.ak && ITEMS[o.ak]) it.ak = o.ak; if (o.att) it.att = o.att; if (o.pref) it.pref = o.pref; if (o.zero) it.zero = o.zero; } return it; };
  const encG = g => g.list.map(e => ({ ...enc(e.it), x: e.x, y: e.y }));
  G.invLayout = () => ({ bag: encG(G.inv.bag), belt: G.inv.belt.map(o => o ? enc(o) : null), eq: Object.fromEntries(Object.entries(G.inv.eq).map(([k, v]) => [k, v ? enc(v) : null])) });
  G.loadInv = L => { const inv = new Inv(); for (const k in L.eq || {}) inv.eq[k] = L.eq[k] ? dec(L.eq[k]) : null; (L.belt || []).forEach((o, i) => { if (i < 6) inv.belt[i] = o ? dec(o) : null; }); for (const o of L.bag || []) { const it = dec(o); if (it) { if (inv.bag.fits(it, o.x, o.y, inv.rows())) inv.bag.add(it, o.x, o.y); else inv.bag.insert(it, inv.rows()); } } G.inv = inv; refresh(); G.ui.refresh(true); };
  // o servidor diz quanto tens de cada coisa: tira o que estiver a mais (pilhas, depois acessórios, carregadores e balas)
  G.fixInv = T => { const all = () => [...G.inv.bag.list.map(e => e.it), ...G.inv.belt.filter(Boolean), ...Object.values(G.inv.eq).filter(Boolean)];
    const tally = () => { const C = {}; for (const o of all()) { const d = ITEMS[o.k]; if (!d) continue; C[o.k] = (C[o.k] || 0) + Math.max(1, o.n | 0); if (o.att) for (const v of Object.values(o.att)) if (ITEMS[v]) C[v] = (C[v] || 0) + 1; if (d.gun && o.mg && ITEMS[o.mg]) C[o.mg] = (C[o.mg] || 0) + 1; const am = (d.gun ? o.ammo | 0 : 0) + (d.clip ? o.am | 0 : 0); if (am > 0 && o.ak) C[o.ak] = (C[o.ak] || 0) + am; } return C; };
    const C = tally(); let changed = false;
    for (const k in C) { let ex = C[k] - (T[k] || 0); if (ex <= 0) continue; changed = true;
      for (const o of all()) { if (ex <= 0) break; if (o.k !== k) continue; const q = Math.min(ex, Math.max(1, o.n | 0)); o.n = (o.n || 1) - q; ex -= q; if (o.n <= 0) { const w = G.inv.where(o); if (w) { if (w.t === 'bag') G.inv.bag.remove(o); else if (w.t === 'belt') G.inv.belt[w.i] = null; else if (w.t === 'eq') G.inv.eq[w.s] = null; } } }
      for (const o of all()) { if (ex <= 0) break; if (o.att) for (const s in o.att) if (o.att[s] === k && ex > 0) { delete o.att[s]; ex--; } if (ex > 0 && o.mg === k && ITEMS[o.k].gun) { o.mg = null; o.ammo = 0; ex--; } }
      for (const o of all()) { if (ex <= 0) break; if (o.ak !== k) continue; if (ITEMS[o.k].gun && o.ammo > 0) { const q = Math.min(ex, o.ammo); o.ammo -= q; ex -= q; } if (ITEMS[o.k].clip && o.am > 0) { const q = Math.min(ex, o.am); o.am -= q; ex -= q; } } }
    if (changed) { refresh(); G.ui.refresh(true); G.ui.toast('O servidor corrigiu o teu inventário'); } return changed; };
  // ---------- online (servidor de jogo): outros jogadores, PvP, quem dorme, mochilas partilhadas e clãs
  const _wa = new THREE.Vector3(), _wb = new THREE.Vector3();
  // ---------- carros
  G.cars = makeCars({ scene, G, W, collide, solidAt, tallAt, groundY, addRect, removeRect, audio, hurtZombie, sameLevel, roofAt });
  // o mundo partilhado (online): aplicar o que vem do servidor
  const doorById = new Map(W.doors.filter(D => D.wid != null).map(D => [D.wid, D]));
  const nodeWait = new Map(); // chave → quando volta (ms), para setores que ainda não estão carregados
  const nodeOff = (n, ms) => { if (!n.alive) return; n.alive = false; n.col.on = false; n.respawn = G.t + ms / 1000; hideNode(n); };
  W.onSector = S => { if (!nodeWait.size) return; const now = Date.now(); for (const n of S.nodes) { const u = nodeWait.get(n.key); if (u && u > now) nodeOff(n, u - now); } };
  const bagRows = rows => { const me = (Conta.ativo() || {}).nome; for (const [id, x, z, y, lv, body, name] of rows) { if (G.bags.some(b => b.nid === id)) continue; const crate = body === 2, mine = body === 1 && name === me; const b = dropBag(x, z, new Grid(6, 4), { net: true, nid: id, body: body === 1, crate, lv, y, mine, label: crate ? 'Abrir caixa do avião' : body ? (mine ? 'Revistar o teu corpo' : 'Revistar o corpo de ' + name) : 'Revistar saco' }); b.grid = null; b.mesh.position.set(x, y, z); } };
  const bagGone = id => { const i = G.bags.findIndex(b => b.nid === id); if (i < 0) return; const b = G.bags[i]; scene.remove(b.mesh); G.bags.splice(i, 1); if (G.box === b) { G.box = null; if (G.invOpen) G.ui.openInv(null); } };
  // ---------- zombies online: o servidor guarda-os todos; simulas os que estão mais perto de ti e vês os outros como quem os simula os vê
  const zById = new Map(), zSent = new Map(), KIND = ['', 'mil', 'pol'], KC = { mil: 1, pol: 2 };
  const zClear = () => { G.zs.length = 0; zById.clear(); zSent.clear(); };
  const zNet = {
    // mundo novo: espalha os zombies pelas zonas do jogo e manda a lista ao servidor
    seed: () => { popWorld(); const L = G.zs.map(z => [+z.x.toFixed(1), +z.z.toFixed(1), z.an ? ANK[z.an].k : KC[z.kind] || 0, z.helm || 0, z.vest || 0, Math.round(z.hp), z.pack || 0]); zClear(); return L; },
    // mundo que já tinha zombies (antes dos animais): só os animais
    aseed: () => popAnimals().map(a => [+a.x.toFixed(1), +a.z.toFixed(1), ANK[a.an].k, 0, 0, Math.round(a.hp), a.pack || 0]),
    rows: U => { const now = performance.now();
      for (const [i, x10, z10, lv, y100, mv10, st, hp, k, h, v, l10, own, hx10, hz10, ts, pet] of U) {
        const x = x10 / 10, zz = z10 / 10; let z = zById.get(i);
        if (!z) { z = zAt(x, zz); const an = ANBYK[k]; Object.assign(z, { nid: i, hx: hx10 / 10, hz: hz10 / 10, kind: an ? undefined : KIND[k] || undefined, an, pet: pet || null, helm: h, vest: v, lv, yaw: y100 / 100, hpMax: an ? ANK[an].hp : k === 1 ? 70 : k === 2 ? 75 : 80 }); armDur(z); z.helm = h; z.vest = v; z.hp = hp; z.limp = l10 / 10; z.remote = !own; z.T = own ? null : track();
          if (st === 3) { z.state = 'dead'; z.deadT = 60; z.sink = 0.6; } else z.state = ZST[st] || 'wander'; if (!own) push(z.T, ts || now, now, { x, z: zz, y: 0, lv, yaw: z.yaw, mv: mv10 / 10, st });
          stairUpdate(z); z.y = (z.base || 0) + groundY(z.x, z.z, z.lv || 0); zById.set(i, z); G.zs.push(z); continue; }
        // passa a ser simulado aqui, ou deixa de ser
        if (own && z.remote) { Object.assign(z, { remote: false, T: null, x, z: zz, lv, yaw: y100 / 100, tx: x, tz: zz, think: 0, path: null, v: 0, lost: 0 }); if (z.state !== 'dead') z.state = st === 3 ? 'dead' : ZST[st] || 'wander'; zSent.delete(i); }
        else if (!own && !z.remote) { z.remote = true; z.T = track(); }
        z.helm = h; z.vest = v; z.limp = l10 / 10; if (z.an) { if (z.pet && !pet && z.pet === G.net.uid && z.state !== 'dead') G.ui.toast('O teu cão deixou de te seguir'); z.pet = pet || null; }
        if (st === 3) { if (z.state !== 'dead') zDie(z, false); z.hp = 0; z.predDead = 0; continue; }
        if (z.state === 'dead') { if (z.predDead && now - z.predDead < 2500) continue; // a morte que previmos ainda não chegou ao servidor
          Object.assign(z, { state: ZST[st] || 'wander', deadT: 0, sink: 0, head: false, x, z: zz, lv, predDead: 0 }); armDur(z); z.helm = h; z.vest = v; if (z.remote) z.T = track(); }
        z.hp = hp; if (z.remote) push(z.T || (z.T = track()), ts || now, now, { x, z: zz, y: 0, lv, yaw: y100 / 100, mv: mv10 / 10, st });
      } },
    gone: ids => { for (const i of ids) { const z = zById.get(i); if (!z) continue; zById.delete(i); zSent.delete(i); const j = G.zs.indexOf(z); if (j >= 0) G.zs.splice(j, 1); } },
    // morte confirmada pelo servidor; se foste tu, conta e pode largar loot
    killed: (i, by, head) => { const z = zById.get(i); if (z) { if (z.state !== 'dead') zDie(z, head); z.hp = 0; z.predDead = 0; }
      if (by === G.net.id && G.p) G.p.kills++; },
    // outro jogador acertou num zombie que tu simulas: empurrão e vira-se
    hit: (i, dx, dz) => { const z = zById.get(i); if (!z || z.remote || z.state === 'dead') return; z.x += dx * 0.12; z.z += dz * 0.12; z.hitT = 0.15; if (z.state !== 'chase') { z.state = 'chase'; z.lost = 0; } },
    // os teus zombies que mudaram (10 vezes por segundo)
    up: () => { const out = []; for (const z of G.zs) { if (z.remote || z.nid == null || z.state === 'dead') continue; const st = z.atkT > 0 ? 4 : z.state === 'chase' ? 2 : z.state === 'alert' ? 1 : 0;
        const a = [z.nid, Math.round(z.x * 10), Math.round(z.z * 10), z.lv || 0, Math.round(z.yaw * 20) * 5, Math.round((z.mv || 0) * 10), st, Math.round((z.limp || 0) * 10)], sg = a.join(); if (zSent.get(z.nid) === sg) continue; zSent.set(z.nid, sg); out.push(a); } return out; },
    offline: () => { zClear(); popWorld(); },
  };
  G.noise = (x, z, r) => noise(x, z, r);
  const netWorld = {
    // ao ligar: o mundo passa a ser o do servidor (sacos, caixas, portas, árvores, tempo)
    reset: w => {
      for (const b of G.bags) scene.remove(b.mesh); G.bags.length = 0; if (G.box && (G.box.bag || G.box.wid != null)) { G.box = null; if (G.invOpen) G.ui.closeInv(); }
      for (const c of W.containers) if (c.wid != null && !c.own) { c.grid = null; c.next = 0; }
      for (const D of doorById.values()) { if (D.lock) continue; D.target = D.t = 0; D.auto = false; } for (const [i, o] of w.doors) { const D = doorById.get(i); if (D && !D.lock) D.target = D.t = o; }
      for (const n of nodes) if (!n.alive && n.key) { n.alive = true; n.hp = n.max; n.col.on = true; showNode(n); }
      nodeWait.clear(); const now = Date.now(); for (const [k, ms] of w.nodes) { nodeWait.set(k, now + ms); const n = nodes.find(q => q.key === k); if (n) nodeOff(n, ms); }
      G.rainT = G.rain = w.wx; bagRows(w.bags);
      zClear(); if (w.zseed) G.net.zseed(zNet.seed());
      G.base.clear(); G.base.online({ send: G.net.raw, uid: G.net.uid }); G.base.applyNet(w.base);
      G.cars.clear();
      for (const [i, hp, broke] of w.locks || []) netWorld.lock(i, hp, broke);
    },
    leave: () => { G.cars.clear(); G.cars.spawnLocal(); G.base.online(null); G.base.clear(); const wd = Conta.lerMundo(); if (wd && wd.base) G.base.load(wd.base, decG); },
    base: m => G.base.applyNet(m),
    lock: (i, hp, broke) => { const D = doorById.get(i); if (!D || !D.lock) return; D.lock.hp = hp; D.lock.broke = broke; if (hp <= 0) { D.target = D.t = 1; } },
    boom: m => { ghostGone(m.k, m.x, m.z); explode({ k: m.k, P: new THREE.Vector3(m.x, m.y, m.z), lv: m.lv, remote: true, by: m.by, nd: m.nd }); },
    thr: m => ghostBoom(m),
    z: zNet,
    door: (i, o) => { const D = doorById.get(i); if (D) setDoor(D, o, false, true); },
    node: (k, ms) => { nodeWait.set(k, Date.now() + ms); const n = nodes.find(q => q.key === k); if (n) nodeOff(n, ms); },
    bags: (add, del) => { if (add) bagRows(add); for (const id of del || []) bagGone(id); },
    wx: r => { G.rainT = r; },
    // caixa ou saco aberto: monta a grelha com o que o servidor tem (ou enche uma caixa nova com loot)
    opened: (c, m) => {
      if (m.busy) { G.ui.toast(m.busy + ' está a revistar isto'); return false; } if (m.lk) { if (m.lk === 1 && c.dep) G.ui.codeAsk({ dep: c.dep }); else G.ui.toast('Trancado'); return false; } if (m.gone) { bagGone(c.nid); return false; } if (m.far) { G.ui.toast('Chega-te mais perto'); return false; }
      let g;
      if (c.did) { g = decG(m.it || [], new Grid(c.slots[0], c.slots[1])); c.grid = g; if (c.dep && (c.dep.k === 'fornalha' || c.dep.k === 'fogueira')) { c.dep.on = !!m.on; c.dep.burn = 0; if (m.el) G.base.catchUp(c.dep, m.el / 1000); } G.box = c; G.ui.openInv(c); return false; }
      if (c.nid) { let rows = m.body ? 10 : 4; for (;;) { g = decG(m.it, new Grid(6, rows)); if (g.list.length >= m.it.length || rows >= 16) break; rows += 2; } }
      else { g = new Grid(c.slots[0], c.slots[1]); if (m.gen) rollLoot(c.table, g); else { decG(m.it, g); if (m.roll) rollLoot(c.table, g); } }
      c.grid = g; G.box = c; G.ui.openInv(c); return !!(m.gen || m.roll);
    },
    encG, dec,
  };
  G.WV = WV; G.net = makeNet({ G, scene, mkRemote, bagMesh: bagM, audio, Conta, enc, dec, die, world: netWorld, WV,
    hurt: (dmg, by, zone, pop, cause) => {
      if (!G.p || !G.p.alive) return; if (cause === 'zombie') { hurtPlayer(dmg, 'zombie'); return; } G.killer = by; if (cause === 'carro') { hurtPlayer(dmg, 'carro', true); return; }
      if (pop) { const s = pop === 'head' ? 'head' : 'vest'; if (G.inv.eq[s]) { G.inv.eq[s] = null; refresh(); G.ui.toast(s === 'head' ? 'O teu capacete partiu-se' : 'O teu colete partiu-se'); } }
      hurtPlayer(dmg, 'pvp', true); if (zone === 'head') G.shakeT = Math.max(G.shakeT || 0, 0.25);
    },
    give: L => { let n = 0, chao = 0; for (const it of L) { const left = G.inv.give(it); n++; if (left) { it.n = left; G.dropItem(it); chao++; } } audio.play('apanhar'); refresh(); G.ui.toast(!n ? 'Já alguém levou esta mochila' : chao ? 'Apanhaste a mochila (o que não coube ficou no chão)' : 'Apanhaste a mochila'); },
    wallEnd: (o, d) => { _wa.set(o[0], o[1], o[2]); _wb.copy(_wa).addScaledVector(_wb.set(d[0], d[1], d[2]), 300); const t = wallHit(_wa, _wb); const E = _wb.sub(_wa).multiplyScalar(t).add(_wa); tracer(o[0], o[1], o[2], E.x, E.y, E.z); if (G.p && Math.hypot(o[0] - G.p.x, o[2] - G.p.z) < 60) { flash.position.set(o[0], o[1], o[2]); flash.intensity = 5 + 12 * (1 - (G.day ?? 1)); G.flashT = 0.06; } } });
  const decG = (L, g, rows) => { for (const o of L || []) { const it = dec(o); if (!it) continue; if (g.fits(it, o.x, o.y, rows)) g.add(it, o.x, o.y); else g.insert(it, rows); } return g; };
  // online o mundo (e as bases) é do servidor: aqui não se grava
  const saveWorld = () => { if (G.net && G.net.world) return; if (!G.zs.length) return; Conta.gravarMundo({ v: 1, when: Date.now(), cyc: Math.round(G.cyc || 0),
    zs: G.zs.map(z => [Math.round(z.x * 10) / 10, Math.round(z.z * 10) / 10, Math.round((z.hx ?? z.x) * 10) / 10, Math.round((z.hz ?? z.z) * 10) / 10, Math.round(z.hp), z.kind || '', z.helm || 0, z.vest || 0, z.limp || 0, z.state === 'dead' ? Math.round(z.deadT) : -1, z.lv || 0, z.state === 'chase' ? 1 : 0]),
    bags: G.bags.filter(b => b.grid && !b.grid.empty).map(b => ({ x: b.x, z: b.z, lv: b.lv || 0, y: +b.mesh.position.y.toFixed(2), body: b.body, age: Math.round(G.t - b.t), c: [b.grid.cols, b.grid.rows], g: encG(b.grid) })),
    wx: [+(G.rain || 0).toFixed(2), G.rainT || 0, Math.round(WX.t)], base: G.base.save(encG), locks: W.doors.filter(D => D.lock).map(D => [W.doors.indexOf(D), Math.round(D.lock.hp), D.lock.broke || 0]),
    cont: W.containers.map((c, i) => c.grid && !c.own ? [i, Math.max(0, Math.round((c.next || 0) - G.t)), encG(c.grid)] : null).filter(Boolean) }); };
  const saveChar = () => { const p = G.p; if (!p || !p.alive) return; Conta.gravarPersonagem({ v: 1, when: Date.now(), x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.y.toFixed(2), lv: p.lv || 0, base: p.base || 0, bld: p.bld ? p.bld.id : null, yaw: +p.yaw.toFixed(3), sel: G.sel, hp: p.hp, food: p.food, water: p.water, bleed: p.bleed, kills: p.kills, sk: p.sk, combat: !!(G.inCombat && G.inCombat()),
    bag: encG(G.inv.bag), belt: G.inv.belt.map(enc), eq: Object.fromEntries(Object.entries(G.inv.eq).map(([k, v]) => [k, enc(v)])) }); };
  const save = () => { if (!G.playing || G.ARENA) return; try { saveChar(); saveWorld(); Conta.enviar(); } catch (e) { } };
  G.save = save;
  const restoreZs = L => { G.zs.length = 0; for (const a of L) { const [x, zz, hx, hz, hp, kind, helm, vest, limp, dead, lv, ch] = a; const z = zAt(x, zz); Object.assign(z, { hx, hz, hp: Math.max(1, hp), kind: kind || undefined, helm, vest, limp, lv: lv || 0, hpMax: kind === 'mil' ? 70 : kind === 'pol' ? 75 : 80, reT: 360 + Math.random() * 300 }); armDur(z); if (dead >= 0) { z.state = 'dead'; z.deadT = Math.max(dead, 30); z.sink = 0.6; z.hp = 0; } else if (ch && G.wasCombat) { z.state = 'chase'; z.mem = 8; z.det = 1; } G.zs.push(z); } };
  const clearWorld = () => { G.base.clear(); for (const b of G.bags) scene.remove(b.mesh); G.bags.length = 0; for (const c of W.containers) { c.grid = null; c.next = 0; } };
  const restoreWorld = w => { if (w.cyc != null) G.cyc = w.cyc; if (w.zs) restoreZs(w.zs); G.base.load(w.base, decG); if (w.wx) { G.rain = w.wx[0]; G.rainT = w.wx[1]; WX.t = w.wx[2]; } for (const [i, hp, broke] of w.locks || []) { const D = W.doors[i]; if (!D || !D.lock) continue; D.lock.hp = hp; D.lock.broke = broke; if (hp <= 0) { D.t = D.target = 1; } }
    for (const b of w.bags || []) { const g = decG(b.g, new Grid(b.c[0], b.c[1])); if (g.empty) continue; const bb = dropBag(b.x, b.z, g, { body: b.body, lv: b.lv, y: b.y }); bb.t = G.t - (b.age || 0); }
    for (const [i, rem, L] of w.cont || []) { const c = W.containers[i]; if (!c) continue; c.grid = decG(L, new Grid(c.slots[0], c.slots[1])); c.next = G.t + rem; } };
  const restore = s => { G.p = newPlayer(s.x, s.z); const p = G.p; Object.assign(p, { hp: s.hp, food: s.food, water: s.water, bleed: s.bleed, kills: s.kills || 0 }); if (s.sk) Object.assign(p.sk, s.sk); if (s.cyc != null) G.cyc = s.cyc;
    if (s.lv) { const C = W.cuts.find(c => c.id === s.bld); if (C) { p.lv = s.lv; p.bld = C; p.base = s.base || s.lv * C.fh; p.y = s.y ?? p.base; } }
    if (s.yaw != null) p.yaw = p.root = p.aim = s.yaw;
    const inv = new Inv(); for (const k in s.eq) inv.eq[k] = dec(s.eq[k]); s.belt.forEach((o, i) => inv.belt[i] = dec(o)); for (const o of s.bag) { const it = dec(o); if (it) { if (inv.bag.fits(it, o.x, o.y, inv.rows())) inv.bag.add(it, o.x, o.y); else inv.bag.insert(it, inv.rows()); } } G.inv = inv; };
  // sair a meio de uma luta: no jogo é preciso ficar 5 s parado; ao fechar a página, o browser pede confirmação e, ao voltar, os zombies continuam atrás de ti
  G.inCombat = () => !!(G.playing && G.p && G.p.alive && (G.t - (G.combatT ?? -99) < 8 || G.zs.some(z => z.state === 'chase' && Math.hypot(z.x - G.p.x, z.z - G.p.z) < 18)));
  G.toMenu = () => { save(); G.net.stop(); G.quit = null; if (G.aimEnd) G.aimEnd(); G.playing = false; body.root.visible = false; G.ui.toMenu(); };
  // perigo (para a música): 3+ zombies a perseguir, mais de 5 perto, 40+ de dano seguido ou vários golpes,
  // tiros de outros jogadores, zona PvP ou base militar. Fica ligado uns segundos depois de passar.
  const dmgLog = []; let dangerUntil = -99, dLife = null;
  G.heardShot = () => { dangerUntil = Math.max(dangerUntil, G.t + 25); };
  G.danger = () => {
    const p = G.p; if (!G.playing || !p || !p.alive) return false; const t = G.t;
    if (dLife !== p) { dLife = p; dangerUntil = -99; dmgLog.length = 0; }
    let chase = 0, near = 0; for (const z of G.zs) { if (z.state === 'dead') continue; const dx = z.x - p.x, dz = z.z - p.z, d2 = dx * dx + dz * dz; if (d2 < 256) near++; if (z.state === 'chase' && d2 < 1600) chase++; }
    while (dmgLog.length && t - dmgLog[0].t > 8) dmgLog.shift(); let sum = 0, recent = 0; for (const h of dmgLog) { sum += h.d; if (t - h.t < 5) recent++; }
    if (chase >= 3 || near > 5 || sum >= 40 || recent >= 3) dangerUntil = Math.max(dangerUntil, t + 20);
    const zn = G.zoneAt(p.x, p.z); if (zn && (zn.kind === 'city' || zn.kind === 'mil')) dangerUntil = Math.max(dangerUntil, t + 8);
    G.dangerWhy = { chase, near, sum: Math.round(sum), recent, zone: zn ? zn.kind : '' };
    return t < dangerUntil;
  };
  G.askQuit = () => { if (!G.playing) return; if (!G.inCombat()) { G.toMenu(); return; } G.quit = { t: 5, hp: G.p.hp, x: G.p.x, z: G.p.z }; G.ui.quitTick(5); };
  addEventListener('beforeunload', e => { if (!G.updating && G.inCombat && G.inCombat()) { save(); e.preventDefault(); e.returnValue = ''; } });
  setInterval(save, 12000); addEventListener('pagehide', () => { save(); Conta.enviar(true, true); }); document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); Conta.enviar(true, true); } });
  G.hasSave = !!Conta.lerPersonagem();
  G.start = (cont, kit) => {
    G.freshStart = !cont;
    { const L = (Conta.ativo() || {}).look; if (JSON.stringify(L || {}) !== JSON.stringify(G.lookNow || {})) { G.lookNow = L; G.setLook(L); } }
    audio.start();
    const ch = cont ? Conta.lerPersonagem() : null, wd = cont ? Conta.lerMundo() : null;
    clearWorld(); if (!cont) { Conta.apagarPersonagem(); Conta.apagarMundo(); }
    if (ch) restore(ch); else { const [x, z] = spawnPoint(kit); G.p = newPlayer(x, z); G.inv = kit ? testKit() : freshKit(); }
    G.sel = ch && ch.sel != null ? ch.sel : 0;
    try { window.estat && window.estat('jogar', cont ? 'continuar' : kit ? 'kit de teste' : 'novo'); } catch (e) { }
    G.p.born = G.t; G.playing = true; body.root.visible = true; body.root.position.set(G.p.x, G.p.y, G.p.z);
    camT.set(G.p.x, 0, G.p.z);
    G.wasCombat = !!(ch && ch.combat); G.combatT = -99; G.quit = null;
    // o mundo do perfil volta como estava: zombies, sacos no chão, o que já tiraste das caixas e a hora (quem saiu a meio de uma luta volta a meio dela)
    if (wd) restoreWorld(wd); else if (ch && ch.zs) restoreZs(ch.zs); else popWorld();
    if (!G.zs.length) popWorld();
    SECTORS.fill(G.p.x, G.p.z); for (let i = 0; i < 12 && lazyTick(G.p.x, G.p.z); i++);
    refresh(); save(); G.ui.showHUD(cont ? 'Acordaste onde adormeceste.' : kit ? 'Kit de teste: começas à beira do mapa do centro.' : whereMsg(G.p.x, G.p.z));
    G.killer = null; G.cars.clear(); G.cars.spawnLocal(); if (G.online && !kit) G.net.start(); else G.net.stop();
  };

  // pré-visualização 3D da arena: a personagem com a arma do kit, a rodar devagar (num canvas próprio, só enquanto o menu está aberto)
  G.arenaPrev = (() => {
    let R = null, sc = null, pc = null, b = null, raf = 0, last = 0, ang = -0.5, spin = 0, cv = null, mode = 'rifle', drag = null;
    const loop = t => { raf = requestAnimationFrame(loop); if (!cv || !cv.isConnected || cv.offsetParent === null) return; const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
      const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return; const pr = Math.min(2, devicePixelRatio || 1); if (cv.width !== Math.round(w * pr) || cv.height !== Math.round(h * pr)) { R.setPixelRatio(pr); R.setSize(w, h, false); }
      pc.aspect = w / h; const port = pc.aspect < 0.9; pc.fov = port ? 34 : 26; pc.position.set(0, 1.25, port ? 4.6 : 4.1); pc.lookAt(0, 1.0, 0); pc.updateProjectionMatrix();
      if (!drag) { spin *= Math.exp(-dt * 3); ang += dt * 0.35 + spin * dt; } b.root.rotation.y = ang; b.pose(dt, 0, mode, -1, 0, 0, -1, 0, mode === 'rifle' ? 0.3 : 0.5, null, null); R.render(sc, pc); }; // arma em baixo, pronta (não a apontar)
    const api = {
      mount(canvas) { if (cv === canvas && R) return; cv = canvas;
        R = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }); R.outputColorSpace = renderer.outputColorSpace; R.toneMapping = renderer.toneMapping; R.toneMappingExposure = renderer.toneMappingExposure;
        sc = new THREE.Scene(); pc = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
        sc.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3630, 1.6)); const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2, 4, 3); sc.add(key); const rim = new THREE.DirectionalLight(0x8ab4ff, 1.2); rim.position.set(-3, 2, -2); sc.add(rim);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.005; sc.add(disc);
        b = new Body(mats, lookCol((Conta.ativo() || {}).look)); b.forceNear = true; sc.add(b.root);
        // arrastar o dedo roda a personagem
        canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, a: ang, t: performance.now() }; canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); });
        canvas.addEventListener('pointermove', e => { if (!drag) return; ang = drag.a + (e.clientX - drag.x) * 0.012; });
        const up = e => { if (!drag) return; const dx = e.clientX - drag.x, dtm = Math.max(16, performance.now() - drag.t); spin = Math.max(-6, Math.min(6, dx / dtm * 6)); drag = null; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
        if (!raf) raf = requestAnimationFrame(loop); },
      set(gun, att) { if (!b) return; const d = ITEMS[gun]; mode = d && d.gun ? (d.long ? 'rifle' : 'pistol') : 'none'; b.setWeapon(gun || '', att || {}); spin = 3; },
      look(L) { if (!sc) return; sc.remove(b.root); b = new Body(mats, lookCol(L)); b.forceNear = true; sc.add(b.root); },
      stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }, start() { if (R && !raf) raf = requestAnimationFrame(loop); },
    };
    return api; })();
  // ---------- arena PvP: kits (o que trazes ao nascer), nascer na tua zona, mudar de equipa
  const arenaKit = k => { const inv = new Inv(), A0 = (G.ui.arenaAtt && G.ui.arenaAtt(k)) || {}; const gun = (g, att = {}) => { const it = mkItem(g); it.ammo = capOf(it); it.att = {}; const ch = A0[g]; // acessórios: os escolhidos no ecrã da arena, ou os do kit
      const want = ch ? { scope: ch.scope && ch.scope !== 'iron' ? ch.scope : null, sup: ch.sup ? ITEMS[g].gun.sup : null, light: ch.light ? 'lantArma' : null } : att; for (const s in want) if (want[s] && attFits(g, want[s])) it.att[s] = want[s]; return it; }; const clip = c => { const m = mkItem(c); m.am = ITEMS[c].clip.cap; return m; };
    const K = ARENA_KITS[k] || ARENA_KITS.atirador; if (K.head) inv.eq.head = mkItem(K.head); if (K.vest) inv.eq.vest = mkItem(K.vest); inv.eq.back = mkItem('mochila');
    inv.belt = [0, 1, 2, 3, 4, 5].map(i => { const e = K.belt[i]; if (!e) return null; return ITEMS[e[0]].gun ? gun(e[0], e[1] || {}) : mkItem(e[0], e[1] || 1); });
    const rows = inv.rows(); for (const [c, n] of K.bag) { if (ITEMS[c].clip) for (let i = 0; i < n; i++) inv.bag.insert(clip(c), rows); else inv.bag.insert(mkItem(c, n), rows); }
    return inv; };
  G.arenaKit = arenaKit;
  const arenaSpawn = () => { const L = arenaSpawns(G.arenaTeam | 0), me = [...(G.net && G.net.R ? G.net.R.values() : [])]; let best = L[0], bd = -1; for (const q of L) { let d = 99; for (const r of me) if (r.b.root.visible) d = Math.min(d, Math.hypot(r.x - q[0], r.z - q[1])); d += Math.random() * 2; if (d > bd) { bd = d; best = q; } } return best; };
  G.arenaRespawn = () => {
    const [x, z] = arenaSpawn(); G.p = newPlayer(x, z); G.p.yaw = G.p.root = G.p.aim = (G.arenaTeam ? -1 : 1) * Math.PI / 2; G.inv = arenaKit(G.arenaKitK); G.sel = 0; G.p.born = G.t;
    if (G.aimS) { G.aimS.fy = G.p.yaw; G.aimS.fpit = -0.04; }
    body.root.rotation.set(0, 0, 0); body.root.position.set(x, 0, z); body.root.visible = true; camT.set(x, 0, z); G.killer = null; refresh(); G.ui.refresh(true); G.ui.closeDeath && G.ui.closeDeath(); G.ui.arenaHide && G.ui.arenaHide(); if (G.net && G.net.on) G.net.raw({ t: 'aspawn', x, z }); };
  G.arenaStart = (team, kit) => {
    G.arenaTeam = team; G.arenaKitK = kit; audio.start();
    { const L = (Conta.ativo() || {}).look; if (JSON.stringify(L || {}) !== JSON.stringify(G.lookNow || {})) { G.lookNow = L; G.setLook(L); } }
    clearWorld(); G.zs.length = 0; G.arenaRespawn(); G.playing = true; G.wasCombat = false; G.combatT = -99; G.quit = null;
    for (let i = 0; i < 12 && lazyTick(G.p.x, G.p.z); i++);
    refresh(); G.ui.showHUD((team ? 'Equipa Azul' : 'Equipa Vermelha') + ' · kit ' + ARENA_KITS[kit].n);
    G.cars.clear(); G.net.start();
  };
  G.arenaTeamSet = t => { if (t === G.arenaTeam) return; G.arenaTeam = t; G.net.raw && G.net.raw({ t: 'ateam', team: t }); if (G.p && G.p.alive) G.arenaRespawn(); };
  G.arenaKitSet = k => { if (!ARENA_KITS[k]) return; G.arenaKitK = k; G.net.raw && G.net.raw({ t: 'akit', kit: k }); };

  // ---------- controlos
  const keys = new Set(), mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false, has: false };
  const sticks = { L: null, R: null };
  G.keys = keys; G.mouse = mouse; G.sticks = sticks;
  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    keys.add(e.code);
    if (!G.playing) return;
    if ((e.code === 'PageUp' || e.code === 'PageDown') && G.aimS.scope) { e.preventDefault(); G.zeroAdj(e.code === 'PageUp' ? 1 : -1); return; }
    if (e.code === 'Tab' || e.code === 'KeyI') { e.preventDefault(); G.invOpen ? G.ui.closeInv() : G.ui.openInv(G.box); }
    else if (e.code === 'Escape') { if (G.invOpen) G.ui.closeInv(); if (G.mapOpen) G.ui.toggleMap(false); }
    else if (e.code === 'KeyQ' && G.playing) G.setAuto(!G.autoRun);
    else if (e.code === 'KeyH' && G.car) G.hoverToggle && G.hoverToggle();
    else if (e.code === 'KeyE') { if (G.invOpen && G.box) G.ui.closeInv(); else G.interact(); }
    else if (e.code === 'KeyR') startReload();
    else if (e.code === 'KeyC' && G.playing) G.stanceToggle(1);
    else if ((e.code === 'KeyZ' || e.code === 'ControlLeft') && G.playing) G.stanceToggle(2);
    else if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && AIM.scope) G.breath(true);
    else if (e.code === 'Space') { e.preventDefault(); G.jump(); }
    else if (e.code === 'KeyF') G.toggleLight();
    else if (e.code === 'KeyM') G.ui.toggleMap();
    else if (e.code === 'KeyV' && G.playing) G.viewToggle();
    else if (/^Digit[1-6]$/.test(e.code)) select(+e.code.slice(5) - 1);
  });
  addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') G.breath(false); });
  addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  // ---------- mira: a arma tem de estar levantada para disparar (nada de tiros sem querer)
  //  telemóvel: botão de disparo levanta a arma e mostra a mira no alvo mais perto; arrastar ajusta (cabeça, corpo, pernas); o mesmo botão dispara
  //  PC: botão direito levanta (ou o primeiro clique); o rato aponta; clique dispara
  //  miras 4x e 8x: vista na primeira pessoa através da mira
  const AIM = G.aimS = { on: false, scope: false, raise: 0, idle: 0, lock: null, sx: innerWidth / 2, sy: innerHeight / 2, steady: 0, breath: 0, breathOn: false, breathT: 0, kick: 0, A: new THREE.Vector3(), Aw: new THREE.Vector3(), zone: null, tgt: null, fpT: 0, fy: 0, fpit: 0, eye: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), pend: false, rmb: false, adsT: 0 };
  // vista na primeira pessoa (botão do olho / tecla V): a câmara vai para os olhos e fica lá, com ou sem nada na mão.
  // P, Q e M guardam a câmara de antes da troca, para a passagem de uma vista para a outra ser suave (~0,34 s)
  const _qF = new THREE.Quaternion();
  const lockPtr = () => { try { const r = canvas.requestPointerLock && canvas.requestPointerLock({ unadjustedMovement: true }); /* sem a aceleração do rato do sistema */ if (r && r.catch) r.catch(() => { try { const r2 = canvas.requestPointerLock(); if (r2 && r2.catch) r2.catch(() => { }); } catch (e) { } }); } catch (e) { } }; // o browser pode recusar (sem clique): não é erro
  const FPF = G.fpv = { on: false, t: 1, P: new THREE.Vector3(), Q: new THREE.Quaternion(), M: new THREE.Matrix4() };
  G.FP_ONLY = true; G.fpFree = true; // teste: só 1.ª pessoa
  G.viewToggle = () => { if (G.FP_ONLY) return; G.fpFree = !G.fpFree; if (G.cfg) G.cfg.fpView = G.fpFree; try { G.ui.saveCfg && G.ui.saveCfg(); } catch (e) { } audio.play('ui'); if (!G.fpFree && AIM.scope) { AIM.scope = false; AIM.reseed = true; } if (G.fpFree && !TOUCH) lockPtr(); else if (!G.fpFree) try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { } };
  const fpBuild = () => G.buildK === 'planta' || G.buildK === 'martelo' || G.base.placing(); // a construir volta à vista de cima (o fantasma da peça põe-se a ver de cima)
  // lanterna: a de mão no inventário, ou a montada na arma que tens na mão
  const gunLight = () => { const it = held(); return !!(it && it.att && it.att.light); };
  const hasLight = () => G.inv.count('lanterna') > 0 || gunLight();
  G.hasLight = hasLight;
  // mira de ferro (opção): espingardas sem mira também dão para apontar em primeira pessoa, sem ampliação
  const IRON = { n: 'Mira de ferro', mag: 1.25, rd: 1, iron: 1 };
  // o que cada mira dá a apontar: precisão (multiplica o espalhamento), tempo a levantar a arma, balanço da mão e velocidade a andar
  const SIGHT = { iron: { acc: 1, ads: 0.26, sway: 1, spd: 1.3 }, reddot: { acc: 0.55, ads: 0.15, sway: 0.7, spd: 1.7 }, mira4: { acc: 0.4, ads: 0.3, sway: 1, spd: 1.1 }, mira8: { acc: 0.3, ads: 0.4, sway: 1.15, spd: 0.9 } };
  const sightOf = () => { const it = held(), k = it && it.att && it.att.scope; return SIGHT[k] || SIGHT.iron; }; G.SIGHT = SIGHT;
  const ironOk = it => !!(it && ITEMS[it.k] && ITEMS[it.k].gun && RDP[it.k] && (G.cfg || {}).fpIron !== false);
  const scopeItem = () => { const it = held(); return it && it.att && it.att.scope ? ITEMS[it.att.scope] : ironOk(it) ? IRON : null; };
  G.scopeItem = scopeItem;
  // mira presa: um ponto dentro de uma parte do corpo (cabeça, tronco, braço…), que acompanha a animação dessa parte
  const lockW = (L, out = new THREE.Vector3()) => { poseInv(L.z); return out.set(L.lp[0], L.lp[1], L.lp[2]).applyMatrix4(L.z._pose[L.mk]); };
  const chestLock = z => ({ z, mk: 'torso', lp: [0, 0.43, 0], zone: 'body' });
  const inView = z => !z.hide && z.state !== 'dead';
  // ajuda à mira: só zombies (nunca jogadores), e só se estiverem à vista e com linha de tiro livre (nada de prender através de paredes)
  const _sa = new THREE.Vector3(), _sb = new THREE.Vector3();
  const clearShot = z => { const p = G.p, lo = (G.aimS.lean || 0) * 0.45; _sa.set(p.x + Math.cos(p.yaw) * lo, p.y + 1.35, p.z - Math.sin(p.yaw) * lo); for (const h of [1.25, 1.62]) { _sb.set(z.x, (z.y || 0) + h, z.z); if (wallHit(_sa, _sb) > 0.995) return true; } return false; };
  G.dbgSpawn = () => spawnPoint(false);
  G.wallAhead = (x, z, yaw, lv) => ray(x, z, Math.sin(yaw), Math.cos(yaw), 1.0, null, 's', lv || 0, 1.2);
  G.dbgRay = (sx, sy) => { const rc = new THREE.Raycaster(), v = new THREE.Vector2(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1); rc.setFromCamera(v, cam); const h = rc.intersectObjects(scene.children, true).slice(0, 3); return h.map(o => [o.object.name || o.object.type, +o.distance.toFixed(2), o.object.parent && (o.object.parent.name || o.object.parent.type)]); };
  G.dbgArenaCols = () => { const A = ARENA, ins = (x0, z0, x1, z1) => x1 > A.x - A.hw - 2 && x0 < A.x + A.hw + 2 && z1 > A.z - A.hd - 2 && z0 < A.z + A.hd + 2, f = v => +v.toFixed(3); /* colisões da arena para os bots do servidor */
    return { rects: W.rects.filter(r => ins(r.x0, r.z0, r.x1, r.z1)).map(r => [f(r.x0), f(r.z0), f(r.x1), f(r.z1), f(r.h), r.lv | 0, r.k, r.door ? 1 : 0, r.win ? 1 : 0]), circ: W.circles.filter(c => ins(c.x, c.z, c.x, c.z)).map(c => [f(c.x), f(c.z), f(c.r), c.k]), steps: W.steps.filter(s => ins(s.x0, s.z0, s.x1, s.z1)).map(s => [f(s.x0), f(s.z0), f(s.x1), f(s.z1), f(s.y)]) }; };
  G.dbg = { vis: () => [+(VIS.ms || 0).toFixed(2), VIS.n || 0], pick: (x, y) => { const r = pick(x, y, 1); return [r.zone || null, !!r.pl, +r.point.x.toFixed(2), +r.point.y.toFixed(2), +r.point.z.toFixed(2)]; }, plHit: (a, b) => plHit(new THREE.Vector3(...a), new THREE.Vector3(...b), true), cam: () => [cam.position.x, cam.position.y, cam.position.z], cols: (x, z, r) => { const out = []; near(x - r, z - r, x + r, z + r, R => { out.push(['r', R.k, +R.x0.toFixed(2), +R.z0.toFixed(2), +R.x1.toFixed(2), +R.z1.toFixed(2), R.h, R.yb || 0]); }, C => { out.push(['c', +C.x.toFixed(2), +C.z.toFixed(2), C.r, C.node ? C.node.kind + ':' + C.node.alive : (C.k || C.kind || '?'), C.on]); }); return out; }, scr: (x, y, z) => { const q = toScreen(new THREE.Vector3(x, y, z)); return [q.x, q.y, q.ok]; }, shoulder: () => { const p = G.p; return [p.x + Math.sin(p.yaw) * 0.15, p.y + 1.35, p.z + Math.cos(p.yaw) * 0.15]; }, aimA: () => [AIM.A.x, AIM.A.y, AIM.A.z, AIM.zone, !!AIM.lock], wallHit: (a, b) => wallHit(new THREE.Vector3(...a), new THREE.Vector3(...b)), item: (k, n) => mkItem(k, n), deplete: n => { n.hp = 0; n.alive = false; n.col.on = false; n.respawn = G.t + 180; hideNode(n); if (G.net.on && n.key) G.net.node(n.key); }, nodes: () => nodes, fire: () => { const it = held(), g = it && ITEMS[it.k].gun; return g ? fire(it, g) : false; }, canSee: (a, b) => canSee(a, b), clearShot: z => clearShot(z), zoneHit: (z, P, Q, k) => zoneHit(z, P, Q, k), horde: () => horde, hurt: (d, c) => hurtPlayer(d, c || 'zombie'), hitZ: (z, zone, k) => { const B = ITEMS[k].bal; hitZombie(z, zone, { dmg: B.dmg, pen: B.pen, pel: B.pel, v: new THREE.Vector3(B.v, 0, 0), v0: B.v, dist: 10, fall: B.fall || 1 }, { x: z.x, y: 1.3, z: z.z }); } }; G.V3 = THREE.Vector3; G.M4 = THREE.Matrix4; G.RC = new THREE.Raycaster();
  const lockable = z => { if (!inView(z) || !G.p) return false; if (z._lkT > G.t) return z._lk; z._lkT = G.t + 0.12; return (z._lk = canSee(G.p, z) && clearShot(z)); };
  const bestTarget = () => { const p = G.p, d = heldDef(), range = d.gun ? Math.min(d.gun.rng, 40) : 3; let best = null, bs = 1e9; for (const z of G.zs) { if (!inView(z)) continue; const dd = Math.hypot(z.x - p.x, z.z - p.z); if (dd > range) continue; const a = Math.abs(angDiff(Math.atan2(z.x - p.x, z.z - p.z), p.yaw)); if (dd > 3 && a > 1.25) continue; if (!lockable(z)) continue; const sc = dd + a * 3; if (sc < bs) { bs = sc; best = z; } } return best; };
  const _pv = new THREE.Vector3();
  const toScreen = (v, out = {}) => { _pv.copy(v).project(cam); out.x = (_pv.x + 1) / 2 * innerWidth; out.y = (1 - _pv.y) / 2 * innerHeight; out.ok = _pv.z < 1; return out; };
  // o que está debaixo de um ponto do ecrã: zona de um zombie, ou um ponto à altura da arma
  // ponto do chão por baixo de um ponto do ecrã (para escolher onde pôr as coisas)
  const _gr = new THREE.Raycaster(), _gp = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _gv = new THREE.Vector2(), _gq = new THREE.Vector3();
  G.groundAt = (sx, sy) => { _gv.set(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1); _gr.setFromCamera(_gv, cam); _gp.constant = -((G.p && G.p.base) || 0); return _gr.ray.intersectPlane(_gp, _gq) ? { x: _gq.x, z: _gq.z } : null; };
  const pick = (sx, sy, inflate = 1.1) => {
    ndc.set(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1); ray3.setFromCamera(ndc, cam);
    const o = ray3.ray.origin, d = ray3.ray.direction; _a.copy(o); const end = new THREE.Vector3().copy(o).addScaledVector(d, 140);
    let best = null; for (const z of G.zs) { if (!inView(z)) continue; const r = zoneHit(z, _a, end, inflate); if (r && (!best || r.s < best.r.s)) best = { z, r }; }
    const pl = plHit(_a, end, true); if (pl && (!best || pl.s < best.r.s)) return { zone: pl.zone, point: pl.point, pl: true };
    if (best) { const L = partIn(best.z, best.r.i, _a, end); return { z: best.z, zone: best.r.zone, point: lockW(L), part: L }; }
    const P = G.p, hp = new THREE.Vector3();
    // a mira por cima de um prédio (acima do rés-do-chão) aponta para a fachada ou janela onde está, e não para o chão escondido atrás dele:
    // quem está cá em baixo consegue disparar para uma janela lá em cima (a bala sobe e entra pela janela)
    let tb = 1e9; if (P) for (const c of W.cuts) { if (c === G.inside || (c.shell ? !c.gR.visible : !c.group.visible)) continue; if (Math.abs((c.x0 + c.x1) / 2 - P.x) > 80 || Math.abs((c.z0 + c.z1) / 2 - P.z) > 80) continue; const t = rayBox(o, d, c.x0, 0, c.z0, c.x1, c.y1 - 2, c.z1); if (t < tb) tb = t; }
    // num piso de cima, apontar para a rua lá em baixo mira o chão da rua (à altura do peito de quem lá está)
    const gy = P && P.lv > 0 && !(P.bld && inShell(P.bld, o.x + d.x * 40, o.z + d.z * 40)) ? 1.25 : (P ? P.y : 0) + 1.25;
    plane.constant = -gy; const tp = ray3.ray.intersectPlane(plane, hp) ? o.distanceTo(hp) : 1e9;
    if (tb < tp) { const w = new THREE.Vector3().copy(o).addScaledVector(d, tb); if (w.y > (P ? P.y : 0) + 2.3) return { point: w, wall: true }; }
    if (tp < 1e9) return { point: hp }; return { point: new THREE.Vector3(P.x, P.y + 1.25, P.z) };
  };
  // raio contra caixa (entrada, em metros; 1e9 se não toca)
  const rayBox = (o, d, x0, y0, z0, x1, y1, z1) => { let t0 = 0, t1 = 1e9; for (const [oo, dd, lo, hi] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) { if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return 1e9; continue; } let ta = (lo - oo) / dd, tb = (hi - oo) / dd; if (ta > tb) { const q = ta; ta = tb; tb = q; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return 1e9; } return t0; };
  const aimStart = (scope = false) => {
    if (G.car && (!G.carSeat || !heldDef().gun)) return;
    if (G.p && G.p.swim) { G.ui.toast('A nadar não dá para usar a arma'); return; }
    const p = G.p, d = heldDef(); if (!G.playing || !d.gun || !p.alive || p.climb || p.use || G.invOpen) return;
    const was = AIM.on; AIM.on = true; AIM.idle = 0; if (!was) AIM.steady = 0;
    AIM.scope = !!(scope && scopeItem());
    if (TOUCH && !was && !AIM.scope && !FPF.on) { AIM.lock = null; AIM.off = null; const z = G.cfg.assist ? bestTarget() : null; if (z) AIM.lock = chestLock(z); else { const s0 = toScreen(_c.set(p.x + Math.sin(p.yaw) * 7, p.y + 1.25, p.z + Math.cos(p.yaw) * 7)); AIM.sx = s0.x; AIM.sy = s0.y; AIM.off = { x: Math.sin(p.yaw) * 7, y: p.y + 1.25, z: Math.cos(p.yaw) * 7 }; } }
    if (AIM.scope && !FPF.on) { // entrar na mira: começa a olhar para onde já estavas a apontar (na 1.ª pessoa já estás a olhar)
      // já a apontar: o ponto da retícula; a começar agora: o rato (PC) ou a direção para onde o boneco está virado, à altura dos olhos
      const eye = eyePos(_e); let T;
      if (was && AIM.A.lengthSq()) T = AIM.lock ? lockW(AIM.lock, _c) : _c.copy(AIM.A);
      else if (!TOUCH && mouse.has) T = _c.copy(pick(mouse.x, mouse.y, 1.0).point);
      else T = _c.set(eye.x + Math.sin(p.yaw) * 30, eye.y, eye.z + Math.cos(p.yaw) * 30);
      if (Math.hypot(T.x - eye.x, T.z - eye.z) < 1.5) T.set(eye.x + Math.sin(p.yaw) * 30, eye.y, eye.z + Math.cos(p.yaw) * 30);
      AIM.lock = null;
      AIM.fy = Math.atan2(T.x - eye.x, T.z - eye.z); AIM.fpit = Math.atan2(T.y - eye.y, Math.hypot(T.x - eye.x, T.z - eye.z));
      if (!TOUCH) lockPtr();
    }
  };
  const aimEnd = () => { AIM.on = false; AIM.scope = false; AIM.lock = null; AIM.pend = false; AIM.breathOn = false; G.fireHeld = false; if (!FPF.on) try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { } };
  G.aimStart = aimStart; G.aimEnd = aimEnd;
  G.setAuto = on => { const p = G.p; G.autoRun = !!on && !!p && p.alive; if (G.autoRun) G.autoYaw = Math.hypot(p.vx, p.vz) > 0.5 ? Math.atan2(p.vx, p.vz) : p.root; const b = document.getElementById('tSprint'); if (b) b.classList.toggle('on', G.autoRun); };
  G.proj = v => toScreen(v);
  G.zeroAdj = k => { const it = held(); if (!it || !scopeItem() || scopeItem().rd) return; const def = scopeItem().mag >= 8 ? 200 : 100; it.zero = clamp((it.zero || def) + k * 100, 100, 800); audio.play('ui'); };
  G.scopeToggle = () => { if (AIM.scope) { AIM.scope = false; AIM.reseed = true; AIM.lock = null; return; } if (!scopeItem()) { G.ui.toast('Esta arma não tem mira'); return; } aimStart(true); };
  const LEAN = 0.45; // até 45 cm para o lado ao espreitar
  const eyePos = out => { const p = G.p, l = (AIM.lean || 0) * LEAN, sc = p.sc || 0, c = Math.min(1, sc), pr = Math.max(0, sc - 1), h = 1.6 - 0.46 * c - 0.8 * pr, fw = 0.12 + 0.62 * pr; return out.set(p.x + Math.sin(p.yaw) * fw + Math.cos(p.yaw) * l, p.y + h, p.z + Math.cos(p.yaw) * fw - Math.sin(p.yaw) * l); }; // agachado os olhos a 1,14 m; deitado a 0,34 m e à frente da anca
  // espreitar: se o tiro do peito bate numa esquina ou poste a menos de 1,4 m e o do ombro sai limpo, inclina-se para esse lado
  const _la = new THREE.Vector3(), _lb = new THREE.Vector3(), _lc = new THREE.Vector3(), _ld = new THREE.Vector3();
  const leanPick = p => {
    const a = G.fp ? AIM.fy : p.yaw, fx = Math.sin(a), fz = Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a), y = p.y + (G.fp ? 1.6 : 1.35);
    _la.set(p.x, y, p.z); _lb.set(p.x + fx * 6, y, p.z + fz * 6); const c = wallHit(_la, _lb) * 6; if (c > 1.4) return 0;
    let best = 0, bv = c + 0.8;
    for (const s of [1, -1]) { _lc.set(p.x + rx * s * LEAN, y, p.z + rz * s * LEAN); if (wallHit(_la, _lc) < 0.999) continue; _ld.set(_lc.x + fx * 6, y, _lc.z + fz * 6); const v = wallHit(_lc, _ld) * 6; if (v > bv) { bv = v; best = s; } }
    return best;
  };
  const scopeFov = () => { const s = scopeItem(); return 55 / (s ? s.mag : 4); };
  // 1.ª pessoa sem apontar: ~90° na horizontal deitado; ao alto o campo vertical abre até 76° (senão via-se pouco à frente)
  const fpFov = () => clamp(2 * Math.atan(1.1 / Math.max(0.3, innerWidth / innerHeight)) * 180 / Math.PI, 57, 80); // um pouco mais aberto (antes 52 a 76)
  G.fpFov = fpFov; // campo de visão real: ~55° da ocular a dividir pela ampliação
  // arrastar o dedo: na vista de cima move a mira no ecrã (e prende-se ao zombie por baixo); na mira em primeira pessoa roda a vista
  // ajuda à mira ligeira (como nos jogos de toque e comando): perto de um zombie ou jogador à vista a mira abranda um pouco
  // e, só enquanto arrastas, puxa uma fração do movimento para o alvo. Nunca mexe na mira sozinha e nunca atravessa paredes
  const _as = new THREE.Vector3(), _ae = new THREE.Vector3(), AST = [];
  const assistPts = () => { AST.length = 0; const p = G.p; if (!p || !G.cfg.assist) return AST; const d = heldDef(), rng = d.gun ? Math.min(d.gun.rng, 60) : 0; if (!rng) return AST;
    for (const z of G.zs) { if (!inView(z) || Math.abs(z.x - p.x) > rng || Math.abs(z.z - p.z) > rng || !lockable(z)) continue; AST.push(lockW(chestLock(z), new THREE.Vector3())); }
    const T = G.net && G.net.on && G.net.targets ? G.net.targets() : null;
    if (T) { _ae.set(p.x, p.y + 1.5, p.z); for (const t of T) { if (t.lying || Math.abs(t.x - p.x) > rng || Math.abs(t.z - p.z) > rng) continue; _as.set(t.x, t.y + 1.2, t.z); if (wallHit(_ae, _as) > 0.995) AST.push(_as.clone()); } }
    return AST; };
  const ASSIST = { slow: 0.3, pull: 0.3 };
  G.dbgAssist = () => { const z = window.__Z; return { n: assistPts().length, inView: z && inView(z), lk: z && lockable(z), held: heldDef().gun ? heldDef().gun.rng : null, assist: G.cfg.assist }; };
  G.aimDrag = (dx, dy) => {
    if (!AIM.on && !FPF.on) return; AIM.idle = 0; const k = G.cfg.sens || 1;
    // na 1.ª pessoa: arrastar o ecrã todo de cima a baixo roda a vista o campo de visão; a apontar, mais devagar (pela ampliação)
    if (G.fp || FPF.on) { // sensibilidade fixa: cada píxel roda sempre o mesmo ângulo (a do estado para onde vais, nada de rampas durante a transição)
      const R = G.ui.scopeR(), a = FPF.on ? (AIM.scope && AIM.raise > 0.5 ? 1 : 0) : 1, fs = THREE.MathUtils.degToRad(scopeFov()) / (2 * R) * 1.1, ff = THREE.MathUtils.degToRad(fpFov()) / innerHeight * 1.15; let f = (ff + (fs - ff) * a) * k;
      let bw = 0, by = 0, bp = 0, ba = 0, bs = 0; const P = assistPts(); // bw: puxar (cone largo); bs: abrandar (só com a mira em cima do alvo)
      if (P.length) { const E = AIM.eye, cone0 = THREE.MathUtils.degToRad(cam.fov) * 0.1, cp = Math.cos(AIM.fpit);
        for (const q of P) { const hx = q.x - E.x, hz = q.z - E.z, hd = Math.hypot(hx, hz); if (hd < 0.5) continue; const dyw = angDiff(Math.atan2(hx, hz), AIM.fy), dpt = Math.atan2(q.y - E.y, hd) - AIM.fpit, an = Math.hypot(dyw * cp, dpt), cone = Math.max(cone0, Math.atan(0.7 / hd)), w = 1 - an / cone; if (w > bw) { bw = w; by = dyw; bp = dpt; ba = an; } bs = Math.max(bs, 1 - an / Math.atan(0.32 / hd)); } }
      f *= 1 - ASSIST.slow * Math.max(0, bs); AIM.fy -= dx * f; AIM.fpit = clamp(AIM.fpit - dy * f, -1.35, 1.35);
      if (bw > 0 && ba > 1e-4) { const pull = Math.min(ba, ASSIST.pull * Math.hypot(dx, dy) * f * bw); AIM.fy += by / ba * pull; AIM.fpit = clamp(AIM.fpit + bp / ba * pull, -1.35, 1.35); }
      return; }
    { let bw = 0, bs = 0, tx = 0, ty = 0; const P = assistPts(); for (const q of P) { const o = toScreen(q); if (!o.ok) continue; const dd = Math.hypot(o.x - AIM.sx, o.y - AIM.sy), w = 1 - dd / 46; if (w > bw) { bw = w; tx = o.x; ty = o.y; } bs = Math.max(bs, 1 - dd / 16); }
      const kk = k * (1 - ASSIST.slow * bs); AIM.sx += dx * kk; AIM.sy += dy * kk;
      if (bw > 0) { const ex = tx - AIM.sx, ey = ty - AIM.sy, el = Math.hypot(ex, ey); if (el > 0.5) { const pull = Math.min(el, ASSIST.pull * Math.hypot(dx, dy) * kk * bw); AIM.sx += ex / el * pull; AIM.sy += ey / el * pull; } }
      AIM.sx = clamp(AIM.sx, 4, innerWidth - 4); AIM.sy = clamp(AIM.sy, 4, innerHeight - 4); }
    const pk = pick(AIM.sx, AIM.sy, 1.25); if (pk.part && lockable(pk.z)) { AIM.lock = pk.part; AIM.off = null; return; }
    AIM.lock = null; { const p = G.p; AIM.off = { x: pk.point.x - p.x, y: pk.point.y, z: pk.point.z - p.z }; }
    if (pk.pl) return; // em cima de outro jogador: a ajuda não salta para um zombie que esteja ao lado dele
  };
  G.relock = () => { if (!AIM.on || G.fp || FPF.on) return; const z = bestTarget(); AIM.lock = z ? chestLock(z) : null; AIM.idle = 0; };
  const tryFire = () => { const it = held(), d = heldDef(); if (!d.gun || !G.p.alive || G.invOpen || AIM.raise < 1) return false; return fire(it, d.gun); };
  G.dbgFire = () => { const it = held(), d = heldDef(); G.p.cd = 0; return d.gun ? fire(it, d.gun) : false; }; // testes
  G.fireDown = () => { if (G.car && (!G.carSeat || G.car.hp <= 0)) return; // de passageiro dispara-se da janela; quem conduz não
    const p = G.p; if (!G.playing || !p.alive || G.invOpen) return; const d = heldDef();
    if (G.base.placing()) { G.base.placeNow(); return; } // baú, fornalha, cama…: põe onde está o fantasma
    { const it = held(); if (it && it.k === 'planta') { G.base.place(); return; } if (it && it.k === 'martelo') { G.base.upgrade(); return; } if (it && it.k === 'granada') { throwGrenade(it); return; } if (it && it.k === 'c4') { plantC4(it); return; } }
    if (!d.gun) { G.fireHeld = true; G.holdT0 = G.t; G.tapAttack(); return; }
    G.fireHeld = true; AIM.idle = 0;
    if (!AIM.on) { aimStart(); if (G.cfg.quick || FPF.on) AIM.pend = true; return; }
    if (AIM.raise < 1) { AIM.pend = true; return; }
    tryFire();
  };
  G.fireUp = () => { G.fireHeld = false; }; // um toque enquanto a arma sobe não se perde: dispara quando estiver levantada
  G.breath = on => { AIM.breathOn = !!on && AIM.scope; };
  canvas.addEventListener('wheel', e => { if (G.fp && G.aimS.scope) { e.preventDefault(); G.zeroAdj(e.deltaY < 0 ? 1 : -1); } }, { passive: false });
  canvas.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; if ((G.fp && AIM.on) || FPF.on) { if (FPF.on && !document.pointerLockElement && !AIM.on) { mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true; return; } G.aimDrag(e.movementX || 0, e.movementY || 0); return; } mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true; });
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return; mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true;
    if (FPF.on && !document.pointerLockElement) lockPtr();
    if (e.button === 2) { AIM.rmb = true; aimStart(!FPF.on || !!scopeItem()); return; }
    if (e.button !== 0) return; mouse.down = true;
    if (G.base.placing()) { G.base.pin(G.groundAt(e.clientX, e.clientY)); G.base.placeNow(); return; } // no PC: clica onde queres pôr
    if (heldDef().gun) G.fireDown(); else { G.fireHeld = true; G.holdT0 = G.t; attack(); }
  });
  addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') return; if (e.button === 0) { mouse.down = false; G.fireUp(); } if (e.button === 2) { AIM.rmb = false; if (AIM.on) aimEnd(); } });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  // corpo a corpo no telemóvel: toque rápido vira-se para o mais perto e ataca
  const faceTo = yaw => { const p = G.p; p.aim = yaw; p.yaw = yaw; if (Math.abs(angDiff(yaw, p.root)) > 1.2) p.root = yaw - Math.sign(angDiff(yaw, p.root)) * 1.2; G.aimHold = 0.5; };
  G.tapAttack = () => { const p = G.p; if (!p.alive || p.climb) return; if (G.car && !heldDef().gun) return; if (heldDef().gun) { G.fireDown(); G.fireUp(); return; } if (G.fp) { attack(); return; } /* na 1.ª pessoa bate para onde estás a olhar */ const best = bestTarget(); if (best && Math.hypot(best.x - p.x, best.z - p.z) < 3.2) faceTo(Math.atan2(best.x - p.x, best.z - p.z)); else if (!p.lv) { let nb = null, nd = 2.2; for (const n of nodes) { if (!n.alive || Math.abs(n.x - p.x) > 6 || Math.abs(n.z - p.z) > 6) continue; const d = Math.hypot(n.x - p.x, n.z - p.z) - n.r; if (d < nd) { nd = d; nb = n; } } if (nb) faceTo(Math.atan2(nb.x - p.x, nb.z - p.z)); } /* sem zombie perto, vira-se para a árvore ou rocha ao lado */ attack(); };
  G.toggleLight = () => { if (!G.playing || !G.p.alive) return; if (G.car && G.carSeat === 0 && !VT[G.car.k].fly) { G.cars.lights(G.car); G.ui.refresh(true); return; } /* a conduzir: o botão Luz liga e desliga os faróis */ if (!G.lightOn && !hasLight()) { G.ui.toast('Precisas de uma lanterna'); return; } G.lightOn = !G.lightOn; audio.play('ui'); G.ui.refresh(true); };
  // saltar; se houver algo trepável à frente, trepa
  // ---------- postura: 0 de pé, 1 agachado, 2 deitado. Deitado o corpo vai 0,95 m para trás da anca e a cabeça 0,8 m à frente:
  // nunca entra nas paredes (se não couber, desliza para onde há espaço; se nem assim, fica agachado)
  const PR_F = 0.82, PR_B = 1.0;
  const proneRoom = (x, z, yaw, lv) => { const fx = Math.sin(yaw), fz = Math.cos(yaw); return { f: ray(x, z, fx, fz, 1.6, null, 'slg', lv, 0.4, 0.55), b: ray(x, z, -fx, -fz, 1.6, null, 'slg', lv, 0.4, 0.55), fx, fz }; };
  const proneFit = (p, apply) => { const R = proneRoom(p.x, p.z, p.root, p.lv || 0); if (R.f >= PR_F && R.b >= PR_B) return true;
    if (R.f + R.b < PR_F + PR_B) return false; const m = R.f < PR_F ? -(PR_F - R.f) : (PR_B - R.b); if (apply) { p.x += R.fx * m; p.z += R.fz * m; } return true; };
  G.stanceSet = k => { const p = G.p; if (!p || !p.alive || p.swim || p.climb || G.car) k = 0; k = clamp(k | 0, 0, 2); if (k === (p.stance | 0)) return;
    if (k === 2 && !proneFit(p, true)) { G.ui.toast('Sem espaço para te deitares aqui'); return; }
    if (k > 0 && p.sprint) p.sprint = false; p.stance = k; audio.play('pano', 0.5); G.ui.refresh && G.ui.refresh(); };
  G.proneRoom = () => { const p = G.p; return proneRoom(p.x, p.z, p.root, p.lv || 0); };
  G.stanceToggle = k => { const p = G.p; if (!p) return; G.stanceSet((p.stance | 0) === k ? 0 : k); };
  const stanceTick = (p, dt) => { if (!p.alive || p.swim || p.climb || G.car) p.stance = 0;
    if (p.stance === 2 && !proneFit(p, true)) { p.stance = 1; G.ui.toast('Sem espaço para ficares deitado'); }
    p.sc = (p.sc || 0) + ((p.stance | 0) - (p.sc || 0)) * Math.min(1, dt * 7); if (Math.abs(p.sc - (p.stance | 0)) < 0.002) p.sc = p.stance | 0; };
  G.jump = () => {
    const p = G.p; if (!G.playing || !p.alive || p.climb || !p.onGround || p.use || p.st || G.invOpen) return;
    if (p.stance) { G.stanceSet(p.stance - 1); return; } // saltar levanta: deitado → agachado → de pé
    const mv = Math.hypot(p.vx, p.vz) > 0.4, dir = mv ? Math.atan2(p.vx, p.vz) : p.root, fx = Math.sin(dir), fz = Math.cos(dir);
    let best = null;
    near(p.x - 1.4, p.z - 1.4, p.x + 1.4, p.z + 1.4, r => {
      if (!r.climb || (r.lv || 0) !== p.lv || r.h <= p.h + 0.35 || r.h > p.h + 2.9) return;
      const cx = clamp(p.x, r.x0, r.x1), cz = clamp(p.z, r.z0, r.z1), d = Math.hypot(p.x - cx, p.z - cz); if (d > 0.95) return;
      if (d > 0.05 && Math.abs(angDiff(Math.atan2(cx - p.x, cz - p.z), dir)) > 0.95) return;
      if (!best || d < best.d) best = { r, d, cx, cz };
    });
    if (!best) { p.vy = 5.2; /* salto de ~1 m (antes 0,7 m: quase não se via) */ p.onGround = false; audio.play('swing', 0.4); return; }
    const r = best.r; let tx, tz, th;
    if (r.top) { tx = clamp(best.cx + fx * 0.55, r.x0 + 0.25, r.x1 - 0.25); tz = clamp(best.cz + fz * 0.55, r.z0 + 0.25, r.z1 - 0.25); if (r.x1 - r.x0 < 0.5) tx = (r.x0 + r.x1) / 2; if (r.z1 - r.z0 < 0.5) tz = (r.z0 + r.z1) / 2; th = r.h; }
    else { const thinX = r.x1 - r.x0 < r.z1 - r.z0; if (thinX) { const sgn = p.x < (r.x0 + r.x1) / 2 ? 1 : -1; tx = sgn > 0 ? r.x1 + 0.5 : r.x0 - 0.5; tz = clamp(p.z, r.z0 + 0.1, r.z1 - 0.1); } else { const sgn = p.z < (r.z0 + r.z1) / 2 ? 1 : -1; tz = sgn > 0 ? r.z1 + 0.5 : r.z0 - 0.5; tx = clamp(p.x, r.x0 + 0.1, r.x1 - 0.1); } th = p.h; }
    p.climb = { t: 0, dur: 0.38 + (r.h - p.h) * 0.3, fx: p.x, fz: p.z, fh: p.h, tx, tz, th, peak: r.h + 0.12, yaw: Math.atan2(tx - p.x, tz - p.z) };
    p.vx = p.vz = 0; p.swing = -1; p.reload = 0; audio.play('swing', 0.5); G.buzz(8);
  };

  G.buzz = ms => { if (G.cfg && G.cfg.haptics) try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } };
  G.applyGfx = c => { const sh = !!c.shadows; if (renderer.shadowMap.enabled !== sh) { renderer.shadowMap.enabled = sh; sun.castShadow = sh; scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); }); } G.prUser = c.lowres ? 0.65 : 1; renderer.setPixelRatio(PR * G.prUser * DYN.k); renderer.setSize(innerWidth, innerHeight, false); };
  // resolução automática: se o telemóvel não aguenta ~50 imagens por segundo, desenha com menos píxeis (a imagem fica um pouco mais suave, o resto igual); volta a subir quando há folga
  const DYN = { k: 1, acc: 0, n: 0, hold: 0, off: !!navigator.webdriver }; G.dyn = DYN;
  const dynTick = rawMs => { if (DYN.off || !G.playing) return; DYN.acc += Math.min(rawMs, 100); DYN.n++; DYN.hold -= rawMs / 1000; if (DYN.n < 45) return; const avg = DYN.acc / DYN.n; DYN.acc = 0; DYN.n = 0; if (document.hidden) return;
    let k = DYN.k; DYN.capT = (DYN.capT || 0) - 0.75;
    if (DYN.chk) { const c = DYN.chk; DYN.chk = null; if (avg > c.avg * 0.93) { k = c.k; DYN.capT = 60; } } // baixar não ajudou: o limite é do ecrã (ex.: modo de poupança a 30 Hz), não do desenho; volta atrás
    else if (avg > 21 && k > 0.55 && DYN.capT <= 0) { DYN.chk = { avg, k }; k = Math.max(0.55, k - (avg > 30 ? 0.15 : 0.08)); } else if (avg < 17.6 && k < 1 && DYN.hold <= 0) k = Math.min(1, k + 0.05);
    if (k !== DYN.k) { DYN.hold = k < DYN.k ? 5 : 2; DYN.k = k; renderer.setPixelRatio(PR * (G.prUser || 1) * k); renderer.setSize(innerWidth, innerHeight, false); } };
  // ---------- interface
  G.ui = initUI(G); fitCam(); topProj(); visifyScene();

  // ---------- ciclo
  const ray3 = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.25), hitP = new THREE.Vector3(), ndc = new THREE.Vector2();
  const box3 = (a, b, c) => { // segmento a->b contra caixa c (x0..x1, y0..y1, z0..z1)
    let t0 = 0, t1 = 1; for (const [o, d, lo, hi] of [[a.x, b.x - a.x, c.x0, c.x1], [a.y, b.y - a.y, c.y0, c.y1], [a.z, b.z - a.z, c.z0, c.z1]]) { if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; } else { let ta = (lo - o) / d, tb = (hi - o) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false; } } return true; };
  let last = performance.now(), fpsA = 60, frames = 0, fpsT = 0;
  G.fps = 60;
  const v3a = new THREE.Vector3(), v3b = new THREE.Vector3(), _frus = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere(new THREE.Vector3(), 1.3);
  const loop = () => {
    requestAnimationFrame(loop);
    const now = performance.now(); dynTick(now - last); let dt = Math.min(0.05, (now - last) / 1000); last = now; if (window.__fixedDt) dt = window.__fixedDt;
    frames++; fpsT += dt; if (fpsT > 0.5) { G.fps = frames / fpsT; frames = 0; fpsT = 0; }
    G.t += dt;
    const p = G.p;
    if (G.paused) { G.ui.frame(0); renderer.render(scene, cam); return; }
    updDoors(dt); updBooms(dt); updWeather(dt); wreckTick(dt); mats.water.normalMap.offset.set((G.t * 0.011) % 1, (G.t * 0.006) % 1); if (G.playing && G.p) { if (!SECTORS.tick(G.p.x, G.p.z)) lazyTick(G.p.x, G.p.z, true); } /* um setor ou um bocado de zona por imagem, nunca os dois */ if (G.base) { G.base.tick(dt); G.buildK = G.base.frame(); }
    if (G.playing && p) {
      // movimento relativo ao ecrã, com peso: acelera e trava, o corpo vira para onde andas
      const cfg = G.cfg;
      let ix = 0, iy = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) iy += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) iy -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
      if (sticks.L) { ix = sticks.L.x; iy = -sticks.L.y; }
      if (G.frozen) { ix = 0; iy = 0; G.autoRun = false; } // congelado pela equipa do jogo
      let il = Math.hypot(ix, iy); if (il > 1) { ix /= il; iy /= il; il = 1; }
      // bater sozinho: num recurso até partir, ou depois de segurar Bater 2 s; para ao mexer, ao trocar para arma, no carro ou com um zombie em cima
      { const melee = !heldDef().gun && !G.car && p.alive && !p.climb && !G.invOpen;
        if (melee && G.fireHeld && !G.autoHit && G.t - (G.holdT0 ?? G.t) > 2) { G.autoHit = true; G.ui.toast('Bater automático · mexe-te para parar'); }
        if (!melee || il > 0.25 || (G.farm && (!G.farm.alive || Math.hypot(G.farm.x - p.x, G.farm.z - p.z) - G.farm.r > 2.2))) { G.farm = null; if (il > 0.25 || !melee) G.autoHit = false; }
        if ((G.farm || G.autoHit) && melee && p.cd <= 0 && !p.use && p.swing < 0) { if (G.farm) { faceTo(Math.atan2(G.farm.x - p.x, G.farm.z - p.z)); attack(); } else G.tapAttack(); } }
      // eixos do movimento: na vista de cima, os do ecrã; na mira (primeira pessoa), para a frente é para onde estás a olhar
      let Fx = FWD.x, Fz = FWD.y, Rx = RGT.x, Rz = RGT.y; if ((G.fp || FPF.on) && AIM.fy != null) { Fx = Math.sin(AIM.fy); Fz = Math.cos(AIM.fy); Rx = -Fz; Rz = Fx; }
      if (G.car) { if (G.carSeat === 0 && p.alive) { const k = c => keys.has(c) ? 1 : 0, D = G.dIn || {}; // teclado (WASD/setas) ou botões do ecrã: à esquerda acelerar/trás, à direita virar
          G.cars.drive(dt, G.dbgDrive ? G.dbgDrive : { kb: true, t: clamp(k('KeyW') + k('ArrowUp') + (D.u ? 1 : 0) - k('KeyS') - k('ArrowDown') - (D.d ? 1 : 0), -1, 1), s: clamp(k('KeyA') + k('ArrowLeft') + (D.l ? 1 : 0) - k('KeyD') - k('ArrowRight') - (D.r ? 1 : 0), -1, 1) }); }
        ix = iy = il = 0; if (G.autoRun) G.setAuto(false); if (AIM.on && !G.carSeat) aimEnd(); } // de passageiro pode apontar (debruça-se)
      // correr sempre: segue em frente sem tocar no polegar; o polegar vira; puxar para trás, mirar ou abrir o inventário para
      if (G.autoRun) {
        if (!p.alive || G.invOpen || G.mapOpen || AIM.on || p.use) G.setAuto(false);
        else if (il > 0.15) { const yw = Math.atan2(Rx * ix + Fx * iy, Rz * ix + Fz * iy); if (il > 0.5 && Math.abs(angDiff(yw, G.autoYaw)) > 2.5) G.setAuto(false); else G.autoYaw = yw; }
        else { if (FPF.on && AIM.fy != null) G.autoYaw = AIM.fy; /* na 1.ª pessoa corre para onde olhas */ const dx = Math.sin(G.autoYaw), dz = Math.cos(G.autoYaw); ix = dx * Rx + dz * Rz; iy = dx * Fx + dz * Fz; il = 1; }
      }
      const moving = il > 0.15 && p.alive && !p.climb;
      const wx = Rx * ix + Fx * iy, wz = Rz * ix + Fz * iy, moveYaw = moving ? Math.atan2(wx, wz) : null;
      // ---- mira
      const gunH = heldDef().gun;
      if (AIM.on && (!gunH || !p.alive || p.climb || p.use || G.invOpen)) aimEnd();
      // só 1.ª pessoa: a arma está sempre pronta (dispara-se à anca logo; o botão Mira aponta pela mira, mesmo a de ferro)
      if (G.FP_ONLY && gunH && !AIM.on && p.alive && !p.climb && !p.use && !G.invOpen && !p.swim && !(G.car && !G.carSeat)) aimStart();
      if (AIM.scope && !scopeItem()) AIM.scope = false;
      AIM.raise = clamp(AIM.raise + (AIM.on ? dt / 0.25 : -dt / 0.2), 0, 1);
      AIM.idle += dt; if (!G.FP_ONLY && AIM.on && !AIM.scope && !AIM.rmb && !G.fireHeld && AIM.idle > (FPF.on ? 4 : 6)) aimEnd();
      const still = Math.hypot(p.vx, p.vz) < 0.35;
      AIM.steady = clamp(AIM.steady + (AIM.on && still ? dt * 1.3 : -dt * 2.2), 0, 1);
      // suster a respiração na mira: 4 s quase sem tremer, gasta energia; depois treme mais um bocado
      if (AIM.breathOn && AIM.scope && p.stam > 1 && !AIM.gasp) { AIM.breath = Math.min(1, AIM.breath + dt * 5); p.stam -= dt * 22 * (1 - 0.3 * sk('mira')); AIM.breathT += dt; if (AIM.breathT > 4 + 3 * sk('mira') || p.stam <= 1) { AIM.breathOn = false; AIM.gasp = 1.8; } }
      else { AIM.breath = Math.max(0, AIM.breath - dt * 4); if (!AIM.breathOn) AIM.breathT = Math.max(0, AIM.breathT - dt * 0.6); }
      AIM.gasp = Math.max(0, (AIM.gasp || 0) - dt); AIM.kick *= Math.exp(-dt * 7);
      // entrar e sair da mira em primeira pessoa (a câmara desce até ao ombro e a mira abre)
      // vista na 1.ª pessoa à vontade: não no carro, nem morto, nem a construir. A troca guarda a câmara de agora para passar suave
      { const want = !!G.fpFree && p.alive && !G.car && !fpBuild();
        if (want !== FPF.on) { FPF.on = want; FPF.t = 0; FPF.P.copy(cam.position); FPF.Q.copy(cam.quaternion); FPF.M.copy(cam.projectionMatrix);
          if (want) { if (!AIM.scope) { AIM.fy = p.aim ?? p.yaw; AIM.fpit = -0.06; } AIM.lock = null; } else { if (AIM.scope) { AIM.scope = false; AIM.reseed = true; } AIM.fpT = 0; AIM.adsT = 0; if (!AIM.rmb) try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { } } }
        FPF.t = Math.min(1, FPF.t + dt / 0.34); }
      if (FPF.on) AIM.fpT = 1; else AIM.fpT = clamp(AIM.fpT + (AIM.scope && AIM.raise > 0.5 ? dt / 0.42 : -dt / 0.3), 0, 1);
      // a apontar na 1.ª pessoa (mira de ferro, ponto vermelho ou luneta): 0 à anca, 1 com a mira no olho
      AIM.adsT = clamp(AIM.adsT + (AIM.scope && AIM.raise > 0.5 && (G.fp || FPF.on) ? dt / sightOf().ads : -dt / 0.18), 0, 1);
      { const fpNow = (FPF.on ? FPF.t >= 0.5 : AIM.fpT > 0.55) && p.alive; if (fpNow !== !!G.fp) { G.fp = fpNow; PROJ.dirty = true; } }
      const scI = scopeItem(), swayA = (AIM.scope ? (scI && scI.mag >= 8 ? 0.0062 : scI && scI.rd ? 0.0017 : 0.004) * sightOf().sway : 0.0012) * (1 - 0.55 * AIM.steady) * (1 - 0.85 * AIM.breath) * (still ? 1 : 2.4) * (1 + (AIM.gasp || 0)) * (1 - 0.3 * sk('mira')) * (G.dbgSway ?? 1) * (p.stance === 2 ? 0.45 : p.stance === 1 ? 0.75 : 1); // agachado e deitado a mira treme menos
      const swY = swayA * (Math.sin(G.t * 1.1) + 0.45 * Math.sin(G.t * 2.9 + 1)), swP = swayA * (0.8 * Math.sin(G.t * 0.83 + 2) + 0.35 * Math.sin(G.t * 3.7));
      { let want = 0; if (AIM.on && AIM.raise > 0.3 && cfg.autoLean !== false && p.onGround && !p.sprint && !p.climb) { AIM.leanT = (AIM.leanT || 0) - dt; if (AIM.leanT <= 0) { AIM.leanT = 0.1; AIM.leanW = leanPick(p); } want = AIM.leanW || 0; } else AIM.leanW = 0; AIM.lean = (AIM.lean || 0) + (want - (AIM.lean || 0)) * Math.min(1, dt * 9); if (Math.abs(AIM.lean) < 1e-3) AIM.lean = 0; }
      let aimYaw = null;
      // a trepar na 1.ª pessoa: a câmara acompanha o corpo (antes ficava parada e saltava no fim) e olha um pouco para a borda
      if (p.alive && p.climb && (G.fp || FPF.on)) { eyePos(AIM.eye); const k = Math.sin(p.climb.t * Math.PI), yy = AIM.fy, pp = AIM.fpit - 0.32 * k; AIM.dir.set(Math.sin(yy) * Math.cos(pp), Math.sin(pp), Math.cos(yy) * Math.cos(pp)); AIM.eye.y -= 0.12 * k; }
      if (p.alive && !p.climb) {
        if (G.fp || FPF.on) {
          eyePos(AIM.eye); const yy = AIM.fy + swY, pp = AIM.fpit + swP + AIM.kick;
          AIM.dir.set(Math.sin(yy) * Math.cos(pp), Math.sin(pp), Math.cos(yy) * Math.cos(pp)); aimYaw = AIM.fy;
          const end = _a.copy(AIM.eye).addScaledVector(AIM.dir, 160); let bz = null; for (const z of G.zs) { if (z.state === 'dead') continue; const r = zoneHit(z, AIM.eye, end); if (r && (!bz || r.s < bz.s)) bz = r; }
          const ws = wallHit(AIM.eye, end), ph = plHit(AIM.eye, end); if (ph && ph.s < ws && (!bz || ph.s < bz.s)) bz = ph; /* outro jogador à frente: a mira também mostra cabeça ou corpo */ AIM.zone = bz && bz.s < ws ? bz.zone : null; AIM.dist = (bz && bz.s < ws ? bz.s : ws) * 160;
        } else {
          if (AIM.reseed && !G.fp) { AIM.reseed = false; AIM.off = null; if (TOUCH) { const s0 = toScreen(_c.set(p.x + Math.sin(AIM.fy) * 8, p.y + 1.25, p.z + Math.cos(AIM.fy) * 8)); if (s0.ok) { AIM.sx = s0.x; AIM.sy = s0.y; } } }
          if (!TOUCH) { if (mouse.has) { AIM.sx = mouse.x; AIM.sy = mouse.y; } }
          else if (!AIM.lock && AIM.off && AIM.on) { const q = toScreen(_c.set(p.x + AIM.off.x, AIM.off.y, p.z + AIM.off.z)); if (q.ok) { AIM.sx = q.x; AIM.sy = q.y; } }
          else if (AIM.lock) { if (!lockable(AIM.lock.z)) { const z = cfg.assist ? bestTarget() : null; AIM.lock = z ? chestLock(z) : null; if (!z) AIM.off = { x: AIM.A.x - p.x, y: AIM.A.y, z: AIM.A.z - p.z }; } if (AIM.lock) { const q = toScreen(lockW(AIM.lock, _c)); if (q.ok) { AIM.sx = q.x; AIM.sy = q.y; } } }
          if ((!TOUCH && mouse.has && !G.invOpen) || AIM.on) {
            if (TOUCH && AIM.lock) { lockW(AIM.lock, AIM.A); AIM.zone = AIM.lock.zone; AIM.tgt = AIM.lock.z; }
            else { const pk = pick(AIM.sx, AIM.sy, 1.0); AIM.A.copy(pk.point); AIM.zone = pk.zone || null; AIM.tgt = pk.z || null; }
            const dd = Math.hypot(AIM.A.x - p.x, AIM.A.z - p.z); AIM.Aw.copy(AIM.A); AIM.Aw.x += Math.cos(p.yaw) * swY * dd; AIM.Aw.z -= Math.sin(p.yaw) * swY * dd; AIM.Aw.y += swP * dd;
            if (dd > 0.4) aimYaw = Math.atan2(AIM.A.x - p.x, AIM.A.z - p.z);
          }
          if (TOUCH && !AIM.on && sticks.R && sticks.R.m > 0.2) { // corpo a corpo: o polegar direito aponta
            const sx = sticks.R.x, sy = -sticks.R.y; aimYaw = Math.atan2(RGT.x * sx + FWD.x * sy, RGT.y * sx + FWD.y * sy);
            if (cfg.assist) { let bestA = 0.26, tgt = null; for (const z of G.zs) { if (!inView(z)) continue; const dd = Math.hypot(z.x - p.x, z.z - p.z); if (dd > 3.2) continue; const aa = Math.abs(angDiff(Math.atan2(z.x - p.x, z.z - p.z), aimYaw)); if (aa < bestA && canSee(p, z)) { bestA = aa; tgt = z; } } if (tgt) aimYaw = Math.atan2(tgt.x - p.x, tgt.z - p.z); }
          }
        }
        if (aimYaw === null && G.aimHold > 0) aimYaw = p.aim;
      }
      G.aimHold = Math.max(0, (G.aimHold || 0) - dt);
      const aimingNow = aimYaw !== null;
      const want = aimYaw ?? moveYaw ?? p.aim;
      p.aim += angDiff(want, p.aim) * Math.min(1, dt * (G.fp ? 30 : TOUCH ? 12 : 18));
      // pernas: viram para onde andas; o tronco roda para a mira (até ~70°); de costas anda mais devagar
      let rootT = p.root, back = false;
      if (aimingNow) { if (moving) { const d = angDiff(moveYaw, p.aim); if (Math.abs(d) < 1.75) rootT = p.aim + clamp(d, -1.15, 1.15); else { rootT = p.aim; back = true; } } else if (Math.abs(angDiff(p.aim, p.root)) > 1.2 || G.fp) rootT = p.aim; }
      else if (moving) rootT = moveYaw;
      if (p.climb) rootT = p.climb.yaw;
      const turn = (p.sprint ? 4.5 : 7) * dt; p.root += clamp(angDiff(rootT, p.root), -turn, turn);
      const twist = clamp(angDiff(p.aim, p.root), -1.25, 1.25);
      p.yaw = p.root + twist;
      // correr (baixa a arma)
      const fwdOk = !moving || Math.abs(angDiff(moveYaw, p.root)) < 0.9;
      const over = 0; // sem pesos: anda-se e corre-se sempre à mesma velocidade, leves o que levares
      // na água: nadas devagar, não corres nem usas a arma, e cansas-te; sem fôlego vais perdendo vida
      { const was = p.swim; p.swim = p.alive && !p.climb && !G.car && (p.lv || 0) === 0 && W.wet(p.x, p.z); if (p.swim && !was) { if (AIM.on) aimEnd(); G.ui.toast('A nadar · sem armas e devagar'); } if (p.swim && moving) { p.stam = Math.max(0, p.stam - dt * 3.2); if (p.stam <= 0 && !(G.admF && G.admF.god)) { p.hp -= dt * 2.5; p.hurtT = 0.3; if (p.hp <= 0) die('afogado'); } } }
      const wantSprint = !p.swim && over <= 18 && (keys.has('ShiftLeft') || keys.has('ShiftRight') || (cfg.sprintPush && (!AIM.on || FPF.on) && sticks.L && sticks.L.m > 0.93) || G.autoRun) && il > 0.3 && !p.use && !back && fwdOk && !AIM.scope && !(G.t - (p.fireT ?? -9) < 0.45) && !(G.fireHeld && FPF.on);
      if (wantSprint && AIM.on && !FPF.on) aimEnd(); // na 1.ª pessoa a arma fica na mão a correr (baixa-se sozinha no ecrã)
      if (wantSprint && p.stance === 1 && p.onGround) G.stanceSet(0); // correr levanta quem está agachado (deitado não corre)
      if (!p.onGround && !p.swim && !p.climb) { /* no ar: mantém a corrida (e a velocidade) com que saltou */ } else if (wantSprint && !p.stance && p.stam > 0 && !p.stamLock && p.onGround) { p.sprint = true; p.stam -= dt * 3.3 * (1 - 0.4 * sk('res')) * (1 + over / 20); if (moving) skUp('res', dt * 5.8e-4); if (p.stam <= 0) { p.stam = 0; p.stamLock = true; } } else { p.sprint = false; p.stam = Math.min(100, p.stam + dt * (AIM.breathOn ? 0 : 9 * (1 + 0.3 * sk('res')))); if (p.stam > 20) p.stamLock = false; }
      let spd = p.sprint ? 5.0 : 3.0;
      if (AIM.on && !p.sprint) spd = AIM.scope ? (FPF.on ? sightOf().spd : 1.1) : FPF.on ? 3.0 : 2.4; if (back) spd *= 0.62; if (FPF.on && G.t - (p.fireT ?? -9) < 0.45) spd = Math.min(spd, 2.2); // 1.ª pessoa: a anca é o normal, só a mira abranda; a disparar anda-se mais devagar
      if (moving) spd *= 0.5 + 0.5 * Math.max(0, Math.cos(Math.min(Math.PI / 2, Math.abs(angDiff(moveYaw, p.root)) * (aimingNow ? 0.6 : 1))));
      if (over > 0) spd *= Math.max(0.62, 1 - over / 45);
      if (heldDef().heavy) spd *= 0.88; // CheyTac e Barrett pesam
      if (p.stance === 1) spd = Math.min(spd, 3.0) * 0.5; else if (p.stance === 2) spd = Math.min(spd, 3.0) * 0.24; // agachado a meio passo, deitado a rastejar
      if (p.use) spd = 1.5; if (p.swim) spd = Math.min(spd, p.stam > 0 ? 1.8 : 1.0); if (!p.alive || p.climb) spd = 0;
      let tvx = moving ? wx / Math.max(il, 1e-6) * Math.min(il, 1) * spd : 0, tvz = moving ? wz / Math.max(il, 1e-6) * Math.min(il, 1) * spd : 0;
      // a passar numa porta aberta: puxa-te devagar para o meio do vão, para não ficares preso no aro (no telemóvel o polegar raramente vai certinho)
      if (moving && !p.climb && !G.car) { const v = Math.hypot(tvx, tvz); for (const D of W.doors) { if (D.t < 0.6 || (D.lv || 0) !== (p.lv || 0) || Math.abs(D.x - p.x) > 2 || Math.abs(D.z - p.z) > 2) continue;
        const lat = D.horiz ? p.x - D.x : p.z - D.z, nrm = D.horiz ? p.z - D.z : p.x - D.x, vn = D.horiz ? tvz : tvx, half = (D.w || 1) / 2;
        if (Math.abs(nrm) < 1.5 && Math.abs(lat) < half + 0.85 && Math.abs(lat) > 0.04 && vn * nrm < 0 && Math.abs(vn) > v * 0.35) { const pull = clamp(-lat * 3.2, -v * 0.8, v * 0.8); if (D.horiz) tvx += pull; else tvz += pull; break; } } }
      const air = !p.onGround && !p.swim && !p.climb && p.alive, k = 1 - Math.exp(-dt * (air ? 1.4 : Math.hypot(tvx, tvz) > Math.hypot(p.vx, p.vz) ? 5.5 : 8.5)); p.vx += (tvx - p.vx) * k; p.vz += (tvz - p.vz) * k; // no ar a velocidade quase não muda (inércia), só um pouco de controlo
      const ox = p.x, oz = p.z;
      if (p.climb) { // trepar: sobe, passa para cima ou para o outro lado
        const c = p.climb; c.t = Math.min(1, c.t + dt / c.dur); const e = t => t * t * (3 - 2 * t);
        const hk = e(clamp((c.t - 0.35) / 0.65, 0, 1)); p.x = c.fx + (c.tx - c.fx) * hk; p.z = c.fz + (c.tz - c.fz) * hk;
        p.h = c.t < 0.55 ? c.fh + (c.peak - c.fh) * e(c.t / 0.55) : c.peak + (c.th - c.peak) * e((c.t - 0.55) / 0.45);
        p.vx = p.vz = 0; if (c.t >= 1) { p.climb = null; p.h = c.th; p.vy = 0; }
      } else if (p.alive) {
        p.x += p.vx * dt; p.z += p.vz * dt; collide(p, 0.3); if (!G.car && (p.lv || 0) === 0) G.cars.pushCars(p, 0.3, null); // os carros (também os que andam) não se atravessam
        // gravidade e o que está por baixo dos pés
        const sup = support(p);
        if (p.h > sup + 0.001 || p.vy > 0) { p.vy -= 13 * dt; p.h += p.vy * dt; if (p.h <= sup) { if (p.vy < -9) hurtPlayer(Math.min(60, (-p.vy - 9) * 9), 'queda'); p.h = sup; p.vy = 0; } }
        else { p.h = sup; p.vy = 0; }
        p.onGround = p.h <= sup + 0.02;
      }
      stanceTick(p, dt);
      stairUpdate(p);
      // saíste de um piso de cima por uma janela: cais
      if (p.lv > 0 && !p.st && p.bld && !inShell(p.bld, p.x, p.z)) { p.h += p.base; p.lv = 0; p.base = 0; p.onGround = false; p.vy = Math.min(p.vy, 0); }
      const gy = p.base + groundY(p.x, p.z, p.lv);
      p.y = p.st ? gy : p.y + (gy + p.h - p.y) * Math.min(1, dt * 20); if (p.st || p.climb || !p.onGround) p.y = gy + p.h;
      p.mv = Math.hypot(p.vx, p.vz) / 3.0;
      p.step = ((p.x - ox) * Math.sin(p.root) + (p.z - oz) * Math.cos(p.root));
      // ataque contínuo (rato, polegar no modo «manter para disparar», ou botão de disparo)
      // disparar: só com a arma levantada; automáticas continuam enquanto seguras
      if (p.alive && !G.invOpen && !p.climb) { const d = heldDef(); if (d.gun) { if (AIM.pend && AIM.raise >= 1) { AIM.pend = false; tryFire(); } else if (G.fireHeld && d.gun.auto && AIM.raise >= 1) tryFire(); } else if (mouse.down && !TOUCH) attack(); }
      p.cd -= dt; p.recoil = Math.max(0, p.recoil - dt * 8);
      if (p.swing >= 0) { const dur = Math.min(0.55, p.swingM.cd * 0.85); p.swing += dt / dur; if (!p.swingHit && p.swing >= 0.36) { p.swingHit = true; meleeHit(p.swingM); } if (p.swing >= 1) p.swing = -1; }
      if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) { doReload(); G.ui.refresh(); } }
      if (p.thrT >= 0) { const o0 = p.thrT; p.thrT += dt / 0.7; if (o0 < 0.42 && p.thrT >= 0.42 && p.thrIt) { const it = p.thrIt; p.thrIt = null; if (p.alive && (G.inv.belt.includes(it) || G.inv.where(it))) releaseGrenade(it); } if (p.thrT >= 1) p.thrT = -1; }
      if (p.use) { p.use.t += dt; if (p.use.t >= p.use.dur) { const it = p.use.it, u = ITEMS[it.k].use; if (u.hp) p.hp = Math.min(100, p.hp + u.hp); if (u.bleed) p.bleed = 0; if (u.food) p.food = Math.min(100, p.food + u.food); if (u.sick && Math.random() < u.sick) { p.water = Math.max(0, p.water - 18); p.food = Math.max(0, p.food - 8); p.hp = Math.max(1, p.hp - 5); G.ui.toast('A carne crua fez-te mal: perdeste água. Coze-a antes de comer.'); G.shakeT = 0.3; } if (u.water) p.water = clamp(p.water + u.water, 0, 100); if (u.stam) p.stam = Math.min(100, p.stam + u.stam); consume(it); p.use = null; G.ui.refresh(); } }
      // corpo
      if (p.alive) {
        if (G.ARENA) { p.food = p.water = 100; G.arenaAmmoT = (G.arenaAmmoT || 0) - dt; if (G.arenaAmmoT <= 0) { G.arenaAmmoT = 0.5; // na arena as balas não acabam: os carregadores de reserva enchem-se sozinhos e as balas soltas repõem-se
            const K = ARENA_KITS[G.arenaKitK]; if (K) for (const [c, n] of K.bag) { const d = ITEMS[c]; if (!d) continue; if (d.clip) { for (const m of clipsOf(c)) m.am = d.clip.cap; } else { const have = G.inv.count(c); if (have < n) G.inv.give(mkItem(c, n - have)); } } } }
        const met = 1 - 0.15 * sk('res'); p.food = Math.max(0, p.food - dt * 100 / 1300 * met); p.water = Math.max(0, p.water - dt * 100 / (p.sprint ? 1050 : 1500) * met); // sede: 25 min a andar até secar (17 a correr)
        if (p.bleed) p.hp -= dt * 0.6;
        // a vida volta sozinha, mas gasta comida e água: mais depressa de barriga cheia, parada logo a seguir a levar dano
        p.regen = 0;
        if (p.food <= 0 || p.water <= 0) p.hp -= dt * 0.55;
        else if (p.hp < 100 && !p.bleed && p.food > 20 && p.water > 20 && G.t - (p.hitAt || -99) > 6) { const r = (p.food > 70 && p.water > 70 ? 0.6 : 0.3) * dt, h = Math.min(r, 100 - p.hp); p.hp += h; p.food = Math.max(0, p.food - h * 0.3); p.water = Math.max(0, p.water - h * 0.25); p.regen = 1; }
        if (G.admF && G.admF.god) { p.hp = 100; p.bleed = 0; } // invencível (equipa do jogo)
        if (p.hp <= 0) die(p.bleed ? 'sangue' : p.food <= 0 ? 'fome' : 'sede');
        const d = heldDef(), mode = d.gun ? (d.long ? 'rifle' : 'pistol') : (d.melee && held()) ? 'melee' : (p.swing >= 0 ? 'melee' : 'none');
        const uu = p.use && ITEMS[p.use.it.k] && ITEMS[p.use.it.k].use, ukind = uu ? ((uu.water || 0) > (uu.food || 0) ? 'drink' : uu.food ? 'eat' : 'heal') : null;
        const wf = d.gun ? ray(p.x, p.z, Math.sin(p.yaw), Math.cos(p.yaw), 1.0, null, 's', p.lv || 0, 1.2) : 1; p.wallK = (p.wallK || 0) + (clamp((0.85 - wf) / 0.35, 0, 1) - (p.wallK || 0)) * Math.min(1, dt * 12);
        body.stance = p.sc || 0; body.pose(dt, p.mv, mode, p.swing, p.recoil, twist, p.climb ? p.climb.t : -1, p.step, d.gun ? AIM.raise * (1 - 0.85 * p.wallK) : 1, ukind ? { kind: ukind, t: Math.min(1, p.use.t / p.use.dur) } : null, { rel: p.reload > 0 && p.reloadDur ? 1 - p.reload / p.reloadDur : -1, thr: p.thrT >= 0 ? p.thrT : -1 });
        // passos: um som em cada pé que assenta (relva, betão ou madeira dentro de casa), mais forte a correr
        { const ph = Math.floor(body.phase / Math.PI); if (ph !== G.stepPh) { if (G.stepPh != null && p.onGround && !p.swim && p.mv > 0.15 && !G.car) { const inside = (p.lv || 0) > 0 || !!G.inside; audio.step(inside ? 'madeira' : W.paved(p.x, p.z) ? 'betao' : 'relva', Math.min(1, 0.35 + p.mv * 0.45)); } G.stepPh = ph; } }
        p.swimY = (p.swimY || 0) + ((p.swim ? 0.95 : 0) - (p.swimY || 0)) * Math.min(1, dt * 5);
        { const l = AIM.lean || 0; body.root.position.set(p.x + Math.cos(p.root) * l * 0.14, p.y - p.swimY, p.z - Math.sin(p.root) * l * 0.14); body.root.rotation.set(0, p.root, -l * 0.2, 'YXZ'); }
      }
      p.hurtT -= dt;
      if (G.quit) { const q = G.quit; if (!p.alive || p.hp < q.hp - 0.01 || Math.hypot(p.x - q.x, p.z - q.z) > 0.25) { G.quit = null; G.ui.quitTick(-1); G.ui.toast('Saída cancelada'); } else { q.t -= dt; G.ui.quitTick(q.t); if (q.t <= 0) G.toMenu(); } }
      // limite do mapa: aviso ao chegar perto da linha (no máximo a cada 6 s)
      if (p.alive && MAP - Math.max(Math.abs(p.x), Math.abs(p.z)) < 2.2 && G.t > (G.edgeT || 0)) { G.edgeT = G.t + 6; G.ui.toast('Chegaste ao limite do mapa'); }
      glowBags();
      // interagir
      let best = null, bd = 1.9;
      if (p.alive && !p.climb && p.h < 0.6) for (const c of [...W.containers, ...G.bags]) { if ((c.lv || 0) !== p.lv) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd && los(p.x, p.z, c.x, c.z, [c.x, c.z], 'sg', p.lv, 0.5)) { best = c; bd = d; } }
      const dn = p.alive && !p.climb && p.h < 0.6 ? G.doorAt(p) : null;
      if (dn && (!best || dn.d < bd - 0.2) && (!cfg.autoDoor || Math.hypot(p.vx, p.vz) < 0.5 || !dn.D.auto)) best = { door: dn.D, label: dn.D.lock && dn.D.lock.hp > 0 ? 'Porta trancada' : dn.D.target ? 'Fechar porta' : 'Abrir porta', x: dn.D.x, z: dn.D.z };
      { const T = best && best.door && best.door.base ? { door: best.door.base } : best && best.dep && (best.dep.k === 'bau' || best.dep.k === 'bauG') ? { dep: best.dep } : null; G.lockT = T; // fechadura: porta ou baú da base à tua frente
        if (T) { const h = held(), cl = G.base.lockOf(T); if (h && h.k === 'fechadura' && !cl) best = { ...(T.door ? { door: best.door } : {}), label: 'Pôr fechadura', lockPut: true, x: best.x, z: best.z }; else if (cl === 1 && G.net.world && !G.base.lockMine(T)) best = T.door ? { ...best, label: best.door.target ? 'Fechar porta' : 'Abrir porta · código' } : best; } }
      if (best && best.table === 'bomba' && held() && held().k === 'galaoV') best = { label: 'Encher o galão', pumpFill: true, x: best.x, z: best.z };
      if (G.car) best = { label: (G.car.alt || 0) > 0.8 ? 'Aterra para sair' : VT[G.car.k].two ? 'Descer' : 'Sair', carExit: true, x: p.x, z: p.z };
      if (G.car && G.carSeat === 0 && VT[G.car.k].tank && Math.abs(G.car.v) < 0.5 && G.car.fuel < VT[G.car.k].tank - 1 && W.containers.some(c => c.table === 'bomba' && Math.hypot(c.x - G.car.x, c.z - G.car.z) < 6)) best = { label: 'Abastecer na bomba', carPump: true, x: p.x, z: p.z };
      else if (!G.car && p.alive && !p.climb && !p.lv) { const c = G.cars.nearest(p); if (c) { const cd = Math.hypot(c.x - p.x, c.z - p.z) - 1.2, h = held();
          const T = VT[c.k], nm = T.n.toLowerCase();
          if (!best || cd < bd) best = h && h.k === 'gasolina' && T.tank ? { label: 'Pôr gasolina (' + Math.round(c.fuel) + ' de ' + T.tank + ' L)', car: c, fuel: true, x: c.x, z: c.z } : G.cars.seatFree(c) < 0 ? { label: 'Não há lugar', car: c, full: true, x: c.x, z: c.z } : { label: c.seats[0] ? (T.two ? 'Ir à pendura' : 'Entrar (passageiro)') : c.k === 'bike' ? 'Pedalar' : c.k === 'moto' ? 'Conduzir a mota' : 'Conduzir · ' + nm, car: c, x: c.x, z: c.z }; } }
      // comerciante a menos de 2,6 m
      if (p.alive && !G.car && !p.lv) for (const N of npcs) { const d = Math.hypot(N.T.x - p.x, N.T.z - p.z); if (d < 2.6 && (!best || d < 1.6)) best = { label: 'Negociar com ' + N.T.n, trader: N.T, x: N.T.x, z: N.T.z }; }
      // pedra solta ou planta de fibra a menos de 1,6 m
      if (!best && p.alive && !G.car && !p.lv) { let bn = null, bdn = 1.6; for (const n of nodes) { if (!n.pick || !n.alive) continue; const d = Math.abs(n.x - p.x) + Math.abs(n.z - p.z); if (d > 3) continue; const q = Math.hypot(n.x - p.x, n.z - p.z); if (q < bdn) { bdn = q; bn = n; } } if (bn) best = { label: bn.kind === 'seixo' ? 'Apanhar pedra' : 'Colher planta (tecido)', pickN: bn, x: bn.x, z: bn.z }; }
      // cães: dar comida a um vadio para o adotar; ao teu, dizer para ficar ou vir
      if (p.alive && !G.car && !p.lv && (!best || !best.door || true)) { let dz = null, dd = best ? 1.5 : 2.4; for (const o of G.zs) if (o.an === 'cao' && o.state !== 'dead') { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < dd) { dd = d; dz = o; } }
        if (dz) { const mine = dz.pet && dz.pet === (G.net.world ? G.net.uid : 'local'); if (mine) best = { label: dz.stay ? 'Cão: anda comigo' : 'Cão: fica aqui', dog: dz, x: dz.x, z: dz.z };
          else if (!dz.pet) { const food = DOGFOOD.find(k => G.inv.count(k) > 0); best = { label: food ? 'Dar ' + ITEMS[food].s.toLowerCase() + ' ao cão' : 'Cão vadio · precisa de comida', dog: dz, food, x: dz.x, z: dz.z }; } } }
      if (!best && p.alive && !G.car && !p.lv && p.water < 97 && (p.swim || W.wet(p.x, p.z, 1.4))) best = { label: 'Beber água', drink: true, x: p.x, z: p.z };
      G.prompt = best;
      if (G.net.on) { const d = heldDef(), it = held(), mode = d.gun ? (d.long ? 2 : 1) : d.melee && it ? 3 : 0, eq = G.inv.eq, lvl = s => eq[s] ? ITEMS[eq[s].k].lvl || 0 : 0;
        G.net.frame(dt, { x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +(p.y - (p.swimY || 0)).toFixed(2), lv: p.lv || 0, yaw: +Math.atan2(Math.sin(p.root), Math.cos(p.root)).toFixed(2), mv: +Math.min(3, p.mv || 0).toFixed(2), an: (G.car && !G.leanOut ? 8 : mode + (AIM.on ? 4 : 0) + (p.reload > 0 ? 16 : 0) + (p.thrT >= 0 ? 32 : 0) + (p.use ? 64 : 0)), w: mode ? it.k : '', hp: Math.round(Math.max(0, p.hp)), al: p.alive ? 1 : 0, ar: [lvl('head'), lvl('vest')], gk: GK.map(s => eq[s] ? eq[s].k : '').join(), sc: p.stance | 0 }, o => canSee(p, o)); }
      if (G.box && (Math.hypot(G.box.x - p.x, G.box.z - p.z) > 2.6)) { G.box = null; if (G.invOpen) G.ui.openInv(null); }
      updZombies(dt); G.cars.update(dt);
      // sacos: os vazios desaparecem, os velhos também
      if (!G.net.world) for (let i = G.bags.length - 1; i >= 0; i--) { const b = G.bags[i]; if ((b.grid.empty && G.box !== b) || G.t - b.t > (b.body ? 1500 : 900)) { scene.remove(b.mesh); G.bags.splice(i, 1); if (G.box === b) G.box = null; } }
      // recursos voltam a crescer
      G.nodeT = (G.nodeT || 0) - dt; if (G.nodeT <= 0) { G.nodeT = 2; for (const n of nodes) if (!n.alive && G.t > n.respawn && Math.hypot(n.x - p.x, n.z - p.z) > 25) { n.alive = true; n.hp = n.max; n.col.on = true; showNode(n); } }
      for (const n of nodes) if (n.shake > 0) { n.shake -= dt; const a = Math.sin(n.shake * 60) * n.shake * 0.12; _hm.copy(n.m0).multiply(mat4(0, 0, 0, 0, a, a * 0.5)); if (n.alive) { n.mesh.setMatrixAt(n.idx, n.shake > 0 ? _hm : n.m0); n.mesh.instanceMatrix.needsUpdate = true; } }
      // câmara: segue-te com suavidade, sem olhar à frente (todos veem o mesmo à tua volta)
      vc.set(p.x, p.y, p.z);
      { const kx = 1 - Math.exp(-dt * 9), ky = 1 - Math.exp(-dt * 6), c = G.car; G.camLA = G.camLA || { x: 0, z: 0 }; const la = c ? Math.min(14, Math.abs(c.v) * 0.75) * Math.sign(c.v || 0) : 0, kl = 1 - Math.exp(-dt * 2.2); /* a conduzir, a câmara olha um pouco para onde vais */ G.camLA.x += ((c ? Math.sin(c.yaw) * la : 0) - G.camLA.x) * kl; G.camLA.z += ((c ? Math.cos(c.yaw) * la : 0) - G.camLA.z) * kl; camT.x += (p.x + G.camLA.x - camT.x) * kx; camT.z += (p.z + G.camLA.z - camT.z) * kx; camT.y += (p.base - camT.y) * ky; }
      updBullets(dt);
      // linha de mira no chão quando a arma está levantada
      if (AIM.on && !G.fp && AIM.raise > 0.3 && p.alive) { const L = Math.min(Math.hypot(AIM.A.x - p.x, AIM.A.z - p.z), ray(p.x, p.z, Math.sin(p.yaw), Math.cos(p.yaw), 60, null, 's', p.lv)); aimLine.visible = true; aimLine.position.set(p.x + Math.sin(p.yaw) * 0.5, p.y + 0.06, p.z + Math.cos(p.yaw) * 0.5); aimLine.rotation.y = p.yaw + Math.PI; aimLine.scale.set(1, 1, Math.max(0.5, L - 0.5)); aimLine.material.opacity = 0.35 + 0.65 * AIM.raise; } else aimLine.visible = false;
    } else {
      // ecrã inicial: câmara a rodar devagar à volta do cruzamento
      const a = G.t * 0.04; camT.set(Math.sin(a) * 6, 0, -4 + Math.cos(a) * 4);
      if (!G.attract) { G.attract = true; if (!G.zs.length) popWorld(); }
      updZombies(dt);
    }
    // dia e noite: 25 min de dia (06:00 a 18:00) e 7 min de noite (18:00 a 06:00), ciclo de 32 min
    if (G.net.world) G.cyc = G.net.cyc(); else if (G.playing) G.cyc = ((G.cyc ?? 900) + dt) % 1920; const cy = G.cyc ?? 900;
    G.tod = G.ARENA ? 0.44 : cy < 1500 ? 0.25 + 0.5 * cy / 1500 : (0.75 + 0.5 * (cy - 1500) / 420) % 1; // a arena é sempre de dia (manhã, sombras compridas)
    { const ang = (G.tod - 0.25) * Math.PI * 2, el = Math.sin(ang), D = sm(-0.1, 0.2, el); G.day = D;
      SUNDIR.set(-Math.cos(ang) * 0.9, Math.max(0.18, Math.abs(el)), 0.42).normalize();
      const rn = G.rain || 0; sun.intensity = (0.32 + 2.7 * D) * (1 - 0.6 * rn); sun.color.copy(MOONC).lerp(SUNC, D);
      hemi.intensity = (0.1 + 0.52 * D) * (1 - 0.25 * rn); scene.environmentIntensity = 0.05 + 0.45 * D;
      const dusk = Math.max(0, 1 - Math.abs(D - 0.45) / 0.35) * 0.6;
      _fc.copy(FOGN).lerp(FOGD, D).lerp(FOGS, dusk); if (rn > 0) _fc.lerp(_rc.copy(RAINFOG).multiplyScalar(0.35 + 0.65 * D), 0.55 * rn); if (G.boltT > 0) _fc.lerp(_rc.setRGB(0.85, 0.88, 0.95), Math.min(1, G.boltT * 6) * 0.5); scene.fog.color.copy(_fc); scene.background.copy(_fc); if (G.boltT > 0) hemi.intensity += G.boltT * 6;
      mats.sign.emissiveIntensity = 1.05 + 1.0 * (1 - D); mats.nwin.emissiveIntensity = 1.5 * (1 - D); mats.nwin2.emissiveIntensity = 1.1 * (1 - D); renderer.toneMappingExposure = 1.02 + 0.2 * (1 - D);
      const nt = 1 - D;
      // óculos de visão noturna: ligam sozinhos ao escurecer (mais luz e tudo em verde)
      { const nv = p && p.alive && G.inv && G.inv.eq.eyes ? Math.max(0, Math.min(1, (nt - 0.3) / 0.35)) : 0; G.nv = nv;
        if (nv > 0) { hemi.intensity += 1.3 * nv; scene.environmentIntensity += 0.35 * nv; renderer.toneMappingExposure += 0.75 * nv; _fc.lerp(_rc.setRGB(0.15, 0.19, 0.16), 0.6 * nv); scene.fog.color.copy(_fc); scene.background.copy(_fc); }
        const on = nv > 0.5; if (on !== !!G.nvOn) { G.nvOn = on; renderer.domElement.classList.toggle('nvg', on); if (on && G.playing) G.ui.toast('Visão noturna ligada'); } }
      if (p && G.playing && p.alive) {
        glow.position.set(p.x, p.y + 1.8, p.z); glow.intensity = G.car ? 0 : nt * 3.5;
        if (G.lightOn && !hasLight()) G.lightOn = false;
        const wl = gunLight(), fy = p.yaw, fw = Math.max(0.04, Math.min(0.7, ray(p.x, p.z, Math.sin(fy), Math.cos(fy), 0.9, null, 's', p.lv) - 0.15)); // a lanterna nunca sai do outro lado de uma parede encostada
        if (wl) { torch.intensity = G.lightOn ? 95 : 0; torch.angle = 0.34; torch.distance = 36; if (G.fp) { torch.position.copy(AIM.eye).addScaledVector(AIM.dir, Math.min(0.5, fw)); torch.target.position.copy(AIM.eye).addScaledVector(AIM.dir, 20); } else { torch.position.set(p.x + Math.sin(fy) * fw, p.y + 1.32, p.z + Math.cos(fy) * fw); if (AIM.on && AIM.Aw) torch.target.position.copy(AIM.Aw); else torch.target.position.set(p.x + Math.sin(fy) * 12, p.y + 0.3, p.z + Math.cos(fy) * 12); } }
        else { torch.intensity = G.lightOn ? 70 : 0; torch.angle = 0.5; torch.distance = 28; torch.position.set(p.x + Math.sin(fy) * Math.min(0.3, fw), p.y + 1.45, p.z + Math.cos(fy) * Math.min(0.3, fw)); torch.target.position.set(p.x + Math.sin(fy) * 9, p.y + 0.2, p.z + Math.cos(fy) * 9); }
        if (!renderer.shadowMap.enabled && torch.intensity > 0) { const tp = torch.position, tg = torch.target.position, ddx = tg.x - tp.x, ddz = tg.z - tp.z, dl = Math.hypot(ddx, ddz) || 1; torch.distance = Math.min(torch.distance, ray(tp.x, tp.z, ddx / dl, ddz / dl, torch.distance, null, 's', p.lv, 0.5) + 0.35); } // sem sombras, a luz acaba na primeira parede à frente
        torch.target.updateMatrixWorld();
      } else { glow.intensity = 0; torch.intensity = 0; }
      G.lampT = (G.lampT || 0) - dt;
      if (G.lampT <= 0) { G.lampT = 0.5; const cx = camT.x, cz = camT.z; const bl = G.base.lights().map(l => [l, (l[0] - cx) ** 2 + (l[2] - cz) ** 2]).filter(a => a[1] < 1600).sort((a, b) => a[1] - b[1]);
        baseL.forEach((L, i) => { const q = bl[i]; if (q) { L.position.set(q[0][0], q[0][1], q[0][2]); L.userData.on = 1; L.userData.fire = q[0].fire; } else L.userData.on = 0; });
        const near3 = W.lamps.concat(bl.slice(baseL.length).map(a => a[0])).map(l => [l, (l[0] - cx) ** 2 + (l[2] - cz) ** 2]).filter(a => a[1] < 1600).sort((a, b) => a[1] - b[1]).slice(0, lampL.length); lampL.forEach((L, i) => { const q = near3[i]; if (q) { L.position.set(q[0][0], q[0][1] - 0.4, q[0][2]); L.userData.on = 1; L.userData.big = q[0][1] > 9; L.userData.base = q[0].base; } else L.userData.on = 0; }); }
      lampL.forEach(L => { L.intensity = L.userData.on ? nt * (L.userData.big ? 200 : 26) : 0; L.distance = L.userData.big ? 48 : L.userData.base ? 4 : 20; });
      { const shOn = renderer.shadowMap.enabled; baseL.forEach((L, i) => { const f = L.userData.fire ? 0.85 + 0.1 * Math.sin(G.t * 11 + i) + 0.06 * Math.sin(G.t * 23.7 + i * 2) : 1; L.intensity = L.userData.on ? (L.userData.fire ? 0.1 + 0.9 * nt : 0.35 + 0.65 * nt) * 16 * f * (L.userData.fire || 1) : 0; L.color.setHex(L.userData.fire ? 0xff8a3a : 0xffc27a); L.distance = shOn ? (L.userData.fire ? 6.5 : 9) : (L.userData.fire ? 2.4 : 3); L.castShadow = shOn; L.shadow.autoUpdate = L.intensity > 0; }); torch.shadow.autoUpdate = torch.intensity > 0; } // sem sombras: alcance curto para não iluminar o lado de fora; as sombras só se calculam com a luz acesa (poupa o telemóvel)
      G.base.night(nt); if (lampPools) lampPools.material.opacity = nt * 0.5;
      G.ambT = (G.ambT || 0) - dt; if (G.ambT <= 0) { G.ambT = 0.5; audio.ambience(G.playing && p && p.alive ? D : 0, !!G.inside || !!G.car, 0.25 + 0.5 * (G.rain || 0)); } // pássaros de dia, grilos à noite, vento
    }
    // os zombies de pisos que não estás a ver não aparecem (a não ser que se vejam pelas escadas)
    // e fora do círculo de visão também não (igual para todos os ecrãs); na mira em primeira pessoa vês o que a mira vê
    // e quem não está à vista (paredes, longe demais) também não
    const seen = (x, z, lv) => { if (!G.playing || !p || !p.alive) return true; const d = Math.hypot(x - p.x, z - p.z); if (d < 0.8) return true; return sees(p.x, p.z, x, z, p.lv, p.bld && p.lv > 0 ? p.bld : null) || ((lv || 0) !== p.lv); };
    // só se desenham os que estão no ecrã (ou na mira), estejam a que distância estiverem
    _frus.setFromProjectionMatrix(_pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    if (p) for (const z of G.zs) { _sph.center.set(z.x, (z.y || 0) + 0.9, z.z); const inF = _frus.intersectsSphere(_sph); if (!inF || z.sink >= 0.6) { z.hide = true; continue; } if (G.fp) { z.hide = false; continue; } const zl = z.lv || 0; z.losT = (z.losT || 0) - dt; if (z.losT <= 0) { z.losT = 0.12; z.vis = seen(z.x, z.z, zl); } z.hide = (zl > 0 && !!z.bld && !(z.bld.g[zl] && z.bld.g[zl].visible) && !stairVis(p, z)) || !z.vis; }
    for (const b of G.bags) b.mesh.visible = G.fp || seen(b.x, b.z, b.lv);
    // efeitos
    G.flashT = (G.flashT || 0) - dt; if (G.flashT <= 0) flash.intensity = 0;
    for (let i = pl.length - 1; i >= 0; i--) { const o = pl[i]; o.t -= dt; if (o.t <= 0 || o.y < 0) { pl.splice(i, 1); continue; } o.vy -= 9 * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt; }
    pl.forEach((o, i) => { parts.setMatrixAt(i, mat4(o.x, o.y, o.z, o.t * 9, o.t * 7)); parts.setColorAt(i, o.c); }); parts.count = pl.length; parts.instanceMatrix.needsUpdate = true; if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
    { const pa = trGeo.attributes.position, ca = trGeo.attributes.color; for (let i = 0; i < TRN; i++) { const o = trl[i]; if (o) { o.t -= dt; const f = Math.max(0, o.t / 0.07) * o.k; pa.setXYZ(i * 2, ...o.a); pa.setXYZ(i * 2 + 1, ...o.b); ca.setXYZ(i * 2, 0.6 * f, 0.45 * f, 0.2 * f); ca.setXYZ(i * 2 + 1, 1.6 * f, 1.3 * f, 0.7 * f); } else { pa.setXYZ(i * 2, 0, -9, 0); pa.setXYZ(i * 2 + 1, 0, -9, 0); } } pa.needsUpdate = true; ca.needsUpdate = true; while (trl.length && trl[0].t <= 0) trl.shift(); }
    for (const s of smoke) { s.userData.t = (s.userData.t + dt * 0.12) % 1; const t = s.userData.t; s.position.set(W.smoke[0] + t * 5, W.smoke[1] + t * 11, W.smoke[2] - t * 2.5); const sc = 1.4 + t * 5; s.scale.set(sc, sc, 1); s.material.opacity = 0.55 * (1 - t) * Math.min(1, t * 6); }
    { cam.updateMatrixWorld(); _vfM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _vf.setFromProjectionMatrix(_vfM); } // o que a câmara vê: zombies e animais fora disto não se desenham
    { const p = G.p, nr = G.fp ? 22 : 8; horde.update(G.zs, _vf, z => { if (!p) return 2; const dx = Math.abs(z.x - p.x), dz = Math.abs(z.z - p.z); return dx < nr && dz < nr ? 0 : dx < 26 && dz < 26 ? 1 : 2; }); } /* perto do jogador: o corpo com mais detalhe */ if (!G.ARENA) fauna.update(G.zs, camT, _vf); // os animais estavam parados desde a 0.36 (a chamada tinha ficado dentro de um comentário)
    // árvores ao longe (só na 1.ª pessoa, que vê até à neblina): a versão simples a partir de ~65 m
    G.lodT = (G.lodT || 0) - dt; if (G.lodT <= 0) { G.lodT = 0.25; for (let i = TLOD.length - 1; i >= 0; i--) if (!TLOD[i].hi.parent) TLOD.splice(i, 1); /* setores largados */ const c = cam.position, fpL = !!G.fp; for (const T of TLOD) { const far = fpL && Math.hypot(T.x - c.x, T.z - c.z) > 65; if (T.hi.visible === far) { T.hi.visible = !far; T.lo.visible = far; } } }
    // comerciantes: respiram parados e viram-se para quem chega perto
    Body.cam = cam.position; Body.nearD = (G.fp || FPF.on) ? 22 : 45; // corpos longe: versão leve
    if (G.p) for (const N of npcs) { const dx = G.p.x - N.T.x, dz = G.p.z - N.T.z, d = Math.hypot(dx, dz); if (d > 90) { N.b.root.visible = false; continue; } N.b.root.visible = true; const want = d < 7 ? Math.atan2(dx, dz) : N.T.yaw; N.yaw += angDiff(want, N.yaw) * Math.min(1, dt * 3); N.b.root.rotation.y = N.yaw; N.b.pose(dt, 0, 0); if (G.ui.trOpenNow() && G.ui.trWho && G.ui.trWho() === N.T && d > TRADE_R + 2) G.ui.trClose(); }
    // câmara e sol
    if (G.car && G.carSeat === 0 && p && p.alive && !G.dbgTopCar) { // a conduzir: câmara atrás do carro, perto, que acompanha as curvas devagar
      vm.set('', {}, myLook); const c = G.car, T = VT[c.k], L = T.len || 4, fly = !!T.fly, alt = c.alt || 0;
      if (PROJ.mode !== 'chase') { PROJ.mode = 'chase'; PROJ.dirty = true; G.chY = c.yaw; }
      cam.near = 0.2; cam.far = 520; cam.aspect = innerWidth / innerHeight; cam.fov = innerHeight > innerWidth ? 72 : 60; cam.updateProjectionMatrix();
      const back = c.v < -1.5 ? Math.PI : 0; G.chY += angDiff(c.yaw + back, G.chY) * Math.min(1, dt * (3.8 + Math.min(3, Math.abs(c.v) / 5)));
      const sv = Math.abs(c.v), want = (fly ? L * 1.6 + 4 : L * 0.9 + 3.2) + Math.min(1.4, sv / 15), h = (fly ? 3.4 : 2.35 + L * 0.08) + alt + Math.min(0.4, sv / 35);
      const bx = -Math.sin(G.chY), bz = -Math.cos(G.chY), gy = c.y || 0; let dist = want;
      { const free = ray(c.x, c.z, bx, bz, want + 0.4, null, 's', 0, Math.max(1.2, h - 0.4)); if (free < want + 0.4) dist = Math.max(L * 0.55, free - 0.4); } // parede atrás: a câmara chega-se ao carro
      G.chD = G.chD ?? dist; G.chD += (dist - G.chD) * Math.min(1, dt * (dist < G.chD ? 12 : 3));
      cam.position.set(c.x + bx * G.chD, gy + h, c.z + bz * G.chD); cam.lookAt(c.x - bx * 3.2, gy + 0.9 + alt, c.z - bz * 3.2);
      if (G.shakeT > 0) { G.shakeT -= dt; const a = Math.min(1, G.shakeT) * 0.25; cam.position.x += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a * 0.5; }
    } else if ((G.fp || FPF.on) && p) {
      cam.position.copy(AIM.eye); cam.lookAt(_c.copy(AIM.eye).add(AIM.dir)); if (AIM.lean) cam.rotateZ(-AIM.lean * 0.12);
      // a luneta mostra sempre o mesmo ângulo, em qualquer ecrã; o centro fica no meio da zona livre. Sem apontar (vista livre): campo largo, centro no meio do ecrã
      const a = FPF.on ? AIM.adsT * AIM.adsT * (3 - 2 * AIM.adsT) : 1, scI = scopeItem(), fa = a * (scI && scI.mag >= 2 ? 1 : 0); FPF.fa = FPF.on ? fa : 1;
      const S = G.ui.scopeR(), SC = G.ui.scopeC(), sf = THREE.MathUtils.degToRad(scopeFov()), fS = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(sf / 2) * innerHeight / (2 * S))), fF = fpFov();
      cam.near = FPF.on ? 0.05 + 0.25 * a : 0.3; cam.far = FPF.on ? 142 + 758 * fa : 900; cam.aspect = innerWidth / innerHeight; cam.fov = FPF.on ? fF + ((scI && scI.rd ? Math.min(fS, fF / Math.max(1, scI.mag)) : fS) - fF) * a : fS; /* mira de ferro e ponto vermelho na vista livre: apontar nunca abre o campo (ao alto a fórmula da luneta dava mais do que a vista normal) */ cam.updateProjectionMatrix();
      { const e = cam.projectionMatrix.elements, af = a * (scI && scI.mag >= 2 ? 1 : 0); e[8] = -(SC.x / innerWidth * 2 - 1) * af; e[9] = -(1 - SC.y / innerHeight * 2) * af; /* só as lunetas vão para o meio da zona livre; mira de ferro e ponto vermelho ficam no meio do ecrã, onde estava a cruz */ cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert(); } PROJ.mode = 'fp';
      // braços e o que tens na mão: na vista livre sempre (punhos de mãos vazias); a apontar só com mira de ferro ou ponto vermelho (a luneta tapa o ecrã)
      { const it = held(), at = (it && it.att) || {}, k = it ? it.k : '', att = !at.scope && ironOk(it) ? { ...at, scope: 'iron' } : at, optic = !!(at.scope && at.scope !== 'reddot');
        const show = FPF.on ? !(optic && AIM.adsT > 0.5) : !!(RDP[k] && (att.scope === 'reddot' || att.scope === 'iron'));
        const sm = (v, w) => v + (w - v) * Math.min(1, dt * 9); FPF.rel = sm(FPF.rel || 0, p.reload > 0 ? 1 : 0); FPF.spr = sm(FPF.spr || 0, p.sprint && Math.hypot(p.vx, p.vz) > 1 ? 1 : 0);
        const uu = p.use && ITEMS[p.use.it.k] && ITEMS[p.use.it.k].use, VD = G.vmDbg || {}, use = VD.use || (uu ? { kind: (uu.water || 0) > (uu.food || 0) ? 'drink' : uu.food ? 'eat' : 'heal', t: Math.min(1, p.use.t / p.use.dur) } : null), thr = VD.thr ?? (p.thrT >= 0 ? p.thrT : -1);
        const vk = p.climb ? 'climb' : use ? 'use:' + use.kind : thr >= 0 ? 'granada' : (k || 'mao'), clb = p.climb ? { t: p.climb.t, dy: clamp(p.y - p.h + p.climb.peak - AIM.eye.y, -0.7, 0.2) } : null;
        vm.set(show || use || thr >= 0 || clb ? vk : '', att, myLook); vm.update(dt, cam, { day: G.day, nv: G.nv, mv: Math.min(1, Math.hypot(p.vx || 0, p.vz || 0) / 3), ads: FPF.on ? a : 1, sw: p.swing, rel: FPF.rel, rp: VD.rp ?? (p.reload > 0 && p.reloadDur ? 1 - p.reload / p.reloadDur : -1), rm: p.reloadMode, spr: FPF.spr * (1 - a), up: FPF.on ? FPF.t : 1, raise: heldDef().gun ? AIM.raise : 1, use, thr, climb: clb }); }
    } else {
      vm.set('', {}, myLook);
      if (PROJ.dirty || PROJ.mode !== 'top') topProj();
      const e = AIM.fpT > 0 && p ? easeD(Math.min(1, AIM.fpT / 0.55)) : 0;
      v3b.copy(camT); if (e > 0) { v3b.x += (AIM.A.x - camT.x) * 0.45 * e; v3b.z += (AIM.A.z - camT.z) * 0.45 * e; v3b.y = camT.y + 0.4 * e; }
      cam.position.copy(v3b).add(camOff((1 - 0.72 * e) * (G.car ? 1 + 0.35 * Math.min(1, Math.abs(G.car.v) / 17) + (G.car.alt || 0) / 26 : 1))); if (G.shakeT > 0) { G.shakeT -= dt; const a = Math.min(1, G.shakeT) * 0.9; cam.position.x += (Math.random() - 0.5) * a; cam.position.z += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a * 0.5; } cam.lookAt(v3b.x, v3b.y + 1.0, v3b.z);
    }
    // troca de vista: da câmara de antes para a de agora, em ~0,34 s (posição, rotação e projeção)
    if (FPF.t < 1 && p && PROJ.mode !== 'chase') { const e = FPF.t * FPF.t * (3 - 2 * FPF.t); cam.position.lerpVectors(FPF.P, cam.position, e); _qF.copy(cam.quaternion); cam.quaternion.copy(FPF.Q).slerp(_qF, e); const A0 = FPF.M.elements, B0 = cam.projectionMatrix.elements; for (let i = 0; i < 16; i++) B0[i] = A0[i] + (B0[i] - A0[i]) * e; cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert(); PROJ.dirty = true; }
    cam.updateMatrixWorld();
    { const fa = G.fp ? FPF.fa ?? 1 : 0; scene.fog.near = G.fp ? 40 + 260 * fa : 62; scene.fog.far = G.fp ? 138 + 712 * fa : 150; } // vista livre: neblina aos ~140 m (poupa o telemóvel: o que está para lá não se desenha)
    { const sc0 = G.fp ? _c.copy(AIM.eye).addScaledVector(AIM.dir, Math.min(AIM.dist || 30, 60)) : camT; const tx = Math.round(sc0.x / 0.5) * 0.5, tz = Math.round(sc0.z / 0.5) * 0.5, ty = G.fp ? 0 : camT.y;
      sun.target.position.set(tx, ty, tz); sun.position.set(tx, ty, tz).addScaledVector(SUNDIR, 70); sun.target.updateMatrixWorld(); }
    // círculo de visão
    // máscara da linha de vista (refeita quando te mexes ou uma porta muda)
    if (p && G.playing && p.alive && !G.fp) { VU.uVisK.value = 0.06 + 0.03 * (G.day ?? 1); VIS.t -= dt; const dk = W.doors.reduce((a, D) => a + (D.rc.off ? 1 : 0), 0) + ':' + p.lv + ':' + Math.round((AIM.lean || 0) * 4); VIS.cd = (VIS.cd || 0) - dt; const lo = (AIM.lean || 0) * LEAN, vcx = p.x + Math.cos(p.yaw) * lo, vcz = p.z - Math.sin(p.yaw) * lo; if (Math.hypot(vcx - VIS.x, vcz - VIS.z) > 0.002 || dk !== VIS.key || VIS.t <= 0) { VIS.x = vcx; VIS.z = vcz; VIS.key = dk; VIS.t = 0.5; drawVis(vcx, vcz, p.lv, p.bld && p.lv > 0 ? p.bld : null); } }
    else { VU.uVisK.value = 1; VU.uVisO.value.set(1e7, 1e7); VIS.key = ''; } // 1.ª pessoa: sem a sombra de "fora da vista" (só faz sentido vista de cima)
    if (G0.xray) G0.xray.visible = !G.fp && !FPF.on && !onRoof(G.p); // em 1.ª pessoa não há contornos; em cima de um telhado, os contornos das portas lá de baixo atravessavam-no
    body.root.visible = !!(p && G.playing && p.alive && (!G.fp || G.dbgShowBody) && (!G.car || G.leanOut));
    // onde fica o círculo no ecrã (para os sons à volta e a mira)
    if (p && G.playing && !G.fp) { const c0 = toScreen(_c.set(vc.x, p.y + 0.9, vc.z)), S = G.ui.safe(); G.view = { cx: c0.x, cy: c0.y, rx: Math.max(60, Math.min(c0.x - S.x0, S.x1 - c0.x) - 34), ry: Math.max(60, Math.min(c0.y - S.y0, S.y1 - c0.y) - 34), fp: false }; }
    else { const SC = G.ui.scopeC(); G.view = { cx: SC.x, cy: SC.y, rx: G.ui.scopeR(), ry: G.ui.scopeR(), fp: true, yaw: AIM.fy }; }
    // vidros guardam a opacidade própria (o0): o desvanecer multiplica-a em vez de a substituir
    const fade = (c, L, f) => { c.fv[L] = f; for (const m of c.mats[L]) { m.opacity = f * m.userData.o0; const tr = m.userData.t0 || f < 0.995; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } } };
    // telhados e andares de cima: somem quando estás lá dentro ou quando te tapam; ao subir as escadas o piso de cima vai aparecendo
    if (p && G.playing && G.fp) { for (const c of W.cuts) { if (!c.shell) { c.group.visible = true; continue; } for (let L = 0; L < c.n; L++) { c.gt[L].visible = true; if (L) { c.g[L].visible = true; if (c.fv[L] < 1) fade(c, L, 1); } } c.gR.visible = true; } }
    else if (p && G.playing) {
      v3a.copy(cam.position);
      const occ = c => { if (!(Math.abs(c.x0 + c.x1 - 2 * p.x) < (c.x1 - c.x0) + 30 && p.z < c.z1 + 2 && p.z > c.z0 - 40)) return false; v3b.set(p.x, p.y + 1.1, p.z); if (box3(v3a, v3b, c)) return true; v3b.set(p.x, p.y + 0.3, p.z); return box3(v3a, v3b, c); };
      // ver para lá dos prédios: pontos do chão que consegues ver na direção para onde estás virado ou a apontar (até 15 m, parados na 1.ª parede);
      // o prédio que tapa pelo menos dois desses pontos à câmara sai da frente durante ~1 s. Os outros ficam: nada some sem motivo
      const wasIn = G.inside; G.lookCd = (G.lookCd || 0) - dt; const lookTick = G.lookCd <= 0 && !wasIn && p.alive;
      if (lookTick) { G.lookCd = 0.15; const P = G.lookPts = []; for (let i = -3; i <= 3; i++) { const a = p.yaw + i * 0.4, dx = Math.sin(a), dz = Math.cos(a), md = ray(p.x, p.z, dx, dz, 15, null, 's', p.lv); for (const d of [3.5, 7, 11, 15]) { if (d > md - 0.3) break; P.push(p.x + dx * d, p.z + dz * d); } } }
      const hid = c => { if (lookTick && G.lookPts && Math.abs((c.x0 + c.x1) / 2 - p.x) < 45 && Math.abs((c.z0 + c.z1) / 2 - p.z) < 45) { const P = G.lookPts; let n = 0; for (let k = 0; k < P.length; k += 2) { v3b.set(P[k], p.y + 1.0, P[k + 1]); if (box3(v3a, v3b, c) && ++n >= 2) { c.lookT = G.t + 0.9; break; } } } return c.lookT > G.t; };
      G.inside = null;
      for (const c of W.cuts) {
        if (!c.shell) { const h = hid(c); c.group.visible = !(h || occ(c)); continue; }
        if (p.bld === c && onRoof(p)) { for (let L = 0; L < c.n; L++) { c.gt[L].visible = true; if (L) { c.g[L].visible = true; if (c.fv[L] < 1) fade(c, L, 1); } } c.gR.visible = true; continue; } // em cima do telhado: o prédio todo à vista
        const inside = inShell(c, p.x, p.z) && (p.lv === 0 || p.bld === c || (p.st && p.st.b === c));
        if (inside) G.inside = c;
        if (!inside && p.lv === 0 && peekAt(c)) { for (let L = 0; L < c.n; L++) { c.gt[L].visible = L > 0 ? false : false; if (L) c.g[L].visible = false; } c.gR.visible = false; continue; }
        if (!inside) { const h = hid(c), o = !G.inside && (h || occ(c)); for (let L = 0; L < c.n; L++) { c.gt[L].visible = !o; if (L) { c.g[L].visible = !o; if (c.fv[L] < 1) fade(c, L, 1); } } c.gR.visible = !o; continue; }
        const st = p.st && p.st.b === c ? p.st : null, vl = st ? st.lv : p.lv;
        for (let L = 0; L < c.n; L++) {
          if (L < vl) { c.gt[L].visible = true; if (L) { c.g[L].visible = true; fade(c, L, 1); } }
          else if (L === vl) { c.gt[L].visible = false; if (L) { c.g[L].visible = true; fade(c, L, 1); } }
          else if (L === vl + 1 && st) { c.gt[L].visible = false; c.g[L].visible = p.stT > 0.02; fade(c, L, Math.min(1, p.stT * 1.15)); }
          else { c.gt[L].visible = false; if (L) c.g[L].visible = false; }
        }
        c.gR.visible = false;
      }
    }
    doorMats();
    G.vmOn = G.fp && vm.on;
    G.ui.frame(dt);
    // pormenores (postes, cadeiras, placas, carros parados, mobília): longe da câmara não se desenham (poupa triângulos no telemóvel)
    { thinT -= 1; if (thinT <= 0) { thinT = 8; if (scene.children.length !== thinN) { thinN = scene.children.length; thinL.length = 0; for (const o of scene.children) { if (o.isMesh && o.userData.thin && o.geometry.boundingBox) thinL.push(o); else if (o.isGroup) for (const c of o.children) if (c.isMesh && c.userData.thin && c.geometry.boundingBox) thinL.push(c); } }
        const cp = cam.position, D = G.fpv && G.fpv.on ? THIN_D : THIN_D * 2; for (const m of thinL) { const bb = m.geometry.boundingBox, dx = Math.max(bb.min.x - cp.x, 0, cp.x - bb.max.x), dz = Math.max(bb.min.z - cp.z, 0, cp.z - bb.max.z); m.visible = dx * dx + dz * dz < D * D; } } }
    if (window.__rinfoOn) { renderer.info.autoReset = false; renderer.info.reset(); }
    fireFrame(G.t, renderer, cam); renderer.render(scene, cam);
    if (G.vmOn) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(vm.scene, vm.cam); renderer.autoClear = true; }
  };
  await LP(96, 'quase pronto');
  body.root.visible = false;
  G.p = newPlayer(0, -2); G.p.alive = false;
  await LP(98, 'a preparar os gráficos'); // compila os shaders antes de mostrar o menu (senão o 1.º desenho prendia o ecrã)
  try { if (renderer.compileAsync) await wait(renderer.compileAsync(scene, cam), 20000); } catch (e) { }
  loop(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); // 1.º desenho ainda atrás do ecrã de carregamento
  G.ui.ready();
  window.__ready = true;
}
