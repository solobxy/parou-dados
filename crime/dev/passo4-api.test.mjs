// Passo 4 da base nova (inventário e equipamento), por API:
// 1) quem jogou na versão 58 fica com a arma e a proteção no corpo (e uma caixa de balas se tinha arma de fogo);
// 2) golpe com arma, balas, trocar de arma, recetador e reparação; o caixa regista cada uma.
// Corre com: node --test dev/passo4-api.test.mjs   (dentro de crime/; precisa do git para tirar o servidor da versão 58)
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
const V58 = '43d96d5';   // passo 3 (versão 58): ainda com uma arma e uma proteção, sem inventário
const PORT = 4600 + Math.floor(Math.random() * 90);
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
  dir = mkdtempSync(join(tmpdir(), 'crime-p4-'));
  velho = mkdtempSync(join(tmpdir(), 'crime-v58-'));
  execSync(`git -C "${join(CRIME, '..')}" archive ${V58} crime | tar -x -C "${velho}"`);
});
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); rmSync(velho, { recursive: true, force: true }); });

const A = cliente('10.4.0.1'), B = cliente('10.4.0.2');
const G = (id) => CFG.gear.find((x) => x.id === id);

test('versão 58 → passo 4: a pistola e o colete passam para o corpo, com uma caixa de balas; quem não tinha nada fica de mãos vazias', async () => {
  srv = await arrancar(join(velho, 'crime', 'server.mjs'), { TESTE_DESVIO_MS: desvio(3 * 3600e3) });
  assert.equal((await A('POST', '/api/register', { name: 'Armado', password: 'segredo123', email: 'armado@t.pt' })).status, 200);
  await A('POST', '/api/act', { type: 'class', id: 'ladrao' });
  assert.equal((await B('POST', '/api/register', { name: 'Desarmado', password: 'segredo123', email: 'desarmado@t.pt' })).status, 200);
  await B('POST', '/api/act', { type: 'class', id: 'ladrao' });
  await parar(srv);
  mexer('Armado', (e) => { e.weapon = 2; e.armor = 1; e.cash = 20_000; e.bank = 0; e.respect = e.peakRespect = CFG.levels[29]; e.energy = 100; e.jailUntil = 0; });
  srv = await novo(3 * 3600e3 + 60e3);
  const me = (await A('GET', '/api/state')).body.me;
  assert.deepEqual(me.eq.mao, { id: 'pistola', u: G('pistola').life }); assert.deepEqual(me.eq.tronco, { id: 'colete' });
  assert.deepEqual(me.inv, [{ id: 'balas', n: CFG.bullets.box }]);
  assert.equal(me.weapon, undefined); assert.equal(me.armor, undefined);
  assert.equal(me.atkBp, G('pistola').atk); assert.equal(me.defBp, G('colete').def);
  assert.equal(me.invCap, CFG.house.tiers[0].slots); assert.equal(me.invUsed, 1);
  const outro = (await B('GET', '/api/state')).body.me;
  assert.ok(Object.values(outro.eq).every((x) => x === null)); assert.deepEqual(outro.inv, []);
  const cfg = await (await fetch(BASE + '/api/config')).json();
  assert.equal(cfg.slots.length, 9); assert.ok(cfg.gear.length >= 18); assert.equal(cfg.bullets.perJob, 10); assert.equal(cfg.weapons, undefined); assert.equal(cfg.armors, undefined);
});

test('inventário por API: golpe com arma gasta balas e um uso, comprar balas, trocar de arma, recetador e reparação; o caixa regista', async () => {
  const k = CFG.crimes.findIndex((c) => c.id === 'armado');
  let r = await A('POST', '/api/act', { type: 'crime', k });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.ammo, CFG.bullets.perJob); assert.equal(r.body.me.eq.mao.u, G('pistola').life - 1);
  assert.equal(r.body.me.inv.find((x) => x.id === 'balas')?.n || 0, CFG.bullets.box - CFG.bullets.perJob);
  // v75: preso só se faz o que se faz na prisão; se o golpe correu mal e deu prisão, paga-se a fiança antes de ir às compras
  if (r.body.result.busted) { const f = await A('POST', '/api/act', { type: 'bail' }); assert.equal(f.status, 200, JSON.stringify(f.body)); }
  // balas às caixas
  r = await A('POST', '/api/act', { type: 'buy', id: 'balas', n: 2 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.price, 2 * CFG.bullets.price);
  // caçadeira para a principal; depois a navalha (branca) e uma soqueira que troca com ela
  r = await A('POST', '/api/act', { type: 'buy', id: 'navalha' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await A('POST', '/api/act', { type: 'buy', id: 'soqueira' }); assert.equal(r.body.result.swapped, 'navalha');
  const i = r.body.me.inv.findIndex((x) => x.id === 'navalha');
  r = await A('POST', '/api/act', { type: 'equip', i }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.eq.branca.id, 'navalha'); assert.ok(r.body.me.inv.some((x) => x.id === 'soqueira'));
  // o recetador: objetos pelo valor, equipamento por metade
  await parar(srv);
  mexer('Armado', (e) => { e.inv.push({ id: 'joias', n: 2, v: 7_000 }); });
  srv = await novo(3 * 3600e3 + 120e3);
  // o golpe pode ter trazido objetos (ex.: joias da montra): o recetador paga a soma de tudo o que é objeto
  const objetos = (await A('GET', '/api/state')).body.me.inv.filter((x) => CFG.loot.goods.includes(x.id));
  const valor = objetos.reduce((x, it) => x + it.v, 0), quantos = objetos.reduce((x, it) => x + it.n, 0);
  assert.ok(valor >= 7_000);
  r = await A('POST', '/api/act', { type: 'sellGoods' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.money, valor); assert.equal(r.body.result.n, quantos);
  r = await A('POST', '/api/act', { type: 'sellGoods' }); assert.equal(r.body.error, 'NOTHING_TO_SELL');
  const s = r.body.me.inv.findIndex((x) => x.id === 'soqueira');
  r = await A('POST', '/api/act', { type: 'sell', i: s }); assert.equal(r.body.result.money, Math.floor(G('soqueira').price / 2));
  // reparar a pistola: paga-se o uso gasto
  r = await A('POST', '/api/act', { type: 'repair', slot: 'mao' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.price, Math.ceil(G('pistola').price / G('pistola').life)); assert.equal(r.body.me.eq.mao.u, G('pistola').life);
  r = await A('POST', '/api/act', { type: 'repair', slot: 'mao' }); assert.equal(r.body.error, 'NOT_WORN');
  // um separador aberto na versão antiga ainda compra pelo pedido antigo (arma pelo índice)
  r = await A('POST', '/api/act', { type: 'gear', kind: 'weapon', idx: 3 }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.eq.principal.id, 'cacadeira');
  const cx = caixa();
  assert.equal(cx.sellGoods.e, valor); assert.equal(cx.sell.e, Math.floor(G('soqueira').price / 2));
  assert.equal(cx.buy.s, 2 * CFG.bullets.price + G('navalha').price + G('soqueira').price);
  assert.equal(cx.repair.s, Math.ceil(G('pistola').price / G('pistola').life));
});
