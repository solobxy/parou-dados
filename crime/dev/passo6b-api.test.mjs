// Passo 6 (mundo ligado), parte 2, por API:
// 1) quem jogava na versão 61 fica com o armazém de Lisboa e o stock que tinha; o mundo ganha o Alentejo, o Algarve e o mercado;
// 2) comprar um armazém no Alentejo, comprar coca lá, mandá-la para Lisboa (1 hora, com risco) e vendê-la; o caixa e as contas
//    das regiões registam tudo;
// 3) nas edições: rusgas a quem guarda muito à vista com a polícia a apertar (também fora do jogo), com aviso, multa no caixa e
//    prisão; e o calor de um armazém parado desce sozinho.
// Corre com: node --test dev/passo6b-api.test.mjs   (dentro de crime/; precisa do git para tirar o servidor da versão 61)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CFG } from '../engine/config.js';
import * as MW from '../engine/mundo.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CRIME = join(AQUI, '..');
const V61 = 'de1bd33';   // passo 6, parte 1 (versão 61): sem regiões
const PORT = 4900 + Math.floor(Math.random() * 90);
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
const H = 3600e3;
const desvio = (depois) => String(OFF + depois);
async function arrancar(servidor, env) {
  const p = spawn(process.execPath, ['--import', join(dirname(servidor), 'test', 'relogio.mjs'), servidor], {
    env: { ...process.env, PORT: String(PORT), DATA: dir, COOKIE_INSEGURO: '1', ATOS_3S: '1000', ATOS_MIN: '100000', PRIMEIRA_EPOCA: SEXTA, TESTE_SEMENTE: '61', ...env },
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
const ler = (nome) => { const db = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true }); const id = db.prepare('SELECT id FROM contas WHERE nome = ?').get(nome).id; const e = JSON.parse(db.prepare('SELECT estado FROM jogadores WHERE conta = ?').get(id).estado); db.close(); return e; };
const caixa = () => { const db = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true }); const rows = db.prepare('SELECT fonte, SUM(entra) e, SUM(sai) s FROM caixa GROUP BY fonte').all(); db.close(); return Object.fromEntries(rows.map((r) => [r.fonte, { e: r.e, s: r.s }])); };
const lerMundo = () => { const db = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true }); const b = JSON.parse(db.prepare('SELECT dados FROM bolsa').get().dados); db.close(); return b; };
function mexerMundo(fn) {
  const db = new DatabaseSync(join(dir, 'jogo.db'));
  const row = db.prepare('SELECT ronda, dados FROM bolsa').get(), b = JSON.parse(row.dados); fn(b);
  db.prepare('UPDATE bolsa SET dados = ? WHERE ronda = ?').run(JSON.stringify(b), row.ronda); db.close();
}
const novo = (depois) => arrancar(join(CRIME, 'server.mjs'), { TESTE_DESVIO_MS: desvio(depois) });
const proxEd = (depois) => MW.edStart(MW.edAt(T0 + depois) + 1) - T0;
// o preço de n unidades como o ecrã o calcula, com a procura e a saturação que a vista traz
function preco(me, r, d, n, side) {
  const g = me.mk[r], M = CFG.market, D = MW.depthU(r, d), s0 = g.sat[d], lim = side > 0 ? M.satMax : M.satMin;
  const n1 = Math.min(n, (Math.max(0, side > 0 ? lim - s0 : s0 - lim) * D) / 10000);
  const sum = (n1 * (s0 + (side > 0 ? s0 + (n1 * 10000) / D : s0 - (n1 * 10000) / D))) / 2 + (n - n1) * lim;
  const c = (MW.refC(d) * g.dem[d] * sum * (10000 + side * M.spreadBp)) / 1e12;
  return side > 0 ? Math.ceil(c) : Math.floor(c);
}

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'crime-p6b-'));
  velho = mkdtempSync(join(tmpdir(), 'crime-v61-'));
  execSync(`git -C "${join(CRIME, '..')}" archive ${V61} crime | tar -x -C "${velho}"`);
});
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); rmSync(velho, { recursive: true, force: true }); });

const A = cliente('10.6.1.1'), B = cliente('10.6.1.2');
const COCA = CFG.drugs.findIndex((g) => g.id === 'coca'), HAX = CFG.drugs.findIndex((g) => g.id === 'haxixe');

test('versão 61 → parte 2: o armazém de Lisboa com o que lá estava, e o mundo com as três regiões e o mercado', async () => {
  srv = await arrancar(join(velho, 'crime', 'server.mjs'), { TESTE_DESVIO_MS: desvio(3 * H) });
  assert.equal((await A('POST', '/api/register', { name: 'Traficante', password: 'segredo123', email: 'trafico@t.pt' })).status, 200);
  await A('POST', '/api/act', { type: 'class', id: 'ladrao' });
  assert.equal((await B('POST', '/api/register', { name: 'Guardador', password: 'segredo123', email: 'guarda@t.pt' })).status, 200);
  await B('POST', '/api/act', { type: 'class', id: 'ladrao' });
  await A('GET', '/api/stocks');   // a bolsa da versão 61 fica gravada sem regiões
  await parar(srv);
  mexer('Traficante', (e) => { e.cash = 600_000; e.bank = 0; e.respect = e.peakRespect = CFG.levels[29]; e.stock[HAX] = 1234; });
  srv = await novo(3 * H + 60e3);
  const me = (await A('GET', '/api/state')).body.me;
  assert.equal(me.stock[HAX], 1234, 'o stock fica');
  assert.equal(me.wh.lx.sp, 1); assert.equal(me.wh.lx.cap, CFG.wh.lx.sp[0]); assert.equal(me.wh.al, null); assert.equal(me.wh.ag, null);
  assert.deepEqual(Object.keys(me.mk), ['lx', 'al', 'ag']);
  assert.equal(me.mk.al.dem[COCA], CFG.market.dem.al.coca);
  const cfg = await (await fetch(BASE + '/api/config')).json();
  assert.ok(cfg.regions && cfg.market && cfg.wh && cfg.mv);
  const n = (await A('GET', '/api/news')).body.mundo;
  assert.equal(n.rg.al.crime, CFG.regions.crime.al.start); assert.equal(n.rg.ag.crime, CFG.regions.crime.ag.start);
  assert.ok(lerMundo().w.rg, 'o mundo gravado já tem as regiões');
});

test('armazém no Alentejo, coca de lá para Lisboa e venda em Lisboa: preço, risco, chegada, caixa e contas da região', async () => {
  let r = await A('POST', '/api/act', { type: 'whBuy', r: 'al' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  let me = r.body.me; assert.equal(me.wh.al.cap, CFG.wh.al.sp[0]);
  const n = 300, c = preco(me, 'al', COCA, n, 1);
  r = await A('POST', '/api/act', { type: 'mktBuy', r: 'al', d: COCA, n, c }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.cost, Math.ceil(c / 100), 'paga o que o ecrã mostrou');
  me = r.body.me; assert.equal(me.wh.al.s[COCA], n); assert.ok(me.wh.al.heat > 0, 'o armazém aqueceu');
  assert.ok(me.mk.al.sat[COCA] > 10000, 'e o preço lá subiu');
  r = await A('POST', '/api/act', { type: 'mktBuy', r: 'al', d: COCA, n: 10, c: 1 }); assert.equal(r.body.error, 'PRICE_CHANGED');
  r = await A('POST', '/api/act', { type: 'mvSend', a: 'al', b: 'lx', d: COCA, n }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const ida = r.body.result;
  assert.equal(ida.risk, Math.round(((me.mk.lx.press + me.mk.al.press) * 10) / 2));
  assert.equal(r.body.me.mv.length, 1); assert.equal(r.body.me.mv[0].x, undefined, 'o desfecho não vem para o ecrã');
  await parar(srv);
  const acc = lerMundo().w.acc;
  assert.equal(acc.rg.al, Math.round(ida.v / CFG.regions.ptsEur) * 2, 'compra e saída contam para o Alentejo');
  assert.equal(acc.lx, Math.round(ida.v / CFG.regions.ptsEur), 'a chegada conta para Lisboa');
  // uma hora depois chegou (ou a polícia ficou com ela): a vista diz qual
  srv = await novo(3 * H + 60e3 + H + 30e3);
  me = (await A('GET', '/api/state')).body.me;
  assert.equal(me.mv.length, 0); assert.equal(me.mvLog.length, 1);
  if (me.mvLog[0].x === 2) { assert.equal(me.stock[COCA], 0); assert.ok(me.mvLog[0].jail); return; }
  assert.equal(me.stock[COCA], n);
  const v = preco(me, 'lx', COCA, n, -1);
  r = await A('POST', '/api/act', { type: 'mktSell', r: 'lx', d: COCA, n, c: v }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.got, Math.floor(v / 100));
  const cx = caixa();
  assert.ok(cx.whBuy.s === CFG.wh.al.price && cx.mktBuy.s === Math.ceil(c / 100) && cx.mktSell.e === Math.floor(v / 100));
});

test('edições: rusgas a quem guarda muito à vista, também fora do jogo, com aviso, multa e prisão; o calor parado desce', async () => {
  await parar(srv);
  // 6 000 000 € de coca à vista no Alentejo (a pressão sobe sozinha com tanta droga guardada) e um armazém parado e quente no Algarve
  mexer('Guardador', (e) => {
    e.respect = e.peakRespect = CFG.levels[29]; e.cash = 2_000_000;
    const s = CFG.drugs.map(() => 0); s[COCA] = 220000;
    e.wh = { lx: { sp: 1, hd: 1, fr: 1, h: 0, f: 0 }, al: { sp: 5, hd: 1, fr: 1, h: 10000, f: 0, s }, ag: { sp: 1, hd: 1, fr: 1, h: 5000, f: 0, s: CFG.drugs.map(() => 0) } };
  });
  mexerMundo((b) => { b.w.rg.al.crime = 95; });
  const t = proxEd(3 * H + 60e3 + H + 60e3) + 10 * 24 * H + 60e3;   // dez dias depois: quarenta edições
  srv = await novo(t);
  await B('GET', '/api/state');   // o primeiro pedido faz as edições em falta
  const ev = (await B('GET', '/api/events')).body.list.filter((e) => e.k === 'raid');
  assert.ok(ev.length >= 1, 'houve rusga');
  const e = ler('Guardador');
  assert.ok(e.wh.al.s[COCA] < 220000 && e.wh.al.s[COCA] >= Math.floor(220000 * 0.9) / 2 ** ev.length - 1, 'cada rusga levou metade do que estava à vista');
  assert.ok(ev.every((x) => x.r === 'al' && x.jail && x.fine > 0 && x.took[0][0] === COCA));
  assert.equal(caixa().rusga.s, ev.reduce((s, x) => s + x.fine, 0), 'as multas estão no caixa');
  assert.equal(e.wh.ag.h, 0, 'o armazém parado arrefeceu');
  assert.equal(e.rz.length, Math.min(ev.length, CFG.wh.log));
  const n = (await B('GET', '/api/news')).body.mundo;
  assert.ok(n.rg.al.crime > CFG.regions.crime.al.floor + 10, 'tanta droga guardada mantém a criminalidade do Alentejo alta');
});
