// v102 (pedido do Dinis: guerras de gangues, à maneira das «ranked wars» do Torn). Arranca o servidor numa pasta temporária e joga
// por pedidos HTTP: declarar (quem pode, a quem, com a aposta), ninguém entra nem sai durante a guerra, só contam as vitórias depois de
// começar, o fim pelo alvo, o prémio (a aposta e o respeito) e o intervalo até à próxima.
// Corre com: node --test dev/guerras102.test.mjs   (dentro de crime/)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CFG } from '../engine/config.js';

const AQUI = dirname(fileURLToPath(import.meta.url)), TESTE = join(AQUI, '..', 'test');
const PORT = 4100 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
const W = CFG.gang.war;
let dir, srv;
function sextaRecente() {
  const d = new Date(Date.now() - 2 * 3600e3);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  if (Date.now() - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 21) < 2 * 3600e3) d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}
const RONDA = sextaRecente(), DESVIO = Date.UTC(...RONDA.split('-').map((x, i) => (i === 1 ? +x - 1 : +x)), 21) + 5 * 3600e3 - Date.now();
async function arrancar() {
  srv = spawn(process.execPath, ['--import', join(TESTE, 'relogio.mjs'), join(AQUI, '..', 'server.mjs')], {
    env: { ...process.env, PORT: String(PORT), DATA: dir, COOKIE_INSEGURO: '1', PRIMEIRA_RONDA: RONDA, TESTE_DESVIO_MS: String(DESVIO), ATOS_3S: '100000', ATOS_MIN: '1000000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => { const s = String(d); if (!s.includes('ExperimentalWarning') && !s.includes('trace-warnings')) process.stderr.write(s); });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/api/saude')).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('servidor não arrancou');
}
async function parar() { srv.kill(); await new Promise((r) => srv.once('exit', r)); }
// mexer no que está gravado (com o servidor parado): jogadores, gangues e guerras
async function mexer(jog = {}, sql = []) {
  await parar();
  const db = new DatabaseSync(join(dir, 'jogo.db'));
  for (const [nome, fn] of Object.entries(jog)) {
    const id = db.prepare('SELECT id FROM contas WHERE nome = ?').get(nome).id, row = db.prepare('SELECT ronda, estado FROM jogadores WHERE conta = ?').get(id);
    const e = JSON.parse(row.estado); fn(e); db.prepare('UPDATE jogadores SET estado = ? WHERE conta = ? AND ronda = ?').run(JSON.stringify(e), id, row.ronda);
  }
  for (const s of sql) db.exec(s);
  db.close(); await arrancar();
}
let ipN = 0;
async function conta(nome) {
  const ip = '10.7.0.' + ++ipN;
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@teste.pt' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const ag = async (body) => { const x = await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: JSON.stringify(body) }); return { status: x.status, body: await x.json() }; };
  const gang = async () => (await fetch(BASE + '/api/gang', { headers: { cookie, 'X-Forwarded-For': ip } })).json();
  const me = async () => (await (await fetch(BASE + '/api/state', { headers: { cookie, 'X-Forwarded-For': ip } })).json()).me;
  await me();
  return { nome, ag, gang, me };
}
// uma vitória certa: a hipótese máxima é 95%, por isso uma derrota (1 em 20) tira-se do hospital e tenta-se outra vez
async function vence(at, alvo) {
  for (let i = 0; i < 6; i++) {
    const r = await at.ag({ type: 'attack', target: alvo, mode: 'beat' }); assert.equal(r.status, 200, JSON.stringify(r.body));
    if (r.body.result.win) return r;
    await mexer({ [at.nome]: (e) => { e.hospUntil = 0; e.vigor = 100; }, [alvo]: (e) => { e.hospUntil = 0; } });
  }
  assert.fail('6 derrotas seguidas');
}
before(async () => { dir = mkdtempSync(join(tmpdir(), 'guerras-')); await arrancar(); });
after(async () => { await parar(); rmSync(dir, { recursive: true, force: true }); });

test('guerra de gangues: declarar, gente presa às gangues, pontos só a valer, fim pelo alvo, prémio e intervalo', async () => {
  const A = await Promise.all(['Alfa1', 'Alfa2', 'Alfa3'].map(conta)), B = await Promise.all(['Beta1', 'Beta2', 'Beta3'].map(conta)), C = await conta('Ceta1');
  const forte = (e) => { e.cash = 2_000_000; e.respect = 50_000; e.peakRespect = 50_000; e.vigor = 100; for (const k in e.stats) e.stats[k] = 1_000_000; e.shieldUntil = 0; };   // todas as stats: com só F e T, 1 luta em ~20 perdia-se
  const fraco = (e) => { e.cash = 2_000_000; e.respect = 50_000; e.peakRespect = 50_000; e.vigor = 100; e.shieldUntil = 0; };
  await mexer(Object.fromEntries([...A.map((x) => [x.nome, forte]), ...B.map((x) => [x.nome, fraco]), [C.nome, fraco]]));
  let r = await A[0].ag({ type: 'gangCreate', name: 'Alfa', tag: 'ALF' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const ga = r.body.result.id;
  r = await B[0].ag({ type: 'gangCreate', name: 'Beta', tag: 'BET' }); const gb = r.body.result.id;
  await A[1].ag({ type: 'gangJoin', id: ga });
  await B[1].ag({ type: 'gangJoin', id: gb }); await B[2].ag({ type: 'gangJoin', id: gb });
  r = await A[0].ag({ type: 'gangDonate', amount: 500_000 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  // quem não pode: poucos membros, gangue nova, cargo, a gangue da rua
  r = await A[0].ag({ type: 'gangWar', id: gb }); assert.equal(r.body.error, 'FEW_MEMBERS');
  await A[2].ag({ type: 'gangJoin', id: ga });
  r = await A[0].ag({ type: 'gangWar', id: gb }); assert.equal(r.body.error, 'TARGET_NEW_GANG');
  await mexer({}, [`UPDATE gangues SET criada = criada - ${2 * 24 * 3600e3}`]);
  r = await A[1].ag({ type: 'gangWar', id: gb }); assert.equal(r.body.error, 'NO_RANK');
  r = await A[0].ag({ type: 'gangWar', id: 'rua' }); assert.equal(r.body.error, 'NO_GANG');
  r = await A[0].ag({ type: 'gangWar', id: ga }); assert.equal(r.body.error, 'NO_GANG');
  let g = await A[0].gang();
  const fundo0 = g.mine.fund, stake = W.stake[0];
  assert.equal(g.list.find((x) => x.id === gb).warWhy, null, 'a lista diz que se pode declarar');
  // declarar: a aposta sai do cofre; começa uma hora depois
  r = await A[0].ag({ type: 'gangWar', id: gb }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.stake, stake); assert.equal(r.body.result.target, Math.max(W.targetMin, W.targetPer * 6));
  g = await A[0].gang(); assert.equal(g.mine.fund, fundo0 - stake); assert.ok(g.mine.war.war); assert.equal(g.mine.war.war.vs.tag, 'BET');
  assert.equal(g.list.find((x) => x.id === gb).warWhy, 'AT_WAR');
  // v104: o jornal tem a guerra declarada (ainda por começar) para a primeira página
  let J = await (await fetch(BASE + '/api/news')).json();
  assert.equal(J.wars.length, 1); assert.equal(J.wars[0].a.tag, 'ALF'); assert.equal(J.wars[0].b.tag, 'BET'); assert.equal(J.wars[0].end, 0); assert.equal(J.wars[0].win, null); assert.equal(J.wars[0].stake, stake);
  // ninguém sai nem entra nas duas
  r = await B[2].ag({ type: 'gangLeave' }); assert.equal(r.body.error, 'AT_WAR');
  r = await C.ag({ type: 'gangJoin', id: gb }); assert.equal(r.body.error, 'AT_WAR');
  // antes de começar, as vitórias não contam
  r = await A[1].ag({ type: 'attack', target: 'Beta2', mode: 'beat' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.result.war, undefined);
  g = await A[0].gang(); assert.equal(g.mine.war.war.me, 0);
  // começa (a hora de início passa) e a vitória conta
  await mexer({}, [`UPDATE guerras SET inicio = inicio - ${2 * 3600e3}, decl = decl - ${2 * 3600e3}`]);
  r = await vence(A[2], 'Beta3'); assert.ok(r.body.result.war > 0); const pts = r.body.result.war;
  g = await A[0].gang(); assert.equal(g.mine.war.war.me, pts); assert.equal(g.mine.war.war.top[0].name, 'Alfa3');
  const gB = await B[0].gang(); assert.equal(gB.mine.war.war.them, pts); assert.equal(gB.mine.war.war.ours, false);
  assert.ok(g.mine.war.war.enemies.some((e) => e.name === 'Beta3' && e.why === 'TARGET_HOSPITAL'));
  // o alvo baixa (como ao fim de dias) e a vitória seguinte acaba a guerra: a aposta volta a quem declarou, respeito a quem lutou
  await mexer({}, ['UPDATE guerras SET alvo = 1']);
  const resp0 = (await A[0].me()).respect, a3 = (await A[2].me()).respect;
  r = await vence(A[0], 'Beta1');
  await new Promise((x) => setTimeout(x, 300));
  g = await A[0].gang(); assert.equal(g.mine.war.war, undefined); assert.equal(g.mine.war.hist[0].won, true); assert.equal(g.mine.fund, fundo0);
  J = await (await fetch(BASE + '/api/news')).json();   // e depois de acabar: quem ganhou e o resultado
  assert.equal(J.wars.length, 1); assert.ok(J.wars[0].end > 0); assert.equal(J.wars[0].win, 'a'); assert.ok(J.wars[0].sa > J.wars[0].sb);
  assert.ok((await A[2].me()).respect > a3, 'quem lutou ganhou respeito');
  assert.ok((await A[0].me()).respect > resp0);
  // o intervalo: nem se declara outra vez já, e já se pode sair
  r = await A[0].ag({ type: 'gangWar', id: gb }); assert.equal(r.body.error, 'WAR_COOL');
  r = await B[2].ag({ type: 'gangLeave' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  // sobrevive a um reinício
  await mexer({});
  g = await A[0].gang(); assert.equal(g.mine.war.hist.length, 1); assert.ok(g.mine.war.cool > 0);
});

test('em guerra vale atacar quem tem menos respeito; o alvo desce ao fim de um dia, 1% do inicial por hora', async () => {
  const E = await import('../engine/engine.js'), T = (await import('../engine/config.js')).T;
  const w0 = { start: 0, playEnd: Number.MAX_SAFE_INTEGER }, now = 10 * T.DAY;
  const a = E.newPlayer('wa', now, w0), d = E.newPlayer('wd', now, w0);
  a.respect = a.peakRespect = 100_000; d.respect = d.peakRespect = 10_000; a.shieldUntil = d.shieldUntil = 0;
  assert.equal(E.canAttack(a, d, now, w0), 'TARGET_TOO_WEAK');
  assert.equal(E.canAttack(a, d, now, w0, false, true), null);
  assert.equal(E.warTarget(1000, 0, W.holdMs - 1), 1000);
  assert.equal(E.warTarget(1000, 0, W.holdMs + 30 * 60_000), 1000);
  assert.equal(E.warTarget(1000, 0, W.holdMs + T.HOUR), 990);
  assert.equal(E.warTarget(1000, 0, W.holdMs + 100 * T.HOUR), 0);
  assert.equal(W.holdMs + 100 * T.HOUR, W.maxMs, 'o alvo chega a zero quando a guerra acaba');
});
