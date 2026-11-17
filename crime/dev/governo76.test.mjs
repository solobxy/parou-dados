// v76 (pedido de 17/11, 03:39): o Estado no mesmo motor do mundo. Cofres, corrupção, popularidade, parlamento, leis e votações,
// a funcionar igual com poucos ou muitos jogadores. Corre com: node --test dev/governo76.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as M from '../engine/mundo.js';
import * as GV from '../engine/governo.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import { lisbonToUtc } from '../engine/time.js';

const T0 = Date.UTC(2026, 10, 17, 12);
const mercado = () => { const m = { ...E.newMarket(), hist: [] }; m.w = M.newWorld(m.prices, T0); return m; };
const fixo = (v) => ({ int: (a, b) => Math.min(b, Math.max(a, v)), chance: () => false, float: () => 0.5 });
const ind = { crime: 40, cof: 50, corr: 30, popu: 55 };

test('o Estado arranca com cofres a 50%, corrupção 30 e um parlamento de 230 lugares sem maioria', () => {
  const g = GV.newGov();
  assert.equal(GV.cofPct(g), CFG.gov.cof.startPct); assert.equal(g.corr, 30);
  const seats = Object.values(g.seats); assert.equal(seats.reduce((a, b) => a + b, 0), 230);
  assert.ok(seats.every((s) => s < CFG.gov.vote.majority), 'ninguém tem maioria sozinho');
});

test('cofres: sem impostos dos jogadores esvaziam devagar; com eles enchem. A corrupção vai atrás dos cofres vazios', () => {
  const a = mercado(), b = mercado(), rng = seededRng(2);
  for (let i = 1; i <= 30; i++) {
    M.runEdition(a, a.w.ed + 1, rng);
    M.accAdd(b.w, 'tax', 400 * M.popOf(b.w)); M.runEdition(b, b.w.ed + 1, rng);
  }
  assert.ok(GV.cofPct(a.w.gov) < CFG.gov.cof.startPct - 10, `sem impostos: ${GV.cofPct(a.w.gov)}%`);
  assert.ok(GV.cofPct(b.w.gov) > CFG.gov.cof.startPct, `com impostos: ${GV.cofPct(b.w.gov)}%`);
  assert.ok(a.w.gov.corr > b.w.gov.corr, 'mais corrupção com os cofres vazios');
  // cofres abaixo de 30%: menos polícia; acima de 80%: mais
  const g = GV.newGov(); g.cofPc = 0; assert.equal(GV.pressDelta(g), -CFG.gov.cof.pressStep);
  g.cofPc = 1e9; assert.equal(GV.pressDelta(g), CFG.gov.cof.pressStep);
});

test('uma proposta por dia: anunciada, contagem no jornal na edição antes, votada 4 edições depois e em vigor 2 depois de passar', () => {
  const m = mercado(), rng = seededRng(5), ed0 = m.w.ed;
  let arts = [];
  for (let i = 1; i <= 8; i++) { arts.push(...M.runEdition(m, ed0 + i, rng).arts.map((x) => ({ ...x, ed: ed0 + i }))); }
  const bill = arts.find((x) => x.k === 'govBill'), vote = arts.find((x) => x.k === 'govVote'), poll = arts.find((x) => x.k === 'govPoll');
  assert.ok(bill && vote && poll, JSON.stringify(arts.filter((x) => x.k.startsWith('gov')).map((x) => x.k)));
  assert.equal(vote.ed - bill.ed, CFG.gov.bill.voteEds); assert.equal(poll.ed, vote.ed - 1); assert.equal(vote.id, bill.id);
  assert.equal(vote.yes + vote.no, 230);
  if (vote.passed) {
    for (let i = 9; i <= 12; i++) arts.push(...M.runEdition(m, ed0 + i, rng).arts.map((x) => ({ ...x, ed: ed0 + i })));
    const law = arts.find((x) => x.k === 'govLaw' && x.id === vote.id);
    assert.ok(law && law.ed === vote.ed + CFG.gov.bill.effectEds, 'entra em vigor 2 edições depois');
    assert.equal(GV.lawOn(m.w.gov, vote.id), vote.on);
  }
});

test('a votação: posições, a rua e o dinheiro. O porte de arma chumba sem apoio da rua e passa com ela', () => {
  const g = GV.newGov(), bill = { id: 'armas', on: true, yes: 0, no: 0, ly: 0, ln: 0 };
  assert.equal(GV.countVotes(g, bill, ind, 8, null).passed, false, 'só a Ordem e o Mercado Livre: 95 lugares');
  const rua = { ...bill, yes: 200, no: 0 };   // a rua pede-o
  assert.equal(GV.countVotes(g, rua, ind, 8, null).passed, true, 'o governo segue a rua');
  // dinheiro: um lado com muito mais dinheiro empurra o Mercado Livre e o Centro; contra um valor que cresce com a gente
  const K = CFG.gov.vote.lobbyK * CFG.gov.vote.incomePc;
  assert.ok(Math.abs(GV.lobbyEffect({ ly: K * 8, ln: 0 }, 8) - 0.5) < 1e-9, 'pagar o valor fixo de 8 pessoas vale meio caminho');
  assert.ok(GV.lobbyEffect({ ly: K * 8, ln: 0 }, 10_000_000) < 0.001, 'o mesmo dinheiro num mundo de 10 milhões não mexe nada');
});

test('escala: a mesma rua e o mesmo dinheiro por cabeça dão o mesmo resultado com 100 ou com 10 milhões', () => {
  for (const id of GV.LAWS()) {
    const res = [100, 10_000, 10_000_000].map((N) => {
      const g = GV.newGov(), b = { id, on: true, yes: Math.round(N * 0.3), no: Math.round(N * 0.2), ly: 500 * N, ln: 100 * N };
      return GV.countVotes(g, b, ind, N + 5, null);
    });
    for (const r of res) { assert.equal(r.passed, res[2].passed, id); assert.ok(Math.abs(r.yes - res[2].yes) <= 0, `${id}: ${r.yes} contra ${res[2].yes}`); }
  }
});

test('as leis mexem nas regras: prisão, fiança, lavagem, turnos, casas, armas, erva e pressão; sem lei, tudo como antes', () => {
  const W = { start: T0 - T.DAY, playEnd: T0 + 1e10, press: 50 };
  const p = E.newPlayer('x', T0, W); p.respect = p.peakRespect = CFG.levels[29]; p.cash = 1e9;
  E.setGov(null);
  const casa0 = E.housePrice(p), job = CFG.jobs.list[0], turno0 = E.shiftPay(job, 1), arma = CFG.gear.find((g) => g.slot === 'mao');
  p.jailUntil = T0 + 10 * T.MIN; p.jailTier = 1; const fianca0 = E.bailCost(p, T0); p.jailUntil = 0;
  E.setGov({ laws: { penas: 1, luxo: 1, salario: 1, armas: 1, branq: 1 }, corr: 0 });
  assert.equal(E.housePrice(p), casa0 + Math.floor(casa0 / 10), 'casa +10%');
  assert.equal(E.shiftPay(job, 1), Math.floor(turno0 * 1.1), 'turno +10%');
  assert.equal(E.gearPrice(arma), Math.ceil(arma.price * 0.85), 'arma −15%');
  p.jailUntil = T0 + 10 * T.MIN; p.jailTier = 1;
  assert.equal(E.bailCost(p, T0), Math.max(1, Math.ceil(fianca0 * 1.5)), 'fiança ×1,5');
  E.setGov({ laws: {}, corr: 100 });
  assert.equal(E.bailCost(p, T0), Math.max(1, Math.ceil(fianca0 * 0.7)), 'corrupção 100: fiança −30%');
  E.setGov(null); assert.equal(E.bailCost(p, T0), fianca0, 'sem nada, como antes');
  // pressão e erva no mundo
  const m = mercado(), erva = CFG.drugs.findIndex((g) => g.id === 'erva'), d0 = M.demBp(m.w, 'lx', erva, T0), pr0 = M.pressOf(m.w, 'lx');
  m.w.gov.laws.policia = m.w.ed; m.w.gov.laws.erva = m.w.ed;
  assert.equal(M.pressOf(m.w, 'lx'), pr0 + CFG.gov.laws.policia.press);
  assert.equal(M.demBp(m.w, 'lx', erva, T0), Math.round((d0 * CFG.gov.laws.erva.priceBp) / 10000));
});

test('o mundo gravado antes do Estado ganha-o sem perder nada', () => {
  const m = mercado(); delete m.w.gov;
  M.worldUp(m.w); assert.equal(GV.cofPct(m.w.gov), CFG.gov.cof.startPct);
  M.runEdition(m, m.w.ed + 1, seededRng(1));
  assert.ok(Array.isArray(m.w.gov.hist) && m.w.gov.hist.length === 1);
});

test('o ecrã do parlamento só mostra a contagem do jornal na véspera da votação', () => {
  const m = mercado(), rng = seededRng(7);
  for (let i = 0; i < 40 && !(m.w.gov.bill && m.w.gov.bill.vote > m.w.ed + 1); i++) M.runEdition(m, m.w.ed + 1, rng);
  const b = m.w.gov.bill; assert.ok(b, 'há proposta');
  assert.equal(GV.govView(m.w, M.popOf(m.w), { crime: 40 }).bill.poll, null, 'longe da votação: sem contagem');
  while (m.w.ed + 1 < b.vote) M.runEdition(m, m.w.ed + 1, rng);
  const v = GV.govView(m.w, M.popOf(m.w), { crime: 40 });
  assert.ok(v.bill && v.bill.poll && v.bill.poll.lo <= v.bill.poll.yes && v.bill.poll.yes <= v.bill.poll.hi, 'na véspera: contagem com margem');
});
