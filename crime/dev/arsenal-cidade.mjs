// Põe a cidade de teste pronta para ver o arsenal da v87. Correr com o servidor parado.
// Uso: node dev/arsenal-cidade.mjs <pasta dados>
//   Rico: nível 25, sabre, pistola e sniper no corpo (as duas a disparar: a pistola conta 30%), uma sniper afinada
//         comprada na feira no inventário (pede nível 42) e peças na cave para algumas receitas
//   Novato: nível 1, sem armas
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { CFG } from '../engine/config.js';
const [DATA] = process.argv.slice(2);
const db = new DatabaseSync(join(DATA, 'jogo.db'));
const ronda = db.prepare('SELECT MAX(ronda) r FROM jogadores').get().r;
const id = (nome) => db.prepare('SELECT id FROM contas WHERE nome = ?').get(nome).id;
const mexe = (nome, fn) => {
  const r = db.prepare('SELECT rowid, estado FROM jogadores WHERE conta = ? AND ronda = ?').get(id(nome), ronda);
  const e = JSON.parse(r.estado); fn(e); db.prepare('UPDATE jogadores SET estado = ? WHERE rowid = ?').run(JSON.stringify(e), r.rowid);
};
mexe('Rico', (e) => {
  e.respect = e.peakRespect = CFG.levels[24];   // nível 25
  e.eq = { ...(e.eq || {}), branca: { id: 'katana' }, mao: { id: 'pistola', u: 12 }, principal: { id: 'sniper', u: 10 } };
  e.inv = (e.inv || []).filter((x) => !CFG.gear.some((g) => g.id === x.id && ['branca', 'mao', 'principal'].includes(g.slot)));
  e.inv.push({ id: 'afinada', u: 130 });
  e.mt = { ...(e.mt || {}), cano: 4, chapa: 4, motor: 1, circuito: 2, madeira: 4, caixote: 2, sucata: 4, pecas: 3, ferro: 1, bronze: 1 };
  e.cf = null; e.jailUntil = 0; e.hospUntil = 0; e.cash = Math.max(e.cash || 0, 40000);
});
mexe('Novato', (e) => { e.eq = { ...(e.eq || {}) }; delete e.eq.branca; delete e.eq.mao; delete e.eq.principal; e.jailUntil = 0; e.hospUntil = 0; });
console.log('ronda', ronda, 'ok');
