// Passo 6 (mundo ligado), países (16/11/2026), por API:
// 1) quem jogava na versão 62 (com o Alentejo e o Algarve) fica a viver em Portugal, com o stock de lá em casa e o preço dos
//    armazéns devolvido; o mundo passa a ter os oito países;
// 2) um jogador novo escolhe a Colômbia: compra coca em casa, abre armazém nos Estados Unidos, manda-a para lá (6 h, com risco) e
//    vende-a; o caixa e as contas de cada país registam tudo; emigrar custa, leva horas e não deixa ir à rua pelo caminho;
// 3) nas edições: rusgas a quem guarda muito à vista com a polícia a apertar (também fora do jogo), com aviso, multa no caixa e
//    prisão; e o calor de um armazém parado desce sozinho.
// Corre com: node --test dev/passo6c-paises-api.test.mjs   (dentro de crime/; precisa do git para tirar o servidor da versão 62)
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
const V62 = 'a289e74';   // passo 6, parte 2 (versão 62): as regiões de Portugal
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
    env: { ...process.env, PORT: String(PORT), DATA: dir, COOKIE_INSEGURO: '1', ATOS_3S: '1000', ATOS_MIN: '100000', PRIMEIRA_EPOCA: SEXTA, TESTE_SEMENTE: '62', ...env },
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
  dir = mkdtempSync(join(tmpdir(), 'crime-p6c-'));
  velho = mkdtempSync(join(tmpdir(), 'crime-v62-'));
  execSync(`git -C "${join(CRIME, '..')}" archive ${V62} crime | tar -x -C "${velho}"`);
});
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); rmSync(velho, { recursive: true, force: true }); });

const A = cliente('10.6.2.1'), B = cliente('10.6.2.2'), C = cliente('10.6.2.3');
const COCA = CFG.drugs.findIndex((g) => g.id === 'coca'), HAX = CFG.drugs.findIndex((g) => g.id === 'haxixe');

test('versão 62 → países: quem jogava fica em Portugal, o Alentejo e o Algarve vão para casa, o preço volta, e o mundo tem os oito países', async () => {
  srv = await arrancar(join(velho, 'crime', 'server.mjs'), { TESTE_DESVIO_MS: desvio(3 * H) });
  assert.equal((await A('POST', '/api/register', { name: 'Traficante', password: 'segredo123', email: 'trafico@t.pt' })).status, 200);
  await A('POST', '/api/act', { type: 'class', id: 'ladrao' });
  assert.equal((await B('POST', '/api/register', { name: 'Guardador', password: 'segredo123', email: 'guarda@t.pt' })).status, 200);
  await B('POST', '/api/act', { type: 'class', id: 'ladrao' });
  await A('GET', '/api/stocks');   // a bolsa da versão 62 fica gravada com as regiões
  await parar(srv);
  mexer('Traficante', (e) => {
    e.cash = 0; e.bank = 0; e.respect = e.peakRespect = CFG.levels[29]; e.stock[HAX] = 1234;
    e.wh.al = { sp: 1, hd: 1, fr: 1, h: 0, f: 0, s: CFG.drugs.map((_, d) => (d === COCA ? 500 : 0)) };
  });
  mexerMundo((b) => { b.w.rg.al.crime = 77; });
  srv = await novo(3 * H + 60e3);
  const me = (await A('GET', '/api/state')).body.me;
  assert.equal(me.home, 'lx'); assert.equal(me.homeSet, true);
  assert.equal(me.stock[HAX], 1234, 'o stock fica'); assert.equal(me.stock[COCA], 500, 'e o do Alentejo vem para casa');
  assert.equal(me.cash, 30000, 'o preço do armazém do Alentejo volta');
  assert.equal(me.wh.lx.sp, 1); assert.equal(me.wh.lx.cap, CFG.wh.home.sp[0]); assert.equal(me.wh.co, null); assert.ok(!('al' in me.wh));
  assert.deepEqual(Object.keys(me.mk), ['lx', 'nl', 'de', 'ma', 'us', 'co', 'jp', 'cn']);
  assert.equal(me.mk.co.dem[COCA], CFG.market.dem.co.coca);
  const cfg = await (await fetch(BASE + '/api/config')).json();
  assert.ok(cfg.countries && cfg.emigrate && cfg.regions.hours && cfg.market && cfg.wh.home && cfg.mv);
  const n = (await A('GET', '/api/news')).body.mundo;
  assert.equal(n.rg.co.crime, CFG.regions.crime.co.start); assert.ok(!('al' in n.rg));
  assert.equal(lerMundo().w.v, MW.WORLD_V, 'o mundo gravado já tem os países');
});

test('jogador novo na Colômbia: coca de casa para os Estados Unidos e venda lá; emigrar custa, leva horas e não deixa ir à rua', async () => {
  assert.equal((await C('POST', '/api/register', { name: 'Paisa', password: 'segredo123', email: 'paisa@t.pt' })).status, 200);
  await C('POST', '/api/act', { type: 'class', id: 'ladrao' });
  let r = await C('GET', '/api/state'); assert.equal(r.body.me.homeSet, false, 'ainda por escolher');
  r = await C('POST', '/api/act', { type: 'home', r: 'co' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.home, 'co'); assert.ok(r.body.me.wh.co && r.body.me.wh.co.home); assert.equal(r.body.me.wh.lx, null);
  r = await C('POST', '/api/act', { type: 'home', r: 'jp' }); assert.equal(r.body.error, 'HOME_SET');
  await parar(srv);
  mexer('Paisa', (e) => { e.cash = 600_000; e.bank = 0; e.respect = e.peakRespect = CFG.levels[29]; e.shieldUntil = 0; });
  srv = await novo(3 * H + 2 * 60e3);
  r = await C('POST', '/api/act', { type: 'whBuy', r: 'us' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.cost, Math.round(CFG.wh.abroad.price * CFG.countries.us.wh / 10000));
  let me = r.body.me; const n = 300, c = preco(me, 'co', COCA, n, 1);
  assert.ok(me.mk.co.dem[COCA] < me.mk.us.dem[COCA] / 3, 'na Colômbia a coca vale menos de um terço do que vale nos EUA');
  r = await C('POST', '/api/act', { type: 'mktBuy', r: 'co', d: COCA, n, c }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.cost, Math.ceil(c / 100)); me = r.body.me; assert.equal(me.stock[COCA], n, 'em casa, o stock é o de sempre');
  r = await C('POST', '/api/act', { type: 'mvSend', a: 'co', b: 'us', d: COCA, n }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const ida = r.body.result;
  assert.equal(ida.risk, Math.min(9500, Math.floor(Math.round(((me.mk.co.press + me.mk.us.press) * 10) / 2) * 1 * CFG.countries.us.police / 10000)), '6 h: um controlo, com a polícia americana');
  assert.equal(ida.at - r.body.now, 6 * H);
  await parar(srv);
  const acc = lerMundo().w.acc;
  assert.equal(acc.rg.co, Math.round(ida.v / CFG.regions.ptsEur) * 2, 'compra e saída contam para a Colômbia');
  assert.equal(acc.rg.us, Math.round(ida.v / CFG.regions.ptsEur), 'a chegada conta para os EUA');
  srv = await novo(3 * H + 2 * 60e3 + 6 * H + 30e3);
  me = (await C('GET', '/api/state')).body.me;
  assert.equal(me.mv.length, 0); assert.equal(me.mvLog.length, 1);
  if (me.mvLog[0].x !== 2) {
    assert.equal(me.wh.us.s[COCA], n);
    const v = preco(me, 'us', COCA, n, -1);
    r = await C('POST', '/api/act', { type: 'mktSell', r: 'us', d: COCA, n, c: v }); assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.result.got, Math.floor(v / 100)); assert.ok(r.body.result.got > Math.ceil(c / 100) * 2, 'mais do dobro');
  } else { assert.equal(me.wh.us.s[COCA], 0); assert.ok(me.mvLog[0].jail); await parar(srv); mexer('Paisa', (e) => { e.jailUntil = 0; }); srv = await novo(3 * H + 2 * 60e3 + 6 * H + 60e3); }
  // emigrar para a Alemanha: 5 000 € ou 3%, 5% do respeito, as horas da viagem sem rua
  me = (await C('GET', '/api/state')).body.me;
  const custo = me.emCost, resp0 = me.respect;
  assert.equal(custo, Math.max(CFG.emigrate.min, Math.floor((me.cash + me.bank) * CFG.emigrate.bp / 10000)));
  r = await C('POST', '/api/act', { type: 'emigrate', r: 'de' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.home, 'de'); assert.equal(r.body.me.respect, resp0 - Math.floor(resp0 * CFG.emigrate.respBp / 10000));
  assert.equal(r.body.me.travelUntil - r.body.now, 13 * H, 'da Colômbia à Alemanha: 13 h');
  r = await C('POST', '/api/act', { type: 'crime', k: 0 }); assert.equal(r.body.error, 'TRAVELING');
  r = await C('POST', '/api/act', { type: 'emigrate', r: 'lx' }); assert.ok(['TRAVELING', 'EM_WAIT'].includes(r.body.error));
  const cx = caixa();
  assert.ok(cx.whBuy.s === Math.round(CFG.wh.abroad.price * CFG.countries.us.wh / 10000) && cx.mktBuy.s === Math.ceil(c / 100) && cx.emigrate.s === custo);
});

test('edições: rusgas a quem guarda muito à vista, também fora do jogo, com aviso, multa e prisão; o calor parado desce', async () => {
  await parar(srv);
  // 6 000 000 € de coca à vista na Colômbia (a pressão sobe sozinha com tanta droga guardada) e um armazém parado e quente em Marrocos
  mexer('Guardador', (e) => {
    e.respect = e.peakRespect = CFG.levels[29]; e.cash = 2_000_000;
    const s = CFG.drugs.map(() => 0); s[COCA] = 220000;
    e.wh = { lx: { sp: 1, hd: 1, fr: 1, h: 0, f: 0 }, nl: null, de: null, ma: { sp: 1, hd: 1, fr: 1, h: 5000, f: 0, s: CFG.drugs.map(() => 0) }, us: null, co: { sp: 5, hd: 1, fr: 1, h: 10000, f: 0, s }, jp: null, cn: null };
  });
  mexerMundo((b) => { b.w.rg.co.crime = 95; });
  const t = proxEd(3 * H + 2 * 60e3 + 6 * H + 60e3) + 10 * 24 * H + 60e3;   // dez dias depois: quarenta edições
  srv = await novo(t);
  await B('GET', '/api/state');   // o primeiro pedido faz as edições em falta
  const ev = (await B('GET', '/api/events')).body.list.filter((e) => e.k === 'raid');
  assert.ok(ev.length >= 1, 'houve rusga');
  const e = ler('Guardador');
  assert.ok(e.wh.co.s[COCA] < 220000 && e.wh.co.s[COCA] >= Math.floor(220000 * 0.9) / 2 ** ev.length - 1, 'cada rusga levou metade do que estava à vista');
  assert.ok(ev.every((x) => x.r === 'co' && x.jail && x.fine > 0 && x.took[0][0] === COCA));
  assert.equal(caixa().rusga.s, ev.reduce((s, x) => s + x.fine, 0), 'as multas estão no caixa');
  assert.equal(e.wh.ma.h, 0, 'o armazém parado arrefeceu');
  assert.equal(e.rz.length, Math.min(ev.length, CFG.wh.log));
  const n = (await B('GET', '/api/news')).body.mundo;
  assert.ok(n.rg.co.crime > CFG.regions.crime.co.floor + 10, 'tanta droga guardada mantém a criminalidade da Colômbia alta');
});
