// Passo 2 da base nova (economia nova), por API:
// 1) quem jogou na versão 56 com os preços antigos recebe de volta o que comprou, uma só vez, e isso fica no caixa;
// 2) golpe, barra a droga, compra e venda de droga, ginásio com energia: tudo chega ao motor e o caixa regista o que entrou e saiu.
// Corre com: node --test dev/passo2-api.test.mjs   (dentro de crime/; precisa do git para tirar o servidor da versão 56)
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
const V56 = '302058d';   // passo 1 (versão 56): conta permanente, ainda com os preços antigos
const PORT = 4400 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let dir, velho, srv;

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

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'crime-p2-'));
  velho = mkdtempSync(join(tmpdir(), 'crime-v56-'));
  execSync(`git -C "${join(CRIME, '..')}" archive ${V56} crime | tar -x -C "${velho}"`);
});
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); rmSync(velho, { recursive: true, force: true }); });

const A = cliente('10.2.0.1');

test('versão 56 → economia nova: o que se comprou aos preços antigos volta em dinheiro, uma só vez, e entra no caixa', async () => {
  srv = await arrancar(join(velho, 'crime', 'server.mjs'), { TESTE_DESVIO_MS: desvio(3 * 3600e3) });
  assert.equal((await A('POST', '/api/register', { name: 'Comprador', password: 'segredo123', email: 'comprador@t.pt' })).status, 200);
  await A('POST', '/api/act', { type: 'class', id: 'ladrao' });
  await parar(srv);
  mexer('Comprador', (e) => { e.cash = 2_000_000; e.bank = 0; e.respect = e.peakRespect = 3000; });   // nível 20: vende haxixe, ainda não coca
  srv = await arrancar(join(velho, 'crime', 'server.mjs'), { TESTE_DESVIO_MS: desvio(3 * 3600e3 + 60e3) });
  // aos preços antigos: duas casas (2 000 + 10 000), a primeira melhoria (500), duas armas (500 + 3 000), uma lavandaria (3 000) e um luxo (250 000)
  for (const body of [{ type: 'house' }, { type: 'house' }, { type: 'houseUp', u: 0 }, { type: 'gear', kind: 'weapon', idx: 0 }, { type: 'gear', kind: 'weapon', idx: 1 }, { type: 'buyBiz', i: 0 }, { type: 'luxury' }]) {
    const r = await A('POST', '/api/act', body); assert.equal(r.status, 200, JSON.stringify(body) + ' ' + JSON.stringify(r.body));
  }
  const antes = (await A('GET', '/api/state')).body.me;
  const pago = 2000 + 10000 + 500 + 500 + 3000 + 3000 + 250000;
  assert.equal(antes.cash + antes.bank, 2_000_000 - pago);
  assert.equal(antes.house, 2); assert.equal(antes.weapon, 1); assert.equal(antes.luxuries, 1); assert.equal(antes.biz[0].n, 1);
  await parar(srv);
  // servidor novo: devolve tudo (a melhoria vale um quarto do preço da casa desse nível) e o jogador fica com as coisas novas a zero
  srv = await novo(3 * 3600e3 + 120e3);
  const s = (await A('GET', '/api/state')).body;
  const me = s.me, guardado = antes.biz[0].stored || 0;
  assert.equal(me.house, 0); assert.ok(Object.values(me.eq).every((x) => !x)); assert.equal(me.luxuries, 0); assert.equal(me.biz[0].n, 0); assert.equal(me.energyMax, 100);
  assert.ok(me.cash + me.bank >= 2_000_000 && me.cash + me.bank <= 2_000_000 + guardado + 1000, 'devolveu ' + (me.cash + me.bank - (antes.cash + antes.bank)));
  let cx = caixa();
  assert.equal(cx.devolucao.n, 1); assert.equal(cx.devolucao.e, me.cash + me.bank - (antes.cash + antes.bank));
  // reiniciar outra vez não devolve de novo
  await parar(srv); srv = await novo(3 * 3600e3 + 180e3);
  const me2 = (await A('GET', '/api/state')).body.me;
  assert.equal(me2.cash + me2.bank, me.cash + me.bank); assert.equal(caixa().devolucao.n, 1);
});

test('economia nova pela API: golpe, barra a droga, venda de droga e ginásio, e o caixa regista o que entrou e saiu', async () => {
  const me0 = (await A('GET', '/api/state')).body.me;
  assert.equal(me0.vigor, CFG.vigor.max); assert.equal(me0.street.heatBp, 10000); assert.deepEqual(me0.deal, { dst: [0, 0], used: 0, cap: (1 + Math.floor(me0.level / 25)) * 10 });
  const cfg = await (await fetch(BASE + '/api/config')).json();
  assert.equal(cfg.crimes.length, 9); assert.deepEqual(cfg.refillBar, { a: 25, b: 5, coolPerH: 25 }); assert.equal(cfg.deal.list.length, 2); assert.equal(cfg.vigor.max, 100);
  // assalto a loja sem pistola: recusado; o armado ainda não abriu (nível 30). Antes do golpe, que pode acabar na prisão.
  let r = await A('POST', '/api/act', { type: 'crime', k: 4 }); assert.equal(r.body.error, 'NEED_GUN');
  r = await A('POST', '/api/act', { type: 'crime', k: 5 }); assert.equal(r.body.error, 'LOCKED');
  // golpe: a rua conta a stamina gasta hoje; o caixa separa o que se levou
  r = await A('POST', '/api/act', { type: 'crime', k: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.street.used, CFG.crimes[0].e); assert.equal(r.body.me.energy, 100 - CFG.crimes[0].e);
  const levou = r.body.result.success ? r.body.result.money : 0;
  if (r.body.result.busted) { r = await A('POST', '/api/act', { type: 'bail' }); assert.equal(r.status, 200, JSON.stringify(r.body)); }
  // barra a droga
  r = await A('POST', '/api/act', { type: 'refill' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.energy, 100); assert.equal(r.body.me.refill, null);
  const barra = r.body.result.price;
  // compra e venda de droga na rua (haxixe a partir do nível 10)
  r = await A('POST', '/api/act', { type: 'dealBuy', j: 0, kg: 1 }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.deal.dst[0], 1000);
  r = await A('POST', '/api/act', { type: 'deal', j: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.grams, 60); assert.equal(r.body.result.money, 300); assert.equal(r.body.me.deal.used, 1); assert.equal(r.body.me.deal.dst[0], 940);
  r = await A('POST', '/api/act', { type: 'deal', j: 1 }); assert.equal(r.body.error, 'LOW_LEVEL');
  r = await A('POST', '/api/act', { type: 'dealBuy', j: 0, kg: 0 }); assert.equal(r.body.error, 'BAD_AMOUNT');
  // ginásio: gasta energia, não stamina
  r = await A('POST', '/api/act', { type: 'gymStart', stat: 'F', reps: 5 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.energy, 100 - CFG.deal.step);   // a série cobra a energia no fim, pelas repetições feitas
  const cx = caixa();
  assert.equal((cx['golpe:carteirista'] || { e: 0 }).e, levou); assert.equal(cx.refill.s, barra); assert.equal(cx.dealBuy.s, 2000); assert.equal(cx.deal.e, 300);
});
