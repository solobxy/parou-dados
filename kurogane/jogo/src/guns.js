// Armas desenhadas peça a peça (as mesmas na mão, na primeira pessoa e nos ícones do inventário).
// Eixos: z para a frente (cano), y para cima, x para a direita. Os pontos de encaixe (ponta do cano, calha da mira, punho, guarda-mão)
// ficam onde já estavam, para o silenciador, as miras, a lanterna e as mãos continuarem certos.
const BLK = 0x1c1e21, GUN = 0x26282b, PARK = 0x2f3236, POLY = 0x2a2c30, WOOD = 0x7a4a2a, WOOD2 = 0x8a5a32, TAN = 0x6f6650;
const R2 = Math.PI / 2;
import { GUNSDATA } from './gunsdata.js';
// armas novas (Blender, tamanho real): descodificadas uma vez e juntadas ao Builder por cor e material
const _gd = {};
const gb64 = (s, T) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); };
export const dataTpl = (D, k, C = {}) => C[k] || (C[k] = D[k].g.map(G => { const S = D[k].s, P = gb64(G.p, Int16Array), N = gb64(G.n, Int8Array), I = gb64(G.i, G.w === 4 ? Uint32Array : Uint16Array), n = I.length;
  const p = new Float32Array(n * 3), nn = new Float32Array(n * 3); for (let t = 0; t < n; t++) { const v = I[t]; for (let c = 0; c < 3; c++) { p[t * 3 + c] = P[v * 3 + c] / 32767 * S; nn[t * 3 + c] = N[v * 3 + c] / 127; } }
  return { c: G.c, m: G.m, g: { tpl: true, p, n: nn, uv: new Float32Array(n * 2) } }; }));
const gunTpl = k => dataTpl(GUNSDATA, k, _gd);
const blendGun = k => b => { for (const T of gunTpl(k)) b.add(T.g, T.c, T.m); };
// pontos de encaixe das armas novas (boca do cano, calha, mira de ferro, lanterna, punho, guarda-mão)
export const GUNA = k => GUNSDATA[k] ? GUNSDATA[k].a : null;
// peças soltas para as recargas (carregador, ferrolho, bomba): mesmo espaço da arma, desenhadas à parte
const partTpl = (k, t) => dataTpl({ [k + '#' + t]: { g: GUNSDATA[k].t[t], s: GUNSDATA[k].s } }, k + '#' + t, _gd);
export const GUNP = {}; for (const k in GUNSDATA) if (GUNSDATA[k].t) for (const t in GUNSDATA[k].t) GUNP[t + '_' + k] = b => { for (const T of partTpl(k, t)) b.add(T.g, T.c, T.m); };

// calha picatinny: barra com dentes
const rail = (b, y, z0, z1, w = 0.028) => { const L = z1 - z0; b.box(w, 0.01, L, 0, y, (z0 + z1) / 2, BLK, { mat: 'm' }); for (let z = z0 + 0.008; z < z1 - 0.004; z += 0.02) b.box(w + 0.006, 0.007, 0.009, 0, y + 0.007, z, BLK, { mat: 'm' }); };
// guarda-mato e gatilho
const trig = (b, y, z, s = 1) => { b.box(0.008, 0.006, 0.07 * s, 0, y - 0.03 * s, z, BLK, { mat: 'm' }); b.box(0.008, 0.03 * s, 0.006, 0, y - 0.015 * s, z + 0.035 * s, BLK, { mat: 'm' }); b.box(0.005, 0.022 * s, 0.006, 0, y - 0.012 * s, z - 0.004, 0x3a3c3e, { mat: 'm', rx: -0.3 }); };
// carregador curvo em segmentos
const curvedMag = (b, y, z, w, d, segH, n, bend, col, mat = 'v') => { let cy = y, cz = z, a = 0.08; for (let i = 0; i < n; i++) { b.box(w, segH + 0.004, d, 0, cy - segH / 2, cz, col, { mat, rx: a }); cy -= Math.cos(a) * segH; cz += Math.sin(a) * segH; a += bend; } b.box(w + 0.006, 0.012, d + 0.01, 0, cy - 0.004, cz, BLK, { rx: a - bend }); };

const GUNS0 = {
  m4: b => {
    b.box(0.058, 0.068, 0.26, 0, -0.03, 0.09, GUN, { mat: 'm' }); // corpo de baixo
    b.rbox(0.062, 0.058, 0.3, 0.008, 0, 0.03, 0.11, PARK, { mat: 'm' }); // corpo de cima
    rail(b, 0.064, -0.04, 0.26);
    b.box(0.003, 0.024, 0.07, 0.032, 0.028, 0.13, 0x3a3c3e, { mat: 'm' }); b.box(0.012, 0.012, 0.012, 0.036, 0.04, 0.06, BLK, { mat: 'm' }); // tampa da janela de ejeção e assistente
    b.box(0.03, 0.01, 0.035, 0, 0.06, -0.035, BLK, { mat: 'm' }); // manípulo de armar
    b.box(0.052, 0.055, 0.09, 0, -0.08, 0.17, GUN, { mat: 'm' }); // poço do carregador
    curvedMag(b, -0.105, 0.172, 0.026, 0.07, 0.05, 3, 0.09, 0x2a2c2e, 'm');
    trig(b, -0.062, 0.07);
    b.rbox(0.036, 0.1, 0.048, 0.012, 0, -0.1, -0.015, POLY, { rx: -0.33 }); for (let i = 0; i < 4; i++) b.box(0.038, 0.004, 0.006, 0, -0.07 - i * 0.022, 0.012 - i * 0.008, BLK, { rx: -0.33 }); // punho com estrias
    b.cyl(0.017, 0.017, 0.2, 12, 0, 0.008, -0.12, BLK, { rx: R2, mat: 'm' }); // tubo da coronha
    b.rbox(0.05, 0.1, 0.15, 0.015, 0, -0.012, -0.29, TAN); b.box(0.04, 0.03, 0.12, 0, 0.042, -0.28, TAN); b.box(0.052, 0.12, 0.016, 0, -0.012, -0.372, BLK); // coronha com apoio da face e chapa
    b.cyl(0.034, 0.034, 0.32, 8, 0, 0.006, 0.5, POLY, { rx: R2 }); rail(b, 0.043, 0.36, 0.64, 0.026); // guarda-mão
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) b.box(0.004, 0.012, 0.03, s * 0.034, 0.0, 0.39 + i * 0.045, 0x121315); // aberturas
    b.box(0.072, 0.072, 0.012, 0, 0.006, 0.66, GUN, { mat: 'm' }); // anel do guarda-mão
    b.box(0.012, 0.06, 0.016, 0, 0.05, 0.72, BLK, { mat: 'm' }); b.box(0.03, 0.012, 0.03, 0, 0.018, 0.72, BLK, { mat: 'm' }); // ponto de mira da frente
    b.cyl(0.011, 0.011, 0.28, 10, 0, 0.005, 0.8, BLK, { rx: R2, mat: 'm' }); // cano
    b.cyl(0.014, 0.014, 0.05, 10, 0, 0.005, 0.955, BLK, { rx: R2, mat: 'm' }); for (let i = 0; i < 3; i++) b.box(0.003, 0.03, 0.03, Math.sin(i * 2.1) * 0.013, 0.005 + Math.cos(i * 2.1) * 0.013, 0.962, 0x0c0c0d); // tapa-chamas
    b.box(0.026, 0.008, 0.02, 0, 0.074, -0.02, BLK, { mat: 'm' }); for (const sx of [-1, 1]) b.box(0.007, 0.024, 0.018, sx * 0.0095, 0.088, -0.02, BLK, { mat: 'm' }); // mira de trás aberta (deixa ver a de frente)
  },
  ak: b => {
    b.box(0.058, 0.07, 0.36, 0, -0.005, 0.1, 0x34363a, { mat: 'm' }); b.rbox(0.056, 0.03, 0.33, 0.012, 0, 0.038, 0.1, 0x3a3c40, { mat: 'm' }); // corpo e tampa
    for (let i = 0; i < 3; i++) b.box(0.002, 0.016, 0.012, 0.03, 0.006, 0.0 + i * 0.03, 0x1a1b1d); // rebites
    b.box(0.012, 0.03, 0.06, 0.032, 0.0, 0.17, 0x2a2b2d, { mat: 'm' }); b.box(0.02, 0.008, 0.06, 0.034, 0.015, 0.1, 0x2a2b2d, { mat: 'm' }); // seletor e janela
    b.box(0.03, 0.03, 0.07, 0, 0.055, 0.31, 0x2a2b2d, { mat: 'm' }); // bloco da mira de trás
    b.rbox(0.07, 0.062, 0.24, 0.016, 0, -0.008, 0.46, WOOD2); for (let i = 0; i < 3; i++) for (const s of [-1, 1]) b.box(0.003, 0.012, 0.16, s * 0.035, -0.012 + i * 0.016, 0.47, 0x5a3820); // guarda-mão de madeira com sulcos
    b.cyl(0.018, 0.018, 0.2, 10, 0, 0.046, 0.45, WOOD2, { rx: R2 }); b.cyl(0.011, 0.011, 0.08, 8, 0, 0.048, 0.6, 0x2a2b2d, { rx: R2, mat: 'm' }); b.box(0.03, 0.05, 0.04, 0, 0.025, 0.64, 0x2a2b2d, { mat: 'm' }); // tubo de gases
    b.cyl(0.011, 0.011, 0.26, 10, 0, 0.008, 0.73, BLK, { rx: R2, mat: 'm' }); b.box(0.02, 0.045, 0.02, 0, 0.035, 0.82, 0x2a2b2d, { mat: 'm' }); b.cyl(0.015, 0.013, 0.05, 10, 0, 0.008, 0.87, 0x2a2b2d, { rx: R2, mat: 'm' }); // cano, mira, freio de boca
    curvedMag(b, -0.04, 0.2, 0.026, 0.075, 0.045, 4, 0.16, 0x6a3a22);
    trig(b, -0.04, 0.09);
    b.rbox(0.038, 0.1, 0.05, 0.012, 0, -0.085, -0.03, 0x5a3220, { rx: -0.35 });
    b.rbox(0.05, 0.08, 0.1, 0.012, 0, -0.03, -0.11, WOOD, { rx: 0.18 }); b.rbox(0.054, 0.12, 0.24, 0.02, 0, -0.055, -0.27, WOOD, { rx: 0.1 }); b.box(0.056, 0.125, 0.014, 0, -0.07, -0.39, 0x2a2b2d, { rx: 0.1, mat: 'm' }); // coronha
  },
  smg: b => {
    b.cyl(0.028, 0.028, 0.36, 12, 0, 0.008, 0.1, 0x2a2c2f, { rx: R2, mat: 'm' }); b.box(0.05, 0.05, 0.26, 0, -0.012, 0.08, 0x2a2c2f, { mat: 'm' });
    b.box(0.004, 0.02, 0.05, 0.03, 0.01, 0.12, 0x111214); b.box(0.016, 0.01, 0.04, 0.03, 0.03, 0.0, BLK, { mat: 'm' }); // janela e manípulo
    b.rbox(0.056, 0.058, 0.13, 0.016, 0, -0.012, 0.27, POLY); for (let i = 0; i < 4; i++) b.box(0.058, 0.004, 0.11, 0, -0.03 + i * 0.012, 0.27, 0x1a1b1d);
    b.cyl(0.011, 0.011, 0.08, 10, 0, 0.008, 0.37, BLK, { rx: R2, mat: 'm' }); b.cyl(0.016, 0.016, 0.012, 12, 0, 0.008, 0.405, BLK, { rx: R2, mat: 'm' });
    b.cyl(0.02, 0.02, 0.02, 12, 0, 0.05, 0.33, BLK, { rx: R2, mat: 'm', open: true }); b.box(0.006, 0.03, 0.006, 0, 0.045, 0.33, BLK); b.cyl(0.014, 0.014, 0.02, 10, 0, 0.05, -0.05, BLK, { rz: R2, mat: 'm' }); // mira de túnel e tambor
    curvedMag(b, -0.03, 0.16, 0.024, 0.04, 0.045, 3, 0.12, 0x2a2c2f, 'm');
    trig(b, -0.04, 0.04);
    b.rbox(0.036, 0.1, 0.045, 0.012, 0, -0.085, -0.01, POLY, { rx: -0.25 });
    for (const s of [-1, 1]) b.cyl(0.006, 0.006, 0.2, 6, s * 0.022, 0.0, -0.15, BLK, { rx: R2, mat: 'm' }); b.box(0.05, 0.09, 0.02, 0, -0.02, -0.25, BLK, { mat: 'm' }); // coronha retrátil
  },
  pistola: b => {
    b.rbox(0.031, 0.042, 0.2, 0.006, 0, 0.034, 0.066, 0x2b2d30, { mat: 'm' }); // corrediça
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) b.box(0.002, 0.03, 0.004, s * 0.0155, 0.034, -0.02 + i * 0.008, 0x111214); // estrias
    b.box(0.002, 0.016, 0.04, 0.016, 0.042, 0.07, 0x141517); b.box(0.008, 0.008, 0.008, 0, 0.059, 0.15, BLK); b.box(0.016, 0.009, 0.008, 0, 0.059, -0.02, BLK); // janela e miras
    b.cyl(0.0065, 0.0065, 0.01, 10, 0, 0.034, 0.167, 0x0c0c0d, { rx: R2 }); // boca do cano
    b.rbox(0.029, 0.024, 0.16, 0.006, 0, 0.004, 0.06, POLY); for (let i = 0; i < 3; i++) b.box(0.03, 0.003, 0.004, 0, -0.006, 0.1 + i * 0.012, BLK); // armação com calha
    b.box(0.008, 0.005, 0.05, 0, -0.022, 0.035, POLY); b.box(0.008, 0.02, 0.005, 0, -0.013, 0.06, POLY); b.box(0.005, 0.016, 0.005, 0, -0.01, 0.024, 0x3a3c3e, { rx: -0.2 }); // guarda-mato e gatilho
    b.rbox(0.031, 0.11, 0.048, 0.01, 0, -0.045, -0.018, POLY, { rx: 0.28 }); for (let i = 0; i < 5; i++) b.box(0.032, 0.004, 0.04, 0, -0.02 - i * 0.016, -0.012 - i * 0.0045, 0x1a1b1d, { rx: 0.28 }); // punho com textura
    b.box(0.034, 0.01, 0.052, 0, -0.1, -0.034, BLK, { rx: 0.28 }); // base do carregador
  },
  revolver: b => {
    b.cyl(0.0105, 0.0105, 0.15, 10, 0, 0.04, 0.115, 0x3a3d40, { rx: R2, mat: 'm' }); b.box(0.012, 0.008, 0.15, 0, 0.052, 0.115, 0x3a3d40, { mat: 'm' }); b.box(0.004, 0.012, 0.008, 0, 0.06, 0.185, BLK); // cano com nervura e mira
    b.box(0.014, 0.014, 0.12, 0, 0.022, 0.115, 0x3a3d40, { mat: 'm' }); // haste do extrator
    b.cyl(0.025, 0.025, 0.046, 12, 0, 0.032, 0.02, 0x4a4d50, { rx: R2, mat: 'm' }); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.box(0.006, 0.006, 0.04, Math.sin(a) * 0.024, 0.032 + Math.cos(a) * 0.024, 0.02, 0x1a1b1d); } // tambor com caneluras
    b.rbox(0.03, 0.05, 0.08, 0.01, 0, 0.03, -0.035, 0x3a3d40, { mat: 'm' }); b.box(0.01, 0.022, 0.016, 0, 0.06, -0.07, 0x2a2b2d, { rx: -0.6, mat: 'm' }); // armação e cão
    trig(b, 0.012, -0.015, 0.8);
    b.rbox(0.032, 0.1, 0.045, 0.014, 0, -0.04, -0.07, 0x6a4026, { rx: 0.38 }); b.cyl(0.005, 0.005, 0.034, 8, 0, -0.035, -0.07, 0xc9a14a, { rz: R2, mat: 'm' }); // punho de madeira
  },
  cacadeira: b => {
    b.cyl(0.018, 0.018, 0.72, 12, 0, 0.032, 0.5, BLK, { rx: R2, mat: 'm' }); b.box(0.008, 0.006, 0.7, 0, 0.052, 0.5, BLK, { mat: 'm' }); b.sph(0.005, 0, 0.058, 0.85, 0xd8d0b0, { mat: 'm' }); // cano com nervura e mira de esfera
    b.cyl(0.016, 0.016, 0.6, 12, 0, -0.012, 0.42, 0x2a2c2e, { rx: R2, mat: 'm' }); b.cyl(0.018, 0.018, 0.02, 12, 0, -0.012, 0.73, BLK, { rx: R2, mat: 'm' }); // tubo do carregador
    b.rbox(0.062, 0.06, 0.2, 0.02, 0, -0.012, 0.36, WOOD2); for (let i = 0; i < 6; i++) b.cyl(0.0315, 0.0315, 0.006, 12, 0, -0.012, 0.28 + i * 0.03, 0x5a3820, { rx: R2 }); // telha da bomba com sulcos
    b.rbox(0.06, 0.1, 0.25, 0.012, 0, 0.012, 0.03, BLK, { mat: 'm' }); b.box(0.002, 0.03, 0.08, 0.031, 0.025, 0.06, 0x101113); // corpo e janela
    trig(b, -0.04, 0.0);
    b.rbox(0.045, 0.09, 0.12, 0.018, 0, -0.04, -0.14, WOOD, { rx: 0.35 }); b.rbox(0.055, 0.13, 0.26, 0.025, 0, -0.07, -0.3, WOOD, { rx: 0.08 }); b.box(0.057, 0.135, 0.02, 0, -0.085, -0.435, 0x1a1a1a, { rx: 0.08 }); // coronha e coice
  },
  caca: b => {
    b.cyl(0.016, 0.013, 0.66, 12, 0, 0.032, 0.62, BLK, { rx: R2, mat: 'm' }); // cano
    b.cyl(0.021, 0.021, 0.2, 12, 0, 0.032, 0.12, 0x2a2c2e, { rx: R2, mat: 'm' }); b.cyl(0.005, 0.005, 0.05, 8, 0.03, 0.03, 0.03, 0x2a2c2e, { rz: R2, mat: 'm' }); b.sph(0.01, 0.055, 0.03, 0.03, 0x2a2c2e, { mat: 'm' }); // corpo da culatra e ferrolho
    for (const z of [0.06, 0.18]) b.box(0.02, 0.012, 0.02, 0, 0.056, z, BLK, { mat: 'm' }); // bases da luneta
    b.rbox(0.058, 0.06, 0.62, 0.022, 0, -0.008, 0.26, WOOD); for (let i = 0; i < 4; i++) for (const s of [-1, 1]) b.box(0.003, 0.03, 0.006, s * 0.029, -0.008, 0.36 + i * 0.02, 0x4a2a14); // fuste com quadriculado
    trig(b, -0.035, 0.02); b.box(0.05, 0.008, 0.08, 0, -0.04, 0.12, 0x2a2c2e, { mat: 'm' }); // guarda-mato e tampa do depósito
    b.rbox(0.045, 0.09, 0.1, 0.018, 0, -0.04, -0.1, WOOD, { rx: 0.32 }); b.rbox(0.055, 0.13, 0.28, 0.025, 0, -0.055, -0.27, WOOD, { rx: 0.06 }); b.rbox(0.03, 0.03, 0.14, 0.01, 0.015, 0.02, -0.25, WOOD); b.box(0.057, 0.135, 0.02, 0, -0.07, -0.415, 0x1a1a1a, { rx: 0.06 }); // coronha, apoio da face, coice
    b.cyl(0.004, 0.004, 0.02, 6, 0, -0.045, 0.5, 0x8a8e92, { mat: 'm' }); b.cyl(0.004, 0.004, 0.02, 6, 0, -0.13, -0.32, 0x8a8e92, { mat: 'm' }); // argolas da bandoleira
  },
  // CheyTac M200: chassis cor de areia, cano grosso estriado com travão de boca, ferrolho, coronha ajustável e bipé
  cheytac: b => { const C = 0x6b6450, D = 0x55503f;
    b.rbox(0.066, 0.075, 0.5, 0.012, 0, -0.008, 0.14, C); b.box(0.06, 0.02, 0.48, 0, 0.038, 0.14, D); rail(b, 0.055, -0.08, 0.32, 0.03); // chassis e calha comprida
    b.cyl(0.024, 0.024, 0.24, 12, 0, 0.012, 0.08, 0x3a3a34, { rx: R2, mat: 'm' }); b.cyl(0.005, 0.005, 0.06, 8, 0.035, 0.012, -0.02, BLK, { rz: R2, mat: 'm' }); b.sph(0.012, 0.068, 0.012, -0.02, BLK, { mat: 'm' }); // culatra e ferrolho
    b.rbox(0.07, 0.07, 0.3, 0.012, 0, 0.0, 0.52, C); for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) b.box(0.004, 0.03, 0.035, sx * 0.035, 0.0, 0.42 + i * 0.05, 0x2e2c24); // guarda-mão com aberturas
    b.cyl(0.019, 0.017, 0.46, 12, 0, 0.012, 0.86, BLK, { rx: R2, mat: 'm' }); for (let i = 0; i < 4; i++) b.cyl(0.0205, 0.0205, 0.012, 12, 0, 0.012, 0.7 + i * 0.07, 0x111214, { rx: R2 }); // cano com estrias
    b.cyl(0.03, 0.03, 0.07, 12, 0, 0.012, 1.105, BLK, { rx: R2, mat: 'm' }); for (const sx of [-1, 1]) b.box(0.004, 0.022, 0.05, sx * 0.03, 0.012, 1.105, 0x0b0b0c); // travão de boca
    b.rbox(0.05, 0.09, 0.075, 0.01, 0, -0.085, 0.16, BLK); trig(b, -0.05, 0.03); // carregador e gatilho
    b.rbox(0.042, 0.11, 0.055, 0.012, 0, -0.1, -0.04, BLK, { rx: -0.3 }); b.cyl(0.016, 0.016, 0.16, 10, 0, -0.008, -0.17, BLK, { rx: R2, mat: 'm' }); // punho e tubo
    b.rbox(0.055, 0.13, 0.16, 0.015, 0, -0.035, -0.3, C); b.box(0.04, 0.035, 0.12, 0, 0.05, -0.29, D); b.box(0.058, 0.14, 0.018, 0, -0.035, -0.385, BLK); b.box(0.012, 0.04, 0.012, 0, -0.12, -0.34, BLK, { mat: 'm' }); // coronha, apoio da face, coice, monopé
    for (const s2 of [-1, 1]) { b.cyl(0.006, 0.006, 0.26, 6, s2 * 0.012, -0.016, 0.62, BLK, { rx: R2, mat: 'm' }); b.box(0.016, 0.01, 0.02, s2 * 0.012, -0.016, 0.75, BLK); } b.box(0.036, 0.016, 0.03, 0, -0.026, 0.49, BLK, { mat: 'm' }); // bipé dobrado
  },
  // Barrett M82: corpo de chapa grosso, cano com travão de boca de duas câmaras, asa de transporte, carregador grande e bipé
  barrett: b => { const C = 0x2b2d30;
    b.rbox(0.08, 0.075, 0.6, 0.012, 0, 0.03, 0.14, C, { mat: 'm' }); b.rbox(0.074, 0.06, 0.5, 0.012, 0, -0.035, 0.08, 0x26282b, { mat: 'm' }); // corpo de cima e de baixo
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) b.cyl(0.006, 0.006, 0.003, 8, sx * 0.041, 0.03, -0.1 + i * 0.09, 0x151617, { rz: R2 }); // furos de alívio
    rail(b, 0.072, -0.12, 0.3, 0.032); b.box(0.02, 0.05, 0.02, 0, 0.1, 0.32, BLK, { mat: 'm' }); b.box(0.02, 0.012, 0.16, 0, 0.125, 0.24, BLK, { mat: 'm' }); b.box(0.02, 0.05, 0.02, 0, 0.1, 0.16, BLK, { mat: 'm' }); // calha e asa de transporte
    b.cyl(0.024, 0.022, 0.6, 12, 0, 0.03, 0.74, BLK, { rx: R2, mat: 'm' }); for (let i = 0; i < 6; i++) b.cyl(0.026, 0.026, 0.01, 12, 0, 0.03, 0.52 + i * 0.05, 0x111214, { rx: R2 });
    b.rbox(0.1, 0.05, 0.11, 0.01, 0, 0.03, 1.08, BLK, { mat: 'm' }); for (const sx of [-1, 1]) for (const z of [1.055, 1.105]) b.box(0.004, 0.034, 0.03, sx * 0.05, 0.03, z, 0x0b0b0c); // travão de boca
    b.rbox(0.058, 0.15, 0.11, 0.012, 0, -0.13, 0.2, BLK); b.box(0.06, 0.012, 0.115, 0, -0.205, 0.2, 0x3a3c3e); trig(b, -0.065, 0.06); // carregador de 10 e gatilho
    b.rbox(0.05, 0.12, 0.06, 0.012, 0, -0.11, -0.06, BLK, { rx: -0.3 });
    b.rbox(0.068, 0.13, 0.24, 0.02, 0, -0.01, -0.3, C, { mat: 'm' }); b.rbox(0.07, 0.15, 0.03, 0.01, 0, -0.02, -0.43, 0x1a1b1d); b.box(0.04, 0.03, 0.12, 0, 0.06, -0.3, 0x1a1b1d); // coronha com amortecedor
    for (const s2 of [-1, 1]) { b.cyl(0.008, 0.008, 0.28, 6, s2 * 0.016, -0.02, 0.7, BLK, { rx: R2, mat: 'm' }); b.box(0.022, 0.012, 0.03, s2 * 0.016, -0.02, 0.845, BLK); } b.box(0.05, 0.02, 0.04, 0, -0.02, 0.56, BLK, { mat: 'm' }); // bipé
  },
  // M249: corpo de chapa, tampa de alimentação, caixa de 100, cano com pega de transporte, coronha e bipé
  m249: b => { const C = 0x2b2d30, OD = 0x4b5a32;
    b.box(0.076, 0.085, 0.36, 0, -0.005, 0.08, C, { mat: 'm' }); b.rbox(0.08, 0.035, 0.2, 0.01, 0, 0.05, 0.06, 0x232528, { mat: 'm' }); rail(b, 0.073, 0.0, 0.16, 0.03); // corpo e tampa
    b.box(0.03, 0.04, 0.03, -0.045, 0.02, 0.0, 0x3a3c3e, { mat: 'm' }); for (let i = 0; i < 5; i++) b.cyl(0.0062, 0.0062, 0.026, 8, -0.06 - i * 0.004, 0.01 - i * 0.016, 0.015, 0xc9a14a, { mat: 'm' }); // janela de alimentação com a fita de balas
    b.cyl(0.032, 0.032, 0.18, 10, 0, 0.012, 0.36, 0x3a3c3e, { rx: R2, mat: 'm' }); for (let i = 0; i < 8; i++) b.cyl(0.0335, 0.0335, 0.006, 10, 0, 0.012, 0.29 + i * 0.02, 0x1a1b1d, { rx: R2 }); // guarda-mão
    b.cyl(0.016, 0.016, 0.42, 10, 0, 0.012, 0.62, BLK, { rx: R2, mat: 'm' }); b.cyl(0.02, 0.02, 0.04, 10, 0, 0.012, 0.84, BLK, { rx: R2, mat: 'm' }); b.box(0.018, 0.04, 0.02, 0, 0.045, 0.78, BLK, { mat: 'm' }); // cano, tapa-chamas, mira da frente
    b.box(0.012, 0.05, 0.012, 0, 0.065, 0.46, BLK, { mat: 'm' }); b.box(0.012, 0.012, 0.08, 0, 0.09, 0.44, BLK, { mat: 'm', rx: -0.2 }); // pega de transporte do cano
    b.rbox(0.13, 0.13, 0.1, 0.015, -0.015, -0.13, 0.12, OD); b.box(0.1, 0.03, 0.002, -0.015, -0.12, 0.171, 0xb8a878); b.box(0.004, 0.11, 0.08, 0.051, -0.13, 0.12, 0x3e4b2a); // caixa de 100
    trig(b, -0.05, 0.0); b.rbox(0.045, 0.11, 0.06, 0.012, 0, -0.1, -0.04, BLK, { rx: -0.3 });
    b.box(0.05, 0.035, 0.2, 0, -0.01, -0.17, C, { mat: 'm' }); b.rbox(0.06, 0.12, 0.18, 0.02, 0, -0.03, -0.3, C); b.box(0.062, 0.125, 0.016, 0, -0.03, -0.39, BLK); // coronha
    for (const s2 of [-1, 1]) { b.cyl(0.006, 0.006, 0.22, 6, s2 * 0.012, -0.016, 0.68, BLK, { rx: R2, mat: 'm' }); b.box(0.014, 0.008, 0.018, s2 * 0.012, -0.016, 0.79, BLK); }
  },
  // PKM: corpo de chapa estampada, cano estriado com tapa-chamas, coronha de esqueleto em madeira e caixa de 100
  pkm: b => { const C = 0x3a3c3e, W2 = 0x8a5a32;
    b.box(0.07, 0.085, 0.36, 0, -0.005, 0.08, C, { mat: 'm' }); b.rbox(0.072, 0.032, 0.24, 0.008, 0, 0.05, 0.06, 0x34363a, { mat: 'm' }); for (let i = 0; i < 4; i++) b.box(0.002, 0.012, 0.012, 0.036, 0.0, -0.06 + i * 0.07, 0x1a1b1d); // corpo, tampa e rebites
    b.box(0.03, 0.05, 0.06, 0, 0.06, 0.24, C, { mat: 'm' }); // mira de trás
    b.cyl(0.018, 0.018, 0.52, 10, 0, 0.012, 0.6, BLK, { rx: R2, mat: 'm' }); for (let i = 0; i < 10; i++) b.cyl(0.0195, 0.0195, 0.008, 10, 0, 0.012, 0.36 + i * 0.03, 0x111214, { rx: R2 }); // cano estriado
    b.cyl(0.03, 0.026, 0.07, 10, 0, 0.012, 0.88, BLK, { rx: R2, mat: 'm' }); for (let i = 0; i < 4; i++) b.box(0.004, 0.045, 0.04, Math.sin(i * 1.57) * 0.027, 0.012 + Math.cos(i * 1.57) * 0.027, 0.89, 0x0b0b0c, { rz: i * 1.57 }); // tapa-chamas com fendas
    b.cyl(0.011, 0.011, 0.32, 8, 0, -0.022, 0.42, C, { rx: R2, mat: 'm' }); b.box(0.02, 0.05, 0.02, 0, 0.045, 0.82, BLK, { mat: 'm' }); b.box(0.012, 0.06, 0.012, 0, 0.06, 0.48, BLK, { mat: 'm' }); // tubo de gases, mira, pega
    b.rbox(0.12, 0.13, 0.1, 0.015, -0.015, -0.13, 0.1, C, { mat: 'm' }); b.box(0.004, 0.1, 0.07, 0.046, -0.13, 0.1, 0x2a2b2d); // caixa
    trig(b, -0.05, 0.0); b.rbox(0.045, 0.11, 0.06, 0.012, 0, -0.1, -0.04, W2, { rx: -0.3 });
    b.box(0.045, 0.03, 0.32, 0, 0.012, -0.26, W2); b.box(0.045, 0.03, 0.26, 0, -0.07, -0.28, W2, { rx: -0.1 }); b.box(0.05, 0.13, 0.03, 0, -0.03, -0.41, 0x6a4026); // coronha de esqueleto
    for (const s2 of [-1, 1]) { b.cyl(0.006, 0.006, 0.22, 6, s2 * 0.012, -0.016, 0.72, BLK, { rx: R2, mat: 'm' }); b.box(0.014, 0.008, 0.018, s2 * 0.012, -0.016, 0.83, BLK); }
  },
};
export const GUNS = { ...GUNS0 }; for (const k in GUNSDATA) GUNS[k] = blendGun(k);
