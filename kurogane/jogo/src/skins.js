import * as THREE from 'three';
import { wear, WR } from './wear.js';
// Skins das armas: cada uma abre num nível (experiência ganha online). Só pintam as partes escuras da arma (corpo, carregador,
// cano); a madeira fica. O padrão é posto pelas coordenadas da própria arma, por isso não escorrega quando ela se mexe.
export const SKINS = [
  { n: 'Original', lv: 1 },
  { n: 'Floresta', lv: 2, p: 'camo', c: ['#26301a', '#4b5226', '#16120b', '#6b5a37'] },
  { n: 'Deserto', lv: 3, p: 'camo', c: ['#a98a5c', '#7d6038', '#c7b083', '#5a4326'] },
  { n: 'Urbano', lv: 5, p: 'camo', c: ['#5f6266', '#33363a', '#9a9da1', '#17181a'] },
  { n: 'Neve', lv: 7, p: 'camo', c: ['#d9dde0', '#a8afb6', '#f1f2f3', '#6d747b'] },
  { n: 'Tigre', lv: 10, p: 'tiger', c: ['#d0601a', '#151110'] },
  { n: 'Carmesim', lv: 14, p: 'solid', c: ['#7a1414'] },
  { n: 'Ouro', lv: 20, p: 'gold', c: ['#f0b85a'] },
];
export const SKIN_LV = SKINS.map(s => s.lv);
const lin = h => { const c = new THREE.Color(h); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; }; // THREE.Color já converte para linear
const pre = i => { const S = SKINS[i], C = S.c.map(lin);
  const pat = S.p === 'camo' ? `float n1 = texture2D(uWear, q * 0.55 + 0.13).r, n2 = texture2D(uWear, q * 0.95 + 0.61).r; vec3 col = ${C[0]};
      col = mix(col, ${C[1]}, smoothstep(0.5, 0.53, n1)); col = mix(col, ${C[2]}, smoothstep(0.6, 0.63, n2)); col = mix(col, ${C[3]}, 1.0 - smoothstep(0.38, 0.41, n1)); skM = -0.35; skR = 0.12;`
    : S.p === 'tiger' ? `float st = fract(dot(q, vec2(9.0, 5.5)) + texture2D(uWear, q * 0.5).r * 3.0); vec3 col = mix(${C[0]}, ${C[1]}, smoothstep(0.58, 0.62, st) * (1.0 - smoothstep(0.86, 0.9, st))); skM = -0.35; skR = 0.08;`
    : S.p === 'gold' ? `vec3 col = ${C[0]} * (0.85 + 0.3 * texture2D(uWear, q * 1.3).r); skM = 0.9; skR = -0.3;`
    : `vec3 col = ${C[0]}; skM = -0.3; skR = -0.05;`;
  return `{ vec3 c0 = diffuseColor.rgb / max(diffuse, vec3(0.001)); float mx = max(c0.r, max(c0.g, c0.b)), mn = min(c0.r, min(c0.g, c0.b));
    float sel = (1.0 - smoothstep(0.025, 0.07, mx - mn)) * (1.0 - smoothstep(0.32, 0.45, mx));
    if (sel > 0.01) { vec3 an = abs(normalize(vWrN)); vec2 q = an.x > an.y && an.x > an.z ? vWrP.zy : (an.y > an.z ? vWrP.xz : vWrP.xy);
      ${pat} diffuseColor.rgb = mix(diffuseColor.rgb, col * diffuse, sel); skM *= sel; skR *= sel; skA = sel; } }`; };
const CACHE = new WeakMap();
export const skinOf = (m0, i) => { const W = WR.get(m0); if (!i || !W || !SKINS[i]) return m0; let C = CACHE.get(m0); if (!C) CACHE.set(m0, C = []);
  return C[i] || (C[i] = wear(new THREE.MeshStandardMaterial().copy(m0), W.key + '-s' + i, W.met, W.sc, pre(i))); };
export const applySkin = (root, i) => { if (!root) return; root.traverse(o => { if (!o.isMesh) return; const m0 = o.userData.m0 || (o.userData.m0 = o.material); o.material = skinOf(m0, i | 0); }); };
// skin escolhida para cada arma (por perfil, neste aparelho)
const key = id => 'kg.skins.' + (id || 'x');
export const loadSkins = id => { try { return JSON.parse(localStorage.getItem(key(id)) || '{}') || {}; } catch (e) { return {}; } };
export const saveSkins = (id, o) => { try { localStorage.setItem(key(id), JSON.stringify(o)); } catch (e) { } };
