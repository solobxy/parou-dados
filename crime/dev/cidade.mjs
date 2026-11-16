// Cidade de teste local para ver os ecrãs do passo 1 (épocas, ranking, títulos) num browser simulado.
// Uso: node dev/cidade.mjs <pasta> [porto]   (dentro de crime/). Deixa o servidor a correr e escreve <pasta>/contas.json com os cookies.
// 1) servidor das rondas (3cec23d): contas que vão ser veteranas; 2) servidor novo: passagem; 3) estados à mão: respeito, épocas, gangue, pódio antigo.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const AQUI = dirname(fileURLToPath(import.meta.url)), CRIME = join(AQUI, '..'), RAIZ = join(CRIME, '..');
const DIR = process.argv[2] || '/tmp/cidade-p1', PORT = +(process.argv[3] || 3555), BASE = `http://127.0.0.1:${PORT}`;
const ANTIGO = '3cec23d5cae26fb2d5f76ebdcf7004c9e97430e0';
const EPOCA = process.env.EPOCA || '2026-10-16';   // por omissão a época aberta é a 2 (para se ver o pódio da 1)
if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const velho = join(DIR, 'velho'); mkdirSync(velho);
execSync(`git -C "${RAIZ}" archive ${ANTIGO} crime | tar -x -C "${velho}"`);
const DATA = join(DIR, 'dados');

async function arrancar(srv, env) {
  const p = spawn(process.execPath, [srv], { env: { ...process.env, PORT: String(PORT), DATA, STATIC: join(RAIZ, 'sites/crime'), COOKIE_INSEGURO: '1', ATOS_3S: '100000', ATOS_MIN: '1000000', ...env }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + '/api/saude')).ok) return p; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('não arrancou');
}
const parar = async (p) => { p.kill(); await new Promise((r) => p.once('exit', r)); };
const cookies = {};
async function conta(nome, ip) {
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@t.pt', lang: 'pt' }) });
  if (!r.ok) throw new Error(nome + ' ' + r.status);
  cookies[nome] = r.headers.get('set-cookie').split(';')[0];
  await act(nome, { type: 'class', id: 'ladrao' });
}
const act = async (nome, b) => (await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookies[nome] }, body: JSON.stringify(b) })).json();

// 1) as rondas
let s = await arrancar(join(velho, 'crime/server.mjs'), {});
const VETS = ['Dinis_T', 'Rato_do_Porto', 'Lagarto', 'TiaGorda', 'Zeca_Navalha'];
let ip = 1;
for (const n of VETS) { await conta(n, '10.9.0.' + ip++); await act(n, { type: 'avatar', i: (ip * 7) % 60 }); }
await parar(s);

// 2) a base nova
s = await arrancar(join(CRIME, 'server.mjs'), { PRIMEIRA_EPOCA: EPOCA });
for (const n of ['Novato', 'Mafioso_99', 'Cobra', 'Sardinha', 'Bigodes']) await conta(n, '10.9.0.' + ip++);
for (const n of VETS) await act(n, { type: 'class', id: 'ladrao' });
await parar(s);

// 3) estados à mão: respeito ganho na época, divisões e um pódio da época anterior
const db = new DatabaseSync(join(DATA, 'jogo.db'));
const idDe = (n) => db.prepare('SELECT id FROM contas WHERE nome = ?').get(n).id;
const ep = +db.prepare("SELECT v FROM meta WHERE k = 'epoca'").get().v;
const L = (n) => Math.round(1.3 * n ** 2.55);
const quadro = { Dinis_T: [L(14) + 120, 380], Rato_do_Porto: [L(19) + 40, 1210], Lagarto: [L(13), 470], TiaGorda: [L(24) + 10, 1210], Zeca_Navalha: [L(6), 95],
  Novato: [0, 0], Mafioso_99: [L(17), 1650], Cobra: [L(42) + 33, 7020], Sardinha: [L(3), 30], Bigodes: [L(12) + 3, 610] };
for (const [n, [resp, ganho]] of Object.entries(quadro)) {
  const id = idDe(n), row = db.prepare('SELECT estado FROM jogadores WHERE conta = ? AND ronda = 1000').get(id), e = JSON.parse(row.estado);
  e.respect = e.peakRespect = resp; e.cash = 4000 + resp * 3; e.av = e.av || (n.length * 5) % 60;
  const lvl = (() => { let k = 1; while (k < 100 && L(k + 1) <= resp - ganho) k++; return k; })();
  e.ep = { n: ep, div: Math.min(4, Math.floor((lvl - 1) / 20)), r0: resp - ganho };
  if (n === 'Rato_do_Porto') e.titles.push({ k: 'ep', n: ep - 1, d: 0, pos: 1 });
  if (n === 'Dinis_T') e.titles.push({ k: 'ep', n: ep - 1, d: 0, pos: 2 });
  db.prepare('UPDATE jogadores SET estado = ? WHERE conta = ? AND ronda = 1000').run(JSON.stringify(e), id);
}
if (ep > 0) {
  const ins = db.prepare('INSERT OR REPLACE INTO epocas (n, div, pos, conta, pontos, premio, t) VALUES (?, ?, ?, ?, ?, ?, ?)');
  ins.run(ep - 1, 0, 1, idDe('Rato_do_Porto'), 1150, 21480, Date.now()); ins.run(ep - 1, 0, 2, idDe('Dinis_T'), 790, 14320, Date.now()); ins.run(ep - 1, 0, 3, idDe('Lagarto'), 600, 7160, Date.now());
}
// alguns golpes no registo do dia, para haver prémio estimado
const dia = new Date().toISOString().slice(0, 10);
for (const [n, m] of [['Dinis_T', 6200], ['Rato_do_Porto', 8100], ['Lagarto', 3900], ['TiaGorda', 5100], ['Mafioso_99', 7300], ['Bigodes', 2500]]) {
  db.prepare('INSERT OR REPLACE INTO diario (ronda, dia, conta, money) VALUES (1000, ?, ?, ?)').run(dia, idDe(n), m);
}
db.close();
s = await arrancar(join(CRIME, 'server.mjs'), { PRIMEIRA_EPOCA: EPOCA });
writeFileSync(join(DIR, 'contas.json'), JSON.stringify({ base: BASE, cookies, pid: s.pid }, null, 1));
console.log('cidade pronta em', BASE, 'pid', s.pid);
s.unref(); process.exit(0);
