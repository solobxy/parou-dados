// Cidade de teste local para ver os ecrãs do passo 2 (economia nova) num browser simulado.
// Uso: node dev/cidade2.mjs <pasta> [porto]   (dentro de crime/). Deixa o servidor a correr e escreve <pasta>/contas.json com os cookies.
// Contas: Novato (nível 1, barraca, 50 €), Assaltante (nível 30, pistola, rua quente, haxixe e coca, já comprou barras hoje),
// Rico (nível 60, mansão, luxos, negócios).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const AQUI = dirname(fileURLToPath(import.meta.url)), CRIME = join(AQUI, '..'), RAIZ = join(CRIME, '..');
const DIR = process.argv[2] || '/tmp/cidade-p2', PORT = +(process.argv[3] || 3556), BASE = `http://127.0.0.1:${PORT}`;
if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const DATA = join(DIR, 'dados');

async function arrancar() {
  const p = spawn(process.execPath, [join(CRIME, 'server.mjs')], { env: { ...process.env, PORT: String(PORT), DATA, STATIC: join(RAIZ, 'sites/crime'), COOKIE_INSEGURO: '1', ATOS_3S: '100000', ATOS_MIN: '1000000', PRIMEIRA_EPOCA: '2026-11-13' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + '/api/saude')).ok) return p; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('não arrancou');
}
const parar = async (p) => { p.kill(); await new Promise((r) => p.once('exit', r)); };
const cookies = {};
const act = async (nome, b) => (await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookies[nome] }, body: JSON.stringify(b) })).json();
async function conta(nome, ip) {
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@t.pt', lang: 'pt' }) });
  if (!r.ok) throw new Error(nome + ' ' + r.status);
  cookies[nome] = r.headers.get('set-cookie').split(';')[0];
  await act(nome, { type: 'class', id: 'ladrao' });
}

let s = await arrancar();
let ip = 1;
for (const n of ['Novato', 'Assaltante', 'Rico']) await conta(n, '10.8.0.' + ip++);
// o novato faz três carteiras de verdade, para o relatório ter um golpe
for (let i = 0; i < 3; i++) await act('Novato', { type: 'crime', k: 0 });
await parar(s);

const L = (n) => Math.round(1.3 * n ** 2.55);
const hoje = (() => { const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); return d; })();
const db = new DatabaseSync(join(DATA, 'jogo.db'));
const idDe = (n) => db.prepare('SELECT id FROM contas WHERE nome = ?').get(n).id;
const muda = (n, f) => { const id = idDe(n), row = db.prepare('SELECT estado FROM jogadores WHERE conta = ? AND ronda = 1000').get(id), e = JSON.parse(row.estado); f(e); db.prepare('UPDATE jogadores SET estado = ? WHERE conta = ? AND ronda = 1000').run(JSON.stringify(e), id); };
muda('Novato', (e) => { e.jailUntil = 0; e.hospUntil = 0; });
muda('Assaltante', (e) => {
  e.respect = e.peakRespect = L(30) + 400; e.cash = 18_400; e.bank = 6_250; e.weapon = 2; e.house = 1; e.av = 21;
  e.energy = 64; e.vigor = 45; e.rua = { d: hoje, e: 230 }; e.rf = { d: hoje, e: 140 }; e.dst = [1_400, 600]; e.dl = { d: hoje, n: 4 };
  e.ep = { n: 0, div: 1, r0: L(30) - 600 };
});
muda('Rico', (e) => {
  e.respect = e.peakRespect = L(60) + 1000; e.cash = 4_120_000; e.bank = 900_000; e.weapon = 4; e.house = 5; e.luxuries = 4; e.av = 40;
  e.biz[0].n = 2; e.biz[3].n = 1; e.energy = 130; e.vigor = 100;
  e.done = ['vigilante', 'pesados', 'licenciatura']; e.job = 3; e.course = null; e.sk = { furto: 9200, assalto: 15000, burla: 0, trafico: 4000, conducao: 0, armas: 26000 };
});
// passo 3: o Assaltante trabalha de vigilante, já fez 2 turnos hoje e está a tirar a carta de pesados; o Novato ainda não tem emprego
muda('Assaltante', (e) => { e.done = ['vigilante']; e.job = 2; e.sh = { d: hoje, n: 2 }; e.course = { id: 'pesados', end: Date.now() + 3 * 86400e3 };
  e.jt = [{ k: 'guard', t: Date.now() - 600e3, a: 'Rico', lvl: 60, m: 4_120_000 }, { k: 'guard', t: Date.now() - 4000e3, a: 'Novato', lvl: 1, m: 50 }];
  e.sk = { furto: 6400, assalto: 2300, burla: 0, trafico: 900, conducao: 0, armas: 0 }; });
db.close();
s = await arrancar();
writeFileSync(join(DIR, 'contas.json'), JSON.stringify({ base: BASE, cookies, pid: s.pid }, null, 1));
console.log('cidade pronta em', BASE, 'pid', s.pid);
s.unref(); process.exit(0);
