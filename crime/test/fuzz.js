// Teste ao calhas: milhões de ações aleatórias (válidas e inválidas) em muitos jogadores.
// Verifica: (1) só há erros de regra (GameError), nunca falhas do código;
// (2) os invariantes valem sempre; (3) uma ação recusada não muda nada.
// Uso: node test/fuzz.js [ações] [semente]

import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';

const ACTIONS = +(process.argv[2] ?? 1_000_000);
const r = seededRng(+(process.argv[3] ?? 7));
const game = seededRng(99);
const START = Date.UTC(2026, 10, 20, 21, 0);
const world = { start: START, playEnd: START + 13 * T.DAY };

const players = [];
let now = START;
for (let i = 0; i < 60; i++) players.push(E.newPlayer('f' + i, now, world));

const pick = (arr) => arr[r.int(0, arr.length - 1)];
const anyInt = () => pick([0, 1, -1, 100, 1e6, 2 ** 53, 0.5, NaN, r.int(0, 1e7)]);
const counts = {};
let market = E.newMarket();
let refused = 0, done = 0, rounds = 1;

// (4) as contas batem certo: cada ação só mexe no dinheiro e no respeito o que a regra diz, e nada cria dinheiro do nada
const wealth = (q) => q.cash + q.bank;
const MAX_LOOT_BP = 10000 + CFG.gang.lootBpPer * CFG.gang.maxLevel + CFG.mastery.bonusBp * CFG.mastery.at.length + Math.max(...CFG.classes.map((c) => c.lootBp || 0)) + Math.max(...CFG.drugs.flatMap((g) => (g.fx || []).filter((f) => f.k === 'loot').map((f) => f.bp)));
const MAX_PVP = Math.floor(((CFG.pvp.gainBase + CFG.levels.length) * 2 * (10000 + Math.max(...CFG.classes.map((c) => c.pvpBp || 0)))) / 10000);
function contas(kind, a0, a, d0, d, t, res, arg) {
  const dm = wealth(a) - wealth(a0), dr = a.respect - a0.respect;
  const bad = (m) => { console.error('CONTAS ERRADAS', kind, m, JSON.stringify(res), { dm, dr }); process.exit(1); };
  switch (kind) {
    case 'crime': {
      const c = CFG.crimes[arg];
      if (res.success) {
        if (dm !== res.money || res.money < c.min || res.money > Math.floor((c.max * MAX_LOOT_BP) / 10000) * CFG.crit.mult) bad('saque fora dos limites');
        if (dr !== c.r) bad('respeito do golpe');
      } else if (dm !== 0 || dr !== 0) bad('falhou mas mexeu');
      break;
    }
    case 'crimeAll': {
      const c = CFG.crimes[arg], maxOne = Math.floor((c.max * MAX_LOOT_BP) / 10000) * CFG.crit.mult;
      if (dm !== res.money || res.money > res.n * maxOne || (res.wins && res.money < res.wins * c.min)) bad('saque de vários golpes');
      if (dr !== res.wins * c.r || res.respect !== dr) bad('respeito de vários golpes');
      if (res.n < 1 || res.n > CFG.crimeAllMax || res.wins > res.n || res.crits > res.wins) bad('contagem');
      if (!res.levelUp && a.energy !== Math.min(CFG.energy.max, touched(a0, t).energy) - res.n * c.e) bad('stamina gasta');
      const budget = Math.min(CFG.crimeAllMax, Math.floor(Math.min(CFG.energy.max, touched(a0, t).energy) / c.e));
      if (!res.busted && res.n !== budget) bad('não fez os golpes que a stamina dava');
      if (res.busted && res.n > budget) bad('fez golpes a mais');
      if (a.c.crimes - a0.c.crimes !== res.n || a.c.wins - a0.c.wins !== res.wins) bad('contadores');
      break;
    }
    case 'casino': {
      if (dm !== res.win - res.bet || dr !== 0) bad('casino: dinheiro não bate com a aposta e o prémio');
      if (res.bet && res.bet > E.casinoMax(a0) * (res.buy ? CFG.casino.buyMaxMult : 1)) bad('casino: aposta acima do máximo');
      if (res.g === 'slot' && res.base > E.casinoMax(a0)) bad('slot: ficha acima do máximo');
      const staked = res.g === 'bj' ? (res.done ? res.hand.bet : res.bet) : res.bet;
      const maxMult = res.g === 'roulette' ? 36 : res.g === 'dice' ? 6 : res.g === 'bj' ? 3 : CFG.casino.maxWinMult;
      if (res.g === 'slot' ? res.win > res.base * CFG.casino.slots[res.game].max : res.win > staked * maxMult) bad('casino: prémio acima do possível');
      if (a.bank !== a0.bank) bad('casino mexeu no banco');
      break;
    }
    case 'table': {
      // apostar na mesa ao vivo e receber o prémio: no fim só pode faltar a aposta e sobrar o prémio
      if (dm !== res.win - res.total + res.before || dr !== 0) bad('mesa: dinheiro não bate com a aposta e o prémio');
      if (res.total > E.casinoMax(a0)) bad('mesa: aposta acima do máximo');
      if (res.win > res.total * (res.g === 'roulette' ? 36 : CFG.casino.maxWinMult)) bad('mesa: prémio acima do possível');
      if (a.bank !== a0.bank) bad('mesa mexeu no banco');
      break;
    }
    case 'heist': {
      const H = CFG.gang.heists[arg], eu = (res.parts || []).find((x) => x.id === a.id);
      if (res.refund || !res.success) { if (dm !== 0 || dr !== 0) bad('golpe em grupo falhado ou devolvido mexeu no dinheiro ou no respeito'); }
      else if (dm !== eu.money || eu.money < H.min || eu.money > Math.floor((H.max * (10000 + CFG.gang.lootBpPer * CFG.gang.maxLevel)) / 10000) || dr !== H.r) bad('golpe em grupo: saque ou respeito');
      if (res.refund && a.energy !== Math.min(CFG.energy.max, touched(a0, t).energy)) bad('golpe em grupo: a stamina não voltou');
      break;
    }
    case 'hit': {
      const eu = (res.parts || []).find((x) => x.id === a.id);
      if (dm !== 0) bad('tareia em grupo mexeu no dinheiro');
      if (res.refund) { if (dr !== 0) bad('tareia devolvida mexeu no respeito'); }
      else if (dr !== Math.max(eu.respect, -a0.respect) || (res.win ? eu.respect < 0 : eu.respect > 0)) bad('tareia em grupo: respeito');
      if (!res.refund && res.win && d.respect - d0.respect !== -Math.min(res.targetLoss, d0.respect)) bad('tareia em grupo: o alvo perdeu mais de uma vez');
      break;
    }
    case 'gangCreate': if (dm !== -CFG.gang.createCost || dr !== 0) bad('criar gangue'); break;
    case 'gangDonate': if (dm !== -arg || dr !== 0 || arg < CFG.gang.donateMin) bad('dar ao cofre'); break;
    case 'gangLeave': if (dm !== res.refund + res.stored || dr !== 0 || res.refund !== Math.floor(a0.gbz.reduce((x, y) => x + y.inv, 0) / 2) || a.gbz.some((x) => x.inv || x.stored || x.coop)) bad('sair da gangue'); break;
    case 'gangBiz': if (dm !== -arg.amount || dr !== 0 || arg.amount < CFG.gang.bizMin || a.gbz[arg.k].inv !== a0.gbz[arg.k].inv + arg.amount || a.gbz[arg.k].inv > E.gangBizCap(a, arg.k)) bad('negócio da gangue: investir'); break;
    case 'gangBizCollect': { const max = a0.gbz.reduce((x, y, k) => x + Math.floor((y.inv * CFG.gang.biz[k].rateBp * 15) / 100000) * (CFG.storageMs / T.HOUR), 0); if (dm !== res.money || dr !== 0 || res.money < 0 || res.money > max || a.gbz.some((x) => x.stored)) bad('negócio da gangue: receber'); break; }
    case 'bailFor': case 'medicFor': if (dm !== -res.cost || res.cost < 1 || dr !== 0 || d.cash + d.bank !== d0.cash + d0.bank || d.respect !== d0.respect || a0.gang !== d0.gang || !a0.gang || (kind === 'bailFor' ? d.jailUntil !== 0 || !(d0.jailUntil > t) : d.hospUntil !== 0 || !(d0.hospUntil > t))) bad('safar um membro'); break;
    case 'air': if (dm !== -res.paid || dr !== 0 || res.paid !== arg.amount + (arg.bribe ? Math.ceil(arg.amount * 0.2) : 0) || arg.amount > E.airCap(a0) || a0.air) bad('avião: pagamento'); break;
    case 'airCollect': { const f = a0.air, R = CFG.air.routes[f.r]; const full = f.amount + Math.floor((f.amount * R.gainBp) / 10000);
      if (!res.seized && res.units !== undefined && (res.units * E.wholesale(res.d) + res.rest !== full || a.stock[res.d] !== E.venueView(a0, t).stock[res.d] + res.units || CFG.drugs[res.d].id !== R.drug)) bad('avião: mercadoria');
      if (res.seized ? (dm !== 0 || dr !== 0) : (dm !== (res.units !== undefined ? res.rest : full) || dr !== R.r) || f.readyAt > t || a.air !== null) bad('avião: chegada'); break; }
    case 'deposit': if (dm !== -res.fee || res.fee < 1 || res.fee !== Math.ceil((arg * E.bankFeeBp(a)) / 10000) || dr) bad('taxa do banco'); break;
    case 'withdraw': case 'class': case 'avatar': if (dm !== 0 || dr !== 0) bad('devia ser neutro'); break;
    case 'classChange': if (dm !== -E.classChangeCost(a0) || dr !== 0 || res.cost !== E.classChangeCost(a0) || a.cls === a0.cls || (CFG.classes.find((c) => c.id === a.cls).need || 0) > a0.peakRespect || (a0.clsAt && t < a0.clsAt + CFG.classChange.coolMs)) bad('mudar de profissão'); break;
    case 'claim': if (dm !== res.cash || dr !== 0) bad('prémio'); break;
    case 'collect': { const st = E.bizStored(a0, t).reduce((x, y) => x + y.money, 0); if (dm < 0 || dm > Math.ceil(st * 1.1) || dr !== 0) bad('recolha maior do que o armazém'); break; }
    case 'collectPort': {
      const due = a0.port.filter((c) => c.readyAt <= t).reduce((x, c) => x + c.amount + Math.floor((c.amount * CFG.port.gainBp) / 10000), 0);
      if (dm < 0 || dm > due || dr !== 0) bad('porto pagou a mais'); break;
    }
    case 'hitman': {
      const H = CFG.hitman, preco = Math.max(H.priceMin, d0.respect * H.pricePerRespect);
      if (dm !== -preco || res.price !== preco || dr !== 0) bad('assassino: quem paga só perde o preço');
      if (E.sameCrew(a0, d0)) bad('assassino na própria gangue');
      if (E.level(a0) < H.minLevel || d0.respect * 10000 < a0.respect * CFG.pvp.minTargetBp || d0.shieldUntil > t || d0.hmSafe > t || d0.hospUntil > t) bad('assassino contra quem não podia');
      if (a.hmT.length > H.perDay || a.hmT.filter((x) => x > t - CFG.pvp.windowMs).length > H.perDay) bad('assassino: mais de 3 por dia');
      if (res.chanceBp !== Math.max(H.minBp, H.baseBp - (d0.guard >= 0 ? CFG.guards[d0.guard].block : 0))) bad('assassino: pontaria');
      if (res.success) {
        if (d0.respect - d.respect !== res.respLoss || res.respLoss !== Math.floor((d0.respect * H.respBp) / 10000) || d0.cash - d.cash !== res.cashLoss || res.cashLoss !== Math.floor((d0.cash * H.cashBp) / 10000) || d.bank !== d0.bank) bad('assassino: o que o alvo perdeu');
        if (!(d.hospUntil > t) || d.hospUntil > t + H.hospMs || d.hmSafe !== t + H.immuneMs) bad('assassino: hospital e proteção do alvo');
      } else if (d.respect !== d0.respect || wealth(d) !== wealth(d0) || d.hospUntil !== d0.hospUntil || d.hmSafe !== d0.hmSafe) bad('assassino falhou mas o alvo mudou');
      break;
    }
    case 'attack': {
      const vv = E.venueView(d0, Math.max(t, d0.t));
      const max = Math.floor((d0.cash * CFG.pvp.mugBp) / 10000) + E.bizStored(d0, t).reduce((x, y, i) => x + (CFG.biz[i].raid ? Math.floor((y.money * CFG.pvp.mugBp) / 10000) : 0), 0) + ['club', 'bro'].reduce((x, k) => x + (vv[k] ? Math.floor((vv[k].till * CFG.pvp.mugBp) / 10000) : 0), 0);
      if (dm < 0 || dm > max || wealth(d) > wealth(d0) || d.bank !== d0.bank) bad('assalto');
      if (d0.cash - d.cash > dm) bad('o alvo perdeu mais do que o atacante ganhou');
      if (E.sameCrew(a0, d0)) bad('atacou a própria gangue');
      if (res.win && res.mode === 'mug' && wealth(d0) - wealth(d) + ['club', 'bro'].reduce((x, k) => x + (vv[k] ? vv[k].till - d[k].till : 0), 0) + E.bizStored(d0, t).reduce((x, y, i) => x + y.money - d.biz[i].stored, 0) !== dm) bad('o que saiu do alvo não é o que entrou no atacante');
      if (res.win && res.mode === 'mug' && dm !== res.money) bad('saque diferente do resultado');
      if (Math.abs(dr) > MAX_PVP || Math.abs(d.respect - d0.respect) > MAX_PVP) bad('respeito da luta fora dos limites');
      if (res.win && d.respect > d0.respect) bad('o alvo ganhou respeito ao perder');
      break;
    }
    case 'buyBiz': if (dm !== -res.price || dr !== CFG.biz[arg].resp) bad('negócio'); break;
    case 'venueBuy': { const C = CFG.venue[arg], l0 = a0[arg] ? a0[arg].lvl : 0; if (dm !== -C.cost[l0] || dr !== C.resp[l0] || a[arg].lvl !== l0 + 1) bad('comprar casa'); break; }
    case 'venueSet': case 'broFire': case 'missionSwap': case 'bizGoods': case 'stockLimit': if (dm !== 0 || dr !== 0) bad('devia ser neutro'); break;
    case 'acct': if (dm !== -CFG.accountant.price || dr !== 0 || !a.acct) bad('contabilista'); break;
    case 'hooker': if (dm !== -res.price - (res.rob ? res.rob.loss : 0) || dr !== 0 || (res.rob && !(res.rob.loss > 0 && res.rob.loss <= 5 * res.price))) bad('visita à puta'); break;
    case 'stockBuy': { const h = E.stockView(a, market), bruto = Math.ceil((arg.n * market.prices[arg.k]) / 100);
      if (dm !== -res.paid || dr !== 0 || res.paid !== bruto + Math.ceil((bruto * CFG.stocks.feeBp) / 10000) || h[arg.k].n !== arg.h0[arg.k].n + arg.n || h[arg.k].cost !== arg.h0[arg.k].cost + res.paid) bad('bolsa: compra');
      if (h.reduce((x, y) => x + y.cost, 0) > E.stockCap(a0)) bad('bolsa: passou o teto');
      break; }
    case 'stockSell': { const h = E.stockView(a, market), bruto = Math.floor((arg.n * market.prices[arg.k]) / 100);
      if (dm !== res.got || dr !== 0 || res.got > bruto || res.got < bruto - Math.ceil((bruto * CFG.stocks.feeBp) / 10000) || h[arg.k].n !== arg.h0[arg.k].n - arg.n || arg.n > arg.h0[arg.k].n || h[arg.k].cost > arg.h0[arg.k].cost) bad('bolsa: venda');
      break; }
    case 'venueCollect': { const v = E.venueView(a0, t); const due = (v.club ? v.club.till : 0) + (v.bro ? v.bro.till : 0); if (dm !== due || res.club + res.bro !== due || dr !== 0 || (a.club && a.club.till) || (a.bro && a.bro.till)) bad('recolha das casas'); break; }
    case 'stockUse': { const v = E.venueView(a0, t); if (dm !== 0 || dr !== 0 || a.stock[arg] !== v.stock[arg] - 1) bad('tomar do armazém'); break; }
    case 'stockDump': { const v = E.venueView(a0, t); if (dm !== res.got || res.got > arg.n * E.wholesale(arg.d) || res.got !== E.dumpValue(arg.d, arg.n) || a.stock[arg.d] !== v.stock[arg.d] - arg.n || dr !== 0) bad('despachar'); break; }
    case 'broHire': { const g = CFG.hookers.list[arg]; if (dm !== -CFG.venue.bro.hire[g.tier] || dr !== 0 || a.bro.girls.length !== a0.bro.girls.length + 1 || a.bro.girls.length > CFG.venue.bro.rooms[a.bro.lvl - 1]) bad('contratar'); break; }
    case 'clubBuyAt': { const v = E.venueView(d0, Math.max(t, d0.t));
      if (dm !== -res.price || dr !== 0 || d.club.till !== v.club.till + res.price || d.stock[arg] !== v.stock[arg] - 1 || wealth(d) !== wealth(d0) || d.respect !== d0.respect) bad('compra na discoteca de outro');
      if (res.price < E.wholesale(arg) || res.price > Math.floor((CFG.drugs[arg].price * 12000) / 10000) || (!E.sameCrew(a0, d0) ? res.price !== Math.max(1, Math.floor((CFG.drugs[arg].price * CFG.venue.prices[d0.club.pi]) / 10000)) : false)) bad('preço na discoteca de outro');
      break; }
    case 'broVisitAt': { const v = E.venueView(d0, Math.max(t, d0.t));
      if (dm !== -res.price - (res.rob ? res.rob.loss : 0) || (res.rob && !(res.rob.loss > 0 && res.rob.loss <= 5 * E.hookerPrice(a0, res.i, t))) || dr !== 0 || d.bro.till !== v.bro.till + res.house || wealth(d) !== wealth(d0) || d.respect !== d0.respect) bad('visita ao bordel de outro');
      if (res.house < 0 || res.house * 3 > res.price + 3 || d0.bro.girls[arg] !== res.i) bad('parte da casa no bordel');
      break; }
    case 'luxury': if (dm !== -res.price || dr !== CFG.luxury.respect) bad('luxo'); break;
    case 'house': if (dm !== -res.price || dr !== res.respect) bad('casa'); break;
    default: if (dm > 0 || dr !== 0) bad('esta ação só devia gastar'); // discoteca, putas, hospital, treino, porto (envio), equipamento, melhorias
  }
  if (a.energy > CFG.energy.max || a.energy < 0) bad('energia');
}

function touched(p, t) {
  const c = structuredClone(p);
  try { if (t >= world.start && t < world.playEnd) E.touch(c, t); } catch { /* tempo para trás */ }
  return c;
}

for (let n = 0; n < ACTIONS; n++) {
  // o tempo avança aos saltos (às vezes grandes), e por vezes tenta-se uma hora fora da ronda
  now += pick([0, 0, 1000, 3000, 3000, 60_000, 5 * 60_000, 30 * 60_000, T.HOUR]);
  if (now >= world.playEnd) { // nova ronda com jogadores novos
    now = START;
    players.length = 0; market = E.newMarket();
    for (let i = 0; i < 60; i++) players.push(E.newPlayer('f' + i, now, world));
    rounds++;
  }
  let t = now;
  if (r.chance(50)) t = pick([world.playEnd, world.start - 1, world.playEnd + T.DAY, now - 1000]); // horas inválidas

  const p = pick(players);
  const d = pick(players);
  if (r.chance(200)) { p.cash += r.int(0, 5e6); } // dá dinheiro para chegar a tudo
  if (r.chance(1500)) { // a bolsa mexe (às vezes com falências) e, a seguir a cada passo, os limites de venda de toda a gente
    E.marketTick(market, game);
    for (const q of players) {
      const w0 = wealth(q), v0 = E.stockView(q, market), vs = E.stockAuto(q, market); let got = 0;
      for (const v of vs) { got += v.got; const h = v0[v.k];
        if (v.n !== h.n || v.got > h.value || v.got < 0 || v.profit !== v.got - h.cost || E.stockView(q, market)[v.k].n !== 0 || !(v.why === 'tp' ? h.tp && market.prices[v.k] >= h.tp : h.sl && market.prices[v.k] <= h.sl)) { console.error('CONTAS ERRADAS limite da bolsa', JSON.stringify(v), JSON.stringify(h)); process.exit(1); } }
      if (wealth(q) - w0 !== got) { console.error('CONTAS ERRADAS limite da bolsa: dinheiro', wealth(q) - w0, got); process.exit(1); }
      for (let k = 0; k < v0.length; k++) if (v0[k].n > 0 && ((v0[k].tp && market.prices[k] >= v0[k].tp) || (v0[k].sl && market.prices[k] <= v0[k].sl)) && !vs.some((v) => v.k === k)) { console.error('FALHA limite da bolsa não vendeu', k); process.exit(1); }
      const bad2 = E.checkInvariants(q); if (bad2.length) { console.error('INVARIANTE limite da bolsa', bad2); process.exit(1); }
    }
  }
  if (r.chance(300)) p.shieldUntil = now + pick([T.HOUR, 20 * T.HOUR]); // jogador que entrou tarde: escudo
  if (r.chance(300)) { p.stock[r.int(0, CFG.drugs.length - 1)] += r.int(1, 60); } // mercadoria no armazém, como a que vem do porto
  // casas já montadas (para as compras entre jogadores, os preços e os despedimentos terem onde acontecer)
  for (const q of [p, d]) {
    if (r.chance(700) && !q.club) { q.club = { lvl: r.int(1, 8), till: 0, t: q.t, rem: 0, pi: r.int(0, 4), gd: r.int(0, 3) }; q.stock[r.int(0, CFG.drugs.length - 1)] += r.int(1, 40); q.stock[r.int(0, CFG.drugs.length - 1)] += r.int(1, 40); }
    if (r.chance(700) && !q.bro) { const lvl = r.int(1, 5); q.bro = { lvl, till: 0, t: q.t, rem: 0, pi: r.int(0, 4), gd: r.int(0, 3), girls: Array.from({ length: r.int(1, CFG.venue.bro.rooms[lvl - 1]) }, () => r.int(0, CFG.hookers.list.length - 1)) }; }
  }
  if (r.chance(400) && !p.gang) { if (r.chance(3000)) E.gangSet(p, CFG.gang.bot.id, 1, 0); else E.gangSet(p, 'g' + r.int(1, 3), r.int(1, 5), r.int(0, 5)); } // o servidor pôs-te numa gangue (para os golpes e tareias em grupo terem quem os faça)
  if (r.chance(2500)) { p.energy = r.int(0, CFG.energy.max); p.energyT = Math.min(p.energyT, p.t); } // gasta stamina para chegar à discoteca, às putas e ao hospital
  const before = touched(p, t), beforeD = touched(d, t), origD = structuredClone(d), origP = structuredClone(p);
  const kind = pick(['stockBuy', 'stockBuy', 'stockBuy', 'stockSell', 'stockSell', 'missionSwap', 'venueBuy', 'venueBuy', 'venueSet', 'venueCollect', 'stockUse', 'stockUse', 'stockDump', 'broHire', 'broHire', 'broFire', 'clubBuyAt', 'clubBuyAt', 'clubBuyAt', 'broVisitAt', 'broVisitAt', 'broVisitAt', 'casino', 'casino', 'table', 'heist', 'hit', 'gangCreate', 'gangDonate', 'gangLeave', 'gangBiz', 'gangBiz', 'gangBiz', 'gangBizCollect', 'hitman', 'hitman', 'hitman', 'crime', 'crimeAll', 'drug', 'refill', 'detox', 'claim', 'class', 'classChange', 'classChange', 'air', 'air', 'airCollect', 'airCollect', 'bailFor', 'bailFor', 'medicFor', 'medicFor', 'avatar', 'hooker', 'cure', 'house', 'houseUp', 'train', 'buyBiz', 'buyBiz', 'collect', 'bizGoods', 'bizGoods', 'acct', 'stockLimit', 'stockLimit', 'stockLimit', 'port', 'collectPort', 'deposit', 'withdraw', 'gear', 'attack', 'bail', 'medic', 'luxury']);
  let res, arg;
  try {
    switch (kind) {
      case 'crime': arg = r.chance(9000) ? r.int(0, 9) : anyInt(); res = E.doCrime(p, t, world, arg, game); break;
      case 'casino': {
        const amt = () => pick([10, 50, 100, 999, 5000, 1e6, 0, -5, 9, 0.5, NaN]);
        const g = pick(['roulette', 'dice', 'bj', 'bj', 'wheel', 'slot', 'x']);
        arg = g === 'roulette' ? { bets: Array.from({ length: r.int(0, 13) }, () => ({ t: pick(['red', 'black', 'even', 'odd', 'low', 'high', 'dozen', 'num', 'x']), n: pick([0, 1, 2, 3, 17, 36, 37, -1]), amt: amt() })) }
          : g === 'dice' ? { pick: pick(['low', 'seven', 'high', '__proto__']), amt: amt() }
          : g === 'wheel' ? { bets: Array.from({ length: r.int(0, 13) }, () => ({ s: pick(['1', '2', '5', '10', 'moeda', 'caixas', 'bola', 'louca', 'x']), amt: amt() })) }
          : g === 'slot' ? { amt: pick([10, 20, 50, 0, -1, NaN]), game: pick(['chefao', 'zeus', 'doce', 'rebucado', 'x']), buy: pick([0, 0, 0, 1, 2, 3]) } : { op: pick(['deal', 'hit', 'hit', 'stand', 'double', 'split', 'split', 'x']), amt: amt() };
        res = E.casinoPlay(p, t, world, g, arg, game); break;
      }
      case 'table': {
        // uma ronda inteira: aposta duas vezes (a segunda junta-se à primeira), às vezes tira tudo, e depois sai o resultado
        const amt = () => pick([10, 50, 100, 999, 5000, 1e6, 0, -5, 9, 0.5, NaN]);
        const g = pick(['roulette', 'wheel', 'wheel', 'x']);
        const bom = r.chance(8000), va = () => (bom ? pick([10, 50, 100, 999, 5000]) : amt());
        const mk = () => Array.from({ length: bom ? r.int(1, 5) : r.int(0, 13) }, () => (g === 'wheel' ? { s: pick(['1', '2', '5', '10', 'moeda', 'caixas', 'bola', 'louca'].concat(bom ? [] : ['x'])), amt: va() }
          : { t: pick(['red', 'black', 'even', 'odd', 'low', 'high', 'dozen', 'num'].concat(bom ? [] : ['x'])), n: bom ? r.int(0, 2) : pick([0, 1, 2, 3, 17, 36, 37, -1, undefined]), amt: va() }));
        let mine = E.tableBet(p, t, world, g, mk()).bets, before = 0;
        try { mine = E.tableBet(p, t, world, g, mk(), mine).bets; } catch (e) { if (!(e instanceof E.GameError)) throw e; }
        if (r.chance(1500)) { const back = E.tableClear(p, mine); if (back.back !== E.tableTotal(mine)) throw new Error('devolução errada'); before = back.back; }
        const out = E.tableDraw(g, game), win = E.tablePay(g, mine, out);
        if (!before) E.tableCredit(p, win);
        res = { ok: true, g, total: E.tableTotal(mine), win: before ? 0 : win, before };
        break;
      }
      case 'heist': {
        arg = r.chance(9000) ? r.int(0, 2) : anyInt();
        E.heistJoin(p, t, world, arg);
        const ps = [p];
        if (d !== p && r.chance(6000)) { try { E.heistJoin(d, t, world, arg); ps.push(d); } catch (e) { if (!(e instanceof E.GameError)) throw e; } }
        if (r.chance(1500)) { for (const x of ps) E.heistRefund(x, t, arg); res = { ok: true, refund: true }; } else res = E.heistResolve(ps, t, arg, game);
        break;
      }
      case 'hit': {
        E.hitJoin(p, d, t, world, r.chance(5000));
        if (r.chance(1500) || !E.hitCanResolve(d, t)) { E.hitRefund(p, t); res = { ok: true, refund: true }; } else res = E.hitResolve([p], d, t, game);
        break;
      }
      case 'gangCreate': res = E.gangCreate(p, t, world); E.gangSet(p, 'g' + r.int(1, 5), r.int(1, 5), r.int(0, 5)); break;   // o servidor regista a gangue e escreve o bónus
      case 'gangDonate': arg = r.chance(8000) ? r.int(100, 50000) : anyInt(); res = E.gangDonate(p, t, world, arg); break;
      case 'gangLeave': { if (!p.gang) throw new E.GameError('NO_GANG'); const g0 = p.gang; res = { ok: true, ...E.gangLeave(p, t) }; if (t === now) E.gangBizSync(players.filter((x) => x.gang === g0), t); break; }
      case 'gangBiz': {
        arg = { k: r.chance(9000) ? r.int(0, CFG.gang.biz.length - 1) : anyInt(), amount: r.chance(8500) ? r.int(100, 30000) : anyInt() };
        res = E.gangBizInvest(p, t, world, arg.k, arg.amount, p.gb ? p.gb.loot / CFG.gang.lootBpPer : 0);
        const ms = players.filter((x) => x.gang === p.gang); E.gangBizSync(ms, t);   // o servidor acerta o bónus de grupo de todos os membros
        for (const m of ms) { const bad2 = E.checkInvariants(m); if (bad2.length) { console.error('INVARIANTE', kind, bad2); process.exit(1); } }
        break;
      }
      case 'gangBizCollect': res = E.gangBizCollect(p, t, world); break;
      case 'crimeAll': arg = r.chance(9000) ? r.int(0, 9) : anyInt(); res = E.doCrimeAll(p, t, world, arg, game); break;
      case 'drug': res = E.buyDrug(p, t, world, r.chance(9000) ? r.int(0, CFG.drugs.length - 1) : anyInt()); break;
      case 'refill': res = E.refill(p, t, world); break;
      case 'detox': res = E.detox(p, t, world); break;
      case 'claim': res = E.claimMission(p, t, world); break;
      case 'stockBuy': arg = { k: r.chance(9000) ? r.int(0, 5) : anyInt(), n: pick([1, 5, 50, 1000, 0, -1, 0.5, 2e9]), h0: null }; arg.h0 = E.stockView(p, market); res = E.stockBuy(p, t, world, r.chance(9700) ? market : null, arg.k, arg.n, r.chance(1000) ? 1 : undefined); break;
      case 'stockSell': arg = { k: r.chance(9000) ? r.int(0, 5) : anyInt(), n: 0, h0: E.stockView(p, market) }; arg.n = r.chance(7000) && arg.h0[arg.k] ? pick([arg.h0[arg.k].n, Math.ceil(arg.h0[arg.k].n / 2), 1]) : pick([1, 0, -1, 1e9]); res = E.stockSell(p, t, world, market, arg.k, arg.n, r.chance(1000) ? 1 : undefined); break;
      case 'missionSwap': res = E.swapMission(p, t, world); break;
      case 'hooker': res = E.visitHooker(p, t, world, pick([0, 1, 2, 3, 4, 5, 6, 12, 15, 17, 18]), game); break;
      case 'cure': res = E.cure(p, t, world); break;
      case 'house': res = E.buyHouse(p, t, world); break;
      case 'houseUp': res = E.buyUpgrade(p, t, world, pick([0, 1, 2, 3, 4])); break;
      case 'class': res = E.setClass(p, t, world, pick([...CFG.classes.map((c) => c.id), 'x'])); break;
      case 'classChange': res = E.changeClass(p, t, world, pick([...CFG.classes.map((c) => c.id), 'x'])); break;
      case 'air': arg = { amount: pick([50, 100, 500, 5000, E.airCap(p), E.airCap(p) + 1, p.cash]), bribe: r.chance(4000) }; res = E.airSend(p, t, world, pick([0, 1, 2, 3, 4, 5, -1]), arg.amount, arg.bribe); break;
      case 'airCollect': res = E.airCollect(p, t, world, game, r.chance(5000)); break;
      case 'avatar': res = E.setAvatar(p, t, world, pick([0, 5, 31, CFG.avatars - 1, CFG.avatars, -1])); break;
      case 'train': res = E.train(p, t, world, pick(['F', 'T', 'I', 'C', 'X', ''])); break;
      case 'buyBiz': arg = r.chance(9000) ? r.int(0, 4) : anyInt(); res = E.buyBiz(p, t, world, arg); break;
      case 'collect': res = E.collectBiz(p, t, world, game); break;
      case 'bizGoods': arg = r.chance(9000) ? r.int(0, 4) : anyInt(); res = E.bizGoods(p, t, world, arg, r.chance(6000)); break;
      case 'acct': res = E.hireAccountant(p, t, world); break;
      case 'stockLimit': { const k = r.chance(9000) ? r.int(0, 5) : anyInt(), pr = market.prices[k] || 0;
        arg = { k, tp: pick([0, pr + r.int(1, 400), pr + r.int(1, 400), pr * 2, pr, -1, 0.5, anyInt()]), sl: pick([0, Math.max(1, pr - r.int(1, 400)), Math.max(1, pr - r.int(1, 400)), Math.floor(pr / 2), pr, anyInt()]) };
        res = E.stockLimit(p, t, world, r.chance(9700) ? market : null, arg.k, arg.tp, arg.sl); break; }
      case 'port': res = E.sendPort(p, t, world, r.chance(8000) ? r.int(0, 300000) : anyInt(), r.chance(5000)); break;
      case 'venueBuy': arg = pick(['club', 'bro', 'bro', 'club', 'x']); res = E.venueBuy(p, t, world, arg); break;
      case 'venueSet': res = E.venueSet(p, t, world, pick(['club', 'bro', 'x']), pick([0, 1, 2, 3, 4, 5, -1, 0.5]), pick([0, 1, 2, 3, 4, NaN])); break;
      case 'venueCollect': res = E.venueCollect(p, t, world); break;
      case 'stockUse': arg = r.chance(9000) ? r.int(0, CFG.drugs.length - 1) : anyInt(); res = E.stockUse(p, t, world, arg); break;
      case 'stockDump': arg = { d: r.chance(9000) ? r.int(0, CFG.drugs.length - 1) : anyInt(), n: pick([1, 2, 10, 0, -1, 0.5, 1e9]) }; res = E.stockDump(p, t, world, arg.d, arg.n); break;
      case 'broHire': arg = r.chance(9000) ? r.int(0, CFG.hookers.list.length - 1) : anyInt(); res = E.broHire(p, t, world, arg); break;
      case 'broFire': res = E.broFire(p, t, world, pick([0, 1, 2, 5, -1])); break;
      case 'clubBuyAt': arg = r.chance(9000) ? r.int(0, CFG.drugs.length - 1) : anyInt(); res = E.clubBuyAt(p, d, t, world, arg, r.chance(1000) ? 1 : undefined); break;
      case 'broVisitAt': arg = pick([0, 1, 2, 3, 20, -1]); res = E.broVisitAt(p, d, t, world, arg, game, r.chance(1000) ? 1 : undefined); break;
      case 'collectPort': res = E.collectPort(p, t, world, game); break;
      case 'deposit': arg = r.chance(8000) ? r.int(0, p.cash + 10) : anyInt(); res = E.deposit(p, t, world, arg); break;
      case 'withdraw': res = E.withdraw(p, t, world, r.chance(8000) ? r.int(0, p.bank + 10) : anyInt()); break;
      case 'gear': res = E.buyGear(p, t, world, pick(['weapon', 'armor', 'guard', 'guard', 'cash', 'stats', 'house']), r.chance(9000) ? r.int(-1, 6) : anyInt()); break;
      case 'attack': res = E.attack(p, d, t, world, pick(['beat', 'mug', 'x']), game, r.chance(5000)); if (p.shieldUntil > t) { console.error('CONTAS ERRADAS', 'atacou e ficou com o escudo'); process.exit(1); } break;
      case 'hitman': res = E.hitman(p, d, t, world, game, r.chance(5000)); if (p.shieldUntil > t) { console.error('CONTAS ERRADAS', 'encomendou e ficou com o escudo'); process.exit(1); } break;
      case 'bail': res = E.payBail(p, t, world); break;
      case 'bailFor': res = E.bailFor(p, d, t, world); break;
      case 'medicFor': res = E.medicFor(p, d, t, world); break;
      case 'medic': res = E.payMedic(p, t, world); break;
      case 'luxury': res = E.buyLuxury(p, t, world); break;
    }
    contas(kind, origP, p, origD, d, t, res, arg);
    done++;
    counts[kind] = (counts[kind] || 0) + 1;
  } catch (e) {
    if (!(e instanceof E.GameError)) { console.error('FALHA DO CÓDIGO', kind, e); process.exit(1); }
    refused++;
    counts['x_' + e.code] = (counts['x_' + e.code] || 0) + 1;
    // ação recusada: o estado só pode ter mudado pela atualização normal do tempo
    // (ou nem isso, quando o pedido é recusado logo à entrada por argumentos inválidos)
    if (!isDeepStrictEqual(p, before) && !isDeepStrictEqual(p, origP)) { console.error('RECUSADA MAS MUDOU', kind, e.code); process.exit(1); }
    if (d !== p && !isDeepStrictEqual(d, beforeD) && !isDeepStrictEqual(d, origD)) { console.error('ALVO MUDOU', kind, e.code); process.exit(1); }
  }
  for (const q of [p, d]) {
    const bad = E.checkInvariants(q);
    if (bad.length) { console.error('INVARIANTE', kind, bad); process.exit(1); }
  }
}
console.log(JSON.stringify({ actions: ACTIONS, rounds, done, refused, counts }, null, 0));
