// Comerciantes: 4 nas zonas de PvP. Compram e vendem por ienes (dinheiro que se encontra no loot).
// Este ficheiro é lido pelo jogo e pelo servidor (sem three.js): o servidor confirma cada compra e venda contra o que tens mesmo.

// preço de compra em ienes (vender rende 40%, arredondado). O que não está aqui não se negoceia.
export const PRICE = {
  // comida e água
  lata: 40, sardinhas: 35, ramen: 30, onigiri: 25, chocolate: 20, maca: 15, agua: 30, sumo: 20, cafe: 25, bebida: 40, racao: 260, carneA: 50, carneC: 15,
  // saúde
  ligadura: 40, medkit: 420,
  // balas (cada uma)
  a9: 6, a9s: 9, c12: 12, c12s: 16, a357: 10, a556: 14, a762: 15, a308: 22, a754: 28, a408: 120, a50: 150,
  // armas
  pistola: 650, revolver: 850, cacadeira: 1300, smg: 1900, caca: 2200, ak: 4600, m4: 5600,
  faca: 150, machete: 320, bastao: 120, pecabra: 140, katana: 900, machado: 160, picareta: 190,
  // carregadores e acessórios
  cPist: 160, cSmg: 320, cStanag: 420, cAk: 420, c308: 380, silP: 1200, silR: 2600, reddot: 950, mira4: 1600, mira8: 3600, lantArma: 320,
  // equipamento
  capacete: 950, colete: 1600, mochila: 850, mochilaC: 700, lanterna: 160, gasolina: 320, fechadura: 520, nvg: 6500, ghillie: 5200,
  // recursos (só se vendem bem os que dão trabalho)
  couro: 60, tecido: 5, metalR: 3, carvao: 1, polvora: 4, enxofre: 1, madeira: 1, pedraR: 1, explosivo: 90, granada: 700, c4: 3800,
  // raros: só se vendem (os comerciantes não os têm)
  cheytac: 14000, barrett: 16000, m249: 12000, pkm: 12000, c408: 900, c50: 1000, cM249: 1400, cPKM: 1400,
};
export const SELL = k => PRICE[k] ? Math.max(1, Math.round(PRICE[k] * 0.4)) : 0;
const NOSELL = new Set(['cheytac', 'barrett', 'm249', 'pkm', 'c408', 'c50', 'cM249', 'cPKM']); // estes não estão à venda
// o que cada um tem para vender (vende tudo o que tem preço)
const GERAL = ['agua', 'lata', 'sardinhas', 'onigiri', 'ramen', 'chocolate', 'cafe', 'bebida', 'racao', 'carneA', 'ligadura', 'medkit', 'lanterna', 'gasolina', 'machado', 'picareta', 'faca', 'pecabra', 'mochila', 'fechadura'];
const ARMAS = ['pistola', 'revolver', 'cacadeira', 'smg', 'caca', 'ak', 'm4', 'a9', 'a9s', 'c12', 'c12s', 'a357', 'a556', 'a762', 'a308', 'a754', 'cPist', 'cSmg', 'cStanag', 'cAk', 'c308', 'reddot', 'mira4', 'mira8', 'silP', 'silR', 'lantArma', 'machete', 'katana'];
const EQUIP = ['capacete', 'colete', 'mochila', 'mochilaC', 'nvg', 'ghillie', 'lanterna', 'ligadura', 'medkit', 'racao', 'agua', 'gasolina'];
const NEGRO = ['granada', 'c4', 'explosivo', 'a408', 'a50', 'nvg', 'silR', 'mira8', 'm4', 'ak', 'a556', 'a762', 'medkit'];
// sítio de cada um (no chão livre de cada zona PvP) e o que vende
export const TRADERS = [
  { id: 0, n: 'Kenji', where: 'Shin-Kurogane', x: 4.8, z: 5.7, yaw: -2.4, sells: [...GERAL, ...ARMAS] },
  { id: 1, n: 'Sargento Mori', where: 'Base militar', x: 190, z: -175, yaw: 3.14, sells: [...ARMAS, ...EQUIP] },
  { id: 2, n: 'Aiko', where: 'Aeroporto', x: 2602.6, z: -2598.5, yaw: 0, sells: [...EQUIP, ...GERAL] },
  { id: 3, n: 'O Velho', where: 'Prisão', x: -1500, z: -3420, yaw: 0, sells: NEGRO },
].map(t => ({ ...t, sells: [...new Set(t.sells)].filter(k => PRICE[k] && !NOSELL.has(k)) }));
export const TRADE_R = 4; // tens de estar a menos de 4 m
