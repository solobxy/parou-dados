// Teste de carga: uma cidade com N jogadores (estados variados, como numa cidade a meio), o servidor a sério e C clientes ao mesmo
// tempo durante D segundos. Mede o arranque, a memória, o tempo de cada tipo de pedido (p50/p95/p99/máx) e se o servidor
// encrava (uma sonda pede /api/saude de 100 em 100 ms; um pedido destes que demore é o servidor parado a fazer outra coisa).
// Uso: node dev/carga.mjs <N> [C=100] [D=60] [porto=3590]   (cria /tmp/carga-<N>; apaga-a no fim se CARGA_LIMPA=1)
// Grau: browser e rede simulados na mesma máquina; serve para comparar e achar o que não escala, não para prometer números.
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { CFG } from '../engine/config.js';
import * as E from '../engine/engine.js';

const AQUI = dirname(fileURLToPath(import.meta.url)), RAIZ = join(AQUI, '..');
const N = +process.argv[2] || 1000, C = +process.argv[3] || 100, D = +process.argv[4] || 60, PORT = +process.argv[5] || 3590;
const DIR = `/tmp/carga-${N}`, DATA = join(DIR, 'dados'), BASE = `http://127.0.0.1:${PORT}`;
const sha = (x) => createHash('sha256').update(x).digest('hex');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const rss = (pid) => { try { const m = readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/); return m ? Math.round(+m[1] / 1024) : 0; } catch { return 0; } };

function arrancar() {
  const env = { ...process.env, PORT: String(PORT), DATA, COOKIE_INSEGURO: '1', ATOS_3S: '1000000', ATOS_MIN: '10000000' };
  const prof = process.env.CARGA_PROF ? ['--cpu-prof', '--cpu-prof-dir=' + process.env.CARGA_PROF] : [];   // perfil de CPU do servidor, para ver o que pesa
  const srv = spawn(process.execPath, [...prof, 'server.mjs'], { cwd: RAIZ, env, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.erros = []; srv.stderr.on('data', (d) => { const s = String(d); if (!/ExperimentalWarning|trace-warnings/.test(s)) srv.erros.push(s.slice(0, 300)); });
  return srv;
}
async function pronto(srv, ms = 600_000) {
  const t0 = Date.now();
  for (;;) {
    try { const r = await fetch(BASE + '/api/saude'); if (r.ok) return Date.now() - t0; } catch {}
    if (Date.now() - t0 > ms || srv.exitCode !== null) throw new Error('o servidor não arrancou: ' + srv.erros.join(' '));
    await espera(100);
  }
}
const parar = async (srv) => { srv.kill('SIGTERM'); for (let i = 0; i < 100 && srv.exitCode === null; i++) await espera(100); if (srv.exitCode === null) srv.kill('SIGKILL'); };

// 1) uma conta pela API cria as tabelas, o mundo e a ronda
if (!existsSync(join(DATA, 'jogo.db'))) {
  rmSync(DIR, { recursive: true, force: true }); mkdirSync(DATA, { recursive: true });
  const s = arrancar(); await pronto(s);
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.1' }, body: JSON.stringify({ name: 'Semente', password: 'semente123', email: 'semente@exemplo.pt' }) });
  const ck = (r.headers.get('set-cookie') || '').split(';')[0];
  await fetch(BASE + '/api/state', { headers: { cookie: ck } });
  await parar(s);

  // 2) as outras N-1 contas, com sessão e um estado a meio do jogo (níveis, dinheiro, armas, ações, negócios variados)
  const db = new DatabaseSync(join(DATA, 'jogo.db'));
  const ronda = db.prepare('SELECT MAX(ronda) r FROM jogadores').get().r, now = Date.now();
  const insC = db.prepare('INSERT INTO contas (id, nome, nome_lc, hash, criada, lingua, email) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insS = db.prepare('INSERT INTO sessoes (hash, conta, expira) VALUES (?, ?, ?)');
  const insJ = db.prepare('INSERT INTO jogadores (ronda, conta, estado, atualizado) VALUES (?, ?, ?, ?)');
  const w = { start: now - 30 * 864e5, playEnd: Number.MAX_SAFE_INTEGER };
  const armas = CFG.gear.filter((g) => ['branca', 'mao', 'principal'].includes(g.slot) && !g.craft);
  const tokens = [];
  db.exec('BEGIN');
  for (let i = 1; i < N; i++) {
    const id = 'c' + i.toString(36).padStart(7, '0'), tok = randomBytes(32).toString('base64url'), nome = 'J' + i;
    insC.run(id, nome, nome.toLowerCase(), 'x', now, i % 3 ? 'pt' : 'en', `j${i}@exemplo.pt`);
    insS.run(sha(tok), id, now + 30 * 864e5);
    const p = E.newPlayer(id, now - (i % 30) * 864e5, w);
    const lv = 1 + Math.floor(Math.random() ** 2 * 60);   // muitos no início, poucos lá em cima
    p.respect = p.peakRespect = CFG.levels[Math.min(CFG.levels.length - 1, lv - 1)];
    p.cash = Math.floor(Math.random() * 50_000 * lv); p.bank = Math.floor(Math.random() * 100_000 * lv);
    for (const k of Object.keys(p.stats)) p.stats[k] = 10 + Math.floor(Math.random() * lv * 30);
    if (CFG.classes?.length) p.cls = CFG.classes[i % CFG.classes.length].id;
    for (const sl of ['branca', 'mao', 'principal']) { const L = armas.filter((g) => g.slot === sl && (g.level || 1) <= lv); if (L.length && Math.random() < 0.8) { const g = L[Math.floor(Math.random() * L.length)]; p.eq[sl] = g.gun ? { id: g.id, u: Math.ceil(g.life / 2) } : { id: g.id }; } }
    if (Array.isArray(p.stk) && Math.random() < 0.3) p.stk[i % p.stk.length] = { n: 100 * lv, cost: 100 * lv * 5000, gen: 0 };
    p.t = now - Math.floor(Math.random() * 7 * 864e5);
    insJ.run(ronda, id, JSON.stringify(p, (k, v) => (v instanceof Map ? { __map: [...v] } : v)), now);   // como o servidor grava (os Map)
    tokens.push(tok);
  }
  db.exec('COMMIT');
  db.close();
  mkdirSync(DIR, { recursive: true });
  (await import('node:fs')).writeFileSync(join(DIR, 'tokens.json'), JSON.stringify(tokens));
}
const tokens = JSON.parse(readFileSync(join(DIR, 'tokens.json'), 'utf8'));
const tamanhoDb = Math.round((await import('node:fs')).statSync(join(DATA, 'jogo.db')).size / 1048576);

// 3) arranque: até responder e até a ronda estar em memória (o primeiro /api/state carrega toda a gente)
const srv = arrancar();
const tSaude = await pronto(srv);
const t1 = Date.now(); await fetch(BASE + '/api/state', { headers: { cookie: 'cr_s=' + tokens[0] } }); const tRonda = Date.now() - t1;
await espera(1500);
const mem0 = rss(srv.pid);

// 4) carga: C clientes, cada um com contas ao calhas, a pedir o que um jogador pede
const H = (ck, i, x = {}) => ({ cookie: ck, 'X-Forwarded-For': `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`, ...x });   // cada conta com o seu endereço, como na vida real
const tipos = [
  ['state', 55, (ck, i) => fetch(BASE + '/api/state', { headers: H(ck, i) })],
  ['crime', 15, (ck, i) => fetch(BASE + '/api/act', { method: 'POST', headers: H(ck, i, { 'Content-Type': 'application/json' }), body: JSON.stringify({ type: 'crime', k: 0 }) })],
  ['gym', 5, (ck, i) => fetch(BASE + '/api/act', { method: 'POST', headers: H(ck, i, { 'Content-Type': 'application/json' }), body: JSON.stringify({ type: 'gymStart', stat: 'F', reps: 1 }) })],
  ['targets', 8, (ck, i) => fetch(BASE + '/api/targets', { headers: H(ck, i) })],
  ['ranking', 5, (ck, i) => fetch(BASE + '/api/ranking', { headers: H(ck, i) })],
  ['venues', 4, (ck, i) => fetch(BASE + '/api/venues', { headers: H(ck, i) })],
  ['hitman', 3, (ck, i) => fetch(BASE + '/api/hitman', { headers: H(ck, i) })],
  ['feira', 3, (ck, i) => fetch(BASE + '/api/feira', { headers: H(ck, i) })],
  ['stocks', 2, (ck, i) => fetch(BASE + '/api/stocks', { headers: H(ck, i) })],
];
const soma = tipos.reduce((s, x) => s + x[1], 0), med = {}, erros = {}, estados = {}, lentos = [], T0 = Date.now();
const escolhe = () => { let r = Math.random() * soma; for (const t of tipos) { r -= t[1]; if (r < 0) return t; } return tipos[0]; };
let fim = Date.now() + D * 1000, pedidos = 0;
const sonda = []; let memMax = mem0;
const sondar = (async () => { while (Date.now() < fim) { const a = performance.now(); try { await fetch(BASE + '/api/saude'); } catch {} sonda.push(performance.now() - a); memMax = Math.max(memMax, rss(srv.pid)); await espera(100); } })();
const cliente = async () => {
  while (Date.now() < fim) {
    const [nome, , f] = escolhe(), i = Math.floor(Math.random() * tokens.length), ck = 'cr_s=' + tokens[i], a = performance.now();
    try { const r = await f(ck, i); await r.arrayBuffer(); (estados[nome] ||= {})[r.status] = (estados[nome]?.[r.status] || 0) + 1; if (r.status >= 500 || r.status === 429 || r.status === 401) erros[nome] = (erros[nome] || 0) + 1; }
    catch { erros[nome] = (erros[nome] || 0) + 1; }
    const ms = performance.now() - a; (med[nome] ||= []).push(ms); pedidos++;
    if (ms > 2000) lentos.push([nome, Math.round(ms), Math.round((Date.now() - T0 - ms) / 1000)]);   // [tipo, ms, segundo em que começou]
  }
};
await Promise.all([...Array(C)].map(cliente)); await sondar;
const memFim = rss(srv.pid);
await parar(srv);

const pc = (L, q) => { if (!L.length) return 0; const s = [...L].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]); };
const linha = (L) => `p50 ${pc(L, 0.5)} · p95 ${pc(L, 0.95)} · p99 ${pc(L, 0.99)} · máx ${pc(L, 1)} ms (${L.length})`;
console.log(`\n== ${N} jogadores · ${C} clientes · ${D} s ==`);
console.log(`base de dados ${tamanhoDb} MB · arranque ${tSaude} ms · carregar a ronda ${tRonda} ms · memória ${mem0} MB → máx ${memMax} MB → fim ${memFim} MB`);
console.log(`pedidos ${pedidos} (${Math.round(pedidos / D)}/s) · erros ${JSON.stringify(erros)}`);
console.log('códigos', JSON.stringify(estados));
for (const [nome] of tipos) console.log(nome.padEnd(8), linha(med[nome] || []));
console.log('sonda'.padEnd(8), linha(sonda), '← o servidor parado a fazer outra coisa');
if (lentos.length) { const porSeg = {}; for (const [, , s0] of lentos) porSeg[s0] = (porSeg[s0] || 0) + 1; console.log(`mais de 2 s: ${lentos.length}, por segundo de início:`, JSON.stringify(porSeg)); }
if (srv.erros.length) console.log('stderr:', srv.erros.slice(0, 5).join(' | '));
if (process.env.CARGA_LIMPA) rmSync(DIR, { recursive: true, force: true });
