// Passo 6 (mundo ligado), parte 2: regiões, mercado por região, armazéns, transporte e rusgas, no motor.
// Corre com: node --test dev/passo6b-motor.test.mjs   (dentro de crime/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../engine/config.js';
import * as M from '../engine/mundo.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';

const T0 = Date.UTC(2026, 10, 17, 12);   // terça, 12h em Lisboa (sem fim de semana nem verão)
const WORLD = { phase: 'play', start: T0 - 86_400_000, playEnd: T0 + 400 * 86_400_000 };
const D = (id) => CFG.drugs.findIndex((g) => g.id === id);
const COCA = D('coca'), HAX = D('haxixe'), ECS = D('ecstasy'), CERV = D('cerveja');
const mercado = (t = T0) => { const m = { ...E.newMarket(), hist: [] }; m.w = M.newWorld(m.prices, t); return m; };
const jogador = (nivel = 60, cash = 1_000_000) => { const p = E.newPlayer('x' + nivel, T0, WORLD); p.respect = p.peakRespect = CFG.levels[nivel - 1]; p.cash = cash; E.touch(p, T0); return p; };
const sempre = (sim) => ({ int: (a) => a, chance: () => sim, float: () => 0.5 });

test('Alentejo e Algarve: a criminalidade sobe com a atividade de lá, a pressão vai atrás, e acalmam sozinhos', () => {
  const m = mercado(), rng = seededRng(3), ed = m.w.ed;
  assert.equal(m.w.rg.al.crime, CFG.regions.crime.al.start); assert.equal(m.w.rg.ag.crime, CFG.regions.crime.ag.start);
  M.accAdd(m.w, 'al', 3000);   // 60 000 € de droga mexida no Alentejo numa edição
  M.runEdition(m, ed + 1, rng);
  const c1 = m.w.rg.al.crime;
  assert.ok(c1 > CFG.regions.crime.al.start + 10, 'subiu'); assert.equal(m.w.rg.al.press, CFG.regions.crime.al.start, 'a pressão ainda é a de antes');
  assert.equal(m.w.rg.ag.crime, CFG.regions.crime.ag.start, 'o Algarve não mexeu');
  M.runEdition(m, ed + 2, rng);
  assert.equal(m.w.rg.al.press, c1);
  for (let i = 3; i < 25; i++) M.runEdition(m, ed + i, rng);
  assert.ok(m.w.rg.al.crime <= CFG.regions.crime.al.floor + 1, 'volta à base');
  // um mundo gravado antes das regiões ganha-as sem perder nada
  const velho = mercado(); delete velho.w.rg; delete velho.w.mk; delete velho.w.ev; delete velho.w.acc.rg; velho.w.v = 1;
  M.runEdition(velho, velho.w.ed + 1, rng);
  assert.equal(velho.w.v, 2); assert.ok(velho.w.rg.al && velho.w.mk.ag.length === CFG.drugs.length);
});

test('mercado: grosso × procura × saturação; comprar sobe, vender desce, volta 5 por edição; ida e volta perde sempre', () => {
  const m = mercado(), rng = seededRng(4), p = jogador();
  E.whBuy(p, T0, WORLD, 'al');
  assert.equal(M.refC(COCA), 2800, 'coca: 35 € na rua, 28 € por grosso');
  assert.equal(Math.round(M.midC(m.w, 'al', COCA, T0)), Math.round(2800 * CFG.market.dem.al.coca / 10000), 'Alentejo: a coca chega a Sines');
  const n = 200, q = M.quoteC(m.w, 'al', COCA, n, 1, T0);
  const r = E.mktBuy(p, T0, WORLD, m, 'al', COCA, n, q.c);
  assert.equal(r.cost, Math.ceil(q.c / 100), 'paga-se o que o ecrã mostrou');
  assert.ok(m.w.mk.al[COCA] > 10000, 'a compra subiu o preço');
  // vender logo o mesmo, na mesma região: as duas margens de 10% e o empurrão no preço
  const v = E.mktSell(p, T0 + 1000, WORLD, m, 'al', COCA, n);
  assert.ok(v.got < r.cost * 0.82, 'perde perto de um quinto');
  assert.ok(Math.abs(m.w.mk.al[COCA] - 10000) < 1, 'comprar e vender o mesmo deixa o mercado como estava');
  // vender muito baixa o preço; em cada edição volta 5 pontos
  p.wh.al.s[COCA] = 3000; E.mktSell(p, T0 + 2000, WORLD, m, 'al', COCA, 3000);
  const s0 = m.w.mk.al[COCA]; assert.ok(s0 < 9000);
  M.runEdition(m, m.w.ed + 1, rng);
  assert.ok(Math.abs(m.w.mk.al[COCA] - (s0 + CFG.market.recBp)) < 1e-6);
  // o preço mudou mais de 1% desde que o ecrã o mostrou: não se faz
  assert.throws(() => E.mktBuy(p, T0 + 3000, WORLD, m, 'al', COCA, 10, 1), { code: 'PRICE_CHANGED' });
  // a droga de bar não se trafica
  assert.throws(() => E.mktBuy(p, T0 + 3000, WORLD, m, 'lx', CERV, 10), { code: 'NO_DRUG' });
});

test('procura: fim de semana e verão na droga de festa, e os acontecimentos de cada região', () => {
  const m = mercado(), base = M.demBp(m.w, 'ag', ECS, T0);
  assert.equal(base, CFG.market.dem.ag.festa);
  const sexta = Date.UTC(2026, 10, 20, 12), agosto = Date.UTC(2026, 7, 4, 12);   // sexta; terça de agosto
  assert.equal(M.demBp(m.w, 'ag', ECS, sexta), Math.round(base * (10000 + CFG.market.weekendBp) / 10000));
  assert.equal(M.demBp(m.w, 'ag', ECS, agosto), Math.round(base * (10000 + CFG.market.summer.bp) / 10000));
  assert.equal(M.demBp(m.w, 'lx', ECS, agosto), CFG.market.dem.lx.ecstasy, 'o verão só conta no Algarve');
  assert.equal(M.demBp(m.w, 'ag', HAX, sexta), CFG.market.dem.ag.haxixe, 'o fim de semana só mexe na droga de festa');
  // um festival no Algarve: ecstasy 30% mais cara durante 3 edições
  const rng = { int: (a) => a, chance: () => true, float: () => 0.5 };
  const ed = m.w.ed, arts = M.runEdition(m, ed + 1, rng).arts.filter((x) => x.k === 'rgEv');
  assert.ok(arts.some((x) => x.r === 'ag' && x.e === 'festival'));
  assert.equal(M.demBp(m.w, 'ag', ECS, T0), Math.round(base * 1.3));
  const calmo = { int: (a) => a, chance: () => false, float: () => 0.5 };
  M.runEdition(m, ed + 2, calmo); M.runEdition(m, ed + 3, calmo);
  assert.equal(M.demBp(m.w, 'ag', ECS, T0), Math.round(base * 1.3), 'ainda na terceira edição');
  M.runEdition(m, ed + 4, calmo);
  assert.equal(M.demBp(m.w, 'ag', ECS, T0), base, 'acabou');
});

test('armazéns: nível 10, preço por região, três melhorias até ao 5, e o espaço conta com o que vem a caminho', () => {
  const m = mercado(), p = jogador(9);
  assert.throws(() => E.whBuy(p, T0, WORLD, 'al'), { code: 'LOW_LEVEL' });
  const q = jogador(10, 100_000);
  assert.equal(E.whBuy(q, T0, WORLD, 'al').cost, CFG.wh.al.price);
  assert.throws(() => E.whBuy(q, T0, WORLD, 'al'), { code: 'WH_OWNED' });
  assert.equal(E.whCap(q, 'al'), CFG.wh.al.sp[0]); assert.equal(E.whCap(q, 'lx'), CFG.wh.lx.sp[0], 'Lisboa já é de todos');
  assert.equal(E.whUp(q, T0, WORLD, 'al', 'sp').cost, CFG.wh.al.spCost[1]);
  assert.equal(E.whCap(q, 'al'), CFG.wh.al.sp[1]);
  const r = jogador(60, 1e9); E.whBuy(r, T0, WORLD, 'ag');
  for (let i = 1; i < 5; i++) E.whUp(r, T0, WORLD, 'ag', 'hd');
  assert.throws(() => E.whUp(r, T0, WORLD, 'ag', 'hd'), { code: 'WH_MAX' });
  // comprar pede o nível da família; vender o que já se tem, não
  const baixo = jogador(24); E.whBuy(baixo, T0, WORLD, 'al');
  assert.throws(() => E.mktBuy(baixo, T0, WORLD, m, 'al', COCA, 10), { code: 'LOW_LEVEL' });
  baixo.wh.al.s[COCA] = 10; assert.ok(E.mktSell(baixo, T0, WORLD, m, 'al', COCA, 10).got > 0);
  // espaço: o de Lisboa enche, e o que vem a caminho já ocupa
  const t = jogador(60, 1e9); E.whBuy(t, T0, WORLD, 'ag');
  t.wh.ag.s[HAX] = 6000;
  E.mvSend(t, T0, WORLD, m, sempre(false), 'ag', 'lx', HAX, 6000);
  assert.equal(E.whFree(t, 'lx'), CFG.wh.lx.sp[0] - 6000, 'já conta antes de chegar');
  assert.throws(() => E.mktBuy(t, T0, WORLD, m, 'lx', HAX, CFG.wh.lx.sp[0] - 5999), { code: 'WH_FULL' });
});

test('transporte: 1 hora por salto, risco pela pressão, e o que acontece se a polícia apanha', () => {
  const m = mercado(), p = jogador(60, 1e7);
  E.whBuy(p, T0, WORLD, 'al'); E.whBuy(p, T0, WORLD, 'ag');
  m.w.lx.press = 40; m.w.rg.al.press = 60; m.w.rg.ag.press = 20;
  assert.equal(E.mvRiskBp(m.w, 'lx', 'al'), 500, 'pressões de 40 e 60: 5%');
  assert.equal(E.mvRiskBp(m.w, 'lx', 'ag'), 500 + 400, 'de Lisboa ao Algarve passa pelo Alentejo: soma os dois saltos');
  p.wh.al.s[HAX] = 1000; p.wh.al.s[ECS] = 1000; p.stock[COCA] = 1000;
  const a = E.mvSend(p, T0, WORLD, m, sempre(true), 'al', 'lx', HAX, 1000);
  assert.equal(a.at, T0 + CFG.mv.hopMs); assert.equal(a.risk, 500);
  E.mvSend(p, T0, WORLD, m, sempre(true), 'al', 'lx', ECS, 1000);
  assert.equal(E.mvSend(p, T0, WORLD, m, sempre(true), 'lx', 'ag', COCA, 1000).at, T0 + 2 * CFG.mv.hopMs, 'de Lisboa ao Algarve: 2 horas');
  assert.ok(E.mvView(p).every((x) => x.x === undefined), 'o ecrã não sabe o desfecho antes de chegar');
  const cash0 = p.cash;
  E.touch(p, T0 + CFG.mv.hopMs);
  assert.equal(p.stock[HAX], 1000, 'as leves pagam multa e seguem');
  assert.equal(cash0 - p.cash, Math.floor((1000 * M.refC(HAX) / 100) * CFG.wh.fineBp / 10000));
  assert.equal(p.stock[ECS], 0, 'a de festa fica apreendida');
  assert.equal(p.jailUntil, 0, 'sem prisão por leves nem festa');
  E.touch(p, T0 + 2 * CFG.mv.hopMs);
  assert.equal(p.wh.ag.s[COCA], 0, 'a pesada fica apreendida');
  assert.equal(p.jailUntil, T0 + 2 * CFG.mv.hopMs + CFG.wh.jailMin * 60_000, 'e dá prisão a contar da chegada');
  assert.equal(p.jailTier, E.DRUG_JAIL); assert.ok(E.bailCost(p, T0 + 2 * CFG.mv.hopMs) <= CFG.wh.lawyer);
  assert.equal(p.mvLog.length, 3); assert.deepEqual(p.mvLog.map((x) => x.x), [1, 2, 2]);
  assert.deepEqual(E.checkInvariants(p), []);
});

test('calor e rusgas: sobe com o que entra e sai, desce parado, e a rusga só leva metade do que está à vista', () => {
  const m = mercado(), p = jogador(60, 1e7);
  E.whBuy(p, T0, WORLD, 'al');
  const q = M.quoteC(m.w, 'al', COCA, 1000, 1, T0); E.mktBuy(p, T0, WORLD, m, 'al', COCA, 1000, q.c);
  // 28 000 € ao preço de grosso, com a fachada no nível 1 (−10%): +25,2 pontos de calor
  assert.equal(p.wh.al.h, Math.floor((28000 * 100 * 9000) / (1000 * 10000)));
  m.w.rg.al.press = 40;
  E.whEdition(p, m, T0, sempre(true));
  assert.equal(p.rz.length, 0, 'abaixo de pressão 50 não há rusgas');
  const h1 = p.wh.al.h;
  E.whEdition(p, m, T0, sempre(true));
  assert.equal(p.wh.al.h, h1 - 1000, 'parado, desce 10 por edição');
  for (let i = 0; i < 10; i++) E.whEdition(p, m, T0, sempre(false));
  const vis = E.whVisEur(p, 'al');
  assert.equal(p.wh.al.h, Math.floor((vis * 100 * 9000) / (10000 * 10000)), 'mas nunca abaixo de 1 por cada 10 000 € à vista');
  // pressão 80 e calor 50: 8%
  p.wh.al.h = 5000; m.w.rg.al.press = 80;
  assert.equal(E.raidBp(p, m.w, 'al'), 800);
  p.wh.al.s[HAX] = 2000; p.wh.al.s[ECS] = 1000;
  const cash0 = p.cash + p.bank;
  const [x] = E.whEdition(p, m, T0, sempre(true));
  // à vista: 90% de cada (o esconderijo do nível 1 esconde 10%)
  assert.equal(p.wh.al.s[COCA], 1000 - Math.floor(900 / 2)); assert.equal(p.wh.al.s[ECS], 1000 - 450); assert.equal(p.wh.al.s[HAX], 2000, 'as leves só dão multa');
  const visEur = (900 * 2800 + 900 * 560 + 1800 * 400) / 100;
  assert.equal(x.fine, Math.floor(visEur * CFG.wh.fineBp / 10000)); assert.equal(cash0 - p.cash - p.bank, x.fine);
  assert.ok(x.jail && p.jailUntil === T0 + CFG.wh.jailMin * 60_000, 'pesadas apreendidas: prisão');
  assert.equal(p.wh.al.h, Math.floor((E.whVisEur(p, 'al') * 100 * 9000) / (10000 * 10000)), 'depois da rusga, o calor volta ao que o stock à vista dá');
  // apreensão recorde: a criminalidade cai e a droga apreendida encarece
  m.w.rg.al.crime = 70; const s0 = m.w.mk.al[COCA]; M.recordSeizure(m.w, 'al', [COCA]);
  assert.equal(m.w.rg.al.crime, 60); assert.equal(m.w.mk.al[COCA], Math.min(CFG.market.satMax, s0 + CFG.market.record.satBp));
  assert.deepEqual(E.checkInvariants(p), []);
});

test('porto e aeroporto: a droga chega ao armazém da região do barco, e o que não cabe vende-se lá', () => {
  const m = mercado(), p = jogador(60, 1e7), lancha = CFG.port.ships.findIndex((s) => s.id === 'lancha');
  assert.throws(() => E.sendPort(p, T0, WORLD, lancha, 1000, true), { code: 'NO_WH' });
  E.whBuy(p, T0, WORLD, 'ag');
  E.sendPort(p, T0, WORLD, lancha, 1000, true);
  const r = E.openPort(p, T0 + 2 * 3600_000, WORLD, sempre(false), p.port[0].readyAt, m);
  assert.equal(r.item.rg, 'ag'); assert.ok(r.item.units > 0); assert.equal(p.wh.ag.s[HAX], r.item.units, 'o haxixe chega de lancha ao Algarve');
  assert.equal(p.stock[HAX], 0);
  // não cabe: o resto vende-se ao mercado de lá
  const ferry = CFG.port.ships.findIndex((s) => s.id === 'ferry');
  p.stock[COCA] = CFG.wh.lx.sp[0] - 10;
  E.sendPort(p, T0 + 3 * 3600_000, WORLD, ferry, 1000, true);
  const c = p.cash, f = E.openPort(p, T0 + 9 * 3600_000, WORLD, sempre(false), p.port[0].readyAt, m).item;
  assert.equal(f.rg, 'lx'); assert.equal(f.units, 10); assert.ok(f.over > 0 && f.overGot > 0); assert.equal(p.cash - c, f.rest + f.overGot);
  assert.ok(m.w.mk.lx[ECS] < 10000, 'a venda empurrou o preço de lá');
  assert.deepEqual(E.checkInvariants(p), []);
});

test('quem já jogava fica com o armazém de Lisboa e o stock que tinha', () => {
  const p = jogador(30); p.stock[COCA] = 50000;   // mais do que cabe: fica, só não entra mais
  delete p.wh; delete p.mv; delete p.mvLog; delete p.rz;
  E.touch(p, T0 + 1000);
  assert.ok(p.wh.lx && p.wh.lx.sp === 1 && p.wh.al === null && p.wh.ag === null);
  assert.equal(p.stock[COCA], 50000); assert.equal(E.whFree(p, 'lx'), 0);
  assert.deepEqual(E.checkInvariants(p), []);
});
