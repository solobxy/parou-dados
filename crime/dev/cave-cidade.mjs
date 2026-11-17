// Põe na cidade de teste um depósito com coisas (uns materiais cheios, outros a zero), um café com 1 negócio e,
// se pedido, uma broca na bancada. Correr com o servidor parado.
// Uso: node dev/cave-cidade.mjs <pasta dados> [livre|corre|pronto|vazio|golpe|maq]
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { CFG } from '../engine/config.js';
const [DATA, MODO = 'livre'] = process.argv.slice(2);
const db = new DatabaseSync(join(DATA, 'jogo.db')), now = Date.now();
for (const r of db.prepare('SELECT rowid, estado FROM jogadores').all()) {
  const e = JSON.parse(r.estado);
  e.mt = MODO === 'vazio' ? {} : { madeira: 6, eletronica: 9, quimicos: 4, sucata: 40, cobre: 7, pecas: 3, chapa: 2, cano: 1, circuito: 1, reagente: 1 };
  e.maq = {}; e.cf = MODO === 'corre' || MODO === 'pronto' ? { id: 'broca', t0: now - 3 * 3600e3, end: MODO === 'pronto' ? now - 1000 : now + 3600e3 } : null;
  if (e.biz && e.biz[1] && !e.biz[1].n) { e.biz[1].n = 1; e.biz[1].t = now; }   // um café, para a máquina do café
  e.inv = (e.inv || []).filter((x) => !['gazuas', 'pedecabra', 'broca', 'explosivos'].includes(x.id));
  if (MODO === 'maq') {   // café com máquina a acabar (já dá para rever), lavandaria com máquina parada, kits e uma pistola gasta
    e.mt = { ...e.mt, reagente: 2, circuito: 2, kit: 2 };
    for (const [i, id, u] of [[0, 'lavandaria', now - 864e5], [1, 'cafe', now + 3 * 864e5]]) { if (!e.biz[i].n) { e.biz[i].n = 1; e.biz[i].t = now; } e.maq[id] = u; }
    e.eq.mao = { id: 'pistola', u: 0 };
  }
  if (MODO === 'golpe') {   // a carrinha de valores pronta a avançar, só sem os explosivos (que se fazem na cave)
    const i = CFG.ops.findIndex((o) => o.id === 'carrinha'), lv = CFG.ops[i].level;
    e.respect = e.peakRespect = Math.max(e.respect, CFG.levels[lv - 1] ?? CFG.levels.at(-1));
    e.op = { i, t0: now - 130 * 3600e3, ready: now - 3600e3, recon: true, crew: true, bribe: false, contact: false, paid: CFG.ops[i].cost };
  }
  db.prepare('UPDATE jogadores SET estado = ? WHERE rowid = ?').run(JSON.stringify(e), r.rowid);
}
console.log('ok', MODO);
