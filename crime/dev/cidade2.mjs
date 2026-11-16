// Cidade de teste local para ver os ecrãs do passo 2 (economia nova) num browser simulado.
// Uso: node dev/cidade2.mjs <pasta> [porto]   (dentro de crime/). Deixa o servidor a correr e escreve <pasta>/contas.json com os cookies.
// Contas: Novato (nível 1, barraca, 50 €), Assaltante (nível 30, pistola, rua quente, haxixe e coca, já comprou barras hoje),
// Rico (nível 60, mansão, luxos, negócios), Gasto (pistola gasta) e Seco (sem balas, barraca cheia).
// Passo 5: Planeador (ourivesaria pronta, falta material e balas) e Preso (dentro por um golpe grande, com um favor gasto).
// O Rico prepara o banco (pronto daqui a 30 h) e tem advogado em avença.
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
for (const n of ['Novato', 'Assaltante', 'Rico', 'Gasto', 'Seco', 'Planeador', 'Preso']) await conta(n, '10.8.0.' + ip++);
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
  e.respect = e.peakRespect = L(30) + 400; e.cash = 18_400; e.bank = 6_250; e.house = 1; e.av = 21;
  e.eq = { ...e.eq, branca: { id: 'navalha' }, mao: { id: 'pistola', u: 6 }, tronco: { id: 'colete' }, maos: { id: 'luvas' } };
  e.inv = [{ id: 'balas', n: 120 }, { id: 'telemovel', n: 3, v: 690 }, { id: 'relogio', n: 1, v: 380 }, { id: 'perfumes', n: 2, v: 410 }, { id: 'soqueira' }];
  e.energy = 64; e.vigor = 45; e.rua = { d: hoje, e: 230 }; e.rf = { d: hoje, e: 140 }; e.dst = [1_400, 600]; e.dl = { d: hoje, n: 4 };
  e.ep = { n: 0, div: 1, r0: L(30) - 600 };
});
muda('Rico', (e) => {
  e.respect = e.peakRespect = L(60) + 1000; e.cash = 4_120_000; e.bank = 900_000; e.house = 5;
  e.eq = { branca: { id: 'navalha' }, mao: { id: 'pistola', u: 20 }, principal: { id: 'metralhadora', u: 41 }, cabeca: { id: 'capacete' }, tronco: { id: 'kevlar' }, pernas: { id: 'calcas' }, pes: { id: 'botas' }, maos: { id: 'luvas' }, acess: { id: 'mochila' } };
  e.inv = [{ id: 'balas', n: 850 }, { id: 'joalharia', n: 2, v: 19_400 }, { id: 'cacadeira', u: 12 }, { id: 'balistico' }]; e.luxuries = 4; e.av = 40;
  e.biz[0].n = 2; e.biz[3].n = 1; e.energy = 130; e.vigor = 100;
  e.done = ['vigilante', 'pesados', 'licenciatura']; e.job = 3; e.course = null; e.sk = { furto: 9200, assalto: 15000, burla: 0, trafico: 4000, conducao: 0, armas: 26000 };
});
// passo 3: o Assaltante trabalha de vigilante, já fez 2 turnos hoje e está a tirar a carta de pesados; o Novato ainda não tem emprego
muda('Assaltante', (e) => { e.done = ['vigilante']; e.job = 2; e.sh = { d: hoje, n: 2 }; e.course = { id: 'pesados', end: Date.now() + 3 * 86400e3 };
  e.jt = [{ k: 'guard', t: Date.now() - 600e3, a: 'Rico', lvl: 60, m: 4_120_000 }, { k: 'guard', t: Date.now() - 4000e3, a: 'Novato', lvl: 1, m: 50 }];
  e.sk = { furto: 6400, assalto: 2300, burla: 0, trafico: 900, conducao: 0, armas: 0 }; });
// passo 4: o Gasto tem a pistola gasta (golpe com arma pede reparação); o Seco está sem balas e com a barraca cheia
muda('Gasto', (e) => { e.respect = e.peakRespect = L(30) + 50; e.cash = 2_400; e.energy = 130; e.jailUntil = 0;
  e.eq = { ...e.eq, mao: { id: 'pistola', u: 0 } }; e.inv = [{ id: 'balas', n: 60 }]; });
muda('Seco', (e) => { e.respect = e.peakRespect = L(30) + 50; e.cash = 900; e.energy = 130; e.jailUntil = 0;
  e.eq = { ...e.eq, mao: { id: 'pistola', u: 14 } };
  e.inv = [{ id: 'telemovel', n: 2, v: 410 }, { id: 'relogio', n: 1, v: 300 }, { id: 'perfumes', n: 1, v: 190 }, { id: 'fio', n: 1, v: 1_650 }, { id: 'miudezas', n: 4, v: 230 }, { id: 'soqueira' }]; });
// passo 5: golpes grandes, avença, lavagem e prisão
const T = Date.now();
muda('Rico', (e) => { e.op = { i: 4, t0: T - 66 * 3600e3, ready: T + 30 * 3600e3, recon: false, crew: true, bribe: false, contact: false, paid: 30_000 + 3_900 }; e.avenca = true; e.avD = hoje; e.avN = 3; e.ilegal = 2_400_000; });
muda('Planeador', (e) => { e.respect = e.peakRespect = L(40) + 200; e.cash = 61_000; e.bank = 9_000; e.house = 2; e.energy = 90; e.vigor = 70;
  e.eq = { ...e.eq, mao: { id: 'pistola', u: 8 }, maos: { id: 'luvas' } }; e.inv = [{ id: 'balas', n: 12 }, { id: 'gazuas' }];
  e.op = { i: 2, t0: T - 50 * 3600e3, ready: T - 2 * 3600e3, recon: true, crew: false, bribe: false, contact: true, paid: 5_000 + 350 }; e.ilegal = 40_000; e.sk = { furto: 3000, assalto: 4200, burla: 0, trafico: 0, conducao: 0, armas: 0 }; });
muda('Preso', (e) => { e.respect = e.peakRespect = L(36) + 100; e.cash = 3_200; e.bank = 1_000; e.energy = 70; e.vigor = 40;
  e.jailUntil = T + 50 * 60e3; e.jailTier = 102; e.jailT0 = T - 10 * 60e3; e.jf = 1; e.contacts = 1; e.opPause = T + 23 * 3600e3; e.ilegal = 160_000; });
// passo 6: um mundo com 12 edições já corridas (Lisboa agitada, notícias das empresas) e o Rico com ações da Farma e do Casino
{
  const MW = await import('../engine/mundo.js'), { seededRng } = await import('../engine/rng.js'), { CFG } = await import('../engine/config.js');
  const m = { prices: CFG.stocks.list.map((x) => x.base), gen: CFG.stocks.list.map(() => 0), tick: 0, hist: [] };
  m.hist = [m.prices.slice()];
  m.w = MW.newWorld(m.prices, T - 12 * 6 * 3600e3);
  const rng = seededRng(42), e0 = m.w.ed;
  for (let i = 1; i <= 12; i++) {
    MW.accAdd(m.w, 'lx', i < 8 ? 4000 + i * 900 : 1500); MW.accAdd(m.w, 'farma', 30000 + i * 5000); MW.accAdd(m.w, 'casino', i === 9 ? -150000 : 20000);
    MW.accAdd(m.w, 'al', i < 10 ? 2600 : 900); MW.accAdd(m.w, 'ag', 500);   // parte 2: o Alentejo a aquecer com tanta coca a passar
    if (i === 6) m.w.co[1].st = { s: 'ensaio', ed0: e0 + 6, due: e0 + 15, p: 6200, ok: true, up: 3300, dn: 3800, rum: [], inv: false };
    MW.runEdition(m, e0 + i, rng);
  }
  const f = m.w.co[1]; if (f.st) { f.st.rum.push([e0 + 10, true, 7000], [e0 + 11, false, 5800]); f.st.inv = true; }
  // parte 2: um festival no Algarve a decorrer e os mercados mexidos por quem comprou e vendeu
  const D = (id) => CFG.drugs.findIndex((g) => g.id === id), COCA = D('coca'), HAX = D('haxixe'), ECS = D('ecstasy');
  m.w.ev = m.w.ev.filter((e) => e.r !== 'ag'); m.w.ev.push({ r: 'ag', k: 'festival', d: ECS, bp: 3000, ed0: e0 + 12, ed1: e0 + 14 });
  m.w.arts[m.w.arts.length - 1].a.push({ k: 'rgEv', r: 'ag', e: 'festival', d: ECS, bp: 3000, to: e0 + 14 });
  m.w.mk.lx[COCA] = 9420; m.w.mk.al[COCA] = 11250; m.w.mk.ag[HAX] = 10800;
  // o Rico trafica: armazéns no Alentejo e no Algarve, coca a caminho de Lisboa, uma carga apreendida e uma rusga
  muda('Rico', (e) => {
    const s0 = () => CFG.drugs.map(() => 0), al = s0(), ag = s0(); al[COCA] = 3500; ag[HAX] = 9000; ag[ECS] = 1200;
    e.wh = { lx: { sp: 2, hd: 2, fr: 1, h: 1800, f: 0 }, al: { sp: 1, hd: 1, fr: 2, h: 6200, f: 0, s: al }, ag: { sp: 1, hd: 3, fr: 1, h: 2400, f: 0, s: ag } };
    e.stock[ECS] = 2400; e.stock[COCA] = 300;
    e.mv = [{ d: COCA, n: 600, a: 'al', b: 'lx', t0: T - 20 * 60e3, at: T + 40 * 60e3, risk: 410, x: 0 }];
    e.mvLog = [{ d: HAX, n: 6000, a: 'ag', b: 'lx', at: T - 5 * 3600e3, x: 0, fine: 0, jail: false, v: 24000 }, { d: ECS, n: 800, a: 'lx', b: 'ag', at: T - 9 * 3600e3, x: 2, fine: 0, jail: false, v: 4480 }];
    e.rz = [{ r: 'al', at: T - 15 * 3600e3, bp: 900, took: [[COCA, 450]], v: 12600, fine: 2900, jail: true }];
  });
  muda('Planeador', (e) => { e.cash += 60_000; });
  db.prepare('CREATE TABLE IF NOT EXISTS bolsa (ronda INTEGER PRIMARY KEY, dados TEXT NOT NULL)').run();
  db.prepare('INSERT OR REPLACE INTO bolsa (ronda, dados) VALUES (1000, ?)').run(JSON.stringify(m));
  muda('Rico', (e) => { e.stk[1] = { n: 2000, cost: 52_000, gen: 0 }; e.stk[2] = { n: 300, cost: 37_000, gen: 0 }; });
}
db.close();
s = await arrancar();
writeFileSync(join(DIR, 'contas.json'), JSON.stringify({ base: BASE, cookies, pid: s.pid }, null, 1));
console.log('cidade pronta em', BASE, 'pid', s.pid);
s.unref(); process.exit(0);
