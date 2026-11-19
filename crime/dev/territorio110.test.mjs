// v110 (pedido do Dinis: território dos gangues com cadeias, à maneira do Torn). Arranca o servidor numa pasta temporária e joga
// por pedidos HTTP: quem pode assaltar e porque não, tomar um bairro da rua com vitórias, a cadeia e o multiplicador, assaltar um
// bairro com dono (aviso, só contam as lutas entre os dois, o dono aguenta), o intervalo, o máximo de bairros e o dinheiro à hora.
// Corre com: node --test dev/territorio110.test.mjs   (dentro de crime/)
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
const PORT = 4300 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
const TF = CFG.turf, Z = (id) => TF.zones.find((z) => z.id === id);
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
// mexer no que está gravado (com o servidor parado): jogadores e tabelas
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
const caixa = () => { const db = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true }); const r = db.prepare("SELECT SUM(entra) e, SUM(sai) s FROM caixa WHERE fonte = 'bairros'").get(); db.close(); return r; };
let ipN = 0;
async function conta(nome) {
  const ip = '10.8.0.' + ++ipN;
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@teste.pt' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const get = async (p) => (await fetch(BASE + p, { headers: { cookie, 'X-Forwarded-For': ip } })).json();
  const ag = async (body) => { const x = await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: JSON.stringify(body) }); return { status: x.status, body: await x.json() }; };
  await get('/api/state');
  return { nome, ag, get, turf: () => get('/api/turf'), gang: () => get('/api/gang'), events: async () => (await get('/api/events')).list };
}
// uma vitória certa: com 95% de hipótese, uma derrota tira-se do hospital e tenta-se outra vez
async function vence(at, alvo) {
  for (let i = 0; i < 6; i++) {
    const r = await at.ag({ type: 'attack', target: alvo, mode: 'beat' }); assert.equal(r.status, 200, JSON.stringify(r.body));
    if (r.body.result.win) return r;
    await mexer({ [at.nome]: (e) => { e.hospUntil = 0; e.vigor = 100; }, [alvo]: (e) => { e.hospUntil = 0; } });
  }
  assert.fail('6 derrotas seguidas');
}
const zona = (t, id) => t.zones.find((z) => z.id === id);
before(async () => { dir = mkdtempSync(join(tmpdir(), 'territorio-')); await arrancar(); });
after(async () => { await parar(); rmSync(dir, { recursive: true, force: true }); });

let A, B, F, ga, gb;
const forte = (e) => { e.cash = 5_000_000; e.respect = 50_000; e.peakRespect = 50_000; e.vigor = 100; for (const k in e.stats) e.stats[k] = 1_000_000; e.shieldUntil = 0; };
const fraco = (e) => { e.cash = 5_000_000; e.respect = 50_000; e.peakRespect = 50_000; e.vigor = 100; e.shieldUntil = 0; };
const curar = (xs) => Object.fromEntries(xs.map((x) => [x.nome, (e) => { e.hospUntil = 0; e.vigor = 100; e.hospTimes = []; e.capUntil = 0; e.protectUntil = 0; }]));

test('bairro da rua: quem pode, tomar com vitórias, a cadeia, o vosso e protegido', async () => {
  A = await Promise.all(['Alfa1', 'Alfa2', 'Alfa3'].map(conta)); B = await Promise.all(['Beta1', 'Beta2', 'Beta3'].map(conta));
  F = await Promise.all(['Rua1', 'Rua2', 'Rua3', 'Rua4', 'Rua5', 'Rua6', 'Rua7', 'Rua8'].map(conta));
  await mexer(Object.fromEntries([...A.map((x) => [x.nome, forte]), ...B.map((x) => [x.nome, fraco]), ...F.map((x) => [x.nome, fraco])]));
  // sem gangue, sem zona
  let r = await A[0].ag({ type: 'gangTurf', z: 'belem' }); assert.equal(r.body.error, 'NO_GANG');
  r = await A[0].ag({ type: 'gangCreate', name: 'Alfa', tag: 'ALF' }); assert.equal(r.status, 200, JSON.stringify(r.body)); ga = r.body.result.id;
  r = await B[0].ag({ type: 'gangCreate', name: 'Beta', tag: 'BET' }); gb = r.body.result.id;
  await A[1].ag({ type: 'gangJoin', id: ga });
  r = await A[0].ag({ type: 'gangTurf', z: 'xx' }); assert.equal(r.body.error, 'NO_ZONE');
  r = await A[0].ag({ type: 'gangTurf', z: 'belem' }); assert.equal(r.body.error, 'FEW_MEMBERS');
  await A[2].ag({ type: 'gangJoin', id: ga });
  r = await A[1].ag({ type: 'gangTurf', z: 'belem' }); assert.equal(r.body.error, 'NO_RANK');
  r = await A[0].ag({ type: 'gangTurf', z: 'belem' }); assert.equal(r.body.error, 'NO_GANG_MONEY');
  r = await A[0].ag({ type: 'gangDonate', amount: 500_000 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  // a vista: sem gangue não há «mine» e o porquê é NO_GANG
  let t = await F[0].turf(); assert.equal(t.mine, null); assert.equal(t.zones.length, TF.zones.length); assert.ok(t.zones.every((z) => z.why === 'NO_GANG' && !z.owner));
  t = await A[1].turf(); assert.equal(zona(t, 'belem').why, 'NO_RANK');
  t = await A[0].turf(); assert.equal(zona(t, 'belem').why, null); const cofre0 = t.mine.cofre;
  // tomar Belém: a taxa sai do cofre e começa já
  r = await A[0].ag({ type: 'gangTurf', z: 'belem' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.fee, TF.fee[1]); assert.equal(r.body.result.need, TF.need[1]); assert.equal(r.body.result.end - r.body.result.start, TF.durMs);
  t = await A[0].turf(); assert.equal(t.mine.cofre, cofre0 - TF.fee[1]);
  const as = zona(t, 'belem').as; assert.ok(as); assert.equal(as.a.tag, 'ALF'); assert.equal(as.d, null); assert.equal(as.side, 'a');
  assert.equal(zona(t, 'alcantara').why, 'TURF_ONE');
  assert.equal(caixa().s, TF.fee[1], 'a taxa sai do jogo e conta no caixa');
  // os outros veem-no em disputa (sem lado)
  t = await F[0].turf(); assert.equal(zona(t, 'belem').as.side, null);
  // vitórias: cada uma 10 pontos (sem multiplicador até 10 seguidas) e a cadeia sobe
  const need = TF.need[1] / TF.winPts;
  let k = 0;
  for (let i = 0; i < need; i++) {
    const at = A[i % 3];
    r = await vence(at, F[k++].nome);
    assert.equal(r.body.result.turf.chain, i + 1); assert.equal(r.body.result.turf.mult, 10000);
    assert.equal(r.body.result.turf.pts, TF.winPts); assert.equal(r.body.result.turf.z, 'belem');
  }
  await new Promise((x) => setTimeout(x, 300));
  t = await A[0].turf();
  const b = zona(t, 'belem'); assert.equal(b.as, null, 'chegou aos pontos: acabou'); assert.equal(b.owner.tag, 'ALF'); assert.equal(b.owner.me, true);
  assert.ok(b.prot > Date.now() + DESVIO, 'protegido'); assert.equal(b.why, 'TURF_MINE');
  assert.equal(t.mine.held, 1); assert.equal(t.mine.perH, TF.perH[1]); assert.equal(t.mine.chain.n, need); assert.ok(t.mine.cool > 0);
  assert.equal(t.hist[0].z, 'belem'); assert.equal(t.hist[0].won, true); assert.equal(t.hist[0].d, '');
  // o intervalo depois de um assalto
  assert.equal(zona(t, 'alcantara').why, 'TURF_COOL');
  r = await A[0].ag({ type: 'gangTurf', z: 'alcantara' }); assert.equal(r.body.error, 'TURF_COOL');
  // os membros têm os avisos; o jornal tem as duas notícias
  const ev = await A[1].events();
  assert.ok(ev.some((e) => e.k === 'turfStart' && e.z === 'belem' && e.ours === true));
  assert.ok(ev.some((e) => e.k === 'turfEnd' && e.z === 'belem' && e.won === true && e.ours === true));
  const J = await (await fetch(BASE + '/api/news')).json(), L = J.list || J.news || [];
  const nk = (k) => JSON.stringify(J).includes(`"k":"${k}"`);
  assert.ok(nk('turfStart') && nk('turfTake'), 'notícias do assalto: ' + L.length);
  // um vadio não tem bairros
  r = await F[7].ag({ type: 'gangJoin', id: 'rua' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  t = await F[7].turf(); assert.equal(t.mine, null);
  r = await F[7].ag({ type: 'gangTurf', z: 'alcantara' }); assert.equal(r.body.error, 'NO_GANG');
});

test('a cadeia: o multiplicador às 10, 25 e 50 seguidas e a cadeia cai passados 5 minutos', async () => {
  // a cadeia vai em 24 e ainda está viva: a próxima é a 25.ª e vale ×1,5 (fora de um assalto dá 0 pontos)
  await mexer(curar([...A, ...F]), [`UPDATE cadeias SET n = 24, best = 24`]);
  let r = await vence(A[0], 'Rua1');
  assert.equal(r.body.result.turf.chain, 25); assert.equal(r.body.result.turf.mult, 15000); assert.equal(r.body.result.turf.pts, 0);
  let t = await A[0].turf(); assert.equal(t.mine.chain.n, 25); assert.equal(t.mine.chain.best, 25); assert.equal(t.mine.chain.mult, 15000);
  // passados mais de 5 minutos sem vitórias, cai para zero (o melhor fica)
  await mexer(curar([...A, ...F]), [`UPDATE cadeias SET t = t - ${TF.chainGapMs + 1000}`]);
  t = await A[0].turf(); assert.equal(t.mine.chain.n, 0); assert.equal(t.mine.chain.best, 25);
  r = await vence(A[1], 'Rua2'); assert.equal(r.body.result.turf.chain, 1);
  // quem perde não faz cadeia (e uma derrota não a corta)
  const p = await F[3].ag({ type: 'attack', target: 'Alfa3', mode: 'beat' });
  assert.equal(p.status, 200, JSON.stringify(p.body)); assert.equal(p.body.result.turf, undefined);
});

test('bairro com dono: aviso, só contam as lutas entre os dois, o dono aguenta, e o intervalo', async () => {
  for (const x of B.slice(1)) await x.ag({ type: 'gangJoin', id: gb });
  let r = await B[0].ag({ type: 'gangDonate', amount: 500_000 }); assert.equal(r.status, 200, JSON.stringify(r.body));
  // acabado de tomar: protegido
  r = await B[0].ag({ type: 'gangTurf', z: 'belem' }); assert.equal(r.body.error, 'TURF_PROT');
  await mexer(curar([...A, ...B, ...F]), ['UPDATE territorio SET prot = 0']);
  r = await B[0].ag({ type: 'gangTurf', z: 'belem' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.end - r.body.result.start, TF.durMs);
  let t = await A[0].turf(); const s0 = zona(t, 'belem').as;
  assert.equal(s0.side, 'd'); assert.equal(s0.a.tag, 'BET'); assert.equal(s0.d.tag, 'ALF'); assert.ok(s0.start - (Date.now() + DESVIO) > TF.prepMs - 60_000, 'meia hora de aviso');
  assert.deepEqual(s0.foes.map((f) => f.name).sort(), ['Beta1', 'Beta2', 'Beta3'], 'o dono vê quem o ataca');
  assert.equal(zona(t, 'belem').why, 'TURF_MINE');
  t = await F[0].turf(); assert.equal(zona(t, 'belem').why, 'NO_GANG'); assert.equal(zona(t, 'belem').as.foes, null);
  // o dono tem o aviso
  const ev = await A[2].events(); assert.ok(ev.some((e) => e.k === 'turfStart' && e.ours === false && e.vs === 'Beta'));
  // antes de começar: as vitórias entre os dois não contam
  r = await vence(A[0], 'Beta1'); assert.equal(r.body.result.turf.pts, 0);
  // começa
  await mexer(curar([...A, ...B, ...F]), [`UPDATE assaltos SET inicio = inicio - ${TF.prepMs + 60_000} WHERE fim = 0`]);
  r = await vence(A[1], 'Beta2'); assert.ok(r.body.result.turf.pts > 0); assert.equal(r.body.result.turf.z, 'belem');
  const pd = r.body.result.turf.pts;
  // uma vitória contra quem não é do outro gangue não conta para este assalto
  r = await vence(A[2], 'Rua5'); assert.equal(r.body.result.turf.pts, 0);
  t = await A[0].turf(); assert.equal(zona(t, 'belem').as.pd, pd); assert.equal(zona(t, 'belem').as.pa, 0);
  t = await A[1].turf(); assert.equal(zona(t, 'belem').as.mineN, pd); assert.equal(zona(t, 'belem').as.top[0].name, 'Alfa2');
  // acaba o tempo: quem ataca não chegou ao mínimo, o dono fica
  await mexer({}, [`UPDATE assaltos SET inicio = inicio - ${TF.durMs} WHERE fim = 0`]);
  await new Promise((x) => setTimeout(x, 1300));
  t = await A[0].turf(); const b = zona(t, 'belem');
  assert.equal(b.as, null); assert.equal(b.owner.tag, 'ALF'); assert.equal(t.hist[0].won, false); assert.equal(t.hist[0].d, 'Alfa');
  const evB = await B[1].events(); assert.ok(evB.some((e) => e.k === 'turfEnd' && e.ours === true && e.won === false));
  const evA = await A[1].events(); assert.ok(evA.some((e) => e.k === 'turfEnd' && e.ours === false && e.won === true));
  assert.ok(JSON.stringify(await (await fetch(BASE + '/api/news')).json()).includes('"k":"turfHold"'));
  r = await B[0].ag({ type: 'gangTurf', z: 'alcantara' }); assert.equal(r.body.error, 'TURF_COOL');
});

test('dinheiro à hora para o cofre, o máximo de bairros e um bairro de um gangue que acabou volta à rua', async () => {
  // três horas por pagar em Belém
  let t = await A[0].turf(); const c0 = t.mine.cofre, e0 = caixa().e || 0;
  await mexer({}, [`UPDATE territorio SET pago = pago - ${3 * 3600e3 + 1000} WHERE zona = 'belem'`]);
  await new Promise((x) => setTimeout(x, 1300));
  t = await A[0].turf(); assert.equal(t.mine.cofre, c0 + 3 * TF.perH[1]);
  assert.equal((caixa().e || 0) - e0, 3 * TF.perH[1], 'o dinheiro que entra conta no caixa');
  // com o máximo de bairros não há mais
  const ronda = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true }).prepare('SELECT ronda FROM territorio LIMIT 1').get().ronda;
  const agora = Date.now() + DESVIO;
  await mexer({}, ['alcantara', 'campoourique', 'mouraria'].map((z) => `INSERT OR REPLACE INTO territorio (ronda, zona, dono, desde, pago, prot) VALUES (${ronda}, '${z}', '${ga}', ${agora}, ${agora}, 0)`));
  t = await A[0].turf(); assert.equal(t.mine.held, TF.max); assert.equal(zona(t, 'baixa').why, 'TURF_MAX');
  assert.equal(t.mine.perH, TF.perH[1] * 4);
  // o gangue acaba (todos saem): os bairros ficam da rua
  for (const x of [A[1], A[2], A[0]]) { const r = await x.ag({ type: 'gangLeave' }); assert.equal(r.status, 200, JSON.stringify(r.body)); }
  t = await B[0].turf(); assert.ok(t.zones.every((z) => !z.owner), 'sem dono'); assert.equal(zona(t, 'belem').why === 'TURF_COOL', true);
});
