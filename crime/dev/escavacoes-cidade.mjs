// Põe a cidade de teste pronta para ver as escavações. Correr com o servidor parado.
// Uso: node dev/escavacoes-cidade.mjs <pasta dados> [livre|aberta|risco|novato]
//   livre:  o Rico tem Arqueologia 2 (Mértola fechada), Conímbriga vigiada e umas peças do castro na vitrine
//   aberta: o Rico está a meio de uma escavação em Conímbriga (3 pazadas dadas, as seguras, um achado no saco)
//   risco:  a mesma escavação, 5 pazadas dadas (a próxima tem 15% de risco)
//   novato: o Novato sem Arqueologia
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
const [DATA, MODO = 'livre'] = process.argv.slice(2);
const db = new DatabaseSync(join(DATA, 'jogo.db')), now = Date.now(), MIN = 60e3, H = 3600e3;
const ronda = db.prepare('SELECT MAX(ronda) r FROM jogadores').get().r;
const id = (nome) => db.prepare('SELECT id FROM contas WHERE nome = ?').get(nome).id;
const mexe = (nome, fn) => {
  const r = db.prepare('SELECT rowid, estado FROM jogadores WHERE conta = ? AND ronda = ?').get(id(nome), ronda);
  const e = JSON.parse(r.estado); fn(e); db.prepare('UPDATE jogadores SET estado = ? WHERE rowid = ?').run(JSON.stringify(e), r.rowid);
};
const semArq = (e) => { e.done = (e.done || []).filter((x) => !x.startsWith('arqueologia')); };
// grelha 5×5 de Conímbriga com 5 achados; os números das casas abertas saem da grelha (como no motor)
const N = 5, cells = Array(N * N).fill(0);
cells[6] = 'lucerna'; cells[7] = 'denario'; cells[13] = 'mosaico'; cells[19] = 'anel'; cells[21] = 'estilete';
const perto = (i) => { let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = (i % N) + dx, y = Math.floor(i / N) + dy; if ((dx || dy) && x >= 0 && y >= 0 && x < N && y < N && cells[y * N + x]) n++; } return n; };
const abrir = [0, 6, 12, 24, 2, 15].map((i) => (cells[i] ? { i, v: cells[i] } : { i, n: perto(i) }));
const aberta = (used) => { const open = abrir.slice(0, used); return { site: 'conimbriga', t0: now - 6 * MIN, cells, used, taps: 8, safe: 3, open, got: open.filter((x) => x.v).map((x) => x.v) }; };
mexe('Rico', (e) => {
  semArq(e); e.done.push('arqueologia1', 'arqueologia2');
  e.dgc = MODO === 'livre' ? { conimbriga: now + 2 * H + 13 * MIN } : {};
  e.dg = MODO === 'aberta' ? aberta(3) : MODO === 'risco' ? aberta(5) : null;
  e.col = { ...(e.col || {}), torques: 1, fibula: 2, contas: 1 };
  e.jailUntil = 0; e.hospUntil = 0;
});
mexe('Novato', (e) => { semArq(e); e.dg = null; e.dgc = {}; });
console.log('ronda', ronda, MODO, 'ok');
