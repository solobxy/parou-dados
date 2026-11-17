// v84 pela API: a Feira da Ladra. Vender a preço fixo e em leilão, comprar parte, licitar (o dinheiro de quem ia à frente
// volta), o fim do leilão paga a quem vendeu, levantar, cancelar, e as contas: só a taxa sai do jogo. Mais (revisão da v84):
// a banda de preços (0,3× a 3× a referência) e o teto dos lances, o nível mínimo, o que está por levantar conta nos 10, voltar a
// pôr à venda, tirar sem espaço fica à espera, e a devolução do lance vai para a mão.
// Corre com: node --test dev/feira84-api.test.mjs   (dentro de crime/)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CFG } from '../engine/config.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CRIME = join(AQUI, '..');
const PORT = 4900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let dir, srv;

function sextaRecente() {
  const d = new Date(Date.now() - 2 * 3600e3);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const SEXTA = sextaRecente();
const T0 = Date.UTC(...SEXTA.split('-').map((x, i) => (i === 1 ? +x - 1 : +x)), 21);
const OFF = T0 - Date.now();
const desvio = (depois) => String(OFF + depois);

async function arrancar(servidor, env) {
  const p = spawn(process.execPath, ['--import', join(dirname(servidor), 'test', 'relogio.mjs'), servidor], {
    env: { ...process.env, PORT: String(PORT), DATA: dir, COOKIE_INSEGURO: '1', ATOS_3S: '1000', ATOS_MIN: '100000', PRIMEIRA_EPOCA: SEXTA, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stderr.on('data', (d) => { const s = String(d); if (!s.includes('ExperimentalWarning') && !s.includes('trace-warnings')) process.stderr.write(s); });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(BASE + '/api/saude'); if (r.ok) return p; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('servidor não arrancou');
}
const parar = async (p) => { if (!p || p.exitCode !== null) return; p.kill(); await new Promise((r) => p.once('exit', r)); };
function cliente(ip) {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json() };
  };
}
function mexer(nome, fn) {
  const db = new DatabaseSync(join(dir, 'jogo.db'));
  const id = db.prepare('SELECT id FROM contas WHERE nome = ?').get(nome).id, row = db.prepare('SELECT ronda, estado FROM jogadores WHERE conta = ?').get(id);
  const e = JSON.parse(row.estado); fn(e);
  db.prepare('UPDATE jogadores SET estado = ? WHERE conta = ? AND ronda = ?').run(JSON.stringify(e), id, row.ronda);
  db.close();
}
const caixa = () => { const db = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true }); const rows = db.prepare('SELECT fonte, SUM(entra) e, SUM(sai) s, SUM(n) n FROM caixa GROUP BY fonte').all(); db.close(); return Object.fromEntries(rows.map((r) => [r.fonte, { e: r.e, s: r.s, n: r.n }])); };
const novo = (depois) => arrancar(join(CRIME, 'server.mjs'), { TESTE_DESVIO_MS: desvio(depois) });

before(() => { dir = mkdtempSync(join(tmpdir(), 'crime-feira-')); });
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); });

const F = CFG.feira, fee = (v) => Math.ceil((v * F.feeBp) / 10000);
const NIVEL5 = { respect: 200, peakRespect: 200 };   // nível 5 (a feira pede-o)
const A = cliente('10.9.1.1'), B = cliente('10.9.1.2'), C = cliente('10.9.1.3'), N = cliente('10.9.1.4');
const act = (c, x) => c('POST', '/api/act', x);
const feira = async (c, item) => (await c('GET', '/api/feira' + (item ? '?item=' + item : ''))).body;
let t = 1000;   // o relógio do servidor (ms depois do início da ronda de teste)
const avanca = async (ms) => { await parar(srv); t += ms; srv = await novo(t); };
const dinheiro = async (c) => { const me = (await c('GET', '/api/state')).body.me; return me.cash + me.bank; };

test('preparar: três contas, o vendedor com sucata, uma peça rara e uma broca', async () => {
  srv = await novo(0);
  for (const [c, nome] of [[A, 'Vendedor'], [B, 'Comprador'], [C, 'Rival'], [N, 'Novato']]) {
    const r = await c('POST', '/api/register', { name: nome, password: 'segredo123', email: nome.toLowerCase() + '@t.pt' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await act(c, { type: 'class', id: CFG.classes[0].id });
  }
  await parar(srv);
  mexer('Vendedor', (e) => { Object.assign(e, NIVEL5); e.cash = 1000; e.bank = 0; e.mt = { sucata: 20 }; e.col = { moeda: 1 }; e.inv = [{ id: 'broca' }]; });
  mexer('Comprador', (e) => { Object.assign(e, NIVEL5); e.cash = 10_000; e.bank = 0; e.mt = { sucata: 38 }; });
  mexer('Rival', (e) => { Object.assign(e, NIVEL5); e.cash = 10_000; e.bank = 0; });
  mexer('Novato', (e) => { e.cash = 10_000; e.bank = 0; e.mt = { sucata: 5 }; });
  srv = await novo(t);
  const c = (await A('GET', '/api/config')).body;
  assert.equal(c.feira.feeBp, F.feeBp);
  assert.equal(c.feira.refs['mt:sucata'], 40); assert.equal(c.feira.refs['mt:chapa'], 130); assert.equal(c.feira.refs['col:moeda'], 2500); assert.equal(c.feira.refs['inv:broca'], 5000);
});

test('abaixo do nível 5 não se vende, não se compra nem se licita', async () => {
  for (const x of [{ type: 'feiraList', kind: 'mt', id: 'sucata', n: 1, preco: 40 }, { type: 'feiraBuy', lid: 1 }, { type: 'feiraBid', lid: 1, valor: 100 }, { type: 'feiraRelist', lid: 1, preco: 40 }]) {
    const r = await act(N, x); assert.equal(r.body.error, 'LOW_LEVEL', JSON.stringify(x)); assert.equal(r.body.need, F.minLvl);
  }
  assert.equal((await N('GET', '/api/state')).body.me.mt.sucata, 5);
});

test('pôr à venda a preço fixo: sai do depósito; valores maus são recusados sem mexer em nada', async () => {
  for (const x of [{ preco: 0 }, { preco: -5 }, { preco: 1.5 }, { preco: 'x' }, { preco: F.maxPrice + 1 }, { preco: 11 }, { preco: 121 }]) {
    const r = await act(A, { type: 'feiraList', kind: 'mt', id: 'sucata', n: 5, ...x }); assert.equal(r.body.error, 'BAD_PRICE', JSON.stringify(x));
    assert.equal(r.body.min, 12); assert.equal(r.body.max, 120);   // sucata: referência 40, de 0,3× a 3× por unidade
  }
  let r0 = await act(A, { type: 'feiraList', tipo: 'leilao', kind: 'mt', id: 'sucata', n: 5, preco: 59 });   // em leilão, a banda é pelo lote
  assert.equal(r0.body.error, 'BAD_PRICE'); assert.equal(r0.body.min, 60); assert.equal(r0.body.max, 600);
  r0 = await act(A, { type: 'feiraList', tipo: 'fixo', kind: 'col', id: 'moeda', n: 1, preco: 100 });   // tem-na, mas a 100 € não (de 750 € a 7 500 €)
  assert.equal(r0.body.error, 'BAD_PRICE'); assert.equal(r0.body.min, 750);
  for (const x of [{ kind: 'mt', id: 'sucata', n: 21 }, { kind: 'mt', id: 'ouro', n: 1 }, { kind: 'xx', id: 'sucata', n: 1 }, { kind: 'col', id: 'bule', n: 1 }, { kind: 'inv', i: 5 }, { kind: 'mt', id: '__proto__', n: 1 }]) {
    const r = await act(A, { type: 'feiraList', preco: 100, ...x }); assert.equal(r.status, 400, JSON.stringify(x)); assert.ok(['NO_ITEM', 'BAD_AMOUNT'].includes(r.body.error), JSON.stringify(r.body));
  }
  let r = await act(A, { type: 'feiraList', tipo: 'fixo', kind: 'mt', id: 'sucata', n: 5, preco: 100 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.mt.sucata, 15);
  const f = await feira(B, 'sucata');
  assert.deepEqual(f.cat.map((x) => [x.id, x.preco, x.n]), [['sucata', 100, 5]]);
  assert.equal(f.item.lista.length, 1); assert.equal(f.item.lista[0].quem, 'Vendedor'); assert.equal(f.item.lista[0].meu, false);
  assert.equal((await feira(A)).meus.length, 1);
});

test('comprar parte: paga, recebe, quem vendeu recebe menos 5%; não se compra o que é seu nem acima do teto do depósito', async () => {
  const L = (await feira(B, 'sucata')).item.lista[0];
  let r = await act(A, { type: 'feiraBuy', lid: L.lid, n: 1 }); assert.equal(r.body.error, 'OWN_LISTING');
  r = await act(B, { type: 'feiraBuy', lid: L.lid, n: 3 }); assert.equal(r.body.error, 'MAT_FULL');   // tem 38: só cabem 2
  r = await act(B, { type: 'feiraBuy', lid: L.lid, n: 6 }); assert.equal(r.body.error, 'BAD_AMOUNT');
  r = await act(B, { type: 'feiraBuy', lid: 999999, n: 1 }); assert.equal(r.body.error, 'NO_LISTING');
  r = await act(B, { type: 'feiraBuy', lid: L.lid, n: 2 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.mt.sucata, 40); assert.equal(r.body.me.cash, 10_000 - 200);
  const a = (await A('GET', '/api/state')).body.me;
  assert.equal(a.bank, 200 - fee(200));
  assert.equal((await feira(B, 'sucata')).item.lista[0].n, 3);
  assert.equal((await feira(B, 'sucata')).item.med, 100);
  const ev = (await A('GET', '/api/events')).body.list;
  assert.ok(ev.some((e) => e.k === 'fSold' && e.item === 'sucata' && e.n === 2 && e.money === 200 - fee(200)));
});

test('tirar da feira: o que sobrou volta logo', async () => {
  const L = (await feira(A)).meus[0];
  let r = await act(B, { type: 'feiraCancel', lid: L.lid }); assert.equal(r.body.error, 'NO_LISTING');
  r = await act(A, { type: 'feiraCancel', lid: L.lid });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.mt.sucata, 18);
  assert.equal((await feira(A)).meus.length, 0);
});

test('leilão: lance mínimo, cada lance 5% acima; o dinheiro de quem ia à frente volta; o fim paga a quem vendeu e quem ganhou levanta', async () => {
  let r = await act(A, { type: 'feiraList', tipo: 'leilao', kind: 'col', id: 'moeda', n: 1, preco: 1000 });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.col.moeda, undefined);
  const lid = (await feira(B)).leiloes[0].lid;
  const totalAntes = (await dinheiro(A)) + (await dinheiro(B)) + (await dinheiro(C));
  r = await act(B, { type: 'feiraBid', lid, valor: 999 }); assert.equal(r.body.error, 'BID_LOW'); assert.equal(r.body.min, 1000);
  r = await act(A, { type: 'feiraBid', lid, valor: 5000 }); assert.equal(r.body.error, 'OWN_LISTING');
  r = await act(B, { type: 'feiraBid', lid, valor: 1000 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.next, 1050);
  r = await act(B, { type: 'feiraBid', lid, valor: 2000 }); assert.equal(r.body.error, 'LEADING');
  r = await act(C, { type: 'feiraBid', lid, valor: 1049 }); assert.equal(r.body.error, 'BID_LOW');
  const b0 = await dinheiro(B), bc0 = (await B('GET', '/api/state')).body.me.cash;
  r = await act(C, { type: 'feiraBid', lid, valor: 1050 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await dinheiro(B), b0 + 1000, 'quem ia à frente recebe o dinheiro de volta');
  assert.equal((await B('GET', '/api/state')).body.me.cash, bc0 + 1000, 'na mão: no banco era um depósito sem taxa');
  assert.ok((await B('GET', '/api/events')).body.list.some((e) => e.k === 'fOutbid' && e.money === 1000));
  r = await act(A, { type: 'feiraCancel', lid }); assert.equal(r.body.error, 'HAS_BIDS');
  // presos no leilão: 1 050 (do Rival). O resto não mudou.
  assert.equal((await dinheiro(A)) + (await dinheiro(B)) + (await dinheiro(C)), totalAntes - 1050);
  assert.equal((await feira(C)).lances[0].frente, true);
  // o leilão acaba (24 h): paga-se a quem vendeu, e o Rival levanta a moeda
  await avanca(F.auctionMs + 60_000);
  const f = await feira(C);
  assert.equal(f.levantar.length, 1); assert.equal(f.levantar[0].won, true);
  assert.equal((await A('GET', '/api/state')).body.me.feira.levantar, 0);
  assert.equal((await C('GET', '/api/state')).body.me.feira.levantar, 1);
  assert.equal((await dinheiro(A)) + (await dinheiro(B)) + (await dinheiro(C)), totalAntes - fee(1050), 'só a taxa sai do jogo');
  r = await act(B, { type: 'feiraTake', lid }); assert.equal(r.body.error, 'NO_LISTING');
  r = await act(C, { type: 'feiraTake', lid }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.col.moeda, 1); assert.equal(r.body.result.won, true);
  assert.ok((await A('GET', '/api/events')).body.list.some((e) => e.k === 'fSold' && e.auc && e.money === 1050 - fee(1050)));
});

test('um lance nos últimos 10 minutos empurra o fim', async () => {
  let r = await act(A, { type: 'feiraList', tipo: 'leilao', kind: 'mt', id: 'sucata', n: 2, preco: 30 });
  const L = (await feira(B)).leiloes.find((x) => x.meu === false && x.id === 'sucata');
  await avanca(F.auctionMs - 3 * 60_000);   // faltam 3 minutos
  r = await act(B, { type: 'feiraBid', lid: L.lid, valor: 30 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.result.fim > L.fim, 'o fim passou para 10 minutos depois do lance');
  await avanca(5 * 60_000);   // já passou a hora marcada, mas ainda não os 10 minutos
  assert.equal((await feira(B)).lances.length, 1, JSON.stringify((await feira(B)).lances));
  await avanca(6 * 60_000);
  assert.equal((await feira(B)).levantar.length, 1);
});

test('anúncio que acaba sem venda volta para quem vendeu; um objeto do inventário passa de mão com o que tem', async () => {
  let r = await act(A, { type: 'feiraList', tipo: 'fixo', kind: 'inv', id: 'broca', i: 0, preco: 3000 });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(!r.body.me.inv.some((x) => x.id === 'broca'));
  r = await act(A, { type: 'feiraList', tipo: 'fixo', kind: 'mt', id: 'sucata', n: 1, preco: 50 });
  const broca = (await feira(B, 'broca')).item.lista[0];
  r = await act(B, { type: 'feiraBuy', lid: broca.lid });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(r.body.me.inv.some((x) => x.id === 'broca'));
  await avanca(F.listMs + 60_000);
  const f = await feira(A);
  assert.ok(f.levantar.some((x) => x.id === 'sucata' && !x.won));
  const s0 = (await A('GET', '/api/state')).body.me.mt.sucata || 0;
  r = await act(A, { type: 'feiraTake', lid: f.levantar.find((x) => x.id === 'sucata').lid });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.mt.sucata, s0 + 1);
  assert.ok((await A('GET', '/api/events')).body.list.some((e) => e.k === 'fBack' && e.item === 'sucata'));
});

test('no máximo 10 anúncios abertos por jogador', async () => {
  await parar(srv); mexer('Vendedor', (e) => { e.mt = { sucata: 30 }; }); srv = await novo(t);
  for (let k = 0; k < F.maxOpen; k++) { const r = await act(A, { type: 'feiraList', kind: 'mt', id: 'sucata', n: 1, preco: 20 }); assert.equal(r.status, 200, JSON.stringify(r.body)); }
  const r = await act(A, { type: 'feiraList', kind: 'mt', id: 'sucata', n: 1, preco: 20 });
  assert.equal(r.body.error, 'FEIRA_FULL'); assert.equal(r.body.me.mt.sucata, 30 - F.maxOpen);
});

test('o que está por levantar conta nos 10; volta-se a pôr à venda daí; levantar abre lugar', async () => {
  await avanca(F.listMs + 60_000);   // os 10 acabam sem venda e ficam à espera
  let f = await feira(A);
  assert.equal(f.meus.length, 0); assert.equal(f.levantar.length, F.maxOpen);
  let r = await act(A, { type: 'feiraList', kind: 'mt', id: 'sucata', n: 1, preco: 20 });
  assert.equal(r.body.error, 'FEIRA_FULL', 'a feira não é um armazém sem teto');
  const [x, y] = f.levantar;
  r = await act(A, { type: 'feiraRelist', lid: x.lid, tipo: 'fixo', preco: 5 }); assert.equal(r.body.error, 'BAD_PRICE');
  r = await act(B, { type: 'feiraRelist', lid: x.lid, tipo: 'fixo', preco: 30 }); assert.equal(r.body.error, 'NO_LISTING');
  r = await act(A, { type: 'feiraRelist', lid: x.lid, tipo: 'fixo', preco: 30 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  f = await feira(A);
  assert.equal(f.meus.length, 1); assert.equal(f.meus[0].preco, 30); assert.equal(f.levantar.length, F.maxOpen - 1);
  r = await act(C, { type: 'feiraBuy', lid: x.lid }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));   // vende-se outra vez
  r = await act(A, { type: 'feiraTake', lid: y.lid }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await act(A, { type: 'feiraList', kind: 'mt', id: 'sucata', n: 1, preco: 20 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  for (const L of (await feira(A)).levantar) await act(A, { type: 'feiraTake', lid: L.lid });   // arruma
  for (const L of (await feira(A)).meus) await act(A, { type: 'feiraCancel', lid: L.lid });
  assert.equal((await feira(A)).levantar.length + (await feira(A)).meus.length, 0);
});

test('tirar da feira sem espaço: fica à espera de ser levantado em vez de dar erro', async () => {
  await parar(srv); mexer('Vendedor', (e) => { e.mt = { sucata: 40 }; }); srv = await novo(t);
  let r = await act(A, { type: 'feiraList', kind: 'mt', id: 'sucata', n: 5, preco: 20 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  await parar(srv); mexer('Vendedor', (e) => { e.mt = { sucata: 38 }; }); srv = await novo(t);   // entretanto o depósito encheu
  const L = (await feira(A)).meus[0];
  r = await act(A, { type: 'feiraCancel', lid: L.lid }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.parked, true); assert.equal(r.body.me.mt.sucata, 38);
  const f = await feira(A);
  assert.equal(f.meus.length, 0); assert.ok(f.levantar.some((x) => x.lid === L.lid && x.n === 5));
  r = await act(A, { type: 'feiraTake', lid: L.lid }); assert.equal(r.body.error, 'MAT_FULL');
});

test('os lances param no teto (3× a referência pelo lote): acima não, e no teto acabou', async () => {
  await parar(srv); mexer('Vendedor', (e) => { e.col = { selo: 1 }; }); for (const nome of ['Comprador', 'Rival']) mexer(nome, (e) => { e.cash = 20_000; }); srv = await novo(t);   // selo: referência 2 500, teto 7 500
  let r = await act(A, { type: 'feiraList', tipo: 'leilao', kind: 'col', id: 'selo', n: 1, preco: 7000 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const L = (await feira(B)).leiloes.find((x) => x.id === 'selo');
  assert.equal(L.max, 7500); assert.equal(L.next, 7000);
  r = await act(B, { type: 'feiraBid', lid: L.lid, valor: 7501 }); assert.equal(r.body.error, 'BID_HIGH'); assert.equal(r.body.max, 7500);
  r = await act(B, { type: 'feiraBid', lid: L.lid, valor: 7000 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.next, 7350);
  r = await act(C, { type: 'feiraBid', lid: L.lid, valor: 7400 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.next, 7500, 'o passo seguinte passava o teto: fica no teto');
  r = await act(B, { type: 'feiraBid', lid: L.lid, valor: 7500 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.next, 0);
  r = await act(C, { type: 'feiraBid', lid: L.lid, valor: 8000 }); assert.equal(r.body.error, 'BID_TOP');
  assert.equal((await feira(C)).leiloes.find((x) => x.id === 'selo').next, 0);
});

test('a taxa arredonda para cima: vender a 19 € dá 18 €', async () => {
  await parar(srv); mexer('Vendedor', (e) => { e.mt = { madeira: 1 }; e.bank = 0; }); srv = await novo(t);
  let r = await act(A, { type: 'feiraList', kind: 'mt', id: 'madeira', n: 1, preco: 19 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const L = (await feira(B, 'madeira')).item.lista[0];
  r = await act(B, { type: 'feiraBuy', lid: L.lid }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await A('GET', '/api/state')).body.me.bank, 18);
});

test('entre as mesmas duas contas, a diferença para a referência tem teto por dia (vender caro e recomprar barato)', async () => {
  const D = cliente('10.9.1.5'), E2 = cliente('10.9.1.6');
  for (const [c, nome] of [[D, 'Dono'], [E2, 'Alterego']]) {
    const r = await c('POST', '/api/register', { name: nome, password: 'segredo123', email: nome.toLowerCase() + '@t.pt' });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
    await act(c, { type: 'class', id: CFG.classes[0].id });
  }
  await parar(srv);
  mexer('Dono', (e) => { Object.assign(e, NIVEL5); e.cash = 0; e.bank = 0; e.col = { bule: 3 }; e.mt = {}; });
  mexer('Alterego', (e) => { Object.assign(e, NIVEL5); e.cash = 100_000; e.bank = 0; e.col = {}; });
  srv = await novo(t);
  // bule: referência 5 000. Vende a 12 000 (7 000 acima) e o outro devolve-lho a 2 000 (3 000 abaixo): 10 000, o teto
  let r = await act(D, { type: 'feiraList', kind: 'col', id: 'bule', n: 1, preco: 12_000 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  r = await act(E2, { type: 'feiraBuy', lid: (await feira(E2, 'bule')).item.lista[0].lid }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  r = await act(E2, { type: 'feiraList', kind: 'col', id: 'bule', n: 1, preco: 2000 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  await parar(srv); mexer('Dono', (e) => { e.cash = 50_000; }); srv = await novo(t);
  r = await act(D, { type: 'feiraBuy', lid: (await feira(D, 'bule')).item.lista[0].lid }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  // mais um ciclo já não: nem a preço fixo nem em leilão
  r = await act(D, { type: 'feiraList', kind: 'col', id: 'bule', n: 1, preco: 6000 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const L = (await feira(E2, 'bule')).item.lista.find((x) => x.quem === 'Dono');
  r = await act(E2, { type: 'feiraBuy', lid: L.lid }); assert.equal(r.body.error, 'PAIR_CAP'); assert.equal(r.body.left, 0);
  r = await act(D, { type: 'feiraList', tipo: 'leilao', kind: 'col', id: 'bule', n: 1, preco: 5000 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const A2 = (await feira(E2)).leiloes.find((x) => x.quem === 'Dono');
  r = await act(E2, { type: 'feiraBid', lid: A2.lid, valor: 6000 }); assert.equal(r.body.error, 'PAIR_CAP');
  r = await act(E2, { type: 'feiraBid', lid: A2.lid, valor: 5000 }); assert.equal(r.status, 200, 'ao preço de referência não passa nada');
  // outra conta compra à vontade
  r = await act(C, { type: 'feiraBuy', lid: L.lid }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  // 24 h depois o par volta a poder (o leilão de referência entretanto acabou e o Alterego levanta o bule)
  await avanca(F.pairMs + 60_000);
  r = await act(E2, { type: 'feiraTake', lid: A2.lid }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  r = await act(E2, { type: 'feiraList', kind: 'col', id: 'bule', n: 1, preco: 9000 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  r = await act(D, { type: 'feiraBuy', lid: (await feira(D, 'bule')).item.lista.find((x) => x.quem === 'Alterego').lid }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
});

test('cada conta, com toda a gente, também tem teto por dia (várias contas alternativas não multiplicam o do par)', async () => {
  const cs = [['Chefe', '10.9.1.7'], ['Alt1', '10.9.1.8'], ['Alt2', '10.9.1.9'], ['Alt3', '10.9.1.10']].map(([nome, ip]) => [cliente(ip), nome]);
  for (const [c, nome] of cs) {
    const r = await c('POST', '/api/register', { name: nome, password: 'segredo123', email: nome.toLowerCase() + '@t.pt' });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
    await act(c, { type: 'class', id: CFG.classes[0].id });
  }
  await parar(srv);
  mexer('Chefe', (e) => { Object.assign(e, NIVEL5); e.col = { bule: 4 }; e.mt = {}; });
  for (const n of ['Alt1', 'Alt2', 'Alt3']) mexer(n, (e) => { Object.assign(e, NIVEL5); e.cash = 50_000; e.col = {}; });
  mexer('Rival', (e) => { e.cash = 50_000; });
  srv = await novo(t);
  const [[CH], ...alts] = cs;
  for (let k = 0; k < 4; k++) { const r = await act(CH, { type: 'feiraList', kind: 'col', id: 'bule', n: 1, preco: k < 3 ? 15_000 : 5500 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200)); }
  const lista = () => feira(C, 'bule').then((f) => f.item.lista.filter((x) => x.quem === 'Chefe'));
  // cada uma compra um a 15 000 (10 000 acima da referência): 30 000 por conta, o teto
  for (const [c] of alts) { const L = (await lista()).find((x) => x.preco === 15_000); const r = await act(c, { type: 'feiraBuy', lid: L.lid }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200)); }
  const L = (await lista())[0];
  assert.equal(L.lim, 0, 'o site já sabe que não dá');
  const r = await act(C, { type: 'feiraBuy', lid: L.lid }); assert.equal(r.body.error, 'THEIR_CAP'); assert.equal(r.body.left, 0);
});

test('uma arma vale pelos usos que lhe restam: a referência e a banda descem com o desgaste', async () => {
  await parar(srv); mexer('Vendedor', (e) => { e.inv = [{ id: 'sniper', u: 0 }, { id: 'sniper', u: 50 }]; }); srv = await novo(t);
  let r = await act(A, { type: 'feiraList', kind: 'inv', id: 'sniper', i: 0, preco: 9000 }); assert.equal(r.body.error, 'BAD_PRICE'); assert.equal(r.body.max, 3);
  r = await act(A, { type: 'feiraList', kind: 'inv', id: 'sniper', i: 1, preco: 13_501 }); assert.equal(r.body.error, 'BAD_PRICE'); assert.equal(r.body.max, 13_500);   // 9 000 × 50/100 × 3
  r = await act(A, { type: 'feiraList', kind: 'inv', id: 'sniper', i: 1, preco: 4500 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const L = (await feira(B, 'sniper')).item.lista[0];
  assert.equal(L.ref, 4500); assert.equal(L.u, 50);
  await act(A, { type: 'feiraCancel', lid: L.lid });
});

test('o que pede nível (perneiras, nível 25) não se compra nem se licita abaixo dele', async () => {
  await parar(srv);
  mexer('Vendedor', (e) => { e.inv = [{ id: 'perneiras' }, { id: 'perneiras' }]; });
  mexer('Comprador', (e) => { e.cash = 20_000; e.inv = []; });
  srv = await novo(t);
  let r = await act(A, { type: 'feiraList', kind: 'inv', id: 'perneiras', i: 0, preco: 1500 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  r = await act(A, { type: 'feiraList', tipo: 'leilao', kind: 'inv', id: 'perneiras', i: 0, preco: 1500 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const fixo = (await feira(B, 'perneiras')).item.lista[0], leil = (await feira(B)).leiloes.find((x) => x.id === 'perneiras');
  r = await act(B, { type: 'feiraBuy', lid: fixo.lid }); assert.equal(r.body.error, 'LOW_LEVEL'); assert.equal(r.body.need, 25);
  r = await act(B, { type: 'feiraBid', lid: leil.lid, valor: 1500 }); assert.equal(r.body.error, 'LOW_LEVEL'); assert.equal(r.body.need, 25);
  for (const x of [fixo, leil]) await act(A, { type: 'feiraCancel', lid: x.lid });
});

test('o lance devolvido volta de onde saiu (a parte do banco para o banco); quem foi passado vê o leilão em «os meus»', async () => {
  await parar(srv);
  mexer('Vendedor', (e) => { e.col = { caneta: 1 }; });
  mexer('Comprador', (e) => { e.cash = 500; e.bank = 5000; });
  mexer('Rival', (e) => { e.cash = 20_000; });
  srv = await novo(t);
  let r = await act(A, { type: 'feiraList', tipo: 'leilao', kind: 'col', id: 'caneta', n: 1, preco: 2500 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const L = (await feira(B)).leiloes.find((x) => x.id === 'caneta');
  r = await act(B, { type: 'feiraBid', lid: L.lid, valor: 3000 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.me.cash, 0); assert.equal(r.body.me.bank, 2500);
  r = await act(C, { type: 'feiraBid', lid: L.lid, valor: 3150 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const b = (await B('GET', '/api/state')).body.me;
  assert.equal(b.cash, 500); assert.equal(b.bank, 5000, 'sem taxa de depósito e sem ficar exposto na mão');
  const f = await feira(B);
  assert.equal(f.passados.length, 1); assert.equal(f.passados[0].lid, L.lid); assert.equal(f.passados[0].frente, false);
});

test('quem licita não guarda mais de 10 coisas na feira (o que tem por levantar conta)', async () => {
  await parar(srv);
  const db = new DatabaseSync(join(dir, 'jogo.db'));
  const idB = db.prepare('SELECT id FROM contas WHERE nome = ?').get('Comprador').id, idA = db.prepare('SELECT id FROM contas WHERE nome = ?').get('Vendedor').id;
  const ronda = db.prepare('SELECT ronda FROM jogadores WHERE conta = ?').get(idB).ronda;
  const ins = db.prepare("INSERT INTO feira (ronda, vendedor, tipo, kind, item, obj, n, preco, criado, fim, estado, dono) VALUES (?, ?, 'fixo', 'mt', 'sucata', NULL, 1, 20, 0, 0, 'levantar', ?)");
  for (let k = 0; k < F.maxOpen; k++) ins.run(ronda, idA, idB);
  db.close();
  mexer('Comprador', (e) => { e.cash = 20_000; });
  srv = await novo(t);
  const L = (await feira(B)).leiloes.find((x) => x.id === 'caneta');
  const r = await act(B, { type: 'feiraBid', lid: L.lid, valor: 3400 }); assert.equal(r.body.error, 'FEIRA_FULL');
});

test('valores hostis nunca dão erro do servidor', async () => {
  const hostis = [-1, 0.5, 1e21, '5', null, [], {}, true, '__proto__', 'constructor', 'toString'];
  for (const type of ['feiraList', 'feiraBuy', 'feiraBid', 'feiraCancel', 'feiraTake', 'feiraRelist', 'feiraXpto']) for (const v of hostis) {
    const r = await act(B, { type, lid: v, n: v, i: v, preco: v, valor: v, kind: v, id: v, tipo: v });
    assert.equal(r.status, 400, `${type} ${JSON.stringify(v)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
  }
  for (const q of ['?item=__proto__', '?item=' + 'x'.repeat(60), '?item=', '?x=1', '?aoff=-5', '?aoff=1e99', '?aoff=abc', '?aoff=40']) assert.equal((await B('GET', '/api/feira' + q)).status, 200);
});
