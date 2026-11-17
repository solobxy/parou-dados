// Passo 3 da base nova (empregos, cursos e skills), por API:
// 1) quem jogou na versão 57 fica com as vitórias passadas a skill e sem emprego;
// 2) escolher emprego, fazer turnos (com a informação do sítio), começar um curso e vê-lo acabar; o caixa regista o ordenado e a propina.
// Corre com: node --test dev/passo3-api.test.mjs   (dentro de crime/; precisa do git para tirar o servidor da versão 57)
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
const V57 = 'a9876c6';   // passo 2 (versão 57): economia nova, ainda com estrelas de mestria
const PORT = 4500 + Math.floor(Math.random() * 90);
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
  dir = mkdtempSync(join(tmpdir(), 'crime-p3-'));
  velho = mkdtempSync(join(tmpdir(), 'crime-v57-'));
  execSync(`git -C "${join(CRIME, '..')}" archive ${V57} crime | tar -x -C "${velho}"`);
});
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); rmSync(velho, { recursive: true, force: true }); });

const A = cliente('10.3.0.1'), B = cliente('10.3.0.2');
const j = (id) => CFG.jobs.list.findIndex((x) => x.id === id);

test('versão 57 → passo 3: as vitórias de cada golpe passam a skill da família; ninguém começa com emprego', async () => {
  srv = await arrancar(join(velho, 'crime', 'server.mjs'), { TESTE_DESVIO_MS: desvio(3 * 3600e3) });
  assert.equal((await A('POST', '/api/register', { name: 'Trabalhador', password: 'segredo123', email: 'trab@t.pt' })).status, 200);
  await A('POST', '/api/act', { type: 'class', id: 'ladrao' });
  assert.equal((await B('POST', '/api/register', { name: 'Rico', password: 'segredo123', email: 'rico@t.pt' })).status, 200);
  await B('POST', '/api/act', { type: 'class', id: 'ladrao' });
  await parar(srv);
  mexer('Trabalhador', (e) => { e.wk[0] = 12; e.c.wins = 12; e.cash = 5000; e.bank = 0; });
  mexer('Rico', (e) => { e.cash = 77_777; e.shieldUntil = 0; });
  srv = await novo(3 * 3600e3 + 60e3);
  const me = (await A('GET', '/api/state')).body.me;
  assert.equal(me.sk.furto, 12 * CFG.crimes[0].e); assert.equal(me.job, -1); assert.deepEqual(me.done, []); assert.equal(me.course, null);
  assert.equal(me.stars, undefined, 'as estrelas saíram da resposta');
  const cfg = await (await fetch(BASE + '/api/config')).json();
  assert.equal(cfg.jobs.list.length, 6); assert.equal(cfg.courses.length, 4); assert.equal(cfg.skills.fams.length, 6);
});

test('emprego por API: turnos com informação do sítio, curso pago à cabeça, e o caixa regista ordenado e propina', async () => {
  let r = await A('POST', '/api/act', { type: 'shift' }); assert.equal(r.body.error, 'NO_JOB');
  r = await A('POST', '/api/act', { type: 'job', i: j('vigilante') }); assert.equal(r.body.error, 'NEED_COURSE');
  r = await A('POST', '/api/act', { type: 'job', i: j('estafeta') }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.me.job, j('estafeta'));
  const banco0 = r.body.me.bank;
  r = await A('POST', '/api/act', { type: 'shift' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.money, Math.floor(1400 / 6)); assert.equal(r.body.me.bank, banco0 + Math.floor(1400 / 6)); assert.equal(r.body.me.shifts, 1);
  assert.equal(r.body.me.vigor, CFG.vigor.max - CFG.jobs.shiftE);
  // o estafeta vê quem tem dinheiro na mão: o Rico, com 77 777 €
  assert.equal(r.body.result.tip.k, 'cash'); assert.equal(r.body.result.tip.a, 'Rico'); assert.equal(r.body.result.tip.m, 77_777);
  assert.equal(r.body.me.jt[0].a, 'Rico');
  // curso de vigilante: 570 € à cabeça, 2 dias
  r = await A('POST', '/api/act', { type: 'course', id: 'vigilante' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.course.id, 'vigilante');
  r = await A('POST', '/api/act', { type: 'course', id: 'pesados' }); assert.equal(r.body.error, 'COURSE_BUSY');
  const cx = caixa();
  assert.equal(cx.shift.e, Math.floor(1400 / 6)); assert.equal(cx.course.s, 570);
  // dois dias depois o curso acabou e o emprego de vigilante abre; o vigilante sabe quem não tem guardas
  await parar(srv); srv = await novo(3 * 3600e3 + 2 * 86400e3 + 120e3);
  // v80: o tempo acabou, mas o diploma só vem com o exame (três perguntas certas)
  let me = (await A('GET', '/api/state')).body.me;
  assert.equal(me.course.id, 'vigilante'); assert.deepEqual(me.done, []);
  r = await A('POST', '/api/act', { type: 'examStart' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await A('POST', '/api/act', { type: 'examAnswer', ans: r.body.result.ids.map((i, k) => r.body.result.p[k].indexOf(CFG.exam.ans.vigilante[i])) }); assert.equal(r.body.result.done, true, JSON.stringify(r.body));
  me = r.body.me;
  assert.equal(me.course, null); assert.deepEqual(me.done, ['vigilante']);
  r = await A('POST', '/api/act', { type: 'job', i: j('vigilante') }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await A('POST', '/api/act', { type: 'shift' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.money, 300); assert.equal(r.body.result.tip.k, 'guard'); assert.equal(r.body.result.tip.a, 'Rico');
});
