// v109 pela API: o chat público da cidade (nível mínimo, ligações escondidas, travões, after) e o perfil público com a vitrine.
// Corre com: node --test dev/social109-api.test.mjs   (dentro de crime/)
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
const PORT = 5300 + Math.floor(Math.random() * 90);
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

before(() => { dir = mkdtempSync(join(tmpdir(), 'crime-social-')); });
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); });

const S = CFG.social, NIVEL5 = { respect: 200, peakRespect: 200 };
const A = cliente('10.9.2.1'), B = cliente('10.9.2.2');
const act = (c, x) => c('POST', '/api/act', x);
const fala = (c, txt) => c('POST', '/api/chat', { txt });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let t = 1000, lvlAna = 0;

test('preparar: a Ana (nível 5, com honras) e o Bruno (nível 1)', async () => {
  srv = await novo(0);
  for (const [c, nome] of [[A, 'Ana'], [B, 'Bruno']]) {
    const r = await c('POST', '/api/register', { name: nome, password: 'segredo123', email: nome.toLowerCase() + '@t.pt' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await act(c, { type: 'class', id: CFG.classes[0].id });
  }
  await parar(srv);
  mexer('Ana', (e) => { Object.assign(e, NIVEL5); e.cash = 5000; e.hon = { crimes_10: 1, crimes_50: 2, crimes_100: 3 }; });
  srv = await novo(t);
  const c = (await A('GET', '/api/config')).body;
  assert.deepEqual(c.social, S);
});

test('quem está abaixo do nível mínimo lê mas não fala', async () => {
  const r = await fala(B, 'olá');
  assert.equal(r.body.error, 'LOW_LEVEL'); assert.equal(r.body.need, S.minLevel);
  assert.equal((await B('GET', '/api/chat')).status, 200);
});

test('falar: a mensagem aparece a toda a gente, sem ligações, e o estado traz o número da última', async () => {
  const r = await fala(A, '  Vendo   carro, vejam https://batota.example/x e www.site.pt  ');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const v = (await B('GET', '/api/chat')).body;
  assert.equal(v.msgs.length, 1);
  const m = v.msgs[0];
  assert.equal(m.name, 'Ana'); assert.equal(m.me, false); assert.ok(m.lvl >= S.minLevel); lvlAna = m.lvl;
  assert.equal(m.txt, 'Vendo carro, vejam [link] e [link]');
  assert.ok(!('conta' in m) && !('id' in m && typeof m.id !== 'number'));
  assert.equal((await A('GET', '/api/chat')).body.msgs[0].me, true);
  assert.equal((await B('GET', '/api/state')).body.chatLast, m.id);
});

test('travões: a mesma frase seguida, menos de 2 s entre mensagens, mais de 5 em 30 s, vazia ou comprida demais', async () => {
  await espera(S.gapMs + 100);
  assert.equal((await fala(A, 'Vendo carro, vejam [link] e [link]')).body.error, 'SAME_MSG');
  assert.equal((await fala(A, '   ')).body.error, 'BAD_ACTION');
  const longa = await fala(A, 'x'.repeat(S.max + 50));
  assert.equal(longa.status, 200);
  const ult = (await A('GET', '/api/chat')).body.msgs.at(-1);
  assert.equal(ult.txt.length, S.max);
  assert.equal((await fala(A, 'logo a seguir')).body.error, 'SLOW_DOWN');
  let ok = 2;   // já foram 2 nesta janela de 30 s
  while (ok < S.rateN) { await espera(S.gapMs + 100); const r = await fala(A, 'mensagem ' + ok); assert.equal(r.status, 200, JSON.stringify(r.body)); ok++; }
  await espera(S.gapMs + 100);
  assert.equal((await fala(A, 'uma a mais')).body.error, 'SLOW_DOWN');
});

test('after: só vêm as mais novas', async () => {
  const todas = (await B('GET', '/api/chat')).body.msgs;
  const meio = todas[1].id;
  const novas = (await B('GET', '/api/chat?after=' + meio)).body.msgs;
  assert.deepEqual(novas.map((m) => m.id), todas.filter((m) => m.id > meio).map((m) => m.id));
});

test('perfil público: o que é público, sem dinheiro, e 404 para quem não existe', async () => {
  const r = await B('GET', '/api/profile?n=ana');
  assert.equal(r.status, 200);
  const P = r.body;
  assert.equal(P.name, 'Ana'); assert.equal(P.level, lvlAna); assert.equal(P.active, true); assert.equal(P.honN, 3);
  assert.deepEqual(P.vit, []); assert.equal(P.st.k, 'free'); assert.equal(P.online, true);
  const txt = JSON.stringify(P);
  for (const k of ['"cash"', '"bank"', '"inv"', '"mt"', '"biz"', '"stats"']) assert.ok(!txt.includes(k), 'não sai ' + k);
  assert.ok(P.can && typeof P.can.chance === 'number' && 'why' in P.can, 'o que o Bruno pode fazer');
  assert.equal((await A('GET', '/api/profile?n=Ana')).body.me, true);
  assert.equal((await A('GET', '/api/profile?n=Ana')).body.can, undefined);
  assert.equal((await B('GET', '/api/profile?n=NinguemAqui')).status, 404);
  assert.equal((await B('GET', '/api/profile?n=' + encodeURIComponent("x' OR 1=1"))).status, 404);
});

test('vitrine: só honras ganhas, até ' + S.vitMax + ', pela ordem escolhida; vazia tira tudo', async () => {
  assert.equal((await act(A, { type: 'honorShow', ids: ['crimes_250'] })).body.error, 'NO_HONOR');
  assert.equal((await act(A, { type: 'honorShow', ids: Array(S.vitMax + 1).fill('crimes_10') })).body.error, 'BAD_ACTION');
  const r = await act(A, { type: 'honorShow', ids: ['crimes_100', 'crimes_10', 'crimes_10'] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.me.honVit, ['crimes_100', 'crimes_10']);
  assert.deepEqual((await B('GET', '/api/profile?n=Ana')).body.vit, ['crimes_100', 'crimes_10']);
  await act(A, { type: 'honorShow', ids: [] });
  assert.deepEqual((await B('GET', '/api/profile?n=Ana')).body.vit, []);
});

test('as mensagens ficam guardadas: depois de reiniciar o servidor continuam lá', async () => {
  const antes = (await B('GET', '/api/chat')).body;
  await parar(srv); srv = await novo(t + 5000);
  const depois = (await B('GET', '/api/chat')).body;
  assert.deepEqual(depois.msgs.map((m) => m.id), antes.msgs.map((m) => m.id));
  assert.equal(depois.last, antes.last);
});
