// v119: VIP e créditos, prontos por dentro e fechados para compra («Em breve»). No motor: a stamina a mais e mais depressa com VIP, o
// fim do VIP, o que os créditos compram. Na API: dar créditos só com a chave de administração (e nunca duas vezes o mesmo pagamento),
// gastar créditos tira da carteira da conta, a compra com dinheiro responde «Em breve». Corre com: node --test dev/vip119.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { lisbonToUtc } from '../engine/time.js';

const V = CFG.vip, TOKEN = 'teste-' + 'x'.repeat(30);
const START = lisbonToUtc(2026, 11, 20, 23);
const world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const mk = () => { const p = E.newPlayer('v' + Math.random(), START, world); p.cash = 1e5; p.respect = 5000; p.peakRespect = 5000; return p; };
const erro = (f, code) => assert.throws(f, (e) => e.code === code, code);

test('VIP: +20% de stamina máxima, enche 25% mais depressa; ao acabar a stamina a mais vai-se', () => {
  const p = mk(), base = E.energyMax(p);
  E.vipAdd(p, START, world, 7);
  assert.equal(E.energyMax(p), base + Math.floor((base * V.emaxBp) / 10000));
  assert.ok(E.energyRegenMs(p) < CFG.energy.regenMs);
  p.energy = 0; E.touch(p, START + 60 * CFG.energy.regenMs);
  assert.ok(p.energy > 60, 'enche mais depressa do que sem VIP');
  E.vipAdd(p, START + 3 * T.HOUR, world, 7);   // soma-se ao que falta
  assert.equal(p.vip, START + 14 * T.DAY);
  p.energy = E.energyMax(p);
  E.touch(p, START + 15 * T.DAY);
  assert.equal(p.vipOn, false); assert.equal(p.energy, base);
});

test('o que os créditos compram: encher a stamina (3 por dia), sair da prisão, sair do hospital', () => {
  const p = mk(); p.energy = 0;
  const r = E.crRefill(p, START, world);
  assert.equal(p.energy, E.energyMax(p)); assert.equal(r.left, 2);
  erro(() => E.crRefill(p, START + 1, world), 'ENERGY_FULL');
  p.energy = 0; E.crRefill(p, START + 2, world); p.energy = 0; E.crRefill(p, START + 3, world); p.energy = 0;
  erro(() => E.crRefill(p, START + 4, world), 'CR_DAY');
  p.energy = 0; p.energyT = START + T.DAY; E.crRefill(p, START + T.DAY, world);   // no dia seguinte há outras 3
  const q = mk(); q.jailUntil = START + T.HOUR; q.jailTier = 1;
  E.crJail(q, START, world); assert.equal(q.jailUntil, 0);
  erro(() => E.crJail(q, START + 1, world), 'NOT_IN_JAIL');
  const h = mk(); h.hospUntil = START + T.HOUR;
  E.crHosp(h, START, world); assert.equal(h.hospUntil, 0);
  erro(() => E.crHosp(h, START + 1, world), 'NOT_IN_HOSPITAL');
  // sair já: no máximo 2 por dia, prisão e hospital juntos
  q.hospUntil = START + T.HOUR; E.crHosp(q, START + 2, world);
  q.jailUntil = START + T.HOUR; q.jailTier = 1; erro(() => E.crJail(q, START + 3, world), 'CR_DAY');
});

// ---------- na API ----------
const AQUI = dirname(fileURLToPath(import.meta.url)), TESTE = join(AQUI, '..', 'test');
const PORT = 5100 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
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
    env: { ...process.env, PORT: String(PORT), DATA: dir, COOKIE_INSEGURO: '1', ADMIN_TOKEN: TOKEN, PRIMEIRA_RONDA: RONDA, TESTE_DESVIO_MS: String(DESVIO), ATOS_3S: '100000', ATOS_MIN: '1000000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => { const s = String(d); if (!s.includes('ExperimentalWarning') && !s.includes('trace-warnings')) process.stderr.write(s); });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/api/saude')).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('servidor não arrancou');
}
async function parar() { srv.kill(); await new Promise((r) => srv.once('exit', r)); }
async function mexer(jog = {}) {
  await parar();
  const db = new DatabaseSync(join(dir, 'jogo.db'));
  for (const [nome, fn] of Object.entries(jog)) {
    const id = db.prepare('SELECT id FROM contas WHERE nome = ?').get(nome).id, row = db.prepare('SELECT ronda, estado FROM jogadores WHERE conta = ?').get(id);
    const e = JSON.parse(row.estado); fn(e); db.prepare('UPDATE jogadores SET estado = ? WHERE conta = ? AND ronda = ?').run(JSON.stringify(e), id, row.ronda);
  }
  db.close(); await arrancar();
}
let ipN = 0;
async function conta(nome) {
  const ip = '10.16.0.' + ++ipN;
  const r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ name: nome, password: 'segredo123', email: nome.toLowerCase() + '@teste.pt' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const get = async (p) => (await fetch(BASE + p, { headers: { cookie, 'X-Forwarded-For': ip } })).json();
  const ag = async (body) => { const x = await fetch(BASE + '/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': ip }, body: JSON.stringify(body) }); return { status: x.status, body: await x.json() }; };
  await get('/api/state');
  return { nome, ag, get, me: async () => (await get('/api/state')).me };
}
before(async () => { dir = mkdtempSync(join(tmpdir(), 'vip-')); await arrancar(); });
after(async () => { await parar(); rmSync(dir, { recursive: true, force: true }); });


test('API: dar créditos só com a chave; o mesmo pagamento não dá duas vezes; gastar tira da carteira; comprar diz «Em breve»', async () => {
  const A = await conta('Ana');
  const dar = (body, tok = TOKEN) => fetch(BASE + '/api/admin/creditos', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': tok }, body: JSON.stringify(body) });
  assert.equal((await dar({ name: 'Ana', n: 600, ref: 'p1' }, 'errada-' + 'y'.repeat(30))).status, 404, 'sem a chave certa não existe');
  let r = await (await dar({ name: 'Ana', n: 600, ref: 'p1', motivo: 'teste' })).json();
  assert.equal(r.saldo, 600); assert.equal(r.dup, false);
  r = await (await dar({ name: 'Ana', n: 600, ref: 'p1' })).json();
  assert.equal(r.dup, true); assert.equal(r.saldo, 600, 'o mesmo pagamento não conta duas vezes');
  assert.equal((await dar({ name: 'Ana', n: V.grantMax + 1, ref: 'p2' })).status, 400);
  let me = await A.me();
  assert.equal(me.cr, 600); assert.equal(me.vipOn, false);
  const base = me.energyMax;
  let x = await A.ag({ type: 'crSpend', id: 'vip30' });
  assert.equal(x.status, 200, JSON.stringify(x.body).slice(0, 200)); assert.equal(x.body.result.saldo, 200);
  me = await A.me();
  assert.equal(me.cr, 200); assert.ok(me.vipOn); assert.equal(me.energyMax, base + Math.floor((base * V.emaxBp) / 10000));
  x = await A.ag({ type: 'crSpend', id: 'vip30' }); assert.equal(x.body.error, 'NO_CREDITS');
  x = await A.ag({ type: 'crSpend', id: 'nada' }); assert.equal(x.body.error, 'NO_ITEM');
  const buy = await fetch(BASE + '/api/vip/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(buy.status, 403); assert.equal((await buy.json()).error, 'SOON');
  assert.ok((await A.get('/api/config')).vip.packs.length >= 3);
  const pf = await A.get('/api/profile?n=Ana'); assert.equal(pf.vip, true);
});
