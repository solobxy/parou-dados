// Sons de mexer nas coisas: cada objeto soa ao material de que é feito, cada contentor abre e fecha à sua maneira
import { ITEMS } from './items.js';
import { audio } from './audio.js';

const SOFT = /^(colete|ghillie|mochila|saco|cama|tecido|couro|polvora)/;
const BOTTLE = new Set(['agua', 'bebida', 'sumo', 'cafe']);
const CAN = new Set(['lata', 'sardinhas', 'racao', 'ramen', 'gasolina', 'galaoV', 'explosivo', 'c4']);
const PAPER = new Set(['iene', 'planta', 'ligadura', 'medkit']);
const WOOD = new Set(['madeira', 'lanca', 'bau', 'bauG', 'bancada1', 'bancada2', 'bancada3', 'fogueira', 'bastao']);
const STONE = new Set(['pedra', 'pedraR', 'enxofre', 'carvao', 'metal']);

// material de um objeto pela chave
export const itemMat = k => {
  const d = ITEMS[k]; if (!d) return 'it-pano';
  if (WOOD.has(k)) return 'it-madeira';
  if (STONE.has(k)) return 'it-pedra';
  if (PAPER.has(k)) return 'it-papel';
  if (BOTTLE.has(k)) return 'it-garrafa';
  if (CAN.has(k)) return 'it-lata';
  if (d.cat === 'a' || /^c[A-Z0-9]/.test(k)) return 'it-balas';
  if (d.cat === 'f') return 'it-mole';
  if (SOFT.test(k)) return 'it-pano';
  if (d.cat === 'w' || d.gun || d.melee) return 'it-arma';
  return 'it-metal';
};
export const itemSnd = (k, v = 1) => audio.play(itemMat(k), v);

// tipo de contentor pelo nome que aparece no botão (e pela tabela do loot)
export const boxKind = c => {
  if (!c) return null;
  if (c.bag && !c.body && c.grid && c.grid.list.some(e => e.it.k === 'couro' || e.it.k === 'carneC')) return 'animal'; // carcaça de um animal: esfola-se
  if (c.car || c.table === 'carro' || c.table === 'carropol') return 'carro';
  const l = (c.label || '').toLowerCase();
  if (/frigor/.test(l)) return 'frigo';
  if (/cacifo|roupeiro|camião|carrinho|fornalha|consola|balneário|cela/.test(l)) return 'metal';
  if (/saco|corpo|mala|tenda|futon|cama|bagagem|mochila|fogueira/.test(l) || c.bag || c.body) return 'saco';
  if (/caixa|baú|caixote|oferendas|avião|altar/.test(l)) return 'caixa';
  return 'gaveta'; // cozinha, secretária, mesa, bancada, estante, receção, quiosque
};
export const boxOpen = c => { const k = boxKind(c); if (!k) return false; audio.play(k === 'animal' ? 'esfolar' : 'ab-' + k); return true; };
export const boxClose = c => { const k = boxKind(c); if (!k || k === 'saco' || k === 'animal') return false; audio.play('fe-' + k); return true; };
