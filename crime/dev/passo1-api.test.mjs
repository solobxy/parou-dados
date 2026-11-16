// Passo 1 da base nova: passagem das rondas para a conta permanente, por API, com o servidor antigo e o novo.
// 1) o servidor das rondas (commit 3cec23d) cria contas, joga e grava uma gangue;
// 2) o servidor novo arranca na mesma pasta e faz a passagem: copia de segurança, todos a 50 €, ficam nome, avatar e gangue;
// 3) a época fecha ao fim de 28 dias e dá o prémio aos primeiros, uma vez só.
// Corre com: node --test dev/passo1-api.test.mjs   (dentro de crime/; precisa do git para tirar o servidor antigo)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CRIME = join(AQUI, '..');
const ANTIGO = '3cec23d5cae26fb2d5f76ebdcf7004c9e97430e0';   // a última versão das rondas (55)
const PORT = 4300 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const DAY = 864e5;
let dir, velho, srv;

// sexta-feira recente às 21:00 de Lisboa (UTC no inverno): a ronda antiga e a primeira época começam aí
function sextaRecente() {
  const d = new Date(Date.now() - 2 * 3600e3);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const SEXTA = sextaRecente();
const T0 = Date.UTC(...SEXTA.split('-').map((x, i) => (i === 1 ? +x - 1 : +x)), 21);
const OFF = T0 - Date.now();   // fixo: o relógio do servidor nunca anda para trás entre arranques
const desvio = (depois) => String(OFF + depois);

async function arrancar(servidor, env) {
  const p = spawn(process.execPath, ['--import', join(dirname(servidor), 'test', 'relogio.mjs'), servidor], {
    env: { ...process.env, PORT: String(PORT), DATA: dir, COOKIE_INSEGURO: '1', ATOS_3S: '1000', ATOS_MIN: '100000', ...env },
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
  const f = async (method, path, body) => {
    const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json() };
  };
  return f;
}
const novo = () => arrancar(join(CRIME, 'server.mjs'), { PRIMEIRA_EPOCA: SEXTA, TESTE_DESVIO_MS: desvio(5 * 3600e3) });

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'crime-p1-'));
  velho = mkdtempSync(join(tmpdir(), 'crime-velho-'));
  execSync(`git -C "${join(CRIME, "..")}" archive ${ANTIGO} crime | tar -x -C "${velho}"`);
});
after(async () => { await parar(srv); rmSync(dir, { recursive: true, force: true }); rmSync(velho, { recursive: true, force: true }); });

const A = cliente('10.1.0.1'), B = cliente('10.1.0.2'), C = cliente('10.1.0.3'), N = cliente('10.1.0.4');

test('rondas → conta permanente: cópia, 50 €, ficam nome, avatar, gangue e o título de veterano', async () => {
  // 1) servidor das rondas
  srv = await arrancar(join(velho, 'crime', 'server.mjs'), { PRIMEIRA_RONDA: SEXTA, TESTE_DESVIO_MS: desvio(3 * 3600e3) });
  for (const [cl, nome] of [[A, 'Velho_A'], [B, 'Velho_B'], [C, 'Velho_C']]) {
    assert.equal((await cl('POST', '/api/register', { name: nome, password: 'segredo123', email: nome.toLowerCase() + '@t.pt' })).status, 200);
    await cl('POST', '/api/act', { type: 'class', id: 'ladrao' });
  }
  await A('POST', '/api/act', { type: 'avatar', i: 7 });
  await B('POST', '/api/act', { type: 'avatar', i: 3 });
  for (let i = 0; i < 6; i++) await A('POST', '/api/act', { type: 'crime', k: 0 });
  const antes = (await A('GET', '/api/state')).body.me;
  assert.ok(antes.respect > 0 && antes.av === 7);
  await parar(srv);
  // gangue gravada à mão (criar uma a sério pede 25 000): chefe A, B subchefe, C membro, cofre cheio e um pedido de golpe aberto
  {
    const db = new DatabaseSync(join(dir, 'jogo.db'));
    const id = (n) => db.prepare('SELECT id FROM contas WHERE nome = ?').get(n).id;
    db.prepare("INSERT INTO gangues (ronda, id, nome, nome_lc, tag, lider, cofre, sede, armaria, aberta, criada) VALUES (0, 'g1', 'Os Velhos', 'os velhos', 'VLH', ?, 900000, 3, 2, 1, 1)").run(id('Velho_A'));
    for (const [n, cargo] of [['Velho_A', 0], ['Velho_B', 2], ['Velho_C', 0]]) db.prepare("INSERT INTO gangue_membros (ronda, conta, gangue, entrou, dado, cargo) VALUES (0, ?, 'g1', 1, 5000, ?)").run(id(n), cargo);
    db.prepare("INSERT INTO gangue_chat (ronda, gangue, conta, t, txt) VALUES (0, 'g1', ?, 1, 'boas, malta')").run(id('Velho_A'));
    db.prepare("INSERT INTO gangue_ops (ronda, gangue, dados) VALUES (0, 'g1', ?)").run(JSON.stringify({ kind: 'heist', k: 0, by: id('Velho_A'), parts: [id('Velho_A')], vai: 0 }));
    for (const n of ['Velho_A', 'Velho_B', 'Velho_C']) {
      const row = db.prepare('SELECT estado FROM jogadores WHERE conta = ? AND ronda = 0').get(id(n));
      const e = JSON.parse(row.estado); e.cash = 123456; e.gang = 'g1'; db.prepare('UPDATE jogadores SET estado = ? WHERE conta = ? AND ronda = 0').run(JSON.stringify(e), id(n));
    }
    db.close();
  }

  // 2) servidor novo na mesma pasta
  srv = await novo();
  const saude = (await (await fetch(BASE + '/api/saude')).json());
  assert.equal(saude.fase, 'play');
  assert.equal(saude.epoca.n, 0);
  await A('POST', '/api/login', { name: 'Velho_A', password: 'segredo123' });
  await B('POST', '/api/login', { name: 'Velho_B', password: 'segredo123' });
  await C('POST', '/api/login', { name: 'Velho_C', password: 'segredo123' });
  const st = (await A('GET', '/api/state')).body;
  assert.equal(st.round.phase, 'play');
  assert.equal(st.me.cash, 50, 'todos recomeçam com 50 €');
  assert.equal(st.me.bank, 0);
  assert.equal(st.me.respect, 0);
  assert.equal(st.me.level, 1);
  assert.equal(st.me.av, 7, 'fica o avatar');
  assert.equal(st.me.cls, '', 'a profissão escolhe-se outra vez');
  assert.ok(st.me.titles.some((x) => x.k === 'vet'), 'título de veterano das rondas');
  assert.equal(st.season.n, 0);
  assert.equal(st.me.ep.div, 0);
  assert.equal((await B('GET', '/api/state')).body.me.av, 3);

  // a gangue fica (nome, sigla, chefe, cargos, conversa), o cofre volta a zero e o pedido de golpe antigo não passa
  const g = (await B('GET', '/api/gang')).body;
  assert.equal(g.mine.name, 'Os Velhos'); assert.equal(g.mine.tag, 'VLH');
  assert.equal(g.mine.members, 3);
  assert.equal(g.mine.fund, 0, 'cofre a zero');
  assert.equal(g.mine.sede, 3, 'a sede fica (é o tamanho da gangue)');
  assert.equal(g.mine.roster.find((m) => m.name === 'Velho_A').role, 3, 'o chefe continua chefe');
  assert.equal(g.mine.roster.find((m) => m.name === 'Velho_B').role, 2, 'o subchefe continua subchefe');
  assert.ok(g.mine.roster.every((m) => m.given === 0 && m.stake === 0), 'o que cada um deu ao cofre volta a zero');
  assert.ok(g.mine.chat.some((m) => m.txt === 'boas, malta'), 'a conversa fica');
  assert.ok(!g.mine.op, 'o pedido de golpe da ronda não passa');

  // nada se apagou: as rondas continuam na base de dados, e há uma cópia de antes da passagem
  {
    const db = new DatabaseSync(join(dir, 'jogo.db'));
    assert.equal(db.prepare('SELECT COUNT(*) n FROM jogadores WHERE ronda = 0').get().n, 3);
    db.close();
    const gd = join(dir, 'guardadas'); assert.ok(existsSync(gd), 'pasta das cópias guardadas');
    const fs = readdirSync(gd).filter((f) => f.endsWith('.db')); assert.equal(fs.length, 1);
    const c = new DatabaseSync(join(gd, fs[0]));
    assert.equal(c.prepare('SELECT COUNT(*) n FROM jogadores WHERE ronda = 0').get().n, 3);
    assert.equal(c.prepare("SELECT cofre FROM gangues WHERE id = 'g1'").get().cofre, 900000, 'a cópia é a de antes');
    c.close();
  }

  // quem chega agora começa igual, sem o título
  assert.equal((await N('POST', '/api/register', { name: 'Novato_N', password: 'segredo123', email: 'n@t.pt' })).status, 200);
  const n = (await N('GET', '/api/state')).body.me;
  assert.equal(n.cash, 50); assert.deepEqual(n.titles, []); assert.equal(n.ep.n, 0);
});

test('reiniciar não volta a fazer a passagem: o progresso fica', async () => {
  await A('POST', '/api/act', { type: 'class', id: 'ladrao' });
  for (let i = 0; i < 8; i++) await A('POST', '/api/act', { type: 'crime', k: 0 });
  const antes = (await A('GET', '/api/state')).body.me;
  assert.ok(antes.respect > 0);
  await parar(srv); srv = await novo();
  const depois = (await A('GET', '/api/state')).body.me;
  assert.equal(depois.cash, antes.cash); assert.equal(depois.respect, antes.respect);
  assert.equal(depois.titles.filter((x) => x.k === 'vet').length, 1);
  assert.equal(readdirSync(join(dir, 'guardadas')).filter((f) => f.endsWith('.db')).length, 1, 'não faz outra cópia');
});

test('ranking: época por divisão e geral', async () => {
  const r = (await A('GET', '/api/ranking')).body;
  assert.equal(r.view, 'epoca'); assert.equal(r.d, 0); assert.equal(r.season.n, 0);
  assert.equal(r.top[0].name, 'Velho_A'); assert.ok(r.top[0].score > 0); assert.ok(r.top[0].vet);
  assert.equal(r.me.pos, 1);
  assert.equal(r.prizes.length, 3);
  const g = (await A('GET', '/api/ranking?v=geral')).body;
  assert.equal(g.view, 'geral'); assert.equal(g.top[0].name, 'Velho_A');
  const d4 = (await A('GET', '/api/ranking?d=4')).body;
  assert.equal(d4.d, 4); assert.deepEqual(d4.top, []);
  assert.equal((await A('GET', '/api/state')).body.rank, 1, 'a posição no topo é a da época, na tua divisão');
});

test('fim da época: os primeiros de cada divisão levam título, troféu e dinheiro, uma vez só', async () => {
  const antes = (await A('GET', '/api/state')).body.me;
  await parar(srv);
  // 28 dias depois
  srv = await arrancar(join(CRIME, 'server.mjs'), { PRIMEIRA_EPOCA: SEXTA, TESTE_DESVIO_MS: desvio(28 * DAY + 3600e3) });
  await A('POST', '/api/login', { name: 'Velho_A', password: 'segredo123' });
  const st = (await A('GET', '/api/state')).body;
  assert.equal(st.season.n, 1);
  const me = st.me;
  const t1 = me.titles.find((x) => x.k === 'ep');
  assert.deepEqual(t1, { k: 'ep', n: 0, d: 0, pos: 1 });
  assert.ok(me.cash > antes.cash, 'o primeiro leva dinheiro');
  assert.equal(me.ep.n, 1); assert.equal(me.ep.score, 0, 'a época nova começa do zero');
  const ev = (await A('GET', '/api/events')).body.list;
  assert.ok(ev.some((e) => e.k === 'season' && e.pos === 1 && e.money === me.cash - antes.cash));
  const r = (await A('GET', '/api/ranking')).body;
  assert.equal(r.season.n, 1);
  assert.ok(r.last && r.last.n === 0 && r.last.top[0].name === 'Velho_A', 'os vencedores da época anterior');
  // outra vez à mesma hora: não paga outra vez
  await parar(srv);
  srv = await arrancar(join(CRIME, 'server.mjs'), { PRIMEIRA_EPOCA: SEXTA, TESTE_DESVIO_MS: desvio(28 * DAY + 2 * 3600e3) });
  await A('POST', '/api/login', { name: 'Velho_A', password: 'segredo123' });
  const de = (await A('GET', '/api/state')).body.me;
  assert.equal(de.cash, me.cash); assert.equal(de.titles.filter((x) => x.k === 'ep').length, 1);
  const db = new DatabaseSync(join(dir, 'jogo.db'));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM epocas WHERE n = 0').get().n, 1, 'um vencedor gravado na época 0 (só A ganhou respeito)');
  db.close();
});
