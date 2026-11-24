// Tipos de veículo (partilhado pelo jogo e pelo servidor). Velocidades em m/s, aceleração em m/s², depósito em litros.
// vmax: na estrada; voff: fora dela (terra, erva); turn: quanto vira; len/wid: tamanho; seats: lugares (x, y, z) com o condutor no 1.º
// armor: quem vai dentro não leva tiros; open: quem vai dentro fica à mostra (mota, bicicleta, jipe); fuel: false = a pedal
const S4 = [[-0.42, 0.75, 0.15], [0.42, 0.75, 0.15], [-0.42, 0.75, -0.9], [0.42, 0.75, -0.9]];
export const VT = {
  sedan: { h: 1.5, n: 'Sedan', hp: 400, tank: 45, vmax: 17, voff: 9, acc: 6.5, turn: 1.75, len: 4.1, wid: 1.84, seats: S4, w: 16 },
  sport: { h: 1.15, n: 'Desportivo', hp: 300, tank: 40, vmax: 27, voff: 7, acc: 11, turn: 2.0, len: 4.25, wid: 1.92, seats: [[-0.42, 0.62, -0.15], [0.42, 0.62, -0.15]], w: 7 },
  coupe: { h: 1.4, n: 'Coupé', hp: 340, tank: 40, vmax: 21, voff: 8, acc: 8.5, turn: 1.9, len: 4.2, wid: 1.86, seats: [[-0.42, 0.7, 0.05], [0.42, 0.7, 0.05], [-0.4, 0.7, -0.95], [0.4, 0.7, -0.95]], w: 7 },
  suv: { h: 2.05, n: 'SUV', hp: 560, tank: 60, vmax: 16, voff: 13, acc: 6, turn: 1.6, len: 4.6, wid: 1.98, seats: [[-0.44, 0.95, 0.25], [0.44, 0.95, 0.25], [-0.44, 0.95, -0.85], [0.44, 0.95, -0.85]], w: 10 },
  van: { h: 2.25, n: 'Carrinha', hp: 520, tank: 60, vmax: 14, voff: 8, acc: 4.6, turn: 1.45, len: 5.1, wid: 2.0, seats: [[-0.45, 1.0, 1.25], [0.45, 1.0, 1.25], [-0.45, 1.0, 0.1], [0.45, 1.0, 0.1], [-0.45, 1.0, -1.05], [0.45, 1.0, -1.05]], w: 6 },
  jeep: { h: 1.25, n: 'Jipe', hp: 460, tank: 50, vmax: 15, voff: 15, acc: 7, turn: 1.85, len: 3.9, wid: 1.86, open: true, seats: [[-0.42, 0.85, 0.05], [0.42, 0.85, 0.05], [-0.42, 0.85, -1.0], [0.42, 0.85, -1.0]], w: 6 },
  humvee: { h: 2.2, n: 'Humvee blindado', hp: 1500, tank: 80, vmax: 15, voff: 14, acc: 5, turn: 1.5, len: 4.8, wid: 2.2, armor: true, seats: [[-0.5, 0.95, 0.3], [0.5, 0.95, 0.3], [-0.5, 0.95, -0.85], [0.5, 0.95, -0.85]], w: 0 },
  heli: { h: 2.6, n: 'Helicóptero', hp: 900, tank: 90, vmax: 42, voff: 42, acc: 9, turn: 1.6, len: 9.5, wid: 2.4, fly: true, seats: [[-0.45, 0.85, 1.0], [0.45, 0.85, 1.0], [-0.5, 0.85, -0.2], [0.5, 0.85, -0.2]], w: 0 },
  moto: { h: 0.95, n: 'Mota', hp: 160, tank: 15, vmax: 25, voff: 12, acc: 11, turn: 2.6, len: 2.1, wid: 0.8, open: true, two: true, seats: [[0, 0.9, 0.0], [0, 0.95, -0.6]], w: 8 },
  bike: { h: 0.8, n: 'Bicicleta', hp: 70, tank: 0, vmax: 8, voff: 6, acc: 3.2, turn: 2.6, len: 1.8, wid: 0.6, open: true, two: true, fuel: false, seats: [[0, 0.85, -0.1]], w: 9 },
};
export const VKEYS = Object.keys(VT);
// heliportos (no chão): aeroporto, zona militar do aeroporto, base militar, base de radar e o hospital de Akagawa
export const HELIPADS = [[2500, -2655, 0], [2570, -2655, 0], [2205, -2600, 0], [208, -182, 0], [-3262, -3342, 0], [-1480, -3330, 0]];
export const vt = k => VT[k] || VT.sedan;
// tipo de um carro pelo sítio onde nasce (igual em todos os aparelhos): na tropa, Humvee e jipes; no resto, ao calhas pelo peso w
export const pickVT = (seed, mil) => { const r = Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1; if (mil) return r < 0.5 ? 'humvee' : r < 0.8 ? 'jeep' : 'suv';
  const L = VKEYS.filter(k => VT[k].w > 0), tot = L.reduce((s, k) => s + VT[k].w, 0); let x = r * tot; for (const k of L) { x -= VT[k].w; if (x <= 0) return k; } return 'sedan'; };
