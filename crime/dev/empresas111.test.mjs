// v111 (pedido do Dinis: empresas dos jogadores, à maneira das companies do Torn). Arranca o servidor numa pasta temporária e joga
// por pedidos HTTP: fundar (nível, nome, preço), pedir emprego e contratar (o curso da tarefa), o turno na empresa (o ordenado sai
// do caixa, a receita entra), as estrelas e o bónus do tipo, o tamanho, tirar e pôr dinheiro, despedir, sair e fechar.
// Corre com: node --test dev/empresas111.test.mjs   (dentro de crime/)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CFG } from '../engine/config.js';
import * as E from '../engine/engine.js';

const AQUI = dirname(fileURLToPath(import.meta.url)), TESTE = join(AQUI, '..', 'test');
const PORT = 4400 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
const C = CFG.comp, TY = (id) => C.types.findIndex((x) => x.id === id);
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
const caixa = () => { const db = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true }); const r = db.prepare("SELECT SUM(entra) e, SUM(sai) s FROM caixa WHERE fonte = 'empresas'").get(); db.close(); return { e: r.e || 0, s: r.s || 0 }; };
let ipN = 0;
async function conta(nome) {
  const ip = '10.9.0.' + ++ipN;
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@teste.pt' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const get = async (p) => (await fetch(BASE + p, { headers: { cookie, 'X-Forwarded-For': ip } })).json();
  const ag = async (body) => { const x = await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: JSON.stringify(body) }); return { status: x.status, body: await x.json() }; };
  await get('/api/state');
  return { nome, ag, get, comp: () => get('/api/comp'), me: async () => (await get('/api/state')).me, events: async () => (await get('/api/events')).list };
}
before(async () => { dir = mkdtempSync(join(tmpdir(), 'empresas-')); await arrancar(); });
after(async () => { await parar(); rmSync(dir, { recursive: true, force: true }); });

const rico = (e) => { e.cash = 3_000_000; e.bank = 0; e.respect = 60_000; e.peakRespect = 60_000; e.vigor = 100; e.shieldUntil = 0; };
const novo = (e) => { e.cash = 3_000_000; e.vigor = 100; };
// um turno na empresa: começa, recua o relógio da tarefa (o tempo mínimo) e entrega a melhor rota
async function turno(x, task = 'entregas') {
  let r = await x.ag({ type: 'workStart', id: task, shift: 'emp' }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  const L = r.body.result.task.layout;
  await mexer({ [x.nome]: (e) => { e.tk.t0 -= 60_000; } });
  // a melhor ordem das paragens (todas as permutações de 4)
  const perm = (a) => (a.length <= 1 ? [a] : a.flatMap((v, i) => perm([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [v, ...p])));
  const len = (o) => { let px = 0, py = 0, n = 0; for (const i of o) { const s = L.stops[i]; n += Math.abs(s.x - px) + Math.abs(s.y - py); px = s.x; py = s.y; } return n; };
  const best = perm(L.stops.map((_, i) => i)).sort((a, b) => len(a) - len(b))[0];
  r = await x.ag({ type: 'workDone', ans: { order: best } }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  return r.body;
}
let D, A, B, Z, N;
test('fundar: nível, nome, preço, nome repetido e a notícia', async () => {
  [D, A, B, Z, N] = await Promise.all(['Dona', 'Ana', 'Bea', 'Zeca', 'Novo'].map(conta));
  await mexer({ Dona: rico, Ana: rico, Bea: rico, Zeca: rico, Novo: novo });
  let r = await N.ag({ type: 'compFound', t: 0, name: 'Coisa Nova' }); assert.equal(r.body.error, 'LOW_LEVEL');
  r = await D.ag({ type: 'compFound', t: 0, name: 'x' }); assert.equal(r.body.error, 'BAD_COMP_NAME');
  r = await D.ag({ type: 'compFound', t: 99, name: 'Entregas Já' }); assert.equal(r.body.error, 'NO_COMP_TYPE');
  const m0 = await D.me();
  r = await D.ag({ type: 'compFound', t: TY('estafetas'), name: 'Entregas Já' }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.result.cost, C.types[TY('estafetas')].cost); assert.equal(r.body.me.cash, m0.cash - r.body.result.cost);
  assert.equal(r.body.me.emp.own, true); assert.equal(r.body.me.emp.name, 'Entregas Já'); assert.equal(r.body.me.emp.s, 0);
  assert.equal(caixa().s, C.types[TY('estafetas')].cost, 'o preço sai do jogo');
  r = await Z.ag({ type: 'compFound', t: TY('advocacia'), name: 'entregas já' }); assert.equal(r.body.error, 'COMP_NAME_TAKEN');
  r = await Z.ag({ type: 'compFound', t: TY('advocacia'), name: 'Silva & Filhos' }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  r = await D.ag({ type: 'compFound', t: 1, name: 'Outra Mais' }); assert.equal(r.body.error, 'IN_COMPANY');
  const v = await D.comp(); assert.equal(v.mine.own, true); assert.equal(v.mine.till, 0); assert.equal(v.mine.slots, C.slots[1]); assert.equal(v.list.length, 1); assert.equal(v.list[0].name, 'Silva & Filhos');
  assert.ok(JSON.stringify(await (await fetch(BASE + '/api/news')).json()).includes('"k":"compNew"'));
});

test('pedir emprego e contratar: o curso, o emprego da cidade sai, sem lugar', async () => {
  // a Ana tem um emprego na cidade: ao entrar na empresa fica sem ele
  let r = await A.ag({ type: 'job', i: 0 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  const v = await A.comp(), id = v.list.find((x) => x.name === 'Entregas Já').id, adv = v.list.find((x) => x.name === 'Silva & Filhos');
  assert.equal(adv.can, false, 'advogados pedem a especialização');
  r = await A.ag({ type: 'compApply', id: adv.id }); assert.equal(r.body.error, 'NEED_COURSE');
  r = await A.ag({ type: 'compApply', id }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  r = await B.ag({ type: 'compApply', id }); assert.equal(r.status, 200);
  let d = await D.comp(); assert.deepEqual(d.mine.asks.map((x) => x.name).sort(), ['Ana', 'Bea']);
  assert.ok((await D.events()).some((e) => e.k === 'compAsk' && e.who === 'Ana'));
  r = await A.ag({ type: 'compAccept', name: 'Bea' }); assert.equal(r.body.error, 'NO_COMPANY');
  r = await D.ag({ type: 'compAccept', name: 'Ana' }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  r = await A.ag({ type: 'compAccept', name: 'Bea' }); assert.equal(r.body.error, 'NOT_OWNER');
  const me = await A.me(); assert.equal(me.emp.name, 'Entregas Já'); assert.equal(me.emp.own, false); assert.equal(me.job, -1);
  r = await A.ag({ type: 'job', i: 0 }); assert.equal(r.body.error, 'IN_COMPANY');
  r = await D.ag({ type: 'compReject', name: 'Bea' }); assert.equal(r.status, 200);
  d = await D.comp(); assert.equal(d.mine.asks.length, 0); assert.equal(d.mine.staff.length, 2);
  // sem lugar: enche-se a empresa até ao tamanho 1
  const extra = await Promise.all(['Cao1', 'Cao2', 'Cao3'].map(conta));
  await mexer(Object.fromEntries(extra.map((x) => [x.nome, rico])));
  for (const x of extra.slice(0, 2)) { assert.equal((await x.ag({ type: 'compApply', id })).status, 200); assert.equal((await D.ag({ type: 'compAccept', name: x.nome })).status, 200); }
  r = await extra[2].ag({ type: 'compApply', id }); assert.equal(r.body.error, 'COMP_FULL');
  r = await D.ag({ type: 'compFire', name: 'Cao2' }); assert.equal(r.status, 200);
  assert.equal((await extra[1].me()).emp, null); assert.ok((await extra[1].events()).some((e) => e.k === 'compOut' && e.why === 'fired'));
  r = await extra[0].ag({ type: 'compLeave' }); assert.equal(r.status, 200); assert.equal((await extra[0].me()).emp, null);
  assert.ok((await D.events()).some((e) => e.k === 'compLeft' && e.who === 'Cao1'));
  r = await D.ag({ type: 'compLeave' }); assert.equal(r.body.error, 'IS_OWNER');
});

test('o turno: o ordenado sai do caixa (até onde chegar), a receita entra, o dono não se paga', async () => {
  // caixa vazio: a Ana trabalha e não recebe
  let b = await turno(A); const r1 = b.result;
  assert.equal(r1.emp, true); assert.equal(r1.money, 0); assert.equal(r1.short, true); assert.ok(r1.rev > 0); assert.equal(r1.q, 10000);
  assert.equal(r1.rev, E.empRev(TY('estafetas'), 10000, 0));
  let d = await D.comp(); assert.equal(d.mine.till, r1.rev); assert.equal(d.mine.shifts7, 1);
  // a dona põe dinheiro no caixa e sobe o ordenado
  let r = await D.ag({ type: 'compPut', amount: 50_000 }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  r = await D.ag({ type: 'compSalary', v: 700 }); assert.equal(r.body.result.sal, 700);
  r = await D.ag({ type: 'compSalary', v: C.salMax + 1 }); assert.equal(r.body.error, 'BAD_AMOUNT');
  const bank0 = (await A.me()).bank;
  b = await turno(A); assert.equal(b.result.money, 700); assert.equal(b.me.bank, bank0 + 700); assert.equal(b.result.short, false);
  d = await D.comp(); assert.equal(d.mine.till, r1.rev + 50_000 + b.result.rev - 700);
  assert.equal(caixa().e, r1.rev + b.result.rev, 'a receita entra no jogo e conta no caixa');
  // a dona trabalha na própria empresa: não se paga, a receita toda vai para o caixa
  const till0 = d.mine.till;
  b = await turno(D); assert.equal(b.result.money, 0); assert.equal(b.result.short, false);
  d = await D.comp(); assert.equal(d.mine.till, till0 + b.result.rev);
  assert.equal(d.mine.staff.find((x) => x.name === 'Ana').total, 2);
  // a tarefa tem de ser a do tipo
  r = await A.ag({ type: 'workStart', id: 'camiao', shift: 'emp' }); assert.equal(r.body.error, 'NO_WORK');
});

test('estrelas: os turnos dos últimos 7 dias, o bónus do tipo às 3 e às 5', async () => {
  const id = (await D.comp()).mine.id, ronda = new DatabaseSync(join(dir, 'jogo.db'), { readOnly: true }).prepare('SELECT ronda FROM empresas LIMIT 1').get().ronda;
  const hoje = Math.floor(Date.parse(E.dayOf(Date.now() + DESVIO) + 'T12:00:00Z') / 86400000);
  // 86 turnos ontem e 3 hoje: ao próximo são 90 = 3 estrelas
  await mexer({}, [`UPDATE empresas SET dias = '${JSON.stringify([{ d: hoje - 1, n: 86, r: 0 }, { d: hoje, n: 3, r: 0 }])}' WHERE ronda = ${ronda} AND id = '${id}'`]);
  let v = await D.comp(); assert.equal(v.mine.stars, 2); assert.equal(v.mine.next, 1);
  await turno(A);
  v = await D.comp(); assert.equal(v.mine.stars, 3);
  assert.equal((await A.me()).emp.s, 3, 'o bónus chega a quem lá trabalha'); assert.equal((await D.me()).emp.s, 3);
  const p = E.newPlayer('x', 0, { start: 0, playEnd: 1e15 }); E.empSet(p, 'e', TY('estafetas'), 3); assert.equal(E.empBp(p, 'loot'), C.types[TY('estafetas')].bp[0]);
  E.empSet(p, 'e', TY('estafetas'), 5); assert.equal(E.empBp(p, 'loot'), C.types[TY('estafetas')].bp[1]); assert.equal(E.empBp(p, 'def'), 0);
  // os turnos antigos saem da conta: daqui a 8 dias as estrelas caem (simula-se mudando o dia dos registos)
  await mexer({}, [`UPDATE empresas SET dias = '${JSON.stringify([{ d: hoje - 8, n: 300, r: 0 }])}' WHERE ronda = ${ronda} AND id = '${id}'`]);
  v = await D.comp(); assert.equal(v.mine.stars, 0); assert.equal((await A.me()).emp.s, 0);
});

test('tamanho, tirar o dinheiro e fechar', async () => {
  let v = await D.comp(); const till = v.mine.till;
  let r = await D.ag({ type: 'compSize' });
  if (till < C.size[2]) { assert.equal(r.body.error, 'NO_COMP_MONEY'); await D.ag({ type: 'compPut', amount: C.size[2] }); r = await D.ag({ type: 'compSize' }); }
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300)); assert.equal(r.body.result.slots, C.slots[2]);
  v = await D.comp(); const t2 = v.mine.till, bank0 = (await D.me()).bank;
  r = await D.ag({ type: 'compTake', amount: t2 + 1 }); assert.equal(r.body.error, 'BAD_AMOUNT');
  r = await D.ag({ type: 'compTake', amount: 1000 }); assert.equal(r.status, 200); assert.equal(r.body.me.bank, bank0 + 1000);
  r = await A.ag({ type: 'compTake', amount: 1 }); assert.equal(r.body.error, 'NOT_OWNER');
  // fechar: o caixa vai para o banco da dona e a Ana fica sem empresa
  r = await D.ag({ type: 'compClose' }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300)); assert.equal(r.body.result.back, t2 - 1000);
  assert.equal(r.body.me.emp, null); assert.equal((await A.me()).emp, null);
  assert.ok((await A.events()).some((e) => e.k === 'compOut' && e.why === 'closed'));
  v = await A.comp(); assert.equal(v.mine, null); assert.ok(!v.list.some((x) => x.name === 'Entregas Já'));
  // sobrevive a um reinício (a de advogados continua)
  await mexer({});
  v = await A.comp(); assert.equal(v.list.length, 1); assert.equal((await Z.me()).emp.own, true);
});
