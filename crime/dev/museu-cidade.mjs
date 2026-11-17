// Põe na cidade de teste uma vitrine com tudo à vista: as Lembranças completas (com repetidas) e 4 de 6 peças raras,
// e uma placa com nomes. Correr com o servidor parado. Uso: node dev/museu-cidade.mjs <pasta dados> [vazia]
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
const [DATA, VAZIA] = process.argv.slice(2);
const db = new DatabaseSync(join(DATA, 'jogo.db'));
const row = db.prepare('SELECT ronda, dados FROM bolsa ORDER BY ronda DESC LIMIT 1').get();
const m = JSON.parse(row.dados), now = Date.now();
m.w.mus = VAZIA ? {} : { ep: Number(process.env.EP || 0), mundo: { n: 3, top: ['Rico', 'Planeador', 'Maria do Bairro Alto'].map((name, i) => ({ name, t: now - (3 - i) * 36e5 })) }, raras: { n: 0, top: [] } };
db.prepare('UPDATE bolsa SET dados = ? WHERE ronda = ?').run(JSON.stringify(m), row.ronda);
for (const r of db.prepare('SELECT rowid, estado FROM jogadores').all()) {
  const e = JSON.parse(r.estado);
  e.col = VAZIA ? {} : { bule: 3, tulipa: 1, orquidea: 1, caveira: 2, tapete: 1, moeda: 2, bolso: 1, broche: 1, selo: 1 };
  e.mus = {}; delete e.musEp; e.col.estatueta = 1; e.col.caneta = 1;   // as peças raras completas também
  db.prepare('UPDATE jogadores SET estado = ? WHERE rowid = ?').run(JSON.stringify(e), r.rowid);
}
console.log('ronda', row.ronda);
