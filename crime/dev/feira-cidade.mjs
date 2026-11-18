// Põe na cidade de teste uma Feira da Ladra com movimento: anúncios a preço fixo e leilões de outros jogadores, um anúncio
// e um lance do Rico, e duas coisas à espera dele (uma ganha num leilão, outra que não se vendeu). Correr com o servidor parado
// (depois de ele já ter arrancado uma vez com a v84, para a tabela existir). Uso: node dev/feira-cidade.mjs <pasta dados> [muitos|novato]
// Os preços ficam dentro da banda (0,3× a 3× a referência); «muitos» junta 40 leilões pequenos (para ver «Mais leilões»).
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
const [DATA, MODO] = process.argv.slice(2);
const db = new DatabaseSync(join(DATA, 'jogo.db')), now = Date.now(), H = 3600e3;
const ronda = db.prepare('SELECT MAX(ronda) r FROM jogadores').get().r;
const id = (nome) => db.prepare('SELECT id FROM contas WHERE nome = ?').get(nome).id;
db.prepare('DELETE FROM feira WHERE ronda = ?').run(ronda); db.prepare('DELETE FROM feira_vendas WHERE ronda = ?').run(ronda);
const nova = db.prepare("INSERT INTO feira (ronda, vendedor, tipo, kind, item, obj, n, preco, lance, licitante, criado, fim, estado, dono) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
const [P, A, G, S, R] = ['Planeador', 'Assaltante', 'Gasto', 'Seco', 'Rico'].map(id);
let lidMoeda = 0;
for (const [v, tipo, kind, item, obj, n, preco, lance, lic, fimH, estado, dono] of [
  [P, 'fixo', 'mt', 'sucata', null, 12, 45, 0, null, 30, 'aberto', null],
  [A, 'fixo', 'mt', 'sucata', null, 5, 39, 0, null, 12, 'aberto', null],
  [G, 'fixo', 'mt', 'motor', null, 3, 420, 0, null, 40, 'aberto', null],
  [S, 'fixo', 'mt', 'circuito', null, 6, 260, 0, null, 20, 'aberto', null],
  [P, 'fixo', 'inv', 'explosivos', JSON.stringify({ id: 'explosivos' }), 1, 2900, 0, null, 44, 'aberto', null],
  [A, 'fixo', 'inv', 'pistola', JSON.stringify({ id: 'pistola', u: 14 }), 1, 900, 0, null, 8, 'aberto', null],
  [G, 'fixo', 'col', 'bule', null, 1, 6000, 0, null, 25, 'aberto', null],
  [S, 'leilao', 'col', 'moeda', null, 1, 3000, 6800, A, 0.1, 'aberto', null],
  [A, 'leilao', 'col', 'caneta', null, 1, 2000, 7500, P, 10, 'aberto', null],   // já no teto (3 × 2 500)
  [P, 'leilao', 'inv', 'broca', JSON.stringify({ id: 'broca' }), 1, 3000, 0, null, 19, 'aberto', null],
  [G, 'leilao', 'mt', 'reagente', null, 10, 600, 660, R, 6, 'aberto', null],
  [R, 'fixo', 'mt', 'cobre', null, 4, 70, 0, null, 35, 'aberto', null],
  [S, 'leilao', 'col', 'selo', null, 1, 2000, 2600, R, -1, 'levantar', R],
  [R, 'fixo', 'mt', 'madeira', null, 2, 99, 0, null, -2, 'levantar', R],
  // v89: pedidos de compra (vendedor = quem compra): três de outros, um do Rico, e o que já lhe venderam à espera dele
  [P, 'pedido', 'mt', 'sucata', null, 15, 55, 0, null, 60, 'aberto', null],
  [G, 'pedido', 'mt', 'cobre', null, 10, 80, 0, null, 50, 'aberto', null],
  [S, 'pedido', 'col', 'bule', null, 1, 5200, 0, null, 70, 'aberto', null],
  [A, 'pedido', 'mt', 'vidro', null, 4, 700, 0, null, 40, 'aberto', null],
  [R, 'pedido', 'mt', 'chapa', null, 5, 300, 0, null, 66, 'aberto', null],
  [R, 'pedido', 'mt', 'motor', null, 2, 450, 0, null, -1, 'levantar', R],
]) { const r = nova.run(ronda, v, tipo, kind, item, obj, n, preco, lance, lic, now - H, now + fimH * H, estado, dono); if (item === 'moeda') lidMoeda = Number(r.lastInsertRowid); }
// o Rico licitou na moeda e passaram-lhe à frente (aparece em «Os meus», com o botão para voltar a licitar)
try { db.prepare('DELETE FROM feira_lances').run(); db.prepare('INSERT OR IGNORE INTO feira_lances (lid, conta) VALUES (?, ?)').run(lidMoeda, R); } catch {}
if (MODO === 'muitos') for (let k = 0; k < 40; k++) nova.run(ronda, [P, A, G, S][k % 4], 'leilao', 'mt', 'sucata', null, 1, 20 + k, 0, null, now - H, now + (20 + k / 10) * H, 'aberto', null);
// o Rico começa sempre igual (cada passagem do teste vende e compra); «novato» põe o Novato abaixo do nível da feira
const mexe = (nome, fn) => { const r = db.prepare('SELECT rowid, estado FROM jogadores WHERE conta = ? AND ronda = ?').get(id(nome), ronda); const e = JSON.parse(r.estado); fn(e); db.prepare('UPDATE jogadores SET estado = ? WHERE rowid = ?').run(JSON.stringify(e), r.rowid); };
mexe('Rico', (e) => { e.mt = { madeira: 6, sucata: 20, cobre: 7, pecas: 3, chapa: 2, circuito: 1, motor: 2 }; e.col = { ...(e.col || {}), bule: 2, moeda: 1 }; });
mexe('Novato', (e) => { const lv = MODO === 'novato' ? 30 : 54560; e.respect = lv; e.peakRespect = lv; });
const venda = db.prepare('INSERT INTO feira_vendas (ronda, item, t, unit, n) VALUES (?, ?, ?, ?, ?)');
for (const [item, unit] of [['sucata', 40], ['sucata', 44], ['sucata', 42], ['motor', 400], ['circuito', 250]]) venda.run(ronda, item, now - 5 * H, unit, 1);
console.log('ronda', ronda, 'ok');
