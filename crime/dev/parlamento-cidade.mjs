// Põe na cidade de teste um Estado com tudo à vista: proposta em votação (com ou sem contagem do jornal), leis em vigor,
// uma a caminho e duas votações passadas. Correr com o servidor parado. Uso: node dev/parlamento-cidade.mjs <pasta dados> [poll]
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { govUp } from '../engine/governo.js';
const [DATA, POLL] = process.argv.slice(2);
const db = new DatabaseSync(join(DATA, 'jogo.db'));
const row = db.prepare('SELECT ronda, dados FROM bolsa ORDER BY ronda DESC LIMIT 1').get();
const m = JSON.parse(row.dados), w = govUp(m.w), ed = w.ed, g = w.gov;
g.seats = { cm: 95, op: 55, ml: 40, rv: 40 }; g.pm = 'cm'; g.cofPc = 6600; g.corr = 41; g.popu = 52;
g.laws = { policia: ed - 3, jogo: ed - 10 };
g.pend = [{ id: 'salario', on: true, at: ed + 1 }];
g.bill = { id: process.env.BILL || 'erva', on: true, ed0: ed - 2, vote: POLL ? ed + 1 : ed + 3, yes: 7, no: 3, ly: 25000, ln: 4000 };
g.last = [
  { id: 'salario', on: true, ed: ed - 1, passed: true, yes: 131, no: 99, op: 58, pv: [5, 2], lob: [0, 0], by: { cm: { y: 92, n: 3, bloc: true }, op: { y: 2, n: 53, bloc: false }, ml: { y: 1, n: 39, bloc: false }, rv: { y: 36, n: 4, bloc: true } } },
  { id: 'armas', on: true, ed: ed - 5, passed: false, yes: 41, no: 189, op: 31, pv: [2, 6], lob: [12000, 0], by: { cm: { y: 3, n: 92, bloc: false }, op: { y: 1, n: 54, bloc: false }, ml: { y: 37, n: 3, bloc: true }, rv: { y: 0, n: 40, bloc: false } } },
];
g.hist = [[ed - 1, 43, 39, 53], [ed, 41, 41, 52]];
db.prepare('UPDATE bolsa SET dados = ? WHERE ronda = ?').run(JSON.stringify(m), row.ronda);
// o Novato passa a nível 5+ com conta de mais de um dia, para ver os botões
for (const r of db.prepare('SELECT rowid, estado FROM jogadores').all()) {
  const e = JSON.parse(r.estado); e.respect = (e.respect || 0) + 40; e.peakRespect = Math.max(e.peakRespect || 0, e.respect); e.joinedAt = Math.min(e.joinedAt || Date.now(), Date.now() - 3 * 864e5); delete e.gv;
  db.prepare('UPDATE jogadores SET estado = ? WHERE rowid = ?').run(JSON.stringify(e), r.rowid);
}
console.log('ed', ed, 'ronda', row.ronda);
