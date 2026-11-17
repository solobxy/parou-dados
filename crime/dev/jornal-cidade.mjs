// Põe na cidade de teste um jornal com tudo: proezas da edição, notícias do governo e o dia do Novato. Correr com o servidor parado.
// Uso: node dev/jornal-cidade.mjs <pasta dados>
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { govUp } from '../engine/governo.js';
import { newsUp } from '../engine/noticias.js';
const [DATA] = process.argv.slice(2);
const db = new DatabaseSync(join(DATA, 'jogo.db'));
const row = db.prepare('SELECT ronda, dados FROM bolsa ORDER BY ronda DESC LIMIT 1').get();
const m = JSON.parse(row.dados), w = govUp(m.w), ed = w.ed; newsUp(w);

const nome = 'Novato';
const ultima = w.arts[w.arts.length - 1], antes = w.arts[w.arts.length - 2] || ultima;
const tira = (L) => { L.a = L.a.filter((x) => !(x.k === 'feat' || x.k.startsWith('gov'))); };
tira(ultima); tira(antes);
antes.a.push({ k: 'govBill', id: 'erva', on: true, vote: ed + 3 }, { k: 'feat', cat: 'casino', name: 'Bruxa', g: 'roulette', v: 18400, med: 900 });
ultima.a.push(
  { k: 'govVote', id: 'salario', on: true, passed: true, yes: 131, no: 99, op: 58, at: ed + 2, by: { cm: { y: 92, n: 3, bloc: true }, op: { y: 2, n: 53, bloc: false }, ml: { y: 1, n: 39, bloc: false }, rv: { y: 36, n: 4, bloc: true } } },
  { k: 'govScandal', n: 1, corr: 34 },
  { k: 'feat', cat: 'job', name: nome, c: 4, v: 12500, med: 640 },
  { k: 'feat', cat: 'job', name: 'Tubarao', c: 3, v: 6100, med: 640 },
  { k: 'feat', cat: 'mug', name: 'Bruxa', target: nome, v: 2300, med: 180 },
  { k: 'feat', cat: 'stockWin', name: 'Tubarao', co: 'farma', v: 9800, med: 1200 },
);
db.prepare('UPDATE bolsa SET dados = ? WHERE ronda = ?').run(JSON.stringify(m), row.ronda);
console.log('ed', ed);
