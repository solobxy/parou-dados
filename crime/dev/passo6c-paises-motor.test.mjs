// Passo 6 (mundo ligado): países (16/11/2026; eram as regiões de Portugal da parte 2), mercado por país, armazéns, transporte,
// rusgas, o país onde se vive e emigrar, no motor. 'lx' é Portugal; 'co' a Colômbia; 'ma' Marrocos; 'nl' a Holanda.
// Corre com: node --test dev/passo6c-paises-motor.test.mjs   (dentro de crime/)
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
const jogador = (nivel = 60, cash = 1_000_000) => { const p = E.newPlayer('x' + nivel, T0, WORLD); p.homeSet = true; p.respect = p.peakRespect = CFG.levels[nivel - 1]; p.cash = cash; E.touch(p, T0); return p; };
const sempre = (sim) => ({ int: (a) => a, chance: () => sim, float: () => 0.5 });

test('países: a criminalidade sobe com a atividade de lá, a pressão vai atrás, e acalmam sozinhos; o mundo antigo perde o Alentejo e o Algarve', () => {
  const m = mercado(), rng = seededRng(3), ed = m.w.ed;
  assert.equal(M.REG().length, 8);
  assert.equal(m.w.rg.co.crime, CFG.regions.crime.co.start); assert.equal(m.w.rg.ma.crime, CFG.regions.crime.ma.start);
  M.accAdd(m.w, 'co', 3000);   // 60 000 € de droga mexida na Colômbia numa edição
  M.runEdition(m, ed + 1, rng);
  const c1 = m.w.rg.co.crime;
  assert.ok(c1 > CFG.regions.crime.co.start + 10, 'subiu'); assert.equal(m.w.rg.co.press, CFG.regions.crime.co.start, 'a pressão ainda é a de antes');
  assert.equal(m.w.rg.ma.crime, CFG.regions.crime.ma.start, 'Marrocos não mexeu');
  M.runEdition(m, ed + 2, rng);
  assert.equal(m.w.rg.co.press, c1);
  for (let i = 3; i < 25; i++) M.runEdition(m, ed + i, rng);
  assert.ok(m.w.rg.co.crime <= CFG.regions.crime.co.floor + 1, 'volta à base');
  // um mundo gravado antes das regiões ganha os países; o das regiões perde o Alentejo e o Algarve
  const velho = mercado(); delete velho.w.rg; delete velho.w.mk; delete velho.w.ev; delete velho.w.acc.rg; velho.w.v = 1;
  M.runEdition(velho, velho.w.ed + 1, rng);
  assert.equal(velho.w.v, M.WORLD_V); assert.ok(velho.w.rg.co && velho.w.mk.ma.length === CFG.drugs.length);
  const v2 = mercado(); v2.w.v = 2; v2.w.rg.al = { crime: 40, press: 40, hist: [] }; v2.w.mk.ag = CFG.drugs.map(() => 9000); v2.w.acc.rg.al = 5; v2.w.ev.push({ r: 'ag', k: 'festival', d: ECS, bp: 3000, ed0: ed, ed1: ed + 2 });
  M.worldUp(v2.w);
  assert.equal(v2.w.v, M.WORLD_V); assert.ok(!('al' in v2.w.rg) && !('ag' in v2.w.mk) && !('al' in v2.w.acc.rg) && v2.w.ev.length === 0);
});

test('mercado: grosso × procura × saturação; comprar sobe, vender desce, volta 5 por edição; ida e volta perde sempre', () => {
  const m = mercado(), rng = seededRng(4), p = jogador();
  E.whBuy(p, T0, WORLD, 'co');
  assert.equal(M.refC(COCA), 2800, 'coca: 35 € na rua, 28 € por grosso');
  assert.equal(Math.round(M.midC(m.w, 'co', COCA, T0)), Math.round(2800 * CFG.market.dem.co.coca / 10000), 'Colômbia: a coca nasce lá');
  const n = 200, q = M.quoteC(m.w, 'co', COCA, n, 1, T0);
  const r = E.mktBuy(p, T0, WORLD, m, 'co', COCA, n, q.c);
  assert.equal(r.cost, Math.ceil(q.c / 100), 'paga-se o que o ecrã mostrou');
  assert.ok(m.w.mk.co[COCA] > 10000, 'a compra subiu o preço');
  // vender logo o mesmo, na mesma região: as duas margens de 10% e o empurrão no preço
  const v = E.mktSell(p, T0 + 1000, WORLD, m, 'co', COCA, n);
  assert.ok(v.got < r.cost * 0.82, 'perde perto de um quinto');
  assert.ok(Math.abs(m.w.mk.co[COCA] - 10000) < 1, 'comprar e vender o mesmo deixa o mercado como estava');
  // vender muito baixa o preço; em cada edição volta 5 pontos
  p.wh.co.s[COCA] = 3000; E.mktSell(p, T0 + 2000, WORLD, m, 'co', COCA, 3000);
  const s0 = m.w.mk.co[COCA]; assert.ok(s0 < 9000);
  M.runEdition(m, m.w.ed + 1, rng);
  assert.ok(Math.abs(m.w.mk.co[COCA] - (s0 + CFG.market.recBp)) < 1e-6);
  // o preço mudou mais de 1% desde que o ecrã o mostrou: não se faz
  assert.throws(() => E.mktBuy(p, T0 + 3000, WORLD, m, 'co', COCA, 10, 1), { code: 'PRICE_CHANGED' });
  // a droga de bar não se trafica
  assert.throws(() => E.mktBuy(p, T0 + 3000, WORLD, m, 'lx', CERV, 10), { code: 'NO_DRUG' });
});

test('procura: fim de semana e verão na droga de festa, e os acontecimentos de cada região', () => {
  const m = mercado(), base = M.demBp(m.w, 'lx', ECS, T0);
  assert.equal(base, CFG.market.dem.lx.festa);
  const sexta = Date.UTC(2026, 10, 20, 12), agosto = Date.UTC(2026, 7, 4, 12);   // sexta; terça de agosto
  assert.equal(M.demBp(m.w, 'lx', ECS, sexta), Math.round(base * (10000 + CFG.market.weekendBp) / 10000));
  assert.equal(M.demBp(m.w, 'lx', ECS, agosto), Math.round(base * (10000 + CFG.market.summer.bp) / 10000), 'verão em Portugal (o Algarve)');
  assert.equal(M.demBp(m.w, 'de', ECS, agosto), CFG.market.dem.de.festa, 'o verão só conta em Portugal');
  assert.equal(M.demBp(m.w, 'ma', HAX, sexta), CFG.market.dem.ma.haxixe, 'o fim de semana só mexe na droga de festa');
  // um festival na Holanda: ecstasy 30% mais cara durante 3 edições
  const nl0 = M.demBp(m.w, 'nl', ECS, T0);
  assert.equal(nl0, CFG.market.dem.nl.ecstasy, 'Roterdão: o ecstasy sai barato');
  const rng = { int: (a) => a, chance: () => true, float: () => 0.5 };
  const ed = m.w.ed, arts = M.runEdition(m, ed + 1, rng).arts.filter((x) => x.k === 'rgEv');
  assert.ok(arts.some((x) => x.r === 'nl' && x.e === 'festival'));
  assert.equal(M.demBp(m.w, 'nl', ECS, T0), Math.round(nl0 * 1.3));
  const calmo = { int: (a) => a, chance: () => false, float: () => 0.5 };
  M.runEdition(m, ed + 2, calmo); M.runEdition(m, ed + 3, calmo);
  assert.equal(M.demBp(m.w, 'nl', ECS, T0), Math.round(nl0 * 1.3), 'ainda na terceira edição');
  M.runEdition(m, ed + 4, calmo);
  assert.equal(M.demBp(m.w, 'nl', ECS, T0), nl0, 'acabou');
});

test('armazéns: nível 10, preço pelo país, três melhorias até ao 5, e o espaço conta com o que vem a caminho', () => {
  const m = mercado(), p = jogador(9);
  assert.throws(() => E.whBuy(p, T0, WORLD, 'co'), { code: 'LOW_LEVEL' });
  const q = jogador(10, 100_000);
  assert.equal(E.whBuy(q, T0, WORLD, 'co').cost, Math.round(CFG.wh.abroad.price * CFG.countries.co.wh / 10000), 'na Colômbia é barato');
  assert.equal(E.whPrice('jp'), Math.round(CFG.wh.abroad.price * CFG.countries.jp.wh / 10000)); assert.ok(E.whPrice('jp') > E.whPrice('co'));
  assert.throws(() => E.whBuy(q, T0, WORLD, 'co'), { code: 'WH_OWNED' });
  assert.throws(() => E.whBuy(q, T0, WORLD, 'lx'), { code: 'NO_REGION' }, 'o de casa já é dele');
  assert.equal(E.whCap(q, 'co'), CFG.wh.abroad.sp[0]); assert.equal(E.whCap(q, 'lx'), CFG.wh.home.sp[0], 'o de casa é de todos');
  assert.equal(E.whUp(q, T0, WORLD, 'co', 'sp').cost, Math.round(CFG.wh.abroad.spCost[1] * CFG.countries.co.wh / 10000));
  assert.equal(E.whCap(q, 'co'), CFG.wh.abroad.sp[1]);
  const r = jogador(60, 1e9); E.whBuy(r, T0, WORLD, 'ma');
  for (let i = 1; i < 5; i++) E.whUp(r, T0, WORLD, 'ma', 'hd');
  assert.throws(() => E.whUp(r, T0, WORLD, 'ma', 'hd'), { code: 'WH_MAX' });
  // comprar pede o nível da família; vender o que já se tem, não
  const baixo = jogador(24); E.whBuy(baixo, T0, WORLD, 'co');
  assert.throws(() => E.mktBuy(baixo, T0, WORLD, m, 'co', COCA, 10), { code: 'LOW_LEVEL' });
  baixo.wh.co.s[COCA] = 10; assert.ok(E.mktSell(baixo, T0, WORLD, m, 'co', COCA, 10).got > 0);
  // espaço: o de casa enche, e o que vem a caminho já ocupa
  const t = jogador(60, 1e9); E.whBuy(t, T0, WORLD, 'ma');
  t.wh.ma.s[HAX] = 6000;
  E.mvSend(t, T0, WORLD, m, sempre(false), 'ma', 'lx', HAX, 6000);
  assert.equal(E.whFree(t, 'lx'), CFG.wh.home.sp[0] - 6000, 'já conta antes de chegar');
  assert.throws(() => E.mktBuy(t, T0, WORLD, m, 'lx', HAX, CFG.wh.home.sp[0] - 5999), { code: 'WH_FULL' });
});

test('transporte: as horas da rota, risco pela pressão, um controlo por cada 6 h e a polícia de chegada, e o que acontece se a polícia apanha', () => {
  const m = mercado(), p = jogador(60, 1e7), H = 3600_000;
  E.whBuy(p, T0, WORLD, 'co'); E.whBuy(p, T0, WORLD, 'ma');
  m.w.lx.press = 40; m.w.rg.co.press = 60; m.w.rg.ma.press = 20;
  assert.equal(E.routeH('lx', 'co'), 12); assert.equal(E.routeH('co', 'lx'), 12); assert.equal(E.mvLegs('lx', 'co'), 2); assert.equal(E.routeH('lx', 'ma'), 2); assert.equal(E.mvLegs('lx', 'ma'), 1);
  assert.equal(E.mvRiskBp(m.w, 'co', 'lx'), 500 * 2, 'pressões de 40 e 60: 5% por controlo, dois controlos, polícia portuguesa normal');
  assert.equal(E.mvRiskBp(m.w, 'lx', 'co'), Math.floor(1000 * CFG.countries.co.police / 10000), 'a chegar à Colômbia: a polícia de lá é mais branda');
  assert.equal(E.mvRiskBp(m.w, 'lx', 'ma'), Math.floor(300 * CFG.countries.ma.police / 10000));
  p.wh.co.s[HAX] = 1000; p.wh.co.s[ECS] = 1000; p.stock[COCA] = 1000;
  const a = E.mvSend(p, T0, WORLD, m, sempre(true), 'co', 'lx', HAX, 1000);
  assert.equal(a.at, T0 + 12 * H); assert.equal(a.risk, 1000);
  E.mvSend(p, T0, WORLD, m, sempre(true), 'co', 'lx', ECS, 1000);
  assert.equal(E.mvSend(p, T0, WORLD, m, sempre(true), 'lx', 'ma', COCA, 1000).at, T0 + 2 * H, 'de Portugal a Marrocos: 2 horas');
  assert.ok(E.mvView(p).every((x) => x.x === undefined), 'o ecrã não sabe o desfecho antes de chegar');
  E.touch(p, T0 + 2 * H);
  assert.equal(p.wh.ma.s[COCA], 0, 'a pesada fica apreendida');
  assert.equal(p.jailUntil, T0 + 2 * H + CFG.wh.jailMin * 60_000, 'e dá prisão a contar da chegada');
  assert.equal(p.jailTier, E.DRUG_JAIL); assert.ok(E.bailCost(p, T0 + 2 * H) <= CFG.wh.lawyer);
  const cash0 = p.cash;
  E.touch(p, T0 + 12 * H);
  assert.equal(p.stock[HAX], 1000, 'as leves pagam multa e seguem');
  assert.equal(cash0 - p.cash, Math.floor((1000 * M.refC(HAX) / 100) * CFG.wh.fineBp / 10000));
  assert.equal(p.stock[ECS], 0, 'a de festa fica apreendida');
  assert.equal(p.mvLog.length, 3); assert.deepEqual(p.mvLog.map((x) => x.x), [2, 1, 2]);
  assert.deepEqual(E.checkInvariants(p), []);
});

test('calor e rusgas: sobe com o que entra e sai, desce parado, e a rusga só leva metade do que está à vista', () => {
  const m = mercado(), p = jogador(60, 1e7);
  E.whBuy(p, T0, WORLD, 'co');
  const q = M.quoteC(m.w, 'co', COCA, 1000, 1, T0); E.mktBuy(p, T0, WORLD, m, 'co', COCA, 1000, q.c);
  // 28 000 € ao preço de grosso, com a fachada no nível 1 (−10%): +25,2 pontos de calor
  assert.equal(p.wh.co.h, Math.floor((28000 * 100 * 9000) / (1000 * 10000)));
  m.w.rg.co.press = 40;
  E.whEdition(p, m, T0, sempre(true));
  assert.equal(p.rz.length, 0, 'abaixo de pressão 50 não há rusgas');
  const h1 = p.wh.co.h;
  E.whEdition(p, m, T0, sempre(true));
  assert.equal(p.wh.co.h, h1 - 1000, 'parado, desce 10 por edição');
  for (let i = 0; i < 10; i++) E.whEdition(p, m, T0, sempre(false));
  const vis = E.whVisEur(p, 'co');
  assert.equal(p.wh.co.h, Math.floor((vis * 100 * 9000) / (10000 * 10000)), 'mas nunca abaixo de 1 por cada 10 000 € à vista');
  // pressão 80 e calor 50: 8%
  p.wh.co.h = 5000; m.w.rg.co.press = 80;
  assert.equal(E.raidBp(p, m.w, 'co'), Math.floor(800 * CFG.countries.co.police / 10000), 'pressão 80 e calor 50: 8%, vezes a polícia de lá');
  p.wh.co.s[HAX] = 2000; p.wh.co.s[ECS] = 1000;
  const cash0 = p.cash + p.bank;
  const [x] = E.whEdition(p, m, T0, sempre(true));
  // à vista: 90% de cada (o esconderijo do nível 1 esconde 10%)
  assert.equal(p.wh.co.s[COCA], 1000 - Math.floor(900 / 2)); assert.equal(p.wh.co.s[ECS], 1000 - 450); assert.equal(p.wh.co.s[HAX], 2000, 'as leves só dão multa');
  const visEur = (900 * 2800 + 900 * 560 + 1800 * 400) / 100;
  assert.equal(x.fine, Math.floor(visEur * CFG.wh.fineBp / 10000)); assert.equal(cash0 - p.cash - p.bank, x.fine);
  assert.ok(x.jail && p.jailUntil === T0 + CFG.wh.jailMin * 60_000, 'pesadas apreendidas: prisão');
  assert.equal(p.wh.co.h, Math.floor((E.whVisEur(p, 'co') * 100 * 9000) / (10000 * 10000)), 'depois da rusga, o calor volta ao que o stock à vista dá');
  // apreensão recorde: a criminalidade cai e a droga apreendida encarece
  m.w.rg.co.crime = 70; const s0 = m.w.mk.co[COCA]; M.recordSeizure(m.w, 'co', [COCA]);
  assert.equal(m.w.rg.co.crime, 60); assert.equal(m.w.mk.co[COCA], Math.min(CFG.market.satMax, s0 + CFG.market.record.satBp));
  assert.deepEqual(E.checkInvariants(p), []);
});

test('porto e aeroporto: a droga chega ao armazém de casa, com o risco do porto do país, e o que não cabe vende-se lá', () => {
  const m = mercado(), p = jogador(60, 1e7), lancha = CFG.port.ships.findIndex((s) => s.id === 'lancha');
  E.sendPort(p, T0, WORLD, lancha, 1000, true);
  const r = E.openPort(p, T0 + 2 * 3600_000, WORLD, sempre(false), p.port[0].readyAt, m);
  assert.equal(r.item.rg, 'lx'); assert.ok(r.item.units > 0); assert.equal(p.stock[HAX], r.item.units, 'o barco descarrega no país onde se vive');
  const jp = jogador(60); jp.home = 'jp';
  assert.equal(E.portSeizeBp(jp, lancha), Math.floor(E.portSeizeBp(p, lancha) * CFG.countries.jp.police / 10000) >= 0 ? Math.min(9500, Math.floor(E.portSeizeBp(p, lancha) * CFG.countries.jp.port / 10000)) : 0, 'o porto japonês apanha mais');
  // não cabe: o resto vende-se ao mercado de lá
  const ferry = CFG.port.ships.findIndex((s) => s.id === 'ferry');
  p.stock[HAX] = 0; p.stock[COCA] = CFG.wh.home.sp[0] - 10;
  E.sendPort(p, T0 + 3 * 3600_000, WORLD, ferry, 1000, true);
  const c = p.cash, f = E.openPort(p, T0 + 9 * 3600_000, WORLD, sempre(false), p.port[0].readyAt, m).item;
  assert.equal(f.rg, 'lx'); assert.equal(f.units, 10); assert.ok(f.over > 0 && f.overGot > 0); assert.equal(p.cash - c, f.rest + f.overGot);
  assert.ok(m.w.mk.lx[ECS] < 10000, 'a venda empurrou o preço de lá');
  assert.deepEqual(E.checkInvariants(p), []);
});

test('quem já jogava fica a viver em Portugal; o Alentejo e o Algarve passam para casa e o preço volta em dinheiro', () => {
  const p = jogador(30); p.stock[COCA] = 50000;   // mais do que cabe: fica, só não entra mais
  delete p.wh; delete p.mv; delete p.mvLog; delete p.rz; delete p.home; delete p.homeSet; delete p.emAt; delete p.travelUntil;
  E.touch(p, T0 + 1000);
  assert.ok(p.wh.lx && p.wh.lx.sp === 1 && p.wh.co === null && !('al' in p.wh));
  assert.equal(p.home, 'lx'); assert.equal(p.homeSet, true);
  assert.equal(p.stock[COCA], 50000); assert.equal(E.whFree(p, 'lx'), 0);
  assert.deepEqual(E.checkInvariants(p), []);
  // com armazém no Alentejo (nível 2 de espaço) e no Algarve, e uma carga a caminho do Algarve
  const q = jogador(30); q.cash = 0;
  q.wh = { lx: { sp: 1, hd: 1, fr: 1, h: 0, f: 0 }, al: { sp: 2, hd: 1, fr: 2, h: 0, f: 0, s: CFG.drugs.map((_, d) => (d === COCA ? 700 : 0)) }, ag: { sp: 1, hd: 1, fr: 1, h: 0, f: 0, s: CFG.drugs.map((_, d) => (d === HAX ? 300 : 0)) } };
  q.mv = [{ d: HAX, n: 50, a: 'lx', b: 'ag', t0: T0, at: T0 + 3600_000, risk: 0, x: 0 }]; q.mvLog = [{ d: HAX, n: 1, a: 'al', b: 'lx', at: T0, x: 0, fine: 0, jail: false, v: 1 }]; q.rz = [];
  delete q.home; delete q.homeSet;
  E.touch(q, T0 + 1000);
  assert.ok(!('al' in q.wh) && !('ag' in q.wh)); assert.equal(q.stock[COCA], 700); assert.equal(q.stock[HAX], 350);
  assert.equal(q.cash, 30000 + 20000 + 20000 + 50000, 'Alentejo (30 000 + espaço 20 000 + fachada 20 000) e Algarve (50 000)');
  assert.equal(q.mv.length, 0); assert.equal(q.mvLog.length, 0);
  assert.deepEqual(E.checkInvariants(q), []);
});

test('o país onde se vive: escolhe-se uma vez ao começar; a rua, os negócios, as armas e a bolsa seguem o país; emigrar custa e leva tempo', () => {
  const m = mercado(), H = 3600_000;
  const p = E.newPlayer('novo', T0, WORLD); E.touch(p, T0);
  assert.equal(p.home, 'lx'); assert.equal(p.homeSet, false);
  assert.throws(() => E.emigrate(p, T0, WORLD, 'de'), { code: 'HOME_UNSET' });
  assert.throws(() => E.chooseHome(p, T0, WORLD, 'xx'), { code: 'NO_REGION' });
  assert.deepEqual(E.chooseHome(p, T0, WORLD, 'co'), { ok: true, r: 'co' });
  assert.equal(p.home, 'co'); assert.ok(p.wh.co && p.wh.co.s === undefined, 'o armazém de casa é na Colômbia, de graça'); assert.equal(p.wh.lx, null, 'e não fica um de graça em Portugal');
  assert.throws(() => E.chooseHome(p, T0, WORLD, 'jp'), { code: 'HOME_SET' });
  assert.deepEqual(E.checkInvariants(p), []);
  // a polícia do país mexe na hipótese de ser apanhado; as armas, no preço; os negócios, no rendimento; a bolsa, na comissão
  const pt = jogador(30), jp = jogador(30); jp.home = 'jp';
  assert.equal(E.bustChanceBp(jp, T0, 50), Math.min(9500, Math.floor(E.bustChanceBp(pt, T0, 50) * CFG.countries.jp.police / 10000)));
  assert.equal(E.armsPrice(jp, 1000), 2500); assert.equal(E.armsPrice(pt, 1000), 1000);
  pt.biz[0].n = 1; jp.biz[0].n = 1; pt.stats = { ...jp.stats };
  assert.ok(E.bizRates(jp, 0).perH > E.bizRates(pt, 0).perH, 'no Japão os negócios rendem mais');
  assert.ok(E.stockQuote(m, 0, 100, jp) < E.stockQuote(m, 0, 100, pt), 'e a comissão é metade');
  // emigrar: custa 5 000 € ou 3%, perde 5% do respeito (o nível não desce), viaja as horas da rota e o stock de casa fica no país antigo
  const e = jogador(40, 1_000_000); e.stock[COCA] = 100; const resp = e.respect, lvl = E.level(e);
  const r = E.emigrate(e, T0, WORLD, 'de');
  assert.equal(r.cost, 30000); assert.equal(e.cash, 1_000_000 - 30000); assert.equal(r.lost, Math.floor(resp * CFG.emigrate.respBp / 10000)); assert.equal(E.level(e), lvl);
  assert.equal(e.home, 'de'); assert.equal(e.travelUntil, T0 + E.routeH('lx', 'de') * H); assert.equal(e.wh.lx.s[COCA], 100); assert.equal(e.stock[COCA], 0);
  assert.throws(() => E.doCrime(e, T0 + H, WORLD, 0, sempre(true)), { code: 'TRAVELING' });
  { const atk = jogador(41); atk.shieldUntil = 0; e.shieldUntil = 0; assert.equal(E.canAttack(atk, e, T0 + H, WORLD), 'TARGET_TRAVELING'); }
  assert.throws(() => E.emigrate(e, T0 + 6 * H, WORLD, 'lx'), { code: 'EM_WAIT' });
  const back = E.emigrate(e, T0 + CFG.emigrate.everyMs, WORLD, 'lx');
  assert.equal(back.from, 'de'); assert.equal(e.stock[COCA], 100, 'de volta a casa, o stock que lá ficou volta a ser o de casa'); assert.ok(e.wh.de && Array.isArray(e.wh.de.s));
  assert.deepEqual(E.checkInvariants(e), []);
});
