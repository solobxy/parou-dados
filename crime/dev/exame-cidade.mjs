// Põe a conta Assaltante a meio do curso de pesados (36 h de 4 dias), com o primeiro exame aberto para fazer.
// Correr com o servidor parado. Uso: node dev/exame-cidade.mjs <pasta dados> [fim]   (fim: o tempo do curso já acabou)
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
const [DATA, FIM] = process.argv.slice(2);
const db = new DatabaseSync(join(DATA, 'jogo.db'));
const conta = db.prepare("SELECT id FROM contas WHERE nome = 'Assaltante'").get();
const r = db.prepare('SELECT rowid, estado FROM jogadores WHERE conta = ? ORDER BY ronda DESC LIMIT 1').get(conta.id);
const e = JSON.parse(r.estado), now = Date.now(), D = 4 * 864e5, t0 = FIM ? now - D - 36e5 : now - 36 * 36e5;
e.done = (e.done || []).filter((x) => x !== 'pesados'); e.course = { id: 'pesados', end: t0 + D, t0, ex: 1, cuts: 0, next: 0, q: null };
e.jailUntil = 0; e.hospUntil = 0;
db.prepare('UPDATE jogadores SET estado = ? WHERE rowid = ?').run(JSON.stringify(e), r.rowid);
console.log('curso de pesados posto', FIM ? '(no fim)' : '(a meio)');
