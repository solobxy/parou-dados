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
      if (res.bet && res.bet > E.casinoMax(a0)) bad('casino: aposta acima do máximo');
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
    case 'gangLeave': if (dm !== 0 || dr !== 0) bad('sair da gangue'); break;
    case 'air': if (dm !== -res.paid || dr !== 0 || res.paid !== arg.amount + (arg.bribe ? Math.ceil(arg.amount * 0.2) : 0) || arg.amount > E.airCap(a0) || a0.air) bad('avião: pagamento'); break;
    case 'airCollect': { const f = a0.air, R = CFG.air.routes[f.r]; if (res.seized ? (dm !== 0 || dr !== 0) : (dm !== f.amount + Math.floor((f.amount * R.gainBp) / 10000) || dr !== R.r) || f.readyAt > t || a.air !== null) bad('avião: chegada'); break; }
    case 'deposit': if (dm !== -res.fee || res.fee < 1 || res.fee !== Math.ceil((arg * E.bankFeeBp(a)) / 10000) || dr) bad('taxa do banco'); break;
    case 'withdraw': case 'class': case 'avatar': if (dm !== 0 || dr !== 0) bad('devia ser neutro'); break;
    case 'classChange': if (dm !== -E.classChangeCost(a0) || dr !== 0 || res.cost !== E.classChangeCost(a0) || a.cls === a0.cls || (CFG.classes.find((c) => c.id === a.cls).need || 0) > a0.peakRespect || (a0.clsAt && t < a0.clsAt + CFG.classChange.coolMs)) bad('mudar de profissão'); break;
    case 'claim': if (dm !== res.cash || dr !== 0) bad('prémio'); break;
    case 'collect': { const st = E.bizStored(a0, t).reduce((x, y) => x + y.money, 0); if (dm < 0 || dm > Math.ceil(st * 1.1) || dr !== 0) bad('recolha maior do que o armazém'); break; }
    case 'collectPort': {
      const due = a0.port.filter((c) => c.readyAt <= t).reduce((x, c) => x + c.amount + Math.floor((c.amount * CFG.port.gainBp) / 10000), 0);
      if (dm < 0 || dm > due || dr !== 0) bad('porto pagou a mais'); break;
    }
    case 'attack': {
      const max = Math.floor((d0.cash * CFG.pvp.mugBp) / 10000) + E.bizStored(d0, t).reduce((x, y, i) => x + (CFG.biz[i].raid ? Math.floor((y.money * CFG.pvp.mugBp) / 10000) : 0), 0);
      if (dm < 0 || dm > max || wealth(d) > wealth(d0) || d.bank !== d0.bank) bad('assalto');
      if (d0.cash - d.cash > dm) bad('o alvo perdeu mais do que o atacante ganhou');
      if (res.win && res.mode === 'mug' && dm !== res.money) bad('saque diferente do resultado');
      if (Math.abs(dr) > MAX_PVP || Math.abs(d.respect - d0.respect) > MAX_PVP) bad('respeito da luta fora dos limites');
      if (res.win && d.respect > d0.respect) bad('o alvo ganhou respeito ao perder');
      break;
    }
    case 'buyBiz': if (dm !== -res.price || dr !== CFG.biz[arg].resp) bad('negócio'); break;
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
    players.length = 0;
    for (let i = 0; i < 60; i++) players.push(E.newPlayer('f' + i, now, world));
    rounds++;
  }
  let t = now;
  if (r.chance(50)) t = pick([world.playEnd, world.start - 1, world.playEnd + T.DAY, now - 1000]); // horas inválidas

  const p = pick(players);
  const d = pick(players);
  if (r.chance(200)) { p.cash += r.int(0, 5e6); } // dá dinheiro para chegar a tudo
  if (r.chance(400) && !p.gang) E.gangSet(p, 'g' + r.int(1, 3), r.int(1, 5), r.int(0, 5)); // o servidor pôs-te numa gangue (para os golpes e tareias em grupo terem quem os faça)
  if (r.chance(2500)) { p.energy = r.int(0, CFG.energy.max); p.energyT = Math.min(p.energyT, p.t); } // gasta stamina para chegar à discoteca, às putas e ao hospital
  const before = touched(p, t), beforeD = touched(d, t), origD = structuredClone(d), origP = structuredClone(p);
  const kind = pick(['casino', 'casino', 'table', 'heist', 'hit', 'gangCreate', 'gangDonate', 'gangLeave', 'crime', 'crimeAll', 'drug', 'refill', 'detox', 'claim', 'class', 'classChange', 'classChange', 'air', 'air', 'airCollect', 'airCollect', 'avatar', 'hooker', 'cure', 'house', 'houseUp', 'train', 'buyBiz', 'collect', 'port', 'collectPort', 'deposit', 'withdraw', 'gear', 'attack', 'bail', 'medic', 'luxury']);
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
          : g === 'slot' ? { amt: pick([10, 20, 50, 0, -1, NaN]), game: pick(['chefao', 'zeus', 'doce', 'rebucado', 'x']), buy: pick([0, 0, 0, 1, 2, 3]) } : { op: pick(['deal', 'hit', 'stand', 'double', 'x']), amt: amt() };
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
        E.hitJoin(p, d, t, world);
        if (r.chance(1500) || !E.hitCanResolve(d, t)) { E.hitRefund(p, t); res = { ok: true, refund: true }; } else res = E.hitResolve([p], d, t, game);
        break;
      }
      case 'gangCreate': res = E.gangCreate(p, t, world); E.gangSet(p, 'g' + r.int(1, 5), r.int(1, 5), r.int(0, 5)); break;   // o servidor regista a gangue e escreve o bónus
      case 'gangDonate': arg = r.chance(8000) ? r.int(100, 50000) : anyInt(); res = E.gangDonate(p, t, world, arg); break;
      case 'gangLeave': if (!p.gang) throw new E.GameError('NO_GANG'); E.gangLeave(p, t); res = { ok: true }; break;
      case 'crimeAll': arg = r.chance(9000) ? r.int(0, 9) : anyInt(); res = E.doCrimeAll(p, t, world, arg, game); break;
      case 'drug': res = E.buyDrug(p, t, world, r.chance(9000) ? r.int(0, 8) : anyInt()); break;
      case 'refill': res = E.refill(p, t, world); break;
      case 'detox': res = E.detox(p, t, world); break;
      case 'claim': res = E.claimMission(p, t, world); break;
      case 'hooker': res = E.visitHooker(p, t, world, pick([0, 1, 2, 3, 4, 5, 6]), game); break;
      case 'cure': res = E.cure(p, t, world); break;
      case 'house': res = E.buyHouse(p, t, world); break;
      case 'houseUp': res = E.buyUpgrade(p, t, world, pick([0, 1, 2, 3, 4])); break;
      case 'class': res = E.setClass(p, t, world, pick([...CFG.classes.map((c) => c.id), 'x'])); break;
      case 'classChange': res = E.changeClass(p, t, world, pick([...CFG.classes.map((c) => c.id), 'x'])); break;
      case 'air': arg = { amount: pick([50, 100, 500, 5000, E.airCap(p), E.airCap(p) + 1, p.cash]), bribe: r.chance(4000) }; res = E.airSend(p, t, world, pick([0, 1, 2, 3, 4, 5, -1]), arg.amount, arg.bribe); break;
      case 'airCollect': res = E.airCollect(p, t, world, game); break;
      case 'avatar': res = E.setAvatar(p, t, world, pick([0, 5, 31, 32, -1])); break;
      case 'train': res = E.train(p, t, world, pick(['F', 'T', 'I', 'C', 'X', ''])); break;
      case 'buyBiz': arg = r.chance(9000) ? r.int(0, 4) : anyInt(); res = E.buyBiz(p, t, world, arg); break;
      case 'collect': res = E.collectBiz(p, t, world, game); break;
      case 'port': res = E.sendPort(p, t, world, r.chance(8000) ? r.int(0, 300000) : anyInt()); break;
      case 'collectPort': res = E.collectPort(p, t, world, game); break;
      case 'deposit': arg = r.chance(8000) ? r.int(0, p.cash + 10) : anyInt(); res = E.deposit(p, t, world, arg); break;
      case 'withdraw': res = E.withdraw(p, t, world, r.chance(8000) ? r.int(0, p.bank + 10) : anyInt()); break;
      case 'gear': res = E.buyGear(p, t, world, pick(['weapon', 'armor', 'cash', 'stats', 'house']), r.chance(9000) ? r.int(-1, 6) : anyInt()); break;
      case 'attack': res = E.attack(p, d, t, world, pick(['beat', 'mug', 'x']), game); break;
      case 'bail': res = E.payBail(p, t, world); break;
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
